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
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
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

// 10. Phục vụ giao diện tĩnh Frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

// Fallback trang chủ SPA
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
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

setInterval(syncMetricsFromDb, 15000); // Mỗi 15s đồng bộ 1 lần

app.listen(PORT, '0.0.0.0', () => {
  logger.info(`🚀 Máy chủ Task Tracker đang chạy trên http://0.0.0.0:${PORT}`);
  logger.info(`📊 Prometheus metrics endpoint: http://0.0.0.0:${PORT}/metrics`);
  syncMetricsFromDb();
});
