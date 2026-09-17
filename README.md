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
```bash
# Chạy ở chế độ phát triển (tự reload khi sửa code)
npm run dev

# Hoặc chạy Production
npm start
```
Server sẽ chạy tại: `http://localhost:5050`

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
