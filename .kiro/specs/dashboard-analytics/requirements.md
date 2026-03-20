# Requirements Document

## Introduction

在现有考勤仪表盘基础上，新增多维度数据分析功能，为行政和财务人员提供更深入的考勤洞察。所有新功能以独立模块形式添加，不修改现有功能的逻辑代码。

## Glossary

- **Dashboard**: 考勤仪表盘主页面，展示公司级考勤统计数据
- **EmployeeStats**: 员工考勤统计数据结构，包含迟到、缺卡、旷工、请假、加班等字段
- **AttendanceMap**: 员工每日考勤状态映射，userId -> day -> DailyAttendanceStatus
- **Analytics_Module**: 新增的数据分析模块，以独立组件形式嵌入仪表盘
- **CompanyEmployeeStats**: 按公司分组的员工统计数据，Record<companyName, Array<{user, stats}>>
- **Standard_Work_Hours**: 标准日工时，固定为8小时

## Requirements

### Requirement 1: 请假工时成本估算

**User Story:** As a 财务专员, I want to 输入员工月薪并自动计算请假工时成本, so that I can 快速估算请假对薪资的影响。

#### Acceptance Criteria

1. WHEN 用户点击"请假成本估算"入口, THE Analytics_Module SHALL 展示一个独立弹窗，列出当前公司所有有请假记录的员工
2. WHEN 用户为某员工输入月薪金额, THE Analytics_Module SHALL 根据该员工当月应出勤天数×8小时计算时薪（时薪 = 月薪 / 应出勤天数 / 8）
3. WHEN 时薪计算完成, THE Analytics_Module SHALL 分别计算事假成本（事假小时数×时薪）、病假成本（病假小时数×时薪×比例）和总请假成本
4. WHEN 用户输入多个员工的月薪, THE Analytics_Module SHALL 在底部汇总展示全公司请假总成本
5. IF 用户未输入月薪, THEN THE Analytics_Module SHALL 该员工行显示"-"而非0元
6. WHEN 用户输入的月薪数据变化, THE Analytics_Module SHALL 将月薪数据持久化到 localStorage 以便下次使用

### Requirement 2: 工时利用率

**User Story:** As a 行政主管, I want to 查看团队的工时利用率, so that I can 了解实际工作投入程度。

#### Acceptance Criteria

1. WHEN 仪表盘加载完成, THE Analytics_Module SHALL 计算每个员工的工时利用率：(应出勤天数×8×60 - 迟到分钟数 + 加班分钟数) / (应出勤天数×8×60) × 100%
2. WHEN 工时利用率计算完成, THE Analytics_Module SHALL 在数据分析区域展示公司平均工时利用率
3. WHEN 用户点击工时利用率卡片, THE Analytics_Module SHALL 展示员工级别的工时利用率排行

### Requirement 3: 星期维度异常热力图

**User Story:** As a 行政主管, I want to 查看按星期分布的考勤异常情况, so that I can 发现规律性的考勤问题。

#### Acceptance Criteria

1. WHEN 仪表盘数据加载完成, THE Analytics_Module SHALL 从 AttendanceMap 中按星期一到星期五聚合迟到和缺卡人次
2. WHEN 聚合完成, THE Analytics_Module SHALL 以热力图或柱状图形式展示每个星期几的迟到人次和缺卡人次
3. WHEN 用户查看热力图, THE Analytics_Module SHALL 用颜色深浅区分异常严重程度（数值越高颜色越深）

### Requirement 4: 请假类型占比

**User Story:** As a 行政专员, I want to 查看各类假期的占比分布, so that I can 了解团队请假结构和健康状况。

#### Acceptance Criteria

1. WHEN 仪表盘数据加载完成, THE Analytics_Module SHALL 汇总所有员工的各类假期小时数（年假、病假、事假、调休、产假、婚假、丧假、陪产假、育儿假）
2. WHEN 汇总完成, THE Analytics_Module SHALL 以环形图或饼图展示各类假期占总请假时长的百分比
3. WHEN 某类假期小时数为0, THE Analytics_Module SHALL 在图表中隐藏该类别

### Requirement 5: 连续请假/缺勤预警

**User Story:** As a 行政主管, I want to 自动检测连续多天请假或缺勤的员工, so that I can 及时跟进异常情况。

#### Acceptance Criteria

1. WHEN 仪表盘数据加载完成, THE Analytics_Module SHALL 扫描 AttendanceMap 检测连续3天及以上请假或缺勤（缺卡+旷工）的员工
2. WHEN 检测到连续缺勤员工, THE Analytics_Module SHALL 在预警区域展示员工姓名、连续缺勤天数和日期范围
3. WHEN 无连续缺勤员工, THE Analytics_Module SHALL 显示"暂无连续缺勤预警"

### Requirement 6: 月度环比对比

**User Story:** As a 管理层, I want to 查看关键考勤指标的月度变化趋势, so that I can 判断考勤管理是否在改善。

#### Acceptance Criteria

1. WHEN 用户查看月度环比, THE Analytics_Module SHALL 加载上月同公司的考勤数据进行对比
2. WHEN 对比数据就绪, THE Analytics_Module SHALL 展示以下指标的环比变化：迟到总人次、缺卡总次数、全勤率、平均出勤率、请假总时长
3. WHEN 指标上升, THE Analytics_Module SHALL 用红色向上箭头标识（迟到/缺卡等负面指标）或绿色向上箭头（全勤率等正面指标）
4. IF 上月数据不可用, THEN THE Analytics_Module SHALL 显示"暂无上月数据"

### Requirement 7: 跨公司横向对比

**User Story:** As a 管理层, I want to 在"全部"视图下对比各公司的考勤表现, so that I can 发现管理差异。

#### Acceptance Criteria

1. WHILE 用户处于"全部"tab, THE Analytics_Module SHALL 展示跨公司对比视图
2. WHEN 对比视图加载, THE Analytics_Module SHALL 以分组柱状图展示各公司的出勤率、迟到率、全勤率、人均请假时长
3. WHEN 用户处于单个公司tab, THE Analytics_Module SHALL 隐藏跨公司对比视图

### Requirement 8: 新员工考勤关注

**User Story:** As a HR专员, I want to 单独查看试用期员工的考勤表现, so that I can 为转正评估提供依据。

#### Acceptance Criteria

1. WHEN 仪表盘数据加载完成, THE Analytics_Module SHALL 筛选入职3个月内的员工（基于 create_time 或 hired_date）
2. WHEN 筛选完成, THE Analytics_Module SHALL 展示新员工列表及其考勤摘要（迟到次数、缺卡次数、请假天数）
3. WHEN 新员工有考勤异常, THE Analytics_Module SHALL 用醒目标识标注
4. WHEN 无新员工, THE Analytics_Module SHALL 显示"当前无试用期员工"

### Requirement 9: 累计风险评分

**User Story:** As a 行政主管, I want to 查看员工的综合考勤风险评分, so that I can 识别需要重点关注的员工。

#### Acceptance Criteria

1. WHEN 仪表盘数据加载完成, THE Analytics_Module SHALL 为每个员工计算风险评分：迟到分钟数权重30% + 缺卡次数×10权重30% + 旷工次数×50权重40%
2. WHEN 风险评分计算完成, THE Analytics_Module SHALL 按评分从高到低排列展示风险排行榜
3. WHEN 员工风险评分超过阈值, THE Analytics_Module SHALL 用红色高亮标识

### Requirement 10: 加班合规监控

**User Story:** As a 法务/行政专员, I want to 监控员工月度加班时长是否超过法定上限, so that I can 避免用工合规风险。

#### Acceptance Criteria

1. WHEN 仪表盘数据加载完成, THE Analytics_Module SHALL 计算每个员工的月度加班小时数（overtimeTotalMinutes / 60）
2. WHEN 加班小时数超过30小时, THE Analytics_Module SHALL 用黄色预警标识
3. WHEN 加班小时数超过36小时, THE Analytics_Module SHALL 用红色警告标识并标注"超出法定上限"
4. THE Analytics_Module SHALL 展示加班合规概览：合规人数、预警人数、超标人数

### Requirement 11: 非侵入性约束

**User Story:** As a 开发者, I want to 确保新功能不影响现有模块, so that I can 安全地增量开发。

#### Acceptance Criteria

1. THE Analytics_Module SHALL 以独立组件文件形式存在，不修改现有组件的内部逻辑
2. THE Analytics_Module SHALL 仅通过 props 接收现有数据（companyEmployeeStats、attendanceMap、companyAggregate 等），不修改数据源
3. WHEN Analytics_Module 发生错误, THE Dashboard SHALL 继续正常运行，分析模块的错误不影响主功能
4. THE Analytics_Module SHALL 所有新增状态管理在自身组件内部完成，不污染父组件状态
