# Excel下载与考勤日历同步实现

## 问题描述
下载的考勤表和迟到统计表的每日状态显示与考勤日历不一致，需要完全按照考勤日历的逻辑来生成Excel报表。

## 解决方案

### 核心原则
Excel下载的每日状态生成逻辑完全按照考勤日历的badge显示逻辑，确保两者100%一致。

### 实现逻辑（优先级从高到低）

1. **未来日期** - 显示空白
2. **带薪福利假** - 显示配置的原因（如"带薪福利假"）
3. **法定节假日** - 显示"-"
4. **补班日** - 按工作日处理
5. **请假类型** - 显示具体假期类型（年假、病假、事假等）
6. **加班** - 非工作日有打卡记录显示"加班"或"加班X小时"
7. **缺卡** - 显示"缺卡"、"缺卡-上班卡"、"缺卡-下班卡"或"上午缺卡\n下午缺卡"
8. **迟到** - 显示"迟到"或"迟到X分"
9. **正常出勤** - 显示"√"
10. **非工作日无打卡** - 显示"-"

### 修改内容

#### 1. 考勤表（attendanceContent）
- 完全重写每日状态生成逻辑
- 按照考勤日历的优先级顺序判断
- 正确处理工作日/非工作日/补班日/节假日
- 显示带薪福利假

#### 2. 迟到统计表（lateContent）
- 完全重写每日迟到状态生成逻辑
- 加班显示工作时长（如"加班8.5小时"）
- 缺卡显示更详细（区分上午/下午）
- 显示带薪福利假

### 关键代码逻辑

```typescript
// 1. 优先检查带薪福利假
const benefitHolidayReason = benefitHolidayMap.get(fullDateKey);
if (benefitHolidayReason) {
    return benefitHolidayReason;
}

// 2. 判断是否为工作日（考虑补班和节假日）
const holidayInfo = holidays[dateKey];
const isWeekend = targetDate.getDay() === 0 || targetDate.getDay() === 6;
let isWorkday = !isWeekend;
if (holidayInfo) {
    if (holidayInfo.holiday === false) {
        isWorkday = true; // 补班日
    } else if (holidayInfo.holiday === true) {
        isWorkday = false; // 法定节假日
    }
}

// 3. 非工作日无打卡显示"-"
if (!isWorkday && (!statusData || !statusData.records || statusData.records.length === 0)) {
    return '-';
}

// 4. 检查请假类型
const processRecord = statusData.records.find(r => r.procInstId);
if (processRecord && processDataMap[processRecord.procInstId]) {
    const leaveType = processData.formValues?.leaveType || processData.bizType;
    if (leaveType) {
        return leaveType;
    }
}

// 5. 检查加班（非工作日有打卡）
if (!isWorkday && statusData.records.length > 0) {
    return '加班';
}

// 6. 检查缺卡
// 7. 检查迟到
// 8. 正常出勤
```

### 数据一致性保证

1. **相同的数据源** - 使用相同的 `attendanceMap`、`processDataMap`、`holidays`
2. **相同的规则配置** - 从规则引擎获取 `benefitHolidayMap`
3. **相同的判断逻辑** - 工作日/节假日/补班日的判断完全一致
4. **相同的优先级** - 按照相同的优先级顺序处理各种状态

### 修改文件
- `components/attendance/dashboard/AttendanceDashboardPage.tsx`
  - 重写了考勤表的每日状态生成逻辑（dailyStatus）
  - 重写了迟到统计表的每日状态生成逻辑（dailyLateStatus）
  - 删除了旧的复杂逻辑和重复代码
  - 添加了带薪福利假的检查和显示

### 测试要点
1. 下载考勤表，对比日历显示，确保每个日期的状态一致
2. 下载迟到统计表，对比日历显示，确保每个日期的状态一致
3. 验证带薪福利假在Excel中正确显示
4. 验证法定节假日、补班日、周末的显示正确
5. 验证请假、加班、缺卡、迟到等状态显示正确

### 注意事项
- Excel中的显示完全遵循考勤日历的逻辑
- 如果考勤日历的逻辑有变化，Excel下载也会自动同步
- 带薪福利假的显示使用配置的原因文本，与日历保持一致
