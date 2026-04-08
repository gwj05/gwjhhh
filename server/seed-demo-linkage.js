/**
 * 演示数据：库存预警 + 农事操作记录（可重复执行，按需调整）
 * 运行：node server/seed-demo-linkage.js
 */
require('dotenv').config()
const pool = require('./config/database')

async function main() {
  const conn = await pool.getConnection()
  try {
    const [farms] = await conn.execute('SELECT farm_id, farm_name FROM farm ORDER BY farm_id LIMIT 5')
    if (!farms.length) {
      console.log('无农场数据，请先初始化农场与用户。')
      return
    }

    const [users] = await conn.execute(
      'SELECT user_id FROM user WHERE role_id = 1 ORDER BY user_id LIMIT 1'
    )
    const adminId = users[0]?.user_id || 1

    for (const f of farms) {
      const fid = f.farm_id
      const [mats] = await conn.execute(
        'SELECT material_id, material_name FROM agricultural_material WHERE farm_id = ? ORDER BY material_id LIMIT 5',
        [fid]
      )

      if (mats.length >= 1) {
        await conn.execute(
          'UPDATE agricultural_material SET stock_num = 0, safety_stock_num = 25 WHERE material_id = ?',
          [mats[0].material_id]
        )
        console.log(`农场 ${fid}：${mats[0].material_name} → 缺货演示`)
      }
      if (mats.length >= 2) {
        await conn.execute(
          'UPDATE agricultural_material SET stock_num = 5, safety_stock_num = 30 WHERE material_id = ?',
          [mats[1].material_id]
        )
        console.log(`农场 ${fid}：${mats[1].material_name} → 库存不足演示`)
      }

      const [crops] = await conn.execute(
        'SELECT crop_id, plant_area FROM crop WHERE farm_id = ? LIMIT 1',
        [fid]
      )
      const crop = crops[0]
      if (crop) {
        await conn.execute(
          `INSERT INTO operation_record
            (user_id, farm_id, operation_type, operation_time, relate_id, operation_detail)
           VALUES (?, ?, '灌溉', NOW(), ?, ?)`,
          [adminId, fid, crop.crop_id, `演示灌溉记录｜区域 ${crop.plant_area}｜用水约 12m³`]
        )
        console.log(`农场 ${fid}：已写入演示灌溉 1 条`)
      }
    }

    console.log('完成。首页将显示库存预警；农事操作查询可见演示记录。')
  } catch (e) {
    console.error(e.message)
  } finally {
    conn.release()
    process.exit(0)
  }
}

main()
