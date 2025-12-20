const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const authenticateToken = require('../middleware/auth');

// 获取气象站数据（最新一条记录，供简单展示或默认值）
router.get('/weather', authenticateToken, async (req, res) => {
  try {
    const { farm_id } = req.query;
    const roleId = req.user.role_id;
    const userFarmId = req.user.farm_id;

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

    // 数据权限
    if (roleId !== 1) {
      if (!userFarmId) {
        return res.json(null);
      }
      query += ' AND em.farm_id = ?';
      params.push(userFarmId);
    } else if (farm_id) {
      query += ' AND em.farm_id = ?';
      params.push(farm_id);
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
    const roleId = req.user.role_id;
    const userFarmId = req.user.farm_id;

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

    // 数据权限
    if (roleId !== 1) {
      if (!userFarmId) {
        return res.json([]);
      }
      query += ' AND em.farm_id = ?';
      params.push(userFarmId);
    } else if (farm_id) {
      query += ' AND em.farm_id = ?';
      params.push(farm_id);
    }

    query += ' ORDER BY em.monitor_time ASC';

    const [rows] = await pool.execute(query, params);
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
    const roleId = req.user.role_id;
    const userFarmId = req.user.farm_id;

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

    // 数据权限
    if (roleId !== 1) {
      if (!userFarmId) {
        return res.json([]);
      }
      query += ' AND farm_id = ?';
      params.push(userFarmId);
    } else if (farm_id) {
      query += ' AND farm_id = ?';
      params.push(farm_id);
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
    const roleId = req.user.role_id;
    const userFarmId = req.user.farm_id;

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

    // 数据权限
    if (roleId !== 1) {
      if (!userFarmId) {
        return res.json([]);
      }
      query += ' AND vd.farm_id = ?';
      params.push(userFarmId);
    } else if (farm_id) {
      query += ' AND vd.farm_id = ?';
      params.push(farm_id);
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
    const roleId = req.user.role_id;
    const userFarmId = req.user.farm_id;

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

    // 数据权限
    if (roleId !== 1) {
      if (!userFarmId) {
        return res.json({ farms: [], devices: [] });
      }
      farmQuery += ' AND f.farm_id = ?';
      farmParams.push(userFarmId);
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

    if (roleId !== 1 && userFarmId) {
      deviceQuery += ' AND f.farm_id = ?';
      deviceParams.push(userFarmId);
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

