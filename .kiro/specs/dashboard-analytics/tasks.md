# Tasks Document: 考勤仪表盘数据分析模块

## Task 1: 创建分析工具函数文件 (analyticsUtils.ts)
- [x] 创建 `components/attendance/dashboard/analyticsUtils.ts`
- [x] 实现 `calcWorkHoursUtilization(stats: EmployeeStats): number` — 工时利用率计算
- [x] 实现 `calcRiskScore(stats: EmployeeStats, useLateExemption: boolean): number` — 风险评分计算
- [x] 实现 `calcWeekdayAnomalies(attendanceMap, holidays, year, month)` — 星期维度异常聚合
- [x] 实现 `calcLeaveTypeDistribution(employees)` — 请假类型占比汇总
- [x] 实现 `detectConsecutiveAbsence(attendanceMap, processDataMap, holidays, year, month, threshold)` — 连续缺勤检测
- [x] 实现 `calcOvertimeCompliance(employees)` — 加班合规统计
- [x] 实现 `filterNewEmployees(users, employees, referenceDate)` — 新员工筛选
- [x] 实现 `calcCrossCompanyMetrics(companyEmployeeStats)` — 跨公司指标计算
- [x] 实现 `calcLeaveCost(stats, monthlySalary, shouldAttendanceDays)` — 请假成本计算

## Task 2: 创建主入口组件 (AttendanceAnalytics.tsx) — 骨架
- [x] 创建 `components/attendance/dashboard/AttendanceAnalytics.tsx`
- [x] 定义 `AttendanceAnalyticsProps` 接口
- [x] 实现 `AttendanceAnalytics` 组件骨架，使用 `AccordionSection` 包裹
- [x] 添加 ErrorBoundary 错误处理
- [x] 设置 `defaultOpen={false}`

## Task 3: 实现概览卡片区域
- [x] 实现工时利用率概览卡片（公司平均值）
- [x] 实现加班合规概览卡片（合规/预警/超标人数）
- [x] 实现风险评分概览卡片（高风险人数）
- [x] 使用 grid 3列布局

## Task 4: 实现请假类型占比环形图
- [x] 使用 recharts PieChart 实现环形图
- [x] 汇总各类假期小时数（年假、病假、事假、调休、出差等）
- [x] 过滤小时数为0的类别
- [x] 添加 Tooltip 和 Legend

## Task 5: 实现星期维度异常热力图
- [x] 遍历 AttendanceMap 按星期聚合迟到/缺卡人次
- [x] 使用 recharts BarChart 分组柱状图展示
- [x] 颜色深浅映射异常严重程度

## Task 6: 实现连续请假/缺勤预警
- [x] 扫描 AttendanceMap 检测连续 ≥ 3天请假或缺勤
- [x] 展示预警列表（员工名、天数、日期范围）
- [x] 无预警时显示"暂无连续缺勤预警"

## Task 7: 实现新员工考勤关注
- [x] 筛选入职3个月内的员工
- [x] 展示表格（姓名、入职日期、迟到次数、缺卡次数、请假天数）
- [x] 异常标识红色标注
- [x] 无新员工时显示提示

## Task 8: 实现累计风险评分排行
- [x] 计算每个员工风险评分（迟到30% + 缺卡30% + 旷工40%）
- [x] 按评分从高到低排列
- [x] 超过阈值红色高亮

## Task 9: 实现加班合规监控详情
- [x] 计算每个员工月度加班小时数
- [x] 30h黄色预警、36h红色警告
- [x] 展示合规概览 + 详情表格

## Task 10: 实现跨公司横向对比
- [x] 仅 activeCompany === '全部' 时渲染
- [x] 计算各公司出勤率、迟到率、全勤率、人均请假时长
- [x] 使用 recharts BarChart 分组柱状图

## Task 11: 实现月度环比对比
- [x] 调用 getLatestSnapshot 获取上月数据
- [x] 对比迟到总人次、缺卡总次数、全勤率、平均出勤率、请假总时长
- [x] 箭头 + 颜色标识变化方向
- [x] 无上月数据时显示提示

## Task 12: 实现请假工时成本估算弹窗
- [x] 按钮触发 Modal 弹窗
- [x] 列出有请假记录的员工
- [x] 支持输入月薪，持久化到 localStorage
- [x] 计算时薪和各类假期成本
- [x] 底部汇总全公司请假总成本
- [x] 未输入月薪显示 "-"

## Task 13: 集成到 CompanyDashboardView
- [x] 在 `AttendanceDashboard.tsx` 中 import AttendanceAnalytics
- [x] 在"数据分析与洞察"AccordionSection 之后添加组件
- [x] 透传所有必要 props
- [x] 验证不影响现有功能

## Task 14: 重构为 Tab 分模块布局
- [x] 在抽屉头部添加 Tab 导航栏（数据概览、加班分析、人员关注、对比分析）
- [x] 将概览卡片 + 请假饼图 + 星期异常图归入「📊 数据概览」Tab
- [x] 将加班合规概览 + 部门加班分析归入「🏢 加班分析」Tab
- [x] 将风险评分概览 + 连续缺勤预警 + 新员工关注归入「⚠️ 人员关注」Tab
- [x] 将跨公司对比 + 月度环比归入「📈 对比分析」Tab
- [x] 请假成本估算按钮保留在所有 Tab 底部
- [x] 所有弹窗保持在 Tab 外部正常工作
