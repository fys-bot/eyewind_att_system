# Bug 修复：dayOfWeek 未定义错误

## 问题描述

在 `components/attendance/dashboard/useAttendanceStats.ts` 第 802 行出现运行时错误：

```
Uncaught ReferenceError: dayOfWeek is not defined
```

## 错误原因

在收集迟到记录时，代码使用了未定义的变量 `dayOfWeek`：

```typescript
stats.lateRecords.push({
    day: day,
    minutes: minutes,
    isWorkday: dayOfWeek >= 1 && dayOfWeek <= 5  // ❌ dayOfWeek 未定义
});
```

这个变量在当前作用域中不存在。

## 修复方案

使用已经计算好的 `isWorkDay` 变量来判断是否是工作日：

```typescript
stats.lateRecords.push({
    day: day,
    minutes: minutes,
    isWorkday: isWorkDay  // ✅ 使用已定义的 isWorkDay 变量
});
```

## 为什么使用 isWorkDay

`isWorkDay` 变量在代码的第 424-429 行已经正确计算，它考虑了：

1. **周末判断**：`isWeekend = workDate.getDay() === 0 || workDate.getDay() === 6`
2. **节假日配置**：从 `holidays` 对象读取节假日信息
3. **补班日处理**：`holidayInfo.holiday === false` 表示补班日，算作工作日
4. **法定节假日**：`holidayInfo.holiday === true` 表示法定节假日，不算工作日

因此，`isWorkDay` 比简单的 `dayOfWeek >= 1 && dayOfWeek <= 5` 更准确，因为它考虑了：
- 补班日（周末但需要上班）
- 法定节假日（工作日但不需要上班）

## 影响范围

这个 bug 影响豁免计算功能，因为：
- 豁免只对工作日的迟到生效
- 如果 `isWorkday` 判断错误，会导致豁免计算不准确

## 测试验证

修复后，TypeScript 诊断检查通过，没有任何错误。

## 相关文件

- `components/attendance/dashboard/useAttendanceStats.ts` - 已修复

## 修复日期

2026-02-25
