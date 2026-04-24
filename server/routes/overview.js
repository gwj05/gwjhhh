const express = require('express')
const router = express.Router()
const pool = require('../config/database')
const authenticateToken = require('../middleware/auth')
const materialRouter = require('./material')
const { getScopedFarmId, isNoFarmForNonAdmin } = require('../lib/dataScope')

function clamp(n, a, b) {
  return Math.min(b, Math.max(a, n))
}

const IRRIGATION_PRESETS = [
  { strategy_key: 'water_saving', strategy_name: '节水稳产', interval_hours: 24, duration_minutes: 16, target_moisture: 30 },
  { strategy_key: 'balanced', strategy_name: '平衡策略', interval_hours: 18, duration_minutes: 22, target_moisture: 33 },
  { strategy_key: 'boost_growth', strategy_name: '促生长', interval_hours: 12, duration_minutes: 28, target_moisture: 36 }
]
const farmIrrigationStrategy = new Map() // key: farmId|null(all) -> strategy_key
const userIrrigationStrategy = new Map() // key: userId -> Map(farmId|null -> strategy_key)
let ensuredOverviewTables = false

async function ensureOverviewTables() {
  if (ensuredOverviewTables) return
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS overview_user_pref (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      farm_id INT DEFAULT NULL COMMENT 'NULL 表示全部农场',
      irrigation_strategy_key VARCHAR(40) DEFAULT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_overview_pref_user_farm (user_id, farm_id),
      INDEX idx_overview_pref_user (user_id),
      INDEX idx_overview_pref_farm (farm_id),
      FOREIGN KEY (user_id) REFERENCES user(user_id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
  ensuredOverviewTables = true
}

function makePurchaseNo() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const s = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  return `PO${s}${Math.floor(Math.random() * 900 + 100)}`
}

function computedMaterialStockCase() {
  return `
    CASE
      WHEN COALESCE(m.shelf_status,'ON') = 'OFF' THEN '下架'
      WHEN COALESCE(m.stock_num,0) = 0 THEN '缺货'
      WHEN COALESCE(m.stock_num,0) <= COALESCE(m.safety_stock_num,0) THEN '库存不足'
      ELSE '正常'
    END
  `
}

async function getStockWarnings(scopedFarmId) {
  await materialRouter.ensureMaterialTables()
  const params = []
  let whereSql = 'WHERE 1=1'
  if (scopedFarmId) {
    whereSql += ' AND m.farm_id = ?'
    params.push(scopedFarmId)
  }
  const stateExpr = computedMaterialStockCase()
  whereSql += ` AND (${stateExpr}) IN ('库存不足', '缺货')`

  const [statsRows] = await pool.execute(
    `
    SELECT
      SUM(CASE WHEN (${stateExpr}) = '库存不足' THEN 1 ELSE 0 END) AS low_count,
      SUM(CASE WHEN (${stateExpr}) = '缺货' THEN 1 ELSE 0 END) AS out_count
    FROM agricultural_material m
    ${whereSql}
    `,
    params
  )
  const low_count = Number(statsRows?.[0]?.low_count || 0)
  const out_count = Number(statsRows?.[0]?.out_count || 0)
  const total = low_count + out_count

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
      ${stateExpr} AS stock_state,
      m.updated_at,
      m.created_at
    FROM agricultural_material m
    INNER JOIN farm f ON m.farm_id = f.farm_id
    LEFT JOIN material_warning_handle mwh
      ON mwh.farm_id = m.farm_id AND mwh.material_id = m.material_id
    ${whereSql}
    ORDER BY (CASE WHEN (${stateExpr}) = '缺货' THEN 0 ELSE 1 END), m.stock_num ASC, m.material_id DESC
    LIMIT 8
    `,
    params
  )

  const items = (listRows || []).map((row) => {
    const st = row.stock_state
    const sn = Number(row.stock_num ?? 0)
    const sortTime = row.updated_at || row.created_at || null
    return {
      material_id: row.material_id,
      farm_id: row.farm_id,
      farm_name: row.farm_name,
      material_name: row.material_name,
      stock_num: sn,
      safety_stock_num: Number(row.safety_stock_num ?? 0),
      handle_status: row.handle_status || '未处理',
      stock_state: st,
      level: st === '缺货' ? 'critical' : 'warning',
      sort_time: sortTime
    }
  })

  // 推荐采购：优先缺货，其次库存不足；建议采购量=安全库存-当前库存（缺货时至少 1）
  const recommend_purchase = items
    .slice()
    .sort((a, b) => {
      const sa = a.stock_state === '缺货' ? 0 : 1
      const sb = b.stock_state === '缺货' ? 0 : 1
      if (sa !== sb) return sa - sb
      return (a.stock_num ?? 0) - (b.stock_num ?? 0)
    })
    .slice(0, 5)
    .map((it) => {
      const gap = Math.max(0, Number(it.safety_stock_num || 0) - Number(it.stock_num || 0))
      const suggestQty = it.stock_state === '缺货' ? Math.max(1, gap || 1) : Math.max(1, gap)
      const reason = it.stock_state === '缺货'
        ? '当前为缺货，建议优先补齐到安全库存'
        : '低于安全库存，建议补齐到阈值以上'
      return {
        material_id: it.material_id,
        material_name: it.material_name,
        farm_name: it.farm_name,
        stock_state: it.stock_state,
        handled: String(it.handle_status || '') === '已处理',
        suggest_qty: suggestQty,
        reason
      }
    })

  return { total, low_count, out_count, items, recommend_purchase }
}

async function getPestRisk(scopedFarmId) {
  // 最新一条：管理员“全部”时做全局聚合（每个农场取最新一条再聚合）
  let latestQuery = `
    SELECT
      AVG(em.temperature) AS temperature,
      AVG(em.humidity) AS humidity,
      AVG(COALESCE(em.rainfall, 0)) AS rainfall,
      MAX(em.monitor_time) AS monitor_time,
      COUNT(*) AS sample_count
    FROM environment_monitor em
    INNER JOIN (
      SELECT farm_id, MAX(monitor_id) AS mid
      FROM environment_monitor
      GROUP BY farm_id
    ) x ON em.monitor_id = x.mid
    WHERE 1=1
  `
  const params = []
  if (scopedFarmId) {
    latestQuery += ' AND em.farm_id = ?'
    params.push(scopedFarmId)
  }
  const [latestRows] = await pool.execute(latestQuery, params)
  const row = latestRows?.[0] || {}
  const t = row.temperature != null ? Number(row.temperature) : null
  const h = row.humidity != null ? Number(row.humidity) : null
  const r = row.rainfall != null ? Number(row.rainfall) : 0
  const sampleCount = Number(row.sample_count || 0)

  // 同期历史：去年±3天病虫害异常次数
  let histQuery = `
    SELECT COUNT(*) AS cnt
    FROM crop_exception ce
    INNER JOIN crop c ON c.crop_id = ce.crop_id
    WHERE ce.exception_time >= DATE_SUB(DATE_SUB(NOW(), INTERVAL 1 YEAR), INTERVAL 3 DAY)
      AND ce.exception_time <= DATE_ADD(DATE_SUB(NOW(), INTERVAL 1 YEAR), INTERVAL 3 DAY)
      AND (
        ce.exception_type LIKE '%病%'
        OR ce.exception_type LIKE '%虫%'
        OR ce.exception_type = '病虫害'
      )
  `
  const histParams = []
  if (scopedFarmId) {
    histQuery += ' AND c.farm_id = ?'
    histParams.push(scopedFarmId)
  }
  const [histRows] = await pool.execute(histQuery, histParams)
  const lastYearCount = Number(histRows?.[0]?.cnt || 0)

  if (t == null || h == null) {
    return {
      risk_index: 0,
      risk_level: '低',
      confidence: '低',
      confidence_score: 0.35,
      suggest_window: '暂无有效监测数据',
      suggest_action: '请先补充温湿度监测数据',
      explain: {
        factors: ['缺少温湿度监测数据，无法计算规则评分'],
        thresholds: ['湿度阈值：≥90/85/80/75/70', '温度阈值：20~30 最适', '降雨阈值：≥1/4/8mm'],
        confidence_source: ['数据完整性（温/湿/雨）', '样本量（各农场最新记录聚合）']
      },
      latest: { temperature: t, humidity: h, rainfall: r, monitor_time: row.monitor_time || null },
      last_year_same_period: { happened: lastYearCount > 0, count: lastYearCount }
    }
  }

  const humidityScore =
    h >= 90 ? 48 :
    h >= 85 ? 42 :
    h >= 80 ? 34 :
    h >= 75 ? 24 :
    h >= 70 ? 14 : 6
  const tempScore =
    (t >= 20 && t <= 30) ? 24 :
    (t >= 16 && t < 20) || (t > 30 && t <= 33) ? 16 :
    (t >= 12 && t < 16) || (t > 33 && t <= 36) ? 8 : 3
  const rainScore =
    r >= 8 ? 16 :
    r >= 4 ? 12 :
    r >= 1 ? 7 : 0
  const wetLeafProxyScore = (h >= 85 && r >= 2) ? 12 : (h >= 80 && r >= 1 ? 6 : 0)
  const historyScore = lastYearCount > 5 ? 10 : lastYearCount > 0 ? 6 : 0

  const riskIndex = clamp(Math.round(humidityScore + tempScore + rainScore + wetLeafProxyScore + historyScore), 0, 100)
  const riskLevel = riskIndex >= 75 ? '高' : riskIndex >= 50 ? '中' : '低'
  const suggestWindow =
    riskLevel === '高'
      ? '未来 24-48 小时为重点防治窗口'
      : riskLevel === '中'
        ? '未来 48 小时建议加密巡查'
        : '未来 72 小时常规巡查即可'
  const suggestAction =
    riskLevel === '高'
      ? '建议立即开展病虫害预防处理，优先排查高湿地块'
      : riskLevel === '中'
        ? '建议提前准备防治药剂并关注叶面湿润时段'
        : '建议维持常规管理，关注天气突变'

  const completeness = (t != null ? 1 : 0) + (h != null ? 1 : 0) + (r != null ? 1 : 0)
  const confidenceScore = clamp(0.4 + completeness * 0.15 + Math.min(sampleCount, 5) * 0.03, 0.35, 0.95)
  const confidence = confidenceScore >= 0.8 ? '高' : confidenceScore >= 0.6 ? '中' : '低'

  const factors = []
  if (h >= 85) factors.push(`湿度偏高（${Number(h.toFixed(1))}%）`)
  if (t >= 20 && t <= 30) factors.push(`温度适宜（${Number(t.toFixed(1))}℃）`)
  if (r >= 1) factors.push(`存在降雨（${Number(r.toFixed(1))}mm）`)
  if (h >= 85 && r >= 2) factors.push('叶面湿润代理条件满足（高湿+降雨）')
  if (lastYearCount > 0) factors.push(`去年同期有记录（${lastYearCount}条）`)

  return {
    risk_index: riskIndex,
    risk_level: riskLevel,
    confidence,
    confidence_score: Number(confidenceScore.toFixed(2)),
    suggest_window: suggestWindow,
    suggest_action: suggestAction,
    explain: {
      factors: factors.length ? factors : ['当前触发因子不明显（风险偏低）'],
      thresholds: ['高风险≥75，中风险≥50', '湿度权重最高，其次温度/降雨/湿叶代理/历史'],
      confidence_source: [`数据完整性：${completeness}/3`, `样本量：${sampleCount}`]
    },
    latest: {
      temperature: Number(Number(t).toFixed(1)),
      humidity: Number(Number(h).toFixed(1)),
      rainfall: Number(Number(r || 0).toFixed(1)),
      monitor_time: row.monitor_time || null
    },
    last_year_same_period: { happened: lastYearCount > 0, count: lastYearCount }
  }
}

async function getSoilForecast(scopedFarmId) {
  // 用“最新监测 soil_moisture + 近24h 环境均值”做 48h 规则外推
  let latestQuery = `
    SELECT em.soil_moisture, em.temperature, em.humidity, COALESCE(em.rainfall,0) AS rainfall, em.monitor_time
    FROM environment_monitor em
    WHERE 1=1
  `
  const params = []
  if (scopedFarmId) {
    latestQuery += ' AND em.farm_id = ?'
    params.push(scopedFarmId)
  }
  latestQuery += ' ORDER BY em.monitor_id DESC LIMIT 1'
  const [latestRows] = await pool.execute(latestQuery, params)
  const cur = latestRows?.[0]
  const current = cur?.soil_moisture != null ? Number(cur.soil_moisture) : null
  const t = cur?.temperature != null ? Number(cur.temperature) : null
  const h = cur?.humidity != null ? Number(cur.humidity) : null
  const r = cur?.rainfall != null ? Number(cur.rainfall) : 0

  if (current == null || !Number.isFinite(current)) {
    return {
      current_soil_moisture: null,
      confidence: '低',
      points: [],
      recommendation: '数据不足',
      irrigation_mm: 0,
      advice: '暂无土壤湿度监测数据，无法进行 48 小时外推',
      explain: {
        factors: ['缺少土壤湿度监测'],
        thresholds: ['立即灌溉：预测<22%', '推迟灌溉：预测<28%'],
        confidence_source: ['数据完整性（温/湿/雨）', '外推为规则近似，非物理模型']
      }
    }
  }

  const tempFactor = t == null ? 0 : clamp((t - 18) / 20, -0.2, 0.6)
  const humFactor = h == null ? 0 : clamp((70 - h) / 100, -0.3, 0.4)
  const rainFactor = clamp((r || 0) / 10, 0, 0.5)
  // 每 3 小时变化（%）：蒸散 (-) + 雨水补给 (+)
  const stepDelta = (-0.6 - tempFactor * 0.7 - humFactor * 0.6) + rainFactor * 1.2
  const points = []
  let v = clamp(current, 0, 100)
  for (let i = 0; i <= 16; i++) {
    points.push({ hour: i * 3, soil_moisture: Number(v.toFixed(1)) })
    v = clamp(v + stepDelta, 0, 100)
  }

  const end = points[points.length - 1]?.soil_moisture ?? v
  const min = Math.min(...points.map((p) => p.soil_moisture))
  let recommendation = '维持观察'
  if (min < 22 || end < 22) recommendation = '建议立即灌溉'
  else if (min < 28 || end < 28) recommendation = '建议推迟灌溉'

  const irrigation_mm = recommendation === '建议立即灌溉' ? 10 : recommendation === '建议推迟灌溉' ? 5 : 0
  const confidenceScore = clamp(0.55 + (t != null ? 0.1 : 0) + (h != null ? 0.1 : 0), 0.35, 0.85)
  const confidence = confidenceScore >= 0.75 ? '高' : confidenceScore >= 0.6 ? '中' : '低'

  const advice =
    recommendation === '建议立即灌溉'
      ? '墒情将跌破安全阈值，建议尽快安排灌溉并复核地块差异。'
      : recommendation === '建议推迟灌溉'
        ? '短期可能接近阈值，建议 24 小时内复测后再决策。'
        : '短期墒情相对稳定，建议持续观察并按周校准阈值。'

  return {
    current_soil_moisture: Number(current.toFixed(1)),
    confidence,
    confidence_score: Number(confidenceScore.toFixed(2)),
    points,
    recommendation,
    irrigation_mm,
    advice,
    explain: {
      factors: [
        `当前墒情 ${Number(current.toFixed(1))}%`,
        t == null ? '温度缺失' : `温度 ${Number(t.toFixed(1))}℃`,
        h == null ? '湿度缺失' : `湿度 ${Number(h.toFixed(1))}%`,
        `降雨 ${Number((r || 0).toFixed(1))}mm`
      ],
      thresholds: ['立即灌溉：预测<22%', '推迟灌溉：预测<28%', '维持观察：≥28%'],
      confidence_source: ['温/湿数据是否齐全', '外推步长为 3 小时规则近似']
    },
    latest: { temperature: t, humidity: h, rainfall: r, monitor_time: cur?.monitor_time || null }
  }
}

async function getGrowthProgress(scopedFarmId) {
  // 简版积温：用“最近 7 天平均温度”近似，GDD = max(0, Tavg - 10) * elapsedDays
  const cropParams = []
  let cropWhere = 'WHERE 1=1'
  if (scopedFarmId) {
    cropWhere += ' AND c.farm_id = ?'
    cropParams.push(scopedFarmId)
  }

  const [crops] = await pool.execute(
    `
    SELECT
      c.crop_id,
      COALESCE(c.crop_name, c.crop_type, '') AS crop_name,
      c.crop_type,
      c.plant_area,
      c.sow_time,
      COALESCE(c.growth_cycle, 0) AS growth_cycle,
      f.farm_name
    FROM crop c
    INNER JOIN farm f ON f.farm_id = c.farm_id
    ${cropWhere}
    ORDER BY c.crop_id DESC
    LIMIT 50
    `,
    cropParams
  )

  const envParams = []
  let envWhere = 'WHERE em.monitor_time >= NOW() - INTERVAL 7 DAY'
  if (scopedFarmId) {
    envWhere += ' AND em.farm_id = ?'
    envParams.push(scopedFarmId)
  }
  const [envRows] = await pool.execute(
    `
    SELECT AVG(COALESCE(em.temperature,0)) AS tavg
    FROM environment_monitor em
    ${envWhere}
    `,
    envParams
  )
  const tavg = Number(envRows?.[0]?.tavg || 0)
  const baseTemp = 10
  const gddPerDay = Math.max(0, tavg - baseTemp)

  const out = []
  const now = Date.now()
  for (const c of crops || []) {
    if (!c.sow_time) continue
    const sow = new Date(c.sow_time).getTime()
    if (!Number.isFinite(sow)) continue
    const elapsedDays = Math.max(0, Math.floor((now - sow) / (24 * 3600 * 1000)))
    const cycleDays = Math.max(1, Number(c.growth_cycle || 0) || 1)
    const calendarProgress = clamp((elapsedDays / cycleDays) * 100, 0, 100)

    const gddCurrent = Math.round(elapsedDays * gddPerDay)
    const gddTarget = Math.max(1, Math.round(cycleDays * 12)) // 简版目标：每周期约 12*天（可后续按作物类型细化）
    const gddProgress = clamp((gddCurrent / gddTarget) * 100, 0, 100)
    const gddGap = Math.max(0, gddTarget - gddCurrent)
    const behind = gddProgress + 8 < calendarProgress

    out.push({
      crop_id: c.crop_id,
      crop_name: c.crop_name,
      crop_type: c.crop_type,
      plant_area: c.plant_area,
      farm_name: c.farm_name,
      elapsed_days: elapsedDays,
      growth_cycle_days: cycleDays,
      calendar_progress: Number(calendarProgress.toFixed(1)),
      gdd_current: gddCurrent,
      gdd_target: gddTarget,
      gdd_progress: Number(gddProgress.toFixed(1)),
      gdd_gap: gddGap,
      behind
    })
  }

  out.sort((a, b) => Number(b.behind) - Number(a.behind) || a.gdd_progress - b.gdd_progress)
  return { tavg: Number(tavg.toFixed(1)), base_temp: baseTemp, rows: out.slice(0, 12) }
}

async function getIrrigationSummary(scopedFarmId, userId) {
  const key = scopedFarmId || null
  let currentKey = null
  if (userId != null) {
    const cached = resolveUserStrategyKey(userId, key)
    if (cached) currentKey = cached
  }
  if (!currentKey) currentKey = farmIrrigationStrategy.get(key) || 'balanced'
  const cur = IRRIGATION_PRESETS.find((p) => p.strategy_key === currentKey) || IRRIGATION_PRESETS[1]
  const now = Date.now()
  const nextRun = new Date(now + Number(cur.interval_hours || 24) * 3600 * 1000).toISOString()
  const flowLpm = 20 // 简版：每分钟 20L
  const estimatedWater = Math.round(Number(cur.duration_minutes || 20) * flowLpm)
  return {
    current_strategy: cur,
    presets: IRRIGATION_PRESETS,
    next_run_time: nextRun,
    estimated_water_l: estimatedWater,
    explain: {
      factors: [
        `目标墒情 ${cur.target_moisture}%`,
        `间隔 ${cur.interval_hours}h`,
        `时长 ${cur.duration_minutes}min`
      ],
      thresholds: ['策略预设：节水稳产/平衡策略/促生长'],
      confidence_source: ['当前为策略预设（可解释、可快速上线）', '后续可接入土壤预测与设备联动闭环校准']
    }
  }
}

function resolveUserStrategyKey(userId, farmKey) {
  const m = userIrrigationStrategy.get(userId)
  if (!m) return null
  return m.get(farmKey) || null
}

function setUserStrategyKey(userId, farmKey, strategyKey) {
  const m = userIrrigationStrategy.get(userId) || new Map()
  m.set(farmKey, strategyKey)
  userIrrigationStrategy.set(userId, m)
}

router.post('/irrigation/switch', authenticateToken, async (req, res) => {
  try {
    await ensureOverviewTables()
    const userId = req.user?.user_id
    const farmIdRaw = req.body?.farm_id
    const farmKey = farmIdRaw == null || String(farmIdRaw).trim() === '' || String(farmIdRaw).toLowerCase() === 'all'
      ? null
      : String(farmIdRaw)
    const scopedFarmId = getScopedFarmId(req.user, farmKey)
    if (isNoFarmForNonAdmin(req.user, scopedFarmId)) {
      return res.status(403).json({ message: '无权切换灌溉策略' })
    }

    const strategyKey = String(req.body?.strategy_key || '').trim()
    const hit = IRRIGATION_PRESETS.find((p) => p.strategy_key === strategyKey)
    if (!hit) return res.status(400).json({ message: '未知策略' })

    // 先按“用户偏好”存；同时更新全局 map 作为默认回退（无 DB 时的临时实现）
    setUserStrategyKey(userId, scopedFarmId || null, hit.strategy_key)
    farmIrrigationStrategy.set(scopedFarmId || null, hit.strategy_key)

    // 落库：user+farm 维度 upsert
    await pool.execute(
      `
        INSERT INTO overview_user_pref (user_id, farm_id, irrigation_strategy_key)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE irrigation_strategy_key = VALUES(irrigation_strategy_key), updated_at = NOW()
      `,
      [userId, scopedFarmId || null, hit.strategy_key]
    )

    const summary = await getIrrigationSummary(scopedFarmId, userId)
    res.json({ ok: true, irrigation_summary: summary })
  } catch (error) {
    console.error('overview/irrigation/switch error:', error)
    res.status(500).json({ message: '服务器错误', error: error.message })
  }
})

// 智能预测：一键生成采购草稿（待入库采购记录）
router.post('/purchase/draft', authenticateToken, async (req, res) => {
  try {
    await materialRouter.ensureMaterialTables()
    const user = req.user
    const { items = [], supplier, purchase_time } = req.body || {}
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: '采购项不能为空' })
    }

    // items: [{ material_id, purchase_qty }]
    const uniq = new Map()
    for (const it of items) {
      const mid = Number(it?.material_id)
      const qty = Number(it?.purchase_qty)
      if (!Number.isFinite(mid) || mid <= 0) continue
      if (!Number.isFinite(qty) || qty <= 0) continue
      uniq.set(mid, (uniq.get(mid) || 0) + qty)
    }
    if (uniq.size === 0) return res.status(400).json({ message: '无有效采购项' })

    const materialIds = Array.from(uniq.keys())
    const [rows] = await pool.execute(
      `
        SELECT m.material_id, m.material_name, m.farm_id, f.farm_name, COALESCE(m.price,0) AS unit_price
        FROM agricultural_material m
        INNER JOIN farm f ON f.farm_id = m.farm_id
        WHERE m.material_id IN (${materialIds.map(() => '?').join(',')})
      `,
      materialIds
    )
    if (!rows?.length) return res.status(404).json({ message: '农资不存在' })

    // 权限：非管理员只能自己农场；管理员也按材料所属农场写入（不允许跨农场混单）
    const byFarm = new Map()
    for (const r of rows) {
      if (user.role_id !== 1 && String(r.farm_id) !== String(user.farm_id)) {
        return res.status(403).json({ message: '无权为该农场创建采购草稿' })
      }
      const farmId = String(r.farm_id)
      const arr = byFarm.get(farmId) || []
      arr.push(r)
      byFarm.set(farmId, arr)
    }

    const pTime = purchase_time ? new Date(purchase_time) : new Date()
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      const created = []
      const handledPairs = [] // { farm_id, material_id }
      for (const [farmId, mats] of byFarm.entries()) {
        for (const m of mats) {
          const qty = Number(uniq.get(Number(m.material_id)) || 0)
          const unitPrice = Number(m.unit_price || 0)
          const totalAmount = Number((qty * unitPrice).toFixed(2))
          const purchaseNo = makePurchaseNo()
          const [ins] = await conn.execute(
            `
              INSERT INTO material_purchase_record
                (purchase_no, material_id, material_name, farm_id, farm_name, purchase_qty, unit_price, total_amount,
                 supplier, purchase_status, purchase_time, operator_id, remark)
              VALUES
                (?, ?, ?, ?, ?, ?, ?, ?, ?, '待入库', ?, ?, ?)
            `,
            [
              purchaseNo,
              m.material_id,
              m.material_name,
              m.farm_id,
              m.farm_name,
              qty,
              unitPrice,
              totalAmount,
              supplier || null,
              pTime,
              user.user_id,
              '智能预测：库存预警推荐采购草稿'
            ]
          )
          created.push({ purchase_id: ins.insertId, purchase_no: purchaseNo, farm_id: m.farm_id, material_id: m.material_id })
          handledPairs.push({ farm_id: m.farm_id, material_id: m.material_id })
        }
      }

      // 标记库存预警为已处理（已生成采购草稿）
      for (const p of handledPairs) {
        await conn.execute(
          `
            INSERT INTO material_warning_handle (farm_id, material_id, handle_status, handle_time, handler_id)
            VALUES (?, ?, '已处理', NOW(), ?)
            ON DUPLICATE KEY UPDATE handle_status = '已处理', handle_time = NOW(), handler_id = VALUES(handler_id)
          `,
          [p.farm_id, p.material_id, user.user_id]
        )
      }

      await conn.commit()
      res.status(201).json({ ok: true, created })
    } catch (e) {
      await conn.rollback()
      throw e
    } finally {
      conn.release()
    }
  } catch (error) {
    console.error('overview/purchase/draft error:', error)
    res.status(error.status || 500).json({ message: error.message || '服务器错误', error: error.message })
  }
})

async function getPlotCompare(scopedFarmId) {
  // 简版：按地块（plant_area）做快照：作物数、未处理异常数、给一个长势评分
  const params = []
  let whereSql = 'WHERE 1=1'
  if (scopedFarmId) {
    whereSql += ' AND c.farm_id = ?'
    params.push(scopedFarmId)
  }
  const [rows] = await pool.execute(
    `
    SELECT
      f.farm_name,
      COALESCE(NULLIF(TRIM(c.plant_area),''), '未分区') AS area,
      COUNT(DISTINCT c.crop_id) AS crop_cnt,
      SUM(CASE WHEN COALESCE(ce.handle_status,'未处理') <> '已处理' THEN 1 ELSE 0 END) AS open_exc_cnt
    FROM crop c
    INNER JOIN farm f ON f.farm_id = c.farm_id
    LEFT JOIN crop_exception ce ON ce.crop_id = c.crop_id AND ce.exception_time >= NOW() - INTERVAL 7 DAY
    ${whereSql}
    GROUP BY f.farm_name, area
    ORDER BY open_exc_cnt DESC, crop_cnt DESC
    LIMIT 12
    `,
    params
  )

  return (rows || []).map((r) => {
    const open = Number(r.open_exc_cnt || 0)
    const cropCnt = Number(r.crop_cnt || 0)
    const vigor = clamp(Math.round(92 - open * 8 - Math.max(0, cropCnt - 6) * 1.5), 35, 98)
    return {
      farm_name: r.farm_name,
      area: r.area,
      soil_moisture_avg: null,
      vigor_score: vigor,
      water_today_l: null,
      open_exc_cnt: open
    }
  })
}

async function getHistoryCompare(scopedFarmId) {
  const paramsNow = []
  let whereNow = 'WHERE monitor_time >= NOW() - INTERVAL 24 HOUR'
  if (scopedFarmId) {
    whereNow += ' AND farm_id = ?'
    paramsNow.push(scopedFarmId)
  }
  const [nowRows] = await pool.execute(
    `
    SELECT
      AVG(COALESCE(temperature,0)) AS tavg,
      AVG(COALESCE(humidity,0)) AS havg
    FROM environment_monitor
    ${whereNow}
    `,
    paramsNow
  )

  const paramsLy = []
  let whereLy = `WHERE monitor_time >= DATE_SUB(NOW(), INTERVAL 1 YEAR) - INTERVAL 24 HOUR
    AND monitor_time <= DATE_SUB(NOW(), INTERVAL 1 YEAR)`
  if (scopedFarmId) {
    whereLy += ' AND farm_id = ?'
    paramsLy.push(scopedFarmId)
  }
  const [lyRows] = await pool.execute(
    `
    SELECT
      AVG(COALESCE(temperature,0)) AS tavg,
      AVG(COALESCE(humidity,0)) AS havg
    FROM environment_monitor
    ${whereLy}
    `,
    paramsLy
  )

  const tNow = nowRows?.[0]?.tavg != null ? Number(nowRows[0].tavg) : null
  const hNow = nowRows?.[0]?.havg != null ? Number(nowRows[0].havg) : null
  let tLy = lyRows?.[0]?.tavg != null ? Number(lyRows[0].tavg) : null
  let hLy = lyRows?.[0]?.havg != null ? Number(lyRows[0].havg) : null
  let estimated = false

  // 兜底：若去年同期无数据，用当前均值做经验偏移估算，避免界面全是 —
  if ((tLy == null || hLy == null) && (tNow != null || hNow != null)) {
    estimated = true
    if (tLy == null && tNow != null) tLy = tNow - 1.8
    if (hLy == null && hNow != null) hLy = hNow + 3.0
  }

  const tempDelta = tNow != null && tLy != null ? Number((tNow - tLy).toFixed(1)) : null
  const humDelta = hNow != null && hLy != null ? Number((hNow - hLy).toFixed(1)) : null
  const hints = []
  if (estimated) {
    hints.push('去年同期监测数据缺失：已使用当前均值进行经验偏移估算（仅供参考）。')
  }
  if (tempDelta != null) {
    if (tempDelta >= 3) hints.push('温度显著高于去年同期：注意高温胁迫与蒸散增强。')
    else if (tempDelta <= -3) hints.push('温度显著低于去年同期：注意低温影响生长与病害发生。')
    else hints.push('温度与去年同期接近：可参考往年经验制定管理节奏。')
  }
  if (humDelta != null) {
    if (humDelta >= 8) hints.push('湿度明显偏高：叶面湿润风险上升，建议加密巡检与通风。')
    else if (humDelta <= -8) hints.push('湿度明显偏低：注意水分亏缺与灌溉时机。')
    else hints.push('湿度与去年同期接近：风险变化不大，维持常规监测。')
  }

  return {
    temp_now_avg: tNow == null ? null : Number(tNow.toFixed(1)),
    hum_now_avg: hNow == null ? null : Number(hNow.toFixed(1)),
    temp_last_year_avg: tLy == null ? null : Number(tLy.toFixed(1)),
    hum_last_year_avg: hLy == null ? null : Number(hLy.toFixed(1)),
    temp_delta: tempDelta,
    hum_delta: humDelta,
    hints,
    last_year_estimated: estimated
  }
}

// 智能预测：聚合接口（P1）
router.get('/advanced', authenticateToken, async (req, res) => {
  try {
    await ensureOverviewTables()
    const { farm_id } = req.query
    const scopedFarmId = getScopedFarmId(req.user, farm_id)
    if (isNoFarmForNonAdmin(req.user, scopedFarmId)) {
      return res.json({
        meta: { generated_at: new Date().toISOString(), farm_id: scopedFarmId || null },
        pest_risk: null,
        soil_forecast: null,
        stock_warnings: { total: 0, low_count: 0, out_count: 0, items: [] },
        growth_progress: { tavg: null, base_temp: 10, rows: [] },
        irrigation_summary: null,
        plot_compare: [],
        history_compare: null
      })
    }

    // 读取策略偏好（落库优先）
    const userId = req.user?.user_id
    try {
      const [prefRows] = await pool.execute(
        `SELECT irrigation_strategy_key FROM overview_user_pref WHERE user_id = ? AND ((farm_id IS NULL AND ? IS NULL) OR farm_id = ?) LIMIT 1`,
        [userId, scopedFarmId || null, scopedFarmId || null]
      )
      const prefKey = prefRows?.[0]?.irrigation_strategy_key
      if (prefKey) {
        setUserStrategyKey(userId, scopedFarmId || null, String(prefKey))
        farmIrrigationStrategy.set(scopedFarmId || null, String(prefKey))
      }
    } catch (e) {
      // 读取偏好失败不阻断主流程
      console.warn('overview pref load:', e.message)
    }

    const [pest_risk, soil_forecast, stock_warnings, growth_progress, irrigation_summary, plot_compare, history_compare] = await Promise.all([
      getPestRisk(scopedFarmId),
      getSoilForecast(scopedFarmId),
      getStockWarnings(scopedFarmId),
      getGrowthProgress(scopedFarmId),
      getIrrigationSummary(scopedFarmId, userId),
      getPlotCompare(scopedFarmId),
      getHistoryCompare(scopedFarmId)
    ])

    res.json({
      meta: {
        generated_at: new Date().toISOString(),
        farm_id: scopedFarmId || null
      },
      pest_risk,
      soil_forecast,
      stock_warnings,
      growth_progress,
      irrigation_summary,
      plot_compare,
      history_compare
    })
  } catch (error) {
    console.error('overview/advanced error:', error)
    res.status(500).json({ message: '服务器错误', error: error.message })
  }
})

module.exports = router

