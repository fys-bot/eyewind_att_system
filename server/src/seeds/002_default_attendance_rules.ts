import type { Knex } from 'knex';

/**
 * 插入默认的考勤规则配置
 * 使用前端 DEFAULT_CONFIGS 的数据结构
 */

export async function seed(knex: Knex): Promise<void> {
  // 清空现有数据
  await knex('attendance_rule_history').del();
  await knex('attendance_rule_configs').del();

  // 风眼科技的默认配置
  const eyewindRules = {
    workStartTime: "09:00",
    workEndTime: "18:30",
    lunchStartTime: "12:00",
    lunchEndTime: "13:30",
    lateRules: [
      {
        previousDayCheckoutTime: "18:30",
        lateThresholdTime: "09:01",
        description: "前一天18:30打卡，9:01算迟到"
      },
      {
        previousDayCheckoutTime: "20:30",
        lateThresholdTime: "09:31",
        description: "前一天20:30打卡，9:31算迟到"
      },
      {
        previousDayCheckoutTime: "24:00",
        lateThresholdTime: "13:31",
        description: "前一天24:00打卡，13:31算迟到"
      }
    ],
    lateExemptionCount: 3,
    lateExemptionMinutes: 15,
    lateExemptionEnabled: true,
    performancePenaltyMode: 'capped',
    unlimitedPenaltyThresholdTime: '09:01',
    unlimitedPenaltyCalcType: 'perMinute',
    unlimitedPenaltyPerMinute: 5,
    unlimitedPenaltyFixedAmount: 50,
    cappedPenaltyType: 'ladder',
    cappedPenaltyPerMinute: 5,
    maxPerformancePenalty: 250,
    performancePenaltyRules: [
      { minMinutes: 0, maxMinutes: 5, penalty: 50, description: "0-5分钟扣50元" },
      { minMinutes: 5, maxMinutes: 15, penalty: 100, description: "5-15分钟扣100元" },
      { minMinutes: 15, maxMinutes: 30, penalty: 150, description: "15-30分钟扣150元" },
      { minMinutes: 30, maxMinutes: 45, penalty: 200, description: "30-45分钟扣200元" },
      { minMinutes: 45, maxMinutes: 999, penalty: 250, description: "大于45分钟扣250元" }
    ],
    performancePenaltyEnabled: true,
    leaveDisplayRules: [
      {
        leaveType: "病假",
        shortTermHours: 24,
        shortTermLabel: "病假<=24小时",
        longTermLabel: "病假>24小时"
      }
    ],
    fullAttendanceBonus: 200,
    fullAttendanceAllowAdjustment: true,
    fullAttendanceEnabled: true,
    fullAttendanceRules: [
      { type: 'trip', displayName: '出差', enabled: false, threshold: 0, unit: 'hours' },
      { type: 'compTime', displayName: '调休', enabled: false, threshold: 0, unit: 'hours' },
      { type: 'late', displayName: '迟到', enabled: true, threshold: 0, unit: 'count' },
      { type: 'missing', displayName: '缺卡', enabled: true, threshold: 0, unit: 'count' },
      { type: 'absenteeism', displayName: '旷工', enabled: true, threshold: 0, unit: 'count' },
      { type: 'annual', displayName: '年假', enabled: true, threshold: 0, unit: 'hours' },
      { type: 'sick', displayName: '病假', enabled: true, threshold: 0, unit: 'hours' },
      { type: 'personal', displayName: '事假', enabled: true, threshold: 0, unit: 'hours' },
      { type: 'bereavement', displayName: '丧假', enabled: true, threshold: 0, unit: 'hours' },
      { type: 'paternity', displayName: '陪产假', enabled: true, threshold: 0, unit: 'hours' },
      { type: 'maternity', displayName: '产假', enabled: true, threshold: 0, unit: 'hours' },
      { type: 'parental', displayName: '育儿假', enabled: true, threshold: 0, unit: 'hours' },
      { type: 'marriage', displayName: '婚假', enabled: true, threshold: 0, unit: 'hours' }
    ],
    overtimeCheckpoints: ["19:30", "20:30", "22:00", "24:00"],
    weekendOvertimeThreshold: 8,
    attendanceDaysRules: {
      enabled: true,
      shouldAttendanceCalcMethod: 'workdays',
      includeHolidaysInShould: true,
      actualAttendanceRules: {
        countLateAsAttendance: true,
        countMissingAsAttendance: false,
        countHalfDayLeaveAsHalf: true,
        minWorkHoursForFullDay: 4,
        countHolidayAsAttendance: true,
        countCompTimeAsAttendance: true,
        countPaidLeaveAsAttendance: true,
        countTripAsAttendance: true,
        countOutAsAttendance: true,
        countSickLeaveAsAttendance: false,
        countPersonalLeaveAsAttendance: false
      }
    },
    workdaySwapRules: {
      enabled: true,
      autoFollowNationalHoliday: true,
      customDays: []
    },
    remoteWorkRules: {
      enabled: true,
      requireApproval: false,
      countAsNormalAttendance: true,
      allowedDaysOfWeek: [1, 2, 3, 4, 5],
      remoteDays: []
    },
    crossDayCheckout: {
      enabled: true,
      enableLookback: true,
      lookbackDays: 10
    }
  };

  // 海多多的默认配置
  const hydodoRules = {
    workStartTime: "09:10",
    workEndTime: "19:00",
    lunchStartTime: "12:00",
    lunchEndTime: "13:30",
    lateRules: [],
    lateExemptionCount: 0,
    lateExemptionMinutes: 0,
    lateExemptionEnabled: true,
    performancePenaltyMode: 'capped',
    unlimitedPenaltyThresholdTime: '09:11',
    unlimitedPenaltyCalcType: 'perMinute',
    unlimitedPenaltyPerMinute: 5,
    unlimitedPenaltyFixedAmount: 50,
    cappedPenaltyType: 'ladder',
    cappedPenaltyPerMinute: 5,
    maxPerformancePenalty: 0,
    performancePenaltyRules: [],
    performancePenaltyEnabled: true,
    leaveDisplayRules: [],
    fullAttendanceBonus: 0,
    fullAttendanceAllowAdjustment: false,
    fullAttendanceEnabled: true,
    fullAttendanceRules: [],
    overtimeCheckpoints: ["19:30", "20:30", "22:00", "24:00"],
    weekendOvertimeThreshold: 8,
    attendanceDaysRules: {
      enabled: true,
      shouldAttendanceCalcMethod: 'workdays',
      includeHolidaysInShould: true,
      actualAttendanceRules: {
        countLateAsAttendance: true,
        countMissingAsAttendance: false,
        countHalfDayLeaveAsHalf: true,
        minWorkHoursForFullDay: 4,
        countHolidayAsAttendance: true,
        countCompTimeAsAttendance: true,
        countPaidLeaveAsAttendance: true,
        countTripAsAttendance: true,
        countOutAsAttendance: true,
        countSickLeaveAsAttendance: false,
        countPersonalLeaveAsAttendance: false
      }
    },
    workdaySwapRules: {
      enabled: true,
      autoFollowNationalHoliday: true,
      customDays: []
    },
    remoteWorkRules: {
      enabled: true,
      requireApproval: false,
      countAsNormalAttendance: true,
      allowedDaysOfWeek: [1, 2, 3, 4, 5],
      remoteDays: []
    },
    crossDayCheckout: {
      enabled: false,
      rules: []
    }
  };

  // 插入配置
  await knex('attendance_rule_configs').insert([
    {
      company_id: 'eyewind',
      config_name: '风眼科技默认配置',
      rules: JSON.stringify(eyewindRules),
      version: 1,
      is_active: true,
      created_by: 'system',
      updated_by: 'system',
      change_reason: '初始化默认配置'
    },
    {
      company_id: 'hydodo',
      config_name: '海多多默认配置',
      rules: JSON.stringify(hydodoRules),
      version: 1,
      is_active: true,
      created_by: 'system',
      updated_by: 'system',
      change_reason: '初始化默认配置'
    }
  ]);

  // console.log('✅ 默认考勤规则配置插入完成');
}
