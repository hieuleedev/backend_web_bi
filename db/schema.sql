-- =========================================================
-- BI BI FASHION MARKETPLACE - POSTGRESQL & SUPABASE IDENTICAL SCHEMA
-- Bán & Cho Thuê Quần Áo (Hỗ trợ quản lý lịch thuê và đặt cọc)
-- Cấu trúc đồng bộ 100% giữa Supabase và PostgreSQL truyền thống
-- =========================================================

-- 1. BẢNG NGƯỜI DÙNG & TÀI KHOẢN (Users)
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. BẢNG DANH MỤC SẢN PHẨM (Categories)
CREATE TABLE IF NOT EXISTS public.categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  icon TEXT,
  image_url TEXT,
  description TEXT,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. BẢNG SẢN PHẨM (Products)
CREATE TABLE IF NOT EXISTS public.products (
  id TEXT PRIMARY KEY,
  seller_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  seller_name TEXT,
  seller_avatar TEXT,
  seller_rating NUMERIC(3, 2) DEFAULT 5.0,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  brand TEXT DEFAULT 'Bi Bi Collection',
  type TEXT NOT NULL CHECK (type IN ('buy', 'rent', 'both')),
  condition TEXT DEFAULT 'Mới 100%',
  material TEXT,
  sizes TEXT[] DEFAULT '{"S", "M", "L"}',
  colors TEXT[] DEFAULT '{"Trắng"}',
  buy_price NUMERIC(12, 2) DEFAULT 0,
  original_price NUMERIC(12, 2) DEFAULT 0,
  rent_price_1day NUMERIC(12, 2) DEFAULT 0,
  rent_price_3days NUMERIC(12, 2) DEFAULT 0,
  rent_price_7days NUMERIC(12, 2) DEFAULT 0,
  deposit NUMERIC(12, 2) DEFAULT 0,
  featured_image TEXT NOT NULL,
  images TEXT[] NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'pending', 'hidden')),
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  rating NUMERIC(3, 2) DEFAULT 5.0,
  reviews_count INTEGER DEFAULT 0,
  location TEXT DEFAULT 'Khối 1 - Xã Núi Thành - Thành Phố Đà Nẵng',
  care_instructions TEXT,
  size_guide TEXT,
  has_shipping BOOLEAN DEFAULT TRUE,
  shipping_fee NUMERIC(12, 2) DEFAULT 30000,
  shipping_area TEXT DEFAULT 'Toàn quốc',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. BẢNG LỊCH THUÊ SẢN PHẨM (Rental Bookings)
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

-- 5. BẢNG ĐƠN HÀNG (Orders)
CREATE TABLE IF NOT EXISTS public.orders (
  id TEXT PRIMARY KEY,
  order_code TEXT UNIQUE NOT NULL,
  user_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT,
  shipping_address TEXT NOT NULL,
  delivery_method TEXT DEFAULT 'shipping',
  payment_method TEXT DEFAULT 'bank_transfer',
  payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'refunded')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'shipping', 'renting', 'rented', 'returned', 'completed', 'cancelled')),
  total_rent_fee NUMERIC(12, 2) DEFAULT 0,
  total_buy_price NUMERIC(12, 2) DEFAULT 0,
  total_deposit NUMERIC(12, 2) DEFAULT 0,
  shipping_fee NUMERIC(12, 2) DEFAULT 30000,
  deposit_status TEXT DEFAULT 'held' CHECK (deposit_status IN ('none', 'held', 'refunded', 'deducted')),
  items JSONB NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. BẢNG ĐÁNH GIÁ & NHẬN XÉT (Reviews)
CREATE TABLE IF NOT EXISTS public.reviews (
  id TEXT PRIMARY KEY,
  product_id TEXT REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  user_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  user_name TEXT NOT NULL,
  user_avatar TEXT,
  rating INTEGER DEFAULT 5 CHECK (rating >= 1 AND rating <= 5),
  comment TEXT NOT NULL,
  type TEXT DEFAULT 'rent' CHECK (type IN ('buy', 'rent')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. BẢNG TIN NHẮN TRÒ CHUYỆN (Messages)
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

-- 8. BẢNG THÔNG TIN TÀI KHOẢN NGÂN HÀNG VIETQR
CREATE TABLE IF NOT EXISTS public.bank_configs (
  id TEXT PRIMARY KEY DEFAULT 'default_bank',
  bank_id TEXT NOT NULL DEFAULT 'MB',
  bank_name TEXT NOT NULL DEFAULT 'MB Bank (Ngân hàng TMCP Quân Đội)',
  account_no TEXT NOT NULL DEFAULT '0795623097',
  account_name TEXT NOT NULL DEFAULT 'LE TRUNG HIEU',
  template TEXT DEFAULT 'compact2',
  is_active BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================
-- TỐI ƯU HIỆU NĂNG VỚI CÁC INDEX
-- =========================================================
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category);
CREATE INDEX IF NOT EXISTS idx_products_status ON public.products(status);
CREATE INDEX IF NOT EXISTS idx_products_seller ON public.products(seller_id);
CREATE INDEX IF NOT EXISTS idx_rental_product ON public.rental_bookings(product_id);
CREATE INDEX IF NOT EXISTS idx_rental_dates ON public.rental_bookings(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_orders_code ON public.orders(order_code);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON public.messages(created_at ASC);
