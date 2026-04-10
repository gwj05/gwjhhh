const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const authenticateToken = require('../middleware/auth');
const { assertFarmAccess, getScopedFarmId, isNoFarmForNonAdmin } = require('../lib/dataScope');

// ---------- 工具：创建时间字段兼容 ----------
// 若无 created_at，就用 farm_id 近似创建时间
const createdField = 'f.farm_id';
// 获取农场列表（支持多条件查询、排序和状态计算，简化SQL避免错误）
router.get('/list', authenticateToken, async (req, res) => {
  try {
    const {
      page = 1,
      pageSize = 10,
      farm_name,
      principal_name,
      status, // normal / warning / alarm
      created_from,
      created_to,
      sortField = 'farm_name',
      sortOrder = 'asc'
    } = req.query;
    const offset = (page - 1) * pageSize;
    const roleId = req.user.role_id;
    const scopedFarmId = getScopedFarmId(req.user, req.query.farm_id);
    // 排序字段白名单
    const sortFieldMap = {
      farm_name: 'f.farm_name',
      created_time: createdField // 若表无 created_at，需在库中新增
    };
    const orderByField = sortFieldMap[sortField] || sortFieldMap.farm_name;
    const orderByDirection = sortOrder === 'desc' ? 'DESC' : 'ASC';
    // 基础where（只在 farm 和 user 上，避免复杂多表join问题）
    let whereSql = 'WHERE 1=1';
    const whereParams = [];

    if (isNoFarmForNonAdmin(req.user, scopedFarmId)) {
      return res.json({ data: [], total: 0, page: parseInt(page), pageSize: parseInt(pageSize) });
    }
    if (roleId !== 1 || scopedFarmId) {
      whereSql += ' AND f.farm_id = ?';
      whereParams.push(scopedFarmId);
    }
    if (farm_name) {
      whereSql += ' AND f.farm_name LIKE ?';
      whereParams.push(`%${farm_name}%`);
    }
    if (principal_name) {
      whereSql += ' AND u.real_name LIKE ?';
      whereParams.push(`%${principal_name}%`);
    }
    if (created_from) {
      whereSql += ` AND ${createdField} >= ?`;
      whereParams.push(`${created_from} 00:00:00`);
    }
    if (created_to) {
      whereSql += ` AND ${createdField} <= ?`;
      whereParams.push(`${created_to} 23:59:59`);
    }

    // 1. 查询农场基础列表
    const limitClause = `LIMIT ${Number(pageSize)} OFFSET ${Number(offset)}`;
    const listSql = `
      SELECT 
        f.farm_id,
        f.farm_name,
        f.farm_code,
        f.farm_level,
        f.address,
        f.phone,
        f.total_area,
        f.region_count,
        f.active_crop_count,
        ${createdField} AS created_at,
        u.user_id AS principal_id,
        u.real_name AS principal_name
      FROM farm f
      LEFT JOIN user u ON f.principal_id = u.user_id
      ${whereSql}
      ORDER BY ${orderByField} ${orderByDirection}
      ${limitClause}
    `;
    const listParams = [...whereParams];
    const [farms] = await pool.execute(listSql, listParams);

    if (farms.length === 0) {
      return res.json({
        data: [],
        total: 0,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      });
    }

    const farmIds = farms.map(f => f.farm_id);

    // 2. 获取每个农场最新环境数据（使用 IN (?) 自动展开，避免占位符不匹配）
    const envMap = {};
    if (farmIds.length > 0) {
      const [envRows] = await pool.execute(
        `SELECT em.* 
         FROM environment_monitor em
         INNER JOIN (
           SELECT farm_id, MAX(monitor_time) AS max_time
           FROM environment_monitor
           WHERE farm_id IN (${farmIds.map(() => '?').join(',')})
           GROUP BY farm_id
         ) t ON em.farm_id = t.farm_id AND em.monitor_time = t.max_time`,
        farmIds
      );
      envRows.forEach(row => {
        envMap[row.farm_id] = row;
      });
    }

    // 3. 获取设备统计
    const deviceMap = {};
    if (farmIds.length > 0) {
      const [deviceRows] = await pool.execute(
        `SELECT farm_id,
                COUNT(*) AS device_total,
                SUM(CASE WHEN device_status = '在线' THEN 1 ELSE 0 END) AS device_online
         FROM monitor_device
         WHERE farm_id IN (${farmIds.map(() => '?').join(',')})
         GROUP BY farm_id`,
        farmIds
      );
      deviceRows.forEach(row => {
        deviceMap[row.farm_id] = row;
      });
    }

    // 4. 获取未处理预警数
    const warningMap = {};
    if (farmIds.length > 0) {
      const [warningRows] = await pool.execute(
        `SELECT c.farm_id, COUNT(*) AS unhandled_warnings
         FROM crop_exception ce
         INNER JOIN crop c ON ce.crop_id = c.crop_id
         WHERE ce.handle_status = '未处理'
           AND c.farm_id IN (${farmIds.map(() => '?').join(',')})
         GROUP BY c.farm_id`,
        farmIds
      );
      warningRows.forEach(row => {
        warningMap[row.farm_id] = row;
      });
    }

    // 5. 计算状态并合并数据
    const withStatus = farms.map(f => {
      const env = envMap[f.farm_id] || {};
      let statusCode = 'normal';
      let abnormalCount = 0;

      const t = env.temperature;
      const h = env.humidity;
      const ph = env.soil_ph;

      if (t != null) {
        if (t < 10 || t > 35) abnormalCount += 2;
        else if (t < 15 || t > 30) abnormalCount += 1;
      }
      if (h != null) {
        if (h < 20 || h > 100) abnormalCount += 2;
        else if (h < 30 || h > 90) abnormalCount += 1;
      }
      if (ph != null) {
        if (ph < 5.0 || ph > 8.5) abnormalCount += 2;
        else if (ph < 6.0 || ph > 7.5) abnormalCount += 1;
      }

      if (abnormalCount >= 2) statusCode = 'alarm';
      else if (abnormalCount >= 1) statusCode = 'warning';

      return {
        ...f,
        temperature: env.temperature || null,
        humidity: env.humidity || null,
        soil_ph: env.soil_ph || null,
        latest_monitor_time: env.monitor_time || null,
        device_total: deviceMap[f.farm_id]?.device_total || 0,
        device_online: deviceMap[f.farm_id]?.device_online || 0,
        unhandled_warnings: warningMap[f.farm_id]?.unhandled_warnings || 0,
        status: statusCode
      };
    });

    const filtered = status
      ? withStatus.filter(item => item.status === status)
      : withStatus;

    // 6. 总数（含状态筛选后的数量）
    const total = filtered.length;

    res.json({
      data: filtered,
      total,
      page: parseInt(page),
      pageSize: parseInt(pageSize)
    });
  } catch (error) {
    console.error('获取农场列表错误:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// 获取农场数据概览（悬浮卡片用）
router.get('/overview/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    assertFarmAccess(req.user, parseInt(id));

    // 最新环境数据
    const [envRows] = await pool.execute(
      `SELECT temperature, humidity, soil_ph, monitor_time
       FROM environment_monitor
       WHERE farm_id = ?
       ORDER BY monitor_time DESC
       LIMIT 1`,
      [id]
    );

    // 设备在线率
    const [deviceRows] = await pool.execute(
      `SELECT 
         COUNT(*) AS device_total,
         SUM(CASE WHEN device_status = '在线' THEN 1 ELSE 0 END) AS device_online
       FROM monitor_device
       WHERE farm_id = ?`,
      [id]
    );

    // 未处理预警数
    const [warningRows] = await pool.execute(
      `SELECT COUNT(*) AS unhandled_warnings
       FROM crop_exception ce
       INNER JOIN crop c ON ce.crop_id = c.crop_id
       WHERE c.farm_id = ? AND ce.handle_status = '未处理'`,
      [id]
    );

    res.json({
      environment: envRows[0] || null,
      devices: deviceRows[0] || { device_total: 0, device_online: 0 },
      warnings: warningRows[0] || { unhandled_warnings: 0 }
    });
  } catch (error) {
    console.error('获取农场概览错误:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// 导出农场基础数据（名称/地址/负责人）为 CSV
router.get('/export', authenticateToken, async (req, res) => {
  try {
    const roleId = req.user.role_id;
    const scopedFarmId = getScopedFarmId(req.user, req.query.farm_id);

    let whereSql = 'WHERE 1=1';
    const params = [];

    if (isNoFarmForNonAdmin(req.user, scopedFarmId)) {
      return res.status(200).send('farm_name,address,principal_name\n');
    }
    if (roleId !== 1 || scopedFarmId) {
      whereSql += ' AND f.farm_id = ?';
      params.push(scopedFarmId);
    }

    const [rows] = await pool.execute(
      `SELECT f.farm_name, f.address, u.real_name AS principal_name
       FROM farm f
       LEFT JOIN user u ON f.principal_id = u.user_id
       ${whereSql}
       ORDER BY f.farm_name ASC`
    , params);

    const header = 'farm_name,address,principal_name\n';
    const body = rows.map(r => {
      const wrap = (val) => {
        if (val == null) return '';
        const s = String(val).replace(/"/g, '""');
        return `"${s}"`;
      };
      return [wrap(r.farm_name), wrap(r.address), wrap(r.principal_name)].join(',');
    }).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="farms.csv"');
    res.status(200).send(header + body);
  } catch (error) {
    console.error('导出农场错误:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// 获取农场详情
router.get('/detail/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    // 数据权限检查
    assertFarmAccess(req.user, parseInt(id));

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

// 获取可选负责人列表（农场管理员角色）
router.get('/principals', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT user_id, real_name, phone 
       FROM user 
       WHERE role_id = 2
       ORDER BY real_name`
    );
    res.json(rows);
  } catch (error) {
    console.error('获取负责人列表错误:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// 新增农场（仅超级管理员和农场管理员）
router.post('/create', authenticateToken, async (req, res) => {
  try {
    const {
      farm_name,
      farm_code,
      address,
      principal_id,
      phone,
      longitude,
      latitude,
      farm_level,
      total_area,
      irrigation_mode,
      soil_quality_level,
      remark
    } = req.body;
    const roleId = req.user.role_id;

    // 操作权限：仅超级管理员和农场管理员可创建
    if (roleId !== 1 && roleId !== 2) {
      return res.status(403).json({ message: '无权创建农场' });
    }

    if (!farm_name) {
      return res.status(400).json({ message: '农场名称不能为空' });
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
      `INSERT INTO farm
       (farm_name, farm_code, address, principal_id, phone, longitude, latitude, farm_level, total_area, irrigation_mode, soil_quality_level, remark)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        farm_name,
        farm_code || null,
        address || '',
        principal_id || null,
        phone || '',
        longitude || null,
        latitude || null,
        farm_level || 'standard',
        total_area || 0,
        irrigation_mode || 'auto_manual',
        soil_quality_level || 'B',
        remark || null
      ]
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
    const {
      farm_name,
      farm_code,
      address,
      principal_id,
      phone,
      longitude,
      latitude,
      farm_level,
      total_area,
      irrigation_mode,
      soil_quality_level,
      remark
    } = req.body;
    // 操作权限检查
    assertFarmAccess(req.user, parseInt(id));

    if (!farm_name) {
      return res.status(400).json({ message: '农场名称不能为空' });
    }

    const [result] = await pool.execute(
      `UPDATE farm
       SET farm_name=?, farm_code=?, address=?, principal_id=?, phone=?, longitude=?, latitude=?,
           farm_level=?, total_area=?, irrigation_mode=?, soil_quality_level=?, remark=?
       WHERE farm_id=?`,
      [
        farm_name,
        farm_code || null,
        address || '',
        principal_id || null,
        phone || '',
        longitude || null,
        latitude || null,
        farm_level || 'standard',
        total_area || 0,
        irrigation_mode || 'auto_manual',
        soil_quality_level || 'B',
        remark || null,
        id
      ]
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

// 获取农场作物列表
router.get('/:id/crops', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    assertFarmAccess(req.user, parseInt(id));

    const [rows] = await pool.execute(
      `SELECT crop_id, crop_type, plant_area, sow_time 
       FROM crop WHERE farm_id = ? ORDER BY crop_id DESC`,
      [id]
    );
    res.json(rows);
  } catch (error) {
    console.error('获取作物列表错误:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// 新增作物
router.post('/:id/crops', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { crop_type, plant_area, sow_time } = req.body;
    assertFarmAccess(req.user, parseInt(id));
    if (!crop_type || !plant_area || !sow_time) {
      return res.status(400).json({ message: '请填写完整的作物信息' });
    }

    const [result] = await pool.execute(
      `INSERT INTO crop (farm_id, crop_type, plant_area, sow_time) VALUES (?, ?, ?, ?)`,
      [id, crop_type, plant_area, sow_time]
    );
    res.status(201).json({ message: '创建成功', crop_id: result.insertId });
  } catch (error) {
    console.error('新增作物错误:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// 更新作物
router.put('/:id/crops/:cropId', authenticateToken, async (req, res) => {
  try {
    const { id, cropId } = req.params;
    const { crop_type, plant_area, sow_time } = req.body;
    assertFarmAccess(req.user, parseInt(id));

    const [result] = await pool.execute(
      `UPDATE crop SET crop_type=?, plant_area=?, sow_time=? WHERE crop_id=? AND farm_id=?`,
      [crop_type, plant_area, sow_time, cropId, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: '作物不存在' });
    }
    res.json({ message: '更新成功' });
  } catch (error) {
    console.error('更新作物错误:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// 删除作物
router.delete('/:id/crops/:cropId', authenticateToken, async (req, res) => {
  try {
    const { id, cropId } = req.params;
    assertFarmAccess(req.user, parseInt(id));

    const [result] = await pool.execute(
      `DELETE FROM crop WHERE crop_id=? AND farm_id=?`,
      [cropId, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: '作物不存在' });
    }
    res.json({ message: '删除成功' });
  } catch (error) {
    console.error('删除作物错误:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// 获取农场设备列表
router.get('/:id/devices', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    assertFarmAccess(req.user, parseInt(id));

    const [rows] = await pool.execute(
      `SELECT device_id, device_name, install_location, device_status, monitor_area, device_category
       FROM monitor_device WHERE farm_id = ? ORDER BY device_id DESC`,
      [id]
    );
    res.json(rows);
  } catch (error) {
    console.error('获取设备列表错误:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// 新增设备
router.post('/:id/devices', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { device_name, install_location, device_status, monitor_area, device_category } = req.body;
    assertFarmAccess(req.user, parseInt(id));
    if (!device_name || !install_location || !device_status || !monitor_area) {
      return res.status(400).json({ message: '请填写完整的设备信息' });
    }

    const [result] = await pool.execute(
      `INSERT INTO monitor_device 
       (farm_id, device_name, install_location, device_status, monitor_area, device_category) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, device_name, install_location, device_status, monitor_area, device_category || null]
    );
    res.status(201).json({ message: '创建成功', device_id: result.insertId });
  } catch (error) {
    console.error('新增设备错误:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// 更新设备
router.put('/:id/devices/:deviceId', authenticateToken, async (req, res) => {
  try {
    const { id, deviceId } = req.params;
    const { device_name, install_location, device_status, monitor_area, device_category } = req.body;
    assertFarmAccess(req.user, parseInt(id));

    const [result] = await pool.execute(
      `UPDATE monitor_device 
       SET device_name=?, install_location=?, device_status=?, monitor_area=?, device_category=?
       WHERE device_id=? AND farm_id=?`,
      [device_name, install_location, device_status, monitor_area, device_category || null, deviceId, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: '设备不存在' });
    }
    res.json({ message: '更新成功' });
  } catch (error) {
    console.error('更新设备错误:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// 删除设备
router.delete('/:id/devices/:deviceId', authenticateToken, async (req, res) => {
  try {
    const { id, deviceId } = req.params;
    assertFarmAccess(req.user, parseInt(id));

    const [result] = await pool.execute(
      `DELETE FROM monitor_device WHERE device_id=? AND farm_id=?`,
      [deviceId, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: '设备不存在' });
    }
    res.json({ message: '删除成功' });
  } catch (error) {
    console.error('删除设备错误:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

module.exports = router;

