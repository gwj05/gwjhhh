let ensured = false

async function ensureAuditLogTable (pool) {
  if (ensured) return
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      action VARCHAR(128) NOT NULL,
      user_id INT NULL,
      username VARCHAR(128) NULL,
      detail TEXT NULL,
      ip VARCHAR(64) NULL,
      INDEX idx_audit_created (created_at),
      INDEX idx_audit_action (action)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
  ensured = true
}

function clientIp (req) {
  const xff = req.headers['x-forwarded-for']
  if (xff) return String(xff).split(',')[0].trim()
  return req.ip || req.connection?.remoteAddress || ''
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ action: string, user_id?: number|null, username?: string|null, detail?: object, ip?: string }} row
 */
async function writeAuditLog (pool, row) {
  try {
    await ensureAuditLogTable(pool)
    const detailJson = row.detail != null ? JSON.stringify(row.detail) : null
    await pool.execute(
      'INSERT INTO audit_log (action, user_id, username, detail, ip) VALUES (?, ?, ?, ?, ?)',
      [row.action, row.user_id ?? null, row.username ?? null, detailJson, row.ip ?? null]
    )
  } catch (e) {
    console.error('audit_log write failed:', e.message)
  }
}

module.exports = {
  ensureAuditLogTable,
  writeAuditLog,
  clientIp
}
