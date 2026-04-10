const express = require('express')
const router = express.Router()
const pool = require('../config/database')
const authenticateToken = require('../middleware/auth')
const { triggerEnvironmentWarning } = require('../lib/smartWarning')
const { getScopedFarmId, isNoFarmForNonAdmin, assertFarmAccess } = require('../lib/dataScope')

let schemaReady = false
const simState = new Map()

async function ensureEnvSchema() {
  if (schemaReady) return
  const addCol = async (table, name, sql) => {
    const [rows] = await pool.execute(
      `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, name]
    )
    if (rows?.length) return
    await pool.execute(sql)
  }

  await addCol(
    'environment_monitor',
    'plant_area',
    `ALTER TABLE environment_monitor ADD COLUMN plant_area VARCHAR(100) DEFAULT NULL COMMENT '种植区域'`
  )
  await addCol(
    'environment_monitor',
    'soil_moisture',
    `ALTER TABLE environment_monitor ADD COLUMN soil_moisture DECIMAL(5,2) DEFAULT NULL COMMENT '土壤湿度(%)'`
  )
  await addCol(
    'environment_monitor',
    'light_lux',
    `ALTER TABLE environment_monitor ADD COLUMN light_lux DECIMAL(12,2) DEFAULT NULL COMMENT '光照(lux)'`
  )

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS environment_exception_log (
      log_id INT AUTO_INCREMENT PRIMARY KEY,
      farm_id INT NOT NULL,
      plant_area VARCHAR(100) DEFAULT NULL,
      exception_type VARCHAR(50) NOT NULL,
      detail VARCHAR(500) DEFAULT NULL,
      temperature DECIMAL(5,2) DEFAULT NULL,
      humidity DECIMAL(5,2) DEFAULT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_env_exc_farm_time (farm_id, created_at),
      INDEX idx_env_exc_type (exception_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='环境监测触发的异常/预警记录'
  `)

  schemaReady = true
}

function evalMetrics(row) {
  const t = row.temperature != null ? Number(row.temperature) : null
  const h = row.humidity != null ? Number(row.humidity) : null
  const sm = row.soil_moisture != null ? Number(row.soil_moisture) : null
  const lux = row.light_lux != null ? Number(row.light_lux) : null

  const metrics = []
  const hints = []

  const push = (key, label, value, unit, ok, abnormalMsg, suggest) => {
    metrics.push({
      key,
      label,
      value,
      unit,
      status: ok ? 'normal' : 'abnormal',
      message: ok ? null : abnormalMsg,
      suggest: suggest || null
    })
    if (!ok) {
      if (suggest) hints.push({ type: key, level: 'warn', text: suggest })
      else hints.push({ type: key, level: 'warn', text: abnormalMsg })
    }
  }

  if (t != null && !Number.isNaN(t)) {
    const ok = t >= 12 && t <= 36
    push(
      'temperature',
      '温度',
      t,
      '℃',
      ok,
      t < 12 ? '温度偏低，可能影响作物生长' : '温度偏高，注意通风或遮阳',
      t > 34 ? '高温时段建议加强遮阳与灌溉降温' : t < 8 ? '低温预警，建议覆盖保温' : null
    )
  }

  if (h != null && !Number.isNaN(h)) {
    const ok = h >= 38 && h <= 85
    const low = h < 38
    push(
      'humidity',
      '空气湿度',
      h,
      '%',
      ok,
      low ? '湿度过低' : '湿度过高，注意防病',
      low ? '空气湿度偏低，建议适当灌溉或喷雾增湿' : null
    )
  }

  if (sm != null && !Number.isNaN(sm)) {
    const ok = sm >= 28 && sm <= 85
    push(
      'soil_moisture',
      '土壤湿度',
      sm,
      '%',
      ok,
      sm < 28 ? '土壤偏干' : '土壤过湿，注意排水',
      sm < 30 ? '土壤湿度不足，建议安排灌溉' : null
    )
  }

  if (lux != null && !Number.isNaN(lux)) {
    const ok = lux >= 2000 && lux <= 100000
    push(
      'light_lux',
      '光照',
      lux,
      'lux',
      ok,
      lux < 2000 ? '光照偏弱' : '光照过强',
      lux < 2500 ? '光照不足，检查棚膜或补光' : null
    )
  }

  const ph = row.soil_ph != null ? Number(row.soil_ph) : null
  if (ph != null && !Number.isNaN(ph)) {
    const ok = ph >= 5.5 && ph <= 7.5
    push('soil_ph', '土壤pH', ph, '', ok, ph < 5.5 ? '土壤偏酸' : '土壤偏碱', null)
  }

  const overall =
    metrics.length && metrics.every((m) => m.status === 'normal') ? 'normal' : metrics.some((m) => m.status === 'abnormal') ? 'abnormal' : 'unknown'

  return { metrics, hints, overall }
}

function nextReading(key) {
  let s = simState.get(key)
  if (!s) {
    s = {
      temperature: 22 + Math.random() * 6,
      humidity: 55 + Math.random() * 15,
      soil_moisture: 45 + Math.random() * 20,
      light_lux: 8000 + Math.random() * 12000,
      soil_ph: 6.2 + Math.random() * 0.8
    }
  }
  const drift = () => (Math.random() - 0.5) * 2.2
  s.temperature = Math.min(40, Math.max(2, s.temperature + drift()))
  s.humidity = Math.min(95, Math.max(18, s.humidity + drift() * 1.5))
  s.soil_moisture = Math.min(92, Math.max(15, s.soil_moisture + drift()))
  s.light_lux = Math.min(95000, Math.max(400, s.light_lux + drift() * 800))
  s.soil_ph = Math.min(8, Math.max(5, s.soil_ph + drift() * 0.05))
  if (Math.random() < 0.08) s.humidity -= 8
  if (Math.random() < 0.06) s.temperature += 5
  simState.set(key, s)
  return {
    temperature: Number(s.temperature.toFixed(1)),
    humidity: Number(s.humidity.toFixed(1)),
    soil_moisture: Number(s.soil_moisture.toFixed(1)),
    light_lux: Math.round(s.light_lux),
    soil_ph: Number(s.soil_ph.toFixed(1))
  }
}

async function simulateTick() {
  await ensureEnvSchema()
  const [farms] = await pool.execute(`SELECT farm_id FROM farm`)
  if (!farms?.length) return

  for (const f of farms) {
    const [areas] = await pool.execute(
      `SELECT DISTINCT plant_area FROM crop WHERE farm_id = ? AND plant_area IS NOT NULL AND TRIM(plant_area) <> ''`,
      [f.farm_id]
    )
    const list = areas?.length ? areas.map((a) => a.plant_area) : ['默认监测区']
    for (const area of list) {
      const key = `${f.farm_id}|${area}`
      const r = nextReading(key)
      await pool.execute(
        `INSERT INTO environment_monitor (farm_id, plant_area, temperature, humidity, soil_ph, soil_moisture, light_lux, monitor_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [f.farm_id, area, r.temperature, r.humidity, r.soil_ph, r.soil_moisture, r.light_lux]
      )

      if (r.temperature > 36 || r.temperature < 6) {
        await triggerEnvironmentWarning(pool, {
          farmId: f.farm_id,
          plantArea: area,
          kind: '温度异常',
          detail: `监测温度 ${r.temperature}℃，超出适宜范围`,
          warningLevel: 1,
          temperature: r.temperature,
          humidity: r.humidity
        })
      }
      if (r.humidity < 32) {
        await triggerEnvironmentWarning(pool, {
          farmId: f.farm_id,
          plantArea: area,
          kind: '湿度过低',
          detail: `空气湿度 ${r.humidity}%，建议关注灌溉`,
          warningLevel: 2,
          temperature: r.temperature,
          humidity: r.humidity
        })
      }
      if (r.soil_moisture < 26) {
        await triggerEnvironmentWarning(pool, {
          farmId: f.farm_id,
          plantArea: area,
          kind: '缺水',
          detail: `土壤湿度 ${r.soil_moisture}% 偏低，建议灌溉`,
          warningLevel: 2,
          temperature: r.temperature,
          humidity: r.humidity
        })
      }
    }
  }
}

let simTimer = null
function startSimulator() {
  if (simTimer) return
  simTimer = setInterval(() => simulateTick().catch((e) => console.error('env simulate:', e)), 40000)
  setTimeout(() => simulateTick().catch((e) => console.error('env simulate:', e)), 2000)
}
startSimulator()

router.get('/areas', authenticateToken, async (req, res) => {
  try {
    await ensureEnvSchema()
    const user = req.user
    const { farm_id } = req.query
    const fid = getScopedFarmId(user, farm_id)
    if (!fid) {
      const [farms] =
        user.role_id === 1
          ? await pool.execute(`SELECT farm_id, farm_name FROM farm ORDER BY farm_name`)
          : await pool.execute(`SELECT farm_id, farm_name FROM farm WHERE farm_id = ?`, [user.farm_id])
      return res.json({ farms: farms || [], areas: [] })
    }
    assertFarmAccess(user, fid)
    const [farms] = await pool.execute(`SELECT farm_id, farm_name FROM farm ORDER BY farm_name`)
    const [areas] = await pool.execute(
      `SELECT DISTINCT plant_area AS area_name FROM crop WHERE farm_id = ? AND plant_area IS NOT NULL AND TRIM(plant_area) <> '' ORDER BY plant_area`,
      [fid]
    )
    const withDefault = [{ area_name: '默认监测区' }, ...areas]
    res.json({ farms: user.role_id === 1 ? farms : farms.filter((x) => String(x.farm_id) === String(user.farm_id)), areas: withDefault })
  } catch (error) {
    console.error('environment/areas error:', error)
    res.status(error.status || 500).json({ message: '服务器错误', error: error.message })
  }
})

router.get('/latest', authenticateToken, async (req, res) => {
  try {
    await ensureEnvSchema()
    const user = req.user
    const { farm_id, plant_area } = req.query
    const fid = getScopedFarmId(user, farm_id)
    if (isNoFarmForNonAdmin(user, fid)) {
      return res.json({ panels: [], hints: [], generated_at: new Date().toISOString() })
    }

    let innerWhere = 'WHERE 1=1'
    const params = []
    if (fid) {
      assertFarmAccess(user, fid)
      innerWhere += ' AND farm_id = ?'
      params.push(fid)
    }
    if (plant_area) {
      innerWhere += ' AND COALESCE(plant_area,\'\') = ?'
      params.push(plant_area)
    }

    const [rows] = await pool.execute(
      `
      SELECT e.monitor_id, e.farm_id, f.farm_name, e.plant_area, e.temperature, e.humidity, e.soil_ph,
             e.soil_moisture, e.light_lux, e.monitor_time
      FROM environment_monitor e
      INNER JOIN farm f ON f.farm_id = e.farm_id
      INNER JOIN (
        SELECT farm_id, COALESCE(plant_area,'') AS zona, MAX(monitor_id) AS mid
        FROM environment_monitor
        ${innerWhere}
        GROUP BY farm_id, COALESCE(plant_area,'')
      ) t ON e.monitor_id = t.mid AND e.farm_id = t.farm_id AND COALESCE(e.plant_area,'') = t.zona
      ORDER BY f.farm_name, e.plant_area
      `,
      params
    )

    const subLatest = rows || []
    const panels = []
    const globalHints = []

    for (const row of subLatest) {
      const { metrics, hints, overall } = evalMetrics(row)
      if (hints.length) globalHints.push(...hints.map((h) => ({ ...h, farm_name: row.farm_name, plant_area: row.plant_area || '默认监测区' })))
      panels.push({
        farm_id: row.farm_id,
        farm_name: row.farm_name,
        plant_area: row.plant_area || '默认监测区',
        monitor_time: row.monitor_time,
        soil_ph: row.soil_ph != null ? Number(row.soil_ph) : null,
        overall_status: overall,
        metrics,
        irrigation_suggest:
          (row.humidity != null && Number(row.humidity) < 40) || (row.soil_moisture != null && Number(row.soil_moisture) < 32)
            ? '当前湿度/土壤湿度偏低，建议安排灌溉。'
            : null
      })
    }

    res.json({
      panels,
      hints: globalHints,
      generated_at: new Date().toISOString()
    })
  } catch (error) {
    console.error('environment/latest error:', error)
    res.status(error.status || 500).json({ message: '服务器错误', error: error.message })
  }
})

router.get('/history', authenticateToken, async (req, res) => {
  try {
    await ensureEnvSchema()
    const user = req.user
    const { farm_id, plant_area, from, to, limit = 500 } = req.query
    const fid = getScopedFarmId(user, farm_id)
    if (isNoFarmForNonAdmin(user, fid)) return res.status(400).json({ message: '请选择农场' })
    if (!fid) return res.status(400).json({ message: '请选择农场' })
    assertFarmAccess(user, fid)

    let where = 'WHERE m.farm_id = ?'
    const params = [fid]
    if (plant_area) {
      where += ' AND COALESCE(m.plant_area,\'\') = ?'
      params.push(plant_area)
    }
    if (from) {
      where += ' AND m.monitor_time >= ?'
      params.push(`${from} 00:00:00`)
    }
    if (to) {
      where += ' AND m.monitor_time <= ?'
      params.push(`${to} 23:59:59`)
    }

    const lim = Math.min(2000, Math.max(10, Number(limit) || 500))
    const [series] = await pool.execute(
      `
      SELECT m.monitor_time, m.temperature, m.humidity, m.soil_moisture, m.light_lux, m.soil_ph, m.plant_area
      FROM environment_monitor m
      ${where}
      ORDER BY m.monitor_time ASC
      LIMIT ${lim}
      `,
      params
    )

    res.json({ data: series || [] })
  } catch (error) {
    console.error('environment/history error:', error)
    res.status(error.status || 500).json({ message: '服务器错误', error: error.message })
  }
})

router.get('/report', authenticateToken, async (req, res) => {
  try {
    await ensureEnvSchema()
    const user = req.user
    const { farm_id, plant_area, from, to } = req.query
    const fid = getScopedFarmId(user, farm_id)
    if (isNoFarmForNonAdmin(user, fid)) return res.status(400).json({ message: '请选择农场' })
    if (!fid) return res.status(400).json({ message: '请选择农场' })
    assertFarmAccess(user, fid)

    let where = 'WHERE m.farm_id = ?'
    const params = [fid]
    if (plant_area) {
      where += ' AND COALESCE(m.plant_area,\'\') = ?'
      params.push(plant_area)
    }
    const fromDay = from || new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)
    const toDay = to || new Date().toISOString().slice(0, 10)
    where += ' AND m.monitor_time >= ? AND m.monitor_time <= ?'
    params.push(`${fromDay} 00:00:00`, `${toDay} 23:59:59`)

    const [avgRows] = await pool.execute(
      `
      SELECT
        COUNT(*) AS sample_count,
        AVG(m.temperature) AS avg_temp,
        AVG(m.humidity) AS avg_humidity,
        AVG(m.soil_moisture) AS avg_soil_moisture,
        AVG(m.light_lux) AS avg_light,
        MIN(m.temperature) AS min_temp,
        MAX(m.temperature) AS max_temp,
        MIN(m.humidity) AS min_humidity,
        MAX(m.humidity) AS max_humidity
      FROM environment_monitor m
      ${where}
      `,
      params
    )

    const tStart = new Date(`${fromDay}T00:00:00`).getTime()
    const tEnd = new Date(`${toDay}T23:59:59`).getTime()
    const split = new Date((tStart + tEnd) / 2)
    const fmt = (d) => {
      const p = (n) => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
    }
    const splitStr = fmt(split)

    const baseWhere = 'WHERE m.farm_id = ?'
    const baseParams = [fid]
    if (plant_area) {
      baseParams.push(plant_area)
    }
    const areaClause = plant_area ? ' AND COALESCE(m.plant_area,\'\') = ?' : ''

    const [firstHalf] = await pool.execute(
      `SELECT AVG(m.temperature) AS t, AVG(m.humidity) AS h FROM environment_monitor m
       ${baseWhere}${areaClause} AND m.monitor_time >= ? AND m.monitor_time < ?`,
      [...baseParams, `${fromDay} 00:00:00`, splitStr]
    )
    const [secondHalf] = await pool.execute(
      `SELECT AVG(m.temperature) AS t, AVG(m.humidity) AS h FROM environment_monitor m
       ${baseWhere}${areaClause} AND m.monitor_time >= ? AND m.monitor_time <= ?`,
      [...baseParams, splitStr, `${toDay} 23:59:59`]
    )

    const t1 = firstHalf?.[0]?.t != null ? Number(firstHalf[0].t) : null
    const t2 = secondHalf?.[0]?.t != null ? Number(secondHalf[0].t) : null
    let trend_temp = '数据不足'
    if (t1 != null && t2 != null) {
      const d = t2 - t1
      if (Math.abs(d) < 0.3) trend_temp = '温度整体平稳'
      else if (d > 0) trend_temp = `后半段平均温度上升约 ${d.toFixed(1)}℃`
      else trend_temp = `后半段平均温度下降约 ${Math.abs(d).toFixed(1)}℃`
    }

    const h1 = firstHalf?.[0]?.h != null ? Number(firstHalf[0].h) : null
    const h2 = secondHalf?.[0]?.h != null ? Number(secondHalf[0].h) : null
    let trend_hum = '数据不足'
    if (h1 != null && h2 != null) {
      const d = h2 - h1
      if (Math.abs(d) < 1) trend_hum = '湿度整体平稳'
      else if (d > 0) trend_hum = `后半段平均湿度上升约 ${d.toFixed(1)}%`
      else trend_hum = `后半段平均湿度下降约 ${Math.abs(d).toFixed(1)}%`
    }

    const excParams = [fid, `${fromDay} 00:00:00`, `${toDay} 23:59:59`]
    let excWhere = 'WHERE farm_id = ? AND created_at >= ? AND created_at <= ?'
    if (plant_area) {
      excWhere += ' AND COALESCE(plant_area,\'\') = ?'
      excParams.push(plant_area)
    }
    const [excType] = await pool.execute(
      `SELECT exception_type, COUNT(*) AS cnt FROM environment_exception_log ${excWhere} GROUP BY exception_type`,
      excParams
    )

    const [excTotal] = await pool.execute(
      `SELECT COUNT(*) AS total FROM environment_exception_log ${excWhere}`,
      excParams
    )

    res.json({
      period: { from: fromDay, to: toDay },
      averages: avgRows?.[0] || {},
      trend: {
        temperature: trend_temp,
        humidity: trend_hum
      },
      anomalies: {
        total: excTotal?.[0]?.total || 0,
        by_type: excType || []
      }
    })
  } catch (error) {
    console.error('environment/report error:', error)
    res.status(error.status || 500).json({ message: '服务器错误', error: error.message })
  }
})

module.exports = router
