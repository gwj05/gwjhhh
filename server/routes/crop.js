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

// ========== 生长周期记录（阶段/时间轴/农事操作/环境与预警）==========
const STAGES = [
  { key: 'sowing', label: '播种期' , pct: 10 },
  { key: 'germination', label: '发芽期', pct: 15 },
  { key: 'vegetative', label: '生长期', pct: 35 },
  { key: 'flowering', label: '开花期', pct: 15 },
  { key: 'fruiting', label: '结果期', pct: 20 },
  { key: 'maturity', label: '成熟期', pct: 5 }
]

async function ensureCycleTables() {
  // 当前阶段手动覆盖状态
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS growth_cycle_stage_state (
      crop_id INT NOT NULL PRIMARY KEY,
      stage_key VARCHAR(30) NOT NULL,
      updated_by INT DEFAULT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  // 手动阶段变更日志（用于时间轴）
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS growth_cycle_stage_log (
      log_id INT AUTO_INCREMENT PRIMARY KEY,
      crop_id INT NOT NULL,
      stage_key VARCHAR(30) NOT NULL,
      note VARCHAR(200) DEFAULT NULL,
      record_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_by INT DEFAULT NULL,
      INDEX idx_cycle_crop_time (crop_id, record_time)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
}

function assertCropAccess(user, cropFarmId) {
  if (user.role_id === 1) return
  if (!user.farm_id || user.farm_id !== cropFarmId) {
    const err = new Error('无权访问该作物')
    err.status = 403
    throw err
  }
}

function computeExpectedHarvestDate(crop) {
  const sowTime = crop.sow_time ? new Date(crop.sow_time) : null
  const cycleDays = parseInt(crop.growth_cycle || 0, 10) || 0
  if (!sowTime || cycleDays <= 0) return null
  const d = new Date(sowTime)
  d.setDate(d.getDate() + cycleDays)
  return d
}

function buildStageSchedule(crop, now = new Date()) {
  const sowTime = crop.sow_time ? new Date(crop.sow_time) : null
  const cycleDays = parseInt(crop.growth_cycle || 0, 10) || 0

  // 缺失兜底：至少给出一个“播种期”区间，避免前端空指针
  if (!sowTime || cycleDays <= 0) {
    const fakeStart = now
    return {
      expectedHarvest: null,
      totalDays: 0,
      stages: [
        { key: 'sowing', label: '播种期', start: fakeStart, end: now }
      ],
      current: { key: 'sowing', progress: 0, stageStart: fakeStart, stageEnd: now }
    }
  }

  const expectedHarvest = computeExpectedHarvestDate(crop)

  // 将百分比换算到天数：前面按 floor，最后一段吃掉差值
  const stageDays = STAGES.map(s => Math.floor((cycleDays * s.pct) / 100))
  const sumDays = stageDays.reduce((a, b) => a + b, 0)
  stageDays[stageDays.length - 1] += Math.max(0, cycleDays - sumDays)

  let cursor = new Date(sowTime)
  const stages = []
  for (let i = 0; i < STAGES.length; i++) {
    const s = STAGES[i]
    const start = new Date(cursor)
    const end = new Date(cursor)
    end.setDate(end.getDate() + stageDays[i])
    stages.push({ key: s.key, label: s.label, start, end })
    cursor = end
  }

  const elapsedDays = (now - sowTime) / (1000 * 60 * 60 * 24)
  let currentStage = stages[0]
  for (const st of stages) {
    if (now >= st.start && now < st.end) {
      currentStage = st
      break
    }
  }
  if (expectedHarvest && now >= expectedHarvest) {
    currentStage = stages[stages.length - 1]
  }

  const stageDurationMs = Math.max(1, currentStage.end - currentStage.start)
  const progress = Math.min(100, Math.max(0, ((now - currentStage.start) / stageDurationMs) * 100))

  return {
    expectedHarvest,
    totalDays: cycleDays,
    stages,
    current: { key: currentStage.key, progress, stageStart: currentStage.start, stageEnd: currentStage.end }
  }
}

function stageLabel(stageKey) {
  return STAGES.find(s => s.key === stageKey)?.label || '-'
}

function getStageStateKey(stageKey) {
  return STAGES.some(s => s.key === stageKey) ? stageKey : 'sowing'
}

function buildAdvice(envLatest, crop) {
  const advice = []
  if (!envLatest) return advice

  const t = envLatest.temperature
  const h = envLatest.humidity
  const ph = envLatest.soil_ph

  // 用 crop 的适宜范围给建议；缺失就跳过
  if (t != null && crop.suitable_temp_min != null && crop.suitable_temp_max != null) {
    if (t < crop.suitable_temp_min) advice.push('温度偏低，建议适当增温或加强保温。')
    else if (t > crop.suitable_temp_max) advice.push('温度过高，建议通风/遮阳降温。')
  }
  if (h != null && crop.suitable_humidity_min != null && crop.suitable_humidity_max != null) {
    if (h < crop.suitable_humidity_min) advice.push('湿度偏低，建议适量灌溉并保持适宜环境。')
    else if (h > crop.suitable_humidity_max) advice.push('湿度过高，建议减少灌溉频次并加强排湿。')
  }
  if (ph != null && crop.suitable_ph_min != null && crop.suitable_ph_max != null) {
    if (ph < crop.suitable_ph_min || ph > crop.suitable_ph_max) advice.push('土壤 pH 偏离适宜区间，建议使用调节剂并复测。')
  }

  return advice.length ? advice : ['当前环境指标正常，无需额外操作。']
}

// 1) 生长周期列表
router.get('/cycle/list', authenticateToken, async (req, res) => {
  try {
    await ensureCycleTables()
    const user = req.user

    const roleId = user.role_id
    const userFarmId = user.farm_id

    // 获取作物列表（权限过滤与 crop/list 一致）
    let whereSql = 'WHERE 1=1'
    const whereParams = []
    if (roleId !== 1) {
      if (!userFarmId) {
        return res.json({ data: [], total: 0 })
      }
      whereSql += ' AND c.farm_id = ?'
      whereParams.push(userFarmId)
    }

    const [crops] = await pool.execute(
      `SELECT c.crop_id, c.crop_name, c.crop_type, c.farm_id, f.farm_name, c.plant_area, c.sow_time, c.growth_cycle, COALESCE(c.plant_status,'生长中') AS plant_status
       FROM crop c
       INNER JOIN farm f ON c.farm_id = f.farm_id
       ${whereSql}
       ORDER BY c.sow_time DESC`,
      whereParams
    )

    if (!crops?.length) return res.json({ data: [], total: 0 })

    const cropIds = crops.map(c => c.crop_id)
    const [stateRows] = await pool.execute(
      `SELECT crop_id, stage_key FROM growth_cycle_stage_state WHERE crop_id IN (${cropIds.map(() => '?').join(',')})`,
      cropIds
    )
    const stateMap = {}
    stateRows.forEach(r => { stateMap[r.crop_id] = r.stage_key })

    const now = new Date()
    const result = crops.map(c => {
      const schedule = buildStageSchedule(c, now)
      const stageKey = stateMap[c.crop_id] || schedule.current.key
      const expectedHarvest = schedule.expectedHarvest
      const elapsedDays = schedule.totalDays ? Math.floor((now - new Date(c.sow_time)) / (1000 * 60 * 60 * 24)) : null
      const completed = schedule.expectedHarvest ? now >= schedule.expectedHarvest : false
      const status = completed ? '已完成' : '进行中'

      const activeStage = schedule.stages.find(s => s.key === stageKey) || schedule.current
      const stageDurationMs = Math.max(1, new Date(activeStage.end || activeStage.stageEnd) - new Date(activeStage.start || activeStage.stageStart))
      const stageProgress = Math.min(100, Math.max(0, ((now - new Date(activeStage.start || activeStage.stageStart)) / stageDurationMs) * 100))

      return {
        crop_id: c.crop_id,
        crop_name: c.crop_name,
        crop_type: c.crop_type,
        farm_id: c.farm_id,
        farm_name: c.farm_name,
        plant_area: c.plant_area,
        sow_time: c.sow_time,
        expected_harvest_date: expectedHarvest,
        plant_status: c.plant_status,
        current_stage_key: stageKey,
        current_stage_label: stageLabel(stageKey),
        stage_progress: Math.round(stageProgress),
        status
      }
    })

    res.json({ data: result, total: result.length })
  } catch (error) {
    console.error('cycle/list error', error)
    res.status(500).json({ message: '服务器错误', error: error.message })
  }
})

// 2) 生长周期详情
router.get('/cycle/detail/:cropId', authenticateToken, async (req, res) => {
  try {
    await ensureCycleTables()
    const { cropId } = req.params
    const user = req.user
    const range = req.query.range || '24h' // 24h/7d/30d
    const now = new Date()

    const [crops] = await pool.execute(
      `SELECT c.crop_id, c.crop_name, c.crop_type, c.crop_category, c.farm_id, f.farm_name,
              c.plant_area, c.sow_time, c.growth_cycle, COALESCE(c.plant_status,'生长中') AS plant_status,
              c.suitable_temp_min, c.suitable_temp_max,
              c.suitable_humidity_min, c.suitable_humidity_max,
              c.suitable_ph_min, c.suitable_ph_max
       FROM crop c
       INNER JOIN farm f ON c.farm_id = f.farm_id
       WHERE c.crop_id = ?`,
      [cropId]
    )
    if (!crops?.length) return res.status(404).json({ message: '作物不存在' })
    const crop = crops[0]
    assertCropAccess(user, crop.farm_id)

    const schedule = buildStageSchedule(crop, now)

    const [stateRows] = await pool.execute(
      `SELECT stage_key FROM growth_cycle_stage_state WHERE crop_id = ?`,
      [cropId]
    )
    const manualStageKey = stateRows[0]?.stage_key || null
    const currentStageKey = manualStageKey || schedule.current.key

    // 环境最新值
    const [envLatestRows] = await pool.execute(
      `SELECT
         temperature,
         humidity,
         humidity AS soil_moisture,
         rainfall AS light,
         soil_ph,
         monitor_time
       FROM environment_monitor
       WHERE farm_id = ?
       ORDER BY monitor_time DESC
       LIMIT 1`,
      [crop.farm_id]
    )
    const envLatest = envLatestRows[0] || null

    // 环境历史（用于图表）
    const envRangeCondition = (() => {
      if (range === '7d') return 'AND em.monitor_time >= NOW() - INTERVAL 7 DAY'
      if (range === '30d') return 'AND em.monitor_time >= NOW() - INTERVAL 30 DAY'
      return 'AND em.monitor_time >= NOW() - INTERVAL 24 HOUR'
    })()

    const [envHistoryRows] = await pool.execute(
      `SELECT
         temperature,
         humidity,
         humidity AS soil_moisture,
         rainfall AS light,
         soil_ph,
         monitor_time
       FROM environment_monitor em
       WHERE em.farm_id = ?
       ${envRangeCondition}
       ORDER BY em.monitor_time ASC`,
      [crop.farm_id]
    )

    // 若时间窗口内无数据，则回退为最近 48 条，保证图表可用
    let finalEnvHistoryRows = envHistoryRows || []
    if (finalEnvHistoryRows.length === 0) {
      const [fallbackRows] = await pool.execute(
        `SELECT
           temperature,
           humidity,
           humidity AS soil_moisture,
           rainfall AS light,
           soil_ph,
           monitor_time
         FROM environment_monitor
         WHERE farm_id = ?
         ORDER BY monitor_time DESC
         LIMIT 48`,
        [crop.farm_id]
      )
      finalEnvHistoryRows = (fallbackRows || []).sort((a, b) => new Date(a.monitor_time) - new Date(b.monitor_time))
    }

    // 手动阶段变更日志
    const [stageLogs] = await pool.execute(
      `SELECT gl.log_id, gl.stage_key, gl.note, gl.record_time, u.real_name AS operator_name
       FROM growth_cycle_stage_log gl
       LEFT JOIN user u ON gl.created_by = u.user_id
       WHERE gl.crop_id = ?
       ORDER BY gl.record_time DESC`,
      [cropId]
    )

    // 计划阶段变更（只展示已到达阶段边界）
    const stageTimeline = schedule.stages
      .filter(st => now >= st.start)
      .map(st => ({
        record_id: `stage_pred_${st.key}`,
        record_time: st.start,
        record_type: 'stage_pred',
        operator_name: '系统推算',
        content: `阶段变化：进入${st.label}期`,
        stage_key: st.key
      }))

    const operationTypes = ['浇水','施肥','喷药','修剪','除草']
    // 农事操作记录（复用 operation_record）
    const [opRows] = await pool.execute(
      `SELECT orr.record_id, orr.operation_type, orr.operation_time, orr.operation_detail, u.real_name AS operator_name
       FROM operation_record orr
       LEFT JOIN user u ON orr.user_id = u.user_id
       WHERE orr.relate_id = ? AND orr.farm_id = ?
       ORDER BY orr.operation_time DESC`,
      [cropId, crop.farm_id]
    )

    const operationTimeline = (opRows || []).map(r => ({
      record_id: `op_${r.record_id}`,
      record_time: r.operation_time,
      record_type: 'operation',
      operator_name: r.operator_name || '未知',
      content: `${r.operation_type || '操作'}：${r.operation_detail || ''}`,
      operation_record_id: r.record_id,
      operation_type: r.operation_type,
      operation_detail: r.operation_detail,
      operation_time: r.operation_time
    }))

    const timeline = [...stageTimeline, ...stageLogs.map(l => ({
      record_id: `stage_${l.log_id}`,
      record_time: l.record_time,
      record_type: 'stage_log',
      operator_name: l.operator_name || '未知',
      content: `阶段变化：手动切换为${stageLabel(l.stage_key)}期${l.note ? `（${l.note}）` : ''}`,
      stage_key: l.stage_key,
      stage_log_id: l.log_id
    })), ...operationTimeline]
      .sort((a, b) => new Date(b.record_time) - new Date(a.record_time))

    // crop 异常/预警提示（复用 crop_exception）
    const [excRows] = await pool.execute(
      `SELECT exception_id, exception_type, exception_time, handle_status, warning_level
       FROM crop_exception
       WHERE crop_id = ?
       ORDER BY exception_time DESC`,
      [cropId]
    )
    const unhandledExc = (excRows || []).filter(e => e.handle_status === '未处理')
    const abnormalList = []
    if (envLatest) {
      const t = envLatest.temperature
      const h = envLatest.humidity
      const ph = envLatest.soil_ph

      if (t != null && crop.suitable_temp_min != null && crop.suitable_temp_max != null) {
        if (t < crop.suitable_temp_min || t > crop.suitable_temp_max) abnormalList.push(`温度异常：${t}℃（适宜 ${crop.suitable_temp_min}-${crop.suitable_temp_max}℃）`)
      }
      if (h != null && crop.suitable_humidity_min != null && crop.suitable_humidity_max != null) {
        if (h < crop.suitable_humidity_min || h > crop.suitable_humidity_max) abnormalList.push(`湿度异常：${h}%（适宜 ${crop.suitable_humidity_min}-${crop.suitable_humidity_max}%）`)
      }
      if (ph != null && crop.suitable_ph_min != null && crop.suitable_ph_max != null) {
        if (ph < crop.suitable_ph_min || ph > crop.suitable_ph_max) abnormalList.push(`土壤 pH 异常：${ph}（适宜 ${crop.suitable_ph_min}-${crop.suitable_ph_max}）`)
      }
    }

    // 设备离线提示（按农场汇总，后续可细化到区域/设备级）
    const [deviceAggRows] = await pool.execute(
      `SELECT
         SUM(CASE WHEN device_status = '离线' THEN 1 ELSE 0 END) AS offline_count,
         COUNT(*) AS device_total
       FROM monitor_device
       WHERE farm_id = ?`,
      [crop.farm_id]
    )
    const deviceAgg = deviceAggRows[0] || { offline_count: 0, device_total: 0 }
    if (deviceAgg.offline_count > 0) {
      abnormalList.push(`设备离线：${deviceAgg.offline_count} 台（${deviceAgg.device_total} 台）`)
    }

    const completed = schedule.expectedHarvest ? now >= schedule.expectedHarvest : false
    const currentStatus = completed ? '已完成' : abnormalList.length ? '异常' : '正常'
    const suggestions = buildAdvice(envLatest, crop)

    const activeStage = schedule.stages.find(s => s.key === currentStageKey) || schedule.current
    const activeStart = activeStage.start || activeStage.stageStart
    const activeEnd = activeStage.end || activeStage.stageEnd
    const stageDurationMs = Math.max(1, new Date(activeEnd) - new Date(activeStart))
    const stageProgress = Math.min(100, Math.max(0, ((now - new Date(activeStart)) / stageDurationMs) * 100))

    res.json({
      crop: {
        crop_id: crop.crop_id,
        crop_name: crop.crop_name,
        crop_type: crop.crop_type,
        plant_area: crop.plant_area,
        farm_id: crop.farm_id,
        farm_name: crop.farm_name,
        sow_time: crop.sow_time,
        expected_harvest_date: schedule.expectedHarvest,
        plant_status: crop.plant_status
      },
      stage: {
        current_stage_key: currentStageKey,
        current_stage_label: stageLabel(currentStageKey),
        progress: Math.round(stageProgress),
        schedule: schedule.stages.map(st => ({
          key: st.key,
          label: st.label,
          start: st.start,
          end: st.end
        }))
      },
      env: {
        latest: envLatest,
        history: finalEnvHistoryRows
      },
      timeline,
      alerts: {
        status: currentStatus,
        items: abnormalList,
        unhandled_exceptions: unhandledExc.map(e => ({
          exception_id: e.exception_id,
          exception_type: e.exception_type,
          exception_time: e.exception_time
        })),
        suggestions
      }
    })
  } catch (error) {
    console.error('cycle/detail error', error)
    const status = error.status || 500
    res.status(status).json({ message: '服务器错误', error: error.message })
  }
})

// 3) 手动切换阶段
router.post('/cycle/stage/:cropId', authenticateToken, async (req, res) => {
  try {
    await ensureCycleTables()
    const { cropId } = req.params
    const { stageKey, note } = req.body
    const user = req.user

    const [crops] = await pool.execute(
      `SELECT crop_id, farm_id FROM crop WHERE crop_id = ?`,
      [cropId]
    )
    if (!crops?.length) return res.status(404).json({ message: '作物不存在' })
    const crop = crops[0]
    assertCropAccess(user, crop.farm_id)

    const nextStage = getStageStateKey(stageKey)

    await pool.execute(
      `INSERT INTO growth_cycle_stage_state (crop_id, stage_key, updated_by)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE stage_key = VALUES(stage_key), updated_by = VALUES(updated_by)`,
      [cropId, nextStage, user.user_id]
    )

    await pool.execute(
      `INSERT INTO growth_cycle_stage_log (crop_id, stage_key, note, created_by)
       VALUES (?, ?, ?, ?)`,
      [cropId, nextStage, note || null, user.user_id]
    )

    res.json({ message: '阶段切换成功' })
  } catch (error) {
    console.error('cycle/stage error', error)
    const status = error.status || 500
    res.status(status).json({ message: '服务器错误', error: error.message })
  }
})

// 4) 新增农事操作（复用 operation_record）
router.post('/cycle/operation/:cropId', authenticateToken, async (req, res) => {
  try {
    const { cropId } = req.params
    const { operation_type, operation_detail, operation_time } = req.body
    const user = req.user

    const [crops] = await pool.execute(
      `SELECT crop_id, farm_id FROM crop WHERE crop_id = ?`,
      [cropId]
    )
    if (!crops?.length) return res.status(404).json({ message: '作物不存在' })
    const crop = crops[0]
    assertCropAccess(user, crop.farm_id)

    if (!operation_type || !operation_detail) {
      return res.status(400).json({ message: '操作类型和内容为必填' })
    }

    const timeVal = operation_time ? new Date(operation_time) : new Date()

    await pool.execute(
      `INSERT INTO operation_record (user_id, farm_id, operation_type, operation_time, relate_id, operation_detail)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [user.user_id, crop.farm_id, operation_type, timeVal, cropId, operation_detail]
    )

    res.status(201).json({ message: '操作记录已添加' })
  } catch (error) {
    console.error('cycle/operation create error', error)
    const status = error.status || 500
    res.status(status).json({ message: '服务器错误', error: error.message })
  }
})

// 5) 更新农事操作
router.put('/cycle/operation/:cropId/:recordId', authenticateToken, async (req, res) => {
  try {
    const { cropId, recordId } = req.params
    const { operation_type, operation_detail, operation_time } = req.body
    const user = req.user

    // 只允许管理员/运维/农户编辑（但不做删除）
    if (!operation_type || !operation_detail) {
      return res.status(400).json({ message: '操作类型和内容为必填' })
    }

    const [rows] = await pool.execute(
      `SELECT orr.record_id, orr.farm_id, orr.user_id
       FROM operation_record orr
       WHERE orr.record_id = ? AND orr.relate_id = ?`,
      [recordId, cropId]
    )
    if (!rows?.length) return res.status(404).json({ message: '记录不存在' })
    const record = rows[0]
    assertCropAccess(user, record.farm_id)

    // Farmer/运维：允许编辑自己的记录；管理员：全允许
    if (user.role_id !== 1 && record.user_id !== user.user_id) {
      return res.status(403).json({ message: '无权编辑他人记录' })
    }

    const timeVal = operation_time ? new Date(operation_time) : new Date()
    await pool.execute(
      `UPDATE operation_record
       SET operation_type = ?, operation_detail = ?, operation_time = ?
       WHERE record_id = ?`,
      [operation_type, operation_detail, timeVal, recordId]
    )
    res.json({ message: '操作记录已更新' })
  } catch (error) {
    console.error('cycle/operation update error', error)
    const status = error.status || 500
    res.status(status).json({ message: '服务器错误', error: error.message })
  }
})

// 6) 删除农事操作（管理员）
router.delete('/cycle/operation/:cropId/:recordId', authenticateToken, async (req, res) => {
  try {
    const { cropId, recordId } = req.params
    const user = req.user

    if (user.role_id !== 1) {
      return res.status(403).json({ message: '仅管理员可删除记录' })
    }

    const [rows] = await pool.execute(
      `SELECT record_id FROM operation_record WHERE record_id = ? AND relate_id = ?`,
      [recordId, cropId]
    )
    if (!rows?.length) return res.status(404).json({ message: '记录不存在' })

    await pool.execute(
      `DELETE FROM operation_record WHERE record_id = ?`,
      [recordId]
    )
    res.json({ message: '删除成功' })
  } catch (error) {
    console.error('cycle/operation delete error', error)
    const status = error.status || 500
    res.status(status).json({ message: '服务器错误', error: error.message })
  }
})

// 7) 删除阶段变更日志（管理员）
router.delete('/cycle/stage-log/:cropId/:logId', authenticateToken, async (req, res) => {
  try {
    const { cropId, logId } = req.params
    const user = req.user

    if (user.role_id !== 1) {
      return res.status(403).json({ message: '仅管理员可删除阶段记录' })
    }

    await pool.execute(
      `DELETE FROM growth_cycle_stage_log
       WHERE log_id = ? AND crop_id = ?`,
      [logId, cropId]
    )
    res.json({ message: '删除成功' })
  } catch (error) {
    console.error('cycle/stage-log delete error', error)
    const status = error.status || 500
    res.status(status).json({ message: '服务器错误', error: error.message })
  }
})

module.exports = router;

