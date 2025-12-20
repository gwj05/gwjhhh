-- 负责人管理模块数据库表
-- 执行前请确保已创建 smart_agriculture 数据库

USE smart_agriculture;

-- 1. 农场负责人绑定表：支持多负责人（主/副）
CREATE TABLE IF NOT EXISTS farm_principal (
    binding_id INT AUTO_INCREMENT COMMENT '绑定编号（主键），自增',
    farm_id INT NOT NULL COMMENT '农场编号（外键），关联农场表farm_id',
    user_id INT NOT NULL COMMENT '用户编号（外键），关联用户表user_id',
    principal_type VARCHAR(10) NOT NULL DEFAULT '主' COMMENT '负责人类型：主/副',
    bind_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '绑定时间',
    bind_by INT COMMENT '绑定操作人（外键），关联用户表user_id',
    PRIMARY KEY (binding_id) COMMENT '主键约束：绑定编号唯一',
    -- 外键约束
    FOREIGN KEY (farm_id) REFERENCES farm(farm_id) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE,
    FOREIGN KEY (user_id) REFERENCES user(user_id) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE,
    FOREIGN KEY (bind_by) REFERENCES user(user_id) 
    ON DELETE SET NULL 
    ON UPDATE CASCADE,
    -- 唯一约束：同一农场同一用户只能绑定一次
    UNIQUE KEY uk_farm_user (farm_id, user_id),
    -- 索引优化
    INDEX idx_farm_principal_farm (farm_id),
    INDEX idx_farm_principal_user (user_id),
    INDEX idx_farm_principal_type (principal_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='农场负责人绑定表：管理农场与负责人的多对多关系';

-- 2. 负责人权限配置表：存储负责人的模块权限和操作权限
CREATE TABLE IF NOT EXISTS principal_permission (
    permission_id INT AUTO_INCREMENT COMMENT '权限编号（主键），自增',
    binding_id INT NOT NULL COMMENT '绑定编号（外键），关联farm_principal表binding_id',
    -- 模块权限：可查看的模块（JSON格式存储，如 ["crop", "device", "warning", "environment"]）
    view_modules JSON COMMENT '可查看的模块列表',
    -- 操作权限：JSON格式存储，如 {"crop": "view", "device": "edit", "warning": "delete"}
    operation_permissions JSON COMMENT '操作权限配置',
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    update_by INT COMMENT '更新操作人（外键），关联用户表user_id',
    PRIMARY KEY (permission_id) COMMENT '主键约束：权限编号唯一',
    -- 外键约束
    FOREIGN KEY (binding_id) REFERENCES farm_principal(binding_id) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE,
    FOREIGN KEY (update_by) REFERENCES user(user_id) 
    ON DELETE SET NULL 
    ON UPDATE CASCADE,
    -- 唯一约束：每个绑定关系只有一条权限记录
    UNIQUE KEY uk_binding_permission (binding_id),
    -- 索引优化
    INDEX idx_permission_binding (binding_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='负责人权限配置表：存储负责人的模块和操作权限';

-- 3. 负责人操作日志表：记录绑定/解绑/改权限等操作
CREATE TABLE IF NOT EXISTS principal_operation_log (
    log_id INT AUTO_INCREMENT COMMENT '日志编号（主键），自增',
    farm_id INT NOT NULL COMMENT '农场编号（外键），关联农场表farm_id',
    user_id INT COMMENT '被操作的负责人用户编号（外键），关联用户表user_id',
    operation_type VARCHAR(20) NOT NULL COMMENT '操作类型：绑定/解绑/改权限',
    operation_content TEXT COMMENT '操作内容详情',
    operation_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',
    operator_id INT NOT NULL COMMENT '操作人编号（外键），关联用户表user_id',
    PRIMARY KEY (log_id) COMMENT '主键约束：日志编号唯一',
    -- 外键约束
    FOREIGN KEY (farm_id) REFERENCES farm(farm_id) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE,
    FOREIGN KEY (user_id) REFERENCES user(user_id) 
    ON DELETE SET NULL 
    ON UPDATE CASCADE,
    FOREIGN KEY (operator_id) REFERENCES user(user_id) 
    ON DELETE RESTRICT 
    ON UPDATE CASCADE,
    -- 索引优化：按农场、操作类型、时间查询
    INDEX idx_log_farm (farm_id),
    INDEX idx_log_type (operation_type),
    INDEX idx_log_time (operation_time),
    INDEX idx_log_operator (operator_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='负责人操作日志表：记录所有负责人相关操作，支持追溯';

