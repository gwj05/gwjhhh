/**
 * 检查作物表结构脚本
 * 用于验证数据库迁移是否成功
 */
const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkCropTable() {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'Gwj@147',
      database: process.env.DB_NAME || 'smart_agriculture'
    });

    console.log('✅ 数据库连接成功\n');

    // 检查表是否存在
    const [tables] = await connection.query(
      `SELECT TABLE_NAME 
       FROM INFORMATION_SCHEMA.TABLES 
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'crop'`,
      [process.env.DB_NAME || 'smart_agriculture']
    );

    if (tables.length === 0) {
      console.log('❌ crop表不存在！');
      return;
    }

    console.log('✅ crop表存在\n');

    // 检查所有字段
    const [columns] = await connection.query(
      `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_COMMENT
       FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'crop'
       ORDER BY ORDINAL_POSITION`,
      [process.env.DB_NAME || 'smart_agriculture']
    );

    console.log('📋 表结构：');
    console.log('─'.repeat(80));
    columns.forEach(col => {
      console.log(`${col.COLUMN_NAME.padEnd(25)} | ${col.DATA_TYPE.padEnd(15)} | ${col.IS_NULLABLE.padEnd(5)} | ${col.COLUMN_DEFAULT || 'NULL'.padEnd(10)} | ${col.COLUMN_COMMENT || ''}`);
    });
    console.log('─'.repeat(80));

    // 检查必需字段
    const requiredFields = [
      'crop_name', 'crop_category', 'growth_cycle',
      'suitable_temp_min', 'suitable_temp_max',
      'suitable_humidity_min', 'suitable_humidity_max',
      'suitable_ph_min', 'suitable_ph_max',
      'plant_status', 'created_at', 'updated_at'
    ];

    const existingFields = columns.map(c => c.COLUMN_NAME);
    const missingFields = requiredFields.filter(f => !existingFields.includes(f));

    if (missingFields.length > 0) {
      console.log('\n❌ 缺失的字段：');
      missingFields.forEach(f => console.log(`   - ${f}`));
      console.log('\n💡 请执行修复脚本：');
      console.log('   mysql -u root -p smart_agriculture < server/migrations/fix_crop_fields_simple.sql');
    } else {
      console.log('\n✅ 所有必需字段都存在！');
    }

    // 测试查询
    console.log('\n🧪 测试查询...');
    try {
      const [testRows] = await connection.query(
        `SELECT 
          c.crop_id,
          COALESCE(c.crop_name, c.crop_type, '') AS crop_name,
          c.crop_type,
          c.crop_category,
          COALESCE(c.plant_status, '生长中') AS plant_status
         FROM crop c
         LIMIT 1`
      );
      console.log('✅ 查询测试成功！');
      if (testRows.length > 0) {
        console.log('📊 示例数据：', testRows[0]);
      }
    } catch (queryError) {
      console.error('❌ 查询测试失败：', queryError.message);
      console.error('错误代码：', queryError.code);
    }

    // 检查数据
    const [countResult] = await connection.query('SELECT COUNT(*) AS total FROM crop');
    console.log(`\n📊 作物记录总数：${countResult[0].total}`);

  } catch (error) {
    console.error('❌ 检查失败：', error.message);
    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('💡 数据库访问被拒绝，请检查 .env 文件中的数据库配置');
    }
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

checkCropTable();

