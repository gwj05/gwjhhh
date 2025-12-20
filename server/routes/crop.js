const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const authenticateToken = require('../middleware/auth');

// 获取作物列表（支持多维度筛选、排序、分页）
router.get('/list', authenticateToken, async (req, res) => {
  try {
    const {
      page = 1,
      pageSize = 10,
      crop_name,
      crop_category,
      crop_type,
      farm_id,
      plant_status,
      status, // 基于环境数据的状态筛选：normal/warning/alarm
      sow_time_from,
      sow_time_to,
      sortField = 'sow_time',
      sortOrder = 'desc'
    } = req.query;

    const offset = (page - 1) * pageSize;
    const roleId = req.user.role_id;
    const userFarmId = req.user.farm_id;

    // 数据权限：非超级管理员只能查看自己农场的作物
    let whereSql = 'WHERE 1=1';
    const whereParams = [];

    if (roleId !== 1) {
      if (!userFarmId) {
        return res.json({ data: [], total: 0, page: parseInt(page), pageSize: parseInt(pageSize) });
      }
      whereSql += ' AND c.farm_id = ?';
      whereParams.push(userFarmId);
    }

    // 筛选条件（使用COALESCE处理可能为NULL的字段）
    if (crop_name) {
      whereSql += ' AND (COALESCE(c.crop_name, c.crop_type, \'\') LIKE ? OR c.crop_type LIKE ?)';
      whereParams.push(`%${crop_name}%`, `%${crop_name}%`);
    }

    if (crop_category) {
      whereSql += ' AND c.crop_category = ?';
      whereParams.push(crop_category);
    }

    if (crop_type) {
      whereSql += ' AND c.crop_type LIKE ?';
      whereParams.push(`%${crop_type}%`);
    }

    if (farm_id) {
      whereSql += ' AND c.farm_id = ?';
      whereParams.push(farm_id);
    }

    if (plant_status) {
      whereSql += ' AND COALESCE(c.plant_status, \'生长中\') = ?';
      whereParams.push(plant_status);
    }

    if (sow_time_from) {
      whereSql += ' AND c.sow_time >= ?';
      whereParams.push(`${sow_time_from} 00:00:00`);
    }

    if (sow_time_to) {
      whereSql += ' AND c.sow_time <= ?';
      whereParams.push(`${sow_time_to} 23:59:59`);
    }

    // 排序字段白名单
    const sortFieldMap = {
      crop_name: 'c.crop_name',
      sow_time: 'c.sow_time',
      farm_name: 'f.farm_name',
      growth_cycle: 'c.growth_cycle'
    };
    const orderByField = sortFieldMap[sortField] || sortFieldMap.sow_time;
    const orderByDirection = sortOrder === 'desc' ? 'DESC' : 'ASC';

    // 查询作物列表
    // 使用COALESCE处理可能为NULL的新字段，确保兼容性
    const limitClause = `LIMIT ${Number(pageSize)} OFFSET ${Number(offset)}`;
    const listSql = `
      SELECT 
        c.crop_id,
        COALESCE(c.crop_name, c.crop_type, '') AS crop_name,
        c.crop_type,
        c.crop_category,
        c.farm_id,
        f.farm_name,
        c.plant_area,
        c.sow_time,
        c.growth_cycle,
        c.suitable_temp_min,
        c.suitable_temp_max,
        c.suitable_humidity_min,
        c.suitable_humidity_max,
        c.suitable_ph_min,
        c.suitable_ph_max,
        COALESCE(c.plant_status, '生长中') AS plant_status,
        c.created_at
      FROM crop c
      INNER JOIN farm f ON c.farm_id = f.farm_id
      ${whereSql}
      ORDER BY ${orderByField} ${orderByDirection}
      ${limitClause}
    `;

    let crops = [];
    try {
      const [result] = await pool.execute(listSql, whereParams);
      crops = result || [];
    } catch (sqlError) {
      console.error('SQL查询错误:', sqlError);
      // 如果是字段不存在的错误，提供更友好的提示
      if (sqlError.code === 'ER_BAD_FIELD_ERROR' || sqlError.message.includes('Unknown column')) {
        console.error('❌ 数据库字段不存在！');
        console.error('请确保已执行数据库迁移：');
        console.error('mysql -u root -p smart_agriculture < server/migrations/add_crop_fields.sql');
        return res.status(500).json({ 
          message: '数据库字段不存在，请先执行数据库迁移脚本',
          error: sqlError.message,
          hint: '请执行: mysql -u root -p smart_agriculture < server/migrations/add_crop_fields.sql'
        });
      }
      throw sqlError;
    }

    if (crops.length === 0) {
      return res.json({
        data: [],
        total: 0,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      });
    }

    const cropIds = crops.map(c => c.crop_id);
    const farmIds = [...new Set(crops.map(c => c.farm_id))];

    // 获取每个作物关联农场的最新环境数据
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

    // 计算作物状态（基于环境数据和适宜范围）
    const cropsWithStatus = crops.map(crop => {
      const env = envMap[crop.farm_id] || {};
      let statusCode = 'normal';
      let abnormalCount = 0;

      // 检查温度
      if (env.temperature !== null && crop.suitable_temp_min !== null && crop.suitable_temp_max !== null) {
        if (env.temperature < crop.suitable_temp_min || env.temperature > crop.suitable_temp_max) {
          abnormalCount += 2;
        }
      }

      // 检查湿度
      if (env.humidity !== null && crop.suitable_humidity_min !== null && crop.suitable_humidity_max !== null) {
        if (env.humidity < crop.suitable_humidity_min || env.humidity > crop.suitable_humidity_max) {
          abnormalCount += 2;
        }
      }

      // 检查pH
      if (env.soil_ph !== null && crop.suitable_ph_min !== null && crop.suitable_ph_max !== null) {
        if (env.soil_ph < crop.suitable_ph_min || env.soil_ph > crop.suitable_ph_max) {
          abnormalCount += 2;
        }
      }

      if (abnormalCount >= 4) statusCode = 'alarm';
      else if (abnormalCount >= 2) statusCode = 'warning';

      // 计算健康度（简化版）
      let healthScore = null;
      if (env.temperature !== null && env.humidity !== null && env.soil_ph !== null) {
        let score = 100;
        if (crop.suitable_temp_min !== null && crop.suitable_temp_max !== null) {
          if (env.temperature < crop.suitable_temp_min || env.temperature > crop.suitable_temp_max) {
            score -= 30;
          }
        }
        if (crop.suitable_humidity_min !== null && crop.suitable_humidity_max !== null) {
          if (env.humidity < crop.suitable_humidity_min || env.humidity > crop.suitable_humidity_max) {
            score -= 30;
          }
        }
        if (crop.suitable_ph_min !== null && crop.suitable_ph_max !== null) {
          if (env.soil_ph < crop.suitable_ph_min || env.soil_ph > crop.suitable_ph_max) {
            score -= 30;
          }
        }
        healthScore = Math.max(0, score);
      }

      // 计算剩余生长周期
      let remainingDays = null;
      if (crop.growth_cycle && crop.sow_time) {
        const sowDate = new Date(crop.sow_time);
        const now = new Date();
        const daysPassed = Math.floor((now - sowDate) / (1000 * 60 * 60 * 24));
        remainingDays = Math.max(0, crop.growth_cycle - daysPassed);
      }

      return {
        ...crop,
        temperature: env.temperature || null,
        humidity: env.humidity || null,
        soil_ph: env.soil_ph || null,
        latest_monitor_time: env.monitor_time || null,
        status: statusCode,
        health_score: healthScore,
        remaining_days: remainingDays
      };
    });

    // 基于环境数据的状态筛选（在计算完状态后）
    let filteredCrops = cropsWithStatus;
    if (status) {
      filteredCrops = cropsWithStatus.filter(c => c.status === status);
    }

    // 如果进行了状态筛选，总数就是筛选后的数量，分页在内存中进行
    let total;
    if (status) {
      total = filteredCrops.length;
      // 重新分页（在内存中）
      const start = offset;
      const end = start + parseInt(pageSize);
      filteredCrops = filteredCrops.slice(start, end);
    } else {
      // 总数查询（数据库查询）
      const [countResult] = await pool.execute(
        `SELECT COUNT(*) AS total
         FROM crop c
         INNER JOIN farm f ON c.farm_id = f.farm_id
         ${whereSql}`,
        whereParams
      );
      total = countResult[0].total;
    }

    res.json({
      data: filteredCrops,
      total,
      page: parseInt(page),
      pageSize: parseInt(pageSize)
    });
  } catch (error) {
    console.error('获取作物列表错误:', error);
    console.error('错误堆栈:', error.stack);
    // 提供更详细的错误信息
    const errorMessage = error.message || '未知错误';
    res.status(500).json({ 
      message: '服务器错误', 
      error: errorMessage,
      hint: error.code === 'ER_BAD_FIELD_ERROR' 
        ? '请确保已执行数据库迁移脚本' 
        : '请查看服务器日志获取详细信息'
    });
  }
});

// 获取作物详情（用于悬浮卡片）
router.get('/overview/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const roleId = req.user.role_id;
    const userFarmId = req.user.farm_id;

    const [crops] = await pool.execute(
      `SELECT c.*, f.farm_name
       FROM crop c
       INNER JOIN farm f ON c.farm_id = f.farm_id
       WHERE c.crop_id = ?`,
      [id]
    );

    if (crops.length === 0) {
      return res.status(404).json({ message: '作物不存在' });
    }

    const crop = crops[0];

    // 数据权限检查
    if (roleId !== 1 && userFarmId !== crop.farm_id) {
      return res.status(403).json({ message: '无权查看该作物' });
    }

    // 获取最新环境数据
    const [envRows] = await pool.execute(
      `SELECT temperature, humidity, soil_ph, monitor_time
       FROM environment_monitor
       WHERE farm_id = ?
       ORDER BY monitor_time DESC
       LIMIT 1`,
      [crop.farm_id]
    );

    // 计算健康度
    let healthScore = null;
    const env = envRows[0];
    if (env && crop.suitable_temp_min !== null && crop.suitable_temp_max !== null &&
        crop.suitable_humidity_min !== null && crop.suitable_humidity_max !== null &&
        crop.suitable_ph_min !== null && crop.suitable_ph_max !== null) {
      let score = 100;
      if (env.temperature < crop.suitable_temp_min || env.temperature > crop.suitable_temp_max) {
        score -= 30;
      }
      if (env.humidity < crop.suitable_humidity_min || env.humidity > crop.suitable_humidity_max) {
        score -= 30;
      }
      if (env.soil_ph < crop.suitable_ph_min || env.soil_ph > crop.suitable_ph_max) {
        score -= 30;
      }
      healthScore = Math.max(0, score);
    }

    // 计算剩余生长周期
    let remainingDays = null;
    if (crop.growth_cycle && crop.sow_time) {
      const sowDate = new Date(crop.sow_time);
      const now = new Date();
      const daysPassed = Math.floor((now - sowDate) / (1000 * 60 * 60 * 24));
      remainingDays = Math.max(0, crop.growth_cycle - daysPassed);
    }

    res.json({
      ...crop,
      environment: env || null,
      health_score: healthScore,
      remaining_days: remainingDays
    });
  } catch (error) {
    console.error('获取作物概览错误:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// 新增作物
router.post('/create', authenticateToken, async (req, res) => {
  try {
    const {
      crop_name,
      crop_type,
      crop_category,
      farm_id,
      plant_area,
      sow_time,
      growth_cycle,
      suitable_temp_min,
      suitable_temp_max,
      suitable_humidity_min,
      suitable_humidity_max,
      suitable_ph_min,
      suitable_ph_max,
      plant_status
    } = req.body;

    const roleId = req.user.role_id;
    const userFarmId = req.user.farm_id;

    // 权限检查
    if (roleId !== 1 && userFarmId !== parseInt(farm_id)) {
      return res.status(403).json({ message: '无权在该农场创建作物' });
    }

    if (!crop_name || !farm_id) {
      return res.status(400).json({ message: '作物名称和种植农场为必填项' });
    }

    // 验证农场是否存在
    const [farms] = await pool.execute('SELECT farm_id FROM farm WHERE farm_id = ?', [farm_id]);
    if (farms.length === 0) {
      return res.status(404).json({ message: '农场不存在' });
    }

    const [result] = await pool.execute(
      `INSERT INTO crop (
        crop_name, crop_type, crop_category, farm_id, plant_area, sow_time,
        growth_cycle, suitable_temp_min, suitable_temp_max,
        suitable_humidity_min, suitable_humidity_max,
        suitable_ph_min, suitable_ph_max, plant_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        crop_name,
        crop_type || crop_name,
        crop_category || null,
        farm_id,
        plant_area || '',
        sow_time || new Date(),
        growth_cycle || null,
        suitable_temp_min || null,
        suitable_temp_max || null,
        suitable_humidity_min || null,
        suitable_humidity_max || null,
        suitable_ph_min || null,
        suitable_ph_max || null,
        plant_status || '生长中'
      ]
    );

    res.status(201).json({
      message: '创建成功',
      crop_id: result.insertId
    });
  } catch (error) {
    console.error('新增作物错误:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// 更新作物
router.put('/update/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      crop_name,
      crop_type,
      crop_category,
      farm_id,
      plant_area,
      sow_time,
      growth_cycle,
      suitable_temp_min,
      suitable_temp_max,
      suitable_humidity_min,
      suitable_humidity_max,
      suitable_ph_min,
      suitable_ph_max,
      plant_status
    } = req.body;

    const roleId = req.user.role_id;
    const userFarmId = req.user.farm_id;

    // 获取原作物信息
    const [crops] = await pool.execute(
      'SELECT farm_id FROM crop WHERE crop_id = ?',
      [id]
    );

    if (crops.length === 0) {
      return res.status(404).json({ message: '作物不存在' });
    }

    const originalFarmId = crops[0].farm_id;

    // 权限检查：超级管理员或作物所属农场的负责人
    if (roleId !== 1 && userFarmId !== originalFarmId) {
      return res.status(403).json({ message: '无权修改该作物' });
    }

    if (!crop_name) {
      return res.status(400).json({ message: '作物名称不能为空' });
    }

    // 如果修改了农场，验证新农场是否存在
    if (farm_id && farm_id !== originalFarmId) {
      const [newFarms] = await pool.execute('SELECT farm_id FROM farm WHERE farm_id = ?', [farm_id]);
      if (newFarms.length === 0) {
        return res.status(404).json({ message: '目标农场不存在' });
      }
      // 跨农场修改需要超级管理员权限
      if (roleId !== 1) {
        return res.status(403).json({ message: '仅超级管理员可跨农场修改作物' });
      }
    }

    const [result] = await pool.execute(
      `UPDATE crop SET
        crop_name = ?,
        crop_type = ?,
        crop_category = ?,
        farm_id = ?,
        plant_area = ?,
        sow_time = ?,
        growth_cycle = ?,
        suitable_temp_min = ?,
        suitable_temp_max = ?,
        suitable_humidity_min = ?,
        suitable_humidity_max = ?,
        suitable_ph_min = ?,
        suitable_ph_max = ?,
        plant_status = ?
      WHERE crop_id = ?`,
      [
        crop_name,
        crop_type || crop_name,
        crop_category || null,
        farm_id || originalFarmId,
        plant_area || '',
        sow_time || new Date(),
        growth_cycle || null,
        suitable_temp_min || null,
        suitable_temp_max || null,
        suitable_humidity_min || null,
        suitable_humidity_max || null,
        suitable_ph_min || null,
        suitable_ph_max || null,
        plant_status || '生长中',
        id
      ]
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
router.delete('/delete/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const roleId = req.user.role_id;
    const userFarmId = req.user.farm_id;

    // 获取作物信息
    const [crops] = await pool.execute(
      'SELECT farm_id FROM crop WHERE crop_id = ?',
      [id]
    );

    if (crops.length === 0) {
      return res.status(404).json({ message: '作物不存在' });
    }

    const cropFarmId = crops[0].farm_id;

    // 权限检查：仅超级管理员或作物所属农场的负责人可删除
    if (roleId !== 1 && userFarmId !== cropFarmId) {
      return res.status(403).json({ message: '无权删除该作物' });
    }

    const [result] = await pool.execute('DELETE FROM crop WHERE crop_id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: '作物不存在' });
    }

    res.json({ message: '删除成功' });
  } catch (error) {
    console.error('删除作物错误:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// 批量修改种植农场
router.put('/batch-update-farm', authenticateToken, async (req, res) => {
  try {
    const { crop_ids, farm_id } = req.body;
    const roleId = req.user.role_id;

    if (!crop_ids || !Array.isArray(crop_ids) || crop_ids.length === 0) {
      return res.status(400).json({ message: '请选择要修改的作物' });
    }

    if (!farm_id) {
      return res.status(400).json({ message: '请选择目标农场' });
    }

    // 仅超级管理员可批量修改
    if (roleId !== 1) {
      return res.status(403).json({ message: '仅超级管理员可批量修改种植农场' });
    }

    // 验证目标农场是否存在
    const [farms] = await pool.execute('SELECT farm_id FROM farm WHERE farm_id = ?', [farm_id]);
    if (farms.length === 0) {
      return res.status(404).json({ message: '目标农场不存在' });
    }

    const [result] = await pool.execute(
      `UPDATE crop SET farm_id = ? WHERE crop_id IN (${crop_ids.map(() => '?').join(',')})`,
      [farm_id, ...crop_ids]
    );

    res.json({
      message: `成功修改 ${result.affectedRows} 个作物的种植农场`,
      affected_rows: result.affectedRows
    });
  } catch (error) {
    console.error('批量修改种植农场错误:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// 导出作物数据
router.get('/export', authenticateToken, async (req, res) => {
  try {
    const {
      crop_name,
      crop_category,
      farm_id,
      plant_status
    } = req.query;

    const roleId = req.user.role_id;
    const userFarmId = req.user.farm_id;

    let whereSql = 'WHERE 1=1';
    const whereParams = [];

    if (roleId !== 1) {
      if (!userFarmId) {
        return res.status(200).send('crop_name,crop_type,crop_category,farm_name,plant_area,sow_time,plant_status\n');
      }
      whereSql += ' AND c.farm_id = ?';
      whereParams.push(userFarmId);
    }

    if (crop_name) {
      whereSql += ' AND c.crop_name LIKE ?';
      whereParams.push(`%${crop_name}%`);
    }

    if (crop_category) {
      whereSql += ' AND c.crop_category = ?';
      whereParams.push(crop_category);
    }

    if (farm_id) {
      whereSql += ' AND c.farm_id = ?';
      whereParams.push(farm_id);
    }

    if (plant_status) {
      whereSql += ' AND c.plant_status = ?';
      whereParams.push(plant_status);
    }

    const [rows] = await pool.execute(
      `SELECT 
        c.crop_name,
        c.crop_type,
        c.crop_category,
        f.farm_name,
        c.plant_area,
        c.sow_time,
        c.plant_status,
        c.growth_cycle,
        c.suitable_temp_min,
        c.suitable_temp_max,
        c.suitable_humidity_min,
        c.suitable_humidity_max,
        c.suitable_ph_min,
        c.suitable_ph_max
       FROM crop c
       INNER JOIN farm f ON c.farm_id = f.farm_id
       ${whereSql}
       ORDER BY c.sow_time DESC`,
      whereParams
    );

    const header = 'crop_name,crop_type,crop_category,farm_name,plant_area,sow_time,plant_status,growth_cycle,temp_range,humidity_range,ph_range\n';
    const body = rows.map(r => {
      const wrap = (val) => {
        if (val == null) return '';
        const s = String(val).replace(/"/g, '""');
        return `"${s}"`;
      };
      const tempRange = r.suitable_temp_min && r.suitable_temp_max 
        ? `${r.suitable_temp_min}-${r.suitable_temp_max}` 
        : '';
      const humidityRange = r.suitable_humidity_min && r.suitable_humidity_max 
        ? `${r.suitable_humidity_min}-${r.suitable_humidity_max}` 
        : '';
      const phRange = r.suitable_ph_min && r.suitable_ph_max 
        ? `${r.suitable_ph_min}-${r.suitable_ph_max}` 
        : '';
      return [
        wrap(r.crop_name),
        wrap(r.crop_type),
        wrap(r.crop_category),
        wrap(r.farm_name),
        wrap(r.plant_area),
        wrap(r.sow_time),
        wrap(r.plant_status),
        wrap(r.growth_cycle),
        wrap(tempRange),
        wrap(humidityRange),
        wrap(phRange)
      ].join(',');
    }).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="crops.csv"');
    res.status(200).send(header + body);
  } catch (error) {
    console.error('导出作物错误:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

module.exports = router;

