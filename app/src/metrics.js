const client = require('prom-client');

// Khởi tạo Prometheus Register
const register = new client.Registry();

// Bật các metrics mặc định của Node.js (CPU, RAM, Event Loop, GC)
client.collectDefaultMetrics({
  register,
  prefix: 'nodejs_',
});

// Custom Metrics: Đếm số lượng HTTP Requests
const httpRequestCounter = new client.Counter({
  name: 'http_requests_total',
  help: 'Tổng số lượng HTTP requests đến ứng dụng Task Tracker',
  labelNames: ['method', 'route', 'status_code'],
});
register.registerMetric(httpRequestCounter);

// Custom Metrics: Thời gian xử lý request (Histogram)
const httpRequestDurationHistogram = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Thời gian phản hồi của các HTTP requests (giây)',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});
register.registerMetric(httpRequestDurationHistogram);

// Custom Business Metric: Số lượng công việc hiện tại phân theo trạng thái và loại
const taskGauge = new client.Gauge({
  name: 'task_tracker_tasks_total',
  help: 'Số lượng công việc hiện có trong hệ thống',
  labelNames: ['status', 'type', 'priority'],
});
register.registerMetric(taskGauge);

// Custom Business Metric: Tổng số task đã được tạo từ trước đến nay
const taskCreatedCounter = new client.Counter({
  name: 'task_tracker_created_tasks_total',
  help: 'Tổng số công việc đã được khởi tạo',
  labelNames: ['type'],
});
register.registerMetric(taskCreatedCounter);

// Middleware đo đạc thời gian request và ghi nhận metrics
const metricsMiddleware = (req, res, next) => {
  // Bỏ qua metrics endpoint để tránh tự đo chính nó
  if (req.path === '/metrics' || req.path.startsWith('/public') || req.path.startsWith('/css') || req.path.startsWith('/js')) {
    return next();
  }

  const start = process.hrtime();
  res.on('finish', () => {
    const diff = process.hrtime(start);
    const durationInSeconds = diff[0] + diff[1] / 1e9;
    const route = req.route ? req.baseUrl + req.route.path : req.path;
    const statusCode = res.statusCode.toString();

    httpRequestCounter.inc({
      method: req.method,
      route: route,
      status_code: statusCode,
    });

    httpRequestDurationHistogram.observe(
      {
        method: req.method,
        route: route,
        status_code: statusCode,
      },
      durationInSeconds
    );
  });

  next();
};

module.exports = {
  register,
  httpRequestCounter,
  httpRequestDurationHistogram,
  taskGauge,
  taskCreatedCounter,
  metricsMiddleware,
};
