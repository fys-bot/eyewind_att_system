# 考勤管理系统

一个基于 React + TypeScript + Node.js 的企业级考勤管理系统，集成钉钉 API，支持多公司考勤数据管理、智能规则引擎、数据可视化分析等功能。

## 功能特性

### 核心功能
- **多公司管理** - 支持多个公司的考勤数据独立管理
- **考勤日历** - 可视化展示员工每日考勤状态
- **考勤仪表盘** - 实时统计分析，支持数据导出和报表预览
- **考勤确认** - 创建和管理考勤确认单，支持钉钉推送
- **员工管理** - 员工列表查看、考勤详情分析

### 智能规则引擎
- **迟到规则** - 支持跨天打卡、前一天加班延迟上班等复杂规则
- **请假管理** - 自动识别各类请假类型，智能计算请假时长
- **加班统计** - 周末加班、工作日加班自动识别和统计
- **全勤奖励** - 可配置的全勤规则和奖金计算
- **绩效考核** - 灵活的绩效扣款规则（封顶/不封顶模式）
- **豁免机制** - 支持迟到豁免（按日期/按分钟数）

### 数据管理
- **Excel 导入导出** - 支持考勤数据批量导入和多格式导出
- **报表预览编辑** - 在线预览和编辑考勤报表
- **数据缓存** - 智能缓存机制，提升数据加载速度
- **节假日同步** - 自动同步国家法定节假日

### 系统管理
- **用户权限** - 基于角色的权限管理（管理员/普通用户）
- **操作日志** - 完整的操作审计日志
- **规则配置** - 可视化的考勤规则配置界面
- **AI 模型管理** - 集成 AI 能力，支持智能问答

## 技术栈

### 前端
- **框架**: React 19 + TypeScript
- **构建工具**: Vite 6
- **UI 组件**: 自定义组件库（Tailwind CSS）
- **数据可视化**: Recharts
- **状态管理**: React Hooks
- **本地存储**: IndexedDB (idb)

### 后端
- **运行时**: Node.js + Express
- **语言**: TypeScript
- **数据库**: PostgreSQL
- **ORM**: Knex.js
- **API**: RESTful API

### 集成服务
- **钉钉 API** - 员工数据、打卡记录、审批流程
- **节假日 API** - 国家法定节假日数据
- **AI 服务** - Google Gemini API

## 快速开始

### 环境要求
- Node.js >= 18.0.0
- PostgreSQL >= 14.0
- npm 或 yarn

### 1. 克隆项目
```bash
git clone <repository-url>
cd 考勤管理系统
```

### 2. 安装依赖

#### 安装前端依赖
```bash
npm install
```

#### 安装后端依赖
```bash
cd server
npm install
cd ..
```

### 3. 配置环境变量

#### 前端配置 (.env.local)
```env
# Gemini API Key (用于 AI 功能)
GEMINI_API_KEY=your_gemini_api_key_here
```

#### 后端配置 (server/.env)
```env
# 数据库配置
DB_HOST=localhost
DB_PORT=5432
DB_NAME=attendance_db
DB_USER=your_db_user
DB_PASSWORD=your_db_password

# 服务器配置
PORT=3001
NODE_ENV=development

# 钉钉配置（可选，如果需要修改默认配置）
# DINGTALK_APPKEY=your_appkey
# DINGTALK_APPSECRET=your_appsecret
```

### 4. 初始化数据库

```bash
cd server

# 运行数据库迁移
npm run migrate

# 运行种子数据（可选）
npm run seed

cd ..
```

### 5. 启动服务

#### 方式一：分别启动（推荐开发时使用）

**终端 1 - 启动后端服务**
```bash
cd server
npm run dev
```
后端服务将运行在 `http://localhost:3001`

**终端 2 - 启动前端服务**
```bash
npm run dev
```
前端服务将运行在 `http://localhost:5173`

#### 方式二：使用 npm-run-all 同时启动（需要安装）
```bash
# 安装 npm-run-all
npm install -g npm-run-all

# 同时启动前后端
npm-run-all --parallel dev server:dev
```

### 6. 访问系统

打开浏览器访问: `http://localhost:5173`

默认管理员账号（如果运行了 seed）:
- 用户名: admin
- 密码: admin123

## 项目结构

```
考勤管理系统/
├── components/              # React 组件
│   ├── admin/              # 管理员功能组件
│   ├── attendance/         # 考勤相关组件
│   │   ├── dashboard/     # 仪表盘
│   │   ├── verification/  # 考勤确认
│   │   └── employee/      # 员工管理
│   └── settings/          # 系统设置
├── services/               # API 服务层
├── hooks/                  # 自定义 React Hooks
├── database/              # 数据库 Schema 定义
├── server/                # 后端服务
│   ├── src/
│   │   ├── routes/       # API 路由
│   │   ├── services/     # 业务逻辑
│   │   ├── middleware/   # 中间件
│   │   ├── migrations/   # 数据库迁移
│   │   └── seeds/        # 种子数据
│   └── knexfile.ts       # Knex 配置
├── docs/                  # 项目文档
├── .env.local            # 前端环境变量
└── README.md             # 项目说明
```

## 主要功能模块

### 考勤日历
- 月度考勤数据可视化展示
- 支持查看员工每日打卡详情
- 显示迟到、请假、加班等状态
- 法定节假日自动标识

### 考勤仪表盘
- 公司整体考勤统计
- 员工排名（全勤、迟到、请假等）
- 每日趋势分析图表
- 支持导出 Excel 报表
- 报表在线预览和编辑

### 考勤确认
- 创建月度考勤确认单
- 支持批量导入 CSV 数据
- 手机预览效果
- 一键推送到钉钉

### 规则配置
- 可视化配置考勤规则
- 支持多公司独立规则
- 实时生效，无需重启
- 规则版本管理

## 开发指南

### 添加新的考勤规则
1. 在 `components/attendance/AttendanceRuleEngine.ts` 中定义规则逻辑
2. 在 `components/settings/AttendanceRules.tsx` 中添加配置界面
3. 在 `server/src/services/ruleService.ts` 中添加后端验证

### 添加新的 API 路由
1. 在 `server/src/routes/` 中创建路由文件
2. 在 `server/src/services/` 中实现业务逻辑
3. 在 `server/src/index.ts` 中注册路由

### 数据库迁移
```bash
cd server

# 创建新的迁移文件
npm run migrate:make migration_name

# 运行迁移
npm run migrate

# 回滚迁移
npm run migrate:rollback
```

## 部署

### 生产环境构建

#### 快速打包（推荐）
```bash
chmod +x build.sh
./build.sh
```

这会自动完成所有构建步骤并生成部署包 `attendance-system-YYYYMMDD_HHMMSS.tar.gz`。

#### 手动构建

**构建前端：**
```bash
npm run build
```
构建产物在 `dist/` 目录

**构建后端：**
```bash
cd server
npm run build
```
构建产物在 `server/dist/` 目录

### 生产环境运行

#### 启动后端
```bash
cd server
NODE_ENV=production npm start
```

#### 部署前端
将 `dist/` 目录部署到静态文件服务器（如 Nginx、Apache）或使用 CDN

#### 使用 PM2（推荐）
```bash
# 安装 PM2
npm install -g pm2

# 启动后端
cd server
pm2 start dist/index.js --name attendance-api

# 启动前端（使用 serve）
npm install -g serve
pm2 start "serve -s dist -l 5173" --name attendance-web

# 查看状态
pm2 status

# 设置开机自启
pm2 startup
pm2 save
```

### Docker 部署（推荐）

创建 `Dockerfile`:
```dockerfile
FROM node:18-alpine

WORKDIR /app

# 复制构建产物
COPY dist/ ./dist/
COPY server/dist/ ./server/dist/
COPY server/package*.json ./server/
COPY package*.json ./

# 安装生产依赖
RUN npm install --production
RUN cd server && npm install --production

EXPOSE 3001 5173

CMD ["npm", "start"]
```

构建和运行：
```bash
# 构建镜像
docker build -t attendance-system .

# 运行容器
docker run -p 3001:3001 -p 5173:5173 \
  -e DB_HOST=your_db_host \
  -e DB_PASSWORD=your_password \
  attendance-system
```

### 详细部署指南

查看 [DEPLOYMENT.md](./DEPLOYMENT.md) 获取完整的部署文档，包括：
- 服务器环境配置
- 数据库初始化
- Nginx 反向代理配置
- HTTPS 配置
- 监控和维护
- 故障排查

## 常见问题

### 1. 数据库连接失败
检查 `server/.env` 中的数据库配置是否正确，确保 PostgreSQL 服务已启动。

### 2. 钉钉 API 调用失败
确认钉钉 AppKey 和 AppSecret 配置正确，检查网络连接。

### 3. 前端无法连接后端
确认后端服务已启动，检查 API 地址配置（默认 `http://localhost:3001`）。

### 4. 节假日数据未加载
系统会自动从 `timor.tech` API 获取节假日数据，检查网络连接。

## 贡献指南

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT License

## 联系方式

如有问题或建议，请联系项目维护者。
