# Bi Bi Fashion - Backend Server (Node.js & WebSocket)

Repository Backend độc lập cho ứng dụng thời trang & cho thuê trang phục **Bi Bi Boutique & Rental**.

## 🚀 Tính năng Backend
- **RESTful API**: Quản lý sản phẩm, đơn hàng, khách thuê, lịch thuê từng sản phẩm, thống kê doanh thu.
- **WebSocket Realtime (Socket.IO)**: Nhắn tin trò chuyện trực tiếp giữa khách hàng và chủ shop, typing indicator, cập nhật trạng thái đơn hàng.
- **Cấu hình Ngân hàng & VietQR**: Tự động sinh mã VietQR động chuẩn NAPAS247 cho từng đơn hàng (MB Bank - Lê Trung Hiếu).
- **Kiến trúc Database Adapter (Decoupled)**: Dễ dàng chuyển đổi giữa `supabase`, `postgres` hoặc `memory` chỉ qua 1 biến môi trường `DB_PROVIDER`.
- **Upload đa ảnh**: Hỗ trợ upload ảnh sản phẩm qua Multer và lưu trữ chuẩn hóa.

## 📦 Cài đặt & Khởi chạy

### 1. Cài đặt dependencies
```bash
npm install
```

### 2. Cấu hình file `.env`
Sao chép `.env.example` thành `.env`:
```bash
cp .env.example .env
```
Mặc định hệ thống kết nối với **Supabase**. Bạn có thể tùy biến các biến môi trường nếu cần.

### 3. Khởi chạy Server

#### Cách 1: Chạy trực tiếp với Node / PM2
```bash
# Chạy ở chế độ phát triển (tự reload khi sửa code)
npm run dev

# Hoặc chạy Production với Node
npm start

# Hoặc quản lý tiến trình bằng PM2
npm run pm2:start
```

#### Cách 2: Triển khai trên máy chủ (Server/VPS) bằng Docker & Docker Compose
```bash
# 1. Build image Docker
docker compose build
# hoặc: npm run docker:build

# 2. Khởi chạy container ngầm (Detached mode)
docker compose up -d
# hoặc: npm run docker:up

# 3. Xem log thời gian thực
docker compose logs -f
# hoặc: npm run docker:logs

# 4. Dừng container khi cần
docker compose down
# hoặc: npm run docker:down
```

Server sẽ chạy tại: `http://localhost:5050` (hoặc cổng cấu hình trong `.env`).
Dữ liệu thư mục `uploads/` và `backups/` được mount ra ngoài volume máy chủ nên không bị mất khi cập nhật hoặc rebuild image.

## 🔗 Các API Endpoint chính
- `GET /api/health`: Kiểm tra tình trạng kết nối Server và Database
- `GET /api/products`: Danh sách sản phẩm (hỗ trợ lọc danh mục, loại mua/thuê, khoảng giá, tìm kiếm)
- `POST /api/products`: Đăng sản phẩm mới
- `GET /api/products/:id/calendar`: Lịch ngày đã được đặt thuê của sản phẩm
- `GET /api/rentals/renters`: Danh sách khách hàng đã đặt thuê và lịch sử thuê
- `POST /api/orders`: Tạo đơn hàng mới & sinh mã VietQR
- `GET /api/orders/:id/vietqr`: Lấy thông tin & link mã VietQR của đơn hàng
- `POST /api/upload`: Upload ảnh sản phẩm
- `GET /api/admin/stats`: Thống kê tổng quan cho quản trị viên
