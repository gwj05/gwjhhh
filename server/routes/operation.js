const express = require('express')
const router = express.Router()
const pool = require('../config/database')
const authenticateToken = require('../middleware/auth')
const materialRouter = require('./material')
const { assertFarmAccess, getScopedFarmId } = require('../lib/dataScope')

let ensured = false
async function ensureOperationSchema() {
  if (ensured) return
  const addCol = async (name, sql) => {
    const [rows] = await pool.execute(
      `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operation_record' AND COLUMN_NAME = ?`,
      [name]
    )
    if (rows?.length) return
    await pool.execute(sql)
  }

  await addCol('area_name', `ALTER TABLE operation_record ADD COLUMN area_name VARCHAR(100) DEFAULT NULL COMMENT '种植区域名称'`)
  await addCol('crop_id', `ALTER TABLE operation_record ADD COLUMN crop_id INT DEFAULT NULL COMMENT '作物ID'`)
  await addCol('material_id', `ALTER TABLE operation_record ADD COLUMN material_id INT DEFAULT NULL COMMENT '农资ID(施肥可选)'`)
  await addCol('op_subtype', `ALTER TABLE operation_record ADD COLUMN op_subtype VARCHAR(50) DEFAULT NULL COMMENT '肥料/灌溉子类型'`)
  await addCol('method', `ALTER TABLE operation_record ADD COLUMN method VARCHAR(30) DEFAULT NULL COMMENT '施肥/灌溉方式'`)
  await addCol('amount', `ALTER TABLE operation_record ADD COLUMN amount DECIMAL(12,2) DEFAULT NULL COMMENT '使用量'`)
  await addCol('unit', `ALTER TABLE operation_record ADD COLUMN unit VARCHAR(20) DEFAULT NULL COMMENT '单位'`)
  await addCol('water_volume', `ALTER TABLE operation_record ADD COLUMN water_volume DECIMAL(12,2) DEFAULT NULL COMMENT '用水量(L)'`)
  await addCol('duration_minutes', `ALTER TABLE operation_record ADD COLUMN duration_minutes INT DEFAULT NULL COMMENT '灌溉时长(分钟)'`)
  await addCol('remark', `ALTER TABLE operation_record ADD COLUMN remark VARCHAR(255) DEFAULT NULL COMMENT '备注'`)
  await addCol('created_at', `ALTER TABLE operation_record ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'`)
  await addCol('updated_at', `ALTER TABLE operation_record ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'`)
  await addCol('source_type', `ALTER TABLE operation_record ADD COLUMN source_type VARCHAR(30) DEFAULT NULL COMMENT '业务来源：施肥/灌溉等'`)

  ensured = true
}

async function resolveUsageColumn() {
  const [rows] = await pool.execute(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agricultural_material_stock_log'
       AND COLUMN_NAME IN ('usage_purpose','usage')`
  )
  const cols = (rows || []).map(r => r.COLUMN_NAME)
  if (cols.includes('usage_purpose')) return 'usage_purpose'
  if (cols.includes('usage')) return 'usage'
  return ''
}

async function insertStockLog(conn, row) {
  const usageCol = await resolveUsageColumn()
  const {
    material_id,
    farm_id,
    change_type,
    delta_qty,
    reason,
    source_type,
    usageVal,
    operator_id,
    created_at
  } = row
  const t = created_at || new Date()
  if (usageCol) {
    await conn.execute(
      `INSERT INTO agricultural_material_stock_log (material_id, farm_id, change_type, delta_qty, reason, source_type, \`${usageCol}\`, operator_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [material_id, farm_id, change_type, delta_qty, reason, source_type || null, usageVal || null, operator_id, t]
    )
  } else {
    await conn.execute(
      `INSERT INTO agricultural_material_stock_log (material_id, farm_id, change_type, delta_qty, reason, source_type, operator_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [material_id, farm_id, change_type, delta_qty, reason, source_type || null, operator_id, t]
    )
  }
}

router.get('/options', authenticateToken, async (req, res) => {
  try {
    await ensureOperationSchema()
    const user = req.user
    let farmWhere = ''
    const farmParams = []
    if (user.role_id !== 1) {
      farmWhere = 'WHERE f.farm_id = ?'
      farmParams.push(user.farm_id)
    }
    const [farms] = await pool.execute(`SELECT f.farm_id, f.farm_name FROM farm f ${farmWhere} ORDER BY f.farm_name`, farmParams)

    const { farm_id, area_name } = req.query
    const effectiveFarmId = user.role_id === 1 ? farm_id : user.farm_id

    let areaWhere = 'WHERE 1=1'
    const areaParams = []
    if (effectiveFarmId) {
      areaWhere += ' AND c.farm_id = ?'
      areaParams.push(effectiveFarmId)
    } else if (user.role_id !== 1) {
      areaWhere += ' AND c.farm_id = ?'
      areaParams.push(user.farm_id)
    }
    const [areas] = await pool.execute(
      `SELECT DISTINCT c.plant_area AS area_name
       FROM crop c ${areaWhere} AND c.plant_area IS NOT NULL AND c.plant_area <> ''
       ORDER BY c.plant_area`,
      areaParams
    )

    let cropWhere = 'WHERE 1=1'
    const cropParams = []
    if (effectiveFarmId) {
      cropWhere += ' AND c.farm_id = ?'
      cropParams.push(effectiveFarmId)
    } else if (user.role_id !== 1) {
      cropWhere += ' AND c.farm_id = ?'
      cropParams.push(user.farm_id)
    }
    if (area_name) {
      cropWhere += ' AND c.plant_area = ?'
      cropParams.push(area_name)
    }
    const [crops] = await pool.execute(
      `SELECT c.crop_id, c.crop_name, c.plant_area FROM crop c ${cropWhere} ORDER BY c.crop_name`,
      cropParams
    )

    let materialWhere = 'WHERE 1=1'
    const materialParams = []
    if (effectiveFarmId) {
      materialWhere += ' AND m.farm_id = ?'
      materialParams.push(effectiveFarmId)
    } else if (user.role_id !== 1) {
      materialWhere += ' AND m.farm_id = ?'
      materialParams.push(user.farm_id)
    }
    const [materials] = await pool.execute(
      `SELECT m.material_id, m.material_name, m.material_type, m.price, m.stock_num
       FROM agricultural_material m
       ${materialWhere}
       ORDER BY m.material_name`,
      materialParams
    )

    res.json({ farms, areas, crops, materials })
  } catch (error) {
    console.error('operation/options error:', error)
    res.status(500).json({ message: '服务器错误', error: error.message })
  }
})

router.get('/suggest', authenticateToken, async (req, res) => {
  try {
    await ensureOperationSchema()
    const user = req.user
    const { operation_type, farm_id, area_name, crop_id } = req.query
    const farmId = getScopedFarmId(user, farm_id)
    if (!farmId) return res.json({ tips: [] })
    assertFarmAccess(user, farmId)

    const tips = []
    if (operation_type === '施肥') {
      const [recent] = await pool.execute(
        `SELECT COUNT(*) AS cnt FROM operation_record
         WHERE farm_id = ? AND operation_type = '施肥'
           AND (? IS NULL OR area_name = ?)
           AND operation_time >= NOW() - INTERVAL 3 DAY`,
        [farmId, area_name || null, area_name || null]
      )
      if ((recent?.[0]?.cnt || 0) > 0) tips.push({ level: 'warn', text: '该区域3天内已有施肥记录，请谨慎操作。' })

      if (crop_id) {
        const [cr] = await pool.execute(`SELECT sow_time, growth_cycle FROM crop WHERE crop_id = ?`, [crop_id])
        if (cr?.length && cr[0].sow_time && cr[0].growth_cycle) {
          const elapsed = Math.floor((Date.now() - new Date(cr[0].sow_time).getTime()) / (1000 * 60 * 60 * 24))
          const ratio = elapsed / Number(cr[0].growth_cycle || 1)
          if (ratio < 0.3) tips.push({ level: 'info', text: '当前偏生长期前段，建议适度增加氮肥。' })
          else if (ratio < 0.7) tips.push({ level: 'info', text: '当前生长中段，建议复合肥均衡施用。' })
          else tips.push({ level: 'info', text: '当前后期，建议控制施肥量，避免过量。' })
        }
      }
    }

    if (operation_type === '灌溉') {
      const [env] = await pool.execute(
        `SELECT humidity FROM environment_monitor WHERE farm_id = ? ORDER BY monitor_time DESC LIMIT 1`,
        [farmId]
      )
      const h = env?.[0]?.humidity
      if (h != null) {
        if (Number(h) < 45) tips.push({ level: 'info', text: `当前空气湿度 ${h}% 偏低，建议灌溉。` })
        else if (Number(h) > 75) tips.push({ level: 'warn', text: `当前空气湿度 ${h}% 偏高，不建议重复灌溉。` })
      }
      const [today] = await pool.execute(
        `SELECT COUNT(*) AS cnt FROM operation_record
         WHERE farm_id = ? AND operation_type = '灌溉'
           AND (? IS NULL OR area_name = ?)
           AND DATE(operation_time) = CURDATE()`,
        [farmId, area_name || null, area_name || null]
      )
      if ((today?.[0]?.cnt || 0) > 0) tips.push({ level: 'warn', text: '该区域今日已灌溉，请避免重复操作。' })
    }

    res.json({ tips })
  } catch (error) {
    console.error('operation/suggest error:', error)
    res.status(500).json({ message: '服务器错误', error: error.message })
  }
})

router.get('/list', authenticateToken, async (req, res) => {
  try {
    await ensureOperationSchema()
    const user = req.user
    const {
      page = 1,
      pageSize = 10,
      farm_id,
      area_name,
      crop_id,
      operation_type,
      from,
      to
    } = req.query
    const offset = (Number(page) - 1) * Number(pageSize)

    let where = 'WHERE 1=1'
    const params = []
    const effectiveFarmId = getScopedFarmId(user, farm_id)
    if (effectiveFarmId) {
      where += ' AND o.farm_id = ?'
      params.push(effectiveFarmId)
    }
    if (area_name) {
      where += ' AND o.area_name = ?'
      params.push(area_name)
    }
    if (crop_id) {
      where += ' AND o.crop_id = ?'
      params.push(crop_id)
    }
    if (operation_type) {
      where += ' AND o.operation_type = ?'
      params.push(operation_type)
    }
    if (from) {
      where += ' AND o.operation_time >= ?'
      params.push(`${from} 00:00:00`)
    }
    if (to) {
      where += ' AND o.operation_time <= ?'
      params.push(`${to} 23:59:59`)
    }

    // 农事操作模块：仅汇总施肥 / 灌溉（与采购入库等单据区分）
    where += ` AND o.operation_type IN ('施肥','灌溉')`

    const [countRows] = await pool.execute(`SELECT COUNT(*) AS total FROM operation_record o ${where}`, params)
    const total = countRows?.[0]?.total || 0

    const [rows] = await pool.execute(
      `
      SELECT
        o.record_id,
        o.operation_type,
        o.farm_id,
        f.farm_name,
        o.area_name,
        o.crop_id,
        c.crop_name,
        o.material_id,
        m.material_name,
        o.op_subtype,
        o.method,
        o.amount,
        o.unit,
        o.water_volume,
        o.duration_minutes,
        o.operation_detail,
        o.operation_time,
        o.remark,
        o.source_type,
        u.real_name AS operator_name,
        o.user_id
      FROM operation_record o
      LEFT JOIN farm f ON o.farm_id = f.farm_id
      LEFT JOIN crop c ON o.crop_id = c.crop_id
      LEFT JOIN agricultural_material m ON o.material_id = m.material_id
      LEFT JOIN user u ON o.user_id = u.user_id
      ${where}
      ORDER BY o.operation_time DESC, o.record_id DESC
      LIMIT ${Number(pageSize)} OFFSET ${Number(offset)}
      `,
      params
    )

    const [statsRows] = await pool.execute(
      `
      SELECT
        COUNT(*) AS total_ops,
        SUM(CASE WHEN o.operation_type='施肥' THEN 1 ELSE 0 END) AS fertilize_count,
        SUM(CASE WHEN o.operation_type='灌溉' THEN 1 ELSE 0 END) AS irrigate_count,
        COALESCE(SUM(CASE WHEN o.operation_type='灌溉' THEN o.water_volume ELSE 0 END), 0) AS total_water,
        COALESCE(AVG(CASE WHEN o.operation_type='灌溉' THEN o.water_volume END), 0) AS avg_water
      FROM operation_record o
      ${where}
      `,
      params
    )

    res.json({ data: rows || [], total, page: Number(page), pageSize: Number(pageSize), stats: statsRows?.[0] || {} })
  } catch (error) {
    console.error('operation/list error:', error)
    res.status(error.status || 500).json({ message: '服务器错误', error: error.message })
  }
})

router.post('/create', authenticateToken, async (req, res) => {
  try {
    await ensureOperationSchema()
    await materialRouter.ensureMaterialTables()
    const user = req.user
    if (![1, 2, 3].includes(user.role_id)) return res.status(403).json({ message: '无权限' })
    const {
      operation_type,
      farm_id,
      area_name,
      crop_id,
      material_id,
      op_subtype,
      method,
      amount,
      unit,
      water_volume,
      duration_minutes,
      operation_time,
      operation_detail,
      remark
    } = req.body || {}
    if (!['施肥', '灌溉'].includes(operation_type)) return res.status(400).json({ message: '操作类型仅支持施肥/灌溉' })
    const targetFarmId = getScopedFarmId(user, farm_id)
    if (!targetFarmId) return res.status(400).json({ message: '请选择农场' })
    assertFarmAccess(user, targetFarmId)
    if (!area_name) return res.status(400).json({ message: '请选择种植区域' })

    const opTime = operation_time ? new Date(operation_time) : new Date()

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()

      const deductFertilizeStock = async () => {
        const mid = material_id != null ? Number(material_id) : NaN
        if (Number.isNaN(mid) || mid <= 0) {
          return res.status(400).json({ message: '请选择农资' })
        }
        const amt = Number(amount)
        if (Number.isNaN(amt) || amt <= 0) {
          return res.status(400).json({ message: '使用量必须大于0' })
        }
        if (!method || !String(method).trim()) {
          return res.status(400).json({ message: '请选择操作方式' })
        }
        const [mr] = await conn.execute(
          `SELECT stock_num, farm_id FROM agricultural_material WHERE material_id = ? FOR UPDATE`,
          [mid]
        )
        if (!mr?.length) throw new Error('农资不存在')
        if (String(mr[0].farm_id) !== String(targetFarmId)) throw new Error('农资不属于该农场')
        if (Number(mr[0].stock_num) < amt) {
          return res.status(400).json({ message: '农资库存不足，无法施肥' })
        }
        await conn.execute(`UPDATE agricultural_material SET stock_num = stock_num - ? WHERE material_id = ?`, [amt, mid])
        await insertStockLog(conn, {
          material_id: mid,
          farm_id: targetFarmId,
          change_type: 'OUT',
          delta_qty: amt,
          reason: '施肥消耗',
          source_type: '施肥',
          usageVal: '施肥',
          operator_id: user.user_id,
          created_at: opTime
        })
        return null
      }

      if (operation_type === '施肥') {
        const errRes = await deductFertilizeStock()
        if (errRes) {
          await conn.rollback()
          return errRes
        }
      } else {
        const vol = Number(water_volume)
        if (Number.isNaN(vol) || vol <= 0) {
          await conn.rollback()
          return res.status(400).json({ message: '用水量必须大于0' })
        }
        if (!method || !String(method).trim()) {
          await conn.rollback()
          return res.status(400).json({ message: '请选择灌溉方式' })
        }
      }

      const midNum = material_id != null && material_id !== '' ? Number(material_id) : null
      const amtNum = amount != null && amount !== '' ? Number(amount) : null
      const detail =
        operation_detail ||
        (operation_type === '施肥'
          ? `${op_subtype ? `${op_subtype} ` : ''}农资出库 ${amtNum ?? ''}${unit || 'kg'}，方式:${method || ''}`
          : `用水 ${water_volume ?? ''}L，方式:${method || ''}${duration_minutes ? `，时长${duration_minutes}分钟` : ''}`)

      const sourceTypeVal = operation_type === '施肥' ? '施肥' : '灌溉'

      await conn.execute(
        `
        INSERT INTO operation_record
          (user_id, farm_id, operation_type, operation_time, relate_id, operation_detail, area_name, crop_id, material_id, op_subtype, method, amount, unit, water_volume, duration_minutes, remark, source_type)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          user.user_id,
          targetFarmId,
          operation_type,
          opTime,
          crop_id || null,
          detail,
          area_name,
          crop_id || null,
          operation_type === '施肥' ? midNum : null,
          op_subtype || null,
          method || null,
          operation_type === '施肥' ? amtNum : null,
          unit || (operation_type === '施肥' ? 'kg' : null),
          operation_type === '灌溉' ? Number(water_volume) : null,
          duration_minutes != null ? Number(duration_minutes) : null,
          remark || null,
          sourceTypeVal
        ]
      )
      await conn.commit()
      res.status(201).json({ message: '操作记录新增成功' })
    } catch (e) {
      await conn.rollback()
      throw e
    } finally {
      conn.release()
    }
  } catch (error) {
    console.error('operation/create error:', error)
    res.status(error.status || 500).json({ message: error.message || '服务器错误', error: error.message })
  }
})

router.put('/update/:id', authenticateToken, async (req, res) => {
  try {
    await ensureOperationSchema()
    const user = req.user
    if (![1, 2].includes(user.role_id)) return res.status(403).json({ message: '无权编辑' })
    const { id } = req.params
    const [rows] = await pool.execute(`SELECT * FROM operation_record WHERE record_id = ?`, [id])
    if (!rows?.length) return res.status(404).json({ message: '记录不存在' })
    const old = rows[0]
    assertFarmAccess(user, old.farm_id)
    if (!['施肥', '灌溉'].includes(old.operation_type)) {
      return res.status(400).json({ message: '仅支持修改施肥/灌溉记录' })
    }

    const body = req.body || {}
    let targetFarmId = old.farm_id
    if (user.role_id === 1 && body.farm_id != null && String(body.farm_id).trim() !== '') {
      targetFarmId = Number(body.farm_id)
      if (Number.isNaN(targetFarmId)) return res.status(400).json({ message: '农场参数无效' })
      assertFarmAccess(user, targetFarmId)
    }

    if (old.operation_type === '灌溉') {
      const methodVal = body.method != null && String(body.method).trim() !== '' ? body.method : old.method
      const wvRaw = body.water_volume != null && body.water_volume !== '' ? body.water_volume : old.water_volume
      const wv = Number(wvRaw)
      if (Number.isNaN(wv) || wv <= 0) return res.status(400).json({ message: '用水量必须大于0' })
      if (!methodVal || !String(methodVal).trim()) return res.status(400).json({ message: '请选择灌溉方式' })
      const areaVal = body.area_name != null && body.area_name !== '' ? body.area_name : old.area_name
      const cropVal =
        body.crop_id != null && body.crop_id !== '' ? Number(body.crop_id) : old.crop_id
      const dur =
        body.duration_minutes != null && body.duration_minutes !== ''
          ? Number(body.duration_minutes)
          : old.duration_minutes
      const opTime = body.operation_time ? new Date(body.operation_time) : new Date(old.operation_time)
      const detail =
        body.operation_detail != null && String(body.operation_detail).trim() !== ''
          ? body.operation_detail
          : `用水 ${wv}L，方式:${methodVal}${dur ? `，时长${dur}分钟` : ''}`
      const rmk = body.remark != null ? body.remark : old.remark

      await pool.execute(
        `
        UPDATE operation_record
        SET farm_id = ?, area_name = ?, crop_id = ?, method = ?, water_volume = ?, duration_minutes = ?,
            operation_time = ?, operation_detail = ?, remark = ?, relate_id = ?
        WHERE record_id = ?
        `,
        [
          targetFarmId,
          areaVal,
          cropVal || null,
          methodVal,
          wv,
          dur != null && !Number.isNaN(dur) ? dur : null,
          opTime,
          detail,
          rmk,
          cropVal || null,
          id
        ]
      )
      return res.json({ message: '更新成功' })
    }

    // ---------- 施肥：库存冲正 + 重新出库 ----------
    const newMid =
      body.material_id != null && String(body.material_id).trim() !== ''
        ? Number(body.material_id)
        : Number(old.material_id)
    const newAmt =
      body.amount != null && body.amount !== '' ? Number(body.amount) : Number(old.amount)
    if (Number.isNaN(newMid) || newMid <= 0) return res.status(400).json({ message: '请选择农资' })
    if (Number.isNaN(newAmt) || newAmt <= 0) return res.status(400).json({ message: '使用量必须大于0' })
    const methodVal = body.method != null && String(body.method).trim() !== '' ? body.method : old.method
    if (!methodVal || !String(methodVal).trim()) return res.status(400).json({ message: '请选择操作方式' })
    const unitVal = body.unit != null && body.unit !== '' ? body.unit : old.unit || 'kg'
    const opSubtypeVal =
      body.op_subtype != null ? body.op_subtype : old.op_subtype
    const areaVal = body.area_name != null && body.area_name !== '' ? body.area_name : old.area_name
    const cropVal =
      body.crop_id != null && body.crop_id !== '' ? Number(body.crop_id) : old.crop_id
    const opTime = body.operation_time ? new Date(body.operation_time) : new Date(old.operation_time)
    const detail =
      body.operation_detail != null && String(body.operation_detail).trim() !== ''
        ? body.operation_detail
        : `${opSubtypeVal ? `${opSubtypeVal} ` : ''}农资出库 ${newAmt}${unitVal}，方式:${methodVal}`
    const rmk = body.remark != null ? body.remark : old.remark

    const oldMid = old.material_id != null ? Number(old.material_id) : null
    const oldAmt = Number(old.amount || 0)

    await materialRouter.ensureMaterialTables()

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()

      if (oldMid && !Number.isNaN(oldMid) && oldAmt > 0) {
        const [om] = await conn.execute(
          `SELECT farm_id FROM agricultural_material WHERE material_id = ? FOR UPDATE`,
          [oldMid]
        )
        if (om?.length && String(om[0].farm_id) === String(old.farm_id)) {
          await conn.execute(
            `UPDATE agricultural_material SET stock_num = stock_num + ? WHERE material_id = ?`,
            [oldAmt, oldMid]
          )
          await insertStockLog(conn, {
            material_id: oldMid,
            farm_id: old.farm_id,
            change_type: 'IN',
            delta_qty: oldAmt,
            reason: '施肥记录编辑-退回库存',
            source_type: '调整库存',
            usageVal: null,
            operator_id: user.user_id,
            created_at: new Date()
          })
        }
      }

      const [nm] = await conn.execute(
        `SELECT stock_num, farm_id FROM agricultural_material WHERE material_id = ? FOR UPDATE`,
        [newMid]
      )
      if (!nm?.length) throw new Error('农资不存在')
      if (String(nm[0].farm_id) !== String(targetFarmId)) {
        await conn.rollback()
        return res.status(400).json({ message: '农资与目标农场不一致' })
      }
      if (Number(nm[0].stock_num) < newAmt) {
        await conn.rollback()
        return res.status(400).json({ message: '农资库存不足，无法保存修改' })
      }
      await conn.execute(`UPDATE agricultural_material SET stock_num = stock_num - ? WHERE material_id = ?`, [
        newAmt,
        newMid
      ])
      await insertStockLog(conn, {
        material_id: newMid,
        farm_id: targetFarmId,
        change_type: 'OUT',
        delta_qty: newAmt,
        reason: '施肥消耗（记录修正）',
        source_type: '施肥',
        usageVal: '施肥',
        operator_id: user.user_id,
        created_at: new Date()
      })

      await conn.execute(
        `
        UPDATE operation_record
        SET farm_id = ?, area_name = ?, crop_id = ?, material_id = ?, op_subtype = ?, method = ?, amount = ?, unit = ?,
            operation_time = ?, operation_detail = ?, remark = ?, relate_id = ?, source_type = '施肥'
        WHERE record_id = ?
        `,
        [
          targetFarmId,
          areaVal,
          cropVal || null,
          newMid,
          opSubtypeVal || null,
          methodVal,
          newAmt,
          unitVal,
          opTime,
          detail,
          rmk,
          cropVal || null,
          id
        ]
      )
      await conn.commit()
      res.json({ message: '更新成功' })
    } catch (e) {
      await conn.rollback()
      throw e
    } finally {
      conn.release()
    }
  } catch (error) {
    console.error('operation/update error:', error)
    res.status(error.status || 500).json({ message: '服务器错误', error: error.message })
  }
})

router.delete('/delete/:id', authenticateToken, async (req, res) => {
  try {
    await ensureOperationSchema()
    const user = req.user
    if (user.role_id !== 1) return res.status(403).json({ message: '仅管理员可删除' })
    const { id } = req.params
    await pool.execute(`DELETE FROM operation_record WHERE record_id = ?`, [id])
    res.json({ message: '删除成功' })
  } catch (error) {
    console.error('operation/delete error:', error)
    res.status(500).json({ message: '服务器错误', error: error.message })
  }
})

module.exports = router

