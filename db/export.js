import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function exportSupabaseData() {
  console.log('====================================================');
  console.log('📥 BẮT ĐẦU XUẤT (EXPORT) TOÀN BỘ DỮ LIỆU TỪ SUPABASE');
  console.log('====================================================');

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Thiếu SUPABASE_URL hoặc SUPABASE_KEY trong file .env');
    process.exit(1);
  }

  const client = createClient(supabaseUrl, supabaseKey);
  const tables = ['users', 'products', 'rental_bookings', 'orders', 'reviews', 'messages'];
  const exportData = {
    exportedAt: new Date().toISOString(),
    source: supabaseUrl,
    tables: {}
  };

  const backupDir = path.join(__dirname, '..', 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  for (const table of tables) {
    try {
      console.log(`📦 Đang tải dữ liệu bảng [${table}]...`);
      const { data, error } = await client.from(table).select('*');
      if (error) {
        console.warn(`   ⚠️ Bảng ${table} chưa có dữ liệu hoặc không truy cập được:`, error.message);
        exportData.tables[table] = [];
      } else {
        exportData.tables[table] = data || [];
        console.log(`   ✅ Tải thành công ${data.length} bản ghi từ [${table}]`);
      }
    } catch (err) {
      console.error(`   ❌ Lỗi khi tải bảng ${table}:`, err.message);
      exportData.tables[table] = [];
    }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = path.join(backupDir, `supabase_backup_${timestamp}.json`);
  const latestPath = path.join(backupDir, `latest_backup.json`);

  fs.writeFileSync(jsonPath, JSON.stringify(exportData, null, 2), 'utf8');
  fs.writeFileSync(latestPath, JSON.stringify(exportData, null, 2), 'utf8');

  console.log('----------------------------------------------------');
  console.log(`🎉 ĐÃ XUẤT THÀNH CÔNG TOÀN BỘ DỮ LIỆU VỀ MÁY TÍNH!`);
  console.log(`📁 File backup: ${jsonPath}`);
  console.log(`📁 Bản sao mới nhất: ${latestPath}`);
  console.log('👉 Bạn có thể dùng lệnh `npm run db:import` để nạp dữ liệu này vào PostgreSQL riêng bất kỳ lúc nào.');
  console.log('====================================================');
}

exportSupabaseData();
