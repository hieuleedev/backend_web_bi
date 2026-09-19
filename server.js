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

import { uploadImageFile } from './storage/s3.js';

// Thư mục lưu trữ hình ảnh fallback
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Cấu hình Multer bộ nhớ RAM để gửi trực tiếp lên Vietnix S3
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // Tối đa 15MB mỗi ảnh
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

// Cho phép truy cập công khai ảnh trong thư mục uploads/ (fallback)
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
      storage: {
        provider: 'vietnix_s3',
        endpoint: process.env.S3_ENDPOINT || 'https://s3.vn-hcm-1.vietnix.cloud',
        bucket: process.env.S3_BUCKET || 'web-bi-images'
      },
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime())
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ============================================================================
// 2. UPLOAD ẢNH LÊN VIETNIX S3 (MULTIPART FILE & BASE64)
// ============================================================================

// POST /api/upload - Tải lên 1 ảnh sản phẩm lên Vietnix S3
app.post('/api/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn 1 file hình ảnh để tải lên' });
    }

    const result = await uploadImageFile(req.file.buffer, req.file.originalname, req.file.mimetype, req);

    res.json({
      success: true,
      message: 'Tải ảnh lên Vietnix S3 thành công!',
      url: result.url,
      key: result.key,
      size: result.size,
      storage: result.storage
    });
  } catch (err) {
    console.error('Lỗi tải ảnh lên S3:', err);
    res.status(500).json({ success: false, message: 'Lỗi tải ảnh lên Vietnix S3', error: err.message });
  }
});

// POST /api/upload/multiple - Tải lên nhiều ảnh sản phẩm lên Vietnix S3 cùng lúc (Tối đa 10 ảnh)
app.post('/api/upload/multiple', upload.array('images', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn ít nhất 1 file hình ảnh' });
    }

    const uploadPromises = req.files.map(file => 
      uploadImageFile(file.buffer, file.originalname, file.mimetype, req)
    );

    const results = await Promise.all(uploadPromises);
    const urls = results.map(r => r.url);

    res.json({
      success: true,
      message: `Đã tải lên thành công ${results.length} ảnh lên Vietnix S3!`,
      urls,
      files: results,
      count: results.length
    });
  } catch (err) {
    console.error('Lỗi tải nhiều ảnh lên S3:', err);
    res.status(500).json({ success: false, message: 'Lỗi tải nhiều ảnh lên Vietnix S3', error: err.message });
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

// POST /api/products - ĐĂNG SẢN PHẨM MỚI (Hỗ trợ JSON lẫn Multipart FormData gửi kèm ảnh)
app.post('/api/products', upload.array('images', 10), async (req, res) => {
  try {
    const p = { ...req.body };

    // 1. Xử lý các files ảnh nhị phân được gửi đính kèm trực tiếp trong request
    let uploadedUrls = [];
    if (req.files && req.files.length > 0) {
      console.log(`📸 Nhận ${req.files.length} file ảnh đính kèm khi đăng sản phẩm. Đang tải lên Vietnix S3...`);
      const uploadPromises = req.files.map(file =>
        uploadImageFile(file.buffer, file.originalname, file.mimetype, req)
      );
      const results = await Promise.all(uploadPromises);
      uploadedUrls = results.map(r => r.url);
      console.log(`✅ Đã tải xong ${uploadedUrls.length} ảnh lên Vietnix S3.`);
    }

    // 2. Kết hợp với các URL ảnh có sẵn (nếu có)
    let existingImages = [];
    if (p.images) {
      try {
        existingImages = typeof p.images === 'string' ? JSON.parse(p.images) : p.images;
      } catch {
        existingImages = Array.isArray(p.images) ? p.images : [p.images];
      }
    }
    p.images = [...existingImages, ...uploadedUrls];

    // 3. Chuẩn hóa các trường khi gửi từ FormData
    if (typeof p.sizes === 'string') {
      try { p.sizes = JSON.parse(p.sizes); } catch { p.sizes = p.sizes.split(',').map(s => s.trim()).filter(Boolean); }
    }
    if (typeof p.colors === 'string') {
      try { p.colors = JSON.parse(p.colors); } catch { p.colors = p.colors.split(',').map(c => c.trim()).filter(Boolean); }
    }
    if (p.buyPrice !== undefined && p.buyPrice !== '') p.buyPrice = Number(p.buyPrice);
    if (p.originalPrice !== undefined && p.originalPrice !== '') p.originalPrice = Number(p.originalPrice);
    if (p.rentPrice1Day !== undefined && p.rentPrice1Day !== '') p.rentPrice1Day = Number(p.rentPrice1Day);
    if (p.rentPrice3Days !== undefined && p.rentPrice3Days !== '') p.rentPrice3Days = Number(p.rentPrice3Days);
    if (p.rentPrice7Days !== undefined && p.rentPrice7Days !== '') p.rentPrice7Days = Number(p.rentPrice7Days);
    if (p.deposit !== undefined && p.deposit !== '') p.deposit = Number(p.deposit);
    if (p.shippingFee !== undefined && p.shippingFee !== '') p.shippingFee = Number(p.shippingFee);

    // 4. Xác định ảnh bìa (featuredImage)
    const featuredIdx = Number(p.featuredIndex) || 0;
    if (Array.isArray(p.images) && p.images.length > 0) {
      p.featuredImage = p.images[featuredIdx] || p.images[0];
    }

    if (!p.title) {
      return res.status(400).json({ success: false, message: 'Tiêu đề sản phẩm không được để trống' });
    }
    if (!p.featuredImage && (!p.images || p.images.length === 0)) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp ít nhất 1 ảnh cho sản phẩm' });
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

// POST /api/products/:id/like - Thích / Tăng like sản phẩm
app.post('/api/products/:id/like', async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await db.toggleProductLike(id);
    res.json({ success: true, message: 'Đã thích sản phẩm thành công', data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi khi thích sản phẩm', error: err.message });
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

// PUT /api/orders/:id - Cập nhật chi tiết đơn hàng
app.put('/api/orders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await db.updateOrder(id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
    }
    res.json({ success: true, message: 'Cập nhật đơn hàng thành công', data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi cập nhật đơn hàng', error: err.message });
  }
});

// DELETE /api/orders/:id - Hủy hoặc xóa đơn hàng
app.delete('/api/orders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.deleteOrder(id);
    res.json({ success: true, message: 'Đã xóa đơn hàng thành công' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi khi xóa đơn hàng', error: err.message });
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

// GET /api/conversations - Lấy danh sách cuộc hội thoại gần đây
app.get('/api/conversations', async (req, res) => {
  try {
    const { userId } = req.query;
    const conversations = await db.getConversations(userId || null);
    res.json({ success: true, count: conversations.length, data: conversations });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi tải danh sách hội thoại', error: err.message });
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
// 9. USERS & AUTHENTICATION API (TÀI KHOẢN & NGƯỜI DÙNG)
// ============================================================================

// GET /api/users - Danh sách người dùng
app.get('/api/users', async (req, res) => {
  try {
    const users = await db.getUsers();
    res.json({ success: true, count: users.length, data: users });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi tải danh sách người dùng', error: err.message });
  }
});

// GET /api/users/:id - Chi tiết người dùng
app.get('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const user = await db.getUserById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
    }
    res.json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server', error: err.message });
  }
});

// POST /api/auth/register - Đăng ký tài khoản mới
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, phone, role } = req.body;
    if (!name || !email) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp họ tên và email' });
    }
    const created = await db.createUser(req.body);
    const token = `bibi_jwt_${created.id}_${Date.now()}`;
    res.status(201).json({
      success: true,
      message: 'Đăng ký tài khoản thành công!',
      token,
      user: created
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi khi đăng ký', error: err.message });
  }
});

// POST /api/auth/login - Đăng nhập
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp email đăng nhập' });
    }
    const users = await db.getUsers();
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user) {
      return res.status(401).json({ success: false, message: 'Email này chưa được đăng ký trong hệ thống' });
    }
    const token = `bibi_jwt_${user.id}_${Date.now()}`;
    res.json({
      success: true,
      message: 'Đăng nhập thành công!',
      token,
      user
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi đăng nhập', error: err.message });
  }
});

// PUT /api/users/:id - Cập nhật thông tin tài khoản
app.put('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await db.updateUser(id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
    }
    res.json({ success: true, message: 'Cập nhật tài khoản thành công', data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi cập nhật', error: err.message });
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
