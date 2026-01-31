import React from 'react';

// --- Shared Markdown Renderer Component ---
export const MarkdownRenderer: React.FC<{ text: string; className?: string }> = ({ text, className = '' }) => {
    const parseLineToReact = (line: string): React.ReactNode => {
        const parts = line.split(/(\*\*.*?\*\*)/g);
        return parts.map((part, index) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={index} className="font-bold text-slate-900 dark:text-slate-100">{part.slice(2, -2)}</strong>;
            }
            return part;
        });
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
        
        if (tableLines.length < 2) return null;
        
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
            <div key={`table-${startIndex}`} className="my-3 overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                    <thead>
                        <tr className="bg-slate-100 dark:bg-slate-800">
                            {headers.map((header, idx) => (
                                <th key={idx} className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                                    {parseLineToReact(header)}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, rowIdx) => (
                            <tr key={rowIdx} className={rowIdx % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50 dark:bg-slate-800/50'}>
                                {row.map((cell, cellIdx) => (
                                    <td key={cellIdx} className="px-3 py-2 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                        {parseLineToReact(cell)}
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
        
        if (!trimmedLine) {
            elements.push(<div key={i} className="h-1" />);
            i++;
            continue;
        }

        if (trimmedLine === '---') {
            elements.push(<hr key={i} className="my-4 border-slate-200 dark:border-slate-700" />);
            i++;
            continue;
        }

        // Headers
        const headerMatch = line.match(/^(#{1,6})\s+(.*)/);
        if (headerMatch) {
            const level = headerMatch[1].length;
            const content = parseLineToReact(headerMatch[2]);
            const sizes = ['text-xl', 'text-lg', 'text-base', 'text-sm font-bold', 'text-sm', 'text-xs'];
            const sizeClass = sizes[level - 1] || 'text-base';
            const colorClass = level <= 2 ? 'text-slate-900 dark:text-white' : 'text-slate-800 dark:text-slate-200';
            elements.push(<h4 key={i} className={`font-bold ${sizeClass} ${colorClass} mt-3 mb-1`}>{content}</h4>);
            i++;
            continue;
        }

        // List items
        const listMatch = line.match(/^(\s*)([-*]|\d+\.)\s+(.*)/);
        if (listMatch) {
            const indentSpaces = listMatch[1].length;
            const indentLevel = Math.floor(indentSpaces / 2);
            const paddingLeftClass = indentLevel === 0 ? '' : indentLevel === 1 ? 'pl-4' : indentLevel === 2 ? 'pl-8' : 'pl-12';

            elements.push(
                <div key={i} className={`flex items-start gap-2 ${paddingLeftClass}`}>
                    <span className="mt-2 w-1.5 h-1.5 rounded-full bg-slate-400 flex-shrink-0" />
                    <div className="flex-1">{parseLineToReact(listMatch[3])}</div>
                </div>
            );
            i++;
            continue;
        }

        elements.push(<p key={i}>{parseLineToReact(line)}</p>);
        i++;
    }

    return (
        <div className={`text-sm text-slate-700 dark:text-slate-300 space-y-2 leading-relaxed ${className}`}>
            {elements}
        </div>
    );
};
