import { useEffect, useCallback } from 'react';
import { AttendanceRuleManager } from '../components/attendance/AttendanceRuleEngine.ts';
import { refreshRuleConfigCache } from './useAttendanceRuleConfig.ts';

/**
 * 考勤规则全局同步Hook
 * 用于监听考勤规则更新事件，并触发相应的同步操作
 */
export const useAttendanceRuleSync = (onRulesUpdated?: (companyKey: string) => void) => {
    const handleRulesUpdate = useCallback(async (event: CustomEvent) => {
        const { companyKey } = event.detail;
        
        // console.log(`[useAttendanceRuleSync] 收到规则更新事件: ${companyKey}`);

        // 🔥 刷新规则配置缓存（从数据库重新加载）
        // 注意：这里不需要调用refreshRuleConfigCache，因为useAttendanceRuleConfig已经监听了同样的事件
        // 避免重复调用API
        
        // 重新加载规则引擎
        AttendanceRuleManager.reloadAllRules();
        
        // 触发回调
        if (onRulesUpdated) {
            onRulesUpdated(companyKey);
        }
        
        // console.log(`[useAttendanceRuleSync] 规则同步完成: ${companyKey}`);
    }, [onRulesUpdated]);

    useEffect(() => {
        // 添加事件监听器
        window.addEventListener('attendanceRulesUpdated', handleRulesUpdate as EventListener);

        // 清理函数
        return () => {
            window.removeEventListener('attendanceRulesUpdated', handleRulesUpdate as EventListener);
        };
    }, [handleRulesUpdate]);

    // 手动触发规则重新加载
    const reloadRules = useCallback(() => {
        AttendanceRuleManager.reloadAllRules();
    }, []);

    return {
        reloadRules
    };
};