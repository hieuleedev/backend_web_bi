import dotenv from 'dotenv';
import { SupabaseAdapter } from './supabaseAdapter.js';
import { PostgresAdapter } from './postgresAdapter.js';
import { MemoryAdapter } from './memoryAdapter.js';

dotenv.config();

/**
 * DATABASE SERVICE FACTORY
 * 
 * Cho phép đổi cơ sở dữ liệu cực kỳ dễ dàng qua biến môi trường DB_PROVIDER trong .env:
 * - DB_PROVIDER=supabase  (Mặc định: Sử dụng Supabase JS Client)
 * - DB_PROVIDER=postgres  (Sử dụng PostgreSQL thuần qua pg Pool - Neon, Render, AWS RDS, Docker, v.v.)
 * - DB_PROVIDER=memory    (Chạy cục bộ in-memory RAM, không cần kết nối mạng hay database ngoài)
 * 
 * Nếu tương lai muốn đổi sang MongoDB, MySQL, Prisma, TypeORM:
 * 👉 Chỉ cần tạo thêm 1 file `mongoAdapter.js` và đăng ký vào đây!
 * 👉 Toàn bộ file server.js và các API endpoints KHÔNG CẦN SỬA 1 DÒNG NÀO!
 */

const providerType = (process.env.DB_PROVIDER || 'supabase').toLowerCase();

let activeDbAdapter;

switch (providerType) {
  case 'postgres':
  case 'postgresql':
    console.log('📦 [Database Provider]: Sử dụng PostgreSQL Direct (pg pool)');
    activeDbAdapter = new PostgresAdapter();
    break;

  case 'memory':
  case 'mock':
    console.log('📦 [Database Provider]: Sử dụng In-Memory RAM Store (Offline/Dev)');
    activeDbAdapter = new MemoryAdapter();
    break;

  case 'supabase':
  default:
    console.log('📦 [Database Provider]: Sử dụng Supabase Client');
    activeDbAdapter = new SupabaseAdapter();
    break;
}

export const db = activeDbAdapter;
export default db;
