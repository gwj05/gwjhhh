/**
 * init-full-data.js
 * 用于“上云一键初始化完整演示数据”（可重复执行，尽量幂等）
 *
 * 运行：
 *   node server/init-full-data.js
 *
 * 说明：
 * - 数据库连接方式与 init-test-data.js 一致：mysql2 + dotenv(.env)
 * - 会尽量确保常用扩展表/字段存在（避免缺字段导致插入失败）
 * - 会插入：RBAC账号/农场/作物/环境监测/设备+通用视频/预警异常+推送+已读/农资+采购+预警处理/操作记录/智能预测偏好
 */
const mysql = require('mysql2/promise')
const bcrypt = require('bcryptjs')
const dotenv = require('dotenv')

dotenv.config()

function envInt(name, fallback) {
  const v = Number(process.env[name])
  return Number.isFinite(v) ? v : fallback
}

async function tableExists(conn, table) {
  const [rows] = await conn.execute(
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
    [table]
  )
  return rows?.length > 0
}

async function columnExists(conn, table, column) {
  const [rows] = await conn.execute(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [table, column]
  )
  return rows?.length > 0
}

async function getColumns(conn, table) {
  const [rows] = await conn.execute(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  )
  return new Set((rows || []).map((r) => r.COLUMN_NAME))
}

async function ensureSchema(conn) {
  // === role/user/farm/crop/agricultural_material/operation_record/environment_monitor/monitor_device/crop_exception/exception_push ===
  // 这些基础表通常由 server/init.sql 创建；这里仅补充“项目新增字段/表”，确保插入不报错。

  // environment_monitor：weather/rain/wind + plant_area/soil_moisture/light_lux
  if (await tableExists(conn, 'environment_monitor')) {
    const addEnvCol = async (name, sql) => {
      if (await columnExists(conn, 'environment_monitor', name)) return
      await conn.execute(sql)
    }
    await addEnvCol('weather_type', `ALTER TABLE environment_monitor ADD COLUMN weather_type VARCHAR(20) COMMENT '天气类型：晴/阴/雨'`)
    await addEnvCol('wind_speed', `ALTER TABLE environment_monitor ADD COLUMN wind_speed DECIMAL(5,2) COMMENT '风速（单位 m/s）'`)
    await addEnvCol('rainfall', `ALTER TABLE environment_monitor ADD COLUMN rainfall DECIMAL(5,2) COMMENT '降雨量（单位 mm）'`)
    await addEnvCol('plant_area', `ALTER TABLE environment_monitor ADD COLUMN plant_area VARCHAR(100) DEFAULT NULL COMMENT '种植区域'`)
    await addEnvCol('soil_moisture', `ALTER TABLE environment_monitor ADD COLUMN soil_moisture DECIMAL(5,2) DEFAULT NULL COMMENT '土壤湿度(%)'`)
    await addEnvCol('light_lux', `ALTER TABLE environment_monitor ADD COLUMN light_lux DECIMAL(12,2) DEFAULT NULL COMMENT '光照(lux)'`)
  }

  // monitor_device：device_category/last_online_time
  if (await tableExists(conn, 'monitor_device')) {
    const addDevCol = async (name, sql) => {
      if (await columnExists(conn, 'monitor_device', name)) return
      await conn.execute(sql)
    }
    await addDevCol('device_category', `ALTER TABLE monitor_device ADD COLUMN device_category VARCHAR(30) COMMENT '设备大类：传感器/控制器/摄像头'`)
    await addDevCol('last_online_time', `ALTER TABLE monitor_device ADD COLUMN last_online_time DATETIME COMMENT '设备最后在线时间'`)
  }

  // crop_exception：warning_level/scroll_sort + smartWarning columns
  if (await tableExists(conn, 'crop_exception')) {
    const addExCol = async (name, sql) => {
      if (await columnExists(conn, 'crop_exception', name)) return
      await conn.execute(sql)
    }
    await addExCol('warning_level', `ALTER TABLE crop_exception ADD COLUMN warning_level TINYINT DEFAULT 2 COMMENT '预警等级：1=紧急/2=普通/3=提示'`)
    await addExCol('scroll_sort', `ALTER TABLE crop_exception ADD COLUMN scroll_sort INT DEFAULT 0 COMMENT '排序值（控制滑动展示顺序）'`)
    await addExCol('source_type', `ALTER TABLE crop_exception ADD COLUMN source_type VARCHAR(20) DEFAULT 'manual' COMMENT '来源:manual/rule/environment/ml'`)
    await addExCol('suggest_content', `ALTER TABLE crop_exception ADD COLUMN suggest_content VARCHAR(255) DEFAULT NULL COMMENT '智能建议内容'`)
    await addExCol('predicted_prob', `ALTER TABLE crop_exception ADD COLUMN predicted_prob DECIMAL(6,4) DEFAULT NULL COMMENT '预测异常概率(0~1)，仅source_type=ml使用'`)
  }

  // warning_read
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS warning_read (
      id INT AUTO_INCREMENT PRIMARY KEY,
      warning_id INT NOT NULL,
      user_id INT NOT NULL,
      read_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_warning_user (warning_id, user_id),
      INDEX idx_warning_read_user (user_id),
      INDEX idx_warning_read_time (read_time),
      FOREIGN KEY (warning_id) REFERENCES crop_exception(exception_id) ON DELETE CASCADE ON UPDATE CASCADE,
      FOREIGN KEY (user_id) REFERENCES user(user_id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='预警已读记录表'
  `)

  // video_device
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS video_device (
      id INT AUTO_INCREMENT PRIMARY KEY,
      device_id INT NOT NULL,
      video_url VARCHAR(500) NOT NULL,
      video_status TINYINT NOT NULL DEFAULT 1,
      farm_id INT NOT NULL,
      INDEX idx_video_device (device_id),
      INDEX idx_video_farm (farm_id),
      INDEX idx_video_status (video_status),
      FOREIGN KEY (device_id) REFERENCES monitor_device(device_id) ON DELETE CASCADE ON UPDATE CASCADE,
      FOREIGN KEY (farm_id) REFERENCES farm(farm_id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='通用视频设备表'
  `)

  // environment_exception_log
  await conn.execute(`
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

  // agricultural_material 扩展字段 + 采购/预警处理/库存日志
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS agricultural_material_stock_log (
      stock_log_id INT AUTO_INCREMENT PRIMARY KEY,
      material_id INT NOT NULL,
      farm_id INT NOT NULL,
      change_type VARCHAR(10) NOT NULL COMMENT 'IN/OUT',
      delta_qty INT NOT NULL,
      reason VARCHAR(200) DEFAULT NULL,
      usage_purpose VARCHAR(200) DEFAULT NULL,
      source_type VARCHAR(30) DEFAULT NULL COMMENT '采购/手动入库/调整库存/其他',
      operator_id INT DEFAULT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (material_id) REFERENCES agricultural_material(material_id) ON DELETE CASCADE ON UPDATE CASCADE,
      FOREIGN KEY (farm_id) REFERENCES farm(farm_id) ON DELETE CASCADE ON UPDATE CASCADE,
      FOREIGN KEY (operator_id) REFERENCES user(user_id) ON DELETE SET NULL ON UPDATE CASCADE,
      INDEX idx_stocklog_material_time (material_id, created_at),
      INDEX idx_stocklog_farm_time (farm_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  if (await tableExists(conn, 'agricultural_material')) {
    const addMatCol = async (name, sql) => {
      if (await columnExists(conn, 'agricultural_material', name)) return
      await conn.execute(sql)
    }
    await addMatCol('brand', `ALTER TABLE agricultural_material ADD COLUMN brand VARCHAR(60) DEFAULT NULL COMMENT '品牌'`)
    await addMatCol('spec', `ALTER TABLE agricultural_material ADD COLUMN spec VARCHAR(60) DEFAULT NULL COMMENT '规格'`)
    await addMatCol('unit', `ALTER TABLE agricultural_material ADD COLUMN unit VARCHAR(20) DEFAULT NULL COMMENT '计量单位（袋/kg/L/件等）'`)
    await addMatCol('safety_stock_num', `ALTER TABLE agricultural_material ADD COLUMN safety_stock_num INT NOT NULL DEFAULT 0 COMMENT '安全库存（预警值）'`)
    await addMatCol('shelf_status', `ALTER TABLE agricultural_material ADD COLUMN shelf_status VARCHAR(10) NOT NULL DEFAULT 'ON' COMMENT '上下架状态：ON/OFF'`)
    await addMatCol('created_at', `ALTER TABLE agricultural_material ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'`)
    await addMatCol('updated_at', `ALTER TABLE agricultural_material ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'`)
  }

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS material_purchase_record (
      purchase_id INT AUTO_INCREMENT PRIMARY KEY,
      purchase_no VARCHAR(40) NOT NULL UNIQUE,
      material_id INT NOT NULL,
      material_name VARCHAR(80) NOT NULL,
      farm_id INT NOT NULL,
      farm_name VARCHAR(80) NOT NULL,
      purchase_qty INT NOT NULL,
      unit_price DECIMAL(10,2) NOT NULL,
      total_amount DECIMAL(12,2) NOT NULL,
      supplier VARCHAR(100) DEFAULT NULL,
      purchase_status VARCHAR(20) NOT NULL DEFAULT '待入库',
      purchase_time DATETIME NOT NULL,
      operator_id INT DEFAULT NULL,
      remark VARCHAR(255) DEFAULT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (material_id) REFERENCES agricultural_material(material_id) ON DELETE RESTRICT ON UPDATE CASCADE,
      FOREIGN KEY (farm_id) REFERENCES farm(farm_id) ON DELETE CASCADE ON UPDATE CASCADE,
      FOREIGN KEY (operator_id) REFERENCES user(user_id) ON DELETE SET NULL ON UPDATE CASCADE,
      INDEX idx_purchase_farm_time (farm_id, purchase_time),
      INDEX idx_purchase_status (purchase_status),
      INDEX idx_purchase_material (material_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS material_warning_handle (
      id INT AUTO_INCREMENT PRIMARY KEY,
      farm_id INT NOT NULL,
      material_id INT NOT NULL,
      handle_status VARCHAR(20) NOT NULL DEFAULT '未处理',
      handle_time DATETIME DEFAULT NULL,
      handler_id INT DEFAULT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_mwh_farm_material (farm_id, material_id),
      FOREIGN KEY (farm_id) REFERENCES farm(farm_id) ON DELETE CASCADE ON UPDATE CASCADE,
      FOREIGN KEY (material_id) REFERENCES agricultural_material(material_id) ON DELETE CASCADE ON UPDATE CASCADE,
      FOREIGN KEY (handler_id) REFERENCES user(user_id) ON DELETE SET NULL ON UPDATE CASCADE,
      INDEX idx_mwh_status (handle_status),
      INDEX idx_mwh_time (updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  // overview_user_pref
  await conn.execute(`
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

  // operation_record 扩展字段（用于“智能预测”相关展示）
  if (await tableExists(conn, 'operation_record')) {
    const addOpCol = async (name, sql) => {
      if (await columnExists(conn, 'operation_record', name)) return
      await conn.execute(sql)
    }
    await addOpCol('area_name', `ALTER TABLE operation_record ADD COLUMN area_name VARCHAR(100) DEFAULT NULL COMMENT '种植区域名称'`)
    await addOpCol('crop_id', `ALTER TABLE operation_record ADD COLUMN crop_id INT DEFAULT NULL COMMENT '作物ID'`)
    await addOpCol('material_id', `ALTER TABLE operation_record ADD COLUMN material_id INT DEFAULT NULL COMMENT '农资ID'`)
    await addOpCol('op_subtype', `ALTER TABLE operation_record ADD COLUMN op_subtype VARCHAR(50) DEFAULT NULL COMMENT '子类型'`)
    await addOpCol('method', `ALTER TABLE operation_record ADD COLUMN method VARCHAR(30) DEFAULT NULL COMMENT '方式'`)
    await addOpCol('amount', `ALTER TABLE operation_record ADD COLUMN amount DECIMAL(12,2) DEFAULT NULL COMMENT '使用量'`)
    await addOpCol('unit', `ALTER TABLE operation_record ADD COLUMN unit VARCHAR(20) DEFAULT NULL COMMENT '单位'`)
    await addOpCol('water_volume', `ALTER TABLE operation_record ADD COLUMN water_volume DECIMAL(12,2) DEFAULT NULL COMMENT '用水量(L)'`)
    await addOpCol('duration_minutes', `ALTER TABLE operation_record ADD COLUMN duration_minutes INT DEFAULT NULL COMMENT '时长(分钟)'`)
    await addOpCol('remark', `ALTER TABLE operation_record ADD COLUMN remark VARCHAR(255) DEFAULT NULL COMMENT '备注'`)
    await addOpCol('source_type', `ALTER TABLE operation_record ADD COLUMN source_type VARCHAR(30) DEFAULT NULL COMMENT '来源'`)
  }
}

async function upsertRole(conn, role_id, role_name) {
  await conn.execute(
    `INSERT INTO role (role_id, role_name) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE role_name = VALUES(role_name)`,
    [role_id, role_name]
  )
}

async function upsertUser(conn, { role_id, username, passwordHash, real_name, phone, farm_id }) {
  const [rows] = await conn.execute(`SELECT user_id FROM user WHERE username = ? LIMIT 1`, [username])
  if (rows?.length) {
    await conn.execute(
      `UPDATE user SET role_id=?, password=?, real_name=?, phone=?, farm_id=? WHERE username=?`,
      [role_id, passwordHash, real_name, phone, farm_id ?? null, username]
    )
    return rows[0].user_id
  }
  const [r] = await conn.execute(
    `INSERT INTO user (role_id, username, password, real_name, phone, farm_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [role_id, username, passwordHash, real_name, phone, farm_id ?? null]
  )
  return r.insertId
}

async function upsertFarm(conn, farm) {
  const code = farm.farm_code || null
  if (code) {
    const [rows] = await conn.execute(`SELECT farm_id FROM farm WHERE farm_code = ? LIMIT 1`, [code])
    if (rows?.length) {
      await conn.execute(
        `UPDATE farm
         SET farm_name=?, address=?, principal_id=?, phone=?, farm_level=?, longitude=?, latitude=?, total_area=?,
             irrigation_mode=?, soil_quality_level=?, remark=?
         WHERE farm_code=?`,
        [
          farm.farm_name,
          farm.address,
          farm.principal_id,
          farm.phone,
          farm.farm_level ?? 'demo',
          farm.longitude ?? null,
          farm.latitude ?? null,
          farm.total_area ?? 0,
          farm.irrigation_mode ?? 'auto_manual',
          farm.soil_quality_level ?? 'B',
          farm.remark ?? null,
          code
        ]
      )
      return rows[0].farm_id
    }
  }

  const cols = await getColumns(conn, 'farm')
  const insert = {
    farm_name: farm.farm_name,
    farm_code: farm.farm_code ?? null,
    address: farm.address,
    principal_id: farm.principal_id,
    phone: farm.phone,
    farm_level: farm.farm_level ?? 'demo',
    longitude: farm.longitude ?? null,
    latitude: farm.latitude ?? null,
    total_area: farm.total_area ?? 0,
    region_count: farm.region_count ?? 0,
    active_crop_count: farm.active_crop_count ?? 0,
    irrigation_mode: farm.irrigation_mode ?? 'auto_manual',
    soil_quality_level: farm.soil_quality_level ?? 'B',
    remark: farm.remark ?? null
  }
  const keys = Object.keys(insert).filter((k) => cols.has(k))
  const sql = `INSERT INTO farm (${keys.map((k) => `\`${k}\``).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
  const [r] = await conn.execute(sql, keys.map((k) => insert[k]))
  return r.insertId
}

async function upsertCrop(conn, crop) {
  const cols = await getColumns(conn, 'crop')
  // 以 (farm_id, plant_area, crop_type) 作为“演示数据”的唯一定位
  const [ex] = await conn.execute(
    `SELECT crop_id FROM crop WHERE farm_id=? AND plant_area=? AND crop_type=? ORDER BY crop_id LIMIT 1`,
    [crop.farm_id, crop.plant_area, crop.crop_type]
  )
  const data = {
    farm_id: crop.farm_id,
    crop_type: crop.crop_type,
    crop_name: crop.crop_name ?? null,
    crop_category: crop.crop_category ?? null,
    plant_status: crop.plant_status ?? null,
    plant_area: crop.plant_area,
    sow_time: crop.sow_time,
    growth_cycle: crop.growth_cycle ?? null,
    remark: crop.remark ?? null
  }
  const keys = Object.keys(data).filter((k) => cols.has(k))
  if (ex?.length) {
    // sow_time 也更新一下，便于“积温/生长进度”展示
    const setSql = keys.filter((k) => k !== 'farm_id' && k !== 'plant_area' && k !== 'crop_type').map((k) => `\`${k}\`=?`).join(', ')
    await conn.execute(
      `UPDATE crop SET ${setSql} WHERE crop_id=?`,
      [...keys.filter((k) => k !== 'farm_id' && k !== 'plant_area' && k !== 'crop_type').map((k) => data[k]), ex[0].crop_id]
    )
    return ex[0].crop_id
  }
  const sql = `INSERT INTO crop (${keys.map((k) => `\`${k}\``).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
  const [r] = await conn.execute(sql, keys.map((k) => data[k]))
  return r.insertId
}

async function upsertEnv(conn, envRow) {
  const cols = await getColumns(conn, 'environment_monitor')
  const data = {
    farm_id: envRow.farm_id,
    temperature: envRow.temperature ?? null,
    humidity: envRow.humidity ?? null,
    soil_ph: envRow.soil_ph ?? null,
    monitor_time: envRow.monitor_time,
    weather_type: envRow.weather_type ?? null,
    wind_speed: envRow.wind_speed ?? null,
    rainfall: envRow.rainfall ?? null,
    plant_area: envRow.plant_area ?? null,
    soil_moisture: envRow.soil_moisture ?? null,
    light_lux: envRow.light_lux ?? null
  }
  const keys = Object.keys(data).filter((k) => cols.has(k))
  const sql = `INSERT INTO environment_monitor (${keys.map((k) => `\`${k}\``).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
  await conn.execute(sql, keys.map((k) => data[k]))
}

async function upsertDeviceWithVideo(conn, payload) {
  const cols = await getColumns(conn, 'monitor_device')
  const [rows] = await conn.execute(`SELECT device_id, farm_id FROM monitor_device WHERE device_name = ? LIMIT 1`, [
    payload.device_name
  ])
  let deviceId = rows?.[0]?.device_id
  const devData = {
    farm_id: payload.farm_id,
    device_name: payload.device_name,
    device_category: payload.device_category ?? null,
    install_location: payload.install_location ?? '',
    device_status: payload.device_status ?? '在线',
    monitor_area: payload.monitor_area ?? '演示',
    last_online_time: payload.last_online_time ?? new Date()
  }
  const keys = Object.keys(devData).filter((k) => cols.has(k))
  if (deviceId) {
    const setSql = keys.filter((k) => k !== 'device_name').map((k) => `\`${k}\`=?`).join(', ')
    await conn.execute(
      `UPDATE monitor_device SET ${setSql} WHERE device_id = ?`,
      [...keys.filter((k) => k !== 'device_name').map((k) => devData[k]), deviceId]
    )
  } else {
    const sql = `INSERT INTO monitor_device (${keys.map((k) => `\`${k}\``).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
    const [r] = await conn.execute(sql, keys.map((k) => devData[k]))
    deviceId = r.insertId
  }

  const [vd] = await conn.execute(`SELECT id FROM video_device WHERE device_id = ? LIMIT 1`, [deviceId])
  if (vd?.length) {
    await conn.execute(`UPDATE video_device SET video_url=?, video_status=?, farm_id=? WHERE device_id=?`, [
      payload.video_url,
      payload.video_status ?? 1,
      payload.farm_id,
      deviceId
    ])
  } else {
    await conn.execute(`INSERT INTO video_device (device_id, video_url, video_status, farm_id) VALUES (?, ?, ?, ?)`, [
      deviceId,
      payload.video_url,
      payload.video_status ?? 1,
      payload.farm_id
    ])
  }
  return deviceId
}

async function upsertMaterial(conn, mat) {
  const cols = await getColumns(conn, 'agricultural_material')
  const [rows] = await conn.execute(
    `SELECT material_id FROM agricultural_material WHERE farm_id=? AND material_name=? LIMIT 1`,
    [mat.farm_id, mat.material_name]
  )
  const data = {
    farm_id: mat.farm_id,
    material_name: mat.material_name,
    material_type: mat.material_type,
    price: mat.price,
    stock_num: mat.stock_num ?? 0,
    brand: mat.brand ?? null,
    spec: mat.spec ?? null,
    unit: mat.unit ?? null,
    safety_stock_num: mat.safety_stock_num ?? 0,
    shelf_status: mat.shelf_status ?? 'ON'
  }
  const keys = Object.keys(data).filter((k) => cols.has(k))
  if (rows?.length) {
    const setSql = keys.filter((k) => k !== 'farm_id' && k !== 'material_name').map((k) => `\`${k}\`=?`).join(', ')
    await conn.execute(
      `UPDATE agricultural_material SET ${setSql} WHERE material_id=?`,
      [...keys.filter((k) => k !== 'farm_id' && k !== 'material_name').map((k) => data[k]), rows[0].material_id]
    )
    return rows[0].material_id
  }
  const sql = `INSERT INTO agricultural_material (${keys.map((k) => `\`${k}\``).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
  const [r] = await conn.execute(sql, keys.map((k) => data[k]))
  return r.insertId
}

async function upsertWarningHandle(conn, farm_id, material_id, handler_id, handle_status) {
  await conn.execute(
    `INSERT INTO material_warning_handle (farm_id, material_id, handle_status, handle_time, handler_id)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE handle_status=VALUES(handle_status), handle_time=VALUES(handle_time), handler_id=VALUES(handler_id)`,
    [farm_id, material_id, handle_status, handle_status === '已处理' ? new Date() : null, handler_id ?? null]
  )
}

async function insertPurchaseIfMissing(conn, rec) {
  const [rows] = await conn.execute(`SELECT purchase_id FROM material_purchase_record WHERE purchase_no = ? LIMIT 1`, [
    rec.purchase_no
  ])
  if (rows?.length) return rows[0].purchase_id
  const [r] = await conn.execute(
    `
      INSERT INTO material_purchase_record
        (purchase_no, material_id, material_name, farm_id, farm_name, purchase_qty, unit_price, total_amount, supplier, purchase_status, purchase_time, operator_id, remark)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      rec.purchase_no,
      rec.material_id,
      rec.material_name,
      rec.farm_id,
      rec.farm_name,
      rec.purchase_qty,
      rec.unit_price,
      rec.total_amount,
      rec.supplier ?? null,
      rec.purchase_status ?? '待入库',
      rec.purchase_time,
      rec.operator_id ?? null,
      rec.remark ?? null
    ]
  )
  return r.insertId
}

async function insertOperationIfMissing(conn, op) {
  const cols = await getColumns(conn, 'operation_record')
  const signature = op.signature || null
  if (signature && cols.has('remark')) {
    const [rows] = await conn.execute(
      `SELECT record_id FROM operation_record WHERE farm_id=? AND remark=? ORDER BY record_id LIMIT 1`,
      [op.farm_id, signature]
    )
    if (rows?.length) return rows[0].record_id
  }
  const data = {
    user_id: op.user_id,
    farm_id: op.farm_id,
    operation_type: op.operation_type,
    operation_time: op.operation_time,
    relate_id: op.relate_id ?? null,
    operation_detail: op.operation_detail ?? null,
    area_name: op.area_name ?? null,
    crop_id: op.crop_id ?? null,
    material_id: op.material_id ?? null,
    op_subtype: op.op_subtype ?? null,
    method: op.method ?? null,
    amount: op.amount ?? null,
    unit: op.unit ?? null,
    water_volume: op.water_volume ?? null,
    duration_minutes: op.duration_minutes ?? null,
    remark: signature ?? op.remark ?? null,
    source_type: op.source_type ?? op.operation_type
  }
  const keys = Object.keys(data).filter((k) => cols.has(k))
  const sql = `INSERT INTO operation_record (${keys.map((k) => `\`${k}\``).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
  const [r] = await conn.execute(sql, keys.map((k) => data[k]))
  return r.insertId
}

async function insertExceptionIfMissing(conn, ex) {
  const [rows] = await conn.execute(
    `SELECT exception_id FROM crop_exception WHERE crop_id=? AND device_id=? AND exception_type=? AND source_type=? ORDER BY exception_id LIMIT 1`,
    [ex.crop_id, ex.device_id, ex.exception_type, ex.source_type ?? 'manual']
  )
  if (rows?.length) return rows[0].exception_id
  const cols = await getColumns(conn, 'crop_exception')
  const data = {
    crop_id: ex.crop_id,
    device_id: ex.device_id,
    exception_type: ex.exception_type,
    exception_time: ex.exception_time,
    exception_detail: ex.exception_detail ?? null,
    video_url: ex.video_url ?? null,
    handle_status: ex.handle_status ?? '未处理',
    warning_level: ex.warning_level ?? 2,
    scroll_sort: ex.scroll_sort ?? Math.floor(Date.now() / 1000),
    source_type: ex.source_type ?? 'manual',
    suggest_content: ex.suggest_content ?? null,
    predicted_prob: ex.predicted_prob ?? null
  }
  const keys = Object.keys(data).filter((k) => cols.has(k))
  const sql = `INSERT INTO crop_exception (${keys.map((k) => `\`${k}\``).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
  const [r] = await conn.execute(sql, keys.map((k) => data[k]))
  return r.insertId
}

async function insertPushIfMissing(conn, exception_id, receiver_id) {
  const [rows] = await conn.execute(
    `SELECT push_id FROM exception_push WHERE exception_id=? AND receiver_id=? LIMIT 1`,
    [exception_id, receiver_id]
  )
  if (rows?.length) return rows[0].push_id
  const [r] = await conn.execute(
    `INSERT INTO exception_push (exception_id, receiver_id, push_method, push_time, read_status)
     VALUES (?, ?, '站内信', NOW(), '未读')`,
    [exception_id, receiver_id]
  )
  return r.insertId
}

async function markReadIfMissing(conn, warning_id, user_id) {
  await conn.execute(
    `INSERT INTO warning_read (warning_id, user_id, read_time)
     VALUES (?, ?, NOW())
     ON DUPLICATE KEY UPDATE read_time = NOW()`,
    [warning_id, user_id]
  )
}

async function main() {
  let conn
  try {
    conn = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: envInt('DB_PORT', 3306),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'Gwj@147',
      database: process.env.DB_NAME || 'smart_agriculture',
      multipleStatements: true
    })
    console.log('[init-full-data] 数据库连接成功')

    await conn.beginTransaction()

    // 1) Schema
    console.log('[1/6] 确保扩展表/字段存在')
    await ensureSchema(conn)

    // 2) RBAC users + roles
    console.log('[2/6] 账号/角色（admin/operator/user，密码123456）')
    const passwordHash = await bcrypt.hash('123456', 10)
    await upsertRole(conn, 1, '管理员')
    await upsertRole(conn, 2, '运维人员')
    await upsertRole(conn, 3, '普通用户')

    const adminId = await upsertUser(conn, {
      role_id: 1,
      username: 'admin',
      passwordHash,
      real_name: '系统管理员',
      phone: '13800138000',
      farm_id: null
    })

    // 3) Farms
    console.log('[3/6] 农场/作物/环境监测/设备/通用视频')
    const farm1 = await upsertFarm(conn, {
      farm_name: '演示农场A（温室）',
      farm_code: 'DEMO-FARM-A',
      address: '演示地址A',
      principal_id: adminId,
      phone: '13800138000',
      farm_level: 'demo',
      longitude: 116.397128,
      latitude: 39.916527,
      total_area: 88.6,
      irrigation_mode: 'auto_manual',
      soil_quality_level: 'B',
      remark: 'init-full-data 自动生成'
    })
    const farm2 = await upsertFarm(conn, {
      farm_name: '演示农场B（露地）',
      farm_code: 'DEMO-FARM-B',
      address: '演示地址B',
      principal_id: adminId,
      phone: '13800138001',
      farm_level: 'demo',
      longitude: 117.200983,
      latitude: 39.084158,
      total_area: 120.5,
      irrigation_mode: 'auto_manual',
      soil_quality_level: 'A',
      remark: 'init-full-data 自动生成'
    })

    const operatorId = await upsertUser(conn, {
      role_id: 2,
      username: 'operator',
      passwordHash,
      real_name: '农场管理员',
      phone: '13800138001',
      farm_id: farm1
    })
    const userId = await upsertUser(conn, {
      role_id: 3,
      username: 'user',
      passwordHash,
      real_name: '普通用户',
      phone: '13800138002',
      farm_id: farm1
    })

    // crops (用于：预警列表、积温进度、地块对比)
    const now = Date.now()
    const day = 24 * 3600 * 1000
    const cropA1 = await upsertCrop(conn, {
      farm_id: farm1,
      crop_type: '番茄',
      crop_name: '樱桃番茄',
      crop_category: '果蔬',
      plant_status: '生长中',
      plant_area: 'A-1棚',
      sow_time: new Date(now - 42 * day),
      growth_cycle: 95,
      remark: '演示作物'
    })
    const cropA2 = await upsertCrop(conn, {
      farm_id: farm1,
      crop_type: '黄瓜',
      crop_name: '水果黄瓜',
      crop_category: '果蔬',
      plant_status: '生长中',
      plant_area: 'A-2棚',
      sow_time: new Date(now - 28 * day),
      growth_cycle: 80,
      remark: '演示作物'
    })
    const cropB1 = await upsertCrop(conn, {
      farm_id: farm2,
      crop_type: '玉米',
      crop_name: '甜玉米',
      crop_category: '粮食',
      plant_status: '生长中',
      plant_area: 'B-北地块',
      sow_time: new Date(now - 35 * day),
      growth_cycle: 110,
      remark: '演示作物'
    })

    // env monitor：近 48h 每 6h 8条 * 2农场 * 2地块（用于：病虫害规则/土壤外推/历史同期对照等）
    const weatherSeq = ['晴', '阴', '雨', '晴', '阴', '晴', '雨', '晴']
    for (let i = 0; i < 8; i++) {
      const t = new Date(now - (48 - i * 6) * 3600 * 1000)
      const wf = weatherSeq[i % weatherSeq.length]
      const baseRain = wf === '雨' ? 3.2 + (i % 3) * 1.4 : 0
      const baseWind = 1.8 + (i % 4) * 0.6
      await upsertEnv(conn, {
        farm_id: farm1,
        plant_area: 'A-1棚',
        temperature: 22 + (i % 3) * 1.4,
        humidity: 68 + (i % 4) * 3.2,
        soil_ph: 6.5,
        soil_moisture: 34 - i * 0.8,
        light_lux: 12000 + (i % 5) * 2600,
        weather_type: wf,
        wind_speed: baseWind,
        rainfall: baseRain,
        monitor_time: t
      })
      await upsertEnv(conn, {
        farm_id: farm1,
        plant_area: 'A-2棚',
        temperature: 23 + (i % 3) * 1.2,
        humidity: 62 + (i % 4) * 3.5,
        soil_ph: 6.4,
        soil_moisture: 38 - i * 0.7,
        light_lux: 11000 + (i % 5) * 2400,
        weather_type: wf,
        wind_speed: baseWind,
        rainfall: baseRain,
        monitor_time: t
      })
      await upsertEnv(conn, {
        farm_id: farm2,
        plant_area: 'B-北地块',
        temperature: 20 + (i % 3) * 1.7,
        humidity: 58 + (i % 4) * 2.8,
        soil_ph: 6.8,
        soil_moisture: 31 - i * 0.6,
        light_lux: 14000 + (i % 5) * 3100,
        weather_type: wf,
        wind_speed: baseWind + 0.6,
        rainfall: baseRain + (wf === '雨' ? 0.8 : 0),
        monitor_time: t
      })
    }

    // demo videos: /demo-video/1..4
    await upsertDeviceWithVideo(conn, {
      farm_id: farm1,
      device_name: '通用视频-样例1',
      device_category: '摄像头',
      install_location: '同源演示 /demo-video/1',
      device_status: '在线',
      monitor_area: '演示',
      video_url: '/demo-video/1',
      video_status: 1,
      last_online_time: new Date()
    })
    await upsertDeviceWithVideo(conn, {
      farm_id: farm1,
      device_name: '通用视频-样例2',
      device_category: '摄像头',
      install_location: '同源演示 /demo-video/2',
      device_status: '在线',
      monitor_area: '演示',
      video_url: '/demo-video/2',
      video_status: 1,
      last_online_time: new Date()
    })
    await upsertDeviceWithVideo(conn, {
      farm_id: farm1,
      device_name: '通用视频-样例3',
      device_category: '摄像头',
      install_location: '同源演示 /demo-video/3',
      device_status: '在线',
      monitor_area: '演示',
      video_url: '/demo-video/3',
      video_status: 1,
      last_online_time: new Date()
    })
    await upsertDeviceWithVideo(conn, {
      farm_id: farm1,
      device_name: '通用视频-样例4',
      device_category: '摄像头',
      install_location: '同源演示 /demo-video/4',
      device_status: '在线',
      monitor_area: '演示',
      video_url: '/demo-video/4',
      video_status: 1,
      last_online_time: new Date()
    })

    // 4) Materials + purchases + handles
    console.log('[4/6] 农资/库存预警/采购记录（含推荐采购链路）')
    const matSeed = [
      { farm_id: farm1, material_name: '复合肥（高钾）', material_type: '化肥', price: 168, stock_num: 0, safety_stock_num: 18, unit: '袋', brand: '云天化', spec: '50kg/袋' },
      { farm_id: farm1, material_name: '杀虫剂（吡虫啉）', material_type: '农药', price: 58, stock_num: 3, safety_stock_num: 10, unit: '瓶', brand: '拜耳作物科学', spec: '500ml/瓶' },
      { farm_id: farm1, material_name: '番茄种子', material_type: '种子', price: 12, stock_num: 25, safety_stock_num: 15, unit: '袋', brand: '先农种业', spec: '1kg/袋' },
      { farm_id: farm1, material_name: '黄瓜种子', material_type: '种子', price: 10, stock_num: 6, safety_stock_num: 15, unit: '袋', brand: '先农种业', spec: '1kg/袋' },
      { farm_id: farm1, material_name: '滴灌管件', material_type: '工具', price: 6, stock_num: 2, safety_stock_num: 5, unit: '件', brand: '农友工具', spec: '标准件' }
    ]
    const materialIds = {}
    for (const m of matSeed) {
      const id = await upsertMaterial(conn, m)
      materialIds[m.material_name] = id
    }
    // material warning handle: 让其中 1 个显示“已处理”，其余未处理
    await upsertWarningHandle(conn, farm1, materialIds['黄瓜种子'], operatorId, '已处理')
    await upsertWarningHandle(conn, farm1, materialIds['复合肥（高钾）'], null, '未处理')
    await upsertWarningHandle(conn, farm1, materialIds['杀虫剂（吡虫啉）'], null, '未处理')
    await upsertWarningHandle(conn, farm1, materialIds['滴灌管件'], null, '未处理')

    // purchases: 两条待入库，一条已入库（用于列表/筛选/批量入库/跳转联动）
    const [farmRows] = await conn.execute(`SELECT farm_name FROM farm WHERE farm_id = ?`, [farm1])
    const farmName = farmRows?.[0]?.farm_name || '演示农场'
    const mkNo = (tag) => `PO-DEMO-${tag}-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}`
    await insertPurchaseIfMissing(conn, {
      purchase_no: mkNo('A1'),
      material_id: materialIds['复合肥（高钾）'],
      material_name: '复合肥（高钾）',
      farm_id: farm1,
      farm_name: farmName,
      purchase_qty: 20,
      unit_price: 165,
      total_amount: 3300,
      supplier: '本地农资站',
      purchase_status: '待入库',
      purchase_time: new Date(now - 2 * day),
      operator_id: operatorId,
      remark: '演示：来自智能预测推荐采购'
    })
    await insertPurchaseIfMissing(conn, {
      purchase_no: mkNo('A2'),
      material_id: materialIds['滴灌管件'],
      material_name: '滴灌管件',
      farm_id: farm1,
      farm_name: farmName,
      purchase_qty: 10,
      unit_price: 5.5,
      total_amount: 55,
      supplier: '五金耗材供应商',
      purchase_status: '待入库',
      purchase_time: new Date(now - 1 * day),
      operator_id: operatorId,
      remark: '演示：待入库'
    })
    await insertPurchaseIfMissing(conn, {
      purchase_no: mkNo('A3'),
      material_id: materialIds['番茄种子'],
      material_name: '番茄种子',
      farm_id: farm1,
      farm_name: farmName,
      purchase_qty: 30,
      unit_price: 11.5,
      total_amount: 345,
      supplier: '先农种业直营网点',
      purchase_status: '已入库',
      purchase_time: new Date(now - 7 * day),
      operator_id: operatorId,
      remark: '演示：已入库历史'
    })

    // 5) Operations + warnings (for warning pages + overview advanced)
    console.log('[5/6] 农事操作记录 + 预警异常/推送/已读')
    await insertOperationIfMissing(conn, {
      signature: 'DEMO_OP_IRR_1',
      user_id: operatorId,
      farm_id: farm1,
      operation_type: '灌溉',
      operation_time: new Date(now - 3 * day),
      relate_id: cropA1,
      crop_id: cropA1,
      area_name: 'A-1棚',
      method: '滴灌',
      water_volume: 22.5,
      duration_minutes: 42,
      operation_detail: '区域 A-1棚 常规灌溉',
      source_type: '灌溉'
    })
    await insertOperationIfMissing(conn, {
      signature: 'DEMO_OP_FERT_1',
      user_id: operatorId,
      farm_id: farm1,
      operation_type: '施肥',
      operation_time: new Date(now - 4 * day),
      relate_id: cropA1,
      crop_id: cropA1,
      area_name: 'A-1棚',
      material_id: materialIds['复合肥（高钾）'],
      op_subtype: '复合肥',
      method: '沟施',
      amount: 12.5,
      unit: 'kg',
      operation_detail: '番茄棚补充基肥',
      source_type: '施肥'
    })

    // 一个“环境采集终端（系统）”设备（smartWarning 会用到）
    const envDeviceId = await upsertDeviceWithVideo(conn, {
      farm_id: farm1,
      device_name: '环境采集终端（系统）',
      device_category: '传感器',
      install_location: '环境监测绑定',
      device_status: '在线',
      monitor_area: '全场',
      video_url: '/demo-video/1',
      video_status: 1,
      last_online_time: new Date()
    })

    const ex1 = await insertExceptionIfMissing(conn, {
      crop_id: cropA1,
      device_id: envDeviceId,
      exception_type: '病虫害',
      exception_time: new Date(now - 20 * 3600 * 1000),
      exception_detail: '叶片局部出现蚜虫，建议窗口期 24~48h 内处理',
      video_url: '/demo-video/2',
      handle_status: '未处理',
      warning_level: 2,
      source_type: 'rule',
      suggest_content: '建议喷施对症杀虫剂，并加强通风降湿',
      predicted_prob: null
    })
    const ex2 = await insertExceptionIfMissing(conn, {
      crop_id: cropA2,
      device_id: envDeviceId,
      exception_type: '建议灌溉',
      exception_time: new Date(now - 10 * 3600 * 1000),
      exception_detail: '土壤湿度偏低（演示数据），建议尽快安排灌溉补水',
      video_url: '/demo-video/1',
      handle_status: '未处理',
      warning_level: 2,
      source_type: 'environment',
      suggest_content: '建议 12 小时内进行一次灌溉，避免缺水影响生长',
      predicted_prob: null
    })
    const ex3 = await insertExceptionIfMissing(conn, {
      crop_id: cropB1,
      device_id: envDeviceId,
      exception_type: '预测预警',
      exception_time: new Date(now - 6 * 3600 * 1000),
      exception_detail: '模型预测未来 24h 出现异常概率偏高（演示）',
      video_url: '/demo-video/3',
      handle_status: '未处理',
      warning_level: 1,
      source_type: 'ml',
      suggest_content: '建议检查灌溉、通风与病害风险，必要时提前处理',
      predicted_prob: 0.93
    })

    // exception_push：推给 admin/operator/user
    await insertPushIfMissing(conn, ex1, adminId)
    await insertPushIfMissing(conn, ex1, operatorId)
    await insertPushIfMissing(conn, ex1, userId)
    await insertPushIfMissing(conn, ex2, operatorId)
    await insertPushIfMissing(conn, ex3, adminId)

    // warning_read：让 user 已读其中 1 条
    await markReadIfMissing(conn, ex2, userId)

    // 6) Overview user pref：灌溉策略默认值
    console.log('[6/6] 智能预测偏好（灌溉策略）')
    await conn.execute(
      `INSERT INTO overview_user_pref (user_id, farm_id, irrigation_strategy_key)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE irrigation_strategy_key = VALUES(irrigation_strategy_key)`,
      [operatorId, farm1, 'balanced']
    )

    await conn.commit()
    console.log('[init-full-data] 完成：已插入/更新完整演示数据（可重复执行）')
    console.log('测试账号：admin / 123456, operator / 123456, user / 123456')
  } catch (e) {
    try {
      if (conn) await conn.rollback()
    } catch {}
    console.error('[init-full-data] 失败：', e.message)
    process.exitCode = 1
  } finally {
    try {
      if (conn) await conn.end()
    } catch {}
  }
}

main()

