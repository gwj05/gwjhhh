-- 将「通用视频-样例*」的地址改为同源 /demo-video/*（配合 server/index.js 演示代理）
-- 在已执行过旧版种子（https 外链）时运行本脚本即可，无需删表重插。

UPDATE video_device vd
INNER JOIN monitor_device md ON vd.device_id = md.device_id
SET vd.video_url = CASE md.device_name
  WHEN '通用视频-样例1' THEN '/demo-video/1'
  WHEN '通用视频-样例2' THEN '/demo-video/2'
  WHEN '通用视频-样例3' THEN '/demo-video/3'
  WHEN '通用视频-样例4' THEN '/demo-video/4'
  ELSE vd.video_url
END
WHERE md.device_name IN ('通用视频-样例1', '通用视频-样例2', '通用视频-样例3', '通用视频-样例4');
