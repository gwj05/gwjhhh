// 检查负责人管理相关表是否存在
const pool = require('./config/database');

async function checkTables() {
  try {
    // 检查 farm_principal 表
    const [tables] = await pool.execute(
      `SELECT TABLE_NAME 
       FROM information_schema.TABLES 
       WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME IN ('farm_principal', 'principal_permission', 'principal_operation_log')`
    );
    
    const existingTables = tables.map(t => t.TABLE_NAME);
    const requiredTables = ['farm_principal', 'principal_permission', 'principal_operation_log'];
    const missingTables = requiredTables.filter(t => !existingTables.includes(t));
    
    if (missingTables.length > 0) {
      console.log('❌ 缺少以下表:', missingTables.join(', '));
      console.log('请执行以下SQL脚本创建表:');
      console.log('mysql -u root -p smart_agriculture < server/migrations/add_principal_tables.sql');
      process.exit(1);
    } else {
      console.log('✅ 所有必需的表都存在');
    }
    
    // 检查表结构
    const [columns] = await pool.execute(
      `SELECT COLUMN_NAME, DATA_TYPE 
       FROM information_schema.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = 'farm_principal'`
    );
    
    console.log('farm_principal 表的列:', columns.map(c => c.COLUMN_NAME).join(', '));
    
    process.exit(0);
  } catch (error) {
    console.error('检查表时出错:', error.message);
    process.exit(1);
  }
}

checkTables();

