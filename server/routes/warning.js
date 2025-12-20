const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const authenticateToken = require('../middleware/auth');

// 获取预警消息列表（支持分页和筛选）
router.get('/list', authenticateToken, async (req, res) => {
  try {
    const { page = 1, pageSize = 10, farm_id, handle_status } = req.query;
    const roleId = req.user.role_id;
    const userFarmId = req.user.farm_id;
    const userId = req.user.user_id;

    const offset = (page - 1) * pageSize;

    // 构建查询条件
    const limitClause = `LIMIT ${Number(pageSize)} OFFSET ${Number(offset)}`;
    let query = `
      SELECT 
        ce.exception_id,
        ce.exception_type,
        ce.exception_time,
        ce.exception_detail,
        ce.warning_level,
        ce.scroll_sort,
        ce.handle_status,
        ce.video_url,
        c.crop_type,
        c.plant_area,
        md.device_name,
        md.install_location,
        f.farm_name,
        CASE WHEN wr.id IS NOT NULL THEN 1 ELSE 0 END as is_read
      FROM crop_exception ce
      INNER JOIN crop c ON ce.crop_id = c.crop_id
      INNER JOIN monitor_device md ON ce.device_id = md.device_id
      INNER JOIN farm f ON c.farm_id = f.farm_id
      LEFT JOIN warning_read wr ON ce.exception_id = wr.warning_id AND wr.user_id = ?
      WHERE 1=1
    `;
    const params = [userId];

    // 数据权限：非超级管理员仅能查询所属farm_id的数据
    if (roleId !== 1) {
      if (!userFarmId) {
        return res.json({ data: [], total: 0, page: parseInt(page), pageSize: parseInt(pageSize) });
      }
      query += ' AND f.farm_id = ?';
      params.push(userFarmId);
    } else if (farm_id) {
      // 超级管理员可以按farm_id筛选
      query += ' AND f.farm_id = ?';
      params.push(farm_id);
    }

    // 处理状态筛选
    if (handle_status) {
      query += ' AND ce.handle_status = ?';
      params.push(handle_status);
    }

    // 排序：按scroll_sort降序，然后按exception_time降序
    query += ` ORDER BY ce.scroll_sort DESC, ce.exception_time DESC ${limitClause}`;

    const [warnings] = await pool.execute(query, params);

    // 获取总数
    let countQuery = `
      SELECT COUNT(*) as total
      FROM crop_exception ce
      INNER JOIN crop c ON ce.crop_id = c.crop_id
      INNER JOIN farm f ON c.farm_id = f.farm_id
      WHERE 1=1
    `;
    const countParams = [];

    if (roleId !== 1) {
      if (userFarmId) {
        countQuery += ' AND f.farm_id = ?';
        countParams.push(userFarmId);
      } else {
        return res.json({ data: [], total: 0, page: parseInt(page), pageSize: parseInt(pageSize) });
      }
    } else if (farm_id) {
      countQuery += ' AND f.farm_id = ?';
      countParams.push(farm_id);
    }

    if (handle_status) {
      countQuery += ' AND ce.handle_status = ?';
      countParams.push(handle_status);
    }

    const [countResult] = await pool.execute(countQuery, countParams);
    const total = countResult[0].total;

    res.json({
      data: warnings,
      total,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      hasMore: offset + warnings.length < total
    });
  } catch (error) {
    console.error('获取预警列表错误:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// 标记预警为已读
router.post('/read/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.user_id;

    // 检查预警是否存在
    const [exceptions] = await pool.execute(
      'SELECT exception_id FROM crop_exception WHERE exception_id = ?',
      [id]
    );

    if (exceptions.length === 0) {
      return res.status(404).json({ message: '预警不存在' });
    }

    // 插入或更新已读记录（使用INSERT ... ON DUPLICATE KEY UPDATE）
    await pool.execute(
      `INSERT INTO warning_read (warning_id, user_id, read_time) 
       VALUES (?, ?, NOW())
       ON DUPLICATE KEY UPDATE read_time = NOW()`,
      [id, userId]
    );

    res.json({ message: '标记已读成功' });
  } catch (error) {
    console.error('标记已读错误:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// 批量标记预警为已读
router.post('/read-batch', authenticateToken, async (req, res) => {
  try {
    const { warning_ids } = req.body;
    const userId = req.user.user_id;

    if (!Array.isArray(warning_ids) || warning_ids.length === 0) {
      return res.status(400).json({ message: '请提供预警ID列表' });
    }

    // 批量插入已读记录
    const values = warning_ids.map(id => [id, userId]);
    const placeholders = values.map(() => '(?, NOW())').join(', ');
    const flatValues = values.flat();

    await pool.execute(
      `INSERT INTO warning_read (warning_id, user_id, read_time) 
       VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE read_time = NOW()`,
      flatValues
    );

    res.json({ message: '批量标记已读成功', count: warning_ids.length });
  } catch (error) {
    console.error('批量标记已读错误:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// 获取未读预警数量
router.get('/unread-count', authenticateToken, async (req, res) => {
  try {
    const roleId = req.user.role_id;
    const userFarmId = req.user.farm_id;
    const userId = req.user.user_id;

    let query = `
      SELECT COUNT(*) as count
      FROM crop_exception ce
      INNER JOIN crop c ON ce.crop_id = c.crop_id
      INNER JOIN farm f ON c.farm_id = f.farm_id
      LEFT JOIN warning_read wr ON ce.exception_id = wr.warning_id AND wr.user_id = ?
      WHERE wr.id IS NULL
    `;
    const params = [userId];

    // 数据权限
    if (roleId !== 1 && userFarmId) {
      query += ' AND f.farm_id = ?';
      params.push(userFarmId);
    }

    const [result] = await pool.execute(query, params);
    res.json({ unreadCount: result[0].count });
  } catch (error) {
    console.error('获取未读数量错误:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

module.exports = router;

