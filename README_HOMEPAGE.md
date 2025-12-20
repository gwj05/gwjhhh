# 首页模块功能说明

## 数据库迁移

执行以下SQL脚本添加首页模块所需的字段和表：

```bash
mysql -u root -p smart_agriculture < server/migrations/add_homepage_fields.sql
```

或者使用MySQL客户端工具执行 `server/migrations/add_homepage_fields.sql` 文件。

## 新增字段说明

### 1. environment_monitor 表（气象站模块）
- `weather_type` VARCHAR(20): 天气类型（晴/阴/雨）
- `wind_speed` DECIMAL(5,2): 风速（m/s）
- `rainfall` DECIMAL(5,2): 降雨量（mm）

### 2. monitor_device 表（设备统计模块）
- `device_category` VARCHAR(30): 设备大类（传感器/控制器/摄像头）
- `last_online_time` DATETIME: 设备最后在线时间

### 3. crop_exception 表（预警消息模块）
- `warning_level` TINYINT: 预警等级（1=紧急/2=普通/3=提示）
- `scroll_sort` INT: 排序值（控制滑动展示顺序）

### 4. warning_read 表（预警已读记录）
- `id`: 主键
- `warning_id`: 关联 crop_exception.exception_id
- `user_id`: 关联 user.user_id
- `read_time`: 阅读时间

### 5. video_device 表（通用视频模块）
- `id`: 主键
- `device_id`: 关联 monitor_device.device_id
- `video_url`: 视频推流地址
- `video_status`: 视频状态（1=正常/2=无信号）
- `farm_id`: 关联 farm.farm_id

### 6. farm 表（地图概览模块）
- `longitude` DECIMAL(10,6): 农场经度
- `latitude` DECIMAL(10,6): 农场纬度

## API 接口

### 预警消息接口

#### 获取预警列表（支持分页）
```
GET /api/warning/list
参数：
- page: 页码（默认1）
- pageSize: 每页数量（默认10）
- farm_id: 农场ID（可选，超级管理员可筛选）
- handle_status: 处理状态（可选）

返回：
{
  data: [...],
  total: 100,
  page: 1,
  pageSize: 10,
  hasMore: true
}
```

#### 标记预警为已读
```
POST /api/warning/read/:id
```

#### 批量标记已读
```
POST /api/warning/read-batch
Body: { warning_ids: [1, 2, 3] }
```

#### 获取未读数量
```
GET /api/warning/unread-count
```

### 首页数据接口

#### 获取气象站数据
```
GET /api/homepage/weather
参数：
- farm_id: 农场ID（可选）
```

#### 获取设备统计
```
GET /api/homepage/device-stats
参数：
- farm_id: 农场ID（可选）
```

#### 获取视频列表
```
GET /api/homepage/videos
参数：
- farm_id: 农场ID（可选）
```

#### 获取地图概览数据
```
GET /api/homepage/map-overview
```

## 前端功能

### 预警消息滑动交互

1. **固定高度滚动区域**：预警消息区域高度固定为 400px，开启垂直滚动
2. **无限滚动加载**：
   - 默认显示10条数据
   - 滚动到底部时自动加载下一页
   - 向上滚动可查看已加载内容
3. **未读标识**：
   - 未读预警显示红色背景和"未读"标签
   - 点击预警自动标记为已读
4. **预警等级**：
   - 紧急（红色）：warning_level = 1
   - 普通（橙色）：warning_level = 2
   - 提示（蓝色）：warning_level = 3

### 首页模块布局

- **气象站模块**：显示最新气象数据（温度、湿度、风速、降雨量等）
- **设备统计模块**：按设备大类统计在线/离线/故障数量
- **预警消息模块**：滚动展示预警列表，支持无限滚动
- **通用视频模块**：显示视频设备推流
- **地图概览模块**：显示农场位置和设备分布（可集成第三方地图SDK）

## 使用说明

1. 执行数据库迁移脚本
2. 访问 `/homepage` 路由查看首页
3. 预警消息区域支持上下滑动，滚动到底部自动加载更多
4. 点击未读预警可标记为已读

## 注意事项

- 数据库迁移脚本中的 `IF NOT EXISTS` 语法在 MySQL 的 `ALTER TABLE` 中不支持，如果字段已存在会报错，可以忽略
- 预警消息按 `scroll_sort` 降序和 `exception_time` 降序排序
- 数据权限：非超级管理员仅能查看所属农场的相关数据
- 视频模块需要配置实际的推流地址才能正常显示

