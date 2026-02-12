# 跨天打卡规则重构文档

## 重构目标
将原来的三个独立规则（跨天、跨周、跨月）合并为一个统一的跨天打卡规则系统。

## 数据结构变更

### 旧结构
```typescript
// 三个独立的规则配置
crossDayCheckout: {
  enabled: boolean;
  rules: Array<{
    checkoutTime: string;
    nextDayCheckinTime: string;
    description: string;
  }>;
}

crossWeekCheckout: {
  enabled: boolean;
  rules: Array<{
    checkoutTime: string;
    nextMondayCheckinTime: string;
    description: string;
  }>;
}

crossMonthCheckout: {
  enabled: boolean;
  rules: Array<{
    checkoutTime: string;
    nextMonthCheckinTime: string;
    description: string;
  }>;
}
```

### 新结构
```typescript
// 统一的跨天打卡规则
crossDayCheckout: {
  enabled: boolean;
  rules: Array<{
    checkoutTime: string;        // 前一时段的下班时间阈值
    nextCheckinTime: string;     // 下一时段的上班基准时间
    description: string;         // 规则描述
    applyTo: 'day' | 'week' | 'month' | 'all';  // 应用场景
    weekDays?: ('friday' | 'saturday' | 'sunday')[]; // 跨周规则的额外配置
  }>;
}
```

## 规则应用逻辑

### 统一的规则匹配流程
1. 根据当前场景（day/week/month）筛选适用的规则
2. 按 checkoutTime 从晚到早排序
3. 找到第一个匹配的规则（前一时段下班时间 >= 规则阈值）
4. 返回对应的 nextCheckinTime 作为上班基准时间

### 场景判断
- **跨天（day）**: 普通工作日，使用前一天的下班时间
- **跨周（week）**: 周一，使用周五/周六/周日的下班时间
- **跨月（month）**: 本月第一个工作日，使用上月最后一天的下班时间

## 修改文件清单
- [x] `database/schema.ts` - 数据结构定义
- [x] `components/attendance/utils.ts` - 默认配置
- [x] `components/attendance/AttendanceRuleEngine.ts` - 规则引擎逻辑
- [x] `server/src/seeds/002_default_attendance_rules.ts` - 数据库种子数据
- [ ] `components/settings/AttendanceRules.tsx` - 规则配置UI（待更新）

## 核心方法变更

### 新增方法
- `applyUnifiedCrossDayRule()` - 统一的跨天打卡规则应用方法

### 废弃方法（保留用于向后兼容）
- `applyCrossDayRule()` - 现在内部调用 `applyUnifiedCrossDayRule()`
- `applyCrossWeekRule()` - 现在内部调用 `applyUnifiedCrossDayRule()`
- `applyCrossMonthRule()` - 现在内部调用 `applyUnifiedCrossDayRule()`

## 向后兼容性
- 旧的三个方法被标记为 `@deprecated` 但仍然可用
- 它们内部调用新的统一方法，确保行为一致
- 数据库中的旧配置会在加载时自动转换为新格式

## 测试建议
1. 测试跨天规则：前一天晚上加班，第二天迟到计算
2. 测试跨周规则：周五晚上加班，周一迟到计算
3. 测试跨月规则：上月最后一天加班，本月第一天迟到计算
4. 测试规则优先级：多个规则匹配时，应选择最晚的规则
5. 测试请假调整：有请假时，基准时间应相应调整

## 下一步工作
- 更新 `components/settings/AttendanceRules.tsx` 的UI，支持新的统一配置界面
- 创建数据库迁移脚本，将现有的旧格式数据转换为新格式
- 更新用户文档，说明新的规则配置方式
