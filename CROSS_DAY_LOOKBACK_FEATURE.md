# 跨天打卡规则 - 向前查询功能

## 新增功能

### 1. 向前查询开关 (`enableLookback`)

**功能说明**：如果昨天没有下班打卡记录，系统会自动向前查询前几天的下班打卡时间，依此类推。

**使用场景**：
- 员工连续多天加班，但某天忘记打下班卡
- 周末加班但没有打卡，系统可以查找周五的下班时间
- 提高跨天规则的容错性和实用性

**配置位置**：考勤规则 → 行政管理 → 跨天打卡规则 → 启用向前查询

### 2. 最大查询天数 (`lookbackDays`)

**功能说明**：设置系统最多向前查询多少天的下班打卡记录。如果在指定天数内都没有找到下班打卡数据，就停止遍历。

**默认值**：3天

**取值范围**：1-30天

**配置位置**：考勤规则 → 行政管理 → 跨天打卡规则 → 最多向前查询天数

## 数据结构变更

### Schema 变更 (`database/schema.ts`)

```typescript
crossDayCheckout: {
    enabled: boolean; // 是否启用跨天打卡规则
    enableLookback?: boolean; // 🆕 是否启用向前查询
    lookbackDays?: number; // 🆕 最多向前查询多少天（默认3天）
    rules: Array<{
        checkoutTime: string;
        nextCheckinTime: string;
        description: string;
        applyTo: 'day' | 'week' | 'month' | 'all';
        weekDays?: ('friday' | 'saturday' | 'sunday')[];
    }>;
};
```

### 默认配置 (`components/attendance/utils.ts`)

**风眼科技**：
```typescript
crossDayCheckout: {
    enabled: true,
    enableLookback: true, // 启用向前查询
    lookbackDays: 3, // 最多向前查询3天
    rules: [...]
}
```

**海多多**：
```typescript
crossDayCheckout: {
    enabled: false,
    enableLookback: false,
    lookbackDays: 3,
    rules: []
}
```

## UI 界面变更

### 新增配置项

在"跨天打卡规则"模块中新增：

1. **启用向前查询** - 开关按钮
   - 说明文字："如果昨天没有下班打卡，就查询前一天的下班打卡时间，依此类推"
   
2. **最多向前查询天数** - 数字输入框
   - 范围：1-30天
   - 说明文字："如果多少天内没有下班打卡数据，就停止遍历"

### UI 布局

```
┌─────────────────────────────────────────────┐
│ 跨天打卡规则                    [已启用 2条规则] │
├─────────────────────────────────────────────┤
│ 启用跨天打卡: ⚪ 是  ⚫ 否                    │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ 启用向前查询                    [开关 ON] │ │
│ │ 如果昨天没有下班打卡，就查询前一天的...    │ │
│ │                                         │ │
│ │ 最多向前查询天数: [3] 天                 │ │
│ │ 如果多少天内没有下班打卡数据，就停止遍历  │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ 跨天打卡规则                                 │
│ ┌─────────────────────────────────────────┐ │
│ │ 规则 1                            [删除] │ │
│ │ 前一天打卡时间: 20:30                    │ │
│ │ 次日最晚打卡: 09:30                      │ │
│ │ 规则描述: ...                            │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

## 实现逻辑

### 查询流程

1. **检查是否启用向前查询**
   ```typescript
   if (!crossDayCheckout.enableLookback) {
       // 只查询昨天的下班打卡
       return getPreviousDayCheckout(today - 1);
   }
   ```

2. **向前遍历查询**
   ```typescript
   const maxDays = crossDayCheckout.lookbackDays || 3;
   for (let i = 1; i <= maxDays; i++) {
       const checkoutTime = getPreviousDayCheckout(today - i);
       if (checkoutTime) {
           return checkoutTime; // 找到了，返回
       }
   }
   return null; // 在指定天数内都没找到
   ```

3. **应用跨天规则**
   ```typescript
   if (checkoutTime) {
       // 根据下班时间应用相应的跨天规则
       applyUnifiedCrossDayRule(checkoutTime, ...);
   }
   ```

## 数据库字段映射

后端需要添加以下字段到 `attendance_rules` 表：

| 字段名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `cross_day_enable_lookback` | BOOLEAN | TRUE | 是否启用向前查询 |
| `cross_day_lookback_days` | INTEGER | 3 | 最多向前查询天数 |

### 数据库迁移脚本

需要创建新的迁移脚本添加这两个字段：

```sql
ALTER TABLE attendance_rules 
ADD COLUMN cross_day_enable_lookback BOOLEAN DEFAULT TRUE,
ADD COLUMN cross_day_lookback_days INTEGER DEFAULT 3;
```

## 使用示例

### 场景 1：连续加班

**情况**：
- 周一晚上 22:00 下班打卡
- 周二忘记打下班卡
- 周三早上 09:15 上班打卡

**配置**：
- `enableLookback`: true
- `lookbackDays`: 3

**结果**：
- 系统查找周二的下班打卡 → 没有
- 继续查找周一的下班打卡 → 找到 22:00
- 应用跨天规则：22:00 → 次日可 09:30 上班
- 周三 09:15 打卡 → 不算迟到 ✅

### 场景 2：周末加班

**情况**：
- 周五晚上 23:00 下班打卡
- 周六、周日没有打卡
- 周一早上 09:20 上班打卡

**配置**：
- `enableLookback`: true
- `lookbackDays`: 3

**结果**：
- 系统查找周日的下班打卡 → 没有
- 继续查找周六的下班打卡 → 没有
- 继续查找周五的下班打卡 → 找到 23:00
- 应用跨周规则：23:00 → 周一可 09:30 上班
- 周一 09:20 打卡 → 不算迟到 ✅

### 场景 3：超过查询天数

**情况**：
- 上周三晚上 22:00 下班打卡
- 之后连续 5 天没有下班打卡
- 本周二早上 09:15 上班打卡

**配置**：
- `enableLookback`: true
- `lookbackDays`: 3

**结果**：
- 系统向前查询 3 天都没有找到下班打卡
- 停止遍历，使用默认规则
- 本周二 09:15 打卡 → 按默认 09:00 基准判定，算迟到 15 分钟 ⚠️

## 注意事项

1. **性能考虑**
   - 建议 `lookbackDays` 不要设置过大（推荐 3-7 天）
   - 查询会在内存中的 `punchData` 中进行，不会额外查询数据库

2. **业务逻辑**
   - 向前查询只适用于 `applyTo='day'` 的跨天规则
   - 跨周规则（`applyTo='week'`）和跨月规则（`applyTo='month'`）有自己的查询逻辑

3. **数据完整性**
   - 确保 `punchData` 包含足够的历史数据
   - 参考 `CROSS_MONTH_DATA_FIX.md` 中的数据获取范围优化

## 相关文件

- `database/schema.ts` - 数据结构定义
- `components/attendance/utils.ts` - 默认配置
- `components/settings/AttendanceRules.tsx` - UI 界面（✅ 已实现）
- `components/settings/AttendanceRules.backup.tsx` - UI 界面（备份文件）
- `components/attendance/AttendanceRuleEngine.ts` - 规则引擎（需要实现查询逻辑）
- `components/attendance/dashboard/useAttendanceStats.ts` - 统计计算（需要实现查询逻辑）

## 后续工作

1. ✅ 更新数据结构定义
2. ✅ 更新默认配置
3. ✅ 更新 UI 界面（已添加到 AttendanceRules.tsx）
4. ⏳ 创建数据库迁移脚本（如果需要）
5. ⏳ 实现规则引擎中的向前查询逻辑
6. ⏳ 更新统计计算中的查询逻辑
7. ⏳ 测试各种场景
8. ⏳ 更新用户文档

## 更新日志

- 2024-02-11: 完成 UI 界面实现，已添加到实际使用的 `AttendanceRules.tsx` 文件中
