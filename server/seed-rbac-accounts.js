/**
 * 幂等补齐 RBAC 演示账号（admin/operator/user）并绑定农场
 *
 * 目标：
 * - 确保 role 表存在 1/2/3
 * - 确保 user 表存在 admin/operator/user，密码统一 123456（bcrypt hash 与 init.sql 一致）
 * - 确保存在至少 1 个农场；并将 operator/user 绑定到该农场（farm_id 不为空）
 *
 * 用法：
 *   node seed-rbac-accounts.js
 */
require('dotenv').config()
const pool = require('./config/database')

// 使用 bcryptjs 生成：bcrypt.hashSync('123456', 10)
const PASSWORD_HASH_123456 = '$2a$10$s4BC00/govuHnwuy2OnQzOEivJRDL2kXJpFVTZEvyAN2qsEUZBmQm'

async function ensureRoles(conn) {
  await conn.execute(
    `INSERT INTO role (role_id, role_name) VALUES
      (1, '管理员'),
      (2, '运维人员'),
      (3, '普通用户')
     ON DUPLICATE KEY UPDATE role_name = VALUES(role_name)`
  )
}

async function upsertUser(conn, { role_id, username, real_name, phone, farm_id }) {
  const [rows] = await conn.execute('SELECT user_id FROM user WHERE username = ? LIMIT 1', [username])
  if (rows.length) {
    await conn.execute(
      `UPDATE user
       SET role_id = ?, password = ?, real_name = ?, phone = ?, farm_id = ?
       WHERE username = ?`,
      [role_id, PASSWORD_HASH_123456, real_name, phone, farm_id ?? null, username]
    )
    return rows[0].user_id
  }
  const [r] = await conn.execute(
    `INSERT INTO user (role_id, username, password, real_name, phone, farm_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [role_id, username, PASSWORD_HASH_123456, real_name, phone, farm_id ?? null]
  )
  return r.insertId
}

async function ensureFarm(conn, principalUserId) {
  const [rows] = await conn.execute('SELECT farm_id FROM farm ORDER BY farm_id LIMIT 1')
  if (rows.length) return rows[0].farm_id

  const [r] = await conn.execute(
    `INSERT INTO farm
      (farm_name, farm_code, address, principal_id, phone, farm_level, longitude, latitude, total_area, region_count, active_crop_count, irrigation_mode, soil_quality_level, remark)
     VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      '演示农场',
      'DEMO-FARM-001',
      '演示地址',
      principalUserId,
      '13800138000',
      'demo',
      116.397128,
      39.916527,
      120.5,
      0,
      0,
      'auto_manual',
      'B',
      '自动生成：用于 RBAC/权限回归测试'
    ]
  )
  return r.insertId
}

async function main() {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    await ensureRoles(conn)

    // 先保证 admin 存在（admin 不绑定农场）
    const adminId = await upsertUser(conn, {
      role_id: 1,
      username: 'admin',
      real_name: '系统管理员',
      phone: '13800138000',
      farm_id: null
    })

    // 保证至少有一个农场
    const farmId = await ensureFarm(conn, adminId)

    // operator/user 绑定到 farm
    await upsertUser(conn, {
      role_id: 2,
      username: 'operator',
      real_name: '农场管理员',
      phone: '13800138001',
      farm_id: farmId
    })
    await upsertUser(conn, {
      role_id: 3,
      username: 'user',
      real_name: '普通用户',
      phone: '13800138002',
      farm_id: farmId
    })

    await conn.commit()
    console.log(`完成：已确保 RBAC 账号存在并绑定 farm_id=${farmId}（admin/operator/user，密码均为 123456）`)
  } catch (e) {
    try { await conn.rollback() } catch {}
    console.error('失败：', e.message)
    process.exitCode = 1
  } finally {
    conn.release()
  }
}

main()

