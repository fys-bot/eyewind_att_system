# Bug 修复：迟到数据丢失问题

## 问题描述

在添加豁免方式配置功能后，考勤仪表盘中的迟到相关数据全部显示为空或"0分钟"：
- 迟到次数：空
- 累计迟到(分)：0分钟
- 豁免后迟到(分)：0分钟
- 缺卡次数：空
- 矿工次数：空

## 根本原因

代码中有一个条件判断：

```typescript
if (record.checkType === 'OnDuty' && record.timeResult === 'Late' && !hasProcessedLate) {
    // 计算迟到分钟数
}
```

但是，**钉钉 API 返回的打卡数据中，`timeResult` 字段都是 `'Normal'`，没有 `'Late'` 标记**。

这导致迟到计算逻辑根本不会执行，所有迟到数据都是 0。

## 调试过程

1. **第一步**：修复了 `dayOfWeek is not defined` 错误
   - 将 `dayOfWeek >= 1 && dayOfWeek <= 5` 改为 `isWorkDay`
   - 这个修改是正确的，但没有解决数据丢失问题

2. **第二步**：添加调试日志，发现没有进入迟到计算逻辑
   - 添加日志：`console.log('[调试-进入迟到计算]')`
   - 发现没有任何输出

3. **第三步**：检查打卡记录
   - 添加日志打印所有打卡记录
   - 发现所有记录的 `timeResult` 都是 `'Normal'`，没有 `'Late'`

4. **第四步**：移除 `timeResult === 'Late'` 的检查
   - 对所有 `OnDuty` 记录都计算迟到分钟数
   - 数据恢复正常

## 修复方案

移除对 `timeResult === 'Late'` 的依赖，改为对所有上班打卡记录都计算迟到分钟数：

### 修复前：
```typescript
if (record.checkType === 'OnDuty' && record.timeResult === 'Late' && !hasProcessedLate) {
    // 计算迟到
}
```

### 修复后：
```typescript
if (record.checkType === 'OnDuty' && !hasProcessedLate) {
    // 计算迟到
}
```

## 为什么这样修复是正确的

1. **钉钉 API 的限制**：钉钉返回的 `timeResult` 不可靠，不能依赖它来判断是否迟到

2. **规则引擎的职责**：`ruleEngine.calculateLateMinutes()` 函数会根据考勤规则计算迟到分钟数
   - 如果没有迟到，返回 0
   - 如果迟到了，返回迟到的分钟数

3. **性能影响**：对所有 `OnDuty` 记录都调用计算函数，但：
   - 每天只计算一次（`hasProcessedLate` 标记）
   - 如果没有迟到，函数会快速返回 0
   - 性能影响可以忽略不计

## 相关修复

在修复这个问题的过程中，还修复了另一个 bug：

### Bug: dayOfWeek is not defined

**问题**：在收集迟到记录时使用了未定义的 `dayOfWeek` 变量

**修复**：改用已定义的 `isWorkDay` 变量

**优势**：`isWorkDay` 考虑了节假日和补班日，比简单的星期判断更准确

## 测试验证

修复后，梁嘉仁的打卡记录正确进入迟到计算逻辑：
```
[调试-进入迟到计算] 梁嘉仁 - 2号, checkType=OnDuty, timeResult=Normal
[调试-进入迟到计算] 梁嘉仁 - 3号, checkType=OnDuty, timeResult=Normal
...
```

数据恢复正常显示。

## 影响范围

- `components/attendance/dashboard/useAttendanceStats.ts` - 迟到计算逻辑

## 经验教训

1. **不要依赖外部 API 的标记**：钉钉的 `timeResult` 不可靠，应该由我们自己的规则引擎来判断
2. **充分的调试日志**：通过逐步添加调试日志，快速定位了问题
3. **理解数据流**：理解数据从哪里来，如何处理，才能找到问题的根源

## 修复日期

2026-02-25

## 状态

✅ 已修复并验证
