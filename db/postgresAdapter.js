import pkg from 'pg';
const { Pool } = pkg;

/**
 * PostgreSQL Direct Adapter
 * Sử dụng thư viện 'pg' tiêu chuẩn kết nối trực tiếp với bất kỳ database PostgreSQL nào
 * (Local, Neon, Supabase Postgres, AWS RDS, Render, Railway, v.v.)
 * Không phụ thuộc vào Supabase JS Client hay vendor lock-in!
 */
export class PostgresAdapter {
  constructor(config = {}) {
    const connectionString = config.connectionString || process.env.DATABASE_URL;
    
    if (connectionString) {
      this.pool = new Pool({
        connectionString,
        ssl: { rejectUnauthorized: false }
      });
    } else {
      this.pool = new Pool({
        user: config.user || process.env.DB_USER || 'postgres',
        host: config.host || process.env.DB_HOST || 'db.uotzztasrxdxdxunleny.supabase.co',
        database: config.database || process.env.DB_NAME || 'postgres',
        password: config.password || process.env.DB_PASSWORD || 'P@ssw0rd@#$_Hieudev',
        port: Number(config.port || process.env.DB_PORT || 5432),
        ssl: { rejectUnauthorized: false }
      });
    }

    this.name = 'PostgreSQL Direct (pg)';
  }

  async healthCheck() {
    try {
      const res = await this.pool.query('SELECT 1 as alive');
      return { connected: res.rows.length > 0, provider: this.name };
    } catch (err) {
      return { connected: false, provider: this.name, error: err.message };
    }
  }

  // ==========================================
  // PRODUCTS
  // ==========================================
  async getProducts(filters = {}) {
    const { category, type, status, search, minPrice, maxPrice, limit = 50 } = filters;
    const conditions = [];
    const values = [];
    let idx = 1;

    if (category && category !== 'all') {
      conditions.push(`category = $${idx++}`);
      values.push(category);
    }
    if (type && type !== 'all') {
      conditions.push(`type IN ($${idx++}, 'both')`);
      values.push(type);
    }
    if (status) {
      conditions.push(`status = $${idx++}`);
      values.push(status);
    } else {
      conditions.push(`status = 'active'`);
    }
    if (search) {
      conditions.push(`title ILIKE $${idx++}`);
      values.push(`%${search}%`);
    }
    if (minPrice) {
      conditions.push(`buy_price >= $${idx++}`);
      values.push(Number(minPrice));
    }
    if (maxPrice) {
      conditions.push(`buy_price <= $${idx++}`);
      values.push(Number(maxPrice));
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT * FROM public.products ${whereClause} ORDER BY created_at DESC LIMIT $${idx}`;
    values.push(Number(limit));

    const { rows: products } = await this.pool.query(sql, values);

    // Lấy kèm lịch thuê
    const productIds = products.map(p => p.id);
    let bookingsMap = {};
    if (productIds.length > 0) {
      const { rows: bookings } = await this.pool.query(
        `SELECT * FROM public.rental_bookings WHERE product_id = ANY($1) AND status != 'cancelled'`,
        [productIds]
      );
      bookings.forEach(b => {
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

    return products.map(p => this._formatProduct(p, bookingsMap[p.id] || []));
  }

  async getProductById(id) {
    const { rows } = await this.pool.query(`SELECT * FROM public.products WHERE id = $1 LIMIT 1`, [id]);
    if (rows.length === 0) return null;
    const product = rows[0];

    const { rows: bookings } = await this.pool.query(
      `SELECT * FROM public.rental_bookings WHERE product_id = $1 AND status != 'cancelled'`,
      [id]
    );

    const { rows: reviews } = await this.pool.query(
      `SELECT * FROM public.reviews WHERE product_id = $1 ORDER BY created_at DESC`,
      [id]
    );

    return {
      ...this._formatProduct(product, bookings.map(b => ({
        id: b.id,
        startDate: b.start_date,
        endDate: b.end_date,
        status: b.status,
        renterName: b.renter_name
      }))),
      reviews: reviews.map(r => ({
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
    const sql = `
      INSERT INTO public.products (
        id, title, description, category, brand, type, status,
        buy_price, rent_price_1day, rent_price_2days, rent_price_3days, deposit,
        sizes, colors, material, condition, featured_image, images,
        seller_id, seller_name, seller_avatar, seller_rating, location,
        views, rating, reviews_count, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12,
        $13, $14, $15, $16, $17, $18,
        $19, $20, $21, $22, $23,
        $24, $25, $26, NOW()
      ) RETURNING *
    `;
    const values = [
      id, data.title, data.description || '', data.category || 'dam-dai', data.brand || 'Bi Bi Collection', data.type || 'both', data.status || 'active',
      data.buyPrice || 0, data.rentPrice1Day || 0, data.rentPrice2Days || 0, data.rentPrice3Days || 0, data.deposit || 0,
      data.sizes || ['S', 'M', 'L'], data.colors || ['Trắng'], data.material || '', data.condition || 'Mới 100%', data.featuredImage, data.images || [data.featuredImage],
      data.sellerId || 'user-seller-1', data.sellerName || 'Bi Bi Boutique (Linh Bi)', data.sellerAvatar || '', data.sellerRating || 5.0, data.location || 'Đà Nẵng',
      1, 5.0, 0
    ];
    const { rows } = await this.pool.query(sql, values);
    return this._formatProduct(rows[0]);
  }

  async updateProduct(id, data) {
    const updates = [];
    const values = [];
    let idx = 1;

    const mapping = {
      title: 'title', description: 'description', category: 'category', brand: 'brand', type: 'type',
      buyPrice: 'buy_price', rentPrice1Day: 'rent_price_1day', rentPrice2Days: 'rent_price_2days',
      rentPrice3Days: 'rent_price_3days', deposit: 'deposit', sizes: 'sizes', colors: 'colors',
      material: 'material', condition: 'condition', featuredImage: 'featured_image', images: 'images'
    };

    for (const [key, col] of Object.entries(mapping)) {
      if (data[key] !== undefined) {
        updates.push(`${col} = $${idx++}`);
        values.push(data[key]);
      }
    }
    if (data.status !== undefined) {
      updates.push(`status = $${idx++}`);
      values.push(data.status === 'approved' ? 'active' : data.status);
    }

    if (updates.length === 0) return this.getProductById(id);

    values.push(id);
    const sql = `UPDATE public.products SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`;
    const { rows } = await this.pool.query(sql, values);
    return rows.length > 0 ? this._formatProduct(rows[0]) : null;
  }

  async deleteProduct(id) {
    await this.pool.query(`DELETE FROM public.products WHERE id = $1`, [id]);
    return true;
  }

  async incrementViews(id) {
    await this.pool.query(`UPDATE public.products SET views = COALESCE(views, 0) + 1 WHERE id = $1`, [id]);
  }

  // ==========================================
  // RENTALS & CHỐNG TRÙNG LỊCH
  // ==========================================
  async getRentalBookings(productId = null) {
    let sql = `SELECT * FROM public.rental_bookings WHERE status != 'cancelled'`;
    const values = [];
    if (productId) {
      sql += ` AND product_id = $1`;
      values.push(productId);
    }
    const { rows } = await this.pool.query(sql, values);
    return rows;
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
    const check = await this.checkRentalAvailability(data.productId, data.startDate, data.endDate);
    if (!check.isAvailable) {
      throw new Error('Khoảng thời gian này đã có người thuê trước đó!');
    }

    const id = data.id || `book-${Date.now()}`;
    const sql = `
      INSERT INTO public.rental_bookings (id, product_id, order_id, start_date, end_date, renter_name, renter_phone, status, note, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      RETURNING *
    `;
    const values = [id, data.productId, data.orderId || null, data.startDate, data.endDate, data.renterName || 'Khách hàng', data.renterPhone || '', data.status || 'confirmed', data.note || ''];
    const { rows } = await this.pool.query(sql, values);
    return rows[0];
  }

  async createManyRentalBookings(list = []) {
    for (const item of list) {
      await this.createRentalBooking(item);
    }
    return list;
  }

  async updateRentalBooking(id, updates = {}) {
    const fields = [];
    const values = [];
    let idx = 1;

    if (updates.status) { fields.push(`status = $${idx++}`); values.push(updates.status); }
    if (updates.note !== undefined) { fields.push(`note = $${idx++}`); values.push(updates.note); }
    if (updates.renterName) { fields.push(`renter_name = $${idx++}`); values.push(updates.renterName); }
    if (updates.renterPhone) { fields.push(`renter_phone = $${idx++}`); values.push(updates.renterPhone); }
    if (updates.startDate) { fields.push(`start_date = $${idx++}`); values.push(updates.startDate); }
    if (updates.endDate) { fields.push(`end_date = $${idx++}`); values.push(updates.endDate); }

    if (fields.length === 0) return null;
    values.push(id);
    const sql = `UPDATE public.rental_bookings SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`;
    const { rows } = await this.pool.query(sql, values);
    return rows[0];
  }

  async getProductCalendar(productId) {
    const { rows: prodRows } = await this.pool.query(`SELECT id, title, featured_image, deposit, rent_price_1day, rent_price_2days, rent_price_3days FROM public.products WHERE id = $1`, [productId]);
    if (prodRows.length === 0) return null;

    const { rows: bookings } = await this.pool.query(
      `SELECT * FROM public.rental_bookings WHERE product_id = $1 AND status != 'cancelled' ORDER BY start_date ASC`,
      [productId]
    );

    const blockedDates = [];
    bookings.forEach(b => {
      let current = new Date(b.start_date);
      const end = new Date(b.end_date);
      while (current <= end) {
        blockedDates.push(current.toISOString().split('T')[0]);
        current.setDate(current.getDate() + 1);
      }
    });

    return {
      product: prodRows[0],
      totalBookings: bookings.length,
      bookings: bookings.map(b => ({
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
    const sql = `
      SELECT b.*, p.title as product_title, p.featured_image as product_image
      FROM public.rental_bookings b
      LEFT JOIN public.products p ON b.product_id = p.id
      ORDER BY b.created_at DESC
    `;
    const { rows: bookings } = await this.pool.query(sql);

    const rentersMap = {};
    bookings.forEach(b => {
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
        productTitle: b.product_title || 'Trang phục',
        productImage: b.product_image || '',
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
    await this.pool.query(`DELETE FROM public.rental_bookings WHERE id = $1`, [id]);
    return true;
  }

  // ==========================================
  // ORDERS
  // ==========================================
  async getOrders(filters = {}) {
    const { phone, status } = filters;
    const conditions = [];
    const values = [];
    let idx = 1;

    if (phone) {
      conditions.push(`customer_phone = $${idx++}`);
      values.push(phone);
    }
    if (status) {
      conditions.push(`status = $${idx++}`);
      values.push(status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT * FROM public.orders ${whereClause} ORDER BY created_at DESC`;
    const { rows } = await this.pool.query(sql, values);
    return rows;
  }

  async getOrderById(id) {
    const { rows } = await this.pool.query(`SELECT * FROM public.orders WHERE id = $1 LIMIT 1`, [id]);
    return rows.length > 0 ? rows[0] : null;
  }

  async createOrder(orderData) {
    const id = orderData.id || `ord-${Date.now()}`;
    const orderCode = orderData.orderCode || `BB-${Math.floor(10000 + Math.random() * 90000)}`;

    const sql = `
      INSERT INTO public.orders (
        id, order_code, customer_name, customer_phone, shipping_address,
        delivery_method, payment_method, status, total_rent_fee, total_buy_price,
        total_deposit, shipping_fee, deposit_status, items, note, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, 'pending',
        $8, $9, $10, $11, $12, $13, $14, NOW()
      ) RETURNING *
    `;
    const values = [
      id, orderCode, orderData.customerName, orderData.customerPhone, orderData.shippingAddress,
      orderData.deliveryMethod || 'standard', orderData.paymentMethod || 'vietqr',
      orderData.totalRentFee || 0, orderData.totalBuyPrice || 0, orderData.totalDeposit || 0,
      orderData.shippingFee ?? 30000, (orderData.totalDeposit || 0) > 0 ? 'held' : 'none',
      JSON.stringify(orderData.items || []), orderData.note || ''
    ];

    const { rows } = await this.pool.query(sql, values);
    const created = rows[0];

    // Thêm các lịch thuê vào bảng rental_bookings
    for (const item of (orderData.items || [])) {
      if (item.mode === 'rent' && item.rentalStartDate && item.rentalEndDate) {
        await this.createRentalBooking({
          id: `book-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          productId: item.productId,
          orderId: id,
          startDate: item.rentalStartDate,
          endDate: item.rentalEndDate,
          renterName: orderData.customerName,
          renterPhone: orderData.customerPhone,
          status: 'confirmed',
          note: `Đơn hàng ${orderCode}`
        });
      }
    }

    return { order: created, orderCode };
  }

  async updateOrderStatus(id, { status, depositStatus }) {
    const updates = [];
    const values = [];
    let idx = 1;

    const statusMap = { rented: 'renting', preparing: 'confirmed' };
    const mappedStatus = status ? (statusMap[status] || status) : undefined;

    if (mappedStatus) {
      updates.push(`status = $${idx++}`);
      values.push(mappedStatus);
    }
    if (depositStatus) {
      updates.push(`deposit_status = $${idx++}`);
      values.push(depositStatus);
    }
    if ((status === 'completed' || mappedStatus === 'completed') && !depositStatus) {
      updates.push(`deposit_status = 'refunded'`);
    }

    values.push(id);
    const sql = `UPDATE public.orders SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`;
    const { rows } = await this.pool.query(sql, values);
    return rows.length > 0 ? rows[0] : null;
  }

  // ==========================================
  // REVIEWS
  // ==========================================
  async getReviews(productId = null) {
    let sql = `SELECT * FROM public.reviews`;
    const values = [];
    if (productId) {
      sql += ` WHERE product_id = $1`;
      values.push(productId);
    }
    sql += ` ORDER BY created_at DESC`;
    const { rows } = await this.pool.query(sql, values);
    return rows;
  }

  async createReview(data) {
    const id = data.id || `rev-${Date.now()}`;
    const sql = `
      INSERT INTO public.reviews (id, product_id, user_id, user_name, user_avatar, rating, comment, type, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      RETURNING *
    `;
    const values = [id, data.productId, data.userId || 'user-anon', data.userName || 'Khách hàng', data.userAvatar || '', Number(data.rating), data.comment, data.type || 'rent'];
    const { rows } = await this.pool.query(sql, values);

    // Cập nhật rating sản phẩm
    const { rows: stats } = await this.pool.query(
      `SELECT AVG(rating)::numeric(3,2) as avg_rating, COUNT(*) as count FROM public.reviews WHERE product_id = $1`,
      [data.productId]
    );
    if (stats.length > 0) {
      await this.pool.query(
        `UPDATE public.products SET rating = $1, reviews_count = $2 WHERE id = $3`,
        [stats[0].avg_rating, stats[0].count, data.productId]
      );
    }

    return rows[0];
  }

  // ==========================================
  // MESSAGES
  // ==========================================
  async getMessages(conversationId) {
    const { rows } = await this.pool.query(
      `SELECT * FROM public.messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
      [conversationId]
    );
    return rows;
  }

  async createMessage(data) {
    const id = data.id || `msg-${Date.now()}`;
    const sql = `
      INSERT INTO public.messages (id, conversation_id, sender_id, sender_name, sender_avatar, content, image_url, is_read, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, false, NOW())
      RETURNING *
    `;
    const values = [id, data.conversationId, data.senderId, data.senderName, data.senderAvatar || '', data.content, data.imageUrl || null];
    const { rows } = await this.pool.query(sql, values);
    return rows[0];
  }

  // ==========================================
  // STATS
  // ==========================================
  async getAdminStats() {
    const { rows: prodCount } = await this.pool.query(`SELECT COUNT(*) as count FROM public.products`);
    const { rows: orderCount } = await this.pool.query(`SELECT COUNT(*) as count FROM public.orders`);
    const { rows: orders } = await this.pool.query(`SELECT status, total_buy_price, total_rent_fee, total_deposit, deposit_status FROM public.orders`);
    const { rows: rentals } = await this.pool.query(`SELECT COUNT(*) as count FROM public.rental_bookings WHERE status != 'cancelled'`);

    const totalRevenue = orders.reduce((sum, o) => sum + (Number(o.total_buy_price || 0) + Number(o.total_rent_fee || 0)), 0);
    const totalDepositHeld = orders.filter(o => o.deposit_status === 'held').reduce((sum, o) => sum + Number(o.total_deposit || 0), 0);

    return {
      totalProducts: Number(prodCount[0].count),
      totalOrders: Number(orderCount[0].count),
      totalRentals: Number(rentals[0].count),
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
      buyPrice: Number(p.buy_price || 0),
      rentPrice1Day: Number(p.rent_price_1day || 0),
      rentPrice2Days: Number(p.rent_price_2days || 0),
      rentPrice3Days: Number(p.rent_price_3days || 0),
      deposit: Number(p.deposit || 0),
      sizes: p.sizes || ['S', 'M', 'L'],
      colors: p.colors || ['Trắng'],
      material: p.material,
      condition: p.condition,
      featuredImage: p.featured_image,
      images: p.images || [p.featured_image],
      sellerId: p.seller_id,
      sellerName: p.seller_name,
      sellerAvatar: p.seller_avatar,
      sellerRating: Number(p.seller_rating || 5.0),
      location: p.location,
      views: Number(p.views || 0),
      rating: Number(p.rating || 5.0),
      reviewsCount: Number(p.reviews_count || 0),
      createdAt: p.created_at,
      bookedDates: bookings
    };
  }
}
