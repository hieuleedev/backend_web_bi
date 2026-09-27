-- ==============================================================================
-- BẢN MIGRATION THÊM BẢNG CUSTOMERS VÀ CẬP NHẬT RENTAL_BOOKINGS
-- Chạy đoạn mã này trong Supabase Dashboard -> SQL Editor
-- ==============================================================================

-- 1. Tạo bảng khách hàng (customers) nếu chưa có
CREATE TABLE IF NOT EXISTS public.customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  email TEXT,
  address TEXT,
  total_rent_count INTEGER DEFAULT 0,
  total_spent NUMERIC(12, 2) DEFAULT 0,
  debt NUMERIC(12, 2) DEFAULT 0,
  notes TEXT,
  rating NUMERIC(3, 2) DEFAULT 5.0,
  is_vip BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tạo chỉ mục tìm kiếm nhanh cho phone và name
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_name ON public.customers(name);

-- 2. Thêm cột customer_id và deposit_amount vào bảng rental_bookings nếu chưa có
ALTER TABLE public.rental_bookings ADD COLUMN IF NOT EXISTS customer_id TEXT;
ALTER TABLE public.rental_bookings ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC(12, 2) DEFAULT 0;

-- Tạo index cho customer_id trong rental_bookings
CREATE INDEX IF NOT EXISTS idx_rental_customer ON public.rental_bookings(customer_id);

-- 3. Bật RLS và cấp quyền truy cập công khai cho bảng customers
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

-- 4. Đồng bộ dữ liệu khách hàng cũ từ các đơn hàng hiện có vào bảng customers (nếu có đơn)
INSERT INTO public.customers (id, name, phone, email, address, total_rent_count, total_spent, created_at, updated_at)
SELECT 
  'cust-' || TRIM(customer_phone) AS id,
  MAX(customer_name) AS name,
  TRIM(customer_phone) AS phone,
  MAX(customer_email) AS email,
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

-- 5. Cập nhật customer_id vào rental_bookings từ renter_phone nếu đã có khách
UPDATE public.rental_bookings rb
SET customer_id = c.id
FROM public.customers c
WHERE TRIM(rb.renter_phone) = c.phone
  AND (rb.customer_id IS NULL OR rb.customer_id = '');
