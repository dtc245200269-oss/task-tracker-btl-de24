#!/bin/bash
# Script tự động tạo chứng chỉ SSL tự ký (Self-signed Certificate) trên Linux/Ubuntu
set -e

SSL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/ssl"
mkdir -p "$SSL_DIR"

echo "🔐 Đang khởi tạo chứng chỉ SSL tự ký cho Nginx Reverse Proxy..."
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout "$SSL_DIR/nginx.key" \
  -out "$SSL_DIR/nginx.crt" \
  -subj "/C=VN/ST=Hanoi/L=Hanoi/O=TaskTracker/OU=DevOps/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,DNS:tasktracker.local,IP:127.0.0.1"

chmod 600 "$SSL_DIR/nginx.key"
chmod 644 "$SSL_DIR/nginx.crt"
echo "✅ Đã tạo chứng chỉ SSL thành công tại $SSL_DIR/"
