
import React from 'react';
import { XIcon } from './Icons.tsx';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
    size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl' | '6xl';
    hideCloseButton?: boolean;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, footer, size = 'lg', hideCloseButton = false }) => {
    if (!isOpen) return null;

    const sizeClasses = {
        sm: 'max-w-sm',
        md: 'max-w-md',
        lg: 'max-w-lg',
        xl: 'max-w-xl',
        '2xl': 'max-w-2xl',
        '4xl': 'max-w-4xl',
        '6xl': 'max-w-6xl',
    };

    return (
        <div 
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" 
            onClick={onClose} 
            aria-modal="true" 
            role="dialog"
        >
            <div 
                className={`relative bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full border border-slate-200 dark:border-slate-700 flex flex-col max-h-[90vh] ${sizeClasses[size]}`} 
                onClick={e => e.stopPropagation()}
            >
                {title && (
                    <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h3>
                        <button onClick={onClose} className="text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white" aria-label="Close modal">
                            <XIcon className="w-6 h-6" />
                        </button>
                    </div>
                )}
                {(!title && !hideCloseButton) && (
                    <button onClick={onClose} className="absolute top-4 right-4 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white z-10" aria-label="Close modal">
                        <XIcon className="w-5 h-5" />
                    </button>
                )}
                <div className="p-6 overflow-y-auto flex-1">
                    {children}
                </div>
                {footer && (
                    <div className="bg-slate-100 dark:bg-slate-700/50 px-6 py-3 flex justify-end gap-3 rounded-b-lg flex-shrink-0">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
};
