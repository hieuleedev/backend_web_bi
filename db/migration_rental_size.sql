-- ==============================================================================
-- MIGRATION: BỔ SUNG QUẢN LÝ LỊCH THUÊ THEO TỪNG SIZE (RENTAL BOOKINGS SIZE)
-- Cho phép 1 mẫu váy có nhiều size (S, M, L) được cho thuê độc lập trong cùng 1 ngày
-- ==============================================================================

-- 1. Thêm cột size vào bảng rental_bookings (nếu chưa có)
ALTER TABLE public.rental_bookings ADD COLUMN IF NOT EXISTS size TEXT;

-- 2. Tạo chỉ mục tìm kiếm nhanh theo product_id và size
CREATE INDEX IF NOT EXISTS idx_rental_product_size ON public.rental_bookings(product_id, size);

-- 3. Tự động đồng bộ size từ các đơn hàng cũ sang bảng rental_bookings
UPDATE public.rental_bookings rb
SET size = sub.size
FROM (
  SELECT 
    o.id AS order_id, 
    item->>'productId' AS product_id, 
    COALESCE(NULLIF(TRIM(item->>'size'), ''), 'M') AS size
  FROM public.orders o, 
       jsonb_array_elements(
         CASE 
           WHEN jsonb_typeof(o.items::jsonb) = 'array' THEN o.items::jsonb 
           ELSE '[]'::jsonb 
         END
       ) item
  WHERE item->>'mode' = 'rent'
) sub
WHERE rb.order_id = sub.order_id 
  AND rb.product_id = sub.product_id
  AND (rb.size IS NULL OR rb.size = '');
