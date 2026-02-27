# 绩效扣款计算修复

## 问题描述

用户反馈了两个问题：
1. 明明有豁免后迟到分钟数数据，但是考勤绩效这一列显示为0，没有正确计算绩效扣款
2. 岳可只迟到25分钟，但累计迟到显示为575分钟（包含了周末加班的550分钟）

## 根本原因

经过代码分析，发现了三个关键问题：

### 问题1：计算顺序错误

在 `useAttendanceStats.ts` 中，绩效扣款的计算顺序有误：

```typescript
// ❌ 错误：在豁免计算之前就计算绩效扣款
stats.performancePenalty = ruleEngine.calculatePerformancePenalty(stats.exemptedLateMinutes || 0);

// ... 后面才计算豁免
if (stats.lateRecords && stats.lateRecords.length > 0) {
    // 计算 exemptedLateMinutes
    stats.exemptedLateMinutes = ...
}
```

这导致 `calculatePerformancePenalty` 被调用时，`stats.exemptedLateMinutes` 还是 0 或 undefined，所以总是返回 0。

### 问题2：规则匹配逻辑不完善

在 `AttendanceRuleEngine.ts` 的 `calculatePerformancePenalty` 方法中，规则匹配逻辑存在问题：

```typescript
// ❌ 旧逻辑：可能无法正确处理有间隙的规则
for (const rule of sortedRules) {
    if (exemptedLateMinutes >= rule.minMinutes) {
        if (rule.maxMinutes === 999 || exemptedLateMinutes < rule.maxMinutes) {
            matchedRule = rule;
            break;
        } else {
            matchedRule = rule;
        }
    }
}
```

例如，规则配置为：
- 规则1: [0, 5) → 50元
- 规则2: [5, 10) → 100元
- 规则3: [15, 30) → 150元（注意：10-15之间有间隙）
- 规则4: [30, 45) → 200元
- 规则5: [45, 999) → 250元

当 `exemptedLateMinutes = 20` 时，旧逻辑可能无法正确匹配到规则3。

### 问题3：周末加班计算迟到

在 `useAttendanceStats.ts` 中，迟到计算没有判断是否是工作日：

```typescript
// ❌ 错误：周末加班也计算迟到
if (minutes > 0) {
    stats.late++;
    stats.lateMinutes += minutes;
    // ...
}
```

这导致周末加班（如24号周六）也被计算为迟到，累加了550分钟的"迟到"时间。

## 修复方案

### 修复1：调整计算顺序

将绩效扣款的计算移到豁免计算之后：

```typescript
// ✅ 正确：先计算豁免
if (stats.lateRecords && stats.lateRecords.length > 0) {
    // 计算 exemptedLateMinutes
    stats.exemptedLateMinutes = ...
}

// ✅ 然后再计算绩效扣款
stats.performancePenalty = ruleEngine.calculatePerformancePenalty(stats.exemptedLateMinutes || 0);
```

### 修复2：优化规则匹配逻辑

改进规则匹配算法，确保能正确处理有间隙的规则：

```typescript
// ✅ 新逻辑：先尝试精确匹配
let matchedRule = null;
for (const rule of sortedRules) {
    // 检查是否在范围内：minMinutes <= exemptedLateMinutes < maxMinutes
    if (exemptedLateMinutes >= rule.minMinutes && exemptedLateMinutes < rule.maxMinutes) {
        matchedRule = rule;
        break; // 找到精确匹配，立即返回
    }
}

// ✅ 如果没有精确匹配，找到最后一个 minMinutes <= exemptedLateMinutes 的规则
if (!matchedRule) {
    for (let i = sortedRules.length - 1; i >= 0; i--) {
        if (exemptedLateMinutes >= sortedRules[i].minMinutes) {
            matchedRule = sortedRules[i];
            break;
        }
    }
}
```

### 修复3：周末加班不计算迟到

添加工作日判断，只有工作日才计算迟到：

```typescript
// ✅ 正确：只有工作日才计算迟到
if (minutes > 0 && isWorkDay) {
    stats.late++;
    stats.lateMinutes += minutes;
    // ...
}
```

### 修复4：添加调试日志

添加详细的调试日志，方便排查问题：

```typescript
// 迟到累加日志
console.log(`[迟到累加] ${user.name} - ${date}: 本次迟到${minutes}分钟，累计迟到${stats.lateMinutes}分钟，isWorkDay=${isWorkDay}`);

// 周末加班跳过日志
console.log(`[迟到跳过] ${user.name} - ${date}: 周末加班，不计算迟到（原本会计算${minutes}分钟）`);

// 绩效扣款计算日志
console.log(`[calculatePerformancePenalty] 豁免后迟到${exemptedLateMinutes}分钟，匹配规则: [${matchedRule.minMinutes}, ${matchedRule.maxMinutes}) → ${matchedRule.penalty}元，最终扣款: ${penalty}元`);
```

## 测试验证

修复后，请按以下步骤验证：

1. 打开浏览器开发者工具的控制台
2. 进入考勤仪表盘页面
3. 查看控制台输出的调试日志，确认：
   - 周末加班是否被跳过（不计算迟到）
   - 豁免后迟到分钟数是否正确
   - 匹配的规则是否正确
   - 最终扣款金额是否正确

示例日志：
```
[迟到跳过] 岳可 - 2026-01-24: 周末加班，不计算迟到（原本会计算550分钟）
[迟到累加] 岳可 - 2026-01-26: 本次迟到25分钟，累计迟到25分钟，isWorkDay=true
[豁免计算] 岳可 - 豁免后迟到: 20分钟，已使用豁免次数: 1
[calculatePerformancePenalty] 豁免后迟到20分钟，匹配规则: [15, 30) → 150元，最终扣款: 150元
```

## 影响范围

- 文件：`components/attendance/AttendanceRuleEngine.ts`
- 文件：`components/attendance/dashboard/useAttendanceStats.ts`
- 影响功能：
  - 考勤仪表盘的绩效扣款列显示
  - 累计迟到分钟数计算（排除周末加班）
  - 豁免后迟到分钟数计算

## 后续建议

1. 如果调试日志显示规则匹配正确，可以移除或注释掉调试日志
2. 建议在考勤规则配置页面添加规则验证，确保规则之间没有重叠或遗漏
3. 考虑添加单元测试，覆盖各种边界情况（工作日、周末、节假日等）
4. 考虑添加配置项，允许用户选择周末加班是否计算迟到

## 修复时间

2026-02-26
