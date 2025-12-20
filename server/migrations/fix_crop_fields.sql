-- 修复作物表字段迁移问题
-- 用于修复 add_crop_fields.sql 执行后缺失的字段

USE smart_agriculture;

-- 检查并添加 plant_status 字段（修复默认值问题）
-- MySQL 8.0 对默认值要求更严格，使用 NULL 或明确的默认值
SET @column_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = 'smart_agriculture' 
      AND TABLE_NAME = 'crop' 
      AND COLUMN_NAME = 'plant_status'
);

SET @sql = IF(@column_exists = 0,
    'ALTER TABLE crop ADD COLUMN plant_status VARCHAR(20) DEFAULT ''生长中'' COMMENT ''种植状态：生长中/成熟/已收割'' AFTER suitable_ph_max',
    'SELECT ''plant_status字段已存在，跳过'' AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 检查并添加 created_at 字段
SET @column_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = 'smart_agriculture' 
      AND TABLE_NAME = 'crop' 
      AND COLUMN_NAME = 'created_at'
);

SET @sql = IF(@column_exists = 0,
    'ALTER TABLE crop ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT ''创建时间'' AFTER plant_status',
    'SELECT ''created_at字段已存在，跳过'' AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 检查并添加 updated_at 字段
SET @column_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.COLUMNS 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = 'smart_agriculture' 
      AND TABLE_NAME = 'crop' 
      AND COLUMN_NAME = 'updated_at'
);

SET @sql = IF(@column_exists = 0,
    'ALTER TABLE crop ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT ''更新时间'' AFTER created_at',
    'SELECT ''updated_at字段已存在，跳过'' AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 添加索引（如果字段存在但索引不存在）
-- 检查并添加 plant_status 索引
SET @index_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.STATISTICS 
    WHERE TABLE_SCHEMA = 'smart_agriculture' 
      AND TABLE_NAME = 'crop' 
      AND INDEX_NAME = 'idx_crop_status'
);

SET @column_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = 'smart_agriculture' 
      AND TABLE_NAME = 'crop' 
      AND COLUMN_NAME = 'plant_status'
);

SET @sql = IF(@index_exists = 0 AND @column_exists > 0,
    'ALTER TABLE crop ADD INDEX idx_crop_status (plant_status)',
    'SELECT ''索引已存在或字段不存在，跳过'' AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT '修复完成！请执行 DESCRIBE crop; 查看表结构' AS result;

