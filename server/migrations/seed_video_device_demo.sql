-- =============================================================================
-- 首页「通用视频」演示数据（可选执行；每条可重复执行：同名设备已存在则跳过）
-- 依赖：video_device 表；farm 至少一条。
--
-- video_url 使用同源路径 /demo-video/1 … /demo-video/4：
--   由 Node 反向代理公网演示片（见 server/index.js 白名单），避免浏览器直连外链被防盗链/网络拦截。
-- 开发：Vite 已将 /demo-video 代理到后端；生产：与前端同域访问。
--
-- 若你曾插入过旧版 https:// 外链，可执行：update_video_device_demo_urls.sql
-- =============================================================================

INSERT INTO monitor_device (
  farm_id, device_name, device_category, install_location, device_status, monitor_area, last_online_time
)
SELECT f.farm_id, '通用视频-样例1', '摄像头', '同源演示 /demo-video/1', '在线', '演示', NOW()
FROM farm f
WHERE NOT EXISTS (SELECT 1 FROM monitor_device md WHERE md.device_name = '通用视频-样例1')
ORDER BY f.farm_id LIMIT 1;

INSERT INTO video_device (device_id, video_url, video_status, farm_id)
SELECT md.device_id, '/demo-video/1', 1, md.farm_id
FROM monitor_device md
WHERE md.device_name = '通用视频-样例1'
  AND NOT EXISTS (SELECT 1 FROM video_device vd WHERE vd.device_id = md.device_id)
LIMIT 1;

INSERT INTO monitor_device (
  farm_id, device_name, device_category, install_location, device_status, monitor_area, last_online_time
)
SELECT f.farm_id, '通用视频-样例2', '摄像头', '同源演示 /demo-video/2', '在线', '演示', NOW()
FROM farm f
WHERE NOT EXISTS (SELECT 1 FROM monitor_device md WHERE md.device_name = '通用视频-样例2')
ORDER BY f.farm_id LIMIT 1;

INSERT INTO video_device (device_id, video_url, video_status, farm_id)
SELECT md.device_id, '/demo-video/2', 1, md.farm_id
FROM monitor_device md
WHERE md.device_name = '通用视频-样例2'
  AND NOT EXISTS (SELECT 1 FROM video_device vd WHERE vd.device_id = md.device_id)
LIMIT 1;

INSERT INTO monitor_device (
  farm_id, device_name, device_category, install_location, device_status, monitor_area, last_online_time
)
SELECT f.farm_id, '通用视频-样例3', '摄像头', '同源演示 /demo-video/3', '在线', '演示', NOW()
FROM farm f
WHERE NOT EXISTS (SELECT 1 FROM monitor_device md WHERE md.device_name = '通用视频-样例3')
ORDER BY f.farm_id LIMIT 1;

INSERT INTO video_device (device_id, video_url, video_status, farm_id)
SELECT md.device_id, '/demo-video/3', 1, md.farm_id
FROM monitor_device md
WHERE md.device_name = '通用视频-样例3'
  AND NOT EXISTS (SELECT 1 FROM video_device vd WHERE vd.device_id = md.device_id)
LIMIT 1;

INSERT INTO monitor_device (
  farm_id, device_name, device_category, install_location, device_status, monitor_area, last_online_time
)
SELECT f.farm_id, '通用视频-样例4', '摄像头', '同源演示 /demo-video/4', '在线', '演示', NOW()
FROM farm f
WHERE NOT EXISTS (SELECT 1 FROM monitor_device md WHERE md.device_name = '通用视频-样例4')
ORDER BY f.farm_id LIMIT 1;

INSERT INTO video_device (device_id, video_url, video_status, farm_id)
SELECT md.device_id, '/demo-video/4', 1, md.farm_id
FROM monitor_device md
WHERE md.device_name = '通用视频-样例4'
  AND NOT EXISTS (SELECT 1 FROM video_device vd WHERE vd.device_id = md.device_id)
LIMIT 1;
