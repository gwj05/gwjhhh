const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const farmRoutes = require('./routes/farm');
const systemRoutes = require('./routes/system');
const warningRoutes = require('./routes/warning');
const homepageRoutes = require('./routes/homepage');
const principalRoutes = require('./routes/principal');
const cropRoutes = require('./routes/crop');
const materialRoutes = require('./routes/material');
const operationRoutes = require('./routes/operation');
const environmentRoutes = require('./routes/environment');

dotenv.config();

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
app.use('/api/principal', principalRoutes);
app.use('/api/crop', cropRoutes);
app.use('/api/material', materialRoutes);
app.use('/api/operation', operationRoutes);
app.use('/api/environment', environmentRoutes);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: '服务器运行正常' });
});

app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
});

