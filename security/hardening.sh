#!/bin/bash
# ==============================================================================
# HỆ THỐNG QUẢN LÝ CÔNG VIỆC (TASK TRACKER) - BTL ĐỀ 24
# SCRIPT TỰ ĐỘNG HÓA TĂNG CƯỜNG BẢO MẬT HỆ THỐNG (OS & SERVER HARDENING)
# ==============================================================================

set -e

echo "=========================================================="
echo "🛡️  BẮT ĐẦU QUÁ TRÌNH TĂNG CƯỜNG BẢO MẬT (HARDENING) MÁY ẢO..."
echo "=========================================================="

if [ "$EUID" -ne 0 ]; then
  echo "❌ Vui lòng chạy script với quyền root hoặc sudo: sudo bash $0"
  exit 1
fi

# 1. Cập nhật hệ thống
echo "📦 1. Đang cập nhật gói phần mềm hệ thống..."
apt-get update -y && apt-get upgrade -y
apt-get install -y ufw fail2ban curl unattended-upgrades

# 2. Cấu hình Tường lửa UFW (Firewall Hardening)
echo "🧱 2. Cấu hình UFW Firewall - Giới hạn cổng truy cập..."
ufw default deny incoming
ufw default allow outgoing

# Chỉ mở các cổng dịch vụ thiết yếu
ufw allow 22/tcp comment 'SSH Secure Port'
ufw allow 80/tcp comment 'Nginx HTTP Web'
ufw allow 443/tcp comment 'Nginx HTTPS Web'

# Kích hoạt UFW không hỏi lại prompt
ufw --force enable
ufw status verbose

# 3. Cấu hình SSH Hardening (/etc/ssh/sshd_config.d/99-hardening.conf)
echo "🔑 3. Tăng cường bảo mật dịch vụ SSH..."
mkdir -p /etc/ssh/sshd_config.d/
cat << 'EOF' > /etc/ssh/sshd_config.d/99-hardening.conf
# SSH Hardening Configuration
PermitRootLogin no
MaxAuthTries 4
LoginGraceTime 30
PasswordAuthentication yes
X11Forwarding no
MaxSessions 5
ClientAliveInterval 300
ClientAliveCountMax 2
EOF

systemctl restart ssh || systemctl restart sshd

# 4. Cấu hình Fail2ban chống tấn công Brute-force SSH
echo "🛑 4. Cấu hình Fail2ban giám sát và chặn Brute-force..."
cat << 'EOF' > /etc/fail2ban/jail.local
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5

[sshd]
enabled = true
port    = ssh
filter  = sshd
logpath = /var/log/auth.log
maxretry = 3
EOF

systemctl enable fail2ban
systemctl restart fail2ban

# 5. Kernel Network Hardening (sysctl)
echo "⚙️  5. Cấu hình bảo mật Kernel TCP/IP (Sysctl)..."
cat << 'EOF' > /etc/sysctl.d/99-security-hardening.conf
# Chống IP Spoofing
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1

# Bỏ qua ICMP Echo Broadcast (Chống Smurf attack)
net.ipv4.icmp_echo_ignore_broadcasts = 1

# Tắt ICMP redirect (Chống MITM attack)
net.ipv4.conf.all.accept_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0

# Bật SYN Cookies chống TCP SYN Flood
net.ipv4.tcp_syncookies = 1
EOF

sysctl --system > /dev/null 2>&1

echo "=========================================================="
echo "✅ HOÀN TẤT HARDENING HỆ THỐNG MÁY ẢO THÀNH CÔNG!"
echo "   - UFW Firewall: Đã khóa toàn bộ, chỉ mở port 22, 80, 443"
echo "   - SSH: Cấm Root Login, giới hạn MaxAuthTries=4"
echo "   - Fail2ban: Đang hoạt động, chặn IP thử sai SSH > 3 lần"
echo "   - Kernel: Chống SYN Flood, Spoofing, ICMP Redirects"
echo "=========================================================="
