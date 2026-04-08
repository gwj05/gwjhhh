const express = require('express')
const router = express.Router()
const pool = require('../config/database')
const authenticateToken = require('../middleware/auth')

let ensured = false
let usageColumnCache = null
async function ensureMaterialTables() {
  if (ensured) return
  try {

    // 目标：为 agricultural_material 补齐品牌/规格/安全库存/上下架/时间字段等
    // 以及创建库存变动日志表
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS agricultural_material_stock_log (
        stock_log_id INT AUTO_INCREMENT PRIMARY KEY,
        material_id INT NOT NULL,
        farm_id INT NOT NULL,
        change_type VARCHAR(10) NOT NULL COMMENT 'IN/OUT',
        delta_qty INT NOT NULL,
        reason VARCHAR(200) DEFAULT NULL COMMENT '变动原因/备注',
        usage_purpose VARCHAR(200) DEFAULT NULL COMMENT '使用用途（仅出库可选）',
        operator_id INT DEFAULT NULL COMMENT '操作人',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (material_id) REFERENCES agricultural_material(material_id) ON DELETE CASCADE ON UPDATE CASCADE,
        FOREIGN KEY (farm_id) REFERENCES farm(farm_id) ON DELETE CASCADE ON UPDATE CASCADE,
        FOREIGN KEY (operator_id) REFERENCES user(user_id) ON DELETE SET NULL ON UPDATE CASCADE,
        INDEX idx_stocklog_material_time (material_id, created_at),
        INDEX idx_stocklog_farm_time (farm_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)

    const addColumnIfMissing = async (columnName, alterSql) => {
      const [rows] = await pool.execute(
        `SELECT 1
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'agricultural_material'
           AND COLUMN_NAME = ?`,
        [columnName]
      )
      if (rows && rows.length > 0) return

      // alterSql 必须是完整 ALTER TABLE ... ADD COLUMN ... 片段
      await pool.execute(alterSql)
    }

    const addLogColumnIfMissing = async (columnName, alterSql) => {
      const [rows] = await pool.execute(
        `SELECT 1
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'agricultural_material_stock_log'
           AND COLUMN_NAME = ?`,
        [columnName]
      )
      if (rows && rows.length > 0) return
      await pool.execute(alterSql)
    }

    await addColumnIfMissing(
      'brand',
      `ALTER TABLE agricultural_material ADD COLUMN brand VARCHAR(60) DEFAULT NULL COMMENT '品牌'`
    )
    await addColumnIfMissing(
      'spec',
      `ALTER TABLE agricultural_material ADD COLUMN spec VARCHAR(60) DEFAULT NULL COMMENT '规格'`
    )
    await addColumnIfMissing(
      'safety_stock_num',
      `ALTER TABLE agricultural_material ADD COLUMN safety_stock_num INT NOT NULL DEFAULT 0 COMMENT '安全库存（预警值）'`
    )
    await addColumnIfMissing(
      'shelf_status',
      `ALTER TABLE agricultural_material ADD COLUMN shelf_status VARCHAR(10) NOT NULL DEFAULT 'ON' COMMENT '上下架状态：ON/OFF'`
    )
    await addColumnIfMissing(
      'created_at',
      `ALTER TABLE agricultural_material ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'`
    )
    await addColumnIfMissing(
      'updated_at',
      `ALTER TABLE agricultural_material ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'`
    )

    // 兼容旧数据：若安全库存为0或为空，按类型设置默认安全库存
    await pool.execute(`
      UPDATE agricultural_material
      SET safety_stock_num = CASE
        WHEN material_type = '种子' THEN 15
        WHEN material_type = '农药' THEN 8
        WHEN material_type IN ('化肥', '肥料') THEN 30
        WHEN material_type = '工具' THEN 5
        ELSE 10
      END
      WHERE COALESCE(safety_stock_num, 0) = 0
    `)

    await addLogColumnIfMissing(
      'usage_purpose',
      `ALTER TABLE agricultural_material_stock_log ADD COLUMN usage_purpose VARCHAR(200) DEFAULT NULL COMMENT '使用用途（仅出库可选）'`
    )
    await addLogColumnIfMissing(
      'source_type',
      `ALTER TABLE agricultural_material_stock_log ADD COLUMN source_type VARCHAR(30) DEFAULT NULL COMMENT '入库来源：采购/手动入库/调整库存/其他'`
    )

    const [opSourceRows] = await pool.execute(
      `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operation_record' AND COLUMN_NAME = 'source_type'`
    )
    if (!opSourceRows?.length) {
      await pool.execute(`ALTER TABLE operation_record ADD COLUMN source_type VARCHAR(30) DEFAULT NULL COMMENT '来源类型：采购/手动入库/调整库存/其他'`)
    }

    // 采购记录表
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS material_purchase_record (
        purchase_id INT AUTO_INCREMENT PRIMARY KEY,
        purchase_no VARCHAR(40) NOT NULL UNIQUE COMMENT '采购单号',
        material_id INT NOT NULL COMMENT '农资ID',
        material_name VARCHAR(80) NOT NULL COMMENT '农资名称快照',
        farm_id INT NOT NULL COMMENT '农场ID',
        farm_name VARCHAR(80) NOT NULL COMMENT '农场名称快照',
        purchase_qty INT NOT NULL COMMENT '采购数量',
        unit_price DECIMAL(10,2) NOT NULL COMMENT '采购单价',
        total_amount DECIMAL(12,2) NOT NULL COMMENT '总金额',
        supplier VARCHAR(100) DEFAULT NULL COMMENT '供应商',
        purchase_status VARCHAR(20) NOT NULL DEFAULT '待入库' COMMENT '待入库/已入库/已取消',
        purchase_time DATETIME NOT NULL COMMENT '采购时间',
        operator_id INT DEFAULT NULL COMMENT '操作人',
        remark VARCHAR(255) DEFAULT NULL COMMENT '备注',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
        FOREIGN KEY (material_id) REFERENCES agricultural_material(material_id) ON DELETE RESTRICT ON UPDATE CASCADE,
        FOREIGN KEY (farm_id) REFERENCES farm(farm_id) ON DELETE CASCADE ON UPDATE CASCADE,
        FOREIGN KEY (operator_id) REFERENCES user(user_id) ON DELETE SET NULL ON UPDATE CASCADE,
        INDEX idx_purchase_farm_time (farm_id, purchase_time),
        INDEX idx_purchase_status (purchase_status),
        INDEX idx_purchase_material (material_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)

    ensured = true
  } catch (error) {
    ensured = false
    throw error
  }
}

function canManagePurchase(req) {
  return [1, 2].includes(req.user.role_id)
}
function canDeletePurchase(req) {
  return req.user.role_id === 1
}
function canInboundPurchase(req) {
  return [1, 2].includes(req.user.role_id)
}
function makePurchaseNo() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const s = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  return `PO${s}${Math.floor(Math.random() * 900 + 100)}`
}

async function getStockLogUsageColumn() {
  if (usageColumnCache !== null) return usageColumnCache
  const [rows] = await pool.execute(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'agricultural_material_stock_log'
       AND COLUMN_NAME IN ('usage_purpose', 'usage')`
  )
  const cols = (rows || []).map(r => r.COLUMN_NAME)
  usageColumnCache = cols.includes('usage_purpose')
    ? 'usage_purpose'
    : (cols.includes('usage') ? 'usage' : '')
  return usageColumnCache
}

function computedStockCase() {
  // 计算展示用状态（前端用于 Tag 颜色）
  return `
    CASE
      WHEN COALESCE(m.shelf_status,'ON') = 'OFF' THEN '下架'
      WHEN COALESCE(m.stock_num,0) = 0 THEN '缺货'
      WHEN COALESCE(m.stock_num,0) <= COALESCE(m.safety_stock_num,0) THEN '库存不足'
      ELSE '正常'
    END
  `
}

function assertRole(req, allowedRoles) {
  if (!allowedRoles.includes(req.user.role_id)) {
    const err = new Error('无权限')
    err.status = 403
    throw err
  }
}

function assertFarmAccess(user, farmId) {
  if (user.role_id === 1) return
  if (!user.farm_id || String(user.farm_id) !== String(farmId)) {
    const err = new Error('无权访问该数据')
    err.status = 403
    throw err
  }
}

/** 在已开启事务的 connection 上执行采购入库（更新库存、单据状态、流水、操作记录） */
async function runPurchaseInbound(conn, rec, user) {
  if (rec.purchase_status !== '待入库') {
    const err = new Error('该记录不可重复入库')
    err.status = 400
    throw err
  }
  const [matRows] = await conn.execute(
    `SELECT stock_num FROM agricultural_material WHERE material_id = ? AND farm_id = ? FOR UPDATE`,
    [rec.material_id, rec.farm_id]
  )
  if (!matRows?.length) throw new Error('关联农资不存在')
  const before = Number(matRows[0].stock_num || 0)
  const qty = Number(rec.purchase_qty || 0)
  const after = before + qty

  await conn.execute(
    `UPDATE agricultural_material SET stock_num = stock_num + ? WHERE material_id = ? AND farm_id = ?`,
    [qty, rec.material_id, rec.farm_id]
  )
  await conn.execute(`UPDATE material_purchase_record SET purchase_status = '已入库' WHERE purchase_id = ?`, [
    rec.purchase_id
  ])

  const usageCol = await getStockLogUsageColumn()
  if (usageCol) {
    await conn.execute(
      `
        INSERT INTO agricultural_material_stock_log
          (material_id, farm_id, change_type, delta_qty, reason, source_type, \`${usageCol}\`, operator_id, created_at)
        VALUES
          (?, ?, 'IN', ?, ?, '采购', ?, ?, NOW())
      `,
      [rec.material_id, rec.farm_id, qty, `采购入库 ${rec.purchase_no}`, '采购入库', user.user_id]
    )
  } else {
    await conn.execute(
      `
        INSERT INTO agricultural_material_stock_log
          (material_id, farm_id, change_type, delta_qty, reason, source_type, operator_id, created_at)
        VALUES
          (?, ?, 'IN', ?, ?, '采购', ?, NOW())
      `,
      [rec.material_id, rec.farm_id, qty, `采购入库 ${rec.purchase_no}`, user.user_id]
    )
  }

  await conn.execute(
    `
      INSERT INTO operation_record (user_id, farm_id, operation_type, operation_time, relate_id, operation_detail, source_type)
      VALUES (?, ?, '采购入库', NOW(), ?, ?, '采购')
    `,
    [user.user_id, rec.farm_id, rec.material_id, `采购单${rec.purchase_no}入库，数量${qty}`]
  )

  return {
    purchase_no: rec.purchase_no,
    inbound_qty: qty,
    before_stock: before,
    after_stock: after
  }
}

// -------------- 列表 --------------
router.get('/list', authenticateToken, async (req, res) => {
  try {
    await ensureMaterialTables()

    const {
      page = 1,
      pageSize = 10,
      keyword = '',
      type = '',
      stockState = '', // normal/low/out/off
      farm_id: farmFilterId = '' // admin only
    } = req.query

    const roleId = req.user.role_id
    const farmId = req.user.farm_id

    const offset = (Number(page) - 1) * Number(pageSize)

    const params = []
    let whereSql = 'WHERE 1=1'

    if (roleId !== 1) {
      whereSql += ' AND m.farm_id = ?'
      params.push(farmId)
    } else if (farmFilterId) {
      whereSql += ' AND m.farm_id = ?'
      params.push(farmFilterId)
    }

    if (keyword) {
      whereSql += ' AND m.material_name LIKE ?'
      params.push(`%${keyword}%`)
    }

    if (type) {
      whereSql += ' AND m.material_type = ?'
      params.push(type)
    }

    if (stockState) {
      const caseExpr = computedStockCase()
      if (stockState === 'normal') whereSql += ` AND (${caseExpr}) = '正常'`
      if (stockState === 'low') whereSql += ` AND (${caseExpr}) = '库存不足'`
      if (stockState === 'out') whereSql += ` AND (${caseExpr}) = '缺货'`
      if (stockState === 'off') whereSql += ` AND (${caseExpr}) = '下架'`
    }

    const [countRows] = await pool.execute(
      `SELECT COUNT(*) as total
       FROM agricultural_material m
       ${whereSql}`,
      params
    )
    const total = countRows?.[0]?.total || 0
    if (total === 0) {
      return res.json({ data: [], total: 0, page: Number(page), pageSize: Number(pageSize) })
    }

    const [rows] = await pool.execute(
      `
        SELECT
          m.material_id,
          m.farm_id,
          f.farm_name,
          m.material_name,
          m.material_type,
          m.brand,
          m.spec,
          m.price,
          m.stock_num,
          m.safety_stock_num,
          m.shelf_status,
          COALESCE(m.created_at, m.material_id) AS created_at,
          ${computedStockCase()} AS stock_state
        FROM agricultural_material m
        INNER JOIN farm f ON m.farm_id = f.farm_id
        ${whereSql}
        ORDER BY m.created_at DESC, m.material_id DESC
        LIMIT ${Number(pageSize)} OFFSET ${Number(offset)}
      `,
      params
    )

    res.json({ data: rows || [], total, page: Number(page), pageSize: Number(pageSize) })
  } catch (error) {
    console.error('material/list error:', error)
    res.status(error.status || 500).json({ message: '服务器错误', error: error.message })
  }
})

// -------------- 详情 --------------
router.get('/detail/:id', authenticateToken, async (req, res) => {
  try {
    await ensureMaterialTables()

    const { id } = req.params
    const user = req.user

    const [rows] = await pool.execute(
      `
        SELECT
          m.*,
          f.farm_name,
          ${computedStockCase()} AS stock_state
        FROM agricultural_material m
        INNER JOIN farm f ON m.farm_id = f.farm_id
        WHERE m.material_id = ?
      `,
      [id]
    )

    if (!rows?.length) return res.status(404).json({ message: '农资不存在' })
    const material = rows[0]
    assertFarmAccess(user, material.farm_id)

    const usageCol = await getStockLogUsageColumn()
    const usageSelectSql = usageCol
      ? `l.\`${usageCol}\` AS \`usage\`,`
      : `NULL AS \`usage\`,`
    const [logs] = await pool.execute(
      `
        SELECT
          l.stock_log_id,
          l.change_type,
          l.delta_qty,
          l.reason,
          l.source_type,
          ${usageSelectSql}
          u.real_name AS operator_name,
          l.created_at
        FROM agricultural_material_stock_log l
        LEFT JOIN user u ON l.operator_id = u.user_id
        WHERE l.material_id = ?
        ORDER BY l.created_at DESC
        LIMIT 10
      `,
      [id]
    )

    res.json({ material, logs: logs || [] })
  } catch (error) {
    console.error('material/detail error:', error)
    res.status(error.status || 500).json({ message: '服务器错误', error: error.message })
  }
})

// -------------- 库存流水（统一查询入库/出库）--------------
router.get('/stock-flow/list', authenticateToken, async (req, res) => {
  try {
    await ensureMaterialTables()
    assertRole(req, [1, 2, 3])

    const {
      page = 1,
      pageSize = 20,
      change_type = '',
      farm_id: farmFilter = '',
      material_name = '',
      from = '',
      to = ''
    } = req.query

    const user = req.user
    const offset = (Number(page) - 1) * Number(pageSize)
    const limit = Math.min(100, Math.max(1, Number(pageSize) || 20))
    const params = []
    let whereSql = 'WHERE 1=1'

    if (user.role_id !== 1) {
      whereSql += ' AND l.farm_id = ?'
      params.push(user.farm_id)
    } else if (farmFilter) {
      whereSql += ' AND l.farm_id = ?'
      params.push(farmFilter)
    }

    if (change_type === 'IN' || change_type === 'OUT') {
      whereSql += ' AND l.change_type = ?'
      params.push(change_type)
    }

    if (material_name) {
      whereSql += ' AND m.material_name LIKE ?'
      params.push(`%${material_name}%`)
    }

    if (from) {
      whereSql += ' AND l.created_at >= ?'
      params.push(`${from} 00:00:00`)
    }
    if (to) {
      whereSql += ' AND l.created_at <= ?'
      params.push(`${to} 23:59:59`)
    }

    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS total
       FROM agricultural_material_stock_log l
       INNER JOIN agricultural_material m ON m.material_id = l.material_id
       ${whereSql}`,
      params
    )
    const total = countRows?.[0]?.total ?? 0

    const usageCol = await getStockLogUsageColumn()
    const usageSelectSql = usageCol ? `l.\`${usageCol}\` AS usage_purpose` : 'NULL AS usage_purpose'

    const [rows] = await pool.execute(
      `SELECT
         l.stock_log_id,
         l.change_type,
         l.delta_qty,
         l.reason,
         l.source_type,
         ${usageSelectSql},
         l.created_at,
         l.farm_id,
         f.farm_name,
         m.material_id,
         m.material_name,
         COALESCE(NULLIF(TRIM(u.real_name), ''), u.username) AS operator_name
       FROM agricultural_material_stock_log l
       INNER JOIN agricultural_material m ON m.material_id = l.material_id
       INNER JOIN farm f ON f.farm_id = l.farm_id
       LEFT JOIN user u ON u.user_id = l.operator_id
       ${whereSql}
       ORDER BY l.created_at DESC, l.stock_log_id DESC
       LIMIT ${limit} OFFSET ${Number(offset)}`,
      params
    )

    const flowSourceLabel = (r) => {
      if (r.change_type === 'IN') {
        if (r.source_type) return r.source_type
        if (r.reason && String(r.reason).includes('采购')) return '采购'
        return '其他'
      }
      if (r.source_type) return r.source_type
      if (r.reason && String(r.reason).includes('施肥')) return '施肥'
      if (r.usage_purpose && String(r.usage_purpose).includes('灌溉')) return '灌溉'
      if (r.reason && String(r.reason).includes('灌溉')) return '灌溉'
      return '出库'
    }

    const data = (rows || []).map((r) => ({
      ...r,
      signed_qty: r.change_type === 'IN' ? Number(r.delta_qty) : -Number(r.delta_qty),
      flow_source_label: flowSourceLabel(r)
    }))

    res.json({ data, total, page: Number(page), pageSize: limit })
  } catch (error) {
    console.error('material/stock-flow/list error:', error)
    res.status(error.status || 500).json({ message: '服务器错误', error: error.message })
  }
})

// -------------- 新增 --------------
router.post('/create', authenticateToken, async (req, res) => {
  try {
    await ensureMaterialTables()

    assertRole(req, [1, 2]) // admin + farm admin

    const user = req.user
    const {
      farm_id,
      material_name,
      material_type,
      brand,
      spec,
      price,
      stock_num,
      safety_stock_num,
      shelf_status
    } = req.body || {}

    if (!material_name) return res.status(400).json({ message: '农资名称为必填' })
    if (!material_type) return res.status(400).json({ message: '农资类型为必填' })

    const targetFarmId = user.role_id === 1 ? farm_id : user.farm_id
    if (!targetFarmId) return res.status(400).json({ message: '所属农场为必填' })

    const p = Number(price)
    const s = Number(stock_num)
    const sf = Number(safety_stock_num)

    if (Number.isNaN(p) || p < 0) return res.status(400).json({ message: '单价必须为非负数' })
    if (Number.isNaN(s) || s < 0) return res.status(400).json({ message: '库存数量必须为非负数' })
    if (Number.isNaN(sf) || sf < 0) return res.status(400).json({ message: '安全库存必须为非负数' })

    const [ins] = await pool.execute(
      `
        INSERT INTO agricultural_material
          (farm_id, material_name, material_type, brand, spec, price, stock_num, safety_stock_num, shelf_status)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        targetFarmId,
        material_name,
        material_type,
        brand || null,
        spec || null,
        p,
        s,
        sf,
        shelf_status === 'OFF' ? 'OFF' : 'ON'
      ]
    )

    res.status(201).json({ message: '农资新增成功', material_id: ins.insertId })
  } catch (error) {
    console.error('material/create error:', error)
    res.status(error.status || 500).json({ message: '服务器错误', error: error.message })
  }
})

// -------------- 编辑 --------------
router.put('/update/:id', authenticateToken, async (req, res) => {
  try {
    await ensureMaterialTables()
    assertRole(req, [1, 2]) // admin + farm admin

    const { id } = req.params
    const user = req.user
    const {
      farm_id,
      material_name,
      material_type,
      brand,
      spec,
      price,
      stock_num,
      safety_stock_num,
      shelf_status
    } = req.body || {}

    if (!material_name) return res.status(400).json({ message: '农资名称为必填' })
    if (!material_type) return res.status(400).json({ message: '农资类型为必填' })

    const p = Number(price)
    const sn = Number(stock_num)
    const sf = Number(safety_stock_num)
    if (Number.isNaN(p) || p < 0) return res.status(400).json({ message: '单价必须为非负数' })
    if (Number.isNaN(sn) || sn < 0) return res.status(400).json({ message: '库存数量必须为非负数' })
    if (Number.isNaN(sf) || sf < 0) return res.status(400).json({ message: '安全库存必须为非负数' })

    const [existingRows] = await pool.execute(
      `SELECT farm_id FROM agricultural_material WHERE material_id = ?`,
      [id]
    )
    if (!existingRows?.length) return res.status(404).json({ message: '农资不存在' })

    const existingFarmId = existingRows[0].farm_id
    assertFarmAccess(user, existingFarmId)

    const targetFarmId = user.role_id === 1 ? (farm_id || existingFarmId) : existingFarmId

    await pool.execute(
      `
        UPDATE agricultural_material
        SET
          farm_id = ?,
          material_name = ?,
          material_type = ?,
          brand = ?,
          spec = ?,
          price = ?,
          stock_num = ?,
          safety_stock_num = ?,
          shelf_status = ?
        WHERE material_id = ?
      `,
      [
        targetFarmId,
        material_name,
        material_type,
        brand || null,
        spec || null,
        p,
        sn,
        sf,
        shelf_status === 'OFF' ? 'OFF' : 'ON',
        id
      ]
    )

    res.json({ message: '农资编辑成功' })
  } catch (error) {
    console.error('material/update error:', error)
    res.status(error.status || 500).json({ message: '服务器错误', error: error.message })
  }
})

// -------------- 删除 --------------
router.delete('/delete/:id', authenticateToken, async (req, res) => {
  try {
    await ensureMaterialTables()
    assertRole(req, [1]) // admin only

    const { id } = req.params
    await pool.execute(`DELETE FROM agricultural_material WHERE material_id = ?`, [id])
    res.json({ message: '删除成功' })
  } catch (error) {
    console.error('material/delete error:', error)
    res.status(error.status || 500).json({ message: '服务器错误', error: error.message })
  }
})

// -------------- 上下架 --------------
router.post('/shelf/:id', authenticateToken, async (req, res) => {
  try {
    await ensureMaterialTables()
    assertRole(req, [1]) // admin only

    const { id } = req.params
    const { shelf_status } = req.body || {}
    if (!['ON', 'OFF'].includes(shelf_status)) {
      return res.status(400).json({ message: '上下架状态参数不正确' })
    }

    await pool.execute(
      `UPDATE agricultural_material SET shelf_status = ? WHERE material_id = ?`,
      [shelf_status, id]
    )
    res.json({ message: '上下架更新成功' })
  } catch (error) {
    console.error('material/shelf error:', error)
    res.status(error.status || 500).json({ message: '服务器错误', error: error.message })
  }
})

// -------------- 库存变动（入库/出库）--------------
router.post('/stock/:id', authenticateToken, async (req, res) => {
  try {
    await ensureMaterialTables()
    assertRole(req, [1, 2, 3]) // admin / farm admin / normal user

    const { id } = req.params
    const { change_type, delta_qty, reason, operation_time, usage, source_type, out_source } = req.body || {}

    if (!['IN', 'OUT'].includes(change_type)) {
      return res.status(400).json({ message: 'change_type 必须为 IN/OUT' })
    }
    const delta = Number(delta_qty)
    if (Number.isNaN(delta) || delta <= 0) {
      return res.status(400).json({ message: 'delta_qty 必须为正数' })
    }
    const allowOutSources = ['手动出库', '施肥', '灌溉', '使用']
    let outSourceVal = null
    if (change_type === 'IN') {
      const allowSources = ['手动入库', '调整库存', '其他', '采购']
      if (!source_type || !allowSources.includes(source_type)) {
        return res.status(400).json({ message: '入库来源必填且必须合法' })
      }
    } else {
      outSourceVal = out_source || '手动出库'
      if (!allowOutSources.includes(outSourceVal)) {
        return res.status(400).json({ message: '出库来源不合法' })
      }
    }

    const opTime = operation_time ? new Date(operation_time) : new Date()
    if (Number.isNaN(opTime.getTime())) {
      return res.status(400).json({ message: 'operation_time 格式不正确' })
    }

    const [rows] = await pool.execute(
      `SELECT material_id, farm_id, stock_num FROM agricultural_material WHERE material_id = ?`,
      [id]
    )
    if (!rows?.length) return res.status(404).json({ message: '农资不存在' })
    const material = rows[0]

    assertFarmAccess(req.user, material.farm_id)

    const signedDelta = change_type === 'IN' ? delta : -delta
    const newStock = Number(material.stock_num) + signedDelta
    if (newStock < 0) {
      return res.status(400).json({ message: '库存不足，无法出库' })
    }

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      await conn.execute(
        `UPDATE agricultural_material SET stock_num = stock_num + ? WHERE material_id = ?`,
        [signedDelta, id]
      )
      const usageCol = await getStockLogUsageColumn()
      if (usageCol) {
        await conn.execute(
          `
            INSERT INTO agricultural_material_stock_log
              (material_id, farm_id, change_type, delta_qty, reason, source_type, \`${usageCol}\`, operator_id, created_at)
            VALUES
              (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            id,
            material.farm_id,
            change_type,
            delta,
            reason || null,
            change_type === 'IN' ? source_type : outSourceVal,
            usage || null,
            req.user.user_id,
            opTime
          ]
        )
      } else {
        await conn.execute(
          `
            INSERT INTO agricultural_material_stock_log
              (material_id, farm_id, change_type, delta_qty, reason, source_type, operator_id, created_at)
            VALUES
              (?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            id,
            material.farm_id,
            change_type,
            delta,
            reason || null,
            change_type === 'IN' ? source_type : outSourceVal,
            req.user.user_id,
            opTime
          ]
        )
      }
      await conn.execute(
        `
          INSERT INTO operation_record (user_id, farm_id, operation_type, operation_time, relate_id, operation_detail, source_type)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          req.user.user_id,
          material.farm_id,
          change_type === 'IN' ? '入库' : '出库',
          opTime,
          id,
          `${change_type === 'IN' ? '入库' : '出库'}数量${delta}${reason ? `，备注:${reason}` : ''}`,
          change_type === 'IN' ? source_type : outSourceVal
        ]
      )
      await conn.commit()
    } catch (e) {
      await conn.rollback()
      throw e
    } finally {
      conn.release()
    }

    res.json({ message: '库存变动成功', new_stock: newStock })
  } catch (error) {
    console.error('material/stock error:', error)
    res.status(error.status || 500).json({ message: '服务器错误', error: error.message })
  }
})

// -------------- 库存预警列表（仅库存不足/缺货）--------------
router.get('/warnings', authenticateToken, async (req, res) => {
  try {
    await ensureMaterialTables()

    const {
      page = 1,
      pageSize = 10,
      type = '',
      status = '', // low/out
      farm_id: farmFilterId = ''
    } = req.query

    const roleId = req.user.role_id
    const userFarmId = req.user.farm_id
    const offset = (Number(page) - 1) * Number(pageSize)

    const params = []
    let whereSql = 'WHERE 1=1'

    if (roleId !== 1) {
      whereSql += ' AND m.farm_id = ?'
      params.push(userFarmId)
    } else if (farmFilterId) {
      whereSql += ' AND m.farm_id = ?'
      params.push(farmFilterId)
    }

    if (type) {
      whereSql += ' AND m.material_type = ?'
      params.push(type)
    }

    const stateExpr = computedStockCase()
    whereSql += ` AND (${stateExpr}) IN ('库存不足', '缺货')`
    if (status === 'low') whereSql += ` AND (${stateExpr}) = '库存不足'`
    if (status === 'out') whereSql += ` AND (${stateExpr}) = '缺货'`

    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS total
       FROM agricultural_material m
       ${whereSql}`,
      params
    )
    const total = countRows?.[0]?.total || 0

    const [listRows] = await pool.execute(
      `
        SELECT
          m.material_id,
          m.farm_id,
          f.farm_name,
          m.material_name,
          m.material_type,
          m.stock_num,
          m.safety_stock_num,
          ${stateExpr} AS stock_state
        FROM agricultural_material m
        INNER JOIN farm f ON m.farm_id = f.farm_id
        ${whereSql}
        ORDER BY (CASE WHEN (${stateExpr}) = '缺货' THEN 0 ELSE 1 END), m.stock_num ASC, m.material_id DESC
        LIMIT ${Number(pageSize)} OFFSET ${Number(offset)}
      `,
      params
    )

    // 统计卡片：总农资、预警数、缺货数
    const statsParams = []
    let statsWhere = 'WHERE 1=1'
    if (roleId !== 1) {
      statsWhere += ' AND m.farm_id = ?'
      statsParams.push(userFarmId)
    } else if (farmFilterId) {
      statsWhere += ' AND m.farm_id = ?'
      statsParams.push(farmFilterId)
    }

    const [statsRows] = await pool.execute(
      `
        SELECT
          COUNT(*) AS total_materials,
          SUM(CASE WHEN (${stateExpr}) = '库存不足' THEN 1 ELSE 0 END) AS low_count,
          SUM(CASE WHEN (${stateExpr}) = '缺货' THEN 1 ELSE 0 END) AS out_count
        FROM agricultural_material m
        ${statsWhere}
      `,
      statsParams
    )
    const stats = statsRows?.[0] || { total_materials: 0, low_count: 0, out_count: 0 }

    res.json({
      data: listRows || [],
      total,
      page: Number(page),
      pageSize: Number(pageSize),
      stats: {
        total_materials: Number(stats.total_materials || 0),
        low_count: Number(stats.low_count || 0),
        out_count: Number(stats.out_count || 0),
        warning_total: Number(stats.low_count || 0) + Number(stats.out_count || 0)
      }
    })
  } catch (error) {
    console.error('material/warnings error:', error)
    res.status(error.status || 500).json({ message: '服务器错误', error: error.message })
  }
})

// -------------- 采购记录：统计 --------------
router.get('/purchase/stats', authenticateToken, async (req, res) => {
  try {
    await ensureMaterialTables()
    const { farm_id: farmFilterId = '', from = '', to = '' } = req.query
    const roleId = req.user.role_id
    const userFarmId = req.user.farm_id
    const params = []
    let whereSql = 'WHERE 1=1'
    if (roleId !== 1) {
      whereSql += ' AND p.farm_id = ?'
      params.push(userFarmId)
    } else if (farmFilterId) {
      whereSql += ' AND p.farm_id = ?'
      params.push(farmFilterId)
    }
    if (from) {
      whereSql += ' AND p.purchase_time >= ?'
      params.push(`${from} 00:00:00`)
    }
    if (to) {
      whereSql += ' AND p.purchase_time <= ?'
      params.push(`${to} 23:59:59`)
    }

    const [rows] = await pool.execute(
      `
        SELECT
          COALESCE(SUM(p.total_amount), 0) AS total_amount,
          SUM(CASE WHEN DATE_FORMAT(p.purchase_time, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m') THEN 1 ELSE 0 END) AS month_count,
          SUM(CASE WHEN p.purchase_status = '待入库' THEN 1 ELSE 0 END) AS pending_count
        FROM material_purchase_record p
        ${whereSql}
      `,
      params
    )
    const r = rows?.[0] || {}
    res.json({
      total_amount: Number(r.total_amount || 0),
      month_count: Number(r.month_count || 0),
      pending_count: Number(r.pending_count || 0)
    })
  } catch (error) {
    console.error('purchase/stats error:', error)
    res.status(500).json({ message: '服务器错误', error: error.message })
  }
})

// -------------- 采购记录：列表 --------------
router.get('/purchase/list', authenticateToken, async (req, res) => {
  try {
    await ensureMaterialTables()
    const {
      page = 1,
      pageSize = 10,
      material_name = '',
      farm_id: farmFilterId = '',
      purchase_status = '',
      from = '',
      to = ''
    } = req.query
    const roleId = req.user.role_id
    const userFarmId = req.user.farm_id
    const offset = (Number(page) - 1) * Number(pageSize)
    const params = []
    let whereSql = 'WHERE 1=1'

    if (roleId !== 1) {
      whereSql += ' AND p.farm_id = ?'
      params.push(userFarmId)
    } else if (farmFilterId) {
      whereSql += ' AND p.farm_id = ?'
      params.push(farmFilterId)
    }
    if (material_name) {
      whereSql += ' AND p.material_name LIKE ?'
      params.push(`%${material_name}%`)
    }
    if (purchase_status) {
      whereSql += ' AND p.purchase_status = ?'
      params.push(purchase_status)
    }
    if (from) {
      whereSql += ' AND p.purchase_time >= ?'
      params.push(`${from} 00:00:00`)
    }
    if (to) {
      whereSql += ' AND p.purchase_time <= ?'
      params.push(`${to} 23:59:59`)
    }

    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS total FROM material_purchase_record p ${whereSql}`,
      params
    )
    const total = countRows?.[0]?.total || 0

    const [rows] = await pool.execute(
      `
        SELECT
          p.purchase_id, p.purchase_no,
          p.material_id, p.material_name,
          p.farm_id, p.farm_name,
          p.purchase_qty, p.unit_price, p.total_amount,
          p.supplier, p.purchase_status, p.purchase_time,
          p.remark, p.created_at,
          u.real_name AS operator_name
        FROM material_purchase_record p
        LEFT JOIN user u ON p.operator_id = u.user_id
        ${whereSql}
        ORDER BY p.purchase_time DESC, p.purchase_id DESC
        LIMIT ${Number(pageSize)} OFFSET ${Number(offset)}
      `,
      params
    )
    res.json({ data: rows || [], total, page: Number(page), pageSize: Number(pageSize) })
  } catch (error) {
    console.error('purchase/list error:', error)
    res.status(500).json({ message: '服务器错误', error: error.message })
  }
})

// -------------- 采购记录：可选农资 --------------
router.get('/purchase/material-options', authenticateToken, async (req, res) => {
  try {
    await ensureMaterialTables()
    const roleId = req.user.role_id
    const userFarmId = req.user.farm_id
    const { farm_id: farmFilterId = '' } = req.query
    if (roleId === 1 && !farmFilterId) {
      return res.json([])
    }
    const params = []
    let whereSql = 'WHERE 1=1'
    if (roleId !== 1) {
      whereSql += ' AND m.farm_id = ?'
      params.push(userFarmId)
    } else if (farmFilterId) {
      whereSql += ' AND m.farm_id = ?'
      params.push(farmFilterId)
    }
    const [rows] = await pool.execute(
      `
        SELECT
          m.material_id, m.material_name, m.price AS unit_price,
          m.farm_id, f.farm_name
        FROM agricultural_material m
        INNER JOIN farm f ON m.farm_id = f.farm_id
        ${whereSql}
        ORDER BY m.material_name ASC
      `,
      params
    )
    res.json(rows || [])
  } catch (error) {
    console.error('purchase/material-options error:', error)
    res.status(500).json({ message: '服务器错误', error: error.message })
  }
})

// -------------- 采购记录：新增 --------------
router.post('/purchase/create', authenticateToken, async (req, res) => {
  try {
    await ensureMaterialTables()
    if (!canManagePurchase(req)) return res.status(403).json({ message: '无权限新增采购记录' })
    const user = req.user
    const {
      material_id,
      farm_id,
      purchase_qty,
      unit_price,
      supplier,
      purchase_time,
      remark,
      auto_inbound
    } = req.body || {}

    const doAutoInbound = auto_inbound !== false && auto_inbound !== 'false'

    if (!material_id) return res.status(400).json({ message: '请选择农资' })
    const qty = Number(purchase_qty)
    const price = Number(unit_price)
    if (Number.isNaN(qty) || qty <= 0) return res.status(400).json({ message: '采购数量必须大于0' })
    if (Number.isNaN(price) || price < 0) return res.status(400).json({ message: '单价必须为非负数' })

    const [materials] = await pool.execute(
      `SELECT m.material_id, m.material_name, m.farm_id, f.farm_name
       FROM agricultural_material m
       INNER JOIN farm f ON m.farm_id = f.farm_id
       WHERE m.material_id = ?`,
      [material_id]
    )
    if (!materials?.length) return res.status(404).json({ message: '农资不存在' })
    const material = materials[0]
    const targetFarmId = user.role_id === 1 ? (farm_id || material.farm_id) : user.farm_id
    assertFarmAccess(user, targetFarmId)
    if (String(material.farm_id) !== String(targetFarmId)) {
      return res.status(400).json({ message: '请选择当前农场的农资' })
    }

    const [farmRows] = await pool.execute(`SELECT farm_name FROM farm WHERE farm_id = ?`, [targetFarmId])
    if (!farmRows?.length) return res.status(404).json({ message: '农场不存在' })
    const totalAmount = Number((qty * price).toFixed(2))
    const purchaseNo = makePurchaseNo()
    const pTime = purchase_time ? new Date(purchase_time) : new Date()

    if (!doAutoInbound) {
      const [ins] = await pool.execute(
        `
        INSERT INTO material_purchase_record
          (purchase_no, material_id, material_name, farm_id, farm_name, purchase_qty, unit_price, total_amount, supplier, purchase_status, purchase_time, operator_id, remark)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?, '待入库', ?, ?, ?)
      `,
        [
          purchaseNo,
          material.material_id,
          material.material_name,
          targetFarmId,
          farmRows[0].farm_name,
          qty,
          price,
          totalAmount,
          supplier || null,
          pTime,
          user.user_id,
          remark || null
        ]
      )
      return res.status(201).json({
        message: '采购记录新增成功',
        purchase_id: ins.insertId,
        auto_inbound: false
      })
    }

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      const [ins] = await conn.execute(
        `
        INSERT INTO material_purchase_record
          (purchase_no, material_id, material_name, farm_id, farm_name, purchase_qty, unit_price, total_amount, supplier, purchase_status, purchase_time, operator_id, remark)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?, '待入库', ?, ?, ?)
      `,
        [
          purchaseNo,
          material.material_id,
          material.material_name,
          targetFarmId,
          farmRows[0].farm_name,
          qty,
          price,
          totalAmount,
          supplier || null,
          pTime,
          user.user_id,
          remark || null
        ]
      )
      const purchaseId = ins.insertId
      const [pRows] = await conn.execute(
        `SELECT * FROM material_purchase_record WHERE purchase_id = ? FOR UPDATE`,
        [purchaseId]
      )
      const rec = pRows[0]
      const inbound = await runPurchaseInbound(conn, rec, user)
      await conn.commit()
      res.status(201).json({
        message: '采购已创建并自动入库',
        purchase_id: purchaseId,
        auto_inbound: true,
        inbound
      })
    } catch (e) {
      await conn.rollback()
      throw e
    } finally {
      conn.release()
    }
  } catch (error) {
    console.error('purchase/create error:', error)
    res.status(error.status || 500).json({ message: error.message || '服务器错误', error: error.message })
  }
})

// -------------- 采购记录：编辑（待入库） --------------
router.put('/purchase/update/:id', authenticateToken, async (req, res) => {
  try {
    await ensureMaterialTables()
    if (!canManagePurchase(req)) return res.status(403).json({ message: '无权限编辑采购记录' })
    const { id } = req.params
    const user = req.user
    const { purchase_qty, unit_price, supplier, purchase_time, remark } = req.body || {}
    const qty = Number(purchase_qty)
    const price = Number(unit_price)
    if (Number.isNaN(qty) || qty <= 0) return res.status(400).json({ message: '采购数量必须大于0' })
    if (Number.isNaN(price) || price < 0) return res.status(400).json({ message: '单价必须为非负数' })

    const [rows] = await pool.execute(
      `SELECT purchase_id, farm_id, purchase_status FROM material_purchase_record WHERE purchase_id = ?`,
      [id]
    )
    if (!rows?.length) return res.status(404).json({ message: '采购记录不存在' })
    const rec = rows[0]
    assertFarmAccess(user, rec.farm_id)
    if (rec.purchase_status !== '待入库') {
      return res.status(400).json({ message: '仅待入库状态可编辑' })
    }

    const [materialRows] = await pool.execute(
      `SELECT material_id, farm_id FROM material_purchase_record WHERE purchase_id = ?`,
      [id]
    )
    if (!materialRows?.length) return res.status(404).json({ message: '采购记录不存在' })
    const recMat = materialRows[0]
    if (String(recMat.farm_id) !== String(rec.farm_id)) {
      return res.status(400).json({ message: '采购记录农场异常，请联系管理员修复' })
    }

    await pool.execute(
      `
        UPDATE material_purchase_record
        SET purchase_qty = ?, unit_price = ?, total_amount = ?, supplier = ?, purchase_time = ?, remark = ?
        WHERE purchase_id = ?
      `,
      [qty, price, Number((qty * price).toFixed(2)), supplier || null, purchase_time ? new Date(purchase_time) : new Date(), remark || null, id]
    )
    res.json({ message: '采购记录更新成功' })
  } catch (error) {
    console.error('purchase/update error:', error)
    res.status(500).json({ message: '服务器错误', error: error.message })
  }
})

// -------------- 采购记录：删除（管理员） --------------
router.delete('/purchase/delete/:id', authenticateToken, async (req, res) => {
  try {
    await ensureMaterialTables()
    if (!canDeletePurchase(req)) return res.status(403).json({ message: '无权限删除采购记录' })
    const { id } = req.params
    const [rows] = await pool.execute(`SELECT purchase_status FROM material_purchase_record WHERE purchase_id = ?`, [id])
    if (!rows?.length) return res.status(404).json({ message: '采购记录不存在' })
    if (rows[0].purchase_status === '已入库') {
      return res.status(400).json({ message: '已入库记录不可删除' })
    }
    await pool.execute(`DELETE FROM material_purchase_record WHERE purchase_id = ?`, [id])
    res.json({ message: '删除成功' })
  } catch (error) {
    console.error('purchase/delete error:', error)
    res.status(500).json({ message: '服务器错误', error: error.message })
  }
})

// -------------- 采购记录：取消（待入库） --------------
router.post('/purchase/cancel/:id', authenticateToken, async (req, res) => {
  try {
    await ensureMaterialTables()
    if (!canManagePurchase(req)) return res.status(403).json({ message: '无权限取消采购记录' })
    const { id } = req.params
    const [rows] = await pool.execute(
      `SELECT purchase_id, farm_id, purchase_status FROM material_purchase_record WHERE purchase_id = ?`,
      [id]
    )
    if (!rows?.length) return res.status(404).json({ message: '采购记录不存在' })
    const rec = rows[0]
    assertFarmAccess(req.user, rec.farm_id)
    if (rec.purchase_status !== '待入库') return res.status(400).json({ message: '仅待入库可取消' })
    await pool.execute(`UPDATE material_purchase_record SET purchase_status = '已取消' WHERE purchase_id = ?`, [id])
    res.json({ message: '已取消' })
  } catch (error) {
    console.error('purchase/cancel error:', error)
    res.status(500).json({ message: '服务器错误', error: error.message })
  }
})

// -------------- 采购记录：入库 --------------
router.post('/purchase/inbound/:id', authenticateToken, async (req, res) => {
  try {
    await ensureMaterialTables()
    if (!canInboundPurchase(req)) return res.status(403).json({ message: '无权限执行入库' })
    const { id } = req.params

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      const [rows] = await conn.execute(
        `SELECT * FROM material_purchase_record WHERE purchase_id = ? FOR UPDATE`,
        [id]
      )
      if (!rows?.length) {
        await conn.rollback()
        return res.status(404).json({ message: '采购记录不存在' })
      }
      const rec = rows[0]
      assertFarmAccess(req.user, rec.farm_id)
      const result = await runPurchaseInbound(conn, rec, req.user)
      await conn.commit()
      res.json({
        message: '入库成功',
        ...result
      })
    } catch (e) {
      await conn.rollback()
      throw e
    } finally {
      conn.release()
    }
  } catch (error) {
    console.error('purchase/inbound error:', error)
    const code = error.status || 500
    res.status(code).json({ message: error.message || '服务器错误', error: error.message })
  }
})

router.ensureMaterialTables = ensureMaterialTables
module.exports = router

