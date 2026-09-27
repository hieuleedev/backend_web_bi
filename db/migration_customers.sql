-- ==============================================================================
-- BẢN MIGRATION SỬA LỖI & CẬP NHẬT BẢNG CUSTOMERS VÀ RENTAL_BOOKINGS
-- Chạy đoạn mã này trong Supabase Dashboard -> SQL Editor
-- ==============================================================================

-- 1. Tạo bảng khách hàng (customers) nếu chưa có
CREATE TABLE IF NOT EXISTS public.customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL
);

-- 2. Đảm bảo tất cả các cột của bảng customers đều được thêm đầy đủ (kể cả khi bảng đã tạo từ trước)
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS total_rent_count INTEGER DEFAULT 0;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS total_spent NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS debt NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS rating NUMERIC(3, 2) DEFAULT 5.0;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS is_vip BOOLEAN DEFAULT FALSE;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Tạo chỉ mục tìm kiếm nhanh cho phone và name
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_name ON public.customers(name);

-- 3. Thêm cột customer_id và deposit_amount vào bảng rental_bookings nếu chưa có
ALTER TABLE public.rental_bookings ADD COLUMN IF NOT EXISTS customer_id TEXT;
ALTER TABLE public.rental_bookings ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC(12, 2) DEFAULT 0;

-- Tạo index cho customer_id trong rental_bookings
CREATE INDEX IF NOT EXISTS idx_rental_customer ON public.rental_bookings(customer_id);

-- 4. Bật RLS và cấp quyền truy cập công khai cho bảng customers
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customers' AND policyname = 'Public read customers') THEN
    CREATE POLICY "Public read customers" ON public.customers FOR SELECT USING (true);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customers' AND policyname = 'Public insert customers') THEN
    CREATE POLICY "Public insert customers" ON public.customers FOR INSERT WITH CHECK (true);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customers' AND policyname = 'Public update customers') THEN
    CREATE POLICY "Public update customers" ON public.customers FOR UPDATE USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customers' AND policyname = 'Public delete customers') THEN
    CREATE POLICY "Public delete customers" ON public.customers FOR DELETE USING (true);
  END IF;
END
$$;

-- 5. Đồng bộ dữ liệu khách hàng cũ từ các đơn hàng hiện có vào bảng customers
INSERT INTO public.customers (id, name, phone, address, total_rent_count, total_spent, created_at, updated_at)
SELECT 
  'cust-' || TRIM(customer_phone) AS id,
  MAX(customer_name) AS name,
  TRIM(customer_phone) AS phone,
  MAX(shipping_address) AS address,
  COUNT(id) AS total_rent_count,
  SUM(COALESCE(total_rent_fee, 0) + COALESCE(total_buy_price, 0)) AS total_spent,
  MIN(created_at) AS created_at,
  MAX(created_at) AS updated_at
FROM public.orders
WHERE customer_phone IS NOT NULL AND TRIM(customer_phone) != ''
GROUP BY TRIM(customer_phone)
ON CONFLICT (phone) DO UPDATE 
SET 
  total_rent_count = EXCLUDED.total_rent_count,
  total_spent = EXCLUDED.total_spent;

-- 6. Cập nhật customer_id vào rental_bookings từ renter_phone cho các lịch thuê đã có
UPDATE public.rental_bookings rb
SET customer_id = c.id
FROM public.customers c
WHERE TRIM(rb.renter_phone) = c.phone
  AND (rb.customer_id IS NULL OR rb.customer_id = '');

-- 7. Làm mới bộ nhớ đệm Supabase PostgREST (để API nhận diện ngay lập tức)
NOTIFY pgrst, 'reload schema';
