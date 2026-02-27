/**
 * 迟到分钟数调试脚本
 * 在浏览器控制台中运行此脚本来诊断迟到分钟数不显示的问题
 */

console.log('=== 迟到分钟数调试脚本 ===\n');

// 1. 检查规则配置
console.log('1. 检查规则配置');
console.log('-------------------');
const eyewindConfig = JSON.parse(localStorage.getItem('ATTENDANCE_RULE_CONFIG_eyewind') || '{}');
const hydodoConfig = JSON.parse(localStorage.getItem('ATTENDANCE_RULE_CONFIG_hydodo') || '{}');

console.log('风眼科技规则配置:');
console.log('  - 跨天规则启用:', eyewindConfig.rules?.crossDayCheckout?.enabled);
console.log('  - 向前查询启用:', eyewindConfig.rules?.crossDayCheckout?.enableLookback);
console.log('  - 向前查询天数:', eyewindConfig.rules?.crossDayCheckout?.lookbackDays);
console.log('  - 迟到规则数量:', eyewindConfig.rules?.lateRules?.length || 0);
console.log('  - 迟到规则详情:');
eyewindConfig.rules?.lateRules?.forEach((rule, idx) => {
    console.log(`    规则${idx + 1}: 前一天${rule.previousDayCheckoutTime}打卡 → 次日${rule.lateThresholdTime}算迟到`);
});

console.log('\n海多多规则配置:');
console.log('  - 跨天规则启用:', hydodoConfig.rules?.crossDayCheckout?.enabled);
console.log('  - 迟到规则数量:', hydodoConfig.rules?.lateRules?.length || 0);

// 2. 检查考勤数据缓存
console.log('\n2. 检查考勤数据缓存');
console.log('-------------------');
const cacheKeys = Object.keys(localStorage).filter(key => key.startsWith('ATTENDANCE_MAP_CACHE_'));
console.log('找到的考勤数据缓存:', cacheKeys);

if (cacheKeys.length > 0) {
    const latestCacheKey = cacheKeys[cacheKeys.length - 1];
    console.log('使用最新的缓存:', latestCacheKey);
    
    try {
        const attendanceData = JSON.parse(localStorage.getItem(latestCacheKey) || '{}');
        const userIds = Object.keys(attendanceData);
        console.log('缓存中的用户数量:', userIds.length);
        
        // 随机选择一个用户进行详细检查
        if (userIds.length > 0) {
            const randomUserId = userIds[Math.floor(Math.random() * userIds.length)];
            const userData = attendanceData[randomUserId];
            const days = Object.keys(userData);
            
            console.log(`\n随机选择用户 ${randomUserId} 进行检查:`);
            console.log('  - 有考勤记录的天数:', days.length);
            
            // 查找有迟到记录的天
            let lateCount = 0;
            let lateWithMinutesCount = 0;
            
            days.forEach(day => {
                const dayData = userData[day];
                const lateRecords = dayData.records?.filter(r => r.timeResult === 'Late') || [];
                
                if (lateRecords.length > 0) {
                    lateCount++;
                    console.log(`  - ${day}号: 发现${lateRecords.length}条迟到记录`);
                    
                    lateRecords.forEach((record, idx) => {
                        console.log(`    记录${idx + 1}:`, {
                            checkType: record.checkType,
                            timeResult: record.timeResult,
                            userCheckTime: record.userCheckTime,
                            baseCheckTime: record.baseCheckTime
                        });
                    });
                }
            });
            
            console.log(`\n  总结: 该用户有 ${lateCount} 天存在迟到记录`);
        }
    } catch (e) {
        console.error('解析考勤数据失败:', e);
    }
} else {
    console.log('⚠️ 未找到考勤数据缓存，请先加载考勤数据');
}

// 3. 检查统计数据
console.log('\n3. 检查统计数据');
console.log('-------------------');
console.log('提示: 打开考勤仪表盘后，在控制台运行以下代码查看统计数据:');
console.log(`
// 获取当前页面的统计数据
const statsTable = document.querySelector('[data-testid="attendance-stats-table"]');
if (statsTable) {
    const rows = statsTable.querySelectorAll('tbody tr');
    console.log('统计表格行数:', rows.length);
    
    rows.forEach((row, idx) => {
        const cells = row.querySelectorAll('td');
        if (cells.length > 0) {
            const name = cells[0]?.textContent?.trim();
            const lateCount = cells[5]?.textContent?.trim(); // 迟到次数列
            const lateMinutes = cells[6]?.textContent?.trim(); // 累计迟到列
            
            if (lateCount && lateCount !== '-' && lateCount !== '0') {
                console.log(\`员工 \${name}: 迟到\${lateCount}次, 累计\${lateMinutes}\`);
            }
        }
    });
}
`);

// 4. 手动测试规则引擎
console.log('\n4. 手动测试规则引擎');
console.log('-------------------');
console.log('提示: 在控制台运行以下代码手动测试规则引擎:');
console.log(`
import { AttendanceRuleManager } from './components/attendance/AttendanceRuleEngine.ts';

// 获取规则引擎实例
const engine = AttendanceRuleManager.getEngine('eyewind');

// 模拟一条迟到记录
const testRecord = {
    checkType: 'OnDuty',
    timeResult: 'Late',
    userCheckTime: '2026-02-03T09:15:00+08:00',
    baseCheckTime: '2026-02-03T09:00:00+08:00'
};

// 模拟工作日期
const testWorkDate = new Date(2026, 1, 3); // 2026-02-03

// 模拟前一天下班时间（20:45）
const testPreviousDayCheckout = new Date(2026, 1, 2, 20, 45, 0);

// 计算迟到分钟数
const result = engine.calculateLateMinutes(
    testRecord,
    testWorkDate,
    testPreviousDayCheckout,
    undefined, // previousWeekendCheckoutTime
    undefined, // previousMonthCheckoutTime
    {}, // holidayMap
    undefined, // processDetail
    '测试用户'
);

console.log('测试结果: 迟到', result, '分钟');
console.log('预期结果: 迟到 14 分钟 (09:15 - 09:01 = 14分钟)');
console.log('规则匹配: 前一天20:45打卡 >= 20:30阈值，应用规则2 (09:31算迟到)');
`);

// 5. 检查页面渲染
console.log('\n5. 检查页面渲染');
console.log('-------------------');
console.log('提示: 在考勤日历页面运行以下代码检查渲染:');
console.log(`
// 查找所有迟到徽章
const lateBadges = document.querySelectorAll('[class*="迟到"]');
console.log('找到的迟到徽章数量:', lateBadges.length);

lateBadges.forEach((badge, idx) => {
    console.log(\`徽章\${idx + 1}:\`, badge.textContent);
});

// 如果没有找到徽章，检查是否有迟到记录但没有显示
const calendarCells = document.querySelectorAll('[data-day]');
console.log('日历单元格数量:', calendarCells.length);
`);

console.log('\n=== 调试脚本执行完成 ===');
console.log('请按照上述提示逐步检查各个环节');
