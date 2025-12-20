-- 作物管理模块数据库字段扩展（修复版）
-- 执行前请确保已创建 smart_agriculture 数据库
-- 此版本修复了 MySQL 8.0 的默认值兼容性问题

USE smart_agriculture;

-- 扩展作物表，添加作物管理所需字段
-- 注意：如果字段已存在，执行会报错，请手动处理或确保在空表上执行

-- 1. 添加作物名称
ALTER TABLE crop 
ADD COLUMN IF NOT EXISTS crop_name VARCHAR(50) COMMENT '作物名称（必填）' AFTER crop_id;

-- 2. 添加作物类型
ALTER TABLE crop 
ADD COLUMN IF NOT EXISTS crop_category VARCHAR(20) COMMENT '作物类型：果蔬/粮食/经济作物' AFTER crop_type;

-- 3. 添加生长周期
ALTER TABLE crop 
ADD COLUMN IF NOT EXISTS growth_cycle INT COMMENT '生长周期（天数）' AFTER sow_time;

-- 4. 添加适宜温度范围
ALTER TABLE crop 
ADD COLUMN IF NOT EXISTS suitable_temp_min DECIMAL(5,2) COMMENT '适宜温度下限（℃）' AFTER growth_cycle;

ALTER TABLE crop 
ADD COLUMN IF NOT EXISTS suitable_temp_max DECIMAL(5,2) COMMENT '适宜温度上限（℃）' AFTER suitable_temp_min;

-- 5. 添加适宜湿度范围
ALTER TABLE crop 
ADD COLUMN IF NOT EXISTS suitable_humidity_min DECIMAL(5,2) COMMENT '适宜湿度下限（%）' AFTER suitable_temp_max;

ALTER TABLE crop 
ADD COLUMN IF NOT EXISTS suitable_humidity_max DECIMAL(5,2) COMMENT '适宜湿度上限（%）' AFTER suitable_humidity_min;

-- 6. 添加适宜pH范围
ALTER TABLE crop 
ADD COLUMN IF NOT EXISTS suitable_ph_min DECIMAL(3,1) COMMENT '适宜pH下限' AFTER suitable_humidity_max;

ALTER TABLE crop 
ADD COLUMN IF NOT EXISTS suitable_ph_max DECIMAL(3,1) COMMENT '适宜pH上限' AFTER suitable_ph_min;

-- 7. 添加种植状态（修复：使用单引号转义，或先添加NULL再更新）
ALTER TABLE crop 
ADD COLUMN IF NOT EXISTS plant_status VARCHAR(20) COMMENT '种植状态：生长中/成熟/已收割' AFTER suitable_ph_max;

-- 设置默认值（如果字段刚创建）
UPDATE crop SET plant_status = '生长中' WHERE plant_status IS NULL;

-- 修改字段添加默认值（MySQL 8.0兼容）
ALTER TABLE crop 
MODIFY COLUMN plant_status VARCHAR(20) DEFAULT '生长中' COMMENT '种植状态：生长中/成熟/已收割';

-- 8. 添加创建时间
ALTER TABLE crop 
ADD COLUMN IF NOT EXISTS created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间' AFTER plant_status;

-- 9. 添加更新时间
ALTER TABLE crop 
ADD COLUMN IF NOT EXISTS updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间' AFTER created_at;

-- 添加索引优化查询性能（如果索引已存在会报错，可忽略）
-- 使用条件判断避免重复创建索引
SET @sql = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS 
     WHERE TABLE_SCHEMA = 'smart_agriculture' 
       AND TABLE_NAME = 'crop' 
       AND INDEX_NAME = 'idx_crop_name') = 0,
    'ALTER TABLE crop ADD INDEX idx_crop_name (crop_name)',
    'SELECT ''索引idx_crop_name已存在'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS 
     WHERE TABLE_SCHEMA = 'smart_agriculture' 
       AND TABLE_NAME = 'crop' 
       AND INDEX_NAME = 'idx_crop_category') = 0,
    'ALTER TABLE crop ADD INDEX idx_crop_category (crop_category)',
    'SELECT ''索引idx_crop_category已存在'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS 
     WHERE TABLE_SCHEMA = 'smart_agriculture' 
       AND TABLE_NAME = 'crop' 
       AND INDEX_NAME = 'idx_crop_status') = 0
    AND (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = 'smart_agriculture' 
           AND TABLE_NAME = 'crop' 
           AND COLUMN_NAME = 'plant_status') > 0,
    'ALTER TABLE crop ADD INDEX idx_crop_status (plant_status)',
    'SELECT ''索引idx_crop_status已存在或字段不存在'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS 
     WHERE TABLE_SCHEMA = 'smart_agriculture' 
       AND TABLE_NAME = 'crop' 
       AND INDEX_NAME = 'idx_crop_sow_time') = 0,
    'ALTER TABLE crop ADD INDEX idx_crop_sow_time (sow_time)',
    'SELECT ''索引idx_crop_sow_time已存在'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 如果crop_name为空，使用crop_type作为默认值
UPDATE crop SET crop_name = crop_type WHERE crop_name IS NULL OR crop_name = '';

SELECT '迁移完成！' AS result;

