# 考勤确认模块 - 从仪表盘导入数据功能

## 功能概述

在考勤确认模块添加了"从仪表盘导入数据"按钮，允许用户直接从考勤仪表盘的缓存数据中导入考勤记录，无需重新上传CSV文件。

## 实现逻辑

### 1. 缓存检查机制

- **检查时机**: 当用户进入考勤确认模块且没有数据时
- **检查内容**: 使用 `DashboardCache.getDashboardData()` 检查指定公司和月份的缓存数据
- **状态管理**: 
  - `hasDashboardCache`: 标识是否有可用的缓存数据
  - `isCheckingCache`: 标识正在检查缓存状态

### 2. 按钮状态

- **启用条件**: 
  - 仪表盘缓存中有对应月份的数据
  - 不在检查缓存状态中
  
- **禁用条件**:
  - 缓存中没有数据
  - 正在检查缓存
  - 提示用户："请先在考勤日历中加载数据后，才能使用导入功能"

### 3. 数据导入流程

#### 3.1 获取缓存数据
```typescript
const cachedData = await DashboardCache.getDashboardData(currentCompany, globalMonth);
```

缓存数据包含：
- `employees`: 员工列表
- `attendanceMap`: 考勤打卡数据
- `processDataMap`: 审批详情数据
- `companyCounts`: 公司统计数据

#### 3.2 生成EmployeeAttendanceRecord

使用与"生成确认单"相同的逻辑：

1. **过滤目标公司员工**
   ```typescript
   const companyUsers = employees.filter(u => {
       const userCompany = u.mainCompany || '';
       if (targetCompanyName === 'eyewind') {
           return userCompany.includes('风眼') || userCompany === 'eyewind';
       } else if (targetCompanyName === 'hydodo') {
           return userCompany.includes('海多多') || userCompany === 'hydodo';
       }
       return false;
   });
   ```

2. **生成每日状态**
   - 遍历每一天（1-31）
   - 检查请假类型（优先级最高）
   - 检查缺卡状态
   - 检查迟到状态
   - 默认为正常出勤（√）

3. **生成汇总数据**
   - 应出勤天数
   - 正常出勤天数
   - 是否全勤
   - 迟到分钟数
   - 豁免后迟到分钟数

4. **生成备注**
   - 请假记录（类型 + 日期 + 时长）
   - 缺卡记录（日期）
   - 加班记录（日期 + 时长）

#### 3.3 创建考勤确认单

```typescript
const newSheet: Omit<AttendanceSheet, 'id' | 'createdAt'> = {
    title: `${globalMonth.replace('-', '年')}月考勤确认单`,
    month: globalMonth,
    status: 'draft',
    settings: { /* 默认设置 */ },
    employeeRecords: records
};

await handleCreateSheet(newSheet);
```

## UI 变化

### 空状态页面（AttendanceEmptyState）

**之前**:
- 只有一个"创建考勤确认单"按钮

**现在**:
- "创建考勤确认单"按钮（蓝色）
- "从仪表盘导入"按钮（绿色，有缓存时启用）
- 提示文本（无缓存时显示）

### 按钮样式

**启用状态**:
```css
bg-green-600 hover:bg-green-700
```

**禁用状态**:
```css
bg-slate-100 text-slate-400 cursor-not-allowed
```

## 使用流程

1. 用户在考勤仪表盘查看某月数据（数据会被缓存）
2. 切换到考勤确认模块
3. 如果该月没有确认单数据，显示空状态页面
4. 点击"从仪表盘导入"按钮（如果有缓存数据）
5. 系统自动生成考勤确认单并跳转到详情页

## 技术细节

### 缓存键格式
```typescript
DASHBOARD_CACHE_${company}_${yearMonth}
```

例如：
- `DASHBOARD_CACHE_eyewind_2026-02`
- `DASHBOARD_CACHE_hydodo_2026-02`

### 数据验证

- 检查缓存数据是否存在
- 检查员工列表是否为空
- 检查目标公司是否有员工数据
- 错误时显示友好提示

### 错误处理

```typescript
try {
    // 导入逻辑
} catch (error) {
    console.error('[AttendancePage] 从仪表盘导入数据失败:', error);
    alert(error instanceof Error ? error.message : '导入失败');
} finally {
    setIsLoading(false);
}
```

## 相关文件

- `components/attendance/AttendancePage.tsx` - 主逻辑实现
- `components/attendance/EmptyState.tsx` - UI组件
- `components/attendance/utils.ts` - DashboardCache缓存管理
- `components/attendance/dashboard/AttendanceDashboardPage.tsx` - 生成确认单逻辑参考

## 优势

1. **无需重复上传**: 避免用户重复上传CSV文件
2. **数据一致性**: 使用与考勤日历相同的数据源
3. **操作便捷**: 一键导入，自动生成确认单
4. **智能提示**: 根据缓存状态动态显示按钮状态
5. **用户友好**: 清晰的提示信息和禁用状态说明

## 注意事项

1. 必须先在考勤日历中加载数据，才能使用导入功能
2. 导入的数据与考勤日历显示的数据完全一致
3. 导入后会自动创建草稿状态的确认单
4. 缓存数据按公司和月份隔离，不会混淆

## 完成时间
2026-02-25
