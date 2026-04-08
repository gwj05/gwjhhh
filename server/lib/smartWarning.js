const lastEnvWarningAt = new Map()

let schemaDone = false

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
    `ALTER TABLE crop_exception ADD COLUMN source_type VARCHAR(20) DEFAULT 'manual' COMMENT '来源:manual/rule/environment'`
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
    temperature = null,
    humidity = null
  } = payload

  const key = `${farmId}|${plantArea || ''}|${kind}`
  const now = Date.now()
  if (now - (lastEnvWarningAt.get(key) || 0) < 60 * 60 * 1000) return null
  lastEnvWarningAt.set(key, now)

  await ensureSmartWarningSchema(pool)

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

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
        (crop_id, device_id, exception_type, exception_detail, handle_status, warning_level, scroll_sort, source_type)
       VALUES (?, ?, ?, ?, '未处理', ?, ?, 'environment')`,
      [cropId, deviceId, kind, detail, warningLevel, scroll]
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

  for (const row of latest || []) {
    const area = row.plant_area || '默认监测区'
    const t = row.temperature != null ? Number(row.temperature) : null
    const h = row.humidity != null ? Number(row.humidity) : null
    const sm = row.soil_moisture != null ? Number(row.soil_moisture) : null

    if (t != null && (t > 36 || t < 6)) {
      await triggerEnvironmentWarning(pool, {
        farmId: row.farm_id,
        plantArea: area,
        kind: '温度异常',
        detail: `规则检测：当前温度 ${t}℃，超出适宜范围`,
        warningLevel: 1,
        temperature: t,
        humidity: h
      })
    }
    if (h != null && h < 32) {
      await triggerEnvironmentWarning(pool, {
        farmId: row.farm_id,
        plantArea: area,
        kind: '湿度过低',
        detail: `规则检测：空气湿度 ${h}%，建议灌溉`,
        warningLevel: 2,
        temperature: t,
        humidity: h
      })
    }
    if (sm != null && sm < 26) {
      await triggerEnvironmentWarning(pool, {
        farmId: row.farm_id,
        plantArea: area,
        kind: '缺水',
        detail: `规则检测：土壤湿度 ${sm}% 偏低`,
        warningLevel: 2,
        temperature: t,
        humidity: h
      })
    }
  }
}

module.exports = {
  ensureSmartWarningSchema,
  getOrCreateEnvDevice,
  resolveCropId,
  triggerEnvironmentWarning,
  runInventoryRules,
  insertPushes
}
