const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const authenticateToken = require('../middleware/auth');

// 获取农场列表
router.get('/list', authenticateToken, async (req, res) => {
  try {
    const { page = 1, pageSize = 10, farm_name, address } = req.query;
    const offset = (page - 1) * pageSize;
    const roleId = req.user.role_id;
    const farmId = req.user.farm_id;

    let query = `
      SELECT f.farm_id, f.farm_name, f.address, f.phone,
             u.user_id as principal_id, u.real_name as principal_name
      FROM farm f
      LEFT JOIN user u ON f.principal_id = u.user_id
      WHERE 1=1
    `;
    const params = [];

    // 数据权限：非超级管理员仅能查询所属farm_id的数据
    if (roleId !== 1) {
      if (!farmId) {
        return res.json({ data: [], total: 0, page, pageSize });
      }
      query += ' AND f.farm_id = ?';
      params.push(farmId);
    }

    // 搜索条件
    if (farm_name) {
      query += ' AND f.farm_name LIKE ?';
      params.push(`%${farm_name}%`);
    }
    if (address) {
      query += ' AND f.address LIKE ?';
      params.push(`%${address}%`);
    }

    query += ' ORDER BY f.farm_id DESC LIMIT ? OFFSET ?';
    params.push(parseInt(pageSize), parseInt(offset));

    const [farms] = await pool.execute(query, params);

    // 获取总数
    let countQuery = `
      SELECT COUNT(*) as total
      FROM farm f
      WHERE 1=1
    `;
    const countParams = [];
    if (roleId !== 1 && farmId) {
      countQuery += ' AND f.farm_id = ?';
      countParams.push(farmId);
    }
    if (farm_name) {
      countQuery += ' AND f.farm_name LIKE ?';
      countParams.push(`%${farm_name}%`);
    }
    if (address) {
      countQuery += ' AND f.address LIKE ?';
      countParams.push(`%${address}%`);
    }

    const [countResult] = await pool.execute(countQuery, countParams);
    const total = countResult[0].total;

    res.json({
      data: farms,
      total,
      page: parseInt(page),
      pageSize: parseInt(pageSize)
    });
  } catch (error) {
    console.error('获取农场列表错误:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// 获取农场详情
router.get('/detail/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const roleId = req.user.role_id;
    const farmId = req.user.farm_id;

    // 数据权限检查
    if (roleId !== 1 && farmId !== parseInt(id)) {
      return res.status(403).json({ message: '无权访问此农场信息' });
    }

    const [farms] = await pool.execute(
      `SELECT f.*, u.real_name as principal_name, u.phone as principal_phone
       FROM farm f
       LEFT JOIN user u ON f.principal_id = u.user_id
       WHERE f.farm_id = ?`,
      [id]
    );

    if (farms.length === 0) {
      return res.status(404).json({ message: '农场不存在' });
    }

    res.json(farms[0]);
  } catch (error) {
    console.error('获取农场详情错误:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// 新增农场（仅超级管理员和农场管理员）
router.post('/create', authenticateToken, async (req, res) => {
  try {
    const { farm_name, address, principal_id, phone } = req.body;
    const roleId = req.user.role_id;

    // 操作权限：仅超级管理员和农场管理员可创建
    if (roleId !== 1 && roleId !== 2) {
      return res.status(403).json({ message: '无权创建农场' });
    }

    if (!farm_name || !address || !principal_id || !phone) {
      return res.status(400).json({ message: '请填写所有必填字段' });
    }

    // 验证负责人是否存在且角色为农场管理员
    const [users] = await pool.execute(
      `SELECT u.user_id, u.role_id, r.role_name
       FROM user u
       INNER JOIN role r ON u.role_id = r.role_id
       WHERE u.user_id = ?`,
      [principal_id]
    );

    if (users.length === 0) {
      return res.status(400).json({ message: '负责人不存在' });
    }

    if (users[0].role_id !== 2) {
      return res.status(400).json({ message: '负责人必须是农场管理员角色' });
    }

    const [result] = await pool.execute(
      'INSERT INTO farm (farm_name, address, principal_id, phone) VALUES (?, ?, ?, ?)',
      [farm_name, address, principal_id, phone]
    );

    res.status(201).json({
      message: '创建成功',
      farm_id: result.insertId
    });
  } catch (error) {
    console.error('创建农场错误:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// 更新农场
router.put('/update/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { farm_name, address, principal_id, phone } = req.body;
    const roleId = req.user.role_id;
    const farmId = req.user.farm_id;

    // 操作权限检查
    if (roleId !== 1 && farmId !== parseInt(id)) {
      return res.status(403).json({ message: '无权修改此农场' });
    }

    const [result] = await pool.execute(
      'UPDATE farm SET farm_name=?, address=?, principal_id=?, phone=? WHERE farm_id=?',
      [farm_name, address, principal_id, phone, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: '农场不存在' });
    }

    res.json({ message: '更新成功' });
  } catch (error) {
    console.error('更新农场错误:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// 删除农场（仅超级管理员）
router.delete('/delete/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const roleId = req.user.role_id;

    // 操作权限：仅超级管理员可删除
    if (roleId !== 1) {
      return res.status(403).json({ message: '无权删除农场' });
    }

    const [result] = await pool.execute('DELETE FROM farm WHERE farm_id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: '农场不存在' });
    }

    res.json({ message: '删除成功' });
  } catch (error) {
    console.error('删除农场错误:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

module.exports = router;

