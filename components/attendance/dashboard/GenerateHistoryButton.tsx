import React, { useState } from 'react';
import { RefreshCwIcon } from '../../Icons';
import { generateMockHistoryData } from '../../../utils/generateMockHistoryData';

interface GenerateHistoryButtonProps {
  company: string;
  year: number;
  month: number;
  employees: any[];
}

export const GenerateHistoryButton: React.FC<GenerateHistoryButtonProps> = ({
  company,
  year,
  month,
  employees
}) => {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    if (company === '全部' || employees.length === 0) return;
    
    setIsGenerating(true);
    try {
      await generateMockHistoryData(company, year, month, employees);
      alert('✅ 已生成上月模拟数据，请刷新页面查看涨跌趋势');
    } catch (error) {
      console.error('Failed to generate history:', error);
      alert('❌ 生成失败，请查看控制台');
    } finally {
      setIsGenerating(false);
    }
  };

  if (company === '全部') return null;

  return (
    <button
      onClick={handleGenerate}
      disabled={isGenerating}
      className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 text-white text-xs font-semibold rounded hover:bg-purple-500 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
      title="生成上月模拟数据以查看涨跌趋势"
    >
      <RefreshCwIcon className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
      {isGenerating ? '生成中...' : '生成测试数据'}
    </button>
  );
};
