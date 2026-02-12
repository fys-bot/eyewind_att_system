import type { Knex } from 'knex';

/**
 * 迁移脚本：统一跨天打卡规则
 * 将旧的 crossDayCheckout、crossWeekCheckout、crossMonthCheckout 三个独立配置
 * 合并为一个统一的 crossDayCheckout 配置
 */

export async function up(knex: Knex): Promise<void> {
  console.log('开始迁移：统一跨天打卡规则...');

  // 获取所有现有的规则配置
  const configs = await knex('attendance_rule_configs')
    .where('is_active', true)
    .select('*');

  for (const config of configs) {
    try {
      // 🔥 rules 字段可能已经是对象（JSONB）或字符串
      const rules = typeof config.rules === 'string' 
        ? JSON.parse(config.rules) 
        : config.rules;
      
      let needsUpdate = false;
      
      // 检查是否有旧格式的规则
      if (rules.crossWeekCheckout || rules.crossMonthCheckout) {
        needsUpdate = true;
        
        // 初始化新的统一规则数组
        const unifiedRules = [];
        
        // 1. 保留现有的 crossDayCheckout 规则（如果有）
        if (rules.crossDayCheckout?.rules && Array.isArray(rules.crossDayCheckout.rules)) {
          for (const rule of rules.crossDayCheckout.rules) {
            // 如果旧规则有 nextDayCheckinTime，转换为 nextCheckinTime
            unifiedRules.push({
              checkoutTime: rule.checkoutTime,
              nextCheckinTime: rule.nextCheckinTime || rule.nextDayCheckinTime,
              description: rule.description,
              applyTo: rule.applyTo || 'day'
            });
          }
        }
        
        // 2. 转换 crossWeekCheckout 规则
        if (rules.crossWeekCheckout?.enabled && rules.crossWeekCheckout.rules) {
          for (const rule of rules.crossWeekCheckout.rules) {
            unifiedRules.push({
              checkoutTime: rule.checkoutTime,
              nextCheckinTime: rule.nextMondayCheckinTime || rule.nextCheckinTime,
              description: rule.description,
              applyTo: 'week',
              weekDays: rule.applyToDays || rule.weekDays || ['friday']
            });
          }
        }
        
        // 3. 转换 crossMonthCheckout 规则
        if (rules.crossMonthCheckout?.enabled && rules.crossMonthCheckout.rules) {
          for (const rule of rules.crossMonthCheckout.rules) {
            unifiedRules.push({
              checkoutTime: rule.checkoutTime,
              nextCheckinTime: rule.nextMonthCheckinTime || rule.nextCheckinTime,
              description: rule.description,
              applyTo: 'month'
            });
          }
        }
        
        // 4. 更新为新的统一格式
        rules.crossDayCheckout = {
          enabled: rules.crossDayCheckout?.enabled || 
                   rules.crossWeekCheckout?.enabled || 
                   rules.crossMonthCheckout?.enabled || 
                   false,
          rules: unifiedRules
        };
        
        // 5. 删除旧的独立配置
        delete rules.crossWeekCheckout;
        delete rules.crossMonthCheckout;
        
        // 6. 更新数据库
        await knex('attendance_rule_configs')
          .where('id', config.id)
          .update({
            rules: JSON.stringify(rules),
            version: config.version + 1,
            updated_at: knex.fn.now(),
            updated_by: 'migration_006',
            change_reason: '统一跨天打卡规则格式'
          });
        
        console.log(`✅ 已更新配置: ${config.company_id} (${config.config_name})`);
      } else {
        console.log(`⏭️  跳过配置: ${config.company_id} (已是新格式或无需更新)`);
      }
    } catch (error) {
      console.error(`❌ 更新配置失败: ${config.company_id}`, error);
      throw error; // 回滚事务
    }
  }
  
  console.log('✅ 迁移完成：统一跨天打卡规则');
}

export async function down(knex: Knex): Promise<void> {
  console.log('开始回滚：恢复独立的跨天打卡规则...');
  
  // 获取所有现有的规则配置
  const configs = await knex('attendance_rule_configs')
    .where('is_active', true)
    .select('*');

  for (const config of configs) {
    try {
      const rules = JSON.parse(config.rules);
      
      if (rules.crossDayCheckout?.rules && Array.isArray(rules.crossDayCheckout.rules)) {
        // 分离规则到三个独立配置
        const dayRules = [];
        const weekRules = [];
        const monthRules = [];
        
        for (const rule of rules.crossDayCheckout.rules) {
          const baseRule = {
            checkoutTime: rule.checkoutTime,
            description: rule.description
          };
          
          if (rule.applyTo === 'week') {
            weekRules.push({
              ...baseRule,
              nextMondayCheckinTime: rule.nextCheckinTime,
              applyToDays: rule.weekDays || ['friday']
            });
          } else if (rule.applyTo === 'month') {
            monthRules.push({
              ...baseRule,
              nextMonthCheckinTime: rule.nextCheckinTime
            });
          } else {
            dayRules.push({
              ...baseRule,
              nextDayCheckinTime: rule.nextCheckinTime
            });
          }
        }
        
        // 恢复旧格式
        rules.crossDayCheckout = {
          enabled: dayRules.length > 0,
          rules: dayRules,
          maxCheckoutTime: "24:00",
          nextDayCheckinTime: "13:30"
        };
        
        rules.crossWeekCheckout = {
          enabled: weekRules.length > 0,
          includeWeekend: false,
          rules: weekRules
        };
        
        rules.crossMonthCheckout = {
          enabled: monthRules.length > 0,
          rules: monthRules
        };
        
        // 更新数据库
        await knex('attendance_rule_configs')
          .where('id', config.id)
          .update({
            rules: JSON.stringify(rules),
            version: config.version + 1,
            updated_at: knex.fn.now(),
            updated_by: 'migration_006_rollback',
            change_reason: '回滚到独立的跨天打卡规则格式'
          });
        
        console.log(`✅ 已回滚配置: ${config.company_id} (${config.config_name})`);
      }
    } catch (error) {
      console.error(`❌ 回滚配置失败: ${config.company_id}`, error);
      throw error;
    }
  }
  
  console.log('✅ 回滚完成：恢复独立的跨天打卡规则');
}
