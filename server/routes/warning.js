const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const authenticateToken = require('../middleware/auth');
const {
  ensureSmartWarningSchema,
  insertPushes,
  runInventoryRules
} = require('../lib/smartWarning');

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
        ce.source_type,
        c.crop_type,
        c.crop_name,
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
    const placeholders = values.map(() => '(?, ?, NOW())').join(', ');
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

function assertFarm(user, farmId) {
  if (user.role_id === 1) return;
  if (!user.farm_id || String(user.farm_id) !== String(farmId)) {
    const e = new Error('无权操作该农场');
    e.status = 403;
    throw e;
  }
}

// ---------- 监控设备（聚合列表，便于预警模块专用页）----------
router.get('/devices', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    const { farm_id } = req.query;
    let sql = `
      SELECT md.device_id, md.farm_id, f.farm_name, md.device_name, md.install_location,
             md.device_status, md.monitor_area, md.device_category, md.last_online_time
      FROM monitor_device md
      INNER JOIN farm f ON f.farm_id = md.farm_id
      WHERE 1=1
    `;
    const params = [];
    if (user.role_id !== 1) {
      if (!user.farm_id) return res.json([]);
      sql += ' AND md.farm_id = ?';
      params.push(user.farm_id);
    } else if (farm_id) {
      sql += ' AND md.farm_id = ?';
      params.push(farm_id);
    }
    sql += ' ORDER BY f.farm_name, md.device_id DESC';
    const [rows] = await pool.execute(sql, params);
    res.json(rows || []);
  } catch (error) {
    console.error('warning/devices list:', error);
    res.status(error.status || 500).json({ message: '服务器错误', error: error.message });
  }
});

router.post('/devices', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    if (![1, 2].includes(user.role_id)) return res.status(403).json({ message: '无权限' });
    const { farm_id, device_name, install_location, device_status, monitor_area, device_category } = req.body || {};
    if (!farm_id || !device_name || !install_location || !device_status || !monitor_area) {
      return res.status(400).json({ message: '请填写完整设备信息' });
    }
    assertFarm(user, farm_id);
    const [r] = await pool.execute(
      `INSERT INTO monitor_device
        (farm_id, device_name, install_location, device_status, monitor_area, device_category, last_online_time)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [farm_id, device_name, install_location, device_status, monitor_area, device_category || null]
    );
    res.status(201).json({ message: '创建成功', device_id: r.insertId });
  } catch (error) {
    console.error('warning/devices create:', error);
    res.status(error.status || 500).json({ message: error.message || '服务器错误', error: error.message });
  }
});

router.put('/devices/:deviceId', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    if (![1, 2].includes(user.role_id)) return res.status(403).json({ message: '无权限' });
    const { deviceId } = req.params;
    const { device_name, install_location, device_status, monitor_area, device_category, farm_id } = req.body || {};
    const [rows] = await pool.execute(`SELECT farm_id, device_name FROM monitor_device WHERE device_id = ?`, [deviceId]);
    if (!rows?.length) return res.status(404).json({ message: '设备不存在' });
    assertFarm(user, rows[0].farm_id);
    if (rows[0].device_name === '环境采集终端（系统）' && user.role_id !== 1) {
      return res.status(403).json({ message: '系统环境设备不可修改' });
    }
    const fid = user.role_id === 1 && farm_id ? farm_id : rows[0].farm_id;
    await pool.execute(
      `UPDATE monitor_device SET farm_id=?, device_name=?, install_location=?, device_status=?, monitor_area=?, device_category=?, last_online_time=NOW()
       WHERE device_id=?`,
      [fid, device_name, install_location, device_status, monitor_area, device_category || null, deviceId]
    );
    res.json({ message: '更新成功' });
  } catch (error) {
    console.error('warning/devices update:', error);
    res.status(error.status || 500).json({ message: error.message || '服务器错误', error: error.message });
  }
});

router.delete('/devices/:deviceId', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    if (![1, 2].includes(user.role_id)) return res.status(403).json({ message: '无权限' });
    const { deviceId } = req.params;
    const [rows] = await pool.execute(`SELECT farm_id, device_name FROM monitor_device WHERE device_id = ?`, [deviceId]);
    if (!rows?.length) return res.status(404).json({ message: '设备不存在' });
    if (rows[0].device_name === '环境采集终端（系统）') {
      return res.status(400).json({ message: '系统环境设备不可删除' });
    }
    assertFarm(user, rows[0].farm_id);
    await pool.execute(`DELETE FROM monitor_device WHERE device_id = ?`, [deviceId]);
    res.json({ message: '删除成功' });
  } catch (error) {
    console.error('warning/devices delete:', error);
    res.status(error.status || 500).json({ message: error.message || '服务器错误', error: error.message });
  }
});

// ---------- 作物异常（分页列表增强）----------
router.get('/exceptions', authenticateToken, async (req, res) => {
  try {
    await ensureSmartWarningSchema(pool);
    const user = req.user;
    const { page = 1, pageSize = 10, farm_id, handle_status, exception_type, source_type } = req.query;
    const offset = (Number(page) - 1) * Number(pageSize);
    const lim = Math.min(100, Math.max(1, Number(pageSize) || 10));

    let where = 'WHERE 1=1';
    const params = [];
    if (user.role_id !== 1) {
      if (!user.farm_id) return res.json({ data: [], total: 0, page: Number(page), pageSize: lim });
      where += ' AND c.farm_id = ?';
      params.push(user.farm_id);
    } else if (farm_id) {
      where += ' AND c.farm_id = ?';
      params.push(farm_id);
    }
    if (handle_status) {
      where += ' AND ce.handle_status = ?';
      params.push(handle_status);
    }
    if (exception_type) {
      where += ' AND ce.exception_type = ?';
      params.push(exception_type);
    }
    if (source_type) {
      where += ' AND COALESCE(ce.source_type,\'manual\') = ?';
      params.push(source_type);
    }

    const [cnt] = await pool.execute(
      `SELECT COUNT(*) AS total FROM crop_exception ce
       INNER JOIN crop c ON ce.crop_id = c.crop_id
       INNER JOIN farm f ON c.farm_id = f.farm_id ${where}`,
      params
    );
    const total = cnt?.[0]?.total || 0;

    const [rows] = await pool.execute(
      `SELECT ce.*, c.crop_name, c.plant_area, c.farm_id, f.farm_name, md.device_name
       FROM crop_exception ce
       INNER JOIN crop c ON ce.crop_id = c.crop_id
       INNER JOIN farm f ON c.farm_id = f.farm_id
       INNER JOIN monitor_device md ON ce.device_id = md.device_id
       ${where}
       ORDER BY ce.exception_time DESC, ce.exception_id DESC
       LIMIT ${lim} OFFSET ${offset}`,
      params
    );
    res.json({ data: rows || [], total, page: Number(page), pageSize: lim });
  } catch (error) {
    console.error('warning/exceptions:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

router.post('/exceptions', authenticateToken, async (req, res) => {
  try {
    await ensureSmartWarningSchema(pool);
    const user = req.user;
    if (![1, 2, 3].includes(user.role_id)) return res.status(403).json({ message: '无权限' });
    const {
      farm_id,
      crop_id,
      device_id,
      exception_type,
      exception_detail,
      warning_level = 2,
      video_url
    } = req.body || {};
    if (!crop_id || !device_id || !exception_type) {
      return res.status(400).json({ message: '作物、设备、异常类型为必填' });
    }
    const [crops] = await pool.execute(`SELECT farm_id FROM crop WHERE crop_id = ?`, [crop_id]);
    if (!crops?.length) return res.status(404).json({ message: '作物不存在' });
    assertFarm(user, crops[0].farm_id);
    const [dev] = await pool.execute(`SELECT farm_id FROM monitor_device WHERE device_id = ?`, [device_id]);
    if (!dev?.length || String(dev[0].farm_id) !== String(crops[0].farm_id)) {
      return res.status(400).json({ message: '设备与作物须属同一农场' });
    }

    const scroll = Math.floor(Date.now() / 1000);
    const [ins] = await pool.execute(
      `INSERT INTO crop_exception
        (crop_id, device_id, exception_type, exception_detail, handle_status, warning_level, scroll_sort, source_type, video_url)
       VALUES (?, ?, ?, ?, '未处理', ?, ?, 'manual', ?)`,
      [crop_id, device_id, exception_type, exception_detail || null, warning_level, scroll, video_url || null]
    );
    const exceptionId = ins.insertId;
    const conn = await pool.getConnection();
    try {
      await insertPushes(conn, exceptionId, crops[0].farm_id);
    } finally {
      conn.release();
    }
    res.status(201).json({ message: '异常已记录并已推送', exception_id: exceptionId });
  } catch (error) {
    console.error('warning/exceptions create:', error);
    res.status(error.status || 500).json({ message: error.message || '服务器错误', error: error.message });
  }
});

router.put('/exceptions/:id/status', authenticateToken, async (req, res) => {
  try {
    await ensureSmartWarningSchema(pool);
    const user = req.user;
    const { id } = req.params;
    const { handle_status } = req.body || {};
    if (!['未处理', '已处理', '已忽略'].includes(handle_status)) {
      return res.status(400).json({ message: '状态不合法' });
    }
    const [rows] = await pool.execute(
      `SELECT ce.exception_id, c.farm_id FROM crop_exception ce
       INNER JOIN crop c ON c.crop_id = ce.crop_id WHERE ce.exception_id = ?`,
      [id]
    );
    if (!rows?.length) return res.status(404).json({ message: '记录不存在' });
    assertFarm(user, rows[0].farm_id);
    if (user.role_id === 3 && handle_status !== '已处理') {
      return res.status(403).json({ message: '普通用户仅可将状态更新为已处理' });
    }
    await pool.execute(`UPDATE crop_exception SET handle_status = ? WHERE exception_id = ?`, [handle_status, id]);
    res.json({ message: '状态已更新' });
  } catch (error) {
    console.error('warning/exceptions status:', error);
    res.status(error.status || 500).json({ message: error.message || '服务器错误', error: error.message });
  }
});

router.get('/pushes', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    const { page = 1, pageSize = 15, farm_id } = req.query;
    const offset = (Number(page) - 1) * Number(pageSize);
    const lim = Math.min(100, Math.max(1, Number(pageSize) || 15));

    let where = 'WHERE 1=1';
    const params = [];
    if (user.role_id !== 1) {
      where += ' AND ep.receiver_id = ?';
      params.push(user.user_id);
    }
    if (user.role_id === 1 && farm_id) {
      where += ' AND c.farm_id = ?';
      params.push(farm_id);
    }

    const [cnt] = await pool.execute(
      `SELECT COUNT(*) AS total FROM exception_push ep
       INNER JOIN crop_exception ce ON ce.exception_id = ep.exception_id
       INNER JOIN crop c ON c.crop_id = ce.crop_id
       ${where}`,
      params
    );
    const [rows] = await pool.execute(
      `SELECT ep.push_id, ep.exception_id, ep.receiver_id, ep.push_method, ep.push_time, ep.read_status,
              ce.exception_type, ce.exception_detail, ce.exception_time, ce.handle_status,
              c.farm_id, f.farm_name, c.crop_name, c.plant_area, u.real_name AS receiver_name
       FROM exception_push ep
       INNER JOIN crop_exception ce ON ce.exception_id = ep.exception_id
       INNER JOIN crop c ON c.crop_id = ce.crop_id
       INNER JOIN farm f ON f.farm_id = c.farm_id
       INNER JOIN user u ON u.user_id = ep.receiver_id
       ${where}
       ORDER BY ep.push_time DESC
       LIMIT ${lim} OFFSET ${offset}`,
      params
    );
    res.json({ data: rows || [], total: cnt?.[0]?.total || 0, page: Number(page), pageSize: lim });
  } catch (error) {
    console.error('warning/pushes:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

router.get('/stats', authenticateToken, async (req, res) => {
  try {
    await ensureSmartWarningSchema(pool);
    const user = req.user;
    const { from, to } = req.query;
    let farmClause = '';
    const params = [];
    if (user.role_id !== 1) {
      if (!user.farm_id) {
        return res.json({
          total: 0,
          by_status: [],
          by_type: [],
          by_farm: []
        });
      }
      farmClause = ' AND c.farm_id = ?';
      params.push(user.farm_id);
    }
    let timeClause = '';
    if (from) {
      timeClause += ' AND ce.exception_time >= ?';
      params.push(`${from} 00:00:00`);
    }
    if (to) {
      timeClause += ' AND ce.exception_time <= ?';
      params.push(`${to} 23:59:59`);
    }

    const [totalRow] = await pool.execute(
      `SELECT COUNT(*) AS n FROM crop_exception ce
       INNER JOIN crop c ON c.crop_id = ce.crop_id WHERE 1=1 ${farmClause} ${timeClause}`,
      [...params]
    );
    const [byStatus] = await pool.execute(
      `SELECT ce.handle_status AS name, COUNT(*) AS value FROM crop_exception ce
       INNER JOIN crop c ON c.crop_id = ce.crop_id WHERE 1=1 ${farmClause} ${timeClause}
       GROUP BY ce.handle_status`,
      [...params]
    );
    const [byType] = await pool.execute(
      `SELECT ce.exception_type AS name, COUNT(*) AS value FROM crop_exception ce
       INNER JOIN crop c ON c.crop_id = ce.crop_id WHERE 1=1 ${farmClause} ${timeClause}
       GROUP BY ce.exception_type`,
      [...params]
    );
    const [byFarm] = await pool.execute(
      `SELECT f.farm_name AS name, COUNT(*) AS value FROM crop_exception ce
       INNER JOIN crop c ON c.crop_id = ce.crop_id
       INNER JOIN farm f ON f.farm_id = c.farm_id WHERE 1=1 ${farmClause} ${timeClause}
       GROUP BY f.farm_id, f.farm_name`,
      [...params]
    );

    res.json({
      total: totalRow?.[0]?.n || 0,
      by_status: byStatus || [],
      by_type: byType || [],
      by_farm: byFarm || []
    });
  } catch (error) {
    console.error('warning/stats:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

router.post('/run-rules', authenticateToken, async (req, res) => {
  try {
    if (req.user.role_id !== 1) return res.status(403).json({ message: '仅管理员可手动触发规则扫描' });
    await runInventoryRules(pool);
    res.json({ message: '规则扫描已执行' });
  } catch (error) {
    console.error('warning/run-rules:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

module.exports = router;
