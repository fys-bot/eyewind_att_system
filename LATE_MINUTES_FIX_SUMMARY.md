# 迟到分钟数不显示问题 - 最终修复方案

## 问题根源

经过详细调试，发现问题的根本原因是：**钉钉API返回的 `workDate` 字段不是工作日期，而是打卡时间**。

### 证据
从控制台日志可以看到：
```
{用户: '林长恒', 日期: '2026-02-08', 打卡时间: '2/9/2026, 9:28:24 AM'}
```

- 工作日期：2026-02-08（2月8日）
- 打卡时间：2/9/2026, 9:28:24 AM（2月9日上午9:28）

这说明员工在 2月9日上午9:28 打卡，但这次打卡是为了 2月8日 的考勤（跨天打卡）。

### 当前代码的问题

在 `useAttendanceStats.ts` 中：
```typescript
const workDateValue = daily.records[0].workDate;
const workDate = parseWorkDate(workDateValue); // 解析出 2月9日
const day = workDate.getDate(); // day = 9
const year = workDate.getFullYear(); // year = 2026
const month = workDate.getMonth(); // month = 1 (2月)
```

然后使用这些变量构造工作日期：
```typescript
const correctWorkDate = new Date(year, month, day); // 2026-02-09
```

结果仍然是错误的日期（2月9日），而不是实际的工作日期（2月8日）。

## 解决方案

**关键发现**：`attendanceMap` 的结构是 `{[userId]: {[day]: DailyAttendanceStatus}}`，其中 `day` 就是正确的工作日期！

我们应该使用 `attendanceMap` 的 key（day）作为工作日期，而不是从 `workDate` 字段解析。

### 修复代码

在 `useAttendanceStats.ts` 中，修改循环逻辑：

```typescript
// 当前错误的代码
Object.values(userAttendance).forEach((daily: DailyAttendanceStatus) => {
    const workDateValue = daily.records[0].workDate;
    const workDate = parseWorkDate(workDateValue);
    const day = workDate.getDate(); // ❌ 错误：从打卡时间解析
    const year = workDate.getFullYear();
    const month = workDate.getMonth();
    // ...
});

// 修复后的代码
Object.entries(userAttendance).forEach(([dayKey, daily]: [string, DailyAttendanceStatus]) => {
    const day = parseInt(dayKey); // ✅ 正确：使用 attendanceMap 的 key
    const year = currentYear; // ✅ 使用查询参数中的年份
    const month = currentMonth; // ✅ 使用查询参数中的月份
    
    // 构造正确的工作日期
    const workDate = new Date(year, month, day);
    // ...
});
```

### 为什么这样修复是正确的

1. `attendanceMap` 的结构保证了 key 就是工作日期的天数
2. `currentYear` 和 `currentMonth` 是从查询参数传入的，是正确的年月
3. 这样构造的 `workDate` 就是真正的工作日期，而不是打卡时间

## 实施步骤

1. 修改 `useAttendanceStats.ts` 中的循环逻辑
2. 删除所有从 `daily.records[0].workDate` 解析日期的代码
3. 直接使用 `attendanceMap` 的 key 和查询参数构造工作日期
4. 测试验证

## 预期结果

修复后，控制台日志应该显示：
```
[AttendanceRuleEngine.calculateLateMinutes] 被调用 {
    用户: '林长恒', 
    日期: '2026-02-09',  // ✅ 正确的工作日期
    打卡时间: '2/9/2026, 9:28:24 AM'
}
[AttendanceRuleEngine] 使用默认规则: 工作开始时间09:00, 迟到28分钟
[统计] 林长恒 2026-02-09: 迟到28分钟, 累计28分钟
```

考勤日历和仪表盘应该正确显示"迟到28分钟"。
