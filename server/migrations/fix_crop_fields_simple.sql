-- 简单修复脚本：补充缺失的字段
-- 在MySQL命令行中执行此脚本

USE smart_agriculture;

-- 1. 添加 plant_status 字段（如果不存在）
-- 先添加字段，再设置默认值
ALTER TABLE crop 
ADD COLUMN plant_status VARCHAR(20) COMMENT '种植状态：生长中/成熟/已收割' AFTER suitable_ph_max;

-- 设置现有记录的默认值
UPDATE crop SET plant_status = '生长中' WHERE plant_status IS NULL;

-- 修改字段添加默认值约束
ALTER TABLE crop 
MODIFY COLUMN plant_status VARCHAR(20) DEFAULT '生长中' COMMENT '种植状态：生长中/成熟/已收割';

-- 2. 添加 created_at 字段（如果不存在）
ALTER TABLE crop 
ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间' AFTER plant_status;

-- 3. 添加 updated_at 字段（如果不存在）
ALTER TABLE crop 
ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间' AFTER created_at;

-- 4. 添加 plant_status 索引（如果字段存在但索引不存在）
ALTER TABLE crop ADD INDEX idx_crop_status (plant_status);

-- 验证
SELECT '修复完成！' AS result;
SELECT COLUMN_NAME, DATA_TYPE, COLUMN_DEFAULT, COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = 'smart_agriculture' 
  AND TABLE_NAME = 'crop'
  AND COLUMN_NAME IN ('plant_status', 'created_at', 'updated_at')
ORDER BY ORDINAL_POSITION;

