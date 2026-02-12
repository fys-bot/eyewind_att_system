# 简化跨天打卡规则配置 - 重构方案

## 目标
简化跨天打卡规则配置，删除详细的时间配置，改为从"迟到规则配置"读取时间阈值。

## 修改内容

### 1. Schema 修改 ✅
**文件**: `database/schema.ts`

```typescript
// 修改前
crossDayCheckout: {
    enabled: boolean;
    enableLookback?: boolean;
    lookbackDays?: number;
    rules: Array<{
        checkoutTime: string;
        nextCheckinTime: string;
        description: string;
        applyTo: 'day' | 'week' | 'month' | 'all';
        weekDays?: ('friday' | 'saturday' | 'sunday')[];
    }>;
};

// 修改后
crossDayCheckout: {
    enabled: boolean;
    enableLookback?: boolean;
    lookbackDays?: number;
};
```

### 2. 种子数据修改 ✅
**文件**: `server/src/seeds/002_default_attendance_rules.ts`

删除 `crossDayCheckout.rules` 数组，只保留开关和追溯天数。

### 3. 规则引擎重构 ✅
**文件**: `components/attendance/AttendanceRuleEngine.ts`

**核心逻辑变更**:
- ✅ 删除 `applyUnifiedCrossDayRule` 方法
- ✅ 新增 `applyLateRulesForCrossDay` 方法
- ✅ 修改 `calculateLateMinutes` 方法，改为使用 `lateRules` 来判断
- ✅ 删除废弃的方法：`applyCrossMonthRule`, `applyCrossWeekRule`, `applyCrossDayRule`
- ✅ 跨天/跨周/跨月都使用相同的逻辑：根据前一时段下班时间，匹配 `lateRules` 中的规则

**新逻辑**:
```typescript
// 1. 找到前一时段的下班时间（可能是昨天、上周五、上月最后一天）
// 2. 遍历 lateRules，按 previousDayCheckoutTime 从晚到早排序
// 3. 如果前一时段下班时间 >= 规则的 previousDayCheckoutTime
//    则使用规则的 lateThresholdTime 作为上班基准时间
// 4. 计算迟到分钟数
```

### 4. UI 修改 ✅
**文件**: `components/settings/AttendanceRules.tsx`

删除跨天打卡规则的详细配置界面（规则1、规则2、规则3等），只保留：
- ✅ 启用跨天打卡开关
- ✅ 启用向前查询开关
- ✅ 最多追溯天数输入框
- ✅ 删除相关的管理函数：`addCrossDayRule`, `updateCrossDayRule`, `removeCrossDayRule`
- ✅ 修复 `convertDbConfigToFrontend` 函数，移除对 `rules` 数组的引用

### 5. 数据库迁移 ✅
**文件**: `server/src/migrations/007_simplify_cross_day_rules.ts`

创建新的迁移文件，清理现有数据库中的 `crossDayCheckout.rules` 数据。

## 实施步骤

1. ✅ 修改 Schema
2. ✅ 修改种子数据
3. ✅ 重构规则引擎（最关键）
4. ✅ 修改 UI 界面
5. ✅ 创建数据库迁移
6. ⏳ 测试验证

## 注意事项

- 这是一个破坏性变更，会影响现有配置
- 需要运行迁移脚本清理旧数据：`npm run migrate:latest`
- 确保"迟到规则配置"中有完整的规则（18:30、20:30、24:00等）
- 系统会自动识别跨天、跨周、跨月场景并应用对应规则

## 测试要点

1. 验证跨天规则：前一天20:30打卡，次日9:30前打卡不算迟到
2. 验证跨周规则：周五/周六/周日晚打卡，周一上班时间延迟
3. 验证跨月规则：上月最后一天晚打卡，本月第一个工作日上班时间延迟
4. 验证向前查询：如果昨天没有下班打卡，查询前几天的下班打卡
5. 验证UI：配置界面只显示开关和追溯天数，不显示详细规则配置

## 完成状态

✅ 所有代码修改已完成
✅ TypeScript 类型检查通过
⏳ 等待用户测试验证
