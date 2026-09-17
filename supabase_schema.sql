-- =========================================================
-- BI BI FASHION MARKETPLACE - SUPABASE DATABASE SCHEMA
-- Bán & Cho Thuê Quần Áo (Hỗ trợ quản lý lịch thuê và đặt cọc)
-- =========================================================

-- 1. Bảng sản phẩm (Products)
CREATE TABLE IF NOT EXISTS public.products (
  id TEXT PRIMARY KEY,
  seller_id TEXT,
  seller_name TEXT,
  seller_avatar TEXT,
  seller_rating NUMERIC(3, 2) DEFAULT 5.0,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  brand TEXT DEFAULT 'Thiết Kế Cao Cấp',
  type TEXT NOT NULL CHECK (type IN ('buy', 'rent', 'both')),
  condition TEXT DEFAULT 'Mới 99%',
  material TEXT,
  sizes TEXT[] DEFAULT '{"S", "M", "L"}',
  colors TEXT[] DEFAULT '{"Mặc định"}',
  buy_price NUMERIC(12, 2) DEFAULT 0,
  rent_price_1day NUMERIC(12, 2) DEFAULT 0,
  rent_price_3days NUMERIC(12, 2) DEFAULT 0,
  rent_price_7days NUMERIC(12, 2) DEFAULT 0,
  deposit NUMERIC(12, 2) DEFAULT 0,
  featured_image TEXT NOT NULL,
  images TEXT[] NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'pending', 'hidden')),
  views INTEGER DEFAULT 0,
  rating NUMERIC(3, 2) DEFAULT 5.0,
  reviews_count INTEGER DEFAULT 0,
  location TEXT DEFAULT 'Đà Nẵng',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Bảng lịch thuê sản phẩm (Rental Bookings)
CREATE TABLE IF NOT EXISTS public.rental_bookings (
  id TEXT PRIMARY KEY,
  product_id TEXT REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  order_id TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  renter_name TEXT,
  renter_phone TEXT,
  status TEXT DEFAULT 'confirmed' CHECK (status IN ('pending', 'confirmed', 'completed', 'blocked', 'cancelled')),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_rental_range CHECK (end_date >= start_date)
);

-- 3. Bảng đơn hàng (Orders)
CREATE TABLE IF NOT EXISTS public.orders (
  id TEXT PRIMARY KEY,
  order_code TEXT UNIQUE NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  shipping_address TEXT NOT NULL,
  delivery_method TEXT DEFAULT 'standard',
  payment_method TEXT DEFAULT 'vietqr',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'shipping', 'renting', 'returned', 'completed', 'cancelled')),
  total_rent_fee NUMERIC(12, 2) DEFAULT 0,
  total_buy_price NUMERIC(12, 2) DEFAULT 0,
  total_deposit NUMERIC(12, 2) DEFAULT 0,
  shipping_fee NUMERIC(12, 2) DEFAULT 30000,
  deposit_status TEXT DEFAULT 'held' CHECK (deposit_status IN ('none', 'held', 'refunded', 'deducted')),
  items JSONB NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bật Row Level Security (RLS) và cho phép Public thao tác
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DO $\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read products') THEN
    CREATE POLICY "Public read products" ON public.products FOR SELECT USING (true);
    CREATE POLICY "Public insert products" ON public.products FOR INSERT WITH CHECK (true);
    CREATE POLICY "Public update products" ON public.products FOR UPDATE USING (true);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read rental_bookings') THEN
    CREATE POLICY "Public read rental_bookings" ON public.rental_bookings FOR SELECT USING (true);
    CREATE POLICY "Public insert rental_bookings" ON public.rental_bookings FOR INSERT WITH CHECK (true);
    CREATE POLICY "Public delete rental_bookings" ON public.rental_bookings FOR DELETE USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read orders') THEN
    CREATE POLICY "Public read orders" ON public.orders FOR SELECT USING (true);
    CREATE POLICY "Public insert orders" ON public.orders FOR INSERT WITH CHECK (true);
    CREATE POLICY "Public update orders" ON public.orders FOR UPDATE USING (true);
  END IF;
END
$$;

-- =========================================================
-- 4. BẢNG TÀI KHOẢN NGƯỜI DÙNG & KHÁCH HÀNG (Users)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  avatar TEXT,
  role TEXT DEFAULT 'buyer' CHECK (role IN ('buyer', 'seller', 'admin')),
  rating NUMERIC(3, 2) DEFAULT 5.0,
  rating_count INTEGER DEFAULT 0,
  location TEXT DEFAULT 'Việt Nam',
  bio TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================
-- 5. BẢNG ĐÁNH GIÁ & NHẬN XÉT (Reviews / Comments)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.reviews (
  id TEXT PRIMARY KEY,
  product_id TEXT REFERENCES public.products(id) ON DELETE CASCADE,
  user_id TEXT,
  user_name TEXT NOT NULL,
  user_avatar TEXT,
  rating INTEGER DEFAULT 5 CHECK (rating >= 1 AND rating <= 5),
  comment TEXT NOT NULL,
  type TEXT DEFAULT 'rent' CHECK (type IN ('buy', 'rent')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================
-- 6. BẢNG TIN NHẮN TRÒ CHUYỆN (Messages)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  sender_avatar TEXT,
  content TEXT NOT NULL,
  image_url TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bật RLS và cấp quyền Public cho 3 bảng mới
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public all users') THEN
    CREATE POLICY "Public all users" ON public.users FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public all reviews') THEN
    CREATE POLICY "Public all reviews" ON public.reviews FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public all messages') THEN
    CREATE POLICY "Public all messages" ON public.messages FOR ALL USING (true) WITH CHECK (true);
  END IF;
END
$$;

-- Seed tài khoản mẫu vào bảng users
INSERT INTO public.users (id, name, email, phone, avatar, role, rating, location, bio)
VALUES
  ('user-seller-1', 'Bi Bi Boutique (Linh Bi)', 'bibi.fashion@gmail.com', '0795623097', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80', 'seller', 4.9, 'Khối 1 - Xã Núi Thành - Thành Phố Đà Nẵng', 'Chuyên cung cấp và cho thuê đầm dạ hội, áo dài cưới thiết kế thủ công tinh xảo.'),
  ('user-admin', 'Quản Trị Viên Bi Bi', 'admin@bibifashion.vn', '0901234567', 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=400&q=80', 'admin', 5.0, 'Khối 1 - Xã Núi Thành - Thành Phố Đà Nẵng', 'Ban Quản Trị Hệ Thống Sàn Thương Mại Điện Tử Thời Trang Bi Bi.'),
  ('user-buyer-1', 'Hoàng Mai Yến', 'maiyen.hoang@gmail.com', '0912349876', 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=400&q=80', 'buyer', 5.0, 'Cầu Giấy, Hà Nội', 'Đam mê thời trang tiệc và chụp ảnh ngoại cảnh.')
ON CONFLICT (id) DO NOTHING;
