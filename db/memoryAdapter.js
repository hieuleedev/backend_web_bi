/**
 * In-Memory Database Adapter
 * Lưu trữ dữ liệu trực tiếp trên RAM, có sẵn dữ liệu mẫu.
 * Rất tiện lợi cho việc kiểm thử, chạy offline hoặc demo không cần kết nối mạng.
 */
export class MemoryAdapter {
  constructor() {
    this.name = 'In-Memory (Local RAM)';
    this.products = [
      {
        id: 'prod-1',
        title: 'Đầm Trắng Nàng Thơ Cổ Vuông Tay Bồng Xòe Tơ Lụa',
        description: 'Mẫu đầm trắng tinh khôi độc quyền từ Bi Bi Boutique. Thiết kế cổ vuông quý phái, tay bồng công chúa xếp nếp bồng bềnh.',
        category: 'party-dress',
        gender: 'women',
        brand: 'Nàng Thơ Boutique',
        type: 'both',
        status: 'approved',
        buyPrice: 1850000,
        rentPrice1Day: 250000,
        rentPrice3Days: 550000,
        rentPrice7Days: 980000,
        deposit: 800000,
        sizes: ['S', 'M', 'L'],
        colors: ['Trắng Thuần Khiết', 'Trắng Kem Vani'],
        material: 'Tơ organza dệt hoa chìm cao cấp, lót lụa tơ tằm',
        condition: 'Mới 100%',
        featuredImage: 'https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&w=800&q=80',
        images: ['https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&w=1000&q=80'],
        sellerId: 'user-seller-1',
        sellerName: 'Bi Bi Boutique (Linh Bi)',
        sellerAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
        sellerRating: 4.9,
        location: 'Khối 1 - Xã Núi Thành - Thành Phố Đà Nẵng',
        views: 1820,
        rating: 4.9,
        reviewsCount: 42,
        createdAt: new Date().toISOString(),
        bookedDates: []
      },
      {
        id: 'prod-2',
        title: 'Áo Dài Lụa Tơ Tằm Trắng Thêu Sen Thủ Công',
        description: 'Tác phẩm áo dài lụa tơ tằm trắng ngà tinh khôi thêu hoa sen. Tà áo lụa Nha Xá mềm rủ, phom dáng truyền thống thướt tha.',
        category: 'ao-dai',
        gender: 'women',
        brand: 'Heritage Bi Bi',
        type: 'both',
        status: 'approved',
        buyPrice: 2450000,
        rentPrice1Day: 280000,
        rentPrice3Days: 620000,
        rentPrice7Days: 1100000,
        deposit: 1000000,
        sizes: ['S', 'M', 'L', 'XL'],
        colors: ['Trắng Tinh Khôi', 'Trắng Ngà Tự Nhiên'],
        material: '100% Lụa tơ tằm Nha Xá mềm mại',
        condition: '99% Like New',
        featuredImage: 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=800&q=80',
        images: ['https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=1000&q=80'],
        sellerId: 'user-seller-1',
        sellerName: 'Bi Bi Boutique (Linh Bi)',
        sellerAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
        sellerRating: 4.9,
        location: 'Khối 1 - Xã Núi Thành - Thành Phố Đà Nẵng',
        views: 1450,
        rating: 5.0,
        reviewsCount: 31,
        createdAt: new Date().toISOString(),
        bookedDates: []
      }
    ];

    this.rentals = [];
    this.orders = [];
    this.reviews = [];
    this.messages = [];
  }

  async healthCheck() {
    return { connected: true, provider: this.name };
  }

  async getProducts(filters = {}) {
    let list = [...this.products];
    if (filters.category && filters.category !== 'all') list = list.filter(p => p.category === filters.category);
    if (filters.type && filters.type !== 'all') list = list.filter(p => p.type === filters.type || p.type === 'both');
    if (filters.search) list = list.filter(p => p.title.toLowerCase().includes(filters.search.toLowerCase()));
    if (filters.minPrice) list = list.filter(p => p.buyPrice >= Number(filters.minPrice));
    if (filters.maxPrice) list = list.filter(p => p.buyPrice <= Number(filters.maxPrice));
    return list;
  }

  async getProductById(id) {
    const prod = this.products.find(p => p.id === id);
    if (!prod) return null;
    const bookings = this.rentals.filter(r => r.productId === id && r.status !== 'cancelled');
    const reviews = this.reviews.filter(r => r.productId === id);
    return { ...prod, bookedDates: bookings, reviews };
  }

  async createProduct(data) {
    const newProduct = {
      ...data,
      id: data.id || `prod-${Date.now()}`,
      views: 1,
      rating: 5.0,
      reviewsCount: 0,
      bookedDates: [],
      createdAt: new Date().toISOString()
    };
    this.products.unshift(newProduct);
    return newProduct;
  }

  async updateProduct(id, data) {
    const index = this.products.findIndex(p => p.id === id);
    if (index === -1) return null;
    this.products[index] = { ...this.products[index], ...data };
    return this.products[index];
  }

  async deleteProduct(id) {
    this.products = this.products.filter(p => p.id !== id);
    return true;
  }

  async incrementViews(id) {
    const prod = this.products.find(p => p.id === id);
    if (prod) prod.views = (prod.views || 0) + 1;
  }

  async getRentalBookings(productId = null) {
    if (productId) return this.rentals.filter(r => r.productId === productId && r.status !== 'cancelled');
    return this.rentals.filter(r => r.status !== 'cancelled');
  }

  async checkRentalAvailability(productId, startDate, endDate) {
    const bookings = await this.getRentalBookings(productId);
    const reqStart = new Date(startDate).getTime();
    const reqEnd = new Date(endDate).getTime();

    const conflicts = bookings.filter(b => {
      const bStart = new Date(b.startDate || b.start_date).getTime();
      const bEnd = new Date(b.endDate || b.end_date).getTime();
      return reqStart <= bEnd && reqEnd >= bStart;
    });

    return {
      isAvailable: conflicts.length === 0,
      conflicts: conflicts.map(c => ({
        startDate: c.startDate || c.start_date,
        endDate: c.endDate || c.end_date,
        renterName: c.renterName || c.renter_name
      }))
    };
  }

  async createRentalBooking(data) {
    const check = await this.checkRentalAvailability(data.productId, data.startDate, data.endDate);
    if (!check.isAvailable) throw new Error('Khoảng thời gian này đã có người thuê trước đó!');

    const booking = {
      id: data.id || `book-${Date.now()}`,
      productId: data.productId,
      orderId: data.orderId || null,
      startDate: data.startDate,
      endDate: data.endDate,
      renterName: data.renterName || 'Khách hàng',
      renterPhone: data.renterPhone || '',
      status: data.status || 'confirmed',
      note: data.note || '',
      createdAt: new Date().toISOString()
    };
    this.rentals.push(booking);
    return booking;
  }

  async createManyRentalBookings(list = []) {
    for (const item of list) await this.createRentalBooking(item);
    return list;
  }

  async updateRentalBooking(id, updates = {}) {
    const booking = this.rentals.find(r => r.id === id);
    if (!booking) return null;
    if (updates.status) booking.status = updates.status;
    if (updates.note !== undefined) booking.note = updates.note;
    if (updates.renterName) booking.renterName = updates.renterName;
    if (updates.renterPhone) booking.renterPhone = updates.renterPhone;
    if (updates.startDate) booking.startDate = updates.startDate;
    if (updates.endDate) booking.endDate = updates.endDate;
    return booking;
  }

  async getProductCalendar(productId) {
    const prod = this.products.find(p => p.id === productId);
    if (!prod) return null;

    const bookings = this.rentals.filter(r => r.productId === productId && r.status !== 'cancelled');
    const blockedDates = [];
    bookings.forEach(b => {
      let current = new Date(b.startDate || b.start_date);
      const end = new Date(b.endDate || b.end_date);
      while (current <= end) {
        blockedDates.push(current.toISOString().split('T')[0]);
        current.setDate(current.getDate() + 1);
      }
    });

    return {
      product: {
        id: prod.id,
        title: prod.title,
        featured_image: prod.featuredImage,
        deposit: prod.deposit,
        rent_price_1day: prod.rentPrice1Day
      },
      totalBookings: bookings.length,
      bookings: bookings.map(b => ({
        id: b.id,
        orderId: b.orderId,
        startDate: b.startDate || b.start_date,
        endDate: b.endDate || b.end_date,
        renterName: b.renterName || b.renter_name,
        renterPhone: b.renterPhone || b.renter_phone,
        status: b.status,
        note: b.note,
        createdAt: b.createdAt
      })),
      blockedDates: [...new Set(blockedDates)]
    };
  }

  async getRenters() {
    const rentersMap = {};
    this.rentals.forEach(b => {
      const phone = b.renterPhone || b.renter_phone || 'Không có SĐT';
      const prod = this.products.find(p => p.id === (b.productId || b.product_id));

      if (!rentersMap[phone]) {
        rentersMap[phone] = {
          renterName: b.renterName || b.renter_name,
          renterPhone: phone,
          totalBookings: 0,
          activeRentals: 0,
          completedRentals: 0,
          history: []
        };
      }

      rentersMap[phone].totalBookings += 1;
      if (b.status === 'active' || b.status === 'confirmed') rentersMap[phone].activeRentals += 1;
      if (b.status === 'completed') rentersMap[phone].completedRentals += 1;

      rentersMap[phone].history.push({
        bookingId: b.id,
        orderId: b.orderId || b.order_id,
        productId: b.productId || b.product_id,
        productTitle: prod ? prod.title : 'Trang phục',
        productImage: prod ? prod.featuredImage : '',
        startDate: b.startDate || b.start_date,
        endDate: b.endDate || b.end_date,
        status: b.status,
        note: b.note,
        createdAt: b.createdAt
      });
    });

    return Object.values(rentersMap);
  }

  async deleteRentalBooking(id) {
    this.rentals = this.rentals.filter(r => r.id !== id);
    return true;
  }

  async getOrders(filters = {}) {
    let list = [...this.orders];
    if (filters.phone) list = list.filter(o => o.customerPhone === filters.phone || o.customer_phone === filters.phone);
    if (filters.status) list = list.filter(o => o.status === filters.status);
    return list;
  }

  async getOrderById(id) {
    return this.orders.find(o => o.id === id) || null;
  }

  async createOrder(orderData) {
    const id = orderData.id || `ord-${Date.now()}`;
    const orderCode = orderData.orderCode || `BB-${Math.floor(10000 + Math.random() * 90000)}`;

    const order = {
      id,
      orderCode,
      customerName: orderData.customerName,
      customerPhone: orderData.customerPhone,
      shippingAddress: orderData.shippingAddress,
      deliveryMethod: orderData.deliveryMethod || 'standard',
      paymentMethod: orderData.paymentMethod || 'vietqr',
      status: 'pending',
      totalRentFee: orderData.totalRentFee || 0,
      totalBuyPrice: orderData.totalBuyPrice || 0,
      totalDeposit: orderData.totalDeposit || 0,
      shippingFee: orderData.shippingFee ?? 30000,
      depositStatus: (orderData.totalDeposit || 0) > 0 ? 'held' : 'none',
      items: orderData.items || [],
      note: orderData.note || '',
      createdAt: new Date().toISOString()
    };
    this.orders.unshift(order);

    for (const item of (orderData.items || [])) {
      if (item.mode === 'rent' && item.rentalStartDate && item.rentalEndDate) {
        await this.createRentalBooking({
          productId: item.productId,
          orderId: id,
          startDate: item.rentalStartDate,
          endDate: item.rentalEndDate,
          renterName: orderData.customerName,
          renterPhone: orderData.customerPhone
        });
      }
    }

    return { order, orderCode };
  }

  async updateOrderStatus(id, { status, depositStatus }) {
    const order = this.orders.find(o => o.id === id);
    if (!order) return null;
    if (status) order.status = status;
    if (depositStatus) order.depositStatus = depositStatus;
    if (status === 'completed' && !depositStatus) order.depositStatus = 'refunded';
    return order;
  }

  async getReviews(productId = null) {
    if (productId) return this.reviews.filter(r => r.productId === productId);
    return this.reviews;
  }

  async createReview(data) {
    const rev = {
      id: data.id || `rev-${Date.now()}`,
      productId: data.productId,
      userId: data.userId || 'user-anon',
      userName: data.userName || 'Khách hàng',
      userAvatar: data.userAvatar || '',
      rating: Number(data.rating),
      comment: data.comment,
      type: data.type || 'rent',
      createdAt: new Date().toISOString()
    };
    this.reviews.unshift(rev);
    return rev;
  }

  async getMessages(conversationId) {
    return this.messages.filter(m => m.conversationId === conversationId);
  }

  async createMessage(data) {
    const msg = {
      id: data.id || `msg-${Date.now()}`,
      conversationId: data.conversationId,
      senderId: data.senderId,
      senderName: data.senderName,
      senderAvatar: data.senderAvatar || '',
      content: data.content,
      imageUrl: data.imageUrl || null,
      isRead: false,
      createdAt: new Date().toISOString()
    };
    this.messages.push(msg);
    return msg;
  }

  async getAdminStats() {
    const totalRevenue = this.orders.reduce((sum, o) => sum + (Number(o.totalBuyPrice || 0) + Number(o.totalRentFee || 0)), 0);
    const totalDepositHeld = this.orders.filter(o => o.depositStatus === 'held').reduce((sum, o) => sum + Number(o.totalDeposit || 0), 0);
    return {
      totalProducts: this.products.length,
      totalOrders: this.orders.length,
      totalRentals: this.rentals.length,
      totalUsers: 3,
      totalRevenue,
      totalDepositHeld,
      ordersByStatus: {
        pending: this.orders.filter(o => o.status === 'pending').length,
        confirmed: this.orders.filter(o => o.status === 'confirmed').length,
        shipping: this.orders.filter(o => o.status === 'shipping').length,
        renting: this.orders.filter(o => o.status === 'renting').length,
        completed: this.orders.filter(o => o.status === 'completed').length,
        cancelled: this.orders.filter(o => o.status === 'cancelled').length
      }
    };
  }
}
