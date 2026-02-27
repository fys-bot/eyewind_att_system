# 豁免方式配置功能实现总结

## 功能概述
在考勤规则的"考勤弹性与豁免规则"中添加了豁免方式配置，支持两种豁免计算模式：
1. **按日期顺序**（默认）：从月初到月末依次豁免迟到记录
2. **按迟到时长**：优先豁免迟到时间最长的记录，最大化利用豁免次数

## 实现细节

### 1. 数据模型更新

#### database/schema.ts
在 `AttendanceRuleConfig` 接口中添加了新字段：
```typescript
lateExemptionMode: 'byDate' | 'byMinutes'; // 'byDate'=按日期从月初到月末, 'byMinutes'=按迟到分钟数从大到小
```

### 2. 默认配置更新

#### components/attendance/utils.ts
在 `DEFAULT_CONFIGS` 中为两个公司都添加了默认值：
```typescript
lateExemptionMode: 'byDate', // 默认按日期顺序
```

同时修复了 `crossDayCheckout` 配置中的 `rules` 数组问题（该字段已被简化，不再需要）。

### 3. UI 界面实现

#### components/settings/AttendanceRules.tsx
在"考勤弹性与豁免"模块中添加了豁免方式选择器：
- 使用单选按钮样式的卡片布局
- 两个选项：
  - **按日期顺序**：从月初到月末依次豁免迟到记录（默认方式）
  - **按迟到时长**：优先豁免迟到时间最长的记录
- 添加了提示文本："💡 提示：选择'按迟到时长'可以最大化利用豁免次数，减少员工的迟到分钟数"
- 当豁免功能关闭时，选择器会变灰且不可点击

### 4. 数据库转换逻辑

#### components/settings/AttendanceRules.tsx - convertDbConfigToFrontend
添加了 `lateExemptionMode` 字段的转换逻辑：
```typescript
lateExemptionMode: dbConfig.late_exemption_mode || defaultConfig.rules!.lateExemptionMode || 'byDate',
```

### 5. AI 分析文本更新

在 AI 规则分析中添加了豁免方式的说明：
```
- 豁免计算方式：${rules.lateExemptionMode === 'byMinutes' ? '按迟到时长（优先豁免迟到时间最长的记录）' : '按日期顺序（从月初到月末依次豁免）'}
```

### 6. 数据库种子数据更新

#### server/src/seeds/002_default_attendance_rules.ts
为两个公司的默认配置都添加了 `lateExemptionMode: 'byDate'`。

同时修复了 hydodo 的 `crossDayCheckout` 配置（移除了不存在的 `rules` 字段）。

### 7. 豁免计算逻辑（已实现）

#### components/attendance/dashboard/useAttendanceStats.ts
豁免计算逻辑已在之前实现，支持两种模式：

```typescript
// 根据豁免模式排序迟到记录
let sortedLateRecords = [...stats.lateRecords];
if (exemptionMode === 'byMinutes') {
    // 按迟到分钟数从大到小排序
    sortedLateRecords.sort((a, b) => b.minutes - a.minutes);
} else {
    // 按日期从月初到月末排序（默认）
    sortedLateRecords.sort((a, b) => a.day - b.day);
}
```

## 使用说明

### 配置步骤
1. 进入"考勤规则配置"页面
2. 展开"考勤弹性与豁免"模块
3. 确保"启用豁免功能"开关已打开
4. 在"豁免计算方式"中选择：
   - **按日期顺序**：适合公平对待所有迟到记录
   - **按迟到时长**：适合希望最大化减少员工迟到分钟数的场景
5. 点击"保存规则"按钮

### 效果说明

#### 按日期顺序（默认）
假设员工本月有以下迟到记录，豁免次数为3次，豁免时长为15分钟：
- 1号：迟到10分钟 → 完全豁免
- 5号：迟到20分钟 → 豁免15分钟，计5分钟
- 10号：迟到8分钟 → 完全豁免
- 15号：迟到30分钟 → 不豁免，计30分钟
- 总计：5 + 30 = 35分钟

#### 按迟到时长
同样的迟到记录，按时长排序后：
- 15号：迟到30分钟 → 豁免15分钟，计15分钟
- 5号：迟到20分钟 → 豁免15分钟，计5分钟
- 1号：迟到10分钟 → 完全豁免
- 10号：迟到8分钟 → 不豁免，计8分钟
- 总计：15 + 5 + 8 = 28分钟

可以看到，按迟到时长豁免可以减少7分钟的迟到时间。

## 技术要点

1. **类型安全**：在 TypeScript 类型定义中明确了两种模式
2. **向后兼容**：默认值为 'byDate'，确保旧数据不受影响
3. **UI/UX**：使用卡片式单选按钮，清晰直观
4. **数据持久化**：配置保存到数据库，支持版本管理
5. **实时生效**：保存后立即刷新规则引擎和缓存

## 相关文件

- `database/schema.ts` - 类型定义
- `components/attendance/utils.ts` - 默认配置
- `components/settings/AttendanceRules.tsx` - UI 界面和数据转换
- `components/attendance/dashboard/useAttendanceStats.ts` - 豁免计算逻辑
- `server/src/seeds/002_default_attendance_rules.ts` - 数据库种子数据

## 测试建议

1. 测试两种豁免模式的计算结果是否正确
2. 测试配置保存和加载是否正常
3. 测试 UI 交互是否流畅
4. 测试豁免功能关闭时，选择器是否正确禁用
5. 测试 AI 分析是否正确显示豁免方式信息


## 规则引擎更新

### AttendanceRuleEngine.ts

添加了新的月度豁免计算函数 `calculateMonthlyExemption`，支持两种豁免模式：

```typescript
/**
 * 计算月度豁免（支持按日期或按迟到时长排序）
 * @param lateRecords 迟到记录数组 [{day: number, minutes: number, isWorkday: boolean}]
 * @returns { exemptedLateMinutes: number, exemptionUsed: number }
 */
public calculateMonthlyExemption(
    lateRecords: Array<{ day: number; minutes: number; isWorkday: boolean }>
): { exemptedLateMinutes: number; exemptionUsed: number }
```

#### 函数特点：
1. **自动读取配置**：从规则配置中读取 `lateExemptionMode`
2. **智能排序**：
   - `byDate` 模式：按日期从小到大排序（1, 2, 3...）
   - `byMinutes` 模式：按迟到分钟数从大到小排序
3. **统一计算**：一次性处理所有迟到记录，返回豁免后的总迟到分钟数和已使用的豁免次数

#### 使用示例：
```typescript
const ruleEngine = AttendanceRuleManager.getEngine('eyewind');

const lateRecords = [
    { day: 1, minutes: 10, isWorkday: true },
    { day: 5, minutes: 20, isWorkday: true },
    { day: 10, minutes: 8, isWorkday: true },
    { day: 15, minutes: 30, isWorkday: true }
];

const result = ruleEngine.calculateMonthlyExemption(lateRecords);
// result = { exemptedLateMinutes: 35, exemptionUsed: 3 }
```

#### 与旧函数的区别：
- **旧函数** `calculateExemptedLateMinutes`：单次迟到计算，不支持豁免模式
- **新函数** `calculateMonthlyExemption`：月度批量计算，支持豁免模式

旧函数已标记为 `@deprecated`，建议使用新函数进行月度豁免计算。

## 代码架构说明

### 豁免计算的两个层次：

1. **单次迟到计算**（`calculateExemptedLateMinutes`）：
   - 用途：计算单次迟到如果被豁免会豁免多少分钟
   - 不需要知道豁免模式
   - 适用于实时计算场景

2. **月度豁免计算**（`calculateMonthlyExemption`）：
   - 用途：统一处理整个月的迟到记录
   - 支持豁免模式配置
   - 适用于月度统计场景（如考勤仪表盘）

### 当前使用情况：

目前系统使用 `useAttendanceStats.ts` 中的内联豁免计算逻辑，该逻辑已经支持豁免模式。新增的 `calculateMonthlyExemption` 函数提供了一个更规范的 API，可以在未来重构时使用。

## 更新的文件列表

- `database/schema.ts` - 类型定义
- `components/attendance/utils.ts` - 默认配置
- `components/settings/AttendanceRules.tsx` - UI 界面和数据转换
- `components/attendance/dashboard/useAttendanceStats.ts` - 豁免计算逻辑（已实现）
- `components/attendance/AttendanceRuleEngine.ts` - 新增月度豁免计算函数 ✨
- `server/src/seeds/002_default_attendance_rules.ts` - 数据库种子数据
