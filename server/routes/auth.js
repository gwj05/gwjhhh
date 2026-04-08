const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
// 注册接口（仅允许注册普通用户角色）
router.post('/register', async (req, res) => {
  try {
    const { username, password, real_name, phone, farm_id } = req.body;
    // 验证必填字段
    if (!username || !password || !real_name || !phone) {
      return res.status(400).json({ message: '请填写所有必填字段' });
    }
    // 注册接口仅允许创建普通用户角色（role_id=3）
    const role_id = 3;
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
    // 插入用户（固定为普通用户角色）
    const [result] = await pool.execute(
      'INSERT INTO user (role_id, username, password, real_name, phone, farm_id) VALUES (?, ?, ?, ?, ?, ?)',
      [role_id, username, hashedPassword, real_name, phone, farm_id || null]
    );
    res.status(201).json({
      message: '注册成功',
      user_id: result.insertId
    });
  } catch (error) {
    console.error('注册错误:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});
// 登录接口
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: '请输入用户名和密码' });
    }
    // 查询用户信息（包括角色信息）
    const [users] = await pool.execute(
      `SELECT u.user_id, u.username, u.password, u.real_name, u.phone, u.farm_id,
              r.role_id, r.role_name
       FROM user u
       INNER JOIN role r ON u.role_id = r.role_id
       WHERE u.username = ?`,
      [username]
    );
    if (users.length === 0) {
      return res.status(401).json({ message: '用户名或密码错误' });
    }
    const user = users[0];
    // 验证密码
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: '用户名或密码错误' });
    }
    // 生成JWT token
    const token = jwt.sign(
      {
        user_id: user.user_id,
        username: user.username,
        role_id: user.role_id,
        role_name: user.role_name
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    // 返回用户信息（不包含密码）
    res.json({
      message: '登录成功',
      token,
      user: {
        user_id: user.user_id,
        username: user.username,
        real_name: user.real_name,
        phone: user.phone,
        role_id: user.role_id,
        role_name: user.role_name,
        farm_id: user.farm_id
      }
    });
  } catch (error) {
    console.error('登录错误:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// 获取所有角色列表（仅返回普通用户角色，用于注册）
router.get('/roles', async (req, res) => {
  try {
    // 注册时只返回普通用户角色
    const [roles] = await pool.execute('SELECT role_id, role_name FROM role WHERE role_id = 3');
    res.json(roles);
  } catch (error) {
    console.error('获取角色列表错误:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

module.exports = router;

