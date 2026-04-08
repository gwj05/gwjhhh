-- 创建数据库
CREATE DATABASE IF NOT EXISTS smart_agriculture DEFAULT CHARSET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 使用该数据库
USE smart_agriculture;

-- =============================================
-- 第一部分：基础核心表（7张，移除收获记录表）
-- =============================================

-- 1. 角色表：管理系统角色（超级管理员/农场管理员/普通农民）
CREATE TABLE IF NOT EXISTS role (
    role_id INT AUTO_INCREMENT COMMENT '角色编号（主键），自增',
    role_name VARCHAR(20) NOT NULL COMMENT '角色名称：超级管理员/农场管理员/普通农民',
    PRIMARY KEY (role_id) COMMENT '主键约束：角色编号唯一标识角色'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色表：系统权限角色管理，无冗余字段符合3NF';

-- 2. 用户表：管理系统用户，关联角色和农场（先不添加farm_id外键，避免循环依赖）
CREATE TABLE IF NOT EXISTS user (
    user_id INT AUTO_INCREMENT COMMENT '用户编号（主键），自增',
    role_id INT NOT NULL COMMENT '角色编号（外键），关联角色表role_id',
    username VARCHAR(30) NOT NULL UNIQUE COMMENT '用户名，唯一约束避免重复账号',
    password VARCHAR(64) NOT NULL COMMENT '密码（建议加密存储：MD5/SHA256）',
    real_name VARCHAR(20) NOT NULL COMMENT '用户真实姓名',
    phone VARCHAR(11) NOT NULL COMMENT '手机号，便于消息推送',
    farm_id INT COMMENT '农场编号（外键），关联农场表farm_id，允许为空（超级管理员无所属农场）',
    PRIMARY KEY (user_id) COMMENT '主键约束：用户编号唯一',
    -- 外键约束：关联角色表，禁止删除被引用的角色，角色编号更新时同步
    FOREIGN KEY (role_id) REFERENCES role(role_id) 
    ON DELETE RESTRICT 
    ON UPDATE CASCADE,
    -- 索引优化：提升按农场/角色查询用户的性能
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
    PRIMARY KEY (farm_id) COMMENT '主键约束：农场编号唯一',
    -- 外键约束：关联用户表，禁止删除农场负责人，用户编号更新时同步
    FOREIGN KEY (principal_id) REFERENCES user(user_id) 
    ON DELETE RESTRICT 
    ON UPDATE CASCADE,
    -- 索引优化：提升按负责人查询农场的性能
    INDEX idx_farm_principal (principal_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='农场表：农场基础信息管理，核心关联表';

-- 补充用户表farm_id外键约束（解决MySQL执行顺序依赖问题）
-- 注意：如果外键已存在，执行此语句会报错，可以忽略
ALTER TABLE user 
ADD CONSTRAINT fk_user_farm 
FOREIGN KEY (farm_id) REFERENCES farm(farm_id) 
ON DELETE SET NULL 
ON UPDATE CASCADE;

-- 4. 作物表：管理农场种植的作物信息
CREATE TABLE IF NOT EXISTS crop (
    crop_id INT AUTO_INCREMENT COMMENT '作物编号（主键），自增',
    farm_id INT NOT NULL COMMENT '农场编号（外键），关联农场表farm_id',
    crop_type VARCHAR(50) NOT NULL COMMENT '作物品种，如"番茄/黄瓜/小麦"',
    plant_area VARCHAR(100) NOT NULL COMMENT '种植区域，如"西北区/番茄种植区"',
    sow_time DATETIME NOT NULL COMMENT '播种时间，记录作物生长周期起点',
    PRIMARY KEY (crop_id) COMMENT '主键约束：作物编号唯一',
    -- 外键约束：关联农场表，农场删除时同步删除作物数据
    FOREIGN KEY (farm_id) REFERENCES farm(farm_id) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE,
    -- 索引优化：提升按农场/种植区域查询作物的性能
    INDEX idx_crop_farm (farm_id),
    INDEX idx_crop_area (plant_area)
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
    -- 外键约束：关联农场表，农场删除时同步删除农资数据
    FOREIGN KEY (farm_id) REFERENCES farm(farm_id) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE,
    -- 索引优化：提升按农场/类型查询农资的性能
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
    -- 外键约束：关联用户表，禁止删除有操作记录的用户
    FOREIGN KEY (user_id) REFERENCES user(user_id) 
    ON DELETE RESTRICT 
    ON UPDATE CASCADE,
    -- 外键约束：关联农场表，农场删除时同步删除操作记录
    FOREIGN KEY (farm_id) REFERENCES farm(farm_id) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE,
    -- 组合索引：高频查询场景（按农场+时间查操作记录）
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
    monitor_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '监测时间，默认当前时间',
    PRIMARY KEY (monitor_id) COMMENT '主键约束：监测编号唯一',
    -- 外键约束：关联农场表，农场删除时同步删除监测数据
    FOREIGN KEY (farm_id) REFERENCES farm(farm_id) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE,
    -- 组合索引：按农场+时间查询环境数据（高频场景）
    INDEX idx_monitor_farm_time (farm_id, monitor_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='环境监测表：农场环境数据采集，为作物异常检测提供依据';

-- =============================================
-- 第二部分：智能预警模块表（新增3张）
-- =============================================

-- 8. 监控设备表：管理农场视频监控设备信息
CREATE TABLE IF NOT EXISTS monitor_device (
    device_id INT AUTO_INCREMENT COMMENT '设备编号（主键），自增',
    farm_id INT NOT NULL COMMENT '农场编号（外键），关联农场表farm_id',
    device_name VARCHAR(50) NOT NULL COMMENT '设备名称，如"番茄区摄像头1"',
    install_location VARCHAR(100) NOT NULL COMMENT '安装位置，如"番茄种植区西北角"',
    device_status VARCHAR(20) NOT NULL COMMENT '设备状态：在线/离线/故障',
    monitor_area VARCHAR(100) NOT NULL COMMENT '监控覆盖区域，关联作物表plant_area',
    last_online_time DATETIME COMMENT '最后在线时间，用于判断设备是否正常',
    PRIMARY KEY (device_id) COMMENT '主键约束：设备编号唯一',
    -- 外键约束：关联农场表，农场删除时同步删除设备信息
    FOREIGN KEY (farm_id) REFERENCES farm(farm_id) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE,
    -- 索引优化：按农场/覆盖区域查询监控设备
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
    PRIMARY KEY (exception_id) COMMENT '主键约束：异常编号唯一',
    -- 外键约束：关联作物表，作物删除时同步删除异常记录
    FOREIGN KEY (crop_id) REFERENCES crop(crop_id) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE,
    -- 外键约束：关联监控设备表，设备删除时同步删除异常记录
    FOREIGN KEY (device_id) REFERENCES monitor_device(device_id) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE,
    -- 索引优化：按作物/处理状态查询异常记录
    INDEX idx_exception_crop (crop_id),
    INDEX idx_exception_status (handle_status)
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
    -- 外键约束：关联异常表，异常记录删除时同步删除推送记录
    FOREIGN KEY (exception_id) REFERENCES crop_exception(exception_id) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE,
    -- 外键约束：关联用户表，禁止删除被推送的用户
    FOREIGN KEY (receiver_id) REFERENCES user(user_id) 
    ON DELETE RESTRICT 
    ON UPDATE CASCADE,
    -- 索引优化：按异常/接收人/阅读状态查询推送记录
    INDEX idx_push_exception (exception_id),
    INDEX idx_push_receiver (receiver_id),
    INDEX idx_push_readstatus (read_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='异常提醒推送表：异常消息推送记录，实现消息触达用户';

-- =============================================
-- 初始化数据
-- =============================================

-- 插入角色数据（根据需求：1-管理员，2-运维人员，3-普通用户）
INSERT INTO role (role_id, role_name) VALUES
(1, '管理员'),
(2, '运维人员'),
(3, '普通用户')
ON DUPLICATE KEY UPDATE role_name = VALUES(role_name);

-- 插入测试用户（密码都是123456，使用bcrypt加密）
-- 注意：实际使用时需要先创建农场才能创建关联农场的用户
-- 这里先创建管理员用户（不关联农场）
-- 密码123456的bcrypt hash: $2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy
INSERT INTO user (user_id, role_id, username, password, real_name, phone, farm_id) VALUES
(1, 1, 'admin', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', '系统管理员', '13800138000', NULL),
(2, 2, 'operator', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', '运维人员', '13800138001', NULL),
(3, 3, 'user', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', '普通用户', '13800138002', NULL)
ON DUPLICATE KEY UPDATE username = VALUES(username);

