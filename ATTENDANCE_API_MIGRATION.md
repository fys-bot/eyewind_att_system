# 考勤接口迁移文档

## 概述

本次迁移将考勤确认页面的两个核心接口从外部服务迁移到我们自己的服务器上，提高系统的独立性和可控性。

## 迁移的接口

### 1. 批量UPSERT接口
- **原接口**: `POST https://sg.api.eyewind.cn/etl/dingding/attendance/upset`
- **新接口**: `POST /api/v1/attendance/status/upsert`
- **功能**: 批量创建或更新考勤状态记录

### 2. 加载考勤数据接口
- **原接口**: `GET https://sg.api.eyewind.cn/etl/dingding/attendance/load/:pathSegment?`
- **新接口**: `GET /api/v1/attendance/status/load/:pathSegment?`
- **功能**: 根据不同条件加载考勤数据

## 数据库配置

### 考勤数据库连接信息
- **主机**: 81.70.91.77
- **端口**: 5432
- **数据库**: eyewind-dw
- **用户**: etl
- **密码**: xnAvy5pkl3tR4zT7Q3As0

### 数据表结构
表名: `attendance`

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | integer | 主键，自增 |
| userid | varchar | 用户ID，不能为空 |
| name | varchar | 用户姓名，不能为空 |
| dept_ids | jsonb | 部门ID列表 |
| attd_month | varchar | 考勤月份，不能为空 |
| is_send | boolean | 是否已发送 |
| is_view | boolean | 是否已查看 |
| is_confirm | boolean | 是否已确认 |
| signatureBase64 | text | 签名数据 |
| details | jsonb | 详细信息 |
| records | jsonb | 考勤记录 |
| unionid | varchar | 钉钉UnionID |
| created_at | timestamp | 创建时间 |
| updated_at | timestamp | 更新时间 |
| confirmed_at | timestamp | 确认时间 |
| viewed_at | timestamp | 查看时间 |
| confirm_typ | varchar | 确认类型 |
| mainCompany | varchar | 主公司 |
| todo_task_id | varchar | 待办任务ID |
| corp_task_id | varchar | 企业消息任务ID |

**唯一约束**: `userid` + `attd_month`

## 新增文件

### 后端文件
1. `server/src/db/attendanceDb.ts` - 考勤数据库连接配置
2. `server/src/services/attendanceStatusService.ts` - 考勤状态服务
3. 更新 `server/src/routes/attendance.ts` - 添加新的路由

### 前端文件更新
1. `components/attendance/verification/api.ts` - 更新upsert接口调用
2. `components/attendance/AttendancePage.tsx` - 更新load接口调用
3. `components/attendance/verification/CreateWizard.tsx` - 更新load接口调用

## API接口详情

### 1. 批量UPSERT接口

**请求**:
```http
POST /api/v1/attendance/status/upsert
Content-Type: application/json

{
  "data": [
    {
      "userid": "string",
      "attd_month": "string",
      "name": "string",
      "is_send": boolean,
      "is_view": boolean,
      "is_confirm": boolean,
      // ... 其他字段
    }
  ]
}
```

**响应**:
```json
{
  "success": true,
  "message": "批量 UPSERT 成功，共处理 N 条记录。",
  "data": {
    "total": 10,
    "success_count": 10
  }
}
```

### 2. 加载考勤数据接口

**支持的路径参数**:
- `load` - 加载所有数据，按月份分组
- `YYYY-MM` - 按月份加载数据
- `userid` - 按用户ID加载数据
- `userid**YYYY-MM` - 按用户ID和月份加载数据

**请求示例**:
```http
GET /api/v1/attendance/status/load
GET /api/v1/attendance/status/load/2026-01
GET /api/v1/attendance/status/load/user123
GET /api/v1/attendance/status/load/user123**2026-01
```

**响应**:
```json
{
  "success": true,
  "message": "查询成功",
  "data": [
    // 考勤记录数组
  ]
}
```

## 测试

### 数据库连接测试
数据库连接已验证成功，attendance表存在且包含365条记录。

### API测试
可以使用 `test-attendance-api.html` 文件进行接口测试。

## 部署注意事项

1. **环境变量**: 确保服务器环境中已正确配置数据库连接信息
2. **网络访问**: 确保服务器能够访问考勤数据库 (81.70.91.77:5432)
3. **依赖包**: 确保安装了 `knex` 和 `pg` 包
4. **CORS配置**: 如果前端和后端在不同域名，需要配置CORS
5. **端口配置**: 服务器默认运行在5000端口，前端通过Vite代理访问

## 迁移优势

1. **独立性**: 不再依赖外部API服务
2. **可控性**: 完全控制接口的行为和性能
3. **安全性**: 数据传输在内部网络中进行
4. **维护性**: 便于调试和维护
5. **扩展性**: 可以根据需要轻松扩展功能

## 回滚方案

如果需要回滚到原来的外部接口，只需要将以下文件中的API调用地址改回原来的地址：
- `components/attendance/verification/api.ts`
- `components/attendance/AttendancePage.tsx`
- `components/attendance/verification/CreateWizard.tsx`

## 监控和日志

- 所有API调用都有详细的日志记录
- 数据库操作异常会被捕获并记录
- 建议在生产环境中配置适当的监控和告警