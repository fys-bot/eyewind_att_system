# Design Document: 考勤仪表盘数据分析模块

## Architecture Overview

### 设计原则
- **非侵入性**：所有新功能以独立组件形式存在，不修改现有组件内部逻辑
- **Props 驱动**：仅通过 props 接收现有数据，不修改数据源
- **错误隔离**：分析模块错误不影响主仪表盘功能
- **状态自治**：所有新增状态在组件内部管理

### 组件架构

```
CompanyDashboardView (现有，仅添加一行引用)
  └── <AttendanceAnalytics />  ← 新增独立组件
        ├── AnalyticsOverviewCards     (工时利用率 + 加班合规 + 风险评分概览)
        ├── LeaveTypePieChart          (请假类型占比 - 环形图)
        ├── WeekdayHeatmap             (星期维度异常热力图)
        ├── ConsecutiveAbsenceAlert    (连续请假/缺勤预警)
        ├── NewEmployeeWatch           (新员工考勤关注)
        ├── CrossCompanyComparison     (跨公司横向对比 - 仅"全部"tab)
        ├── MonthOverMonthComparison   (月度环比对比)
        ├── RiskScoreRanking           (累计风险评分排行)
        ├── OvertimeComplianceTable    (加班合规监控详情)
        └── LeaveCostEstimator         (请假工时成本估算 - 弹窗)
```

### 文件结构

```
components/attendance/dashboard/
  ├── AttendanceAnalytics.tsx          ← 主入口组件（包含所有子模块）
  └── analyticsUtils.ts               ← 分析计算工具函数
```

## Data Flow

### Props 接口定义

```typescript
interface AttendanceAnalyticsProps {
  // 从 CompanyDashboardView 透传的现有数据
  companyEmployeeStats: Record<string, Array<{ user: DingTalkUser; stats: EmployeeStats }>>;
  companyAggregate: Record<string, { totalLateMinutes: number; abnormalUserCount: number; totalRecords: number; abnormalRecords: number }>;
  attendanceMap: AttendanceMap;
  processDataMap: Record<string, any>;
  holidays: HolidayMap;
  activeCompany: string;       // 当前选中的公司tab（"全部" 或具体公司名）
  year: number;
  month: number;               // 0-indexed
  allUsers: DingTalkUser[];
  dailyTrend: Record<string, any[]>;
  lateExemptionEnabled?: boolean;
}
```

### 数据来源映射

| 分析功能 | 数据来源 | 说明 |
|---------|---------|------|
| 工时利用率 | `EmployeeStats.shouldAttendanceDays`, `lateMinutes`, `overtimeTotalMinutes` | 直接从 stats 计算 |
| 星期维度热力图 | `AttendanceMap` | 遍历每日记录，按 weekday 聚合 |
| 请假类型占比 | `EmployeeStats.*Hours` | 汇总各类假期小时数 |
| 连续缺勤预警 | `AttendanceMap` | 扫描连续天数 |
| 月度环比 | `getLatestSnapshot()` API | 加载上月快照数据对比 |
| 跨公司对比 | `companyEmployeeStats` 全部公司 | 仅 activeCompany === '全部' 时展示 |
| 新员工关注 | `DingTalkUser.create_time` / `hired_date` | 筛选入职3个月内 |
| 风险评分 | `EmployeeStats.lateMinutes`, `missing`, `absenteeism` | 加权计算 |
| 加班合规 | `EmployeeStats.overtimeTotalMinutes` | 与36h法定上限对比 |
| 请假成本估算 | `EmployeeStats.*Hours` + localStorage 月薪 | 弹窗独立交互 |

## Component Design Details

### 1. AttendanceAnalytics（主入口）

嵌入位置：`CompanyDashboardView` 的 `AccordionSection("数据分析与洞察")` 之后、`AttendanceStatsTable` 之前。

```tsx
<AccordionSection title="高级数据分析" icon={<BarChart2Icon />} defaultOpen={false}>
  <AttendanceAnalytics {...analyticsProps} />
</AccordionSection>
```

内部使用 tab 或 grid 布局组织各子模块，避免页面过长。

### 2. 请假工时成本估算（LeaveCostEstimator）

- 触发方式：按钮点击打开 Modal 弹窗
- 月薪存储：`localStorage` key = `salary_${userId}_${yearMonth}`
- 计算公式：
  - 时薪 = 月薪 / 应出勤天数 / 8
  - 事假成本 = 事假小时数 × 时薪
  - 病假成本 = 病假小时数 × 时薪 × 比例（默认100%，可配置）
  - 总成本 = 各类假期成本之和
- 未输入月薪时显示 "-"

### 3. 工时利用率（WorkHoursUtilization）

- 公式：`(应出勤天数×8×60 - 迟到分钟数 + 加班分钟数) / (应出勤天数×8×60) × 100%`
- 展示：概览卡片显示公司平均值，点击展开员工排行

### 4. 星期维度异常热力图（WeekdayHeatmap）

- 数据源：遍历 `AttendanceMap`，按 `new Date(year, month, day).getDay()` 分组
- 展示：使用 recharts `BarChart` 分组柱状图（周一~周五，迟到/缺卡两组）
- 颜色：根据数值映射深浅色

### 5. 请假类型占比（LeaveTypePieChart）

- 数据源：汇总 `EmployeeStats` 中 `annualHours`, `sickHours`, `personalHours`, `compTimeHours`, `tripHours`, `bereavementHours`, `paternityHours`, `maternityHours`, `parentalHours`, `marriageHours`
- 展示：recharts `PieChart` 环形图
- 过滤：小时数为0的类别不显示

### 6. 连续请假/缺勤预警（ConsecutiveAbsenceAlert）

- 扫描逻辑：遍历 `AttendanceMap` 每个用户的每日状态
  - 请假判定：当日有 `procInstId` 且对应审批为请假类型
  - 缺勤判定：`status === 'incomplete'` 或 `status === 'abnormal'`（无审批记录）
- 阈值：连续 ≥ 3天
- 展示：预警列表（员工名、天数、日期范围）

### 7. 月度环比对比（MonthOverMonthComparison）

- 上月数据获取：调用 `getLatestSnapshot(companyId, prevYearMonth, 'attendance')`
- 对比指标：迟到总人次、缺卡总次数、全勤率、平均出勤率、请假总时长
- 展示：指标卡片 + 箭头（↑↓）+ 颜色（红/绿）
- 无上月数据时显示提示

### 8. 跨公司横向对比（CrossCompanyComparison）

- 条件：仅 `activeCompany === '全部'` 时渲染
- 数据源：遍历 `companyEmployeeStats` 各公司
- 指标：出勤率、迟到率、全勤率、人均请假时长
- 展示：recharts `BarChart` 分组柱状图

### 9. 新员工考勤关注（NewEmployeeWatch）

- 筛选条件：`new Date() - new Date(user.create_time) <= 90天`（3个月）
- 展示：表格（姓名、入职日期、迟到次数、缺卡次数、请假天数）
- 异常标识：有考勤异常的用红色标注

### 10. 累计风险评分（RiskScoreRanking）

- 公式：`迟到分钟数 × 0.3 + 缺卡次数 × 10 × 0.3 + 旷工次数 × 50 × 0.4`
- 展示：排行榜（从高到低），超过阈值（如50分）红色高亮
- 使用 lateExemptionEnabled 决定用 exemptedLateMinutes 还是 lateMinutes

### 11. 加班合规监控（OvertimeComplianceTable）

- 数据源：`EmployeeStats.overtimeTotalMinutes / 60`
- 阈值：30h 黄色预警，36h 红色警告
- 概览：合规人数 / 预警人数 / 超标人数
- 展示：表格 + 状态标签

## Integration Plan

### 对现有代码的修改（最小化）

仅在 `AttendanceDashboard.tsx` 的 `CompanyDashboardView` 组件中添加：

1. 顶部 import：
```tsx
import { AttendanceAnalytics } from './AttendanceAnalytics.tsx';
```

2. 在 `AccordionSection("数据分析与洞察")` 闭合标签之后、`AttendanceStatsTable` 容器之前，添加：
```tsx
<div className="flex-shrink-0 px-6">
  <AttendanceAnalytics
    companyEmployeeStats={companyEmployeeStats}
    companyAggregate={companyAggregate}
    attendanceMap={attendanceMap}
    processDataMap={processDataMap}
    holidays={holidays}
    activeCompany={activeCompany}
    year={year}
    month={month}
    allUsers={allUsers ?? []}
    dailyTrend={dailyTrend}
    lateExemptionEnabled={lateExemptionEnabled}
  />
</div>
```

### 不修改的文件
- `useAttendanceStats.ts` — 不修改计算逻辑
- `AttendanceDashboardPage.tsx` — 不修改数据流
- `AttendanceStatsTable.tsx` — 不修改表格
- `AttendanceShared.tsx` — 仅复用 AccordionSection、Avatar

## UI/UX Design

### 布局方案
- 使用 `AccordionSection` 包裹，默认收起（`defaultOpen={false}`），避免影响现有页面加载体验
- 内部使用 grid 布局：
  - 第一行：3列概览卡片（工时利用率、加班合规概览、风险评分概览）
  - 第二行：2列图表（请假类型饼图 + 星期热力图）
  - 第三行：预警区域（连续缺勤 + 新员工关注）
  - 第四行：条件渲染（跨公司对比 / 月度环比）
  - 底部：请假成本估算按钮

### 颜色规范
- 正面指标（全勤率↑）：`text-emerald-600` / `bg-emerald-50`
- 负面指标（迟到↑）：`text-red-600` / `bg-red-50`
- 预警：`text-amber-600` / `bg-amber-50`
- 中性：`text-slate-600` / `bg-slate-50`

### 响应式
- 使用 Tailwind `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` 适配不同屏幕

## Error Handling

```tsx
// 在 AttendanceAnalytics 顶层使用 ErrorBoundary 模式
try {
  // 渲染分析内容
} catch (error) {
  console.error('[AttendanceAnalytics] Error:', error);
  return <div className="text-slate-400 text-sm p-4">数据分析模块加载异常，不影响主功能使用。</div>;
}
```

## Performance Considerations

- `useMemo` 缓存所有计算结果，依赖项为 `[companyEmployeeStats, attendanceMap, activeCompany, year, month]`
- 月度环比数据使用 `useState` + `useEffect` 异步加载，避免阻塞首屏
- 请假成本估算为弹窗，按需渲染
- `defaultOpen={false}` 确保折叠时不执行内部渲染

## Dependencies

- `recharts`（已安装）：BarChart, PieChart, ResponsiveContainer, Cell, XAxis, YAxis, Tooltip, Legend
- `AccordionSection`（已有）：来自 `AttendanceShared.tsx`
- `Modal`（已有）：来自 `components/Modal.tsx`
- `getLatestSnapshot`（已有）：来自 `services/reportSnapshotApiService.ts`
- `localStorage`：存储员工月薪数据
