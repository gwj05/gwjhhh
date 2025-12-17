const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const bcrypt = require('bcryptjs');
const authenticateToken = require('../middleware/auth');

// 获取用户列表（仅超级管理员）
router.get('/users', authenticateToken, async (req, res) => {
  try {
    const { page = 1, pageSize = 10, username, real_name, role_id } = req.query;
    const roleId = req.user.role_id;

    // 操作权限：仅超级管理员可查看
    if (roleId !== 1) {
      return res.status(403).json({ message: '无权访问' });
    }

    const offset = (page - 1) * pageSize;
    let query = `
      SELECT u.user_id, u.username, u.real_name, u.phone, u.farm_id,
             r.role_id, r.role_name,
             f.farm_name
      FROM user u
      INNER JOIN role r ON u.role_id = r.role_id
      LEFT JOIN farm f ON u.farm_id = f.farm_id
      WHERE 1=1
    `;
    const params = [];

    if (username) {
      query += ' AND u.username LIKE ?';
      params.push(`%${username}%`);
    }
    if (real_name) {
      query += ' AND u.real_name LIKE ?';
      params.push(`%${real_name}%`);
    }
    if (role_id) {
      query += ' AND u.role_id = ?';
      params.push(role_id);
    }

    query += ' ORDER BY u.user_id DESC LIMIT ? OFFSET ?';
    params.push(parseInt(pageSize), parseInt(offset));

    const [users] = await pool.execute(query, params);

    // 获取总数
    let countQuery = `
      SELECT COUNT(*) as total
      FROM user u
      WHERE 1=1
    `;
    const countParams = [];
    if (username) {
      countQuery += ' AND u.username LIKE ?';
      countParams.push(`%${username}%`);
    }
    if (real_name) {
      countQuery += ' AND u.real_name LIKE ?';
      countParams.push(`%${real_name}%`);
    }
    if (role_id) {
      countQuery += ' AND u.role_id = ?';
      countParams.push(role_id);
    }

    const [countResult] = await pool.execute(countQuery, countParams);
    const total = countResult[0].total;

    res.json({
      data: users,
      total,
      page: parseInt(page),
      pageSize: parseInt(pageSize)
    });
  } catch (error) {
    console.error('获取用户列表错误:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// 创建用户（仅超级管理员）
router.post('/users', authenticateToken, async (req, res) => {
  try {
    const { username, password, real_name, phone, role_id, farm_id } = req.body;
    const roleId = req.user.role_id;

    // 操作权限：仅超级管理员可创建用户
    if (roleId !== 1) {
      return res.status(403).json({ message: '无权创建用户' });
    }

    if (!username || !password || !real_name || !phone || !role_id) {
      return res.status(400).json({ message: '请填写所有必填字段' });
    }

    // 检查用户名是否已存在
    const [existingUsers] = await pool.execute(
      'SELECT user_id FROM user WHERE username = ?',
      [username]
    );

    if (existingUsers.length > 0) {
      return res.status(400).json({ message: '用户名已存在' });
    }

    // 密码加密
    const hashedPassword = await bcrypt.hash(password, 10);

    // 插入用户
    const [result] = await pool.execute(
      'INSERT INTO user (role_id, username, password, real_name, phone, farm_id) VALUES (?, ?, ?, ?, ?, ?)',
      [role_id, username, hashedPassword, real_name, phone, farm_id || null]
    );

    res.status(201).json({
      message: '创建成功',
      user_id: result.insertId
    });
  } catch (error) {
    console.error('创建用户错误:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// 更新用户（仅超级管理员）
router.put('/users/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { username, password, real_name, phone, role_id, farm_id } = req.body;
    const roleId = req.user.role_id;

    // 操作权限：仅超级管理员可更新用户
    if (roleId !== 1) {
      return res.status(403).json({ message: '无权更新用户' });
    }

    let updateFields = [];
    let params = [];

    if (username) {
      updateFields.push('username = ?');
      params.push(username);
    }
    if (real_name) {
      updateFields.push('real_name = ?');
      params.push(real_name);
    }
    if (phone) {
      updateFields.push('phone = ?');
      params.push(phone);
    }
    if (role_id) {
      updateFields.push('role_id = ?');
      params.push(role_id);
    }
    if (farm_id !== undefined) {
      updateFields.push('farm_id = ?');
      params.push(farm_id || null);
    }
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updateFields.push('password = ?');
      params.push(hashedPassword);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ message: '没有要更新的字段' });
    }

    params.push(id);

    const [result] = await pool.execute(
      `UPDATE user SET ${updateFields.join(', ')} WHERE user_id = ?`,
      params
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: '用户不存在' });
    }

    res.json({ message: '更新成功' });
  } catch (error) {
    console.error('更新用户错误:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// 删除用户（仅超级管理员）
router.delete('/users/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const roleId = req.user.role_id;

    // 操作权限：仅超级管理员可删除用户
    if (roleId !== 1) {
      return res.status(403).json({ message: '无权删除用户' });
    }

    // 不能删除自己
    if (parseInt(id) === req.user.user_id) {
      return res.status(400).json({ message: '不能删除自己' });
    }

    const [result] = await pool.execute('DELETE FROM user WHERE user_id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: '用户不存在' });
    }

    res.json({ message: '删除成功' });
  } catch (error) {
    console.error('删除用户错误:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// 获取角色列表
router.get('/roles', authenticateToken, async (req, res) => {
  try {
    const roleId = req.user.role_id;

    // 仅超级管理员可查看
    if (roleId !== 1) {
      return res.status(403).json({ message: '无权访问' });
    }

    const [roles] = await pool.execute('SELECT role_id, role_name FROM role ORDER BY role_id');
    res.json(roles);
  } catch (error) {
    console.error('获取角色列表错误:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

module.exports = router;

