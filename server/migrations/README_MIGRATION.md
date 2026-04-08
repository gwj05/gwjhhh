# 数据库迁移执行说明
## 作物管理模块数据库字段扩展迁移
### 方法一：使用 MySQL 命令行（推荐）
#### 步骤 1：打开 MySQL 命令行
```bash
# Windows (在命令提示符或PowerShell中)
mysql -u root -p

# 或者如果MySQL在系统PATH中
mysql -h localhost -u root -p
```
#### 步骤 2：输入数据库密码
```
Enter password: [输入你的MySQL密码，默认可能是 Gwj@147]
```

#### 步骤 3：切换到项目目录（可选）
```bash
# 在MySQL命令行中无法切换，需要先切换到项目目录
# 在Windows PowerShell中：
cd D:\09code\demo4
```
#### 步骤 4：执行迁移文件
```sql
-- 方式1：使用 source 命令（需要先切换到项目目录）
USE smart_agriculture;
source server/migrations/add_crop_fields.sql

-- 方式2：直接复制SQL内容到MySQL命令行执行
-- 先执行 USE smart_agriculture;
-- 然后逐条执行 ALTER TABLE 语句
```

**注意**：如果使用 `source` 命令，需要确保：
- 当前工作目录是项目根目录 `D:\09code\demo4`
- 文件路径使用正斜杠 `/` 或双反斜杠 `\\`

如果 `source` 命令不工作，可以使用方式2。
1. 启动 MySQL Workbench
2. 连接到你的数据库服务器（localhost）

#### 步骤 2：打开 SQL 文件
1. 点击菜单 `File` → `Open SQL Script...`
2. 导航到 `D:\09code\demo4\server\migrations\add_crop_fields.sql`
3. 点击打开

#### 步骤 3：选择数据库
在 SQL 编辑器中，确保顶部显示的是 `smart_agriculture` 数据库，或者执行：
```sql
USE smart_agriculture;
```

#### 步骤 4：执行 SQL
1. 点击工具栏的 ⚡ 执行按钮（或按 `Ctrl+Shift+Enter`）
2. 查看执行结果，确认没有错误

---

### 方法三：使用 Node.js 脚本执行（自动化）

创建一个执行脚本：

```javascript
// server/migrations/run-migration.js
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runMigration() {
  let connection;
  try {
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

    // 读取SQL文件
    const sqlPath = path.join(__dirname, 'add_crop_fields.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // 执行SQL
    console.log('📝 开始执行迁移...');
    await connection.query(sql);
    
    console.log('✅ 迁移执行成功！');
    
  } catch (error) {
    console.error('❌ 迁移执行失败:', error.message);
    
    // 如果是字段已存在的错误，提示用户
    if (error.message.includes('Duplicate column name')) {
      console.log('\n⚠️  提示：某些字段可能已存在，这是正常的。');
      console.log('   可以忽略此错误，或手动检查表结构。');
    }
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 数据库连接已关闭');
    }
  }
}

runMigration();
```

**执行脚本**：
```bash
# 在项目根目录执行
cd server/migrations
node run-migration.js
```

---

### 方法四：手动逐条执行（最安全）

如果上述方法都遇到问题，可以手动逐条执行：

#### 1. 连接到数据库
```sql
USE smart_agriculture;
```

#### 2. 检查当前表结构
```sql
DESCRIBE crop;
-- 或
SHOW COLUMNS FROM crop;
```

#### 3. 逐条执行 ALTER TABLE 语句
```sql
-- 添加作物名称
ALTER TABLE crop 
ADD COLUMN crop_name VARCHAR(50) COMMENT '作物名称（必填）' AFTER crop_id;

-- 添加作物类型
ALTER TABLE crop 
ADD COLUMN crop_category VARCHAR(20) COMMENT '作物类型：果蔬/粮食/经济作物' AFTER crop_type;

-- 添加生长周期
ALTER TABLE crop 
ADD COLUMN growth_cycle INT COMMENT '生长周期（天数）' AFTER sow_time;

-- 添加适宜温度范围
ALTER TABLE crop 
ADD COLUMN suitable_temp_min DECIMAL(5,2) COMMENT '适宜温度下限（℃）' AFTER growth_cycle;

ALTER TABLE crop 
ADD COLUMN suitable_temp_max DECIMAL(5,2) COMMENT '适宜温度上限（℃）' AFTER suitable_temp_min;

-- 添加适宜湿度范围
ALTER TABLE crop 
ADD COLUMN suitable_humidity_min DECIMAL(5,2) COMMENT '适宜湿度下限（%）' AFTER suitable_temp_max;

ALTER TABLE crop 
ADD COLUMN suitable_humidity_max DECIMAL(5,2) COMMENT '适宜湿度上限（%）' AFTER suitable_humidity_min;

-- 添加适宜pH范围
ALTER TABLE crop 
ADD COLUMN suitable_ph_min DECIMAL(3,1) COMMENT '适宜pH下限' AFTER suitable_humidity_max;

ALTER TABLE crop 
ADD COLUMN suitable_ph_max DECIMAL(3,1) COMMENT '适宜pH上限' AFTER suitable_ph_min;

-- 添加种植状态
ALTER TABLE crop 
ADD COLUMN plant_status VARCHAR(20) DEFAULT '生长中' COMMENT '种植状态：生长中/成熟/已收割' AFTER suitable_ph_max;

-- 添加时间字段
ALTER TABLE crop 
ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间' AFTER plant_status;

ALTER TABLE crop 
ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间' AFTER created_at;
```

#### 4. 添加索引（可选，如果已存在会报错，可忽略）
```sql
ALTER TABLE crop ADD INDEX idx_crop_name (crop_name);
ALTER TABLE crop ADD INDEX idx_crop_category (crop_category);
ALTER TABLE crop ADD INDEX idx_crop_status (plant_status);
ALTER TABLE crop ADD INDEX idx_crop_sow_time (sow_time);
```

#### 5. 更新现有数据
```sql
UPDATE crop SET crop_name = crop_type WHERE crop_name IS NULL OR crop_name = '';
```

---

## 验证迁移是否成功

执行以下SQL查询验证：

```sql
USE smart_agriculture;

-- 查看表结构
DESCRIBE crop;

-- 或者查看所有列
SHOW COLUMNS FROM crop;

-- 检查特定字段是否存在
SELECT 
    COLUMN_NAME, 
    DATA_TYPE, 
    IS_NULLABLE, 
    COLUMN_DEFAULT,
    COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = 'smart_agriculture' 
  AND TABLE_NAME = 'crop'
  AND COLUMN_NAME IN (
    'crop_name', 
    'crop_category', 
    'growth_cycle',
    'suitable_temp_min',
    'suitable_temp_max',
    'suitable_humidity_min',
    'suitable_humidity_max',
    'suitable_ph_min',
    'suitable_ph_max',
    'plant_status',
    'created_at',
    'updated_at'
  )
ORDER BY ORDINAL_POSITION;
```

**预期结果**：应该能看到所有新添加的字段。

---

## 常见问题处理

### 问题 1：`Duplicate column name 'crop_name'`
**原因**：字段已存在  
**解决**：忽略此错误，或先删除字段再添加：
```sql
ALTER TABLE crop DROP COLUMN crop_name;
-- 然后重新执行添加语句
```

### 问题 2：`Table 'smart_agriculture.crop' doesn't exist`
**原因**：数据库或表不存在  
**解决**：先执行初始化脚本 `server/init.sql`

### 问题 3：`Access denied for user`
**原因**：数据库用户名或密码错误  
**解决**：检查 `.env` 文件中的数据库配置，或使用正确的MySQL账户

### 问题 4：`source` 命令找不到文件
**原因**：路径问题  
**解决**：
- 确保在项目根目录执行
- 使用绝对路径：`source D:/09code/demo4/server/migrations/add_crop_fields.sql`
- 或使用反斜杠转义：`source D:\\09code\\demo4\\server\\migrations\\add_crop_fields.sql`

### 问题 5：迁移后前端仍报错
**原因**：可能需要重启后端服务  
**解决**：
1. 停止后端服务（Ctrl+C）
2. 重新启动：`cd server && npm start`

---

## 回滚迁移（如果需要）

如果需要撤销迁移，执行以下SQL：

```sql
USE smart_agriculture;

-- 删除索引
ALTER TABLE crop DROP INDEX idx_crop_name;
ALTER TABLE crop DROP INDEX idx_crop_category;
ALTER TABLE crop DROP INDEX idx_crop_status;
ALTER TABLE crop DROP INDEX idx_crop_sow_time;

-- 删除字段
ALTER TABLE crop DROP COLUMN updated_at;
ALTER TABLE crop DROP COLUMN created_at;
ALTER TABLE crop DROP COLUMN plant_status;
ALTER TABLE crop DROP COLUMN suitable_ph_max;
ALTER TABLE crop DROP COLUMN suitable_ph_min;
ALTER TABLE crop DROP COLUMN suitable_humidity_max;
ALTER TABLE crop DROP COLUMN suitable_humidity_min;
ALTER TABLE crop DROP COLUMN suitable_temp_max;
ALTER TABLE crop DROP COLUMN suitable_temp_min;
ALTER TABLE crop DROP COLUMN growth_cycle;
ALTER TABLE crop DROP COLUMN crop_category;
ALTER TABLE crop DROP COLUMN crop_name;
```

**注意**：回滚会删除数据，请谨慎操作！

---

## 推荐执行方式

对于 Windows 用户，推荐使用 **MySQL Workbench**（方法二），因为：
1. 图形界面，操作直观
2. 可以查看执行结果和错误信息
3. 支持语法高亮和自动补全
4. 可以方便地查看表结构

如果熟悉命令行，可以使用 **方法一**（MySQL命令行）。

如果需要自动化或批量执行多个迁移，可以使用 **方法三**（Node.js脚本）。

