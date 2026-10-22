const express = require('express');
const router = express.Router();
const db = require('../db');
const logger = require('../logger');
const { taskCreatedCounter } = require('../metrics');

// 1. Lấy danh sách công việc (có hỗ trợ filter: type, status, priority, search, team_id)
router.get('/', async (req, res) => {
  try {
    const { type, status, priority, search, team_id, assigned_to } = req.query;
    
    let queryText = `
      SELECT t.*, 
             u.full_name AS assigned_user_name, 
             u.email AS assigned_user_email,
             tm.name AS team_name
      FROM tasks t
      LEFT JOIN users u ON t.assigned_to = u.id
      LEFT JOIN teams tm ON t.team_id = tm.id
      WHERE 1=1
    `;
    const params = [];

    if (type) {
      params.push(type);
      queryText += ` AND t.type = $${params.length}`;
    }

    if (status) {
      params.push(status);
      queryText += ` AND t.status = $${params.length}`;
    }

    if (priority) {
      params.push(priority);
      queryText += ` AND t.priority = $${params.length}`;
    }

    if (team_id) {
      params.push(team_id);
      queryText += ` AND t.team_id = $${params.length}`;
    }

    if (assigned_to) {
      params.push(assigned_to);
      queryText += ` AND t.assigned_to = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      queryText += ` AND (t.title ILIKE $${params.length} OR t.description ILIKE $${params.length})`;
    }

    queryText += ` ORDER BY t.created_at DESC`;

    const result = await db.query(queryText, params);
    res.json({
      success: true,
      data: result.rows,
      count: result.rowCount
    });
  } catch (error) {
    logger.error('Lỗi khi lấy danh sách tasks:', { error: error.message });
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy danh sách tasks' });
  }
});

// 2. Lấy chi tiết 1 task
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      `SELECT t.*, 
              u.full_name AS assigned_user_name, 
              u.email AS assigned_user_email,
              tm.name AS team_name
       FROM tasks t
       LEFT JOIN users u ON t.assigned_to = u.id
       LEFT JOIN teams tm ON t.team_id = tm.id
       WHERE t.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy công việc' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Lỗi khi lấy chi tiết task:', { id: req.params.id, error: error.message });
    res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
  }
});

// 3. Tạo mới một task
router.post('/', async (req, res) => {
  try {
    const { title, description, deadline, priority, status, type, team_id, assigned_to } = req.body;

    if (!title || title.trim() === '') {
      return res.status(400).json({ success: false, message: 'Tiêu đề công việc không được để trống' });
    }

    const taskType = type || (team_id ? 'team' : 'personal');
    const taskStatus = status || 'todo';
    const taskPriority = priority || 'medium';

    const insertQuery = `
      INSERT INTO tasks (title, description, deadline, priority, status, type, team_id, assigned_to, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      RETURNING *
    `;

    const values = [
      title.trim(),
      description || '',
      deadline || null,
      taskPriority,
      taskStatus,
      taskType,
      team_id ? parseInt(team_id, 10) : null,
      assigned_to ? parseInt(assigned_to, 10) : null
    ];

    const result = await db.query(insertQuery, values);
    const newTask = result.rows[0];

    // Ghi nhận Prometheus metric
    taskCreatedCounter.inc({ type: taskType });
    logger.info('Tạo công việc mới thành công', { taskId: newTask.id, title: newTask.title, type: taskType, priority: taskPriority });

    res.status(201).json({ success: true, data: newTask, message: 'Tạo công việc thành công' });
  } catch (error) {
    logger.error('Lỗi khi tạo công việc mới:', { error: error.message, body: req.body });
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi tạo công việc' });
  }
});

// 4. Cập nhật trạng thái nhanh (Drag-and-Drop hoặc Status Button)
router.patch('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['todo', 'in_progress', 'review', 'done'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Trạng thái không hợp lệ. Phải là todo, in_progress, review hoặc done' });
    }

    const result = await db.query(
      `UPDATE tasks SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy công việc để cập nhật' });
    }

    logger.info('Cập nhật trạng thái công việc', { taskId: id, newStatus: status });
    res.json({ success: true, data: result.rows[0], message: 'Cập nhật trạng thái thành công' });
  } catch (error) {
    logger.error('Lỗi cập nhật trạng thái:', { id: req.params.id, error: error.message });
    res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
  }
});

// 5. Cập nhật đầy đủ thông tin task
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, deadline, priority, status, type, team_id, assigned_to } = req.body;

    if (!title || title.trim() === '') {
      return res.status(400).json({ success: false, message: 'Tiêu đề không được để trống' });
    }

    const updateQuery = `
      UPDATE tasks 
      SET title = $1, description = $2, deadline = $3, priority = $4, status = $5, 
          type = $6, team_id = $7, assigned_to = $8, updated_at = NOW()
      WHERE id = $9
      RETURNING *
    `;

    const values = [
      title.trim(),
      description || '',
      deadline || null,
      priority || 'medium',
      status || 'todo',
      type || 'personal',
      team_id ? parseInt(team_id, 10) : null,
      assigned_to ? parseInt(assigned_to, 10) : null,
      id
    ];

    const result = await db.query(updateQuery, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy công việc' });
    }

    logger.info('Cập nhật toàn diện công việc', { taskId: id, title });
    res.json({ success: true, data: result.rows[0], message: 'Cập nhật công việc thành công' });
  } catch (error) {
    logger.error('Lỗi khi cập nhật task:', { id: req.params.id, error: error.message });
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi cập nhật' });
  }
});

// 6. Xóa task
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('DELETE FROM tasks WHERE id = $1 RETURNING id, title', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy công việc để xóa' });
    }

    logger.warn('Xóa công việc', { taskId: id, title: result.rows[0].title });
    res.json({ success: true, message: 'Đã xóa công việc thành công' });
  } catch (error) {
    logger.error('Lỗi khi xóa task:', { id: req.params.id, error: error.message });
    res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
  }
});

module.exports = router;
