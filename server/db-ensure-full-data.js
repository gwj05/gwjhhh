/**
 * 数据库完整性：补字段、回填示例数据、修正关联（不修改前端）
 * 运行：node db-ensure-full-data.js   或   npm run db:full-data
 *
 * 说明：
 * - environment_exception_log（环境规则日志）与 crop_exception（作物异常业务表）职责不同，不合并。
 * - 本脚本可重复执行，尽量幂等。
 */
require('dotenv').config()
const pool = require('./config/database')
const materialRouter = require('./routes/material')

async function columnExists(table, column) {
  const [rows] = await pool.execute(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  )
  return rows?.length > 0
}

async function addColumnIfMissing(table, column, alterSql) {
  if (await columnExists(table, column)) return false
  await pool.execute(alterSql)
  return true
}

async function ensureOperationColumns() {
  const cols = [
    ['area_name', `ALTER TABLE operation_record ADD COLUMN area_name VARCHAR(100) DEFAULT NULL COMMENT '种植区域名称'`],
    ['crop_id', `ALTER TABLE operation_record ADD COLUMN crop_id INT DEFAULT NULL COMMENT '作物ID'`],
    ['material_id', `ALTER TABLE operation_record ADD COLUMN material_id INT DEFAULT NULL COMMENT '农资ID'`],
    ['op_subtype', `ALTER TABLE operation_record ADD COLUMN op_subtype VARCHAR(50) DEFAULT NULL COMMENT '子类型'`],
    ['method', `ALTER TABLE operation_record ADD COLUMN method VARCHAR(30) DEFAULT NULL COMMENT '方式'`],
    ['amount', `ALTER TABLE operation_record ADD COLUMN amount DECIMAL(12,2) DEFAULT NULL COMMENT '使用量'`],
    ['unit', `ALTER TABLE operation_record ADD COLUMN unit VARCHAR(20) DEFAULT NULL COMMENT '单位'`],
    ['water_volume', `ALTER TABLE operation_record ADD COLUMN water_volume DECIMAL(12,2) DEFAULT NULL COMMENT '用水量(L)'`],
    ['duration_minutes', `ALTER TABLE operation_record ADD COLUMN duration_minutes INT DEFAULT NULL COMMENT '时长(分钟)'`],
    ['remark', `ALTER TABLE operation_record ADD COLUMN remark VARCHAR(255) DEFAULT NULL COMMENT '备注'`],
    ['source_type', `ALTER TABLE operation_record ADD COLUMN source_type VARCHAR(30) DEFAULT NULL COMMENT '来源'`]
  ]
  for (const [name, sql] of cols) {
    await addColumnIfMissing('operation_record', name, sql)
  }
}

async function main() {
  const conn = await pool.getConnection()
  try {
    console.log('[0/8] environment_monitor 扩展字段（与路由一致）')
    await addColumnIfMissing(
      'environment_monitor',
      'plant_area',
      `ALTER TABLE environment_monitor ADD COLUMN plant_area VARCHAR(100) DEFAULT NULL COMMENT '种植区域'`
    )
    await addColumnIfMissing(
      'environment_monitor',
      'soil_moisture',
      `ALTER TABLE environment_monitor ADD COLUMN soil_moisture DECIMAL(5,2) DEFAULT NULL COMMENT '土壤湿度(%)'`
    )
    await addColumnIfMissing(
      'environment_monitor',
      'light_lux',
      `ALTER TABLE environment_monitor ADD COLUMN light_lux DECIMAL(12,2) DEFAULT NULL COMMENT '光照(lux)'`
    )

    console.log('[1/8] ensureMaterialTables (brand/spec/safety/...)')
    await materialRouter.ensureMaterialTables()

    console.log('[2/8] agricultural_material.unit + 回填品牌/规格/计量单位')
    await addColumnIfMissing(
      'agricultural_material',
      'unit',
      `ALTER TABLE agricultural_material ADD COLUMN unit VARCHAR(20) DEFAULT NULL COMMENT '计量单位（袋/kg/L/件等）'`
    )

    await conn.execute(`
      UPDATE agricultural_material
      SET material_type = CASE
        WHEN material_type IN ('肥料','复合肥料','复合肥') THEN '化肥'
        WHEN material_type IN ('谷类','粮食') THEN '种子'
        ELSE material_type
      END
      WHERE material_type IN ('肥料','复合肥料','复合肥','谷类','粮食')
    `)

    await conn.execute(`
      UPDATE agricultural_material SET
        brand = CASE material_type
          WHEN '种子' THEN COALESCE(NULLIF(TRIM(brand),''), '先农种业')
          WHEN '化肥' THEN COALESCE(NULLIF(TRIM(brand),''), '云天化')
          WHEN '农药' THEN COALESCE(NULLIF(TRIM(brand),''), '拜耳作物科学')
          WHEN '工具' THEN COALESCE(NULLIF(TRIM(brand),''), '农友工具')
          ELSE COALESCE(NULLIF(TRIM(brand),''), '通用农资')
        END,
        spec = CASE material_type
          WHEN '种子' THEN COALESCE(NULLIF(TRIM(spec),''), '1kg/袋')
          WHEN '化肥' THEN COALESCE(NULLIF(TRIM(spec),''), '50kg/袋')
          WHEN '农药' THEN COALESCE(NULLIF(TRIM(spec),''), '500ml/瓶')
          WHEN '工具' THEN COALESCE(NULLIF(TRIM(spec),''), '标准件')
          ELSE COALESCE(NULLIF(TRIM(spec),''), '标准规格')
        END,
        unit = CASE material_type
          WHEN '种子' THEN COALESCE(NULLIF(TRIM(unit),''), '袋')
          WHEN '化肥' THEN COALESCE(NULLIF(TRIM(unit),''), '袋')
          WHEN '农药' THEN COALESCE(NULLIF(TRIM(unit),''), '瓶')
          WHEN '工具' THEN COALESCE(NULLIF(TRIM(unit),''), '件')
          ELSE COALESCE(NULLIF(TRIM(unit),''), '件')
        END
      WHERE brand IS NULL OR TRIM(brand) = ''
         OR spec IS NULL OR TRIM(spec) = ''
         OR unit IS NULL OR TRIM(unit) = ''
    `)

    console.log('[3/8] crop 作物名称与状态补全')
    await conn.execute(`
      UPDATE crop SET
        crop_name = CASE
          WHEN crop_name IS NULL OR TRIM(crop_name) = '' THEN crop_type
          ELSE crop_name
        END
    `)
    await conn.execute(`
      UPDATE crop SET crop_category = COALESCE(NULLIF(TRIM(crop_category),''), '果蔬')
      WHERE crop_category IS NULL OR TRIM(crop_category) = ''
    `)
    await conn.execute(`
      UPDATE crop SET plant_status = COALESCE(NULLIF(TRIM(plant_status),''), '生长中')
      WHERE plant_status IS NULL OR TRIM(plant_status) = ''
    `)
    await conn.execute(`
      UPDATE crop SET growth_cycle = COALESCE(growth_cycle, 90)
      WHERE growth_cycle IS NULL OR growth_cycle <= 0
    `)

    console.log('[4/8] operation_record 表结构 + 历史行补全（灌溉/施肥）')
    await ensureOperationColumns()

    await conn.execute(`
      UPDATE operation_record
      SET crop_id = COALESCE(crop_id, relate_id)
      WHERE operation_type IN ('灌溉','施肥')
        AND relate_id IS NOT NULL
        AND (crop_id IS NULL OR crop_id = 0)
    `)

    await conn.execute(`
      UPDATE operation_record o
      INNER JOIN crop c ON c.crop_id = o.crop_id
      SET o.area_name = COALESCE(NULLIF(TRIM(o.area_name),''), c.plant_area)
      WHERE o.operation_type IN ('灌溉','施肥')
        AND (o.area_name IS NULL OR TRIM(o.area_name) = '')
    `)

    await conn.execute(`
      UPDATE operation_record o
      SET o.water_volume = COALESCE(o.water_volume, 15 + (o.record_id % 25) * 0.8),
        o.duration_minutes = COALESCE(o.duration_minutes, 25 + (o.record_id % 50)),
        o.method = COALESCE(NULLIF(TRIM(o.method),''), CASE (o.record_id % 4)
          WHEN 0 THEN '滴灌'
          WHEN 1 THEN '喷灌'
          WHEN 2 THEN '沟灌'
          ELSE '微喷'
        END)
      WHERE o.operation_type = '灌溉'
    `)

    await conn.execute(`
      UPDATE operation_record o
      SET o.amount = COALESCE(o.amount, 1 + (o.record_id % 8) * 0.5),
        o.unit = COALESCE(NULLIF(TRIM(o.unit),''), 'kg'),
        o.method = COALESCE(NULLIF(TRIM(o.method),''), '撒施'),
        o.op_subtype = COALESCE(NULLIF(TRIM(o.op_subtype),''), '复合肥')
      WHERE o.operation_type = '施肥'
        AND (o.amount IS NULL OR o.method IS NULL OR o.unit IS NULL OR TRIM(o.unit) = '')
    `)

    await conn.execute(`
      UPDATE operation_record o
      SET o.source_type = COALESCE(o.source_type, o.operation_type)
      WHERE o.operation_type IN ('灌溉','施肥') AND (o.source_type IS NULL OR TRIM(o.source_type) = '')
    `)

    console.log('[5/8] 补充演示灌溉/施肥记录（农场有作物且记录偏少时）')
    const [adminRows] = await conn.execute(
      `SELECT user_id FROM user WHERE role_id = 1 ORDER BY user_id LIMIT 1`
    )
    const adminId = adminRows?.[0]?.user_id || 1

    const [farms] = await conn.execute(`SELECT farm_id, farm_name FROM farm ORDER BY farm_id`)
    for (const f of farms) {
      const fid = f.farm_id
      const [already] = await conn.execute(
        `SELECT 1 FROM operation_record WHERE farm_id = ? AND remark = '系统自动补全演示' LIMIT 1`,
        [fid]
      )
      if (already?.length) continue

      const [cnt] = await conn.execute(
        `SELECT COUNT(*) AS n FROM operation_record WHERE farm_id = ? AND operation_type IN ('灌溉','施肥')`,
        [fid]
      )
      const n = cnt?.[0]?.n || 0
      if (n >= 6) continue

      const [crops] = await conn.execute(
        `SELECT crop_id, plant_area, crop_type FROM crop WHERE farm_id = ? ORDER BY crop_id LIMIT 3`,
        [fid]
      )
      const [mats] = await conn.execute(
        `SELECT material_id, material_name FROM agricultural_material WHERE farm_id = ? AND material_type IN ('化肥','农药') ORDER BY material_id LIMIT 1`,
        [fid]
      )
      const crop = crops[0]
      const mat = mats[0]
      if (crop) {
        await conn.execute(
          `INSERT INTO operation_record
            (user_id, farm_id, operation_type, operation_time, relate_id, operation_detail,
             area_name, crop_id, material_id, op_subtype, method, amount, unit, water_volume, duration_minutes, remark, source_type)
           VALUES (?, ?, '灌溉', DATE_SUB(NOW(), INTERVAL 2 DAY), ?, ?, ?, ?, NULL, NULL, '滴灌', NULL, NULL, 22.5, 42, '系统自动补全演示', '灌溉')`,
          [adminId, fid, crop.crop_id, `区域 ${crop.plant_area} 常规灌溉`, crop.plant_area, crop.crop_id]
        )
        await conn.execute(
          `INSERT INTO operation_record
            (user_id, farm_id, operation_type, operation_time, relate_id, operation_detail,
             area_name, crop_id, material_id, op_subtype, method, amount, unit, water_volume, duration_minutes, remark, source_type)
           VALUES (?, ?, '灌溉', DATE_SUB(NOW(), INTERVAL 5 DAY), ?, ?, ?, ?, NULL, NULL, '喷灌', NULL, NULL, 18.0, 35, '系统自动补全演示', '灌溉')`,
          [adminId, fid, crop.crop_id, `区域 ${crop.plant_area} 补水`, crop.plant_area, crop.crop_id]
        )
      }
      if (crop && mat) {
        await conn.execute(
          `INSERT INTO operation_record
            (user_id, farm_id, operation_type, operation_time, relate_id, operation_detail,
             area_name, crop_id, material_id, op_subtype, method, amount, unit, water_volume, duration_minutes, remark, source_type)
           VALUES (?, ?, '施肥', DATE_SUB(NOW(), INTERVAL 3 DAY), ?, ?, ?, ?, ?, '复合肥', '沟施', 12.5, 'kg', NULL, NULL, '系统自动补全演示', '施肥')`,
          [
            adminId,
            fid,
            mat.material_id,
            `${crop.plant_area} 追肥 ${mat.material_name}`,
            crop.plant_area,
            crop.crop_id,
            mat.material_id
          ]
        )
      }
    }

    console.log('[6/8] monitor_device 每农场至少覆盖一个区域')
    const [farms2] = await conn.execute(`SELECT farm_id FROM farm ORDER BY farm_id`)
    for (const f of farms2) {
      const [areas] = await conn.execute(
        `SELECT DISTINCT plant_area FROM crop WHERE farm_id = ? AND plant_area IS NOT NULL AND TRIM(plant_area) <> '' LIMIT 5`,
        [f.farm_id]
      )
      const areaList = areas.length ? areas.map((a) => a.plant_area) : ['默认种植区']
      for (const area of areaList) {
        const [ex] = await conn.execute(
          `SELECT device_id FROM monitor_device WHERE farm_id = ? AND monitor_area = ? LIMIT 1`,
          [f.farm_id, area]
        )
        if (ex?.length) continue
        await conn.execute(
          `INSERT INTO monitor_device
            (farm_id, device_name, install_location, device_status, monitor_area, device_category, last_online_time)
           VALUES (?, ?, ?, '在线', ?, '传感器', NOW())`,
          [f.farm_id, `${area}监测点`, `${area}中心`, area]
        )
      }
    }

    console.log('[7/8] 环境监测近期数据（避免历史曲线为空）')
    const [farms3] = await conn.execute(`SELECT farm_id FROM farm ORDER BY farm_id`)
    for (const f of farms3) {
      const [areas] = await conn.execute(
        `SELECT DISTINCT plant_area FROM crop WHERE farm_id = ? AND plant_area IS NOT NULL LIMIT 3`,
        [f.farm_id]
      )
      const alist = areas.length ? areas.map((x) => x.plant_area) : ['默认监测区']
      for (const pa of alist) {
        const [cnt] = await conn.execute(
          `SELECT COUNT(*) AS n FROM environment_monitor WHERE farm_id = ? AND COALESCE(plant_area,'') = ?`,
          [f.farm_id, pa]
        )
        if ((cnt?.[0]?.n || 0) >= 5) continue
        for (let i = 0; i < 8; i++) {
          await conn.execute(
            `INSERT INTO environment_monitor
              (farm_id, plant_area, temperature, humidity, soil_ph, soil_moisture, light_lux, monitor_time)
             VALUES (?, ?, ?, ?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL ? HOUR))`,
            [
              f.farm_id,
              pa,
              18 + (i % 5) * 0.7,
              52 + (i % 7),
              6.2 + (i % 3) * 0.1,
              38 + (i % 10) * 0.5,
              5000 + i * 900,
              i * 3 + 1
            ]
          )
        }
      }
    }

    console.log('[8/8] 完成')
    console.log('说明：crop_exception / environment_exception_log 为不同业务链，未做表合并。')
  } catch (e) {
    console.error(e)
    process.exitCode = 1
  } finally {
    conn.release()
    await pool.end()
  }
}

main()
