-- 作物管理模块数据库字段扩展
-- 执行前请确保已创建 smart_agriculture 数据库

USE smart_agriculture;

-- 扩展作物表，添加作物管理所需字段
-- 注意：如果字段已存在，执行会报错，请手动处理或确保在空表上执行

ALTER TABLE crop 
ADD COLUMN crop_name VARCHAR(50) COMMENT '作物名称（必填）' AFTER crop_id;
ALTER TABLE crop 
ADD COLUMN crop_category VARCHAR(20) COMMENT '作物类型：果蔬/粮食/经济作物' AFTER crop_type;

ALTER TABLE crop 
ADD COLUMN growth_cycle INT COMMENT '生长周期（天数）' AFTER sow_time;

ALTER TABLE crop 
ADD COLUMN suitable_temp_min DECIMAL(5,2) COMMENT '适宜温度下限（℃）' AFTER growth_cycle;

ALTER TABLE crop 
ADD COLUMN suitable_temp_max DECIMAL(5,2) COMMENT '适宜温度上限（℃）' AFTER suitable_temp_min;

ALTER TABLE crop 
ADD COLUMN suitable_humidity_min DECIMAL(5,2) COMMENT '适宜湿度下限（%）' AFTER suitable_temp_max;

ALTER TABLE crop 
ADD COLUMN suitable_humidity_max DECIMAL(5,2) COMMENT '适宜湿度上限（%）' AFTER suitable_humidity_min;

ALTER TABLE crop 
ADD COLUMN suitable_ph_min DECIMAL(3,1) COMMENT '适宜pH下限' AFTER suitable_humidity_max;

ALTER TABLE crop 
ADD COLUMN suitable_ph_max DECIMAL(3,1) COMMENT '适宜pH上限' AFTER suitable_ph_min;

ALTER TABLE crop 
ADD COLUMN plant_status VARCHAR(20) DEFAULT '生长中' COMMENT '种植状态：生长中/成熟/已收割' AFTER suitable_ph_max;

ALTER TABLE crop 
ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间' AFTER plant_status;

ALTER TABLE crop 
ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间' AFTER created_at;

-- 添加索引优化查询性能（如果索引已存在会报错，可忽略）
ALTER TABLE crop ADD INDEX idx_crop_name (crop_name);
ALTER TABLE crop ADD INDEX idx_crop_category (crop_category);
ALTER TABLE crop ADD INDEX idx_crop_status (plant_status);
ALTER TABLE crop ADD INDEX idx_crop_sow_time (sow_time);

-- 如果crop_name为空，使用crop_type作为默认值
UPDATE crop SET crop_name = crop_type WHERE crop_name IS NULL OR crop_name = '';

