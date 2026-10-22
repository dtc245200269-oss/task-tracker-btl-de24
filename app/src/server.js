require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const logger = require('./logger');
const db = require('./db');
const { register, metricsMiddleware, taskGauge } = require('./metrics');

const taskRoutes = require('./routes/tasks');
const teamRoutes = require('./routes/teams');
const statRoutes = require('./routes/stats');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. Bảo mật: Helmet security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          "https://cdn.tailwindcss.com",
          "https://cdnjs.cloudflare.com",
          "https://cdn.jsdelivr.net",
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://fonts.googleapis.com",
          "https://cdnjs.cloudflare.com",
          "https://cdn.jsdelivr.net",
        ],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
        imgSrc: ["'self'", "data:", "https://images.unsplash.com", "https://ui-avatars.com"],
        connectSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// 2. Bảo mật: CORS
app.use(cors());

// 3. Bảo mật: Giới hạn tần suất request (Rate Limiting) chống spam/DoS
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 1000, // Tối đa 1000 request trên mỗi IP trong 15 phút
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Quá nhiều yêu cầu từ IP của bạn, vui lòng thử lại sau!' },
});
app.use('/api/', apiLimiter);

// 4. Body parsers
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// 5. Prometheus Metrics Middleware
app.use(metricsMiddleware);

// 6. Request Logging Middleware (Ghi nhận request đến logger -> Loki)
app.use((req, res, next) => {
  if (!req.path.startsWith('/metrics') && !req.path.startsWith('/css') && !req.path.startsWith('/js')) {
    logger.info(`HTTP ${req.method} ${req.originalUrl}`, {
      method: req.method,
      url: req.originalUrl,
      ip: req.ip || req.headers['x-forwarded-for'],
      userAgent: req.headers['user-agent'],
    });
  }
  next();
});

// 7. Endpoint Metrics cho Prometheus
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (ex) {
    logger.error('Lỗi khi thu thập metrics:', { error: ex.message });
    res.status(500).end(ex);
  }
});

// 8. Healthcheck endpoint cho Docker
app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'UP', database: 'connected', timestamp: new Date() });
  } catch (err) {
    res.status(503).json({ status: 'DOWN', database: 'disconnected', error: err.message });
  }
});

// 9. API Routes
app.use('/api/tasks', taskRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/stats', statRoutes);

// 10. Phục vụ giao diện tĩnh Frontend (Vô hiệu hóa cache cho HTML để người dùng luôn nhận bản mới nhất)
app.use(express.static(path.join(__dirname, '..', 'public'), {
  dotfiles: 'ignore',
  etag: false,
  maxAge: 0,
  setHeaders: (res, filePath) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    } else if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    }
  }
}));

// Fallback trang chủ SPA (Chỉ dành cho client-side routing, không catch file tĩnh)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.includes('.')) {
    return next();
  }
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// 11. Xử lý 404 cho API
app.use('/api/*', (req, res) => {
  res.status(404).json({ success: false, message: 'API endpoint không tồn tại' });
});

// 12. Global Error Handler
app.use((err, req, res, next) => {
  logger.error('Unhandled Server Error:', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
  });
  res.status(500).json({
    success: false,
    message: 'Đã xảy ra lỗi nội bộ máy chủ',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// Tự động kiểm tra và nạp dữ liệu mẫu ban đầu nếu bảng tasks chưa có dữ liệu
const autoSeedDatabase = async () => {
  try {
    const check = await db.query('SELECT COUNT(*)::int AS count FROM tasks');
    if (check.rows[0].count === 0) {
      logger.info('CSDL chưa có công việc. Đang tự động nạp dữ liệu mẫu ban đầu...');
      
      await db.query(`
        INSERT INTO users (username, full_name, email, role, avatar_url) VALUES
        ('nguyenvan_a', 'Nguyễn Văn A (Nhóm Trưởng)', 'a.nguyen@student.edu.vn', 'leader', 'https://ui-avatars.com/api/?name=Nguyen+Van+A&background=6366f1&color=fff'),
        ('tranthi_b', 'Trần Thị B (DevOps)', 'b.tran@student.edu.vn', 'member', 'https://ui-avatars.com/api/?name=Tran+Thi+B&background=10b981&color=fff'),
        ('le_c', 'Lê Văn C (Backend Dev)', 'c.le@student.edu.vn', 'member', 'https://ui-avatars.com/api/?name=Le+Van+C&background=f59e0b&color=fff'),
        ('pham_d', 'Phạm Hoàng D (QA/Tester)', 'd.pham@student.edu.vn', 'member', 'https://ui-avatars.com/api/?name=Pham+Hoang+D&background=ec4899&color=fff')
        ON CONFLICT (username) DO NOTHING;
      `);

      await db.query(`
        INSERT INTO teams (id, name, description) VALUES
        (1, 'Đội Dự Án Cloud & DevOps', 'Phụ trách cấu hình hạ tầng VMware, Docker, Nginx, Prometheus và Grafana'),
        (2, 'Nhóm Phát Triển Ứng Dụng', 'Xây dựng mã nguồn Node.js Express, giao diện Kanban và API CRUD')
        ON CONFLICT (id) DO NOTHING;
      `);

      await db.query(`
        INSERT INTO tasks (title, description, deadline, priority, status, type, team_id, assigned_to) VALUES
        ('Khởi tạo Repository GitHub và cấu hình SSH', 'Tạo tài khoản GitHub theo MSSV, thêm SSH key để quản lý mã nguồn và thực hiện 3 commit theo quy định đề bài.', NOW() - INTERVAL '1 DAY', 'high', 'done', 'personal', NULL, 1),
        ('Thiết kế cơ sở dữ liệu PostgreSQL & kết nối pgAdmin', 'Viết init.sql tạo bảng users, teams, tasks, indexes và cấu hình service pgadmin trong docker-compose.', NOW() + INTERVAL '1 DAY', 'high', 'done', 'team', 1, 2),
        ('Cấu hình Nginx Reverse Proxy và HTTPS tự ký', 'Thiết lập Nginx định tuyến đến Web App, bật HTTPS SSL self-signed và cấu hình security headers (Commit 1).', NOW() + INTERVAL '2 DAYS', 'high', 'in_progress', 'team', 1, 2),
        ('Tích hợp hệ thống giám sát Prometheus và Grafana', 'Cấu hình scrape endpoint /metrics của App và postgres-exporter, import dashboard theo dõi CPU/RAM/HTTP (Commit 2).', NOW() + INTERVAL '3 DAYS', 'high', 'in_progress', 'team', 1, 1),
        ('Triển khai Loki + Promtail và viết 3 câu truy vấn LogQL', 'Thu thập log tập trung của Docker container và viết truy vấn LogQL lọc error, rate log trên Grafana Explore (Commit 3).', NOW() + INTERVAL '4 DAYS', 'medium', 'todo', 'team', 1, 3),
        ('Thực hiện các biện pháp Hardening bảo mật hệ thống', 'Chạy container non-root, cô lập mạng Docker networks, áp dụng UFW Firewall, Fail2ban và kiểm soát mật khẩu mạnh.', NOW() + INTERVAL '5 DAYS', 'high', 'todo', 'team', 1, 1),
        ('Nghiên cứu tài liệu công nghệ Docker Compose và Nginx', 'Đọc kỹ tài liệu chính thức về reverse proxy, rate-limiting và upstream load balancing.', NOW() - INTERVAL '2 DAYS', 'low', 'done', 'personal', NULL, 3),
        ('Hoàn thiện Báo cáo tổng hợp tối thiểu 10 trang BTL', 'Viết báo cáo đầy đủ bìa sinh viên, mục lục, mô tả kiến trúc, kết quả 6 bước, ảnh chụp minh chứng và đánh giá.', NOW() + INTERVAL '6 DAYS', 'medium', 'todo', 'personal', NULL, 1);
      `);

      logger.info('Tự động nạp dữ liệu mẫu ban đầu thành công!');
    }
  } catch (err) {
    logger.error('Lỗi tự động nạp dữ liệu:', { error: err.message });
  }
};

// Định kỳ cập nhật business metrics vào Prometheus Gauge
const syncMetricsFromDb = async () => {
  try {
    const res = await db.query(`
      SELECT status, type, priority, COUNT(*)::int AS count
      FROM tasks
      GROUP BY status, type, priority
    `);
    taskGauge.reset();
    res.rows.forEach(row => {
      taskGauge.set(
        { status: row.status, type: row.type, priority: row.priority },
        row.count
      );
    });
  } catch (err) {
    // DB có thể chưa khởi động xong khi container app boot trước
  }
};

setInterval(syncMetricsFromDb, 15000);

app.listen(PORT, '0.0.0.0', async () => {
  logger.info(`🚀 Máy chủ Task Tracker đang chạy trên http://0.0.0.0:${PORT}`);
  logger.info(`📊 Prometheus metrics endpoint: http://0.0.0.0:${PORT}/metrics`);
  await autoSeedDatabase();
  syncMetricsFromDb();
});
