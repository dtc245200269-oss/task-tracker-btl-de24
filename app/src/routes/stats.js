const express = require('express');
const router = express.Router();
const db = require('../db');
const logger = require('../logger');
const { taskGauge } = require('../metrics');

// API lấy thống kê tổng quan (Dashboard Summary)
router.get('/summary', async (req, res) => {
  try {
    // 1. Thống kê theo trạng thái
    const statusQuery = `
      SELECT status, COUNT(*)::int AS count
      FROM tasks
      GROUP BY status
    `;
    const statusRes = await db.query(statusQuery);

    // 2. Thống kê theo độ ưu tiên
    const priorityQuery = `
      SELECT priority, COUNT(*)::int AS count
      FROM tasks
      GROUP BY priority
    `;
    const priorityRes = await db.query(priorityQuery);

    // 3. Thống kê cá nhân vs nhóm
    const typeQuery = `
      SELECT type, COUNT(*)::int AS count
      FROM tasks
      GROUP BY type
    `;
    const typeRes = await db.query(typeQuery);

    // 4. Số lượng task quá hạn (overdue: deadline < now và status != 'done')
    const overdueQuery = `
      SELECT COUNT(*)::int AS count
      FROM tasks
      WHERE deadline < NOW() AND status != 'done'
    `;
    const overdueRes = await db.query(overdueQuery);

    // 5. Cập nhật metric Prometheus taskGauge
    const fullBreakdownQuery = `
      SELECT status, type, priority, COUNT(*)::int AS count
      FROM tasks
      GROUP BY status, type, priority
    `;
    const breakdownRes = await db.query(fullBreakdownQuery);
    
    // Reset và set lại metric gauge cho Prometheus
    taskGauge.reset();
    breakdownRes.rows.forEach(row => {
      taskGauge.set(
        { status: row.status, type: row.type, priority: row.priority },
        row.count
      );
    });

    // Tổng số công việc
    const totalTasks = statusRes.rows.reduce((acc, curr) => acc + curr.count, 0);

    res.json({
      success: true,
      data: {
        total: totalTasks,
        overdue: overdueRes.rows[0]?.count || 0,
        byStatus: statusRes.rows,
        byPriority: priorityRes.rows,
        byType: typeRes.rows,
      }
    });
  } catch (error) {
    logger.error('Lỗi khi lấy dữ liệu thống kê:', { error: error.message });
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy thống kê' });
  }
});

module.exports = router;
