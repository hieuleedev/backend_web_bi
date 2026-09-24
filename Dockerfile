# ==========================================
# DOCKERFILE CHO BI BI FASHION BACKEND
# ==========================================
FROM node:22-alpine

# Cài đặt curl phục vụ cho Healthcheck
RUN apk add --no-cache curl

# Thiết lập thư mục làm việc
WORKDIR /app

# Copy các file quản lý dependencies để tận dụng Docker layer cache
COPY package.json package-lock.json ./

# Cài đặt dependencies cho môi trường production
RUN npm ci --omit=dev

# Copy toàn bộ mã nguồn
COPY . .

# Tạo thư mục uploads và backups nếu chưa có
RUN mkdir -p uploads backups

# Biến môi trường mặc định
ENV NODE_ENV=production
ENV PORT=5050

# Cổng Backend lắng nghe
EXPOSE 5050

# Healthcheck định kỳ kiểm tra trạng thái hoạt động của server
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:${PORT}/api/health || exit 1

# Lệnh khởi chạy server
CMD ["node", "server.js"]
