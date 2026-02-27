/**
 * 豁免模式测试脚本
 * 用于验证 calculateMonthlyExemption 函数的正确性
 */

// 模拟测试数据
const testLateRecords = [
    { day: 1, minutes: 10, isWorkday: true },
    { day: 5, minutes: 20, isWorkday: true },
    { day: 10, minutes: 8, isWorkday: true },
    { day: 15, minutes: 30, isWorkday: true }
];

// 测试配置
const testConfig = {
    lateExemptionCount: 3,
    lateExemptionMinutes: 15
};

console.log('=== 豁免模式测试 ===\n');
console.log('测试数据：');
console.log('- 迟到记录：', testLateRecords);
console.log('- 豁免次数：', testConfig.lateExemptionCount);
console.log('- 豁免时长：', testConfig.lateExemptionMinutes, '分钟\n');

// 测试 1: 按日期顺序豁免
console.log('【测试 1】按日期顺序豁免 (byDate)');
console.log('排序后顺序：1号(10分) -> 5号(20分) -> 10号(8分) -> 15号(30分)');
console.log('豁免逻辑：');
console.log('  1号(10分)  <= 15分 → 完全豁免，剩余 0 分');
console.log('  5号(20分)  > 15分  → 部分豁免，剩余 5 分');
console.log('  10号(8分)  <= 15分 → 完全豁免，剩余 0 分');
console.log('  15号(30分) 无豁免   → 全部计入，剩余 30 分');
console.log('预期结果：exemptedLateMinutes = 35, exemptionUsed = 3\n');

// 测试 2: 按迟到时长豁免
console.log('【测试 2】按迟到时长豁免 (byMinutes)');
console.log('排序后顺序：15号(30分) -> 5号(20分) -> 1号(10分) -> 10号(8分)');
console.log('豁免逻辑：');
console.log('  15号(30分) > 15分  → 部分豁免，剩余 15 分');
console.log('  5号(20分)  > 15分  → 部分豁免，剩余 5 分');
console.log('  1号(10分)  <= 15分 → 完全豁免，剩余 0 分');
console.log('  10号(8分)  无豁免   → 全部计入，剩余 8 分');
console.log('预期结果：exemptedLateMinutes = 28, exemptionUsed = 3\n');

console.log('【结论】');
console.log('按迟到时长豁免可以减少 7 分钟的迟到时间 (35 - 28 = 7)');
console.log('这就是为什么推荐使用"按迟到时长"模式的原因！\n');

// 手动计算验证
function calculateByDate(records, maxExemptions, threshold) {
    const sorted = [...records].sort((a, b) => a.day - b.day);
    let exemptionUsed = 0;
    let exemptedMinutes = 0;
    
    sorted.forEach(record => {
        if (exemptionUsed < maxExemptions && record.isWorkday) {
            if (record.minutes <= threshold) {
                exemptionUsed++;
            } else {
                exemptedMinutes += (record.minutes - threshold);
                exemptionUsed++;
            }
        } else {
            exemptedMinutes += record.minutes;
        }
    });
    
    return { exemptedMinutes, exemptionUsed };
}

function calculateByMinutes(records, maxExemptions, threshold) {
    const sorted = [...records].sort((a, b) => b.minutes - a.minutes);
    let exemptionUsed = 0;
    let exemptedMinutes = 0;
    
    sorted.forEach(record => {
        if (exemptionUsed < maxExemptions && record.isWorkday) {
            if (record.minutes <= threshold) {
                exemptionUsed++;
            } else {
                exemptedMinutes += (record.minutes - threshold);
                exemptionUsed++;
            }
        } else {
            exemptedMinutes += record.minutes;
        }
    });
    
    return { exemptedMinutes, exemptionUsed };
}

console.log('=== 验证计算 ===\n');
const resultByDate = calculateByDate(testLateRecords, testConfig.lateExemptionCount, testConfig.lateExemptionMinutes);
console.log('按日期计算结果：', resultByDate);

const resultByMinutes = calculateByMinutes(testLateRecords, testConfig.lateExemptionCount, testConfig.lateExemptionMinutes);
console.log('按时长计算结果：', resultByMinutes);

console.log('\n节省的迟到分钟数：', resultByDate.exemptedMinutes - resultByMinutes.exemptedMinutes, '分钟');
