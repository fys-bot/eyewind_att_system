
import React, { useState } from 'react';
import {
    ChevronUpIcon, ChevronDownIcon, FileTextIcon, ClockIcon, CheckCircleIcon,
    XIcon, Loader2Icon, CalendarIcon, ArrowRightIcon, UserIcon, MapPinIcon,
    BriefcaseIcon, CoffeeIcon, PlaneIcon, CarIcon, UserMinusIcon, ActivityIcon
} from '../../Icons.tsx';

export const Avatar: React.FC<{ name: string; avatarUrl?: string; size?: 'sm' | 'lg' | 'xl' }> = ({ name, avatarUrl, size = 'sm' }) => {
    const sizeClasses = {
        sm: 'w-8 h-8 text-sm',
        lg: 'w-24 h-24 text-4xl',
        xl: 'w-12 h-12 text-xl',
    }[size];
    if (avatarUrl) return <img src={avatarUrl} alt={name} className={`rounded-full object-cover flex-shrink-0 ${sizeClasses}`} />;

    const initial = name ? name.charAt(0).toUpperCase() : '?';
    const colors = ['bg-sky-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-indigo-500'];
    const color = colors[initial.charCodeAt(0) % colors.length];
    return <div className={`rounded-full flex items-center justify-center ${color} text-white font-bold flex-shrink-0 ${sizeClasses}`}>{initial}</div>;
};

export const AccordionSection: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean; isSticky?: boolean; }> = ({ title, icon, children, defaultOpen = true, isSticky = false }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    return (
        <div className={`border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 overflow-hidden mt-6 shadow-sm ${isSticky ? 'sticky top-0 z-30' : ''}`}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex justify-between items-center p-4 text-left bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors"
            >
                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-3">
                    {icon} {title}
                </h3>
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                    <span className="text-xs font-medium">{isOpen ? '收起' : '展开'}</span>
                    {isOpen ? <ChevronUpIcon className="w-5 h-5" /> : <ChevronDownIcon className="w-5 h-5" />}
                </div>
            </button>
            {isOpen && (
                <div className="p-6 border-t border-slate-100 dark:border-slate-700 animate-in slide-in-from-top-2 duration-200">
                    {children}
                </div>
            )}
        </div>
    );
};

export const ProcessDetailCard: React.FC<{ processInfo: any }> = ({ processInfo }) => {
    if (!processInfo) return null;
    const { title, bizType, status, result, create_time, finish_time, formValues } = processInfo;

    // --- Dynamic Type & Styling ---
    // Try to get specific type from formValues (e.g. "年假", "调休") or fallback to bizType ("请假", "出差")
    const specificType = formValues?.leaveType || formValues?.type || bizType || '审批';
    
    // Determine Icon and Color Scheme based on type
    let TypeIcon = FileTextIcon;
    let headerColorClass = "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-900/50";

    if (specificType.includes('出差')) {
        TypeIcon = BriefcaseIcon;
        headerColorClass = "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-900/50";
    } else if (specificType.includes('年假') || specificType.includes('调休')) {
        TypeIcon = CoffeeIcon;
        headerColorClass = "bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border-orange-100 dark:border-orange-900/50";
    } else if (specificType.includes('病假')) {
        TypeIcon = ActivityIcon;
        headerColorClass = "bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 border-rose-100 dark:border-rose-900/50";
    } else if (specificType.includes('事假') || specificType.includes('丧假')) {
        TypeIcon = UserMinusIcon;
        headerColorClass = "bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400 border-yellow-100 dark:border-yellow-900/50";
    } else if (specificType.includes('外出')) {
        TypeIcon = MapPinIcon;
        headerColorClass = "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/50";
    }

    // --- Dynamic Title Generation ---
    // Extract name from original title (usually "Name提交的...")
    let applicantName = '';
    if (title.includes('提交的')) {
        applicantName = title.split('提交的')[0];
    } else if (title.endsWith('的请假申请') || title.endsWith('的申请') || title.endsWith('的出差申请')) {
        applicantName = title.split('的')[0];
    }
    
    // Construct new title: Name + 提交的 + Specific Type + 详情
    // e.g. "蔡龙涵提交的调休详情"
    const displayTitle = applicantName ? `${applicantName}提交的${specificType}详情` : title;


    // --- Status Styling ---
    let statusConfig = { text: status, color: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300", icon: ClockIcon };

    if (status === 'COMPLETED') {
        if (result === 'agree') {
            statusConfig = { text: "已通过", color: "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800", icon: CheckCircleIcon };
        } else if (result === 'refuse') {
            statusConfig = { text: "已拒绝", color: "bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800", icon: XIcon };
        } else {
            statusConfig = { text: "已完成", color: "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800", icon: CheckCircleIcon };
        }
    } else if (status === 'RUNNING') {
        statusConfig = { text: "审批中", color: "bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800", icon: Loader2Icon };
    } else if (status === 'TERMINATED') {
        statusConfig = { text: "已终止", color: "bg-orange-50 text-orange-700 border border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800", icon: XIcon };
    }

    const { text: statusText, color: statusColor, icon: StatusIcon } = statusConfig;

    // --- Helper: Duration Formatting ---
    // Unified to Hours (Day * 8)
    const getFormattedDuration = () => {
        if (!formValues) return null;
        let duration = parseFloat(formValues.duration || formValues.days || formValues.hours || 0);
        const unit = formValues.unit || formValues.durationUnit; // 'DAY', 'day', 'HOUR', 'hour', etc.
        
        if (!duration) return null;

        let displayValue = '';
        if (unit && (unit.toUpperCase() === 'DAY' || unit === '天')) {
            // Convert to hours for display? Or just show as is? 
            // Requirement says: "Unified unit: hour. If day, convert to hour ==> day * 8"
            const hours = duration * 8;
            // Format: "X 天 (Y 小时)" or just "Y 小时"? The requirement implies "Unified unit: Hour".
            // Let's show "Y 小时"
            displayValue = `${hours} 小时`;
        } else {
            displayValue = `${duration} 小时`;
        }
        return displayValue;
    };

    // --- Helper: Trip Visualization ---
    const renderTripList = (tripListString: string) => {
        try {
            const trips = JSON.parse(tripListString);
            if (!Array.isArray(trips)) return null;

            return trips.map((trip: any, index: number) => {
                const row = trip.rowValue || [];
                const getValue = (alias: string) => {
                    const field = row.find((r: any) => r.bizAlias === alias);
                    return field?.value || '';
                };

                const vehicle = getValue('vehicle') || '交通工具';
                const type = getValue('singleOrReturn') || '单程';
                const departure = getValue('departure') || '出发地';
                const arrival = getValue('arrival') || '目的地';
                const startTime = getValue('startTime');
                const endTime = getValue('endTime');
                
                // Vehicle Icon Logic
                let VehicleIcon = PlaneIcon;
                if (vehicle.includes('车') || vehicle.includes('汽')) VehicleIcon = CarIcon;

                return (
                    <div key={index} className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700 mb-3 last:mb-0 relative overflow-hidden group hover:border-indigo-200 dark:hover:border-indigo-800 transition-colors">
                        <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none group-hover:opacity-10 transition-opacity">
                            <VehicleIcon className="w-24 h-24" />
                        </div>

                        <div className="relative z-10">
                            <div className="flex justify-between items-center mb-4">
                                <div className="flex items-center gap-2">
                                    <span className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 px-2.5 py-1 rounded-md text-xs font-bold shadow-sm flex items-center gap-1">
                                        <VehicleIcon className="w-3 h-3" />
                                        {vehicle}
                                    </span>
                                    <span className="text-slate-500 dark:text-slate-400 text-xs border border-slate-300 dark:border-slate-600 px-2 py-0.5 rounded-md bg-white dark:bg-slate-800">
                                        {type}
                                    </span>
                                </div>
                            </div>
                            
                            <div className="flex items-center justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                    <div className="font-bold text-lg text-slate-900 dark:text-white truncate">{departure}</div>
                                    <div className="text-xs text-slate-500 mt-1">{startTime || '--'}</div>
                                </div>
                                
                                <div className="flex-shrink-0 flex flex-col items-center justify-center text-slate-300 dark:text-slate-600">
                                    <ArrowRightIcon className="w-5 h-5" />
                                    <span className="text-[10px] mt-1">前往</span>
                                </div>

                                <div className="flex-1 min-w-0 text-right">
                                    <div className="font-bold text-lg text-slate-900 dark:text-white truncate">{arrival}</div>
                                    <div className="text-xs text-slate-500 mt-1">{endTime || '--'}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            });
        } catch (e) {
            return null;
        }
    };

    // --- Render Logic ---
    const tripList = formValues?.["行程"] ? renderTripList(formValues?.["行程"]) : null;
    const duration = getFormattedDuration();
    const reason = formValues?.reason || formValues?.remark || formValues?.["出差事由"] || '无';
    
    // Fallback timestamps if start/end fields are missing in formValues (e.g. inside tripList or differently named)
    let startTime = formValues?.start || formValues?.startTime;
    let endTime = formValues?.end || formValues?.endTime;

    // If Business Trip and no top-level dates, try to extract from tripList? 
    // Usually Business Trip top-level dates summarize the whole trip, but if missing, we just show trip cards.
    
    return (
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden w-full">
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-800/50 flex items-start gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm border ${headerColorClass}`}>
                    <TypeIcon className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white leading-tight mb-1 truncate pr-2">{displayTitle}</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{specificType}</p>
                </div>
                <div className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold shadow-sm ${statusColor}`}>
                    <StatusIcon className={`w-3.5 h-3.5 ${status === 'RUNNING' ? 'animate-spin' : ''}`} />
                    {statusText}
                </div>
            </div>

            {/* Body */}
            <div className="p-6">
                <div className="space-y-6">
                    {/* Reason Section - Prominent */}
                    <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700/50">
                        <div className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">申请事由</div>
                        <div className="text-base font-medium text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                            {reason}
                        </div>
                    </div>

                    {/* Trip Visualization (if exists) */}
                    {tripList && (
                        <div className="space-y-2">
                            <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                <MapPinIcon className="w-3.5 h-3.5" />
                                行程明细
                            </h4>
                            {tripList}
                        </div>
                    )}

                    {/* Key Fields Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8">
                        {/* Only show specific fields: Leave Type, Start, End, Duration */}
                        
                        <div>
                            <div className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">{specificType.includes('出差') ? '出差类型' : '请假类型'}</div>
                            <div className="text-base font-bold text-slate-800 dark:text-slate-200">{specificType}</div>
                        </div>

                        {specificType.includes('出差') && (
                            <div>
                                <div className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">出差备注</div>
                                <div className="text-base font-medium text-slate-800 dark:text-slate-200 font-mono">{formValues?.["出差备注"] || '无'}</div>
                            </div>
                        )}

                        {specificType.includes('出差') && (
                            <div>
                                <div className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">同行人</div>
                                <div className="text-base font-medium text-slate-800 dark:text-slate-200 font-mono">{formValues?.["同行人"] || '无'}</div>
                            </div>
                        )}

                        {duration && (
                            <div>
                                <div className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">时长 (小时)</div>
                                <div className="text-base font-bold text-slate-800 dark:text-slate-200">{duration}</div>
                            </div>
                        )}

                        {startTime && (
                            <div>
                                <div className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">开始时间</div>
                                <div className="text-base font-medium text-slate-800 dark:text-slate-200 font-mono">{startTime}</div>
                            </div>
                        )}

                        {endTime && (
                            <div>
                                <div className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">结束时间</div>
                                <div className="text-base font-medium text-slate-800 dark:text-slate-200 font-mono">{endTime}</div>
                            </div>
                        )}
                        
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="bg-slate-50 dark:bg-slate-800/80 px-6 py-3 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-700">
                <div className="flex items-center gap-1.5" title="发起时间">
                    <CalendarIcon className="w-3.5 h-3.5" />
                    <span className="font-mono">发起: {create_time || 'N/A'}</span>
                </div>
                {finish_time && (
                    <div className="flex items-center gap-1.5" title="完成时间">
                        <CheckCircleIcon className="w-3.5 h-3.5" />
                        <span className="font-mono">完成: {finish_time}</span>
                    </div>
                )}
            </div>
        </div>
    );
};
