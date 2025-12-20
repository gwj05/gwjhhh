-- 验证作物表迁移是否成功
-- 执行此脚本检查所有字段是否已正确添加

USE smart_agriculture;

-- 1. 查看完整的表结构
SELECT '=== 完整的crop表结构 ===' AS info;
DESCRIBE crop;

-- 2. 检查新增字段是否存在
SELECT '=== 新增字段检查 ===' AS info;
SELECT 
    COLUMN_NAME AS '字段名',
    DATA_TYPE AS '数据类型',
    IS_NULLABLE AS '可空',
    COLUMN_DEFAULT AS '默认值',
    COLUMN_COMMENT AS '注释'
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = 'smart_agriculture' 
  AND TABLE_NAME = 'crop'
  AND COLUMN_NAME IN (
    'crop_name',           -- 作物名称
    'crop_category',        -- 作物类型
    'growth_cycle',         -- 生长周期
    'suitable_temp_min',   -- 适宜温度下限
    'suitable_temp_max',   -- 适宜温度上限
    'suitable_humidity_min', -- 适宜湿度下限
    'suitable_humidity_max', -- 适宜湿度上限
    'suitable_ph_min',     -- 适宜pH下限
    'suitable_ph_max',     -- 适宜pH上限
    'plant_status',        -- 种植状态
    'created_at',          -- 创建时间
    'updated_at'           -- 更新时间
  )
ORDER BY ORDINAL_POSITION;

-- 3. 检查索引是否创建成功
SELECT '=== 索引检查 ===' AS info;
SELECT 
    INDEX_NAME AS '索引名',
    COLUMN_NAME AS '字段名',
    NON_UNIQUE AS '非唯一'
FROM INFORMATION_SCHEMA.STATISTICS 
WHERE TABLE_SCHEMA = 'smart_agriculture' 
  AND TABLE_NAME = 'crop'
  AND INDEX_NAME IN (
    'idx_crop_name',
    'idx_crop_category',
    'idx_crop_status',
    'idx_crop_sow_time'
  )
ORDER BY INDEX_NAME, SEQ_IN_INDEX;

-- 4. 检查现有数据
SELECT '=== 现有数据检查 ===' AS info;
SELECT 
    crop_id,
    crop_name,
    crop_type,
    crop_category,
    plant_status,
    farm_id
FROM crop
LIMIT 5;

-- 5. 统计信息
SELECT '=== 统计信息 ===' AS info;
SELECT 
    COUNT(*) AS '总记录数',
    COUNT(crop_name) AS '有作物名称的记录数',
    COUNT(plant_status) AS '有种植状态的记录数',
    COUNT(created_at) AS '有创建时间的记录数'
FROM crop;

SELECT '✅ 验证完成！如果所有字段都存在，迁移已成功。' AS result;

