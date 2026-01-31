# 考勤规则配置服务器

基于 Express + Knex + PostgreSQL 的考勤规则配置后端服务。

## 快速开始

### 1. 安装依赖

```bash
cd server
npm install
```

### 2. 配置数据库

复制环境变量文件并修改配置：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=attendance_rules
DB_USER=postgres
DB_PASSWORD=your_password
PORT=3001
```

### 3. 创建数据库

```bash
# 连接 PostgreSQL
psql -U postgres

# 创建数据库
CREATE DATABASE attendance_rules;
\q
```

### 4. 运行数据库迁移

```bash
npm run migrate
```

### 5. 插入默认数据（可选）

```bash
npm run seed
```

### 6. 启动服务器

```bash
# 开发模式（热重载）
npm run dev

# 生产模式
npm run build
npm start
```

## API 接口

### 获取公司配置

```http
GET /api/v1/attendance/rules/:companyId
```

**参数：**
- `companyId`: `eyewind` 或 `hydodo`

**响应示例：**
```json
{
  "code": 0,
  "data": {
    "id": 1,
    "company_id": "eyewind",
    "work_start_time": "09:00:00",
    "work_end_time": "18:30:00",
    "lateRules": [...],
    "penaltyRules": [...],
    ...
  }
}
```

### 更新公司配置

```http
PUT /api/v1/attendance/rules/:companyId
Content-Type: application/json
X-User-Id: admin

{
  "work_start_time": "09:00:00",
  "late_exemption_count": 3,
  "lateRules": [...],
  "changeReason": "调整迟到规则"
}
```

### 获取变更历史

```http
GET /api/v1/attendance/rules/:companyId/history?page=1&size=20
```

### 回滚配置

```http
POST /api/v1/attendance/rules/:companyId/rollback
Content-Type: application/json
X-User-Id: admin

{
  "historyId": 5,
  "reason": "回滚到上一版本"
}
```

## 数据库表结构

| 表名 | 说明 |
|------|------|
| `att_rule_config` | 主配置表 |
| `att_rule_detail` | 规则明细表 |
| `att_rule_special_date` | 特殊日期表 |
| `att_rule_change_log` | 变更历史表 |

## 目录结构

```
server/
├── src/
│   ├── db/              # 数据库连接
│   ├── migrations/      # 数据库迁移
│   ├── seeds/           # 种子数据
│   ├── routes/          # API 路由
│   ├── services/        # 业务逻辑
│   ├── types/           # TypeScript 类型
│   └── index.ts         # 入口文件
├── .env.example         # 环境变量示例
├── knexfile.ts          # Knex 配置
├── package.json
├── tsconfig.json
└── README.md
```

## 错误码

| 错误码 | 说明 |
|--------|------|
| 0 | 成功 |
| 40001 | 配置不存在 |
| 40003 | 参数校验失败 |
| 40004 | 历史记录不存在 |
| 40400 | 接口不存在 |
| 50000 | 服务器内部错误 |
