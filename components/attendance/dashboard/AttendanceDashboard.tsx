
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  UsersIcon, ClockIcon, AlertTriangleIcon, TrendingUpIcon, ActivityIcon, UserMinusIcon, XCircleIcon, SparklesIcon,
  DownloadIcon, CalendarIcon, Loader2Icon, RefreshCwIcon, XIcon, ChevronRightIcon, SendIcon, SlidersHorizontalIcon
} from '../../Icons.tsx';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { DingTalkUser, EmployeeStats, CompanyCounts } from '../../../database/schema.ts';
import { AccordionSection, Avatar } from './AttendanceShared.tsx';
import { AttendanceStatsTable } from './AttendanceStatsTable.tsx';
import { getLateMinutes } from '../utils.ts';
import { analyzeAttendanceInsights } from '../../../services/aiChatService.ts';
import { db } from '../../../database/mockDb.ts';
import { Modal } from '../../Modal.tsx';
import { getCachedAnalysis, setCachedAnalysis, getMonthlyAnalysisCacheKey } from '../../../services/aiCacheService.ts';

// --- Enhanced Markdown Renderer ---

const EnhancedMarkdownRenderer: React.FC<{ text: string }> = ({ text }) => {
  const parseInlineStyles = (line: string): React.ReactNode => {
    const parts: React.ReactNode[] = [];
    let currentIndex = 0;
    let key = 0;

    // 匹配粗体 **text**
    const boldRegex = /\*\*(.*?)\*\*/g;
    // 匹配斜体 *text* 或 _text_
    const italicRegex = /(?<!\*)\*(?!\*)([^*]+)\*(?!\*)|_([^_]+)_/g;
    // 匹配代码 `code`
    const codeRegex = /`([^`]+)`/g;
    // 匹配链接 [text](url)
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;

    // 合并所有正则表达式
    const combinedRegex = /(\*\*.*?\*\*)|(?<!\*)\*(?!\*)([^*]+)\*(?!\*)|_([^_]+)_|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g;
    
    let match;
    while ((match = combinedRegex.exec(line)) !== null) {
      // 添加匹配前的文本
      if (match.index > currentIndex) {
        parts.push(line.substring(currentIndex, match.index));
      }

      if (match[0].startsWith('**')) {
        // 粗体
        parts.push(<strong key={key++} className="font-bold text-slate-900 dark:text-slate-100">{match[0].slice(2, -2)}</strong>);
      } else if (match[0].startsWith('`')) {
        // 代码
        parts.push(<code key={key++} className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-700 rounded text-xs font-mono text-rose-600 dark:text-rose-400">{match[0].slice(1, -1)}</code>);
      } else if (match[0].startsWith('[')) {
        // 链接
        const text = match[6];
        const url = match[7];
        parts.push(<a key={key++} href={url} target="_blank" rel="noopener noreferrer" className="text-sky-600 dark:text-sky-400 hover:underline">{text}</a>);
      } else {
        // 斜体
        const italicText = match[2] || match[3];
        parts.push(<em key={key++} className="italic text-slate-700 dark:text-slate-300">{italicText}</em>);
      }

      currentIndex = match.index + match[0].length;
    }

    // 添加剩余文本
    if (currentIndex < line.length) {
      parts.push(line.substring(currentIndex));
    }

    return parts.length > 0 ? parts : line;
  };

  const renderLine = (line: string, index: number): React.ReactNode => {
    const trimmedLine = line.trim();
    
    // 空行
    if (!trimmedLine) {
      return <div key={index} className="h-2" />;
    }

    // 标题
    if (line.startsWith('#### ')) {
      return <h5 key={index} className="font-bold text-xs mt-2 mb-1 text-indigo-600 dark:text-indigo-400">{parseInlineStyles(line.substring(5))}</h5>;
    }
    if (line.startsWith('### ')) {
      return <h4 key={index} className="font-bold text-sm mt-3 mb-1.5 text-indigo-700 dark:text-indigo-300">{parseInlineStyles(line.substring(4))}</h4>;
    }
    if (line.startsWith('## ')) {
      return <h3 key={index} className="font-bold text-base mt-4 mb-2 text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 pb-1">{parseInlineStyles(line.substring(3))}</h3>;
    }
    if (line.startsWith('# ')) {
      return <h2 key={index} className="font-bold text-lg mt-4 mb-2 text-slate-900 dark:text-slate-100">{parseInlineStyles(line.substring(2))}</h2>;
    }

    // 引用块
    if (line.startsWith('> ')) {
      return (
        <blockquote key={index} className="border-l-4 border-indigo-400 dark:border-indigo-600 pl-3 py-1 my-2 bg-indigo-50 dark:bg-indigo-900/20 text-slate-700 dark:text-slate-300 italic">
          {parseInlineStyles(line.substring(2))}
        </blockquote>
      );
    }

    // 水平线
    if (line.match(/^(-{3,}|\*{3,}|_{3,})$/)) {
      return <hr key={index} className="my-3 border-slate-300 dark:border-slate-600" />;
    }

    // 有序列表
    const orderedListMatch = line.match(/^(\s*)(\d+)\.\s+(.*)/);
    if (orderedListMatch) {
      const indent = orderedListMatch[1].length;
      const number = orderedListMatch[2];
      const content = orderedListMatch[3];
      return (
        <div key={index} className="flex items-start gap-2" style={{ marginLeft: `${indent * 8}px` }}>
          <span className="font-semibold text-indigo-600 dark:text-indigo-400 min-w-[20px]">{number}.</span>
          <span className="flex-1">{parseInlineStyles(content)}</span>
        </div>
      );
    }

    // 无序列表
    const unorderedListMatch = line.match(/^(\s*)(\*|-|\+)\s+(.*)/);
    if (unorderedListMatch) {
      const indent = unorderedListMatch[1].length;
      const content = unorderedListMatch[3];
      return (
        <div key={index} className="flex items-start gap-2" style={{ marginLeft: `${indent * 8}px` }}>
          <span className="mt-[6px] w-1.5 h-1.5 rounded-full bg-indigo-500 dark:bg-indigo-400 flex-shrink-0" />
          <span className="flex-1">{parseInlineStyles(content)}</span>
        </div>
      );
    }

    // 任务列表
    const taskListMatch = line.match(/^(\s*)[-*]\s+\[([ xX])\]\s+(.*)/);
    if (taskListMatch) {
      const indent = taskListMatch[1].length;
      const checked = taskListMatch[2].toLowerCase() === 'x';
      const content = taskListMatch[3];
      return (
        <div key={index} className="flex items-start gap-2" style={{ marginLeft: `${indent * 8}px` }}>
          <input 
            type="checkbox" 
            checked={checked} 
            readOnly 
            className="mt-1 rounded border-slate-300 dark:border-slate-600"
          />
          <span className={`flex-1 ${checked ? 'line-through text-slate-500' : ''}`}>
            {parseInlineStyles(content)}
          </span>
        </div>
      );
    }

    // 普通段落（表格在下面单独处理）
    return <p key={index} className="leading-relaxed">{parseInlineStyles(line)}</p>;
  };

  // 解析表格
  const parseTable = (lines: string[], startIndex: number): { element: React.ReactNode; endIndex: number } | null => {
    const tableLines: string[] = [];
    let i = startIndex;
    
    // 收集连续的表格行
    while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
      tableLines.push(lines[i].trim());
      i++;
    }
    
    if (tableLines.length < 2) return null; // 至少需要表头和分隔行
    
    // 检查是否有分隔行 (|---|---|)
    const separatorIndex = tableLines.findIndex(line => /^\|[\s\-:|]+\|$/.test(line));
    if (separatorIndex === -1) return null;
    
    const headerLines = tableLines.slice(0, separatorIndex);
    const bodyLines = tableLines.slice(separatorIndex + 1);
    
    const parseRow = (line: string): string[] => {
      return line.split('|').slice(1, -1).map(cell => cell.trim());
    };
    
    const headers = headerLines.length > 0 ? parseRow(headerLines[0]) : [];
    const rows = bodyLines.map(line => parseRow(line));
    
    const element = (
      <div key={`table-${startIndex}`} className="my-2 overflow-x-auto">
        <table className="min-w-full border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100 dark:bg-slate-800">
              {headers.map((header, idx) => (
                <th key={idx} className="px-2 py-1.5 text-left font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                  {parseInlineStyles(header)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => (
              <tr key={rowIdx} className={rowIdx % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50 dark:bg-slate-800/50'}>
                {row.map((cell, cellIdx) => (
                  <td key={cellIdx} className="px-2 py-1.5 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                    {parseInlineStyles(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    
    return { element, endIndex: i - 1 };
  };

  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  
  while (i < lines.length) {
    const line = lines[i];
    const trimmedLine = line.trim();
    
    // 检查是否是表格开始
    if (trimmedLine.startsWith('|') && trimmedLine.endsWith('|')) {
      const tableResult = parseTable(lines, i);
      if (tableResult) {
        elements.push(tableResult.element);
        i = tableResult.endIndex + 1;
        continue;
      }
    }
    
    // 其他行使用 renderLine 处理
    elements.push(renderLine(line, i));
    i++;
  }

  return (
    <div className="text-xs text-slate-700 dark:text-slate-300 space-y-1 leading-relaxed">
      {elements}
    </div>
  );
};

// ... (StatCard, RankingModal, TopStatsList remain same) ...
// Re-inserting helper components for completeness.

const StatCard: React.FC<{ title: string; value: string; subValue?: string, icon: React.ReactNode, onClick?: () => void, tooltip?: string }> = ({ title, value, subValue, icon, onClick, tooltip }) => (
  <div 
    className={`bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg flex items-start gap-4 border border-slate-100 dark:border-slate-700/50 ${onClick ? 'cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors' : ''}`}
    onClick={onClick}
    title={tooltip}
  >
    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
      {icon}
    </div>
    <div>
      <p className="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-1 cursor-help">
        {title}
      </p>
      <p className="text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
      {subValue && <p className="text-xs text-slate-500 dark:text-slate-500">{subValue}</p>}
    </div>
  </div>
);

const RankingModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    title: string;
    unit: string;
    data: { user: DingTalkUser; value: number }[];
    colorClass: string;
}> = ({ isOpen, onClose, title, unit, data, colorClass }) => {
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title} size="md">
            <div className="max-h-[60vh] overflow-y-auto pr-2">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-700 sticky top-0">
                        <tr>
                            <th className="px-4 py-2 w-16 text-center">排名</th>
                            <th className="px-4 py-2">姓名</th>
                            <th className="px-4 py-2 text-right">数值 ({unit})</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {data.map((item, idx) => (
                            <tr key={item.user.userid} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                <td className="px-4 py-2 text-center">
                                    <span className={`inline-block w-5 h-5 text-center leading-5 rounded-full text-xs ${
                                        idx < 3 
                                            ? idx === 0 ? 'bg-yellow-100 text-yellow-700' : idx === 1 ? 'bg-slate-200 text-slate-700' : 'bg-orange-100 text-orange-700'
                                            : 'text-slate-500'
                                    }`}>
                                        {idx + 1}
                                    </span>
                                </td>
                                <td className="px-4 py-2 flex items-center gap-2">
                                    <Avatar name={item.user.name} avatarUrl={item.user.avatar} size="sm" />
                                    <span className="font-medium text-slate-700 dark:text-slate-200">{item.user.name}</span>
                                </td>
                                <td className={`px-4 py-2 text-right font-mono font-bold ${colorClass}`}>
                                    {item.value} {unit}
                                </td>
                            </tr>
                        ))}
                        {data.length === 0 && (
                            <tr><td colSpan={3} className="text-center py-4 text-slate-400">暂无数据</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </Modal>
    );
};

const TopStatsList: React.FC<{ 
    employees: { user: DingTalkUser, stats: any }[], 
    type: string, 
    icon: React.ReactNode, 
    color: string,
    onShowFull: (type: string, title: string, unit: string, data: any[]) => void,
    lateExemptionEnabled?: boolean
}> = ({ employees, type, icon, color, onShowFull, lateExemptionEnabled = true }) => {
  
  const getValue = (e: { stats: any }) => {
      switch(type) {
          case 'exemptedLateMinutes': 
            // 根据豁免开关决定使用哪个字段
            return lateExemptionEnabled ? (e.stats.exemptedLateMinutes || 0) : (e.stats.lateMinutes || 0);
          case 'overtimeTotalMinutes': return e.stats.overtimeTotalMinutes || 0;
          case 'sickHours': return e.stats.sickHours || 0;
          case 'personalHours': return e.stats.personalHours || 0;
          case 'missing': return e.stats.missing || 0;
          case 'absenteeism': return e.stats.absenteeism || 0;
          default: return 0;
      }
  };

  const sorted = [...employees]
    .map(e => ({ user: e.user, value: getValue(e) }))
    .sort((a, b) => b.value - a.value)
    .filter(e => e.value > 0);

  const top3 = sorted.slice(0, 3);

  const configMap: Record<string, { title: string, unit: string }> = {
      'exemptedLateMinutes': { title: lateExemptionEnabled ? '迟到榜 (豁免后)' : '迟到榜', unit: '分钟' },
      'overtimeTotalMinutes': { title: '加班榜 (奋斗)', unit: '分钟' },
      'sickHours': { title: '病假榜 (健康)', unit: '小时' },
      'personalHours': { title: '事假榜', unit: '小时' },
      'missing': { title: '缺卡榜', unit: '次' },
      'absenteeism': { title: '旷工榜', unit: '次' }
  };

  const { title, unit } = configMap[type] || { title: '排行榜', unit: '' };

  if (top3.length === 0) return (
    <div className="flex-1 min-w-[130px] p-2 bg-slate-50 dark:bg-slate-800/50 rounded-md flex flex-col items-center justify-center text-slate-400 text-xs h-32 border border-slate-100 dark:border-slate-700/50">
      <div className="opacity-50 mb-1">{icon}</div>
      <span>{title}</span>
      <span className="scale-75 opacity-70">暂无数据</span>
    </div>
  );

  return (
    <div 
        className="flex-1 min-w-[130px] p-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg transition-colors cursor-pointer group"
        onClick={() => onShowFull(type, title, unit, sorted)}
    >
      <div className={`flex items-center justify-between text-xs font-bold mb-2 ${color}`}>
        <div className="flex items-center gap-1">
            {icon}
            <span className="truncate">{title}</span>
        </div>
        <ChevronRightIcon className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <ul className="space-y-1.5">
        {top3.map((item, idx) => (
          <li key={item.user.userid} className="flex justify-between items-center text-xs">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={`w-3.5 h-3.5 flex items-center justify-center rounded-full text-[9px] font-bold ${
                  idx === 0 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-400' : 
                  idx === 1 ? 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300' : 
                  'bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400'
              }`}>{idx + 1}</span>
              <Avatar name={item.user.name} avatarUrl={item.user.avatar} size="sm" />
              <span className="text-slate-700 dark:text-slate-300 truncate max-w-[50px]">{item.user.name}</span>
            </div>
            <div className="text-right">
                <span className={`font-mono font-bold ${color.split(' ')[0]}`}>{item.value}</span>
                <span className="text-[9px] text-slate-400 scale-90 ml-0.5 inline-block">{unit}</span>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-1.5 text-[10px] text-slate-400 text-center opacity-0 group-hover:opacity-100 transition-opacity">
          点击查看全部 {sorted.length} 人
      </div>
    </div>
  );
};

// --- Main Dashboard Component ---

export const CompanyDashboardView: React.FC<{
  companyCounts: CompanyCounts;
  month: number;
  year: number;
  allUsers: DingTalkUser[];
  attendanceMap: any;
  processDataMap: Record<string, any>;
  onViewEmployeeList: (companyName: string) => void;
  onViewCalendar: (companyName: string) => void;
  onDownloadReports: (companyName: string) => void;
  onCustomDownload?: (companyName: string) => void; // 自定义下载回调
  onPushReport?: () => void; // 推送报告回调
  holidays: any;
  companyEmployeeStats: any;
  companyAggregate: any;
  dailyTrend: any;
  onSelectEmployeeForAnalysis: (employee: { user: DingTalkUser; stats: EmployeeStats }) => void;
  activeCompany: string; // Passed from parent
  canViewAiAnalysis?: boolean; // Permission Prop
  lateExemptionEnabled?: boolean; // 是否启用豁免功能
  fullAttendanceEnabled?: boolean; // 是否启用全勤功能
  performancePenaltyEnabled?: boolean; // 是否启用绩效考核功能
}> = ({ companyCounts, month, year, companyEmployeeStats, companyAggregate, dailyTrend, onViewEmployeeList, onViewCalendar, onDownloadReports, onCustomDownload, onPushReport, holidays, attendanceMap, processDataMap, onSelectEmployeeForAnalysis, activeCompany, canViewAiAnalysis = false, lateExemptionEnabled = true, fullAttendanceEnabled = true, performancePenaltyEnabled = true }) => {

  const [showRiskModal, setShowRiskModal] = useState(false);
  const [riskEmployees, setRiskEmployees] = useState<{ user: DingTalkUser; stats: EmployeeStats }[]>([]);
  
  // State for Ranking Modal
  const [rankingModal, setRankingModal] = useState<{ isOpen: boolean; title: string; unit: string; data: any[]; colorClass: string } | null>(null);

  // AI Analysis State
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);

  // AI 月度诊断分析函数
  const runMonthlyAnalysis = async (forceRefresh = false) => {
      if (!canViewAiAnalysis || !activeCompany || !companyAggregate || !companyEmployeeStats) return;
      
      // 先清空之前的分析结果
      setAiAnalysis(null);
      
      // 生成缓存 key
      const cacheKey = getMonthlyAnalysisCacheKey(activeCompany, year, month);
      
      // 检查缓存（非强制刷新时）
      if (!forceRefresh) {
          const cachedContent = await getCachedAnalysis(cacheKey);
          if (cachedContent) {
              setAiAnalysis(cachedContent);
              return;
          }
      }
      
      // 缓存不存在或强制刷新，调用 AI 接口
      let summary: any;
      let risky: any[] = [];
      
      if (activeCompany === '全部') {
          const totalEmployees = Object.values(companyEmployeeStats).flat();
          const totalAgg = Object.values(companyAggregate).reduce((total: any, companyAgg: any) => ({
              abnormalUserCount: total.abnormalUserCount + (companyAgg?.abnormalUserCount || 0),
              totalLateMinutes: total.totalLateMinutes + (companyAgg?.totalLateMinutes || 0)
          }), { abnormalUserCount: 0, totalLateMinutes: 0 });
          
          summary = {
              rate: (totalAgg as any).abnormalUserCount > 0 
                  ? (((totalEmployees.length - (totalAgg as any).abnormalUserCount) / totalEmployees.length) * 100).toFixed(1) 
                  : 100,
              riskCount: (totalAgg as any).abnormalUserCount,
              totalCount: totalEmployees.length,
              totalLateMinutes: (totalAgg as any).totalLateMinutes
          };
          
          risky = totalEmployees
              .filter((e: any) => {
                  const lateMinutesValue = lateExemptionEnabled ? e.stats.exemptedLateMinutes : e.stats.lateMinutes;
                  return lateMinutesValue > 30 || e.stats.missing > 3 || (e.stats as any).absenteeism >= 1;
              })
              .map((e: any) => ({
                  name: e.user.name,
                  company: e.user.mainCompany,
                  late: e.stats.late,
                  lateMinutes: lateExemptionEnabled ? e.stats.exemptedLateMinutes : e.stats.lateMinutes,
                  missing: e.stats.missing,
                  absenteeism: (e.stats as any).absenteeism || 0,
                  sick: e.stats.sickHours,
                  personal: e.stats.personalHours
              }))
              .slice(0, 5);
      } else if (companyAggregate[activeCompany] && companyEmployeeStats[activeCompany]) {
          summary = {
              rate: companyAggregate[activeCompany].abnormalUserCount > 0 
                  ? (((companyEmployeeStats[activeCompany].length - companyAggregate[activeCompany].abnormalUserCount) / companyEmployeeStats[activeCompany].length) * 100).toFixed(1) 
                  : 100,
              riskCount: companyAggregate[activeCompany].abnormalUserCount,
              totalCount: companyEmployeeStats[activeCompany].length,
              totalLateMinutes: companyAggregate[activeCompany].totalLateMinutes
          };
          
          risky = companyEmployeeStats[activeCompany]
              .filter((e: any) => {
                  const lateMinutesValue = lateExemptionEnabled ? e.stats.exemptedLateMinutes : e.stats.lateMinutes;
                  return lateMinutesValue > 30 || e.stats.missing > 3 || (e.stats as any).absenteeism >= 1;
              })
              .map((e: any) => ({
                  name: e.user.name,
                  late: e.stats.late,
                  lateMinutes: lateExemptionEnabled ? e.stats.exemptedLateMinutes : e.stats.lateMinutes,
                  missing: e.stats.missing,
                  absenteeism: (e.stats as any).absenteeism || 0,
                  sick: e.stats.sickHours,
                  personal: e.stats.personalHours
              }))
              .slice(0, 5);
      }
      
      if (summary) {
          setIsAnalysing(true);
          
          const companyNameForPrompt = activeCompany === '全部' ? '全体公司' : activeCompany;
          const riskEmployeesList = risky && risky.length > 0
              ? risky.slice(0, 5)
                  .filter(emp => emp?.name)
                  .map((emp, i) => 
                      `${i + 1}. ${emp.name} - 迟到${emp.late || 0}次，缺卡${emp.missing || 0}次，豁免后迟到时长${emp.lateMinutes || 0}分钟`
                  ).join('\n')
              : '暂无风险员工';
          
          const attendanceScoreValue = summary.riskCount > 0 
              ? (((summary.totalCount - summary.riskCount) / summary.totalCount) * 100).toFixed(2) 
              : '100';
          
          const prompt = `
请分析 ${companyNameForPrompt} 的整体考勤情况：

整体数据：
- 总人数：${summary.totalCount}
- 考勤健康分：${attendanceScoreValue}
- 风险人数：${summary.riskCount}
- 总豁免后迟到时长：${summary.totalLateMinutes} 分钟（说明：公司有迟到豁免政策，每月前3次且单次≤15分钟的迟到可豁免，此处为扣除豁免后的实际计入考核的迟到时长）

风险员工TOP5（豁免后迟到时长）：
${riskEmployeesList}

请提供：
1. 整体考勤情况评估
2. 主要问题和风险点
3. 管理改进建议
4. 针对性措施
          `.trim();

          try {
              const response = await analyzeAttendanceInsights(prompt);
              setAiAnalysis(response.content);
              setCachedAnalysis(cacheKey, response.content, 'monthly').catch(console.error);
          } catch (err) {
              console.error("AI Analysis failed", err);
          } finally {
              setIsAnalysing(false);
          }
      }
  };

  useEffect(() => {
      // 每次切换公司 tab 时触发 AI 分析
      runMonthlyAnalysis();
  }, [activeCompany, companyEmployeeStats, companyAggregate, canViewAiAnalysis, year, month]);

  const openRiskModal = (employees: { user: DingTalkUser; stats: EmployeeStats }[]) => {
    const risky = employees.filter(e => {
      const lateMinutesValue = lateExemptionEnabled ? e.stats.exemptedLateMinutes : e.stats.lateMinutes;
      return lateMinutesValue > 30 || e.stats.missing > 3 || (e.stats as any).absenteeism >= 1;
    });
    setRiskEmployees(risky);
    setShowRiskModal(true);
  };

  const handleShowRanking = (type: string, title: string, unit: string, data: any[]) => {
      let colorClass = 'text-slate-800';
      if (type === 'exemptedLateMinutes') colorClass = 'text-orange-600';
      else if (type === 'overtimeTotalMinutes') colorClass = 'text-blue-600';
      else if (type === 'sickHours') colorClass = 'text-rose-600';
      else if (type === 'personalHours') colorClass = 'text-yellow-600';
      else if (type === 'missing') colorClass = 'text-red-600';
      else if (type === 'absenteeism') colorClass = 'text-red-800';

      setRankingModal({ isOpen: true, title, unit, data, colorClass });
  };

  const companyName = activeCompany;
  
  // Add safety checks for undefined/empty companyName and missing data
  let employees: any[] = [];
  let agg: any = { totalLateMinutes: 0, abnormalUserCount: 0, totalRecords: 0, abnormalRecords: 0 };
  
  if (companyName === '全部') {
    // 汇总所有公司的数据
    employees = Object.values(companyEmployeeStats).flat().filter(({ user }: any) => {
      const nextMonthDate = new Date(year, month + 1, 1);
      return new Date(user.create_time).getTime() < nextMonthDate.getTime();
    });
    
    // 汇总所有公司的统计数据
    agg = Object.values(companyAggregate).reduce((total: any, companyAgg: any) => ({
      totalLateMinutes: total.totalLateMinutes + (companyAgg?.totalLateMinutes || 0),
      abnormalUserCount: total.abnormalUserCount + (companyAgg?.abnormalUserCount || 0),
      totalRecords: total.totalRecords + (companyAgg?.totalRecords || 0),
      abnormalRecords: total.abnormalRecords + (companyAgg?.abnormalRecords || 0)
    }), { totalLateMinutes: 0, abnormalUserCount: 0, totalRecords: 0, abnormalRecords: 0 });
  } else {
    // 单个公司的数据
    employees = (companyName && companyEmployeeStats && companyEmployeeStats[companyName]) ? companyEmployeeStats[companyName].filter(({ user }: any) => {
      const nextMonthDate = new Date(year, month + 1, 1);
      return new Date(user.create_time).getTime() < nextMonthDate.getTime();
    }) : [];
    
    agg = (companyName && companyAggregate && companyAggregate[companyName]) ? companyAggregate[companyName] : { totalLateMinutes: 0, abnormalUserCount: 0, totalRecords: 0, abnormalRecords: 0 };
  }
  
  const attendanceScore = agg.abnormalUserCount > 0 ? (((employees.length - agg.abnormalUserCount) / employees.length) * 100).toFixed(2) : 100;

  // 检查数据是否正在加载
  const isLoading = !companyName || !companyEmployeeStats || !companyAggregate || employees.length === 0;

  if (!activeCompany) return null;

  return (
    <div className="bg-white dark:bg-slate-900/80 rounded-lg shadow-sm flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300 h-[calc(100vh-180px)]">
      <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
        <div className="flex justify-between items-center mb-6">
          <div><h3 className="text-2xl font-bold text-slate-900 dark:text-white truncate" title={companyName}>{companyName}</h3></div>
          <div className="flex gap-2">
              <button 
                onClick={() => onDownloadReports(activeCompany)} 
                className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-sm"
              >
                  <DownloadIcon className="w-3.5 h-3.5" />下载报表
              </button>
              {onCustomDownload && (
                <button 
                  onClick={() => onCustomDownload(activeCompany)} 
                  className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-sm"
                >
                    <SlidersHorizontalIcon className="w-3.5 h-3.5" />自定义下载
                </button>
              )}
              {onPushReport && (
                <button 
                  onClick={onPushReport} 
                  className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded hover:bg-emerald-500 transition-all shadow-sm"
                >
                    <SendIcon className="w-3.5 h-3.5" />推送
                </button>
              )}
              <button 
                onClick={() => onViewEmployeeList(activeCompany === '全部' ? '全部' : activeCompany)} 
                className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-700 text-xs font-semibold rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-all shadow-sm"
              >
                  <UsersIcon className="w-3.5 h-3.5" />查看员工列表
              </button>
              <button 
                onClick={() => onViewCalendar(activeCompany === '全部' ? '全部' : activeCompany)} 
                className="flex items-center gap-2 px-3 py-1.5 bg-sky-600 text-white text-xs font-semibold rounded hover:bg-sky-500 transition-all shadow-sm"
              >
                  <CalendarIcon className="w-3.5 h-3.5" />查看考勤日历
              </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard 
              title="总人数" 
              value={String(employees.length)} 
              icon={<UsersIcon className="w-6 h-6 text-blue-600" />} 
              tooltip={`当前选定月份内，${companyName}在册且有考勤记录的员工总数。`}
          />
          <StatCard 
              title="考勤健康分" 
              value={String(attendanceScore)} 
              icon={<ClockIcon className="w-6 h-6 text-green-600" />} 
              tooltip="反映全员考勤合规程度。&#10;公式：(1 - 纪律风险人数 / 总人数) * 100。&#10;分值越高代表考勤纪律越好。"
          />
          <StatCard 
              title="纪律风险人数" 
              value={String(agg.abnormalUserCount)} 
              icon={<AlertTriangleIcon className="w-6 h-6 text-amber-600" />} 
              onClick={() => openRiskModal(employees)}
              tooltip="本月考勤异常较严重的员工数。&#10;判定标准：&#10;1. 豁免后迟到 > 30分钟&#10;2. 缺卡 > 3次&#10;3. 旷工 ≥ 1次"
          />
        </div>
      </div>

      <div className="flex flex-col flex-1 min-h-0 gap-4">
        <div className="flex-shrink-0 px-6">
            <AccordionSection title="数据分析与洞察" icon={<TrendingUpIcon className="w-5 h-5 text-indigo-500 " />} isSticky={false}>
            {/* Reduced vertical padding here */}
            <div className="my-2 ml-1 mr-1">
                {/* Ranking Lists Row */}
                <div className="flex flex-wrap gap-2 bg-white dark:bg-slate-900/40 p-2 rounded-lg border border-slate-100 dark:border-slate-700/50">
                    <TopStatsList employees={employees} type="exemptedLateMinutes" icon={<ClockIcon className="w-3 h-3" />} color="text-orange-600 dark:text-orange-400" onShowFull={handleShowRanking} lateExemptionEnabled={lateExemptionEnabled} />
                    <div className="w-px bg-slate-100 dark:bg-slate-700 self-stretch my-2"></div>
                    <TopStatsList employees={employees} type="missing" icon={<XCircleIcon className="w-3 h-3" />} color="text-red-600 dark:text-red-400" onShowFull={handleShowRanking} />
                    <div className="w-px bg-slate-100 dark:bg-slate-700 self-stretch my-2"></div>
                    <TopStatsList employees={employees} type="absenteeism" icon={<AlertTriangleIcon className="w-3 h-3" />} color="text-red-800 dark:text-red-600" onShowFull={handleShowRanking} />
                    <div className="w-px bg-slate-100 dark:bg-slate-700 self-stretch my-2"></div>
                    <TopStatsList employees={employees} type="overtimeTotalMinutes" icon={<SparklesIcon className="w-3 h-3" />} color="text-blue-600 dark:text-blue-400" onShowFull={handleShowRanking} />
                    <div className="w-px bg-slate-100 dark:bg-slate-700 self-stretch my-2"></div>
                    <TopStatsList employees={employees} type="sickHours" icon={<ActivityIcon className="w-3 h-3" />} color="text-rose-600 dark:text-rose-400" onShowFull={handleShowRanking} />
                    <div className="w-px bg-slate-100 dark:bg-slate-700 self-stretch my-2"></div>
                    <TopStatsList employees={employees} type="personalHours" icon={<UserMinusIcon className="w-3 h-3" />} color="text-yellow-600 dark:text-yellow-400" onShowFull={handleShowRanking} />
                </div>
                
                <div className="flex gap-4 mt-4 h-48 w-full">
                    {/* Chart Area */}
                    <div className="flex-1 bg-white dark:bg-slate-900/40 rounded-lg border border-slate-100 dark:border-slate-700 p-1 min-w-0">
                        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 ml-2">本月异常趋势 (迟到/缺卡/请假)</div>
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={companyName === '全部' ? 
                                // 汇总所有公司的每日趋势数据
                                Object.keys(dailyTrend).length > 0 ? 
                                    Array.from({ length: 31 }, (_, i) => {
                                        const day = i + 1;
                                        const dayStr = `${month + 1}月${day}日`; // 匹配DailyTrend中的day格式
                                        const dayData = Object.values(dailyTrend).reduce((total: any, companyData: any) => {
                                            const dayRecord = (companyData as any[])?.find((d: any) => d.day === dayStr);
                                            if (dayRecord) {
                                                return {
                                                    day,
                                                    late: total.late + (dayRecord.late || 0),
                                                    missing: total.missing + (dayRecord.missing || 0),
                                                    personal: total.personal + (dayRecord.personal || 0),
                                                    sick: total.sick + (dayRecord.sick || 0),
                                                    annual: total.annual + (dayRecord.annual || 0),
                                                    compTime: total.compTime + (dayRecord.compTime || 0)
                                                };
                                            }
                                            return { ...total, day };
                                        }, { day, late: 0, missing: 0, personal: 0, sick: 0, annual: 0, compTime: 0 });
                                        return dayData;
                                    }) // 移除过滤，显示所有天数（包括0值）
                                : []
                                : dailyTrend[companyName] || []
                            }>
                            <defs>
                                <linearGradient id="colorLate" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f97316" stopOpacity={0.3} /><stop offset="95%" stopColor="#f97316" stopOpacity={0} /></linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis dataKey="day" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval={2} />
                            <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={20} />
                            <Tooltip contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }} itemStyle={{ fontSize: '12px', padding: 0 }} labelStyle={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '4px', color: '#334155' }} />
                            <Area type="monotone" dataKey="late" name="迟到人次" stroke="#f97316" strokeWidth={2} fillOpacity={1} fill="url(#colorLate)" />
                            <Area type="monotone" dataKey="missing" name="缺卡人次" stroke="#ef4444" strokeWidth={2} fillOpacity={0} fill="#ef4444" />
                            <Area type="monotone" dataKey="personal" name="事假人次" stroke="#b733d580" strokeWidth={2} fillOpacity={0} fill="#b733d580" />
                            <Area type="monotone" dataKey="sick" name="病假人次" stroke="#643eb6" strokeWidth={2} fillOpacity={0} fill="#643eb6" />
                            <Area type="monotone" dataKey="annual" name="年假人次" stroke="#80da7c" strokeWidth={2} fillOpacity={0} fill="#80da7c" />
                            <Area type="monotone" dataKey="compTime" name="调休人次" stroke="#0d738e" strokeWidth={2} fillOpacity={0} fill="#0d738e" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>

                    {/* AI Analysis Box */}
                    {canViewAiAnalysis && (
                        <div className="w-1/3 bg-gradient-to-br from-indigo-50 to-white dark:from-slate-800 dark:to-slate-900 rounded-lg border border-indigo-100 dark:border-slate-700 p-4 relative overflow-hidden flex flex-col">
                            <div className="absolute top-0 right-0 p-2 opacity-10"><SparklesIcon className="w-16 h-16 text-indigo-500" /></div>
                            <div className="flex items-center justify-between mb-2 relative z-10 flex-shrink-0">
                                <h4 className="text-sm font-bold text-indigo-900 dark:text-indigo-100 flex items-center gap-2"><SparklesIcon className="w-4 h-4 text-indigo-500" />AI 智能月度诊断</h4>
                                <div className="flex items-center gap-2">
                                    {isAnalysing && <Loader2Icon className="w-3 h-3 animate-spin text-indigo-500" />}
                                    {aiAnalysis && !isAnalysing && (
                                        <>
                                            <button 
                                                onClick={() => runMonthlyAnalysis(true)}
                                                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 rounded transition-colors"
                                                title="重新分析"
                                            >
                                                <RefreshCwIcon className="w-3 h-3" />
                                                重新分析
                                            </button>
                                            <button 
                                                onClick={() => setShowAiModal(true)}
                                                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 rounded transition-colors"
                                                title="展开查看完整内容"
                                            >
                                                <ChevronRightIcon className="w-3 h-3" />
                                                展开
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                            <div className="relative z-10 overflow-y-auto pr-1 custom-scrollbar flex-1 text-xs">
                                {isAnalysing ? (
                                    <div className="space-y-2 animate-pulse mt-2">
                                        <div className="h-3 bg-indigo-200/50 dark:bg-slate-700 rounded w-3/4"></div>
                                        <div className="h-3 bg-indigo-200/50 dark:bg-slate-700 rounded w-full"></div>
                                        <div className="h-3 bg-indigo-200/50 dark:bg-slate-700 rounded w-5/6"></div>
                                    </div>
                                ) : (
                                    <div>{aiAnalysis ? <EnhancedMarkdownRenderer text={aiAnalysis} /> : <p className="text-slate-500 italic">暂无分析数据。</p>}</div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
            </AccordionSection>
        </div>

        {/* Separated Stats Table */}
        <div className="flex-1 min-h-0 overflow-hidden px-6 pb-6">
            {isLoading ? (
              <div className="h-full flex items-center justify-center bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
                <div className="text-center">
                  <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-sky-600 mb-3"></div>
                  <p className="text-slate-600 dark:text-slate-400 text-sm">正在加载员工考勤数据...</p>
                  <p className="text-slate-500 dark:text-slate-500 text-xs mt-1">
                    {!companyEmployeeStats ? '正在计算考勤统计...' : 
                     !companyAggregate ? '正在汇总数据...' : 
                     '正在加载员工信息...'}
                  </p>
                </div>
              </div>
            ) : employees.length === 0 ? (
              <div className="h-full flex items-center justify-center bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
                <div className="text-center">
                  <div className="text-slate-400 mb-2">
                    <UsersIcon className="w-12 h-12 mx-auto mb-2" />
                  </div>
                  <p className="text-slate-600 dark:text-slate-400 text-sm">暂无员工考勤数据</p>
                  <p className="text-slate-500 dark:text-slate-500 text-xs mt-1">请检查选定的时间范围和公司</p>
                </div>
              </div>
            ) : (
              <AttendanceStatsTable employees={employees} onRowClick={onSelectEmployeeForAnalysis} companyName={companyName} lateExemptionEnabled={lateExemptionEnabled} fullAttendanceEnabled={fullAttendanceEnabled} performancePenaltyEnabled={performancePenaltyEnabled} />
            )}
        </div>
      </div>

      {/* Risk Modal */}
      <Modal isOpen={showRiskModal} onClose={() => setShowRiskModal(false)} title="纪律风险人员名单" size="lg">
        <div className="max-h-[60vh] overflow-y-auto">
            {riskEmployees.length > 0 ? (
                <table className="min-w-full text-sm text-left text-slate-600 dark:text-slate-300">
                    <thead className="text-xs text-slate-700 uppercase bg-slate-100 dark:bg-slate-700 dark:text-slate-200">
                        <tr>
                            <th className="px-4 py-2 min-w-[5rem]">姓名</th>
                            <th className="px-4 py-2">部门</th>
                            <th className="px-4 py-2 min-w-[200px]">风险原因</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
                        {riskEmployees.map((item) => {
                            const reasons = [];
                            const lateMinutesValue = lateExemptionEnabled ? item.stats.exemptedLateMinutes : item.stats.lateMinutes;
                            const lateLabel = lateExemptionEnabled ? '豁免后迟到' : '迟到';
                            if (lateMinutesValue > 30) reasons.push(`${lateLabel} ${lateMinutesValue} 分钟`);
                            if (item.stats.missing > 3) reasons.push(`缺卡 ${item.stats.missing} 次`);
                            if ((item.stats as any).absenteeism >= 1) reasons.push(`旷工 ${(item.stats as any).absenteeism} 次`);
                            
                            return (
                                <tr key={item.user.userid}>
                                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{item.user.name}</td>
                                    <td className="px-4 py-3">{item.user.department}</td>
                                    <td className="px-4 py-3 text-red-600 dark:text-red-400 font-medium">
                                        {reasons.length === 1 ? (
                                            <span>{reasons[0]}</span>
                                        ) : (
                                            <ol className="list-decimal list-inside space-y-1">
                                                {reasons.map((reason, idx) => (
                                                    <li key={idx}>{reason}</li>
                                                ))}
                                            </ol>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            ) : (
                <p className="text-center text-slate-500 py-4">无风险人员</p>
            )}
        </div>
        <div className="mt-4 flex justify-end">
            <button onClick={() => setShowRiskModal(false)} className="px-4 py-2 bg-slate-200 dark:bg-slate-600 rounded-md text-sm font-medium hover:bg-slate-300 dark:hover:bg-slate-500">关闭</button>
        </div>
      </Modal>

      {/* Ranking Modal */}
      {rankingModal && (
          <RankingModal 
            isOpen={rankingModal.isOpen} 
            onClose={() => setRankingModal(null)} 
            title={rankingModal.title}
            unit={rankingModal.unit}
            data={rankingModal.data}
            colorClass={rankingModal.colorClass}
          />
      )}

      {/* AI Analysis Modal */}
      <Modal isOpen={showAiModal} onClose={() => setShowAiModal(false)} title="AI 智能月度诊断" size="2xl">
        <div className="max-h-[70vh] overflow-y-auto pr-2">
          {aiAnalysis ? (
            <div className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
              <EnhancedMarkdownRenderer text={aiAnalysis} />
            </div>
          ) : (
            <p className="text-slate-500 italic text-center py-8">暂无分析数据</p>
          )}
        </div>
      </Modal>
    </div>
  );
};
