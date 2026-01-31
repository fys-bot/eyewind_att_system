
export const getAttendanceAnalysisPrompt = (companyName: string, summary: any, abnormalEmployees: any[]): string => {
    const abnormalList = abnormalEmployees.map(e => {
        return `- ${e.name}: 迟到${e.late}次(${e.lateMinutes}分), 缺卡${e.missing}次, 旷工${e.absenteeism}次, 病假${e.sick}小时, 事假${e.personal}小时`;
    }).join('\n');

    return `
你是一位资深的行政管理专家。请结合以下考勤数据，为"${companyName}"生成一份专业的月度考勤分析报告。

**核心数据:**
- 出勤率: ${summary.rate}%
- 纪律风险人数: ${summary.riskCount} (共${summary.totalCount}人)
- 累计迟到时长: ${summary.totalLateMinutes}分钟

**重点关注人员数据:**
${abnormalList}

**请输出以下维度的分析建议 (Markdown格式):**
1.  **整体考勤诊断**: 一句话概括本月考勤纪律状况。
2.  **员工关怀建议**: 针对病假较多的员工，话术要体现人文关怀。
3.  **异常处理建议**: 针对迟到/缺卡/旷工较多的员工，提出具体的管理措施（如：面谈、警告、制度重申）。
4.  **行政决策支持**: 基于数据提出一条改进考勤管理的具体策略。

请直接输出分析内容，无需寒暄。
`;
};

export const getEmployeeSpecificAnalysisPrompt = (employeeName: string, stats: any, userContext?: any): string => {
    let roleDescription = "普通员工";
    let roleContext = "";
    
    if (userContext) {
        const roles = [];
        if (userContext.boss) roles.push("公司负责人/老板");
        if (userContext.senior) roles.push("高管");
        if (userContext.leader_in_dept && userContext.leader_in_dept.some((d: any) => d.leader)) roles.push("部门主管");
        
        if (roles.length > 0) {
            roleDescription = roles.join(' / ');
            roleContext = `注意：该员工是公司的【${roleDescription}】。请在分析时考虑其职级身份：
            1. 对于管理层，迟到/缺卡可能对团队氛围产生负面示范效应，或者是因为商务应酬/弹性工作导致，请酌情分析。
            2. 关注其加班情况，判断是否存在过度劳累风险。`;
        }
    }

    // 细化假期描述
    const leaveDetails = [];
    if (stats.sickHours > 0) leaveDetails.push(`病假 ${stats.sickHours} 小时`);
    if (stats.personalHours > 0) leaveDetails.push(`事假 ${stats.personalHours} 小时`);
    if (stats.annualHours > 0) leaveDetails.push(`年假 ${stats.annualHours} 小时`);
    if (stats.compTimeHours > 0) leaveDetails.push(`调休 ${stats.compTimeHours} 小时`);
    if (stats.bereavementHours > 0) leaveDetails.push(`丧假 ${stats.bereavementHours} 小时 (请注意人文关怀)`);
    if (stats.marriageHours > 0) leaveDetails.push(`婚假 ${stats.marriageHours} 小时`);
    if (stats.maternityHours > 0) leaveDetails.push(`产假 ${stats.maternityHours} 小时`);
    if (stats.paternityHours > 0) leaveDetails.push(`陪产假 ${stats.paternityHours} 小时`);

    const leaveDesc = leaveDetails.length > 0 ? leaveDetails.join(', ') : "无主要请假记录";

    return `
你是一位资深的HRBP（人力资源业务合作伙伴）。请根据以下员工"${employeeName}"的月度考勤数据，进行深度分析并给出管理建议。

**员工身份背景:**
${roleContext || "该员工为普通职员，分析重点在于考勤合规性与工作饱和度。"}

**考勤核心数据:**
- **出勤状态**: ${stats.isFullAttendance ? '全勤 (优秀)' : '非全勤'}
- **加班投入**: 累计加班 ${stats.overtimeTotalMinutes} 分钟 (深夜22:00后加班 ${stats.overtime22Count + stats.overtime24Count} 次)
- **纪律风险**: 迟到 ${stats.late} 次 (共 ${stats.lateMinutes} 分钟), 缺卡 ${stats.missing} 次, 旷工 ${stats.absenteeism} 次
- **休假明细**: ${leaveDesc}

**请输出以下3点内容 (Markdown格式，语言简练专业):**

1.  **工作状态画像**: 
    *   结合其【${roleDescription}】身份和加班/请假数据，描绘其本月状态（例如：拼搏奋斗、状态波动、家庭事务牵绊、纪律松散等）。
    *   *特别注意*：如果有丧假/病假，请在画像中体现对其个人状况的体谅。

2.  **管理建议 (给行政/上级)**:
    *   **针对${roleDescription}**: 
    *   如果加班多：建议关注身体健康，避免职业倦怠。
    *   如果迟到/旷工多：${roleDescription !== '普通员工' ? '建议提醒其注意管理层的表率作用，或了解是否有特殊商务行程未报备' : '建议进行考勤合规面谈，明确制度红线'}。
    *   如果请假多：特别是病假/丧假，建议直线经理给予关怀慰问。

3.  **激励与改进**: 
    *   基于数据给出具体的行动建议（例如：通报表扬、强制调休、安排谈心、发送关怀礼包等）。

语气要专业、客观、有温度且具有建设性。不要罗列数据，而是解读数据。
`;
}
