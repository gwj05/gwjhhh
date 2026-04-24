const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const cors = require('cors');
const dotenv = require('dotenv');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const farmRoutes = require('./routes/farm');
const systemRoutes = require('./routes/system');
const warningRoutes = require('./routes/warning');
const homepageRoutes = require('./routes/homepage');
const overviewRoutes = require('./routes/overview');
const principalRoutes = require('./routes/principal');
const cropRoutes = require('./routes/crop');
const materialRoutes = require('./routes/material');
const operationRoutes = require('./routes/operation');
const environmentRoutes = require('./routes/environment');
const pool = require('./config/database');
const { runInventoryRules, trainMlPredictor } = require('./lib/smartWarning');
const { ensureAuditLogTable } = require('./lib/auditLog');

dotenv.config();

ensureAuditLogTable(pool).catch((e) => console.error('audit_log 表初始化:', e.message));

const app = express();
const PORT = process.env.PORT || 5000;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 路由
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/farm', farmRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/warning', warningRoutes);
app.use('/api/homepage', homepageRoutes);
app.use('/api/overview', overviewRoutes);
app.use('/api/principal', principalRoutes);
app.use('/api/crop', cropRoutes);
app.use('/api/material', materialRoutes);
app.use('/api/operation', operationRoutes);
app.use('/api/environment', environmentRoutes);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: '服务器运行正常' });
});

/**
 * 首页「通用视频」演示：同源拉流，由本机转发公网样片（避免 <video> 直连外链被防盗链/地区网络拦截）。
 * 仅允许固定白名单地址，不接受任意 URL（防 SSRF）。
 */
const DEMO_VIDEO_UPSTREAM = [
  'https://sf1-cdn-tos.huoshanstatic.com/obj/media-fe/xgplayer_doc_video/mp4/xgplayer-demo-360p.mp4',
  'https://vjs.zencdn.net/v/oceans.mp4',
  'https://sf1-cdn-tos.huoshanstatic.com/obj/media-fe/xgplayer_doc_video/mp4/xgplayer-demo-360p.mp4',
  'https://vjs.zencdn.net/v/oceans.mp4'
]

function assertAllowedDemoUpstream (urlStr) {
  let u
  try {
    u = new URL(urlStr)
  } catch {
    return false
  }
  if (u.protocol !== 'https:') return false
  const host = u.hostname
  return (
    host === 'sf1-cdn-tos.huoshanstatic.com' ||
    host === 'vjs.zencdn.net'
  )
}

app.get('/demo-video/:n', (req, res) => {
  const i = parseInt(req.params.n, 10)
  if (i < 1 || i > DEMO_VIDEO_UPSTREAM.length) {
    return res.status(404).type('text/plain').send('Not found')
  }
  const target = DEMO_VIDEO_UPSTREAM[i - 1]
  if (!assertAllowedDemoUpstream(target)) {
    return res.status(500).type('text/plain').send('Misconfigured demo video')
  }
  const parsed = new URL(target)
  const lib = parsed.protocol === 'https:' ? https : http
  const opts = {
    hostname: parsed.hostname,
    port: parsed.port || 443,
    path: parsed.pathname + parsed.search,
    method: 'GET',
    headers: {
      ...(req.headers.range ? { Range: req.headers.range } : {}),
      'User-Agent': 'SmartAgri-demo-video/1.0'
    }
  }
  const upstream = lib.request(opts, (up) => {
    res.status(up.statusCode || 502)
    const pass = ['content-type', 'content-length', 'accept-ranges', 'content-range']
    for (const h of pass) {
      if (up.headers[h]) res.setHeader(h, up.headers[h])
    }
    up.pipe(res)
  })
  upstream.on('error', (e) => {
    console.error('demo-video proxy:', e.message)
    if (!res.headersSent) res.status(502).type('text/plain').send('Bad gateway')
  })
  upstream.end()
})

// 生产/单端口：托管 client/dist（开发请访问 Vite：http://localhost:3001）
const clientDist = path.resolve(__dirname, '../client/dist');
const indexHtml = path.join(clientDist, 'index.html');
const distReady = fs.existsSync(indexHtml);

app.use(express.static(clientDist, { index: 'index.html' }));

// 静态目录里没有对应文件时回退到 SPA（不用正则路由，避免个别环境下匹配异常）
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (req.path.startsWith('/api')) return next();
  if (!distReady) {
    return res.status(503).type('html').send(
      '<!DOCTYPE html><html><head><meta charset="utf-8"><title>前端未构建</title></head><body>' +
        '<p>未找到 <code>client/dist/index.html</code>。</p>' +
        '<p>请在项目根目录执行：<code>cd client && npm run build</code>，然后重启本服务。</p>' +
        '<p>开发调试请：<code>npm run client</code> 或 <code>npm run dev</code>，浏览器打开 <strong>http://localhost:3001</strong>。</p>' +
        '</body></html>'
    );
  }
  res.sendFile(path.resolve(indexHtml), (err) => (err ? next(err) : undefined));
});

// 统一错误处理中间件（放在所有路由之后）
// 约定：路由中尽量使用 next(err) 抛出，逐步迁移到这里统一格式
app.use((err, req, res, next) => {
  const status = Number(err?.statusCode || err?.status || 500);
  const message = err?.message || '服务器错误';
  if (status >= 500) {
    console.error('Unhandled error:', message, err?.stack || err);
  }
  res.status(status).json({ message });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`API 与静态页监听 0.0.0.0:${PORT}`);
  console.log(`  浏览器请试: http://127.0.0.1:${PORT} （若 localhost 异常请用 127.0.0.1）`);
  console.log(
    `  前端静态: ${distReady ? '已就绪 client/dist' : '未构建 — 无法打开页面，请先 cd client && npm run build'}`
  );
  if (!distReady) {
    console.log('  开发模式请另开终端: npm run client → http://localhost:3001');
  }
});

// ---------------- 智能预警：规则驱动自动扫描（环境阈值） ----------------
// 说明：
// - 环境监测数据写入后，规则扫描会基于最新一条记录生成预警（写入 crop_exception + push）
// - 含“数据库级去重 + 内存级节流”，避免短时间重复生成
// - 仅做轻量轮询，不影响主业务
const RULE_SCAN_INTERVAL_MS = Number(process.env.RULE_SCAN_INTERVAL_MS || 5 * 60 * 1000);
setInterval(() => {
  runInventoryRules(pool).catch((e) => console.error('rule-scan error:', e.message));
}, RULE_SCAN_INTERVAL_MS);

// 机器学习预测模型：启动后训练一次，后续每小时增量重训（轻量）
const ML_TRAIN_INTERVAL_MS = Number(process.env.ML_TRAIN_INTERVAL_MS || 60 * 60 * 1000);
setTimeout(() => {
  trainMlPredictor(pool)
    .then((r) => console.log('ML predictor trained:', r?.ok ? 'ok' : (r?.reason || 'failed')))
    .catch((e) => console.error('ML predictor train error:', e.message));
}, 5000);
setInterval(() => {
  trainMlPredictor(pool).catch((e) => console.error('ML predictor train error:', e.message));
}, ML_TRAIN_INTERVAL_MS);

