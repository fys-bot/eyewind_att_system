# 迟到分钟数不显示问题诊断

## 问题描述
用户反馈考勤日历和考勤仪表盘中没有显示迟到分钟数（如"迟到15分钟"）

## 代码分析结果

### 1. 数据计算层 (useAttendanceStats.ts)
✅ **正常** - 使用规则引擎计算迟到分钟数
- 第 519-540 行：使用 `ruleEngine.calculateLateMinutes()` 计算迟到分钟数
- 第 542-544 行：将计算结果累加到 `stats.lateMinutes`
- 支持跨天/跨周/跨月规则

### 2. 规则引擎层 (AttendanceRuleEngine.ts)
✅ **正常** - 规则引擎逻辑完整
- 第 151-251 行：`calculateLateMinutes()` 方法实现完整
- 支持跨月、跨周、跨天规则的优先级判断
- 支持向前查询功能（lookback）
- 支持请假/调休时间调整

### 3. 显示层 (AttendanceCalendar.tsx)
✅ **正常** - 日历单元格显示逻辑
- 第 1791-1801 行：调用规则引擎计算迟到分钟数
- 第 1863 行：如果 `lateMinutes > 0`，添加徽章 `迟到${lateMinutes}分`
- 第 1893-1896 行：如果有迟到，设置黄色背景

### 4. 统计表格层 (AttendanceStatsTable.tsx)
✅ **正常** - 表格显示逻辑
- 第 82-84 行：显示累计迟到分钟数 `stats.lateMinutes`
- 第 86-88 行：显示豁免后迟到分钟数 `stats.exemptedLateMinutes`

## 可能的原因

### 原因1: 规则配置未启用
检查 `attendance_rules` 表中的配置：
```sql
SELECT * FROM attendance_rules WHERE company_id IN ('eyewind', 'hydodo');
```

需要确认：
- `crossDayCheckout.enabled` = true
- `lateRules` 数组不为空
- `lateRules` 中的规则配置正确

### 原因2: 打卡记录中 timeResult 不是 'Late'
规则引擎只处理 `timeResult === 'Late'` 的记录：
```typescript
if (record.checkType !== 'OnDuty' || record.timeResult !== 'Late') {
    return 0;
}
```

需要检查钉钉返回的打卡数据中 `timeResult` 字段是否正确标记为 'Late'

### 原因3: 前一天/周/月的下班打卡时间未找到
跨天/跨周/跨月规则需要前一时段的下班打卡时间：
- `previousDayCheckoutTime` - 前一天下班时间
- `previousWeekendCheckoutTime` - 上周末下班时间（仅周一）
- `previousMonthCheckoutTime` - 上月最后工作日下班时间（仅本月第一个工作日）

如果这些时间都不存在，会回退到默认规则（使用标准工作开始时间 09:00）

### 原因4: 规则阈值未达到
即使有前一时段的下班打卡，如果下班时间未达到规则阈值，也不会应用该规则。

例如：
- 规则1: 前一天 20:30 → 次日 09:01
- 规则2: 前一天 22:00 → 次日 09:31
- 如果前一天下班时间是 19:00，不满足任何规则，使用默认 09:00

## 调试建议

### 1. 启用调试日志
在 `AttendanceRuleEngine.ts` 中已经有针对"徐怡"的调试日志：
```typescript
if (userName === '徐怡') {
    console.log(`[AttendanceRuleEngine] ...`);
}
```

可以修改为显示所有用户的日志，或者添加更多用户名。

### 2. 检查规则配置
在浏览器控制台运行：
```javascript
// 获取规则配置
const config = JSON.parse(localStorage.getItem('ATTENDANCE_RULE_CONFIG_eyewind') || '{}');
console.log('规则配置:', config);
console.log('跨天规则启用:', config.rules?.crossDayCheckout?.enabled);
console.log('迟到规则:', config.rules?.lateRules);
```

### 3. 检查打卡数据
在浏览器控制台运行：
```javascript
// 获取考勤数据
const attendanceMap = window.__ATTENDANCE_MAP__;
console.log('考勤数据:', attendanceMap);

// 检查某个用户某天的打卡记录
const userId = 'xxx'; // 替换为实际用户ID
const day = 1; // 替换为实际日期
const records = attendanceMap[userId]?.[day]?.records;
console.log('打卡记录:', records);
console.log('迟到记录:', records?.filter(r => r.timeResult === 'Late'));
```

### 4. 手动测试规则引擎
在浏览器控制台运行：
```javascript
import { AttendanceRuleManager } from './components/attendance/AttendanceRuleEngine.ts';

const engine = AttendanceRuleManager.getEngine('eyewind');

// 模拟一条迟到记录
const record = {
    checkType: 'OnDuty',
    timeResult: 'Late',
    userCheckTime: '2026-02-03T09:15:00+08:00'
};

const workDate = new Date(2026, 1, 3); // 2026-02-03
const previousDayCheckoutTime = new Date(2026, 1, 2, 20, 45, 0); // 前一天 20:45 下班

const lateMinutes = engine.calculateLateMinutes(
    record,
    workDate,
    previousDayCheckoutTime,
    undefined,
    undefined,
    {},
    undefined,
    '测试用户'
);

console.log('计算结果:', lateMinutes, '分钟');
```

## 下一步行动

1. **检查规则配置** - 确认规则已启用且配置正确
2. **检查打卡数据** - 确认 `timeResult` 字段正确标记为 'Late'
3. **启用调试日志** - 查看规则引擎的实际执行过程
4. **验证前一时段打卡** - 确认前一天/周/月的下班打卡时间存在
5. **检查规则阈值** - 确认下班时间达到规则阈值

## 临时解决方案

如果问题紧急，可以临时修改规则引擎，降低规则阈值或使用默认规则：

```typescript
// 在 calculateDefaultLateMinutes 方法中
// 将默认工作开始时间从 09:00 改为 09:01
workStartTime.setHours(9, 1, 0, 0);
```

或者在规则配置中添加一条兜底规则：
```json
{
  "previousDayCheckoutTime": "00:00",
  "lateThresholdTime": "09:01",
  "description": "兜底规则：任何情况下 09:01 后算迟到"
}
```
