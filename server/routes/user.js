const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const authenticateToken = require('../middleware/auth');

// 获取当前用户信息
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const [users] = await pool.execute(
      `SELECT u.user_id, u.username, u.real_name, u.phone, u.farm_id,
              r.role_id, r.role_name
       FROM user u
       INNER JOIN role r ON u.role_id = r.role_id
       WHERE u.user_id = ?`,
      [req.user.user_id]
    );

    if (users.length === 0) {
      return res.status(404).json({ message: '用户不存在' });
    }

    res.json(users[0]);
  } catch (error) {
    console.error('获取用户信息错误:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// 退出登录接口
router.post('/logout', authenticateToken, (req, res) => {
  // 前端清除token即可，这里只返回成功
  res.json({ message: '退出成功' });
});

module.exports = router;

