# 考勤表格视图切换和排序功能实现

## 概述
本次更新为考勤仪表盘的员工表格添加了视图切换功能和优化的排序逻辑，提升了数据查看的灵活性和效率。

## 实现的功能

### 1. 视图切换按钮
**位置**: 员工考勤表格上方

**功能**: 提供两种数据视图的切换
- **全部数据**（默认）：显示所有员工的考勤数据
- **仅异常数据**：只显示有异常的员工（有旷工、迟到或缺卡）

**UI设计**:
- 卡片式切换按钮，与现有设计风格一致
- 选中状态有明显的视觉反馈（白色背景 + 阴影）
- 支持深色模式

**统计信息显示**:
- 显示当前筛选结果数量 / 总人数
- 显示异常人数和全勤人数统计

### 2. 优化的排序逻辑
**排序规则**（按优先级）:
1. **有旷工数据** - 排在最前面
   - 如果都有旷工，按旷工次数倒序
2. **有迟到数据** - 排在旷工之后
   - 如果都有迟到，按迟到分钟数倒序
3. **全勤数据** - 排在最后
4. **其他情况** - 按迟到分钟数倒序

**排序特点**:
- 自动将问题员工排在前面，便于快速识别和处理
- 全勤员工排在最后，作为正面榜样
- 同类别内按严重程度排序

### 3. 异常数据过滤
**过滤条件**（满足任一即为异常）:
- 旷工次数 > 0
- 迟到分钟数 > 0
- 缺卡次数 > 0

## 修改的文件

### `components/attendance/dashboard/AttendanceStatsTable.tsx`

#### 1. 新增状态管理
```typescript
const [viewMode, setViewMode] = useState<'all' | 'abnormal'>('all');
```

#### 2. 新增过滤和排序逻辑
```typescript
const filteredAndSortedEmployees = useMemo(() => {
    // 第一步：根据视图模式过滤
    let filtered = [...employees];
    
    if (viewMode === 'abnormal') {
        // 只显示异常数据：有旷工、有迟到、有缺卡的员工
        filtered = filtered.filter(({ stats }) => {
            const hasAbsenteeism = (stats.absenteeism || 0) > 0;
            const hasLate = getLateMinutesValue(stats) > 0;
            const hasMissing = (stats.missing || 0) > 0;
            return hasAbsenteeism || hasLate || hasMissing;
        });
    }
    
    // 第二步：排序 - 矿工 → 迟到 → 全勤
    return filtered.sort((a, b) => {
        // 排序逻辑...
    });
}, [employees, viewMode, lateExemptionEnabled]);
```

#### 3. 新增统计信息
```typescript
const stats = useMemo(() => {
    const total = employees.length;
    const abnormal = employees.filter(/* 异常条件 */).length;
    const fullAttendance = employees.filter(({ stats }) => stats.isFullAttendance).length;
    
    return { total, abnormal, fullAttendance };
}, [employees, lateExemptionEnabled]);
```

#### 4. 新增切换按钮UI
```tsx
<div className="flex-shrink-0 bg-white dark:bg-slate-900 border-x border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center justify-between">
    <div className="flex items-center gap-4">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            显示 {filteredAndSortedEmployees.length} / {stats.total} 人
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400">
            异常 {stats.abnormal} 人 · 全勤 {stats.fullAttendance} 人
        </span>
    </div>
    <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-1">
        <button onClick={() => setViewMode('all')} ...>
            全部数据
        </button>
        <button onClick={() => setViewMode('abnormal')} ...>
            仅异常数据
        </button>
    </div>
</div>
```

## 用户体验改进

### 1. 快速定位问题员工
- 点击"仅异常数据"按钮，立即过滤出有问题的员工
- 异常员工自动按严重程度排序（旷工 > 迟到 > 缺卡）
- 减少滚动和查找时间

### 2. 清晰的数据统计
- 实时显示当前筛选结果数量
- 显示异常人数和全勤人数，便于快速了解整体情况
- 统计信息始终可见，无需额外操作

### 3. 灵活的数据查看
- 可以在全部数据和异常数据之间快速切换
- 默认显示全部数据，保持原有使用习惯
- 切换操作简单直观，无需学习成本

### 4. 一致的交互体验
- 切换按钮采用标准的卡片式设计
- 选中状态有明显的视觉反馈
- 支持深色模式，与整体UI风格一致

## 技术细节

### 排序算法
```typescript
// 1. 有旷工的排在最前面
if (aHasAbsenteeism && !bHasAbsenteeism) return -1;
if (!aHasAbsenteeism && bHasAbsenteeism) return 1;

// 2. 如果都有旷工，按旷工次数倒序
if (aHasAbsenteeism && bHasAbsenteeism) {
    return (b.stats.absenteeism || 0) - (a.stats.absenteeism || 0);
}

// 3. 有迟到的排在全勤前面
const aHasLate = aLateMinutes > 0;
const bHasLate = bLateMinutes > 0;

if (aHasLate && !bHasLate && !bIsFullAttendance) return -1;
if (!aHasLate && bHasLate && !aIsFullAttendance) return 1;

// 4. 如果都有迟到，按迟到分钟数倒序
if (aHasLate && bHasLate) {
    return bLateMinutes - aLateMinutes;
}

// 5. 全勤排在最后
if (aIsFullAttendance && !bIsFullAttendance) return 1;
if (!aIsFullAttendance && bIsFullAttendance) return -1;

// 6. 其他情况按迟到分钟数倒序
return bLateMinutes - aLateMinutes;
```

### 过滤逻辑
```typescript
if (viewMode === 'abnormal') {
    filtered = filtered.filter(({ stats }) => {
        const hasAbsenteeism = (stats.absenteeism || 0) > 0;
        const hasLate = getLateMinutesValue(stats) > 0;
        const hasMissing = (stats.missing || 0) > 0;
        return hasAbsenteeism || hasLate || hasMissing;
    });
}
```

### 性能优化
- 使用 `useMemo` 缓存过滤和排序结果
- 只在 `employees`、`viewMode` 或 `lateExemptionEnabled` 变化时重新计算
- 避免不必要的重新渲染

## 使用场景

### 场景1：日常考勤检查
1. 打开考勤仪表盘
2. 点击"仅异常数据"按钮
3. 快速查看有问题的员工
4. 按严重程度（旷工 > 迟到 > 缺卡）处理

### 场景2：月度考勤总结
1. 查看"全部数据"
2. 观察统计信息：异常人数、全勤人数
3. 切换到"仅异常数据"查看详细问题
4. 导出数据进行分析

### 场景3：员工考勤对比
1. 查看"全部数据"
2. 观察排序结果：旷工 → 迟到 → 全勤
3. 识别表现优秀和需要改进的员工
4. 制定针对性的管理措施

## 测试建议

### 1. 功能测试
- 点击"全部数据"按钮，验证显示所有员工
- 点击"仅异常数据"按钮，验证只显示有异常的员工
- 验证统计信息准确性（总人数、异常人数、全勤人数）

### 2. 排序测试
- 验证有旷工的员工排在最前面
- 验证有迟到的员工排在旷工之后
- 验证全勤员工排在最后
- 验证同类别内按严重程度排序

### 3. 边界情况测试
- 所有员工都是全勤
- 所有员工都有异常
- 没有员工数据
- 切换视图时的性能表现

### 4. UI测试
- 验证切换按钮的视觉反馈
- 验证深色模式下的显示效果
- 验证统计信息的显示位置和样式
- 验证响应式布局

## 后续优化建议

### 1. 更多过滤选项
- 按部门过滤
- 按异常类型过滤（只看旷工、只看迟到等）
- 按严重程度过滤（轻度、中度、重度）

### 2. 自定义排序
- 允许用户点击列标题自定义排序
- 支持多列排序
- 保存用户的排序偏好

### 3. 快速操作
- 批量选择异常员工
- 批量发送提醒通知
- 批量导出数据

### 4. 数据可视化
- 添加异常趋势图表
- 显示异常分布饼图
- 对比不同部门的异常率

## 总结

本次更新成功实现了考勤表格的视图切换和优化排序功能，显著提升了考勤管理的效率和用户体验。通过简单的切换按钮，用户可以快速在全部数据和异常数据之间切换，同时优化的排序逻辑确保问题员工始终排在前面，便于快速识别和处理。

功能实现简洁高效，符合现有的设计风格和交互模式，无需额外的学习成本。统计信息的实时显示也为用户提供了更全面的数据洞察。
