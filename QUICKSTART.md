# 快速启动指南

## 前置要求

- Node.js (v14+)
- MySQL (v5.7+)
- npm 或 yarn

## 快速开始

### 1. 安装依赖

```bash
npm run install-all
```

### 2. 配置数据库

1. 确保 MySQL 服务正在运行
2. 创建 `.env` 文件（在 `server/` 目录下）：

```bash
cd server
copy .env.example .env  # Windows
# 或
cp .env.example .env    # Linux/Mac
```

3. 编辑 `.env` 文件，确保数据库配置正确

4. 初始化数据库：

```bash
mysql -u root -p < init.sql
```

5. 初始化测试数据（设置测试用户密码）：

```bash
node init-test-data.js
```

### 3. 启动项目

在项目根目录运行：

```bash
npm run dev
```

这将同时启动：
- 后端服务器：http://localhost:5000
- 前端开发服务器：http://localhost:3001

### 4. 访问应用

打开浏览器访问：http://localhost:3001

## 测试账号

- **管理员**：admin / 123456
- **运维人员**：operator / 123456
- **普通用户**：user / 123456

## 功能说明

### 登录注册
- 访问 http://localhost:3001/login 进行登录
- 访问 http://localhost:3001/register 进行注册

### 角色切换
- 管理员可以切换为运维人员或普通用户
- 运维人员可以切换为普通用户
- 普通用户不能切换角色
- 点击右上角的倒三角图标进行角色切换

### 首页
- 不同角色登录后看到不同的首页内容
- 管理员：用户管理、农场管理、数据统计、系统设置
- 运维人员：设备管理、监控设备、异常处理、环境监测
- 普通用户：我的农场、作物管理、操作记录、环境数据

## 常见问题

### 数据库连接失败
- 检查 MySQL 服务是否运行
- 检查 `.env` 文件中的数据库配置是否正确
- 检查数据库用户权限

### 端口被占用
- 修改 `server/.env` 中的 `PORT` 修改后端端口
- 修改 `client/vite.config.js` 中的 `server.port` 修改前端端口

### 前端无法连接后端
- 检查后端服务器是否正常运行
- 检查 `client/vite.config.js` 中的代理配置

