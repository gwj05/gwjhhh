-- =============================================
-- 第一部分：数据库初始化
-- =============================================
-- 创建数据库
CREATE DATABASE IF NOT EXISTS smart_agriculture DEFAULT CHARSET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 使用该数据库
USE smart_agriculture;
CREATE TABLE IF NOT EXISTS role (
    role_id INT AUTO_INCREMENT COMMENT '角色编号（主键），自增',
    role_name VARCHAR(20) NOT NULL COMMENT '角色名称：超级管理员/农场管理员/普通农民',
    PRIMARY KEY (role_id) COMMENT '主键约束：角色编号唯一标识角色'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色表：系统权限角色管理，无冗余字段符合3NF';

-- 2. 用户表：管理系统用户，关联角色和农场
CREATE TABLE IF NOT EXISTS user (
    user_id INT AUTO_INCREMENT COMMENT '用户编号（主键），自增',
    role_id INT NOT NULL COMMENT '角色编号（外键），关联角色表role_id',
    username VARCHAR(30) NOT NULL UNIQUE COMMENT '用户名，唯一约束避免重复账号',
    password VARCHAR(64) NOT NULL COMMENT '密码（建议加密存储：MD5/SHA256）',
    real_name VARCHAR(20) NOT NULL COMMENT '用户真实姓名',
    phone VARCHAR(11) NOT NULL COMMENT '手机号，便于消息推送',
    farm_id INT COMMENT '农场编号（外键），关联农场表farm_id，允许为空（超级管理员无所属农场）',
    PRIMARY KEY (user_id) COMMENT '主键约束：用户编号唯一',
    FOREIGN KEY (role_id) REFERENCES role(role_id) 
    ON DELETE RESTRICT 
    ON UPDATE CASCADE,
    INDEX idx_user_farm (farm_id),
    INDEX idx_user_role (role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表：系统用户信息管理，非主键字段仅依赖主键符合3NF';

-- 3. 农场表：核心表，管理农场基础信息
CREATE TABLE IF NOT EXISTS farm (
    farm_id INT AUTO_INCREMENT COMMENT '农场编号（主键），自增',
    farm_name VARCHAR(50) NOT NULL COMMENT '农场名称，如"XX生态农场"',
    farm_code VARCHAR(32) COMMENT '农场编码（业务唯一）',
    address VARCHAR(100) NOT NULL COMMENT '农场详细地址，如"XX市XX区XX村"',
    principal_id INT NOT NULL COMMENT '负责人编号（外键），关联用户表user_id',
    phone VARCHAR(11) NOT NULL COMMENT '农场联系电话',
    farm_level VARCHAR(20) DEFAULT 'standard' COMMENT '农场等级：standard/demo/organic',
    longitude DECIMAL(10,6) COMMENT '农场经度',
    latitude DECIMAL(10,6) COMMENT '农场纬度',
    total_area DECIMAL(12,2) DEFAULT 0 COMMENT '农场总面积（亩）',
    region_count INT DEFAULT 0 COMMENT '种植区域数量（缓存）',
    active_crop_count INT DEFAULT 0 COMMENT '在种作物数量（缓存）',
    irrigation_mode VARCHAR(30) DEFAULT 'auto_manual' COMMENT '灌溉模式',
    soil_quality_level VARCHAR(20) DEFAULT 'B' COMMENT '土壤等级：A/B/C',
    remark VARCHAR(255) DEFAULT NULL COMMENT '备注信息',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (farm_id) COMMENT '主键约束：农场编号唯一',
    FOREIGN KEY (principal_id) REFERENCES user(user_id) 
    ON DELETE RESTRICT 
    ON UPDATE CASCADE,
    INDEX idx_farm_principal (principal_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='农场表：农场基础信息管理，核心关联表';

-- 补充用户表farm_id外键约束
ALTER TABLE user 
ADD CONSTRAINT fk_user_farm 
FOREIGN KEY (farm_id) REFERENCES farm(farm_id) 
ON DELETE SET NULL 
ON UPDATE CASCADE;

-- 4. 作物表：管理农场种植的作物信息
CREATE TABLE IF NOT EXISTS crop (
    crop_id INT AUTO_INCREMENT COMMENT '作物编号（主键），自增',
    crop_name VARCHAR(50) COMMENT '作物名称（必填）',
    farm_id INT NOT NULL COMMENT '农场编号（外键），关联农场表farm_id',
    crop_type VARCHAR(50) NOT NULL COMMENT '作物品种，如"番茄/黄瓜/小麦"',
    crop_category VARCHAR(20) COMMENT '作物类型：果蔬/粮食/经济作物',
    plant_area VARCHAR(100) NOT NULL COMMENT '种植区域，如"西北区/番茄种植区"',
    sow_time DATETIME NOT NULL COMMENT '播种时间，记录作物生长周期起点',
    growth_cycle INT COMMENT '生长周期（天数）',
    suitable_temp_min DECIMAL(5,2) COMMENT '适宜温度下限（℃）',
    suitable_temp_max DECIMAL(5,2) COMMENT '适宜温度上限（℃）',
    suitable_humidity_min DECIMAL(5,2) COMMENT '适宜湿度下限（%）',
    suitable_humidity_max DECIMAL(5,2) COMMENT '适宜湿度上限（%）',
    suitable_ph_min DECIMAL(3,1) COMMENT '适宜pH下限',
    suitable_ph_max DECIMAL(3,1) COMMENT '适宜pH上限',
    plant_status VARCHAR(20) DEFAULT '生长中' COMMENT '种植状态：生长中/成熟/已收割',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (crop_id) COMMENT '主键约束：作物编号唯一',
    FOREIGN KEY (farm_id) REFERENCES farm(farm_id) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE,
    INDEX idx_crop_farm (farm_id),
    INDEX idx_crop_area (plant_area),
    INDEX idx_crop_name (crop_name),
    INDEX idx_crop_category (crop_category),
    INDEX idx_crop_status (plant_status),
    INDEX idx_crop_sow_time (sow_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='作物表：作物种植信息管理，仅依赖主键符合3NF';

-- 5. 农资表：管理农场的肥料/种子/农药等农资
CREATE TABLE IF NOT EXISTS agricultural_material (
    material_id INT AUTO_INCREMENT COMMENT '农资编号（主键），自增',
    farm_id INT NOT NULL COMMENT '农场编号（外键），关联农场表farm_id',
    material_name VARCHAR(50) NOT NULL COMMENT '农资名称，如"复合肥/番茄种子"',
    material_type VARCHAR(20) NOT NULL COMMENT '农资类型：肥料/种子/农药',
    price DECIMAL(10,2) NOT NULL COMMENT '农资单价（元），保留2位小数符合金额规范',
    stock_num INT NOT NULL DEFAULT 0 COMMENT '库存数量，默认0，施肥/采购时更新',
    PRIMARY KEY (material_id) COMMENT '主键约束：农资编号唯一',
    FOREIGN KEY (farm_id) REFERENCES farm(farm_id) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE,
    INDEX idx_material_farm (farm_id),
    INDEX idx_material_type (material_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='农资表：农资库存与基础信息管理，无传递依赖符合3NF';

-- 6. 农业操作记录表：记录采购/施肥/灌溉等农事操作
CREATE TABLE IF NOT EXISTS operation_record (
    record_id INT AUTO_INCREMENT COMMENT '操作记录编号（主键），自增',
    user_id INT NOT NULL COMMENT '用户编号（外键），关联用户表user_id（操作人）',
    farm_id INT NOT NULL COMMENT '农场编号（外键），关联农场表farm_id',
    operation_type VARCHAR(20) NOT NULL COMMENT '操作类型：采购/施肥/灌溉',
    operation_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间，默认当前时间',
    relate_id INT COMMENT '关联编号：作物编号/农资编号（区分操作对象）',
    operation_detail TEXT COMMENT '操作详情，如"给番茄区施肥2袋复合肥"',
    PRIMARY KEY (record_id) COMMENT '主键约束：操作记录编号唯一',
    FOREIGN KEY (user_id) REFERENCES user(user_id) 
    ON DELETE RESTRICT 
    ON UPDATE CASCADE,
    FOREIGN KEY (farm_id) REFERENCES farm(farm_id) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE,
    INDEX idx_operation_farm_time (farm_id, operation_time),
    INDEX idx_operation_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='农业操作记录表：农事操作全程追溯，支持操作溯源';

-- 7. 环境监测表：记录农场环境数据（温度/湿度/土壤酸碱度）
CREATE TABLE IF NOT EXISTS environment_monitor (
    monitor_id INT AUTO_INCREMENT COMMENT '监测编号（主键），自增',
    farm_id INT NOT NULL COMMENT '农场编号（外键），关联农场表farm_id',
    temperature DECIMAL(5,2) COMMENT '温度（℃），如25.5℃',
    humidity DECIMAL(5,2) COMMENT '湿度（%），如60.0%',
    soil_ph DECIMAL(3,1) COMMENT '土壤酸碱度（pH值），如6.5',
    weather_type VARCHAR(20) COMMENT '天气类型：晴/阴/雨',
    wind_speed DECIMAL(5,2) COMMENT '风速（单位 m/s）',
    rainfall DECIMAL(5,2) COMMENT '降雨量（单位 mm）',
    monitor_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '监测时间，默认当前时间',
    PRIMARY KEY (monitor_id) COMMENT '主键约束：监测编号唯一',
    FOREIGN KEY (farm_id) REFERENCES farm(farm_id) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE,
    INDEX idx_monitor_farm_time (farm_id, monitor_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='环境监测表：农场环境数据采集，为作物异常检测提供依据';

-- =============================================
-- 第三部分：智能预警模块表（3张）
-- =============================================
-- 8. 监控设备表：管理农场视频监控设备信息
CREATE TABLE IF NOT EXISTS monitor_device (
    device_id INT AUTO_INCREMENT COMMENT '设备编号（主键），自增',
    farm_id INT NOT NULL COMMENT '农场编号（外键），关联农场表farm_id',
    device_name VARCHAR(50) NOT NULL COMMENT '设备名称，如"番茄区摄像头1"',
    device_category VARCHAR(30) COMMENT '设备大类：传感器/控制器/摄像头',
    install_location VARCHAR(100) NOT NULL COMMENT '安装位置，如"番茄种植区西北角"',
    device_status VARCHAR(20) NOT NULL COMMENT '设备状态：在线/离线/故障',
    monitor_area VARCHAR(100) NOT NULL COMMENT '监控覆盖区域，关联作物表plant_area',
    last_online_time DATETIME COMMENT '最后在线时间，用于判断设备是否正常',
    PRIMARY KEY (device_id) COMMENT '主键约束：设备编号唯一',
    FOREIGN KEY (farm_id) REFERENCES farm(farm_id) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE,
    INDEX idx_device_farm (farm_id),
    INDEX idx_device_area (monitor_area)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='监控设备表：视频监控设备管理，绑定农场和种植区域';

-- 9. 作物异常记录表：记录作物异常信息，关联监控设备
CREATE TABLE IF NOT EXISTS crop_exception (
    exception_id INT AUTO_INCREMENT COMMENT '异常编号（主键），自增',
    crop_id INT NOT NULL COMMENT '作物编号（外键），关联作物表crop_id',
    device_id INT NOT NULL COMMENT '设备编号（外键），关联监控设备表device_id',
    exception_type VARCHAR(50) NOT NULL COMMENT '异常类型：病虫害/缺水/倒伏/温度异常',
    exception_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '异常检测时间',
    exception_detail TEXT COMMENT '异常详情，如"番茄叶片出现蚜虫，覆盖率约10%"',
    video_url VARCHAR(255) COMMENT '监控视频链接，存储异常时段视频地址',
    handle_status VARCHAR(20) NOT NULL DEFAULT '未处理' COMMENT '处理状态：未处理/已处理/已忽略',
    warning_level TINYINT DEFAULT 2 COMMENT '预警等级：1=紧急/2=普通/3=提示',
    scroll_sort INT DEFAULT 0 COMMENT '排序值（控制滑动展示顺序）',
    PRIMARY KEY (exception_id) COMMENT '主键约束：异常编号唯一',
    FOREIGN KEY (crop_id) REFERENCES crop(crop_id) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE,
    FOREIGN KEY (device_id) REFERENCES monitor_device(device_id) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE,
    INDEX idx_exception_crop (crop_id),
    INDEX idx_exception_status (handle_status),
    INDEX idx_warning_sort_time (scroll_sort DESC, exception_time DESC),
    INDEX idx_warning_level (warning_level)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='作物异常记录表：作物异常检测记录，关联监控设备，无冗余符合3NF';

-- 10. 异常提醒推送表：记录异常消息推送信息，触达用户
CREATE TABLE IF NOT EXISTS exception_push (
    push_id INT AUTO_INCREMENT COMMENT '推送编号（主键），自增',
    exception_id INT NOT NULL COMMENT '异常编号（外键），关联作物异常表exception_id',
    receiver_id INT NOT NULL COMMENT '接收人编号（外键），关联用户表user_id',
    push_method VARCHAR(20) NOT NULL COMMENT '推送方式：短信/站内信/APP推送',
    push_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '推送时间，默认当前时间',
    read_status VARCHAR(20) NOT NULL DEFAULT '未读' COMMENT '阅读状态：未读/已读',
    PRIMARY KEY (push_id) COMMENT '主键约束：推送编号唯一',
    FOREIGN KEY (exception_id) REFERENCES crop_exception(exception_id) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES user(user_id) 
    ON DELETE RESTRICT 
    ON UPDATE CASCADE,
    INDEX idx_push_exception (exception_id),
    INDEX idx_push_receiver (receiver_id),
    INDEX idx_push_readstatus (read_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='异常提醒推送表：异常消息推送记录，实现消息触达用户';

-- =============================================
-- 第四部分：负责人管理模块表（3张）
-- =============================================

-- 11. 农场负责人绑定表：支持多负责人（主/副）
CREATE TABLE IF NOT EXISTS farm_principal (
    binding_id INT AUTO_INCREMENT COMMENT '绑定编号（主键），自增',
    farm_id INT NOT NULL COMMENT '农场编号（外键），关联农场表farm_id',
    user_id INT NOT NULL COMMENT '用户编号（外键），关联用户表user_id',
    principal_type VARCHAR(10) NOT NULL DEFAULT '主' COMMENT '负责人类型：主/副',
    bind_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '绑定时间',
    bind_by INT COMMENT '绑定操作人（外键），关联用户表user_id',
    PRIMARY KEY (binding_id) COMMENT '主键约束：绑定编号唯一',
    FOREIGN KEY (farm_id) REFERENCES farm(farm_id) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE,
    FOREIGN KEY (user_id) REFERENCES user(user_id) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE,
    FOREIGN KEY (bind_by) REFERENCES user(user_id) 
    ON DELETE SET NULL 
    ON UPDATE CASCADE,
    UNIQUE KEY uk_farm_user (farm_id, user_id),
    INDEX idx_farm_principal_farm (farm_id),
    INDEX idx_farm_principal_user (user_id),
    INDEX idx_farm_principal_type (principal_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='农场负责人绑定表：管理农场与负责人的多对多关系';

-- 12. 负责人权限配置表：存储负责人的模块权限和操作权限
CREATE TABLE IF NOT EXISTS principal_permission (
    permission_id INT AUTO_INCREMENT COMMENT '权限编号（主键），自增',
    binding_id INT NOT NULL COMMENT '绑定编号（外键），关联farm_principal表binding_id',
    view_modules JSON COMMENT '可查看的模块列表（JSON格式，如 ["crop", "device", "warning", "environment"]）',
    operation_permissions JSON COMMENT '操作权限配置（JSON格式，如 {"crop": "view", "device": "edit", "warning": "delete"}）',
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    update_by INT COMMENT '更新操作人（外键），关联用户表user_id',
    PRIMARY KEY (permission_id) COMMENT '主键约束：权限编号唯一',
    FOREIGN KEY (binding_id) REFERENCES farm_principal(binding_id) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE,
    FOREIGN KEY (update_by) REFERENCES user(user_id) 
    ON DELETE SET NULL 
    ON UPDATE CASCADE,
    UNIQUE KEY uk_binding_permission (binding_id),
    INDEX idx_permission_binding (binding_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='负责人权限配置表：存储负责人的模块和操作权限';

-- 13. 负责人操作日志表：记录绑定/解绑/改权限等操作
CREATE TABLE IF NOT EXISTS principal_operation_log (
    log_id INT AUTO_INCREMENT COMMENT '日志编号（主键），自增',
    farm_id INT NOT NULL COMMENT '农场编号（外键），关联农场表farm_id',
    user_id INT COMMENT '被操作的负责人用户编号（外键），关联用户表user_id',
    operation_type VARCHAR(20) NOT NULL COMMENT '操作类型：绑定/解绑/改权限',
    operation_content TEXT COMMENT '操作内容详情',
    operation_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',
    operator_id INT NOT NULL COMMENT '操作人编号（外键），关联用户表user_id',
    PRIMARY KEY (log_id) COMMENT '主键约束：日志编号唯一',
    FOREIGN KEY (farm_id) REFERENCES farm(farm_id) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE,
    FOREIGN KEY (user_id) REFERENCES user(user_id) 
    ON DELETE SET NULL 
    ON UPDATE CASCADE,
    FOREIGN KEY (operator_id) REFERENCES user(user_id) 
    ON DELETE RESTRICT 
    ON UPDATE CASCADE,
    INDEX idx_log_farm (farm_id),
    INDEX idx_log_type (operation_type),
    INDEX idx_log_time (operation_time),
    INDEX idx_log_operator (operator_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='负责人操作日志表：记录所有负责人相关操作，支持追溯';

-- =============================================
-- 第五部分：首页模块扩展表（2张）
-- =============================================

-- 14. 预警已读记录表：记录用户已读预警信息
CREATE TABLE IF NOT EXISTS warning_read (
    id INT AUTO_INCREMENT COMMENT '主键',
    warning_id INT NOT NULL COMMENT '预警编号（外键），关联crop_exception.exception_id',
    user_id INT NOT NULL COMMENT '用户编号（外键），关联user.user_id',
    read_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '阅读时间',
    PRIMARY KEY (id) COMMENT '主键约束',
    FOREIGN KEY (warning_id) REFERENCES crop_exception(exception_id) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE,
    FOREIGN KEY (user_id) REFERENCES user(user_id) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE,
    UNIQUE KEY uk_warning_user (warning_id, user_id),
    INDEX idx_warning_read_user (user_id),
    INDEX idx_warning_read_time (read_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='预警已读记录表：记录用户已读预警信息';

-- 15. 通用视频设备表：存储视频推流地址和状态
CREATE TABLE IF NOT EXISTS video_device (
    id INT AUTO_INCREMENT COMMENT '主键',
    device_id INT NOT NULL COMMENT '设备编号（外键），关联monitor_device.device_id',
    video_url VARCHAR(500) NOT NULL COMMENT '视频推流地址',
    video_status TINYINT NOT NULL DEFAULT 1 COMMENT '视频状态：1=正常/2=无信号',
    farm_id INT NOT NULL COMMENT '农场编号（外键），关联farm.farm_id',
    PRIMARY KEY (id) COMMENT '主键约束',
    FOREIGN KEY (device_id) REFERENCES monitor_device(device_id) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE,
    FOREIGN KEY (farm_id) REFERENCES farm(farm_id) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE,
    INDEX idx_video_device (device_id),
    INDEX idx_video_farm (farm_id),
    INDEX idx_video_status (video_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='通用视频设备表：存储视频推流地址和状态';

-- =============================================
-- 第六部分：初始化数据
-- =============================================

-- 插入角色数据（根据需求：1-管理员，2-运维人员，3-普通用户）
INSERT INTO role (role_id, role_name) VALUES
(1, '管理员'),
(2, '运维人员'),
(3, '普通用户')
ON DUPLICATE KEY UPDATE role_name = VALUES(role_name);

-- 插入测试用户（密码都是123456，使用bcrypt加密）
-- 密码123456的bcrypt hash: $2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy
INSERT INTO user (user_id, role_id, username, password, real_name, phone, farm_id) VALUES
(1, 1, 'admin', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', '系统管理员', '13800138000', NULL),
(2, 2, 'operator', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', '运维人员', '13800138001', NULL),
(3, 3, 'user', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', '普通用户', '13800138002', NULL)
ON DUPLICATE KEY UPDATE username = VALUES(username);

-- 如果crop_name为空，使用crop_type作为默认值
UPDATE crop SET crop_name = crop_type WHERE crop_name IS NULL OR crop_name = '';

-- =============================================
-- 第七部分：数据验证查询
-- =============================================

-- 验证所有表是否创建成功
SELECT '数据库初始化完成！' AS result;
SELECT TABLE_NAME, TABLE_COMMENT 
FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_SCHEMA = 'smart_agriculture' 
ORDER BY TABLE_NAME;

-- 验证作物表字段
SELECT COLUMN_NAME, DATA_TYPE, COLUMN_DEFAULT, COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = 'smart_agriculture' 
  AND TABLE_NAME = 'crop'
  AND COLUMN_NAME IN ('crop_name', 'crop_category', 'growth_cycle', 
                      'suitable_temp_min', 'suitable_temp_max',
                      'suitable_humidity_min', 'suitable_humidity_max',
                      'suitable_ph_min', 'suitable_ph_max',
                      'plant_status', 'created_at', 'updated_at')
ORDER BY ORDINAL_POSITION;

-- 验证负责人管理表
SELECT TABLE_NAME 
FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_SCHEMA = 'smart_agriculture' 
  AND TABLE_NAME IN ('farm_principal', 'principal_permission', 'principal_operation_log');

