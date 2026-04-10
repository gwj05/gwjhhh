const lastEnvWarningAt = new Map()
const { predictProbability, trainPredictor, getModelInfo } = require('./warningPredictor')

let schemaDone = false

function numEnv(name, fallback) {
  const v = Number(process.env[name])
  return Number.isFinite(v) ? v : fallback
}

// 生成频率与阈值（默认更保守，可用环境变量覆盖）
const ENV_WARNING_COOLDOWN_MINUTES = numEnv('ENV_WARNING_COOLDOWN_MINUTES', 180)
const RULE_TEMP_HIGH = numEnv('RULE_TEMP_HIGH', 38)
const RULE_TEMP_LOW = numEnv('RULE_TEMP_LOW', 4)
const RULE_HUMIDITY_LOW = numEnv('RULE_HUMIDITY_LOW', 28)
const RULE_SOIL_LOW = numEnv('RULE_SOIL_LOW', 22)
const ML_WARNING_PROB_THRESHOLD = numEnv('ML_WARNING_PROB_THRESHOLD', 0.85)
const ML_WARNING_CRITICAL_THRESHOLD = numEnv('ML_WARNING_CRITICAL_THRESHOLD', 0.92)
const RULE_MAX_NEW_ALERTS_PER_SCAN = Math.max(1, Math.floor(numEnv('RULE_MAX_NEW_ALERTS_PER_SCAN', 12)))

async function ensureSmartWarningSchema(pool) {
  if (schemaDone) return
  const addCol = async (table, col, sql) => {
    const [rows] = await pool.execute(
      `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, col]
    )
    if (rows?.length) return
    await pool.execute(sql)
  }

  await addCol(
    'crop_exception',
    'source_type',
    `ALTER TABLE crop_exception ADD COLUMN source_type VARCHAR(20) DEFAULT 'manual' COMMENT '来源:manual/rule/environment/ml'`
  )

  await addCol(
    'crop_exception',
    'suggest_content',
    `ALTER TABLE crop_exception ADD COLUMN suggest_content VARCHAR(255) DEFAULT NULL COMMENT '智能建议内容（如建议灌溉/降温/补货）'`
  )

  await addCol(
    'crop_exception',
    'predicted_prob',
    `ALTER TABLE crop_exception ADD COLUMN predicted_prob DECIMAL(6,4) DEFAULT NULL COMMENT '预测异常概率(0~1)，仅source_type=ml使用'`
  )

  schemaDone = true
}

async function getOrCreateEnvDevice(conn, farmId) {
  const [ex] = await conn.execute(
    `SELECT device_id FROM monitor_device WHERE farm_id = ? AND device_name = '环境采集终端（系统）' LIMIT 1`,
    [farmId]
  )
  if (ex?.length) return ex[0].device_id
  const [r] = await conn.execute(
    `INSERT INTO monitor_device
      (farm_id, device_name, install_location, device_status, monitor_area, device_category, last_online_time)
     VALUES (?, '环境采集终端（系统）', '环境监测绑定', '在线', '全场', '传感器', NOW())`,
    [farmId]
  )
  return r.insertId
}

async function resolveCropId(conn, farmId, plantArea) {
  if (plantArea && plantArea !== '默认监测区') {
    const [r] = await conn.execute(
      `SELECT crop_id FROM crop WHERE farm_id = ? AND plant_area = ? ORDER BY crop_id LIMIT 1`,
      [farmId, plantArea]
    )
    if (r?.length) return r[0].crop_id
  }
  const [r2] = await conn.execute(
    `SELECT crop_id FROM crop WHERE farm_id = ? ORDER BY crop_id LIMIT 1`,
    [farmId]
  )
  return r2?.[0]?.crop_id ?? null
}

async function insertPushes(conn, exceptionId, farmId) {
  const [users] = await conn.execute(
    `SELECT user_id FROM user WHERE role_id = 1 OR (farm_id IS NOT NULL AND farm_id = ?)`,
    [farmId]
  )
  const list = users || []
  for (const u of list) {
    try {
      await conn.execute(
        `INSERT INTO exception_push (exception_id, receiver_id, push_method, read_status)
         VALUES (?, ?, '站内信', '未读')`,
        [exceptionId, u.user_id]
      )
    } catch (e) {
      if (e.code !== 'ER_DUP_ENTRY') console.error('push insert:', e.message)
    }
  }
}

/**
 * 环境异常：写 environment_exception_log + crop_exception + exception_push（有作物时）
 */
async function triggerEnvironmentWarning(pool, payload) {
  const {
    farmId,
    plantArea,
    kind,
    detail,
    warningLevel = 2,
    suggestContent = null,
    temperature = null,
    humidity = null
  } = payload

  const key = `${farmId}|${plantArea || ''}|${kind}`
  const now = Date.now()
  if (now - (lastEnvWarningAt.get(key) || 0) < ENV_WARNING_COOLDOWN_MINUTES * 60 * 1000) return null
  lastEnvWarningAt.set(key, now)

  await ensureSmartWarningSchema(pool)

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    // 数据库级去重：避免重启后短时间重复写入同类未处理预警
    const [dup] = await conn.execute(
      `
        SELECT ce.exception_id
        FROM crop_exception ce
        INNER JOIN crop c ON c.crop_id = ce.crop_id
        WHERE c.farm_id = ?
          AND COALESCE(c.plant_area,'') = COALESCE(?, '')
          AND ce.exception_type = ?
          AND ce.source_type = 'environment'
          AND ce.handle_status = '未处理'
          AND ce.exception_time >= NOW() - INTERVAL ${ENV_WARNING_COOLDOWN_MINUTES} MINUTE
        ORDER BY ce.exception_id DESC
        LIMIT 1
      `,
      [farmId, plantArea || null, kind]
    )
    if (dup?.length) {
      await conn.commit()
      return { duplicate: true, exceptionId: dup[0].exception_id }
    }

    await conn.execute(
      `INSERT INTO environment_exception_log (farm_id, plant_area, exception_type, detail, temperature, humidity)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [farmId, plantArea || null, kind, detail, temperature, humidity]
    )

    const cropId = await resolveCropId(conn, farmId, plantArea)
    if (!cropId) {
      await conn.commit()
      return { environmentOnly: true }
    }

    const deviceId = await getOrCreateEnvDevice(conn, farmId)

    const scroll = Math.floor(Date.now() / 1000)
    const [ins] = await conn.execute(
      `INSERT INTO crop_exception
        (crop_id, device_id, exception_type, exception_detail, suggest_content, handle_status, warning_level, scroll_sort, source_type)
       VALUES (?, ?, ?, ?, ?, '未处理', ?, ?, 'environment')`,
      [cropId, deviceId, kind, detail, suggestContent || null, warningLevel, scroll]
    )
    const exceptionId = ins.insertId

    await insertPushes(conn, exceptionId, farmId)

    await conn.commit()
    return { exceptionId, environmentOnly: false }
  } catch (e) {
    await conn.rollback()
    console.error('triggerEnvironmentWarning:', e.message)
    return null
  } finally {
    conn.release()
  }
}

/**
 * 规则检测：根据最新环境数据生成异常（供定时任务调用）
 */
async function runInventoryRules(pool) {
  await ensureSmartWarningSchema(pool)
  const [latest] = await pool.execute(`
    SELECT e.farm_id, e.plant_area, e.temperature, e.humidity, e.soil_moisture
    FROM environment_monitor e
    INNER JOIN (
      SELECT farm_id, COALESCE(plant_area,'') AS zona, MAX(monitor_id) AS mid
      FROM environment_monitor
      GROUP BY farm_id, COALESCE(plant_area,'')
    ) t ON e.monitor_id = t.mid
  `)

  let createdCount = 0
  for (const row of latest || []) {
    if (createdCount >= RULE_MAX_NEW_ALERTS_PER_SCAN) break
    const area = row.plant_area || '默认监测区'
    const t = row.temperature != null ? Number(row.temperature) : null
    const h = row.humidity != null ? Number(row.humidity) : null
    const sm = row.soil_moisture != null ? Number(row.soil_moisture) : null

    if (t != null && (t > RULE_TEMP_HIGH || t < RULE_TEMP_LOW)) {
      const created = await triggerEnvironmentWarning(pool, {
        farmId: row.farm_id,
        plantArea: area,
        kind: '温度异常',
        detail: `规则检测：当前温度 ${t}℃，超出适宜范围`,
        warningLevel: 1,
        suggestContent: t > RULE_TEMP_HIGH ? '建议通风降温或遮阳处理' : '建议采取保温措施',
        temperature: t,
        humidity: h
      })
      if (created?.exceptionId) createdCount += 1
    }
    if (h != null && h < RULE_HUMIDITY_LOW) {
      const created = await triggerEnvironmentWarning(pool, {
        farmId: row.farm_id,
        plantArea: area,
        kind: '湿度过低',
        detail: `规则检测：空气湿度 ${h}%，建议灌溉`,
        warningLevel: 2,
        suggestContent: '建议适量灌溉，提高空气湿度',
        temperature: t,
        humidity: h
      })
      if (created?.exceptionId) createdCount += 1
    }
    if (sm != null && sm < RULE_SOIL_LOW) {
      const created = await triggerEnvironmentWarning(pool, {
        farmId: row.farm_id,
        plantArea: area,
        kind: '建议灌溉',
        detail: `规则检测：土壤湿度 ${sm}% 偏低`,
        warningLevel: 2,
        suggestContent: '建议尽快灌溉补水，避免作物缺水',
        temperature: t,
        humidity: h
      })
      if (created?.exceptionId) createdCount += 1
    }

    // ---------- 机器学习预测预警 ----------
    const prob = predictProbability({ temperature: t, humidity: h, soil_moisture: sm })
    if (prob != null && prob >= ML_WARNING_PROB_THRESHOLD) {
      const farmId = row.farm_id
      const plantArea = area
      const kind = '预测预警'
      const warningLevel = prob >= ML_WARNING_CRITICAL_THRESHOLD ? 1 : 2

      const conn = await pool.getConnection()
      try {
        await conn.beginTransaction()
        const cropId = await resolveCropId(conn, farmId, plantArea)
        if (cropId) {
          const deviceId = await getOrCreateEnvDevice(conn, farmId)

          // 去重：同 farm + 区域 + 预测预警，近 60 分钟未处理的不重复生成
          const [dup] = await conn.execute(
            `
              SELECT ce.exception_id
              FROM crop_exception ce
              INNER JOIN crop c ON c.crop_id = ce.crop_id
              WHERE c.farm_id = ?
                AND COALESCE(c.plant_area,'') = COALESCE(?, '')
                AND ce.exception_type = ?
                AND ce.source_type = 'ml'
                AND ce.handle_status = '未处理'
                AND ce.exception_time >= NOW() - INTERVAL ${ENV_WARNING_COOLDOWN_MINUTES} MINUTE
              ORDER BY ce.exception_id DESC
              LIMIT 1
            `,
            [farmId, plantArea || null, kind]
          )
          if (!dup?.length) {
            const scroll = Math.floor(Date.now() / 1000)
            const detail = `机器学习预测：预测未来可能出现异常，概率 ${(prob * 100).toFixed(0)}%。当前温度 ${t ?? '—'}℃，湿度 ${h ?? '—'}%，土壤湿度 ${sm ?? '—'}%。`
            const suggest =
              (t != null && t > 34)
                ? '建议提前通风降温或遮阳处理'
                : (h != null && h < 38) || (sm != null && sm < 30)
                  ? '建议提前安排灌溉与补水'
                  : '建议加强巡检并关注环境趋势'

            const [ins] = await conn.execute(
              `
                INSERT INTO crop_exception
                  (crop_id, device_id, exception_type, exception_detail, suggest_content, predicted_prob, handle_status, warning_level, scroll_sort, source_type)
                VALUES (?, ?, ?, ?, ?, ?, '未处理', ?, ?, 'ml')
              `,
              [cropId, deviceId, kind, detail, suggest, prob, warningLevel, scroll]
            )
            await insertPushes(conn, ins.insertId, farmId)
            createdCount += 1
          }
        }
        await conn.commit()
      } catch (e) {
        await conn.rollback()
        console.error('ml predict warning:', e.message)
      } finally {
        conn.release()
      }
    }
  }
}

async function trainMlPredictor(pool) {
  try {
    await ensureSmartWarningSchema(pool)
    return await trainPredictor(pool)
  } catch (e) {
    console.error('trainMlPredictor:', e.message)
    return { ok: false, reason: e.message }
  }
}

function getMlModelInfo() {
  return getModelInfo()
}

module.exports = {
  ensureSmartWarningSchema,
  getOrCreateEnvDevice,
  resolveCropId,
  triggerEnvironmentWarning,
  runInventoryRules,
  insertPushes,
  trainMlPredictor,
  getMlModelInfo
}
