/**
 * 一键：把「通用视频」样例改为同源 /demo-video/*，并补全种子（无则插入）。
 * 使用与 config/database.js 相同的环境变量；默认库 smart_agriculture。
 */
const fs = require('fs')
const path = require('path')
const mysql = require('mysql2/promise')

require('dotenv').config({ path: path.join(__dirname, '../.env') })

async function main () {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'Gwj@147',
    database: process.env.DB_NAME || 'smart_agriculture',
    multipleStatements: true
  })

  const updatePath = path.join(__dirname, '../migrations/update_video_device_demo_urls.sql')
  const seedPath = path.join(__dirname, '../migrations/seed_video_device_demo.sql')

  const updateSql = fs.readFileSync(updatePath, 'utf8')
  const seedSql = fs.readFileSync(seedPath, 'utf8')

  console.log('执行 update_video_device_demo_urls.sql …')
  await conn.query(updateSql)
  console.log('执行 seed_video_device_demo.sql …')
  await conn.query(seedSql)

  await conn.end()
  console.log('完成：通用视频演示地址已更新/补全。请重启后端与前端开发服务。')
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
