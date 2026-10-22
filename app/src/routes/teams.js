const express = require('express');
const router = express.Router();
const db = require('../db');
const logger = require('../logger');

// 1. Lấy danh sách nhóm và số lượng thành viên
router.get('/', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT tm.id, tm.name, tm.description, tm.created_at,
             COUNT(DISTINCT tmb.user_id) AS member_count,
             COUNT(DISTINCT tsk.id) AS task_count
      FROM teams tm
      LEFT JOIN team_members tmb ON tm.id = tmb.team_id
      LEFT JOIN tasks tsk ON tm.id = tsk.team_id
      GROUP BY tm.id, tm.name, tm.description, tm.created_at
      ORDER BY tm.id ASC
    `);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Lỗi khi lấy danh sách teams:', { error: error.message });
    res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
  }
});

// 2. Tạo nhóm mới
router.post('/', async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || name.trim() === '') {
      return res.status(400).json({ success: false, message: 'Tên nhóm không được để trống' });
    }

    const result = await db.query(
      `INSERT INTO teams (name, description, created_at) VALUES ($1, $2, NOW()) RETURNING *`,
      [name.trim(), description || '']
    );

    logger.info('Tạo nhóm mới thành công', { teamId: result.rows[0].id, name });
    res.status(201).json({ success: true, data: result.rows[0], message: 'Tạo nhóm thành công' });
  } catch (error) {
    logger.error('Lỗi khi tạo nhóm mới:', { error: error.message });
    res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
  }
});

// 3. Lấy danh sách users trong hệ thống
router.get('/users/all', async (req, res) => {
  try {
    const result = await db.query(`SELECT id, username, full_name, email, role, avatar_url FROM users ORDER BY id ASC`);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Lỗi khi lấy danh sách users:', { error: error.message });
    res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
  }
});

// 4. Lấy danh sách thành viên của 1 nhóm
router.get('/:id/members', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      `SELECT u.id, u.username, u.full_name, u.email, u.role, tmb.role AS team_role, tmb.joined_at
       FROM team_members tmb
       JOIN users u ON tmb.user_id = u.id
       WHERE tmb.team_id = $1
       ORDER BY tmb.joined_at ASC`,
      [id]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Lỗi khi lấy danh sách thành viên nhóm:', { teamId: req.params.id, error: error.message });
    res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
  }
});

module.exports = router;
