# Implementation Plan: 考勤数据自动入库

## Overview

将前端计算的月度考勤统计数据自动持久化到PostgreSQL数据库。实现包括数据库迁移、服务端API、前端映射函数和自动同步逻辑。

## Tasks

- [ ] 1. 扩展 CompanyId 类型和数据库枚举
  - [ ] 1.1 创建数据库迁移 `009_extend_company_id_enum.ts`，使用 `ALTER TYPE ... ADD VALUE` 为所有 `att_*` 表的 `company_id` 枚举添加 `naoli`、`haike`、`qianbing`
    - 使用 `knex.raw()` 执行原生SQL
    - 处理 PostgreSQL enum 类型的特殊性（每个表可能有独立的 enum 类型）
    - _Requirements: 1.1, 1.2_
  - [ ] 1.2 更新 `server/src/types/index.ts` 中的 `CompanyId` 类型定义，添加 `naoli | haike | qianbing`
    - _Requirements: 1.1_
  - [ ] 1.3 更新 `server/src/routes/attendance.ts` 中的 `validateCompanyId` 函数，支持新的公司ID
    - _Requirements: 1.3_

- [ ] 2. 实现服务端月度统计同步服务
  - [ ] 2.1 创建 `server/src/services/monthlyStatsSyncService.ts`，实现 `checkExists` 方法
    - 查询 `att_monthly_stats` 表中指定 companyId 和 yearMonth 的记录数
    - 返回 `{ exists: boolean, count: number, latestCalcTime: string | null }`
    - _Requirements: 3.1, 3.2_
  - [ ] 2.2 在 `monthlyStatsSyncService.ts` 中实现 `batchUpsert` 方法
    - 使用 Knex 的 `insert().onConflict(['company_id', 'user_id', 'year_month']).merge()` 实现 upsert
    - 在事务中执行批量操作
    - 返回 `{ inserted: number, updated: number }`
    - _Requirements: 2.1, 2.2, 2.3_
  - [ ]* 2.3 编写 `batchUpsert` 的属性测试
    - **Property 2: Upsert idempotence**
    - **Validates: Requirements 2.1, 2.2**

- [ ] 3. 实现服务端路由
  - [ ] 3.1 在 `server/src/routes/attendance.ts` 中添加 `GET /api/v1/attendance/monthly-stats/check/:companyId/:yearMonth` 端点
    - 调用 `monthlyStatsSyncService.checkExists`
    - 验证 companyId 和 yearMonth 参数
    - _Requirements: 3.1, 3.2, 1.3_
  - [ ] 3.2 在 `server/src/routes/attendance.ts` 中添加 `POST /api/v1/attendance/monthly-stats/sync/:companyId/:yearMonth` 端点
    - 调用 `monthlyStatsSyncService.batchUpsert`
    - 验证请求体包含 stats 数组
    - _Requirements: 2.1, 2.3, 2.4_

- [ ] 4. Checkpoint - 确保服务端代码编译通过
  - 确保所有服务端代码编译通过，ask the user if questions arise.

- [ ] 5. 实现前端映射函数和API调用
  - [ ] 5.1 在 `services/attendanceApiService.ts` 中添加 `checkMonthlyStatsExists` 和 `syncMonthlyStats` 方法
    - _Requirements: 3.1, 2.1_
  - [ ] 5.2 创建映射函数 `mapEmployeeStatsToDbRecords`，将 `companyEmployeeStats` 转换为数据库记录格式
    - 放在 `components/attendance/dashboard/utils.ts` 中
    - 处理 undefined/null 默认值
    - 包含 user_id, user_name, department 字段
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
  - [ ]* 5.3 编写映射函数的属性测试
    - **Property 4: Field mapping correctness**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**

- [ ] 6. 实现前端自动同步逻辑
  - [ ] 6.1 在 `AttendanceDashboardPage.tsx` 中添加 useEffect，在 companyEmployeeStats 变化时自动触发同步
    - 先调用 checkMonthlyStatsExists 检查
    - 不存在则调用 syncMonthlyStats 写入
    - 已存在则跳过并 console.log
    - 错误时 console.error，不影响UI
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 7. Final checkpoint - 确保所有代码编译通过
  - 确保前后端代码编译通过，ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- 属性测试使用 `fast-check` 库
- 数据库迁移需要在服务端运行 `npx knex migrate:latest` 执行
- 前端同步是异步非阻塞的，不影响仪表盘渲染性能
