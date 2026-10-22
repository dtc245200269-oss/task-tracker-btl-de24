const { Pool } = require('pg');
const logger = require('./logger');

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'taskuser',
  password: process.env.DB_PASSWORD || 'taskpassword123',
  database: process.env.DB_NAME || 'tasktracker_db',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('connect', () => {
  logger.info('Kết nối cơ sở dữ liệu PostgreSQL thành công');
});

pool.on('error', (err) => {
  logger.error('Lỗi kết nối PostgreSQL pool:', { error: err.message, stack: err.stack });
});

// Helper query với logging
const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug('Thực thi truy vấn DB', { text, duration: `${duration}ms`, rows: res.rowCount });
    return res;
  } catch (err) {
    logger.error('Lỗi thực thi truy vấn DB', { text, params, error: err.message });
    throw err;
  }
};

module.exports = {
  pool,
  query,
};
