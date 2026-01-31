
import React, { useRef, useEffect } from 'react';
import { CheckCircleIcon } from '../../Icons.tsx';

// Avatar Component
export const Avatar: React.FC<{ name: string; avatarUrl?: string; size?: 'sm' | 'lg' | 'xl', isLoading?: boolean }> = ({ name, avatarUrl, size = 'sm', isLoading = false }) => {
    const sizeClasses = {
        sm: 'w-10 h-10 text-base',
        lg: 'w-16 h-16 text-2xl',
        xl: 'w-12 h-12 text-xl',
    }[size];

    if (isLoading) {
        return (
            <div className={`rounded-full flex-shrink-0 bg-slate-200 dark:bg-slate-700 animate-pulse ${sizeClasses}`}></div>
        );
    }

    if (avatarUrl) {
        return <img src={avatarUrl} alt={name} className={`rounded-full object-cover flex-shrink-0 ${sizeClasses}`} />;
    }

    const initial = name ? name.charAt(0) : '?';
    const colors = [
        'bg-sky-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500',
        'bg-indigo-500', 'bg-teal-500', 'bg-lime-500', 'bg-fuchsia-500'
    ];
    const color = colors[initial.charCodeAt(0) % colors.length];

    return (
        <div className={`rounded-full flex items-center justify-center ${color} text-white font-bold flex-shrink-0 ${sizeClasses}`}>
            {initial}
        </div>
    );
};

// StatusBadge Component
export const StatusBadge: React.FC<{ status: string, type: 'send' | 'view' | 'confirm', timestamp?: string | null }> = ({ status, type, timestamp }) => {
    const statusMap = {
        send: {
            sent: { text: '已发送', color: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300' },
            pending: { text: '未发送', color: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300' },
        },
        view: {
            viewed: { text: '已查看', color: 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-300' },
            pending: { text: '未查看', color: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300' },
        },
        confirm: {
            confirmed: { text: '已确认', color: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300' },
            pending: { text: '待确认', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300' },
            'auto-confirmed': { text: '自动确认', color: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300' },
        }
    };
    const { text, color } = (statusMap[type] as any)[status] || { text: '未知', color: 'bg-slate-200' };

    const formattedTimestamp = new Date(timestamp || '').toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
    
    // Use group/status to isolate hover state from parent row
    return (
        <div className="relative group/status inline-flex justify-center items-center cursor-help">
            <span className={`whitespace-nowrap px-2.5 py-1 rounded-full text-md font-semibold ${color}`}>{text}</span>
            <div className="absolute bottom-full mb-2 hidden group-hover/status:block w-max bg-slate-800 text-white text-xs rounded-md px-2 py-1 shadow-lg z-50 pointer-events-none">
                {formattedTimestamp}
                <svg className="absolute text-slate-800 h-2 w-full left-0 top-full" x="0px" y="0px" viewBox="0 0 255 255"><polygon className="fill-current" points="0,0 127.5,127.5 255,0"/></svg>
            </div>
        </div>
    );
};

// TabButton Component
export const TabButton: React.FC<{ disabled: boolean, label: string, isActive: boolean, onClick: () => void }> = ({ disabled, label, isActive, onClick }) => (
    <button
        disabled={disabled}
        onClick={onClick}
        className={`px-4 py-2 text-sm font-medium ${isActive ? 'border-b-2 border-sky-500 text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
    >
        {label}
    </button>
);

// Stepper Component
export const Stepper: React.FC<{ currentStep: number, steps: { label: string, icon: React.ReactNode }[] }> = ({ currentStep, steps }) => (
    <div className="flex items-center justify-center">
        {steps.map((step, index) => (
            <React.Fragment key={index}>
                <div className="flex flex-col items-center">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${index + 1 < currentStep ? 'bg-sky-500 border-sky-500 text-white' :
                        index + 1 === currentStep ? 'bg-sky-600 border-sky-600 text-white shadow-lg scale-110 ring-2 ring-sky-200 dark:ring-sky-900' :
                            'border-slate-300 dark:border-slate-600 text-slate-400 dark:text-slate-500'
                        }`}>
                        {index + 1 < currentStep ? <CheckCircleIcon className="w-6 h-6" /> : step.icon}
                    </div>
                    <p className={`mt-2 text-xs font-medium transition-colors duration-300 ${index + 1 <= currentStep ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500'
                        }`}>{step.label}</p>
                </div>
                {index < steps.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-4 transition-colors duration-300 ${index + 1 < currentStep ? 'bg-sky-500' : 'bg-slate-300 dark:border-slate-600'}`}></div>
                )}
            </React.Fragment>
        ))}
    </div>
);

// SwitchToggle Component
export const SwitchToggle: React.FC<{ checked: boolean; onChange: (checked: boolean) => void; }> = ({ checked, onChange }) => (
    <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`${checked ? 'bg-sky-600' : 'bg-slate-300 dark:bg-slate-600'
            } relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none`}
        role="switch"
        aria-checked={checked}
    >
        <span
            aria-hidden="true"
            className={`${checked ? 'translate-x-5' : 'translate-x-0'
                } pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
        />
    </button>
);

// Signature Pad Component
export const SignaturePad: React.FC<{ onConfirm: (dataUrl: string) => void; onCancel: () => void }> = ({ onConfirm, onCancel }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const isDrawing = useRef(false);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const { width, height } = canvas.getBoundingClientRect();
        canvas.width = width;
        canvas.height = height;
        ctx.strokeStyle = document.documentElement.classList.contains('dark') ? '#cbd5e1' : '#334155';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const getMousePos = (evt: MouseEvent | TouchEvent) => {
            const rect = canvas.getBoundingClientRect();
            const touch = (evt as TouchEvent).touches?.[0];
            const clientX = touch ? touch.clientX : (evt as MouseEvent).clientX;
            const clientY = touch ? touch.clientY : (evt as MouseEvent).clientY;
            return { x: clientX - rect.left, y: clientY - rect.top };
        };

        const startDrawing = (e: MouseEvent | TouchEvent) => {
            if (!isDrawing.current) {
                isDrawing.current = true;
                const pos = getMousePos(e);
                ctx.beginPath();
                ctx.moveTo(pos.x, pos.y);
            }
        };

        const draw = (e: MouseEvent | TouchEvent) => {
            if (!isDrawing.current) return;
            e.preventDefault();
            const pos = getMousePos(e);
            ctx.lineTo(pos.x, pos.y);
            ctx.stroke();
        };

        const stopDrawing = () => {
            if (isDrawing.current) {
                ctx.closePath();
                isDrawing.current = false;
            }
        };

        canvas.addEventListener('mousedown', startDrawing);
        canvas.addEventListener('mousemove', draw);
        canvas.addEventListener('mouseup', stopDrawing);
        canvas.addEventListener('mouseleave', stopDrawing);
        canvas.addEventListener('touchstart', startDrawing, { passive: false });
        canvas.addEventListener('touchmove', draw, { passive: false });
        canvas.addEventListener('touchend', stopDrawing);

        return () => {
            canvas.removeEventListener('mousedown', startDrawing);
            canvas.removeEventListener('mousemove', draw);
            canvas.removeEventListener('mouseup', stopDrawing);
            canvas.removeEventListener('mouseleave', stopDrawing);
            canvas.removeEventListener('touchstart', startDrawing);
            canvas.removeEventListener('touchmove', draw);
            canvas.removeEventListener('touchend', stopDrawing);
        };
    }, []);

    const clearCanvas = () => {
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
        }
    };

    const handleConfirmClick = () => {
        const canvas = canvasRef.current;
        if (canvas) {
            const blank = document.createElement('canvas');
            blank.width = canvas.width;
            blank.height = canvas.height;
            if (canvas.toDataURL() === blank.toDataURL()) {
                alert("签名不能为空。");
                return;
            }
            const dataUrl = canvas.toDataURL('image/png');
            onConfirm(dataUrl);
        }
    };

    return (
        <div className="flex flex-col flex-1 h-full">
            <canvas ref={canvasRef} className="w-full flex-1 bg-white dark:bg-slate-900 rounded-md border border-slate-300 dark:border-slate-600 cursor-crosshair"></canvas>
            <div className="flex justify-end gap-2 mt-4 flex-shrink-0">
                <button onClick={onCancel} className="px-4 py-2 text-sm bg-slate-200 dark:bg-slate-600 rounded-md">取消</button>
                <button onClick={clearCanvas} className="px-4 py-2 text-sm bg-slate-200 dark:bg-slate-600 rounded-md">清除</button>
                <button onClick={handleConfirmClick} className="px-4 py-2 text-sm bg-sky-600 text-white rounded-md">确认签名</button>
            </div>
        </div>
    );
};
