import http from 'http';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Server as SocketIOServer } from 'socket.io';
import { db } from './db/index.js';

// Load biến môi trường từ .env
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5050;

// Cấu hình Socket.IO Realtime Server
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE']
  }
});

// Xử lý kết nối Realtime Socket.IO
io.on('connection', (socket) => {
  console.log(`⚡ [Realtime WebSocket]: Thiết bị đã kết nối (ID: ${socket.id})`);

  // Tham gia vào phòng chat cụ thể (mỗi cuộc hội thoại là 1 phòng riêng)
  socket.on('join_conversation', (conversationId) => {
    socket.join(conversationId);
    console.log(`💬 Socket ${socket.id} đã vào phòng chat [${conversationId}]`);
  });

  // Rời phòng chat
  socket.on('leave_conversation', (conversationId) => {
    socket.leave(conversationId);
  });

  // Đang gõ tin nhắn... (Typing indicator realtime)
  socket.on('typing', ({ conversationId, userName }) => {
    socket.to(conversationId).emit('user_typing', { userName });
  });

  socket.on('stop_typing', ({ conversationId }) => {
    socket.to(conversationId).emit('user_stop_typing');
  });

  // Gửi tin nhắn realtime qua Socket
  socket.on('send_message', async (data) => {
    try {
      const saved = await db.createMessage(data);
      const newMsg = {
        id: saved.id || `msg-${Date.now()}`,
        conversationId: data.conversationId,
        senderId: data.senderId,
        senderName: data.senderName,
        senderAvatar: data.senderAvatar,
        content: data.content,
        imageUrl: data.imageUrl || null,
        timestamp: saved.created_at || new Date().toISOString(),
        isRead: false
      };

      // Phát sóng tức thì đến tất cả người đang trong phòng trò chuyện này
      io.to(data.conversationId).emit('new_message', newMsg);
    } catch (err) {
      socket.emit('error_message', { message: err.message });
    }
  });

  socket.on('disconnect', () => {
    console.log(`🔌 [Realtime WebSocket]: Thiết bị ngắt kết nối (${socket.id})`);
  });
});

// Thư mục lưu trữ hình ảnh tải lên
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Cấu hình Multer để lưu file ảnh cục bộ
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `prod-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // Giới hạn tối đa 10MB mỗi ảnh
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Chỉ cho phép tải lên file hình ảnh (JPEG, PNG, WEBP, GIF)!'), false);
    }
  }
});

// Middleware
app.use(cors({
  origin: '*', // Cho phép frontend mọi domain/port kết nối
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '20mb' })); // Cho phép gửi Base64 ảnh trực tiếp qua JSON
app.use(express.urlencoded({ extended: true }));

// Cho phép truy cập công khai ảnh trong thư mục uploads/
app.use('/uploads', express.static(uploadsDir));

// Request Logger Middleware
app.use((req, res, next) => {
  const time = new Date().toLocaleTimeString('vi-VN');
  console.log(`[${time}] ${req.method} ${req.originalUrl}`);
  next();
});

// ============================================================================
// 1. HEALTH CHECK & THÔNG TIN HỆ THỐNG
// ============================================================================
app.get('/api/health', async (req, res) => {
  try {
    const health = await db.healthCheck();
    res.json({
      status: 'ok',
      message: 'Bi Bi Fashion Backend API đang hoạt động!',
      database: health,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime())
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ============================================================================
// 2. UPLOAD ẢNH SẢN PHẨM (MULTIPART FILE & BASE64)
// ============================================================================

// POST /api/upload - Tải lên 1 ảnh sản phẩm (FormData với field name: 'image')
app.post('/api/upload', upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn 1 file hình ảnh để tải lên' });
    }

    const host = req.get('host');
    const protocol = req.protocol;
    const imageUrl = `${protocol}://${host}/uploads/${req.file.filename}`;

    res.json({
      success: true,
      message: 'Tải ảnh lên thành công!',
      url: imageUrl,
      relativePath: `/uploads/${req.file.filename}`,
      filename: req.file.filename,
      size: req.file.size
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi tải ảnh lên', error: err.message });
  }
});

// POST /api/upload/multiple - Tải lên nhiều ảnh sản phẩm cùng lúc (Tối đa 10 ảnh, field name: 'images')
app.post('/api/upload/multiple', upload.array('images', 10), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn ít nhất 1 file hình ảnh' });
    }

    const host = req.get('host');
    const protocol = req.protocol;
    const urls = req.files.map(f => `${protocol}://${host}/uploads/${f.filename}`);

    res.json({
      success: true,
      message: `Đã tải lên thành công ${req.files.length} ảnh!`,
      urls,
      count: req.files.length
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi tải nhiều ảnh', error: err.message });
  }
});

// ============================================================================
// 3. PRODUCTS API (ĐĂNG SẢN PHẨM, SỬA, XÓA & XEM LỊCH THUÊ TỪNG SẢN PHẨM)
// ============================================================================

// GET /api/products - Danh sách sản phẩm (lọc: category, type, search, minPrice, maxPrice)
app.get('/api/products', async (req, res) => {
  try {
    const products = await db.getProducts(req.query);
    res.json({ success: true, count: products.length, data: products });
  } catch (err) {
    console.error('Lỗi khi lấy danh sách sản phẩm:', err);
    res.status(500).json({ success: false, message: 'Lỗi server khi tải sản phẩm', error: err.message });
  }
});

// GET /api/products/:id - Chi tiết 1 sản phẩm kèm lịch thuê và đánh giá
app.get('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const product = await db.getProductById(id);

    if (!product) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm' });
    }

    // Tăng lượt xem sản phẩm
    db.incrementViews(id).catch(() => {});

    res.json({ success: true, data: product });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server', error: err.message });
  }
});

// GET /api/products/:id/calendar - XEM LỊCH THUÊ CHI TIẾT CỦA TỪNG SẢN PHẨM
// Trả về: Thông tin trang phục, danh sách các khoảng thuê, ai đang thuê và mảng tất cả các ngày bị khóa
app.get('/api/products/:id/calendar', async (req, res) => {
  try {
    const { id } = req.params;
    const calendar = await db.getProductCalendar(id);
    if (!calendar) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm' });
    }
    res.json({ success: true, data: calendar });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi tải lịch thuê sản phẩm', error: err.message });
  }
});

// POST /api/products - ĐĂNG SẢN PHẨM MỚI (Hỗ trợ bán, cho thuê hoặc cả hai)
app.post('/api/products', async (req, res) => {
  try {
    const p = req.body;

    if (!p.title) {
      return res.status(400).json({ success: false, message: 'Tiêu đề sản phẩm không được để trống' });
    }
    if (!p.featuredImage) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp ít nhất 1 ảnh đại diện cho sản phẩm' });
    }

    const created = await db.createProduct(p);
    res.status(201).json({
      success: true,
      message: 'Đăng sản phẩm mới thành công!',
      data: created
    });
  } catch (err) {
    console.error('Lỗi khi đăng sản phẩm:', err);
    res.status(500).json({ success: false, message: 'Lỗi khi lưu sản phẩm vào hệ thống', error: err.message });
  }
});

// PUT /api/products/:id - Cập nhật sản phẩm
app.put('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await db.updateProduct(id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm để cập nhật' });
    }
    res.json({ success: true, message: 'Cập nhật sản phẩm thành công', data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi khi cập nhật sản phẩm', error: err.message });
  }
});

// DELETE /api/products/:id - Xóa sản phẩm
app.delete('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.deleteProduct(id);
    res.json({ success: true, message: 'Đã xóa sản phẩm thành công' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi khi xóa sản phẩm', error: err.message });
  }
});

// ============================================================================
// 4. QUẢN LÝ ĐẶT LỊCH THUÊ & QUẢN LÝ KHÁCH THUÊ (RENTERS MANAGEMENT)
// ============================================================================

// GET /api/rentals - Danh sách tất cả các lịch thuê (có thể lọc theo ?productId=...)
app.get('/api/rentals', async (req, res) => {
  try {
    const { productId } = req.query;
    const bookings = await db.getRentalBookings(productId || null);
    res.json({ success: true, count: bookings.length, data: bookings });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi tải danh sách lịch thuê', error: err.message });
  }
});

// GET /api/rentals/renters - QUẢN LÝ DANH SÁCH KHÁCH THUÊ
// Tổng hợp thông tin khách hàng, số lần thuê, trang phục đang thuê và lịch sử thuê
app.get('/api/rentals/renters', async (req, res) => {
  try {
    const renters = await db.getRenters();
    res.json({
      success: true,
      totalRenters: renters.length,
      data: renters
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi tải danh bạ khách thuê', error: err.message });
  }
});

// POST /api/rentals/check - Kiểm tra trước xem khoảng ngày thuê có bị trùng lịch hay không
app.post('/api/rentals/check', async (req, res) => {
  try {
    const { productId, startDate, endDate } = req.body;
    if (!productId || !startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'Thiếu productId, startDate hoặc endDate' });
    }

    const result = await db.checkRentalAvailability(productId, startDate, endDate);
    res.json({
      success: true,
      isAvailable: result.isAvailable,
      conflictsCount: result.conflicts.length,
      message: result.isAvailable 
        ? 'Thời gian thuê khả dụng! Bạn có thể đặt ngày này.' 
        : 'Trang phục này đã có khách thuê trong khoảng ngày bạn chọn!',
      conflicts: result.conflicts
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi kiểm tra lịch', error: err.message });
  }
});

// POST /api/rentals - Đặt lịch thuê mới (có bảo vệ chống trùng)
app.post('/api/rentals', async (req, res) => {
  try {
    const { productId, startDate, endDate } = req.body;
    if (!productId || !startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin đặt lịch bắt buộc' });
    }

    const booking = await db.createRentalBooking(req.body);
    res.status(201).json({ success: true, message: 'Đặt lịch thuê thành công', data: booking });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// PATCH /api/rentals/:id/status - CẬP NHẬT TRẠNG THÁI KHÁCH THUÊ
// confirmed (đã cọc) -> active (khách đã nhận đồ) -> completed (đã trả đồ hoàn tất) -> cancelled (hủy)
app.patch('/api/rentals/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, note } = req.body;

    if (!status) {
      return res.status(400).json({ success: false, message: 'Cần truyền status mới' });
    }

    const updated = await db.updateRentalBooking(id, { status, note });
    res.json({ success: true, message: 'Cập nhật trạng thái khách thuê thành công', data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi cập nhật', error: err.message });
  }
});

// PUT /api/rentals/:id - Sửa thông tin khách thuê hoặc lịch thuê
app.put('/api/rentals/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await db.updateRentalBooking(id, req.body);
    res.json({ success: true, message: 'Cập nhật thông tin lịch thuê thành công', data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi cập nhật', error: err.message });
  }
});

// DELETE /api/rentals/:id - Hủy/Xóa lịch thuê
app.delete('/api/rentals/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.deleteRentalBooking(id);
    res.json({ success: true, message: 'Đã hủy lịch thuê thành công' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi hủy lịch thuê', error: err.message });
  }
});

// ============================================================================
// 5. ORDERS API (QUẢN LÝ ĐƠN HÀNG MUA & THUÊ)
// ============================================================================

// GET /api/orders - Lấy danh sách đơn hàng
app.get('/api/orders', async (req, res) => {
  try {
    const orders = await db.getOrders(req.query);
    res.json({ success: true, count: orders.length, data: orders });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi khi lấy đơn hàng', error: err.message });
  }
});

// GET /api/orders/:id - Chi tiết 1 đơn hàng
app.get('/api/orders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const order = await db.getOrderById(id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
    }
    res.json({ success: true, data: order });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server', error: err.message });
  }
});

// Cấu hình tài khoản ngân hàng VietQR của Shop Bi Bi
const VIETQR_CONFIG = {
  bankId: process.env.VIETQR_BANK_ID || 'MB',
  bankName: process.env.VIETQR_BANK_NAME || 'MB Bank (Ngân hàng TMCP Quân Đội)',
  accountNo: process.env.VIETQR_ACCOUNT_NO || '0795623097',
  accountName: process.env.VIETQR_ACCOUNT_NAME || 'LE TRUNG HIEU',
  template: process.env.VIETQR_TEMPLATE || 'compact2'
};

function generateVietQRUrl(amount, orderCode) {
  const bank = VIETQR_CONFIG.bankId;
  const accNo = VIETQR_CONFIG.accountNo;
  const accName = encodeURIComponent(VIETQR_CONFIG.accountName);
  const template = VIETQR_CONFIG.template;
  const cleanAmount = Math.round(Number(amount) || 0);
  const addInfo = encodeURIComponent(orderCode || 'Thanh toan don hang');

  return `https://img.vietqr.io/image/${bank}-${accNo}-${template}.png?amount=${cleanAmount}&addInfo=${addInfo}&accountName=${accName}`;
}

// GET /api/config/bank - Lấy thông tin STK ngân hàng VietQR của Shop
app.get('/api/config/bank', (req, res) => {
  res.json({
    success: true,
    data: VIETQR_CONFIG
  });
});

// POST /api/orders - Tạo đơn hàng mới (tự động tạo lịch thuê nếu có đồ thuê & tự sinh mã VietQR)
app.post('/api/orders', async (req, res) => {
  try {
    const { customerName, customerPhone, shippingAddress, items } = req.body;
    if (!customerName || !customerPhone || !shippingAddress || !items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Vui lòng điền đầy đủ thông tin nhận hàng và sản phẩm' });
    }

    const { order, orderCode } = await db.createOrder(req.body);

    const totalAmount = Number(order.total_buy_price || 0) + 
                        Number(order.total_rent_fee || 0) + 
                        Number(order.total_deposit || 0) + 
                        Number(order.shipping_fee || 30000);

    const vietqrUrl = generateVietQRUrl(totalAmount, orderCode);

    res.status(201).json({
      success: true,
      message: 'Đặt hàng thành công!',
      orderCode,
      vietqrUrl,
      vietqrConfig: VIETQR_CONFIG,
      data: {
        ...order,
        vietqr_url: vietqrUrl,
        total_amount: totalAmount
      }
    });
  } catch (err) {
    console.error('Lỗi khi tạo đơn hàng:', err);
    res.status(500).json({ success: false, message: 'Lỗi khi tạo đơn hàng', error: err.message });
  }
});

// PATCH /api/orders/:id/status - Cập nhật trạng thái đơn & tiền đặt cọc
app.patch('/api/orders/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await db.updateOrderStatus(id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
    }
    res.json({ success: true, message: 'Cập nhật trạng thái đơn hàng thành công', data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi cập nhật đơn hàng', error: err.message });
  }
});

// ============================================================================
// 6. REVIEWS & COMMENTS API (ĐÁNH GIÁ SẢN PHẨM)
// ============================================================================

// GET /api/reviews - Lấy đánh giá của sản phẩm
app.get('/api/reviews', async (req, res) => {
  try {
    const { productId } = req.query;
    const reviews = await db.getReviews(productId);
    res.json({ success: true, count: reviews.length, data: reviews });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi tải đánh giá', error: err.message });
  }
});

// POST /api/reviews - Gửi đánh giá mới
app.post('/api/reviews', async (req, res) => {
  try {
    const { productId, comment, rating } = req.body;
    if (!productId || !comment || !rating) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin đánh giá bắt buộc' });
    }

    const review = await db.createReview(req.body);
    res.status(201).json({ success: true, message: 'Đã gửi đánh giá thành công', data: review });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi gửi đánh giá', error: err.message });
  }
});

// ============================================================================
// 7. MESSAGES / CHAT API (TRÒ CHUYỆN KHÁCH HÀNG & SHOP)
// ============================================================================

// GET /api/messages - Lấy tin nhắn theo conversationId
app.get('/api/messages', async (req, res) => {
  try {
    const { conversationId } = req.query;
    if (!conversationId) {
      return res.status(400).json({ success: false, message: 'Cần cung cấp conversationId' });
    }

    const messages = await db.getMessages(conversationId);
    res.json({ success: true, data: messages });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi tải tin nhắn', error: err.message });
  }
});

// POST /api/messages - Gửi tin nhắn mới
app.post('/api/messages', async (req, res) => {
  try {
    const { conversationId, content } = req.body;
    if (!conversationId || !content) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin tin nhắn' });
    }

    const message = await db.createMessage(req.body);

    // Phát sóng realtime tới các client đang mở cuộc hội thoại này
    io.to(conversationId).emit('new_message', {
      id: message.id,
      conversationId: message.conversation_id || conversationId,
      senderId: message.sender_id || req.body.senderId,
      senderName: message.sender_name || req.body.senderName,
      senderAvatar: message.sender_avatar || req.body.senderAvatar,
      content: message.content,
      imageUrl: message.image_url || req.body.imageUrl,
      timestamp: message.created_at || new Date().toISOString(),
      isRead: false
    });

    res.status(201).json({ success: true, data: message });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi gửi tin nhắn', error: err.message });
  }
});

// ============================================================================
// 8. ADMIN STATS API (THỐNG KÊ DOANH THU & ĐƠN HÀNG)
// ============================================================================
app.get('/api/admin/stats', async (req, res) => {
  try {
    const stats = await db.getAdminStats();
    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi tải thống kê', error: err.message });
  }
});

// ============================================================================
// 404 HANDLER & START SERVER
// ============================================================================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `API endpoint '${req.method} ${req.originalUrl}' không tồn tại trên server.`
  });
});

server.listen(PORT, () => {
  console.log('====================================================');
  console.log(`🚀 Bi Bi Fashion Backend Server (REST & WebSocket Realtime) đang chạy tại:`);
  console.log(`👉 HTTP & Socket.IO: http://localhost:${PORT}`);
  console.log(`👉 Upload ảnh: POST http://localhost:${PORT}/api/upload`);
  console.log(`👉 Đăng sản phẩm: POST http://localhost:${PORT}/api/products`);
  console.log(`👉 Lịch thuê từng sản phẩm: GET http://localhost:${PORT}/api/products/:id/calendar`);
  console.log(`👉 Quản lý khách thuê: GET http://localhost:${PORT}/api/rentals/renters`);
  console.log(`👉 Thống kê Admin: http://localhost:${PORT}/api/admin/stats`);
  console.log('====================================================');
});
