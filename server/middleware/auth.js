const pool = require('../config/database');
const jwt = require('jsonwebtoken');

// 验证token中间件（增强版：校验角色一致性）
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: '未授权，请先登录' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 验证角色一致性：从数据库查询当前用户的真实角色
    const [users] = await pool.execute(
      `SELECT u.user_id, u.role_id, u.farm_id, r.role_name, u.username, u.real_name
       FROM user u
       INNER JOIN role r ON u.role_id = r.role_id
       WHERE u.user_id = ?`,
      [decoded.user_id]
    );

    if (users.length === 0) {
      return res.status(403).json({ message: '用户不存在' });
    }

    const currentUser = users[0];

    // 校验token中的角色与数据库中的角色是否一致
    if (decoded.role_id !== currentUser.role_id) {
      return res.status(403).json({ message: '角色已变更，请重新登录' });
    }

    // 更新req.user为数据库中的最新信息
    req.user = {
      user_id: currentUser.user_id,
      role_id: currentUser.role_id,
      role_name: currentUser.role_name,
      farm_id: currentUser.farm_id,
      username: currentUser.username,
      real_name: currentUser.real_name
    };
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(403).json({ message: 'token无效' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(403).json({ message: 'token已过期' });
    }
    console.error('权限验证错误:', error);
    return res.status(500).json({ message: '服务器错误' });
  }
};

module.exports = authenticateToken;

