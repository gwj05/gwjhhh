# 智慧农业管理系统

一个现代化的智慧农业管理系统，支持多角色登录和权限管理。

## 技术栈

### 后端
- Node.js + Express
- MySQL
- JWT 认证
- bcryptjs 密码加密

### 前端
- React 18
- React Router
- Vite
- Axios

## 项目结构

```
demo4/
├── server/                 # 后端代码
│   ├── config/            # 配置文件
│   │   └── database.js    # 数据库连接
│   ├── routes/            # 路由
│   │   ├── auth.js       # 认证路由（登录/注册）
│   │   └── user.js       # 用户路由（用户信息/角色切换）
│   ├── index.js          # 服务器入口
│   ├── init.sql          # 数据库初始化脚本
│   └── package.json
├── client/                # 前端代码
│   ├── src/
│   │   ├── pages/        # 页面组件
│   │   │   ├── Login.jsx
│   │   │   ├── Register.jsx
│   │   │   └── Home.jsx
│   │   ├── context/      # React Context
│   │   │   └── AuthContext.jsx
│   │   ├── utils/        # 工具函数
│   │   │   └── api.js
│   │   ├── App.jsx
│   │   └── main.jsx
│   └── package.json
└── package.json          # 根目录配置
```

## 安装和运行

### 1. 安装依赖

```bash
npm run install-all
```

### 2. 初始化数据库

1. 确保 MySQL 服务已启动
2. 执行 `server/init.sql` 文件创建数据库和表结构：
   ```bash
   mysql -u root -p < server/init.sql
   ```
   或者使用 MySQL 客户端工具执行该 SQL 文件

3. 初始化测试数据（可选，用于设置测试用户密码）：
   ```bash
   cd server
   node init-test-data.js
   ```

4. 默认测试账号（密码都是 123456）：
   - 管理员：admin / 123456
   - 运维人员：operator / 123456
   - 普通用户：user / 123456

### 3. 配置环境变量

在 `server/` 目录下创建 `.env` 文件，配置如下：

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=Gwj@147
DB_NAME=smart_agriculture
JWT_SECRET=smart_agriculture_secret_key_2024
PORT=5000
```

或者复制 `server/.env.example` 文件并重命名为 `.env`，然后修改相应的配置值。

### 4. 启动项目

```bash
npm run dev
```

这将同时启动：
- 后端服务器：http://localhost:5000
- 前端开发服务器：http://localhost:3000

## 功能特性

### 登录注册
- 现代化的登录注册界面
- 支持三种角色：管理员、运维人员、普通用户
- 密码加密存储
- JWT Token 认证

### 角色切换
- 管理员可以切换为运维人员或普通用户
- 运维人员可以切换为普通用户
- 普通用户不能切换角色

### 首页
- 不同角色显示不同的首页内容
- 右上角显示用户信息和角色切换菜单
- 退出登录功能

## API 接口

### 认证相关
- `POST /api/auth/register` - 用户注册
- `POST /api/auth/login` - 用户登录
- `GET /api/auth/roles` - 获取角色列表

### 用户相关
- `GET /api/user/me` - 获取当前用户信息
- `GET /api/user/switchable-roles` - 获取可切换的角色列表
- `POST /api/user/switch-role` - 切换角色

## 数据库说明

系统使用 MySQL 数据库，包含以下主要表：
- `role` - 角色表
- `user` - 用户表
- `farm` - 农场表
- `crop` - 作物表
- `agricultural_material` - 农资表
- `operation_record` - 操作记录表
- `environment_monitor` - 环境监测表
- `monitor_device` - 监控设备表
- `crop_exception` - 作物异常记录表
- `exception_push` - 异常提醒推送表

## 注意事项

1. 首次使用需要先执行数据库初始化脚本
2. 默认管理员密码需要在数据库中手动设置或使用注册功能创建
3. 确保 MySQL 服务正常运行且端口为 3306
4. 前端代理配置在 `client/vite.config.js` 中

