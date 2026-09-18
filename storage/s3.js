import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, '..', 'uploads');

const S3_ENDPOINT = process.env.S3_ENDPOINT || 'https://s3.vn-hcm-1.vietnix.cloud';
const S3_REGION = process.env.S3_REGION || 'us-east-1';
const S3_BUCKET = process.env.S3_BUCKET || process.env.S3_BUCKET_NAME || 'web-bi-images';
const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID || '';
const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY || '';
const S3_PUBLIC_URL_PREFIX = process.env.IMAGE_BASE_URL || process.env.S3_PUBLIC_URL_PREFIX || `${S3_ENDPOINT.replace(/\/$/, '')}/${S3_BUCKET}`;

export const isS3Configured = Boolean(S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY);

let s3Client = null;
if (isS3Configured) {
  try {
    s3Client = new S3Client({
      endpoint: S3_ENDPOINT,
      region: S3_REGION,
      credentials: {
        accessKeyId: S3_ACCESS_KEY_ID,
        secretAccessKey: S3_SECRET_ACCESS_KEY
      },
      forcePathStyle: true // Bắt buộc cho S3 compatible như Vietnix / Ceph / MinIO
    });
    console.log(`☁️ [Vietnix S3 Storage]: Đã kết nối S3 Endpoint: ${S3_ENDPOINT} (Bucket: ${S3_BUCKET})`);
  } catch (err) {
    console.error('❌ [Vietnix S3 Storage]: Lỗi khởi tạo S3 Client:', err.message);
  }
} else {
  console.log(`⚠️ [Vietnix S3 Storage]: Chưa có S3_ACCESS_KEY_ID và S3_SECRET_ACCESS_KEY trong file .env.`);
  console.log(`   👉 Tạm thời file sẽ được lưu cục bộ thư mục uploads/ cho đến khi bạn cấu hình Access Key.`);
}

/**
 * Tải 1 file ảnh lên Vietnix S3 (hoặc fallback về uploads/ cục bộ nếu chưa có key)
 * @param {Buffer} buffer - Dữ liệu file ảnh dạng Buffer
 * @param {string} originalname - Tên file gốc
 * @param {string} mimetype - Định dạng ảnh (vd: image/jpeg, image/png)
 * @param {Object} req - Request object để lấy host trong trường hợp fallback
 * @returns {Promise<{ url: string, key: string, size: number, storage: string }>}
 */
export async function uploadImageFile(buffer, originalname, mimetype = 'image/jpeg', req = null) {
  const ext = (path.extname(originalname) || '.jpg').toLowerCase();
  const key = `products/prod-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;

  if (isS3Configured && s3Client) {
    try {
      const command = new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: mimetype,
        ACL: 'public-read' // Đảm bảo ảnh có quyền truy cập công khai
      });

      await s3Client.send(command);

      const publicUrl = `${S3_PUBLIC_URL_PREFIX}/${key}`;
      return {
        url: publicUrl,
        key,
        bucket: S3_BUCKET,
        size: buffer.length,
        storage: 'vietnix_s3'
      };
    } catch (s3Error) {
      console.error('❌ Lỗi upload lên Vietnix S3:', s3Error);
      throw new Error(`Lỗi tải ảnh lên Vietnix S3: ${s3Error.message}`);
    }
  }

  // Fallback: Lưu vào thư mục uploads cục bộ nếu chưa có Access Key S3
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const filename = path.basename(key);
  const localFilePath = path.join(uploadsDir, filename);
  fs.writeFileSync(localFilePath, buffer);

  const protocol = req?.protocol || 'http';
  const host = req?.get ? req.get('host') : 'localhost:5000';
  const localUrl = `${protocol}://${host}/uploads/${filename}`;

  return {
    url: localUrl,
    key: filename,
    size: buffer.length,
    storage: 'local_disk',
    note: 'Lưu tạm cục bộ vì chưa cung cấp S3_ACCESS_KEY_ID trong .env'
  };
}
