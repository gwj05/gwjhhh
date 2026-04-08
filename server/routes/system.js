const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const bcrypt = require('bcryptjs');
const authenticateToken = require('../middleware/auth');

function parsePage(req) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 10));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function canManageUsers(user) {
  return user?.role_id === 1 || user?.role_id === 2;
}

function validateCreateRole(actorRoleId, targetRoleId) {
  if (actorRoleId === 1) return [1, 2, 3].includes(Number(targetRoleId));
  if (actorRoleId === 2) return Number(targetRoleId) === 3;
  return false;
}

async function getUserById(userId) {
  const [rows] = await pool.execute(
    `SELECT u.user_id, u.role_id, u.farm_id, u.username, u.real_name
     FROM user u WHERE u.user_id = ?`,
    [userId]
  );
  return rows?.[0] || null;
}

function assertFarmManagerScope(actor, targetUser) {
  if (actor.role_id !== 2) return;
  if (!actor.farm_id || String(actor.farm_id) !== String(targetUser.farm_id)) {
    const e = new Error('无权管理该用户');
    e.status = 403;
    throw e;
  }
  if (Number(targetUser.role_id) !== 3) {
    const e = new Error('农场管理员仅可管理普通用户');
    e.status = 403;
    throw e;
  }
}

// 获取用户列表（超级管理员 + 农场管理员）
router.get('/users', authenticateToken, async (req, res) => {
  try {
    const { username, real_name, role_id, farm_id } = req.query;
    const actor = req.user;
    const { page, pageSize, offset } = parsePage(req);

    if (!canManageUsers(actor)) {
      return res.status(403).json({ message: '无权访问' });
    }

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
    let countQuery = `SELECT COUNT(*) as total FROM user u WHERE 1=1`;
    const countParams = [];

    if (actor.role_id === 2) {
      query += ` AND ((u.farm_id = ? AND u.role_id = 3) OR u.user_id = ?)`;
      params.push(actor.farm_id, actor.user_id);
      countQuery += ` AND ((u.farm_id = ? AND u.role_id = 3) OR u.user_id = ?)`;
      countParams.push(actor.farm_id, actor.user_id);
    } else if (farm_id) {
      query += ' AND u.farm_id = ?';
      params.push(farm_id);
      countQuery += ' AND u.farm_id = ?';
      countParams.push(farm_id);
    }

    if (username) {
      query += ' AND u.username LIKE ?';
      params.push(`%${username}%`);
      countQuery += ' AND u.username LIKE ?';
      countParams.push(`%${username}%`);
    }
    if (real_name) {
      query += ' AND u.real_name LIKE ?';
      params.push(`%${real_name}%`);
      countQuery += ' AND u.real_name LIKE ?';
      countParams.push(`%${real_name}%`);
    }
    if (role_id) {
      query += ' AND u.role_id = ?';
      params.push(role_id);
      countQuery += ' AND u.role_id = ?';
      countParams.push(role_id);
    }

    query += ' ORDER BY u.user_id DESC LIMIT ? OFFSET ?';
    params.push(pageSize, offset);

    const [users] = await pool.execute(query, params);
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

// 创建用户（超级管理员 + 农场管理员）
router.post('/users', authenticateToken, async (req, res) => {
  try {
    const { username, password, real_name, phone, role_id, farm_id } = req.body;
    const actor = req.user;

    if (!canManageUsers(actor)) {
      return res.status(403).json({ message: '无权创建用户' });
    }

    if (!username || !password || !real_name || !phone || !role_id) {
      return res.status(400).json({ message: '请填写所有必填字段' });
    }
    if (!validateCreateRole(actor.role_id, role_id)) {
      return res.status(403).json({ message: '当前角色无权创建该角色用户' });
    }

    const targetFarmId = actor.role_id === 1 ? (farm_id || null) : actor.farm_id;
    if (!targetFarmId) return res.status(400).json({ message: '创建用户必须绑定所属农场' });
    const [farmRows] = await pool.execute('SELECT farm_id FROM farm WHERE farm_id = ?', [targetFarmId]);
    if (!farmRows?.length) return res.status(400).json({ message: '所属农场不存在' });

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
      [Number(role_id), username, hashedPassword, real_name, phone, targetFarmId]
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

// 更新用户（超级管理员 + 农场管理员）
router.put('/users/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { username, password, real_name, phone, role_id, farm_id } = req.body;
    const actor = req.user;

    if (!canManageUsers(actor)) {
      return res.status(403).json({ message: '无权更新用户' });
    }
    const targetUser = await getUserById(id);
    if (!targetUser) return res.status(404).json({ message: '用户不存在' });
    if (Number(targetUser.user_id) === Number(actor.user_id)) {
      return res.status(400).json({ message: '不允许在此处修改当前登录用户' });
    }
    assertFarmManagerScope(actor, targetUser);

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
    if (role_id && actor.role_id === 1) {
      updateFields.push('role_id = ?');
      params.push(role_id);
    }
    if (farm_id !== undefined && actor.role_id === 1) {
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

    if (result.affectedRows === 0) return res.status(404).json({ message: '用户不存在' });

    res.json({ message: '更新成功' });
  } catch (error) {
    console.error('更新用户错误:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// 删除用户（超级管理员 + 农场管理员）
router.delete('/users/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const actor = req.user;

    if (!canManageUsers(actor)) {
      return res.status(403).json({ message: '无权删除用户' });
    }

    // 不能删除自己
    if (parseInt(id) === actor.user_id) {
      return res.status(400).json({ message: '不能删除自己' });
    }
    const targetUser = await getUserById(id);
    if (!targetUser) return res.status(404).json({ message: '用户不存在' });
    assertFarmManagerScope(actor, targetUser);

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
    const actor = req.user;
    if (![1, 2].includes(actor.role_id)) {
      return res.status(403).json({ message: '无权访问' });
    }

    let sql = 'SELECT role_id, role_name FROM role';
    if (actor.role_id === 2) {
      sql += ' WHERE role_id = 3';
    }
    sql += ' ORDER BY role_id';
    const [roles] = await pool.execute(sql);
    res.json(roles);
  } catch (error) {
    console.error('获取角色列表错误:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// 权限配置（用于系统管理展示）
router.get('/permissions', authenticateToken, async (req, res) => {
  try {
    if (req.user.role_id !== 1) return res.status(403).json({ message: '无权访问' });
    res.json([
      { role_id: 1, role_name: '管理员', data_scope: '全部农场', user_manage: '全部用户', can_switch_global_farm: true },
      { role_id: 2, role_name: '运维人员', data_scope: '所属农场', user_manage: '仅普通用户（所属农场）', can_switch_global_farm: false },
      { role_id: 3, role_name: '普通用户', data_scope: '所属农场/个人数据', user_manage: '无', can_switch_global_farm: false }
    ]);
  } catch (error) {
    console.error('获取权限配置错误:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

module.exports = router;

