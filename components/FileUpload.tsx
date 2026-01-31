import React, { useRef } from 'react';
// Fix: Add .tsx extension to the import path.
import { UploadCloudIcon } from './Icons.tsx';

interface FileUploadProps {
  onFileUpload: (content: string, fileName: string) => void;
  accept?: string;
  label: string;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onFileUpload, accept = '.json', label }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        onFileUpload(content, file.name);
      };
      reader.readAsText(file);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file && file.name.endsWith(accept)) {
       const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        onFileUpload(content, file.name);
      };
      reader.readAsText(file);
    }
  };

  return (
    <div
      className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-4 text-center cursor-pointer hover:border-sky-500 hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-all duration-300"
      onClick={() => fileInputRef.current?.click()}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept={accept}
        className="hidden"
      />
      <div className="flex flex-col items-center justify-center gap-2">
        <UploadCloudIcon className="w-8 h-8 text-slate-400 dark:text-slate-500" />
        <p className="text-sm text-slate-600 dark:text-slate-400">{label}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">支持拖拽文件到此处</p>
      </div>
    </div>
  );
};