const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const authenticateToken = require('../middleware/auth');
const materialRouter = require('./material');
const { getScopedFarmId, isNoFarmForNonAdmin } = require('../lib/dataScope');

/** 与农资模块一致的库存状态 SQL 片段 */
function computedMaterialStockCase() {
  return `
    CASE
      WHEN COALESCE(m.shelf_status,'ON') = 'OFF' THEN '下架'
      WHEN COALESCE(m.stock_num,0) = 0 THEN '缺货'
      WHEN COALESCE(m.stock_num,0) <= COALESCE(m.safety_stock_num,0) THEN '库存不足'
      ELSE '正常'
    END
  `;
}

// 首页库存预警（与 /material/warnings 同源规则，仅返回列表摘要）
router.get('/stock-warnings', authenticateToken, async (req, res) => {
  try {
    await materialRouter.ensureMaterialTables();
    const { farm_id } = req.query;
    const scopedFarmId = getScopedFarmId(req.user, farm_id);

    const params = [];
    let whereSql = 'WHERE 1=1';
    if (isNoFarmForNonAdmin(req.user, scopedFarmId)) {
      return res.json({ total: 0, low_count: 0, out_count: 0, items: [] });
    }
    if (scopedFarmId) {
      whereSql += ' AND m.farm_id = ?';
      params.push(scopedFarmId);
    }

    const stateExpr = computedMaterialStockCase();
    whereSql += ` AND (${stateExpr}) IN ('库存不足', '缺货')`;

    const [statsRows] = await pool.execute(
      `
      SELECT
        SUM(CASE WHEN (${stateExpr}) = '库存不足' THEN 1 ELSE 0 END) AS low_count,
        SUM(CASE WHEN (${stateExpr}) = '缺货' THEN 1 ELSE 0 END) AS out_count
      FROM agricultural_material m
      ${whereSql}
      `,
      params
    );
    const low_count = Number(statsRows?.[0]?.low_count || 0);
    const out_count = Number(statsRows?.[0]?.out_count || 0);
    const total = low_count + out_count;

    const [listRows] = await pool.execute(
      `
      SELECT
        m.material_id,
        m.farm_id,
        f.farm_name,
        m.material_name,
        m.stock_num,
        m.safety_stock_num,
        COALESCE(mwh.handle_status, '未处理') AS handle_status,
        m.updated_at,
        m.created_at,
        ${stateExpr} AS stock_state
      FROM agricultural_material m
      INNER JOIN farm f ON m.farm_id = f.farm_id
      LEFT JOIN material_warning_handle mwh
        ON mwh.farm_id = m.farm_id AND mwh.material_id = m.material_id
      ${whereSql}
      ORDER BY (CASE WHEN (${stateExpr}) = '缺货' THEN 0 ELSE 1 END), m.stock_num ASC, m.material_id DESC
      LIMIT 50
      `,
      params
    );

    const items = (listRows || []).map((row) => {
      const st = row.stock_state;
      const sn = Number(row.stock_num ?? 0);
      const level = st === '缺货' ? 'critical' : 'warning';
      const suggest =
        st === '缺货'
          ? '建议立即采购补充并安排紧急入库'
          : '建议采购补充库存，避免影响生产'
      let line = `【库存】${row.material_name}`;
      if (st === '缺货') line += '缺货';
      else line += `库存不足（当前 ${sn}）`;
      const sortTime =
        row.updated_at ||
        row.created_at ||
        null;
      return {
        kind: 'stock',
        material_id: row.material_id,
        farm_id: row.farm_id,
        farm_name: row.farm_name,
        material_name: row.material_name,
        stock_num: sn,
        safety_stock_num: Number(row.safety_stock_num ?? 0),
        stock_state: st,
        handle_status: row.handle_status || '未处理',
        level,
        suggest_content: suggest,
        line,
        sort_time: sortTime
      };
    });

    res.json({
      total,
      low_count,
      out_count,
      items
    });
  } catch (error) {
    console.error('homepage/stock-warnings error:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// 获取气象站数据（最新一条记录，供简单展示或默认值）
router.get('/weather', authenticateToken, async (req, res) => {
  try {
    const { farm_id } = req.query;
    const scopedFarmId = getScopedFarmId(req.user, farm_id);

    let query = `
      SELECT 
        em.monitor_id,
        em.temperature,
        em.humidity,
        em.soil_ph,
        em.weather_type,
        em.wind_speed,
        em.rainfall,
        em.monitor_time,
        f.farm_name
      FROM environment_monitor em
      INNER JOIN farm f ON em.farm_id = f.farm_id
      WHERE 1=1
    `;
    const params = [];

    if (isNoFarmForNonAdmin(req.user, scopedFarmId)) {
      return res.json(null);
    }
    if (scopedFarmId) {
      query += ' AND em.farm_id = ?';
      params.push(scopedFarmId);
    }

    query += ' ORDER BY em.monitor_time DESC LIMIT 1';

    const [result] = await pool.execute(query, params);
    res.json(result[0] || null);
  } catch (error) {
    console.error('获取气象数据错误:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// 获取气象站历史数据（用于趋势图）
router.get('/weather-history', authenticateToken, async (req, res) => {
  try {
    const { farm_id, range = '24h' } = req.query;
    const scopedFarmId = getScopedFarmId(req.user, farm_id);

    let timeCondition = '';
    if (range === '7d') {
      timeCondition = 'AND em.monitor_time >= NOW() - INTERVAL 7 DAY';
    } else {
      // 默认近24小时
      timeCondition = 'AND em.monitor_time >= NOW() - INTERVAL 24 HOUR';
    }

    let query = `
      SELECT 
        em.monitor_id,
        em.farm_id,
        em.temperature,
        em.humidity,
        em.soil_ph,
        em.weather_type,
        em.wind_speed,
        em.rainfall,
        em.monitor_time
      FROM environment_monitor em
      WHERE 1=1
      ${timeCondition}
    `;
    const params = [];

    if (isNoFarmForNonAdmin(req.user, scopedFarmId)) {
      return res.json([]);
    }
    if (scopedFarmId) {
      query += ' AND em.farm_id = ?';
      params.push(scopedFarmId);
    }

    query += ' ORDER BY em.monitor_time ASC';

    const [rows] = await pool.execute(query, params);

    // 若时间窗口内无数据，则回退为最近 48 条，避免前端“暂无数据”
    if (!rows || rows.length === 0) {
      let fallbackQuery = `
        SELECT temperature, humidity, soil_ph, monitor_time
        FROM environment_monitor
        WHERE 1=1
        ${scopedFarmId ? 'AND farm_id = ?' : ''}
        ORDER BY monitor_time DESC
        LIMIT 48
      `
      const fallbackParams = []
      if (scopedFarmId) fallbackParams.push(scopedFarmId)

      const [fallbackRows] = await pool.execute(fallbackQuery, fallbackParams)
      const ascRows = (fallbackRows || []).sort((a, b) => new Date(a.monitor_time) - new Date(b.monitor_time))
      return res.json(ascRows)
    }

    res.json(rows);
  } catch (error) {
    console.error('获取气象历史数据错误:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// 获取设备统计（按设备大类+状态分组）
router.get('/device-stats', authenticateToken, async (req, res) => {
  try {
    const { farm_id } = req.query;
    const scopedFarmId = getScopedFarmId(req.user, farm_id);

    let query = `
      SELECT 
        device_category,
        device_status,
        COUNT(*) as count,
        COUNT(CASE WHEN device_status = '在线' THEN 1 END) as online_count,
        COUNT(CASE WHEN device_status = '离线' THEN 1 END) as offline_count,
        COUNT(CASE WHEN device_status = '故障' THEN 1 END) as fault_count
      FROM monitor_device
      WHERE 1=1
    `;
    const params = [];

    if (isNoFarmForNonAdmin(req.user, scopedFarmId)) {
      return res.json([]);
    }
    if (scopedFarmId) {
      query += ' AND farm_id = ?';
      params.push(scopedFarmId);
    }

    query += ' GROUP BY device_category, device_status ORDER BY device_category';

    const [result] = await pool.execute(query, params);

    // 重新组织数据格式
    const stats = {};
    result.forEach(row => {
      if (!stats[row.device_category]) {
        stats[row.device_category] = {
          category: row.device_category,
          total: 0,
          online: 0,
          offline: 0,
          fault: 0
        };
      }
      stats[row.device_category].total += row.count;
      stats[row.device_category].online += row.online_count || 0;
      stats[row.device_category].offline += row.offline_count || 0;
      stats[row.device_category].fault += row.fault_count || 0;
    });

    res.json(Object.values(stats));
  } catch (error) {
    console.error('获取设备统计错误:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// 获取视频设备列表
router.get('/videos', authenticateToken, async (req, res) => {
  try {
    const { farm_id } = req.query;
    const scopedFarmId = getScopedFarmId(req.user, farm_id);

    let query = `
      SELECT 
        vd.id,
        vd.video_url,
        vd.video_status,
        md.device_name,
        md.install_location,
        f.farm_name
      FROM video_device vd
      INNER JOIN monitor_device md ON vd.device_id = md.device_id
      INNER JOIN farm f ON vd.farm_id = f.farm_id
      WHERE 1=1
    `;
    const params = [];

    if (isNoFarmForNonAdmin(req.user, scopedFarmId)) {
      return res.json([]);
    }
    if (scopedFarmId) {
      query += ' AND vd.farm_id = ?';
      params.push(scopedFarmId);
    }

    query += ' ORDER BY vd.id DESC';

    const [result] = await pool.execute(query, params);
    res.json(result);
  } catch (error) {
    console.error('获取视频列表错误:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// 获取地图概览数据（农场位置和设备分布）
router.get('/map-overview', authenticateToken, async (req, res) => {
  try {
    const scopedFarmId = getScopedFarmId(req.user, req.query.farm_id);

    let farmQuery = `
      SELECT 
        f.farm_id,
        f.farm_name,
        f.address,
        f.longitude,
        f.latitude,
        COUNT(DISTINCT md.device_id) as device_count,
        COUNT(DISTINCT c.crop_id) as crop_count
      FROM farm f
      LEFT JOIN monitor_device md ON f.farm_id = md.farm_id
      LEFT JOIN crop c ON f.farm_id = c.farm_id
      WHERE 1=1
    `;
    const farmParams = [];

    if (isNoFarmForNonAdmin(req.user, scopedFarmId)) return res.json({ farms: [], devices: [] });
    if (scopedFarmId) {
      farmQuery += ' AND f.farm_id = ?';
      farmParams.push(scopedFarmId);
    }

    farmQuery += ' GROUP BY f.farm_id HAVING f.longitude IS NOT NULL AND f.latitude IS NOT NULL';

    const [farms] = await pool.execute(farmQuery, farmParams);

    // 获取设备分布
    let deviceQuery = `
      SELECT 
        md.device_id,
        md.device_name,
        md.install_location,
        md.device_status,
        md.device_category,
        f.farm_id,
        f.farm_name,
        f.longitude,
        f.latitude
      FROM monitor_device md
      INNER JOIN farm f ON md.farm_id = f.farm_id
      WHERE f.longitude IS NOT NULL AND f.latitude IS NOT NULL
    `;
    const deviceParams = [];

    if (scopedFarmId) {
      deviceQuery += ' AND f.farm_id = ?';
      deviceParams.push(scopedFarmId);
    }

    const [devices] = await pool.execute(deviceQuery, deviceParams);

    res.json({
      farms,
      devices
    });
  } catch (error) {
    console.error('获取地图数据错误:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

module.exports = router;

