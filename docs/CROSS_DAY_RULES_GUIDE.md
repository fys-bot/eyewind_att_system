# 跨天打卡规则配置指南

## 概述

跨天打卡规则是一个统一的考勤规则系统，用于处理员工加班后第二天上班时间的调整。该规则支持三种场景：

- **跨天规则**：前一天加班影响第二天上班时间
- **跨周规则**：周五/周末加班影响周一上班时间
- **跨月规则**：上月最后一天加班影响本月第一天上班时间

## 规则配置

### 数据结构

```typescript
crossDayCheckout: {
  enabled: boolean;  // 是否启用跨天打卡规则
  rules: Array<{
    checkoutTime: string;        // 前一时段的下班时间阈值（如 "20:30"）
    nextCheckinTime: string;     // 下一时段的上班基准时间（如 "09:30"）
    description: string;         // 规则描述
    applyTo: 'day' | 'week' | 'month' | 'all';  // 应用场景
    weekDays?: ('friday' | 'saturday' | 'sunday')[];  // 跨周规则专用
  }>;
}
```

### 配置示例

#### 1. 跨天规则（普通工作日）

```json
{
  "checkoutTime": "20:30",
  "nextCheckinTime": "09:30",
  "description": "晚上8点半后打卡，第二天可9点半上班",
  "applyTo": "day"
}
```

**说明**：如果员工前一天晚上 20:30 之后下班，第二天可以 9:30 之前打卡不算迟到。

#### 2. 跨周规则（周五影响周一）

```json
{
  "checkoutTime": "20:30",
  "nextCheckinTime": "09:30",
  "description": "周五晚上8点半后打卡，周一可9点半上班",
  "applyTo": "week",
  "weekDays": ["friday"]
}
```

**说明**：如果员工周五晚上 20:30 之后下班，周一可以 9:30 之前打卡不算迟到。

#### 3. 跨月规则（上月最后一天影响本月第一天）

```json
{
  "checkoutTime": "00:00",
  "nextCheckinTime": "09:30",
  "description": "本月第一天默认9点半上班",
  "applyTo": "month"
}
```

**说明**：本月第一个工作日，默认 9:30 之前打卡不算迟到。

### 完整配置示例

```json
{
  "crossDayCheckout": {
    "enabled": true,
    "rules": [
      // 跨天规则
      {
        "checkoutTime": "20:30",
        "nextCheckinTime": "09:30",
        "description": "晚上8点半后打卡，第二天可9点半上班",
        "applyTo": "day"
      },
      {
        "checkoutTime": "24:00",
        "nextCheckinTime": "13:30",
        "description": "晚上12点后打卡，第二天可下午1点半上班",
        "applyTo": "day"
      },
      // 跨周规则
      {
        "checkoutTime": "20:30",
        "nextCheckinTime": "09:30",
        "description": "周五晚上8点半后打卡，周一可9点半上班",
        "applyTo": "week",
        "weekDays": ["friday"]
      },
      {
        "checkoutTime": "24:00",
        "nextCheckinTime": "13:30",
        "description": "周五晚上12点后打卡，周一可下午1点半上班",
        "applyTo": "week",
        "weekDays": ["friday"]
      },
      // 跨月规则
      {
        "checkoutTime": "00:00",
        "nextCheckinTime": "09:30",
        "description": "本月第一天默认9点半上班",
        "applyTo": "month"
      },
      {
        "checkoutTime": "24:00",
        "nextCheckinTime": "13:30",
        "description": "上月最后一天晚上12点后打卡，本月第一天可下午1点半上班",
        "applyTo": "month"
      }
    ]
  }
}
```

## 规则匹配逻辑

### 1. 场景判断

系统会自动判断当前是哪种场景：

- **跨天**：普通工作日（周二到周五）
- **跨周**：周一
- **跨月**：本月第一个工作日

### 2. 规则筛选

根据场景筛选适用的规则：

- 只有 `applyTo` 字段匹配当前场景的规则才会被考虑
- `applyTo: 'all'` 的规则适用于所有场景

### 3. 规则排序

按 `checkoutTime` 从晚到早排序，优先匹配最晚的规则。

### 4. 规则匹配

找到第一个满足条件的规则：

```
前一时段下班时间 >= 规则的 checkoutTime
```

### 5. 基准时间

使用匹配规则的 `nextCheckinTime` 作为上班基准时间。

## 使用场景

### 场景 1：普通加班

**情况**：员工周三晚上 21:00 下班

**规则匹配**：
- 场景：跨天（day）
- 匹配规则：`checkoutTime: "20:30"` → `nextCheckinTime: "09:30"`
- 结果：周四 9:30 之前打卡不算迟到

### 场景 2：深夜加班

**情况**：员工周四晚上 24:30 下班

**规则匹配**：
- 场景：跨天（day）
- 匹配规则：`checkoutTime: "24:00"` → `nextCheckinTime: "13:30"`
- 结果：周五 13:30 之前打卡不算迟到

### 场景 3：周五加班

**情况**：员工周五晚上 22:00 下班

**规则匹配**：
- 场景：跨周（week）
- 匹配规则：`checkoutTime: "20:30"` → `nextCheckinTime: "09:30"`
- 结果：周一 9:30 之前打卡不算迟到

### 场景 4：月末加班

**情况**：员工 1 月 31 日（上月最后一天）晚上 23:00 下班

**规则匹配**：
- 场景：跨月（month）
- 匹配规则：`checkoutTime: "00:00"` → `nextCheckinTime: "09:30"`
- 结果：2 月 1 日 9:30 之前打卡不算迟到

## 配置建议

### 1. 梯度设置

建议设置多个梯度的规则，根据加班时长给予不同的优惠：

```
20:30 → 09:30  (加班 2 小时，优惠 30 分钟)
22:00 → 10:00  (加班 3.5 小时，优惠 1 小时)
24:00 → 13:30  (加班 5.5 小时，优惠 4.5 小时)
```

### 2. 周末特殊处理

如果希望周六日加班也影响周一，可以配置：

```json
{
  "checkoutTime": "20:30",
  "nextCheckinTime": "09:30",
  "description": "周末加班影响周一",
  "applyTo": "week",
  "weekDays": ["friday", "saturday", "sunday"]
}
```

### 3. 月初特殊处理

建议为每月第一天设置一个默认的宽松规则：

```json
{
  "checkoutTime": "00:00",
  "nextCheckinTime": "09:30",
  "description": "本月第一天默认9点半上班",
  "applyTo": "month"
}
```

## 注意事项

1. **规则顺序**：系统会自动按 `checkoutTime` 排序，无需手动排序
2. **时间格式**：使用 24 小时制，格式为 `"HH:MM"`
3. **请假调整**：如果员工有请假，系统会自动调整基准时间
4. **优先级**：跨月 > 跨周 > 跨天
5. **向后兼容**：旧的三个独立配置会自动转换为新格式

## 迁移指南

### 从旧格式迁移

如果你的系统使用旧的三个独立配置（`crossDayCheckout`、`crossWeekCheckout`、`crossMonthCheckout`），运行迁移脚本：

```bash
cd server
npm run migrate:latest
```

迁移脚本会自动：
1. 合并三个独立配置为一个统一配置
2. 转换字段名称（`nextDayCheckinTime` → `nextCheckinTime`）
3. 添加 `applyTo` 字段
4. 保留所有现有规则

### 手动迁移

如果需要手动迁移，参考以下转换规则：

**旧格式（跨天）**：
```json
{
  "checkoutTime": "20:30",
  "nextDayCheckinTime": "09:30",
  "description": "..."
}
```

**新格式**：
```json
{
  "checkoutTime": "20:30",
  "nextCheckinTime": "09:30",
  "description": "...",
  "applyTo": "day"
}
```

## 常见问题

### Q1: 如果员工没有前一天的下班打卡怎么办？

A: 系统会使用默认的 9:00 作为基准时间。

### Q2: 可以禁用某个场景的规则吗？

A: 可以，只需删除对应 `applyTo` 的规则即可。

### Q3: 规则会影响全勤奖吗？

A: 不会，跨天规则只影响迟到判定，不影响全勤奖计算。

### Q4: 如何测试规则是否生效？

A: 查看考勤仪表盘的迟到记录，系统会显示应用的规则和计算结果。

## 技术支持

如有问题，请联系系统管理员或查看开发文档。
