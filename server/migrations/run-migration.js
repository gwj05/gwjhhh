/**
 * 数据库迁移执行脚本
 * 用于执行 add_crop_fields.sql 迁移文件
 * 
 * 使用方法：
 * 1. 确保已安装依赖：npm install
 * 2. 确保 .env 文件配置正确
 * 3. 执行：node server/migrations/run-migration.js
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runMigration() {
  let connection;
  try {
    console.log('🔌 正在连接数据库...');
    
    // 创建数据库连接
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'Gwj@147',
      database: process.env.DB_NAME || 'smart_agriculture',
      multipleStatements: true  // 允许执行多条SQL语句
    });

    console.log('✅ 数据库连接成功');
    console.log(`📊 数据库：${process.env.DB_NAME || 'smart_agriculture'}`);

    // 读取SQL文件
    const sqlPath = path.join(__dirname, 'add_crop_fields.sql');
    
    if (!fs.existsSync(sqlPath)) {
      throw new Error(`SQL文件不存在: ${sqlPath}`);
    }
    
    const sql = fs.readFileSync(sqlPath, 'utf8');
    console.log('📝 已读取迁移文件');

    // 执行SQL
    console.log('🚀 开始执行迁移...');
    console.log('─'.repeat(50));
    
    const [results] = await connection.query(sql);
    
    console.log('─'.repeat(50));
    console.log('✅ 迁移执行成功！');
    console.log(`📈 执行结果：`, results);
    
    // 验证字段是否添加成功
    console.log('\n🔍 验证迁移结果...');
    const [columns] = await connection.query(`
      SELECT COLUMN_NAME, DATA_TYPE, COLUMN_COMMENT
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? 
        AND TABLE_NAME = 'crop'
        AND COLUMN_NAME IN (
          'crop_name', 'crop_category', 'growth_cycle',
          'suitable_temp_min', 'suitable_temp_max',
          'suitable_humidity_min', 'suitable_humidity_max',
          'suitable_ph_min', 'suitable_ph_max',
          'plant_status', 'created_at', 'updated_at'
        )
      ORDER BY ORDINAL_POSITION
    `, [process.env.DB_NAME || 'smart_agriculture']);
    
    if (columns.length > 0) {
      console.log('✅ 新字段已成功添加：');
      columns.forEach(col => {
        console.log(`   - ${col.COLUMN_NAME} (${col.DATA_TYPE}) - ${col.COLUMN_COMMENT || ''}`);
      });
    } else {
      console.log('⚠️  未检测到新字段，可能字段已存在或迁移未完全执行');
    }
    
  } catch (error) {
    console.error('\n❌ 迁移执行失败！');
    console.error('错误信息：', error.message);
    
    // 如果是字段已存在的错误，提示用户
    if (error.message.includes('Duplicate column name')) {
      console.log('\n💡 提示：某些字段可能已存在，这是正常的。');
      console.log('   可以忽略此错误，或手动检查表结构。');
      console.log('   执行以下SQL查看表结构：');
      console.log('   DESCRIBE crop;');
    } else if (error.message.includes('Table') && error.message.includes("doesn't exist")) {
      console.log('\n💡 提示：表不存在，请先执行初始化脚本 server/init.sql');
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.log('\n💡 提示：数据库访问被拒绝，请检查 .env 文件中的数据库配置');
      console.log('   当前配置：');
      console.log(`   - 主机：${process.env.DB_HOST || 'localhost'}`);
      console.log(`   - 端口：${process.env.DB_PORT || 3306}`);
      console.log(`   - 用户：${process.env.DB_USER || 'root'}`);
      console.log(`   - 数据库：${process.env.DB_NAME || 'smart_agriculture'}`);
    }
    
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n🔌 数据库连接已关闭');
    }
  }
}

// 执行迁移
runMigration();

