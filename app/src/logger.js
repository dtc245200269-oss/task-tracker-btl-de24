const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Đảm bảo thư mục logs tồn tại
const logDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Format structured JSON log để Loki và LogQL dễ dàng phân tích cú pháp
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'task-tracker-api', environment: process.env.NODE_ENV || 'production' },
  transports: [
    // Ghi ra file log để promtail đọc trực tiếp
    new winston.transports.File({ 
      filename: path.join(logDir, 'error.log'), 
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 5
    }),
    new winston.transports.File({ 
      filename: path.join(logDir, 'app.log'),
      maxsize: 10485760,
      maxFiles: 5
    }),
    // Xuất ra Console stdout/stderr để Docker container logger thu thập
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'HH:mm:ss' }),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length > 2 ? ` ${JSON.stringify(meta)}` : '';
          return `[${timestamp}] [${level}]: ${message}${metaStr}`;
        })
      )
    })
  ]
});

module.exports = logger;
