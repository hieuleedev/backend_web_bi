-- ==============================================================================
-- BẢN MIGRATION SẠCH & TINH GỌN (ĐÃ BỎ ĐỊA CHỈ & EMAIL)
-- Copy toàn bộ đoạn này dán vào Supabase Dashboard -> SQL Editor -> Bấm Run
-- ==============================================================================

-- 1. Tạo bảng khách hàng (customers) nếu chưa có
CREATE TABLE IF NOT EXISTS public.customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  total_rent_count INTEGER DEFAULT 0,
  total_spent NUMERIC(12, 2) DEFAULT 0,
  debt NUMERIC(12, 2) DEFAULT 0,
  notes TEXT,
  rating NUMERIC(3, 2) DEFAULT 5.0,
  is_vip BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Thêm các cột phụ trợ nếu bảng customers đã tồn tại từ trước
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS total_rent_count INTEGER DEFAULT 0;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS total_spent NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS debt NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS rating NUMERIC(3, 2) DEFAULT 5.0;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS is_vip BOOLEAN DEFAULT FALSE;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Tạo index tìm kiếm theo SĐT và tên
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_name ON public.customers(name);

-- 3. Thêm cột customer_id và deposit_amount vào bảng rental_bookings
ALTER TABLE public.rental_bookings ADD COLUMN IF NOT EXISTS customer_id TEXT;
ALTER TABLE public.rental_bookings ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC(12, 2) DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_rental_customer ON public.rental_bookings(customer_id);

-- 4. Cấp quyền truy cập công khai (RLS)
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

-- 5. Đồng bộ khách hàng cũ từ đơn hàng (Chỉ lưu Tên, SĐT, Số lần thuê, Tổng tiền chi tiêu)
INSERT INTO public.customers (id, name, phone, total_rent_count, total_spent, created_at, updated_at)
SELECT 
  'cust-' || TRIM(customer_phone) AS id,
  MAX(customer_name) AS name,
  TRIM(customer_phone) AS phone,
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

-- 6. Gán customer_id vào rental_bookings
UPDATE public.rental_bookings rb
SET customer_id = c.id
FROM public.customers c
WHERE TRIM(rb.renter_phone) = c.phone
  AND (rb.customer_id IS NULL OR rb.customer_id = '');

-- 7. Làm mới bộ nhớ đệm Supabase API
NOTIFY pgrst, 'reload schema';
