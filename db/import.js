import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Pool } = pg;

async function importBackupData() {
  console.log('====================================================');
  console.log('📤 BẮT ĐẦU IMPORT DỮ LIỆU VÀO DATABASE POSTGRESQL');
  console.log('====================================================');

  const connectionString = process.env.DATABASE_URL || 
    `postgres://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASSWORD || 'password'}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || 'postgres'}`;

  const backupFile = process.argv[2] 
    ? path.resolve(process.argv[2]) 
    : path.join(__dirname, '..', 'backups', 'latest_backup.json');

  if (!fs.existsSync(backupFile)) {
    console.error(`❌ Không tìm thấy file backup tại: ${backupFile}`);
    console.log('💡 Hãy chạy lệnh `npm run db:export` trước để tải dữ liệu từ Supabase về.');
    process.exit(1);
  }

  const raw = fs.readFileSync(backupFile, 'utf8');
  const backup = JSON.parse(raw);

  const pool = new Pool({
    connectionString,
    ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost') ? { rejectUnauthorized: false } : false
  });

  try {
    const client = await pool.connect();
    console.log('✅ Đã kết nối tới PostgreSQL Target!');

    // Thứ tự nạp theo ràng buộc khóa ngoại: users -> products -> rental_bookings -> orders -> reviews -> messages
    const sequence = ['users', 'products', 'rental_bookings', 'orders', 'reviews', 'messages'];

    for (const table of sequence) {
      const rows = backup.tables[table] || [];
      if (rows.length === 0) {
        console.log(`ℹ️ Bảng [${table}] không có bản ghi nào để import.`);
        continue;
      }

      console.log(`📥 Đang nạp ${rows.length} bản ghi vào bảng [${table}]...`);

      for (const row of rows) {
        const keys = Object.keys(row);
        const values = Object.values(row).map(val => {
          if (typeof val === 'object' && val !== null) {
            return JSON.stringify(val);
          }
          return val;
        });

        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
        const updateSets = keys.map(k => `"${k}" = EXCLUDED."${k}"`).join(', ');

        const insertQuery = `
          INSERT INTO public."${table}" (${keys.map(k => `"${k}"`).join(', ')})
          VALUES (${placeholders})
          ON CONFLICT (id) DO UPDATE SET ${updateSets};
        `;

        await client.query(insertQuery, values);
      }
      console.log(`   ✅ Bảng [${table}]: Nạp thành công ${rows.length} bản ghi!`);
    }

    console.log('----------------------------------------------------');
    console.log('🎉 TOÀN BỘ DỮ LIỆU ĐÃ ĐƯỢC IMPORT THÀNH CÔNG VÀO POSTGRESQL!');
    console.log('====================================================');

    client.release();
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('❌ Lỗi trong quá trình import dữ liệu:', err.message);
    await pool.end();
    process.exit(1);
  }
}

importBackupData();
