-- =============================================
-- 农场表扩展字段迁移
-- 目标：增强农场管理和种植区域统计能力
-- =============================================

USE smart_agriculture;

SET @sql = (
  SELECT IF(
    EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'farm' AND COLUMN_NAME = 'farm_code'
    ),
    'SELECT 1',
    'ALTER TABLE farm ADD COLUMN farm_code VARCHAR(32) COMMENT ''农场编码（业务唯一）'' AFTER farm_name'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'farm' AND COLUMN_NAME = 'farm_level'
    ),
    'SELECT 1',
    'ALTER TABLE farm ADD COLUMN farm_level VARCHAR(20) DEFAULT ''standard'' COMMENT ''农场等级：standard/demo/organic'' AFTER phone'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'farm' AND COLUMN_NAME = 'total_area'
    ),
    'SELECT 1',
    'ALTER TABLE farm ADD COLUMN total_area DECIMAL(12,2) DEFAULT 0 COMMENT ''农场总面积（亩）'' AFTER latitude'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'farm' AND COLUMN_NAME = 'region_count'
    ),
    'SELECT 1',
    'ALTER TABLE farm ADD COLUMN region_count INT DEFAULT 0 COMMENT ''种植区域数量（缓存）'' AFTER total_area'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'farm' AND COLUMN_NAME = 'active_crop_count'
    ),
    'SELECT 1',
    'ALTER TABLE farm ADD COLUMN active_crop_count INT DEFAULT 0 COMMENT ''在种作物数量（缓存）'' AFTER region_count'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'farm' AND COLUMN_NAME = 'irrigation_mode'
    ),
    'SELECT 1',
    'ALTER TABLE farm ADD COLUMN irrigation_mode VARCHAR(30) DEFAULT ''auto_manual'' COMMENT ''灌溉模式'' AFTER active_crop_count'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'farm' AND COLUMN_NAME = 'soil_quality_level'
    ),
    'SELECT 1',
    'ALTER TABLE farm ADD COLUMN soil_quality_level VARCHAR(20) DEFAULT ''B'' COMMENT ''土壤等级：A/B/C'' AFTER irrigation_mode'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'farm' AND COLUMN_NAME = 'remark'
    ),
    'SELECT 1',
    'ALTER TABLE farm ADD COLUMN remark VARCHAR(255) DEFAULT NULL COMMENT ''备注信息'' AFTER soil_quality_level'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'farm' AND INDEX_NAME = 'idx_farm_code'
    ),
    'SELECT 1',
    'CREATE INDEX idx_farm_code ON farm (farm_code)'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'farm' AND INDEX_NAME = 'idx_farm_level'
    ),
    'SELECT 1',
    'CREATE INDEX idx_farm_level ON farm (farm_level)'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 数据兼容处理
UPDATE farm SET farm_level = 'standard' WHERE farm_level IS NULL OR farm_level = '';
UPDATE farm SET irrigation_mode = 'auto_manual' WHERE irrigation_mode IS NULL OR irrigation_mode = '';
UPDATE farm SET soil_quality_level = 'B' WHERE soil_quality_level IS NULL OR soil_quality_level = '';
UPDATE farm SET total_area = 0 WHERE total_area IS NULL;
UPDATE farm SET region_count = 0 WHERE region_count IS NULL;
UPDATE farm SET active_crop_count = 0 WHERE active_crop_count IS NULL;

-- 统计回填（基于当前数据）
UPDATE farm f
LEFT JOIN (
  SELECT farm_id, COUNT(*) AS cnt
  FROM planting_area
  GROUP BY farm_id
) t ON f.farm_id = t.farm_id
SET f.region_count = IFNULL(t.cnt, 0);

UPDATE farm f
LEFT JOIN (
  SELECT farm_id, COUNT(*) AS cnt
  FROM crop
  WHERE COALESCE(plant_status, '生长中') <> '已收割'
  GROUP BY farm_id
) t ON f.farm_id = t.farm_id
SET f.active_crop_count = IFNULL(t.cnt, 0);

-- 验证
SELECT COLUMN_NAME, DATA_TYPE, COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'farm'
  AND COLUMN_NAME IN (
    'farm_code', 'farm_level', 'total_area',
    'region_count', 'active_crop_count',
    'irrigation_mode', 'soil_quality_level', 'remark'
  )
ORDER BY ORDINAL_POSITION;
