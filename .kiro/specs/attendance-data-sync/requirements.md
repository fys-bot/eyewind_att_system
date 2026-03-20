# Requirements Document

## Introduction

本功能实现考勤数据自动入库：当前端从钉钉API加载考勤数据后，自动将月度统计数据持久化到PostgreSQL数据库的 `att_monthly_stats` 表中。入库前先检查数据库中是否已存在该公司该月的数据，若已存在则跳过，避免重复写入。同时需要扩展 `company_id` 枚举以支持所有5个公司主体。

## Glossary

- **Dashboard_Page**: 考勤仪表盘页面组件（`AttendanceDashboardPage.tsx`），负责加载和展示考勤数据
- **useAttendanceStats_Hook**: 考勤统计计算Hook，将原始打卡数据计算为 `EmployeeStats` 月度统计
- **Sync_Service**: 服务端月度统计同步服务，负责接收前端计算好的统计数据并写入数据库
- **att_monthly_stats**: PostgreSQL月度统计表，存储每位员工每月的考勤汇总数据
- **CompanyId**: 公司标识枚举类型，当前仅支持 `eyewind` 和 `hydodo`，需扩展为5个
- **EmployeeStats**: 前端计算的员工月度统计数据结构，包含迟到、缺卡、请假、加班等字段
- **Frontend_Sync_Module**: 前端同步模块，在数据加载完成后自动触发入库流程

## Requirements

### Requirement 1: 扩展公司标识枚举

**User Story:** As a 系统管理员, I want 数据库支持所有5个公司主体, so that 所有公司的考勤数据都能入库存储。

#### Acceptance Criteria

1. THE Sync_Service SHALL support CompanyId values of `eyewind`, `hydodo`, `naoli`, `haike`, and `qianbing`
2. WHEN a migration is executed, THE database SHALL alter the `company_id` enum on `att_monthly_stats`, `att_daily`, `att_punch_record`, `att_approval_record`, and `att_edit_log` tables to include all five company identifiers
3. WHEN an unknown CompanyId is provided to the API, THE Sync_Service SHALL return a 400 error with a descriptive message

### Requirement 2: 服务端月度统计批量入库接口

**User Story:** As a 前端应用, I want 一个批量写入月度统计的API接口, so that 前端计算好的统计数据能持久化到数据库。

#### Acceptance Criteria

1. WHEN the Frontend_Sync_Module sends a batch of EmployeeStats records with companyId and yearMonth, THE Sync_Service SHALL upsert each record into `att_monthly_stats` using `(company_id, user_id, year_month)` as the unique constraint
2. WHEN a record with the same `(company_id, user_id, year_month)` already exists, THE Sync_Service SHALL update the existing record with the new values
3. WHEN the batch upsert completes successfully, THE Sync_Service SHALL return the count of inserted and updated records
4. IF the request body is missing required fields (companyId, yearMonth, or stats array), THEN THE Sync_Service SHALL return a 400 error with a descriptive message

### Requirement 3: 服务端数据存在性检查接口

**User Story:** As a 前端应用, I want 检查数据库中是否已有某公司某月的统计数据, so that 可以避免不必要的重复入库。

#### Acceptance Criteria

1. WHEN the Frontend_Sync_Module queries for existence of data for a given companyId and yearMonth, THE Sync_Service SHALL return the count of existing records and the latest calculation timestamp
2. WHEN no records exist for the given companyId and yearMonth, THE Sync_Service SHALL return a count of zero
3. THE Sync_Service SHALL respond to the existence check within 500ms for typical data volumes (fewer than 500 employees)

### Requirement 4: 前端自动入库触发

**User Story:** As a 用户, I want 考勤数据加载完成后自动入库, so that 无需手动操作即可将数据持久化。

#### Acceptance Criteria

1. WHEN the Dashboard_Page finishes loading attendance data and the useAttendanceStats_Hook produces companyEmployeeStats, THE Frontend_Sync_Module SHALL check if data already exists in the database for the current companyId and yearMonth
2. WHEN the database has zero records for the current companyId and yearMonth, THE Frontend_Sync_Module SHALL map EmployeeStats to the att_monthly_stats schema and send a batch upsert request
3. WHEN the database already has records for the current companyId and yearMonth, THE Frontend_Sync_Module SHALL skip the sync and log a message to the console
4. IF the sync request fails due to a network or server error, THEN THE Frontend_Sync_Module SHALL log the error to the console without disrupting the user experience
5. WHILE the sync is in progress, THE Frontend_Sync_Module SHALL not block or delay the dashboard rendering

### Requirement 5: 字段映射与数据转换

**User Story:** As a 开发者, I want EmployeeStats字段正确映射到att_monthly_stats表字段, so that 数据入库后与表结构完全匹配。

#### Acceptance Criteria

1. THE Frontend_Sync_Module SHALL map EmployeeStats fields to att_monthly_stats columns following the established naming convention (camelCase to snake_case)
2. WHEN mapping numeric fields, THE Frontend_Sync_Module SHALL default undefined or null values to zero
3. WHEN mapping boolean fields (isFullAttendance), THE Frontend_Sync_Module SHALL convert them to the database boolean type
4. THE Frontend_Sync_Module SHALL include user_id, user_name, and department from the DingTalkUser object alongside the EmployeeStats data
5. THE Frontend_Sync_Module SHALL set the `calc_time` field to the current timestamp when syncing data
