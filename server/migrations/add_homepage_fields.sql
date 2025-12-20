-- =============================================
-- 数据库迁移脚本：首页模块字段补充
-- =============================================

USE smart_agriculture;

-- 1. 气象站模块：为environment_monitor表添加字段
-- 注意：如果字段已存在会报错，可以忽略
ALTER TABLE environment_monitor 
ADD COLUMN weather_type VARCHAR(20) COMMENT '天气类型：晴/阴/雨';

ALTER TABLE environment_monitor 
ADD COLUMN wind_speed DECIMAL(5,2) COMMENT '风速（单位 m/s）';

ALTER TABLE environment_monitor 
ADD COLUMN rainfall DECIMAL(5,2) COMMENT '降雨量（单位 mm）';

-- 2. 设备统计模块：为monitor_device表添加字段
ALTER TABLE monitor_device 
ADD COLUMN device_category VARCHAR(30) COMMENT '设备大类：传感器/控制器/摄像头';

ALTER TABLE monitor_device 
ADD COLUMN last_online_time DATETIME COMMENT '设备最后在线时间';

-- 3. 预警消息模块：为crop_exception表添加字段
ALTER TABLE crop_exception 
ADD COLUMN warning_level TINYINT DEFAULT 2 COMMENT '预警等级：1=紧急/2=普通/3=提示';

ALTER TABLE crop_exception 
ADD COLUMN scroll_sort INT DEFAULT 0 COMMENT '排序值（控制滑动展示顺序）';

-- 4. 创建预警已读记录表
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
    -- 唯一约束：同一用户对同一预警只能有一条已读记录
    UNIQUE KEY uk_warning_user (warning_id, user_id),
    INDEX idx_warning_read_user (user_id),
    INDEX idx_warning_read_time (read_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='预警已读记录表：记录用户已读预警信息';

-- 5. 创建通用视频设备表
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

-- 6. 地图概览模块：为farm表添加经纬度字段
ALTER TABLE farm 
ADD COLUMN longitude DECIMAL(10,6) COMMENT '农场经度';

ALTER TABLE farm 
ADD COLUMN latitude DECIMAL(10,6) COMMENT '农场纬度';

-- 7. 更新crop_exception表的索引（优化预警列表查询）
-- 注意：如果索引已存在会报错，可以忽略
CREATE INDEX idx_warning_sort_time ON crop_exception (scroll_sort DESC, exception_time DESC);
CREATE INDEX idx_warning_level ON crop_exception (warning_level);

