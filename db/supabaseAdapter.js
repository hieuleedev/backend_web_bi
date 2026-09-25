import { createClient } from '@supabase/supabase-js';

/**
 * Supabase Database Adapter
 * Đóng gói toàn bộ logic tương tác với Supabase.
 * Khi cần thay thế Supabase, chỉ cần đổi sang Adapter khác (Postgres, MongoDB, MySQL, v.v.)
 * mà KHÔNG CẦN sửa bất kỳ dòng code nào ở server.js / API Routes.
 */
export class SupabaseAdapter {
  constructor(config = {}) {
    const url = config.url || process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://uotzztasrxdxdxunleny.supabase.co';
    const key = config.key || 
      process.env.SUPABASE_SECRET_KEY || 
      process.env.SUPABASE_SERVICE_ROLE_KEY || 
      process.env.SUPABASE_KEY || 
      process.env.SUPABASE_PUBLISHABLE_KEY || 
      process.env.VITE_SUPABASE_ANON_KEY || 
      'sb_publishable_raif2dls9os3gJmZ0aqEcg_b0G_kxBb';
    
    this.client = createClient(url, key);
    this.name = 'Supabase';
  }

  async healthCheck() {
    try {
      const { error } = await this.client.from('products').select('id', { count: 'exact', head: true });
      return { connected: !error, provider: this.name, error: error ? error.message : null };
    } catch (err) {
      return { connected: false, provider: this.name, error: err.message };
    }
  }

  // ==========================================
  // PRODUCTS
  // ==========================================
  async getProducts(filters = {}) {
    const { category, type, status, search, minPrice, maxPrice, limit = 50 } = filters;

    let query = this.client
      .from('products')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(Number(limit));

    if (category && category !== 'all') query = query.eq('category', category);
    if (type && type !== 'all') query = query.in('type', [type, 'both']);
    if (status && status !== 'all') {
      const dbStatus = status === 'approved' ? 'active' : status;
      query = query.eq('status', dbStatus);
    } else if (!status) {
      query = query.eq('status', 'active');
    }
    if (search) query = query.ilike('title', `%${search}%`);
    if (minPrice) query = query.gte('buy_price', Number(minPrice));
    if (maxPrice) query = query.lte('buy_price', Number(maxPrice));

    const { data: products, error } = await query;
    if (error) throw error;

    // Lấy kèm các lịch thuê đang có
    const productIds = (products || []).map(p => p.id);
    const bookingsMap = {};

    if (productIds.length > 0) {
      const { data: bookings } = await this.client
        .from('rental_bookings')
        .select('*')
        .in('product_id', productIds)
        .neq('status', 'cancelled');

      (bookings || []).forEach(b => {
        if (!bookingsMap[b.product_id]) bookingsMap[b.product_id] = [];
        bookingsMap[b.product_id].push({
          id: b.id,
          startDate: b.start_date,
          endDate: b.end_date,
          status: b.status,
          renterName: b.renter_name
        });
      });
    }

    return (products || []).map(p => this._formatProduct(p, bookingsMap[p.id] || []));
  }

  async getProductById(id) {
    const { data: product, error } = await this.client
      .from('products')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !product) return null;

    // Lấy lịch thuê
    const { data: bookings } = await this.client
      .from('rental_bookings')
      .select('*')
      .eq('product_id', id)
      .neq('status', 'cancelled');

    // Lấy đánh giá
    const { data: reviews } = await this.client
      .from('reviews')
      .select('*')
      .eq('product_id', id)
      .order('created_at', { ascending: false });

    return {
      ...this._formatProduct(product, (bookings || []).map(b => ({
        id: b.id,
        startDate: b.start_date,
        endDate: b.end_date,
        status: b.status,
        renterName: b.renter_name
      }))),
      reviews: (reviews || []).map(r => ({
        id: r.id,
        userId: r.user_id,
        userName: r.user_name,
        userAvatar: r.user_avatar,
        rating: r.rating,
        comment: r.comment,
        type: r.type,
        createdAt: r.created_at
      }))
    };
  }

  async createProduct(data) {
    const id = data.id || `prod-${Date.now()}`;
    const payload = {
      id,
      title: data.title,
      description: data.description || '',
      category: data.category || 'dam-dai',
      brand: data.brand || 'Bi Bi Collection',
      type: data.type || 'both',
      status: (data.status === 'approved' || data.status === 'active') ? 'active' : (data.status || 'active'),
      buy_price: data.buyPrice || 0,
      rent_price_1day: data.rentPrice1Day || 0,
      rent_price_3days: data.rentPrice3Days || 0,
      rent_price_7days: data.rentPrice2Days || data.rentPrice7Days || 0,
      deposit: data.deposit || 0,
      sizes: data.sizes || ['S', 'M', 'L'],
      colors: data.colors || ['Trắng'],
      material: data.material || '',
      condition: data.condition || 'Mới 100%',
      featured_image: data.featuredImage,
      images: data.images || [data.featuredImage],
      seller_id: data.sellerId || 'user-seller-1',
      seller_name: data.sellerName || 'Bi Bi Boutique (Linh Bi)',
      seller_avatar: data.sellerAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
      seller_rating: data.sellerRating || 5.0,
      location: data.location || 'Khối 1 - Xã Núi Thành - Thành Phố Đà Nẵng',
      views: 1,
      rating: 5.0,
      reviews_count: 0,
      created_at: new Date().toISOString()
    };

    const { data: created, error } = await this.client.from('products').insert(payload).select().single();
    if (error) throw error;
    return this._formatProduct(created);
  }

  async updateProduct(id, data) {
    const payload = {};
    if (data.title !== undefined) payload.title = data.title;
    if (data.description !== undefined) payload.description = data.description;
    if (data.category !== undefined) payload.category = data.category;
    if (data.brand !== undefined) payload.brand = data.brand;
    if (data.type !== undefined) payload.type = data.type;
    if (data.status !== undefined) payload.status = data.status === 'approved' ? 'active' : data.status;
    if (data.buyPrice !== undefined) payload.buy_price = data.buyPrice;
    if (data.rentPrice1Day !== undefined) payload.rent_price_1day = data.rentPrice1Day;
    if (data.rentPrice2Days !== undefined) payload.rent_price_7days = data.rentPrice2Days;
    else if (data.rentPrice7Days !== undefined) payload.rent_price_7days = data.rentPrice7Days;
    if (data.rentPrice3Days !== undefined) payload.rent_price_3days = data.rentPrice3Days;
    if (data.deposit !== undefined) payload.deposit = data.deposit;
    if (data.sizes !== undefined) payload.sizes = data.sizes;
    if (data.colors !== undefined) payload.colors = data.colors;
    if (data.material !== undefined) payload.material = data.material;
    if (data.condition !== undefined) payload.condition = data.condition;
    if (data.featuredImage !== undefined) payload.featured_image = data.featuredImage;
    if (data.images !== undefined) payload.images = data.images;

    const { data: updated, error } = await this.client.from('products').update(payload).eq('id', id).select().single();
    if (error) throw error;
    return this._formatProduct(updated);
  }

  async deleteProduct(id) {
    const { error } = await this.client.from('products').delete().eq('id', id);
    if (error) throw error;
    return true;
  }

  async incrementViews(id) {
    const { data: prod } = await this.client.from('products').select('views').eq('id', id).single();
    if (prod) {
      await this.client.from('products').update({ views: (prod.views || 0) + 1 }).eq('id', id);
    }
  }

  async toggleProductLike(id) {
    const { data: prod } = await this.client.from('products').select('likes').eq('id', id).single();
    const currentLikes = prod?.likes || 0;
    const newLikes = currentLikes + 1;
    const { data: updated, error } = await this.client
      .from('products')
      .update({ likes: newLikes })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return this._formatProduct(updated);
  }

  // ==========================================
  // RENTALS & CHỐNG TRÙNG LỊCH
  // ==========================================
  async getRentalBookings(productId = null) {
    let query = this.client.from('rental_bookings').select('*').neq('status', 'cancelled');
    if (productId) query = query.eq('product_id', productId);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async checkRentalAvailability(productId, startDate, endDate) {
    const bookings = await this.getRentalBookings(productId);
    const reqStart = new Date(startDate).getTime();
    const reqEnd = new Date(endDate).getTime();

    const conflicts = bookings.filter(b => {
      const bStart = new Date(b.start_date).getTime();
      const bEnd = new Date(b.end_date).getTime();
      return reqStart <= bEnd && reqEnd >= bStart;
    });

    return {
      isAvailable: conflicts.length === 0,
      conflicts: conflicts.map(c => ({
        startDate: c.start_date,
        endDate: c.end_date,
        renterName: c.renter_name
      }))
    };
  }

  async createRentalBooking(data) {
    // Kiểm tra trùng lịch
    const check = await this.checkRentalAvailability(data.productId, data.startDate, data.endDate);
    if (!check.isAvailable) {
      throw new Error('Khoảng thời gian này đã có người thuê trước đó!');
    }

    const id = data.id || `book-${Date.now()}`;
    const payload = {
      id,
      product_id: data.productId,
      order_id: data.orderId || null,
      start_date: data.startDate,
      end_date: data.endDate,
      renter_name: data.renterName || 'Khách hàng',
      renter_phone: data.renterPhone || '',
      status: data.status || 'confirmed',
      note: data.note || '',
      created_at: new Date().toISOString()
    };

    const { data: created, error } = await this.client.from('rental_bookings').insert(payload).select().single();
    if (error) throw error;
    return created;
  }

  async createManyRentalBookings(bookingsList = []) {
    if (!bookingsList.length) return [];
    const { data, error } = await this.client.from('rental_bookings').insert(bookingsList).select();
    if (error) throw error;
    return data;
  }

  async updateRentalBooking(id, updates = {}) {
    const payload = {};
    if (updates.status) payload.status = updates.status;
    if (updates.note !== undefined) payload.note = updates.note;
    if (updates.renterName) payload.renter_name = updates.renterName;
    if (updates.renterPhone) payload.renter_phone = updates.renterPhone;
    if (updates.startDate) payload.start_date = updates.startDate;
    if (updates.endDate) payload.end_date = updates.endDate;

    const { data, error } = await this.client.from('rental_bookings').update(payload).eq('id', id).select().single();
    if (error) throw error;
    return data;
  }

  async getProductCalendar(productId) {
    const { data: product } = await this.client.from('products').select('id, title, featured_image, deposit, rent_price_1day').eq('id', productId).single();
    if (!product) return null;

    const { data: bookings, error } = await this.client
      .from('rental_bookings')
      .select('*')
      .eq('product_id', productId)
      .neq('status', 'cancelled')
      .order('start_date', { ascending: true });

    if (error) throw error;

    // Tạo danh sách từng ngày cụ thể đã bị khóa (dùng để tô màu lịch trên Frontend)
    const blockedDates = [];
    (bookings || []).forEach(b => {
      let current = new Date(b.start_date);
      const end = new Date(b.end_date);
      while (current <= end) {
        blockedDates.push(current.toISOString().split('T')[0]);
        current.setDate(current.getDate() + 1);
      }
    });

    return {
      product,
      totalBookings: (bookings || []).length,
      bookings: (bookings || []).map(b => ({
        id: b.id,
        orderId: b.order_id,
        startDate: b.start_date,
        endDate: b.end_date,
        renterName: b.renter_name,
        renterPhone: b.renter_phone,
        status: b.status,
        note: b.note,
        createdAt: b.created_at
      })),
      blockedDates: [...new Set(blockedDates)]
    };
  }

  async getRenters() {
    const { data: bookings, error } = await this.client
      .from('rental_bookings')
      .select('*, products(id, title, featured_image)')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Nhóm theo số điện thoại khách thuê
    const rentersMap = {};
    (bookings || []).forEach(b => {
      const phone = b.renter_phone || 'Không có SĐT';
      if (!rentersMap[phone]) {
        rentersMap[phone] = {
          renterName: b.renter_name,
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
        orderId: b.order_id,
        productId: b.product_id,
        productTitle: b.products?.title || 'Trang phục',
        productImage: b.products?.featured_image || '',
        startDate: b.start_date,
        endDate: b.end_date,
        status: b.status,
        note: b.note,
        createdAt: b.created_at
      });
    });

    return Object.values(rentersMap);
  }

  async deleteRentalBooking(id) {
    const { error } = await this.client.from('rental_bookings').delete().eq('id', id);
    if (error) throw error;
    return true;
  }

  // ==========================================
  // ORDERS
  // ==========================================
  async getOrders(filters = {}) {
    const { phone, status, search } = filters;
    let query = this.client.from('orders').select('*').order('created_at', { ascending: false });

    if (phone) query = query.eq('customer_phone', phone);
    if (status && status !== 'all') query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;
    let list = (data || []).map(row => this._formatOrder(row));
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(o => 
        (o.customerName && o.customerName.toLowerCase().includes(q)) ||
        (o.customerPhone && o.customerPhone.includes(q)) ||
        (o.code && o.code.toLowerCase().includes(q))
      );
    }
    return list;
  }

  async getOrderById(id) {
    const { data, error } = await this.client.from('orders').select('*').eq('id', id).single();
    if (error || !data) return null;
    return this._formatOrder(data);
  }

  async createOrder(orderData) {
    const id = orderData.id || `ord-${Date.now()}`;
    const orderCode = orderData.orderCode || `BB-${Math.floor(10000 + Math.random() * 90000)}`;

    const payload = {
      id,
      order_code: orderCode,
      customer_name: orderData.customerName,
      customer_phone: orderData.customerPhone,
      shipping_address: orderData.shippingAddress,
      delivery_method: orderData.deliveryMethod || 'shipping',
      payment_method: orderData.paymentMethod || 'cod',
      status: orderData.status || 'pending',
      total_rent_fee: orderData.totalRentFee || orderData.subtotal || 0,
      total_buy_price: orderData.totalBuyPrice || 0,
      total_deposit: orderData.totalDeposit || orderData.depositTotal || 0,
      shipping_fee: orderData.shippingFee ?? 30000,
      deposit_status: (orderData.totalDeposit || orderData.depositTotal || 0) > 0 ? 'held' : 'none',
      items: orderData.items || [],
      note: orderData.note || orderData.notes || '',
      created_at: new Date().toISOString()
    };

    const { data: created, error } = await this.client.from('orders').insert(payload).select().single();
    if (error) throw error;

    // Tự động tạo lịch thuê nếu có item thuê
    const rentalBookings = (orderData.items || [])
      .filter(item => item.mode === 'rent' && item.rentalStartDate && item.rentalEndDate)
      .map(item => ({
        id: `book-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        product_id: item.productId,
        order_id: id,
        start_date: item.rentalStartDate,
        end_date: item.rentalEndDate,
        renter_name: orderData.customerName,
        renter_phone: orderData.customerPhone,
        status: 'confirmed',
        note: `Đơn hàng ${orderCode}`
      }));

    if (rentalBookings.length > 0) {
      await this.createManyRentalBookings(rentalBookings);
    }

    return { order: this._formatOrder(created), orderCode };
  }

  async updateOrderStatus(id, { status, depositStatus, paymentStatus }) {
    const payload = {};
    if (status) payload.status = status;
    if (depositStatus) payload.deposit_status = depositStatus;
    if (paymentStatus) payload.payment_status = paymentStatus;
    if (status === 'completed' && !depositStatus) payload.deposit_status = 'refunded';

    const { data, error } = await this.client.from('orders').update(payload).eq('id', id).select().single();
    if (error) throw error;
    return this._formatOrder(data);
  }

  async updateOrder(id, orderData) {
    const payload = {};
    if (orderData.status !== undefined) payload.status = orderData.status;
    if (orderData.depositStatus !== undefined) payload.deposit_status = orderData.depositStatus;
    if (orderData.paymentStatus !== undefined) payload.payment_status = orderData.paymentStatus;
    if (orderData.customerName !== undefined) payload.customer_name = orderData.customerName;
    if (orderData.customerPhone !== undefined) payload.customer_phone = orderData.customerPhone;
    if (orderData.shippingAddress !== undefined) payload.shipping_address = orderData.shippingAddress;
    if (orderData.notes !== undefined) payload.note = orderData.notes;
    if (orderData.note !== undefined) payload.note = orderData.note;
    if (orderData.items !== undefined) payload.items = orderData.items;

    const { data, error } = await this.client.from('orders').update(payload).eq('id', id).select().single();
    if (error) throw error;
    return this._formatOrder(data);
  }

  async deleteOrder(id) {
    const { error } = await this.client.from('orders').delete().eq('id', id);
    if (error) throw error;
    return true;
  }

  // ==========================================
  // REVIEWS
  // ==========================================
  async getReviews(productId = null) {
    let query = this.client.from('reviews').select('*').order('created_at', { ascending: false });
    if (productId) query = query.eq('product_id', productId);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async createReview(data) {
    const id = data.id || `rev-${Date.now()}`;
    const payload = {
      id,
      product_id: data.productId,
      user_id: data.userId || 'user-anonymous',
      user_name: data.userName || 'Khách Hàng',
      user_avatar: data.userAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
      rating: Number(data.rating),
      comment: data.comment,
      type: data.type || 'rent',
      created_at: new Date().toISOString()
    };

    const { data: created, error } = await this.client.from('reviews').insert(payload).select().single();
    if (error) throw error;

    // Cập nhật rating trung bình của sản phẩm
    const { data: reviews } = await this.client.from('reviews').select('rating').eq('product_id', data.productId);
    if (reviews && reviews.length > 0) {
      const avg = (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1);
      await this.client.from('products').update({
        rating: parseFloat(avg),
        reviews_count: reviews.length
      }).eq('id', data.productId);
    }

    return created;
  }

  // ==========================================
  // MESSAGES
  // ==========================================
  async getMessages(conversationId) {
    const { data, error } = await this.client
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async createMessage(data) {
    const id = data.id || `msg-${Date.now()}`;
    const payload = {
      id,
      conversation_id: data.conversationId,
      sender_id: data.senderId || 'user-buyer-1',
      sender_name: data.senderName || 'Khách hàng',
      sender_avatar: data.senderAvatar || '',
      content: data.content,
      image_url: data.imageUrl || null,
      is_read: false,
      created_at: new Date().toISOString()
    };
    const { data: created, error } = await this.client.from('messages').insert(payload).select().single();
    if (error) throw error;
    return created;
  }

  // ==========================================
  // STATS
  // ==========================================
  async getAdminStats() {
    const [productsRes, ordersRes, rentalsRes, usersRes] = await Promise.all([
      this.client.from('products').select('id', { count: 'exact', head: true }),
      this.client.from('orders').select('*'),
      this.client.from('rental_bookings').select('id', { count: 'exact', head: true }).neq('status', 'cancelled'),
      this.client.from('users').select('id', { count: 'exact', head: true })
    ]);

    const orders = ordersRes.data || [];
    const totalRevenue = orders.reduce((sum, o) => sum + (Number(o.total_buy_price || 0) + Number(o.total_rent_fee || 0)), 0);
    const totalDepositHeld = orders
      .filter(o => o.deposit_status === 'held')
      .reduce((sum, o) => sum + Number(o.total_deposit || 0), 0);

    return {
      totalProducts: productsRes.count || 0,
      totalOrders: orders.length,
      totalRentals: rentalsRes.count || 0,
      totalUsers: usersRes.count || 0,
      totalRevenue,
      totalDepositHeld,
      ordersByStatus: {
        pending: orders.filter(o => o.status === 'pending').length,
        confirmed: orders.filter(o => o.status === 'confirmed').length,
        shipping: orders.filter(o => o.status === 'shipping').length,
        renting: orders.filter(o => o.status === 'renting').length,
        completed: orders.filter(o => o.status === 'completed').length,
        cancelled: orders.filter(o => o.status === 'cancelled').length
      }
    };
  }

  // Helper chuyển đổi format DB sang Frontend format
  _formatProduct(p, bookings = []) {
    return {
      id: p.id,
      title: p.title,
      description: p.description,
      category: p.category,
      gender: p.gender || 'women',
      brand: p.brand || 'Bi Bi Collection',
      type: p.type,
      status: p.status === 'active' ? 'approved' : p.status,
      buyPrice: p.buy_price,
      rentPrice1Day: p.rent_price_1day,
      rentPrice2Days: (p.rent_price_7days && p.rent_price_7days < p.rent_price_3days)
        ? p.rent_price_7days
        : (p.rent_price_2days || (p.rent_price_3days ? Math.round((p.rent_price_3days * 0.85) / 1000) * 1000 : 0)),
      rentPrice3Days: p.rent_price_3days,
      rentPrice7Days: p.rent_price_7days,
      deposit: p.deposit,
      sizes: p.sizes || ['S', 'M', 'L'],
      colors: p.colors || ['Trắng'],
      material: p.material,
      condition: p.condition,
      featuredImage: p.featured_image,
      images: p.images || [p.featured_image],
      sellerId: p.seller_id,
      sellerName: p.seller_name,
      sellerAvatar: p.seller_avatar,
      sellerRating: p.seller_rating,
      location: p.location,
      views: p.views || 0,
      rating: p.rating || 5.0,
      reviewsCount: p.reviews_count || 0,
      createdAt: p.created_at,
      bookedDates: bookings
    };
  }

  // Helper chuyển đổi format DB sang Frontend format cho Đơn Hàng
  _formatOrder(row) {
    if (!row) return null;
    const totalBuy = Number(row.total_buy_price || 0);
    const totalRent = Number(row.total_rent_fee || 0);
    const totalDeposit = Number(row.total_deposit || 0);
    const shippingFee = Number(row.shipping_fee ?? 30000);
    const calculatedTotal = totalBuy + totalRent + totalDeposit + shippingFee;

    return {
      id: row.id,
      code: row.order_code,
      orderCode: row.order_code,
      userId: row.user_id || 'guest',
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      customerEmail: row.customer_email || '',
      shippingAddress: row.shipping_address,
      deliveryMethod: row.delivery_method || 'shipping',
      paymentMethod: row.payment_method || 'cod',
      paymentStatus: row.payment_status || 'unpaid',
      items: row.items || [],
      subtotal: totalBuy + totalRent,
      depositTotal: totalDeposit,
      shippingFee,
      serviceFee: 0,
      totalAmount: calculatedTotal,
      status: row.status,
      depositStatus: row.deposit_status || 'none',
      notes: row.note || row.notes || '',
      createdAt: row.created_at,
      updatedAt: row.updated_at || row.created_at
    };
  }

  // ==========================================
  // USERS & PROFILE
  // ==========================================
  async getUsers() {
    const { data, error } = await this.client.from('users').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(u => this._formatUser(u));
  }

  async getUserById(id) {
    const { data, error } = await this.client.from('users').select('*').eq('id', id).single();
    if (error || !data) return null;
    return this._formatUser(data);
  }

  async createUser(userData) {
    const id = userData.id || `user-${Date.now()}`;
    const payload = {
      id,
      name: userData.name,
      email: userData.email,
      phone: userData.phone || '',
      avatar: userData.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
      role: userData.role || 'buyer',
      rating: 5.0,
      rating_count: 0,
      location: userData.location || 'Việt Nam',
      bio: userData.bio || '',
      created_at: new Date().toISOString()
    };

    const { data, error } = await this.client.from('users').insert(payload).select().single();
    if (error) throw error;
    return this._formatUser(data);
  }

  async updateUser(id, userData) {
    const payload = {};
    if (userData.name !== undefined) payload.name = userData.name;
    if (userData.email !== undefined) payload.email = userData.email;
    if (userData.phone !== undefined) payload.phone = userData.phone;
    if (userData.avatar !== undefined) payload.avatar = userData.avatar;
    if (userData.location !== undefined) payload.location = userData.location;
    if (userData.bio !== undefined) payload.bio = userData.bio;
    if (userData.role !== undefined) payload.role = userData.role;

    const { data, error } = await this.client.from('users').update(payload).eq('id', id).select().single();
    if (error) throw error;
    return this._formatUser(data);
  }

  _formatUser(u) {
    if (!u) return null;
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone || '',
      avatar: u.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
      role: u.role || 'buyer',
      rating: Number(u.rating || 5.0),
      ratingCount: u.rating_count || 0,
      location: u.location || 'Việt Nam',
      joinedDate: u.created_at ? u.created_at.split('T')[0] : '2026-01-01',
      bio: u.bio || ''
    };
  }

  // ==========================================
  // CONVERSATIONS
  // ==========================================
  async getConversations(userId = null) {
    const { data: messages, error } = await this.client
      .from('messages')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const convMap = new Map();
    for (const msg of (messages || [])) {
      if (!convMap.has(msg.conversation_id)) {
        convMap.set(msg.conversation_id, {
          id: msg.conversation_id,
          participants: [
            {
              id: msg.sender_id,
              name: msg.sender_name,
              avatar: msg.sender_avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
              role: 'buyer'
            },
            {
              id: 'user-seller-1',
              name: 'Bi Bi Boutique (Linh Bi)',
              avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
              role: 'seller'
            }
          ],
          lastMessage: msg.content,
          lastMessageTime: msg.created_at,
          unreadCount: msg.is_read ? 0 : 1
        });
      }
    }

    return Array.from(convMap.values());
  }
}
