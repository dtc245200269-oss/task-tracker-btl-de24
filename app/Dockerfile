# ==========================================================
# TaskTracker API & Frontend Dockerfile
# Security Hardening: Multi-stage, Minimal Alpine, Non-root user
# ==========================================================

# 1. Base Stage
FROM node:20-alpine AS base

# Cài đặt curl cho healthcheck và dumb-init để quản lý tiến trình PID 1 an toàn
RUN apk add --no-cache curl dumb-init

WORKDIR /app

# Copy file định nghĩa dependencies trước để tận dụng Docker layer cache
COPY package*.json ./

# Cài đặt dependencies (bao gồm tối ưu hóa production)
RUN npm ci --only=production && npm cache clean --force

# Copy toàn bộ mã nguồn ứng dụng
COPY . .

# Tạo thư mục logs và gán quyền cho non-root user (node:node)
RUN mkdir -p /app/logs && chown -R node:node /app

# Chuyển sang người dùng không có quyền root để bảo mật hệ thống (Hardening)
USER node

# Expose cổng ứng dụng (Chỉ giao tiếp nội bộ container network)
EXPOSE 3000

# Thiết lập biến môi trường mặc định
ENV NODE_ENV=production \
    PORT=3000

# Docker Healthcheck giám sát trạng thái ứng dụng
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Sử dụng dumb-init làm init system xử lý tín hiệu SIGTERM/SIGINT đúng cách
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Khởi chạy server
CMD ["node", "src/server.js"]
