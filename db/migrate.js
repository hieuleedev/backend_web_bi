import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Pool } = pg;

async function runMigration() {
  console.log('====================================================');
  console.log('🔄 BẮT ĐẦU KHỞI TẠO BẢNG DATABASE (POSTGRESQL / SUPABASE)');
  console.log('====================================================');

  const connectionString = process.env.DATABASE_URL || 
    `postgres://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASSWORD || 'password'}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || 'postgres'}`;

  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  const pool = new Pool({
    connectionString,
    ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost') ? { rejectUnauthorized: false } : false
  });

  try {
    const client = await pool.connect();
    console.log('✅ Đã kết nối thành công tới Database:', pool.options.connectionString ? 'Custom URL' : `${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}`);

    console.log('⚙️ Đang thực thi tạo các bảng (users, categories, products, rental_bookings, orders, reviews, messages, bank_configs)...');
    await client.query(sql);

    console.log('🎉 KHỞI TẠO THÀNH CÔNG 100%! Tất cả các bảng đã sẵn sàng với cấu trúc chuẩn y như Supabase.');
    console.log('----------------------------------------------------');
    console.log('👉 Các bảng đã tạo:');
    console.log('   1. users           - Tài khoản & Khách hàng');
    console.log('   2. categories      - Danh mục trang phục');
    console.log('   3. products        - Mẫu váy & Quần áo');
    console.log('   4. rental_bookings - Lịch đặt thuê từng ngày');
    console.log('   5. orders          - Đơn hàng mua & thuê (kèm JSONB items)');
    console.log('   6. reviews         - Đánh giá & nhận xét');
    console.log('   7. messages        - Tin nhắn trò chuyện realtime');
    console.log('   8. bank_configs    - Cấu hình tài khoản VietQR');
    console.log('====================================================');

    client.release();
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('❌ Lỗi khi khởi tạo database:', err.message);
    console.log('\n💡 Hướng dẫn:');
    console.log('   1. Đảm bảo bạn đã cài đặt PostgreSQL hoặc chạy qua Docker/Neon/Railway.');
    console.log('   2. Cấu hình chuỗi DATABASE_URL trong file .env');
    console.log('   Ví dụ: DATABASE_URL=postgres://postgres:password@localhost:5432/bibi_fashion\n');
    await pool.end();
    process.exit(1);
  }
}

runMigration();
