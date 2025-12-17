const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

dotenv.config();

async function initTestData() {
  let connection;
  
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'Gwj@147',
      database: process.env.DB_NAME || 'smart_agriculture'
    });

    console.log('数据库连接成功');

    // 加密密码 123456
    const hashedPassword = await bcrypt.hash('123456', 10);
    console.log('密码加密完成:', hashedPassword);

    // 更新测试用户密码
    const [result] = await connection.execute(
      `UPDATE user SET password = ? WHERE username IN ('admin', 'operator', 'user')`,
      [hashedPassword]
    );

    console.log(`已更新 ${result.affectedRows} 个用户的密码`);

    // 如果没有用户，则创建测试用户
    const [users] = await connection.execute('SELECT COUNT(*) as count FROM user');
    if (users[0].count === 0) {
      await connection.execute(
        `INSERT INTO user (role_id, username, password, real_name, phone, farm_id) VALUES
         (1, 'admin', ?, '系统管理员', '13800138000', NULL),
         (2, 'operator', ?, '运维人员', '13800138001', NULL),
         (3, 'user', ?, '普通用户', '13800138002', NULL)`,
        [hashedPassword, hashedPassword, hashedPassword]
      );
      console.log('已创建测试用户');
    }

    console.log('测试数据初始化完成！');
    console.log('测试账号：');
    console.log('  管理员: admin / 123456');
    console.log('  运维人员: operator / 123456');
    console.log('  普通用户: user / 123456');

  } catch (error) {
    console.error('初始化失败:', error.message);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

initTestData();

