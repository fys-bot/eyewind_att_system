import React from 'react';
import { 
    HelpCircleIcon, 
    LayoutDashboardIcon, 
    ImageIcon, 
    SparklesIcon, 
    PencilIcon, 
    HistoryIcon, 
    WrenchIcon, 
    SlidersHorizontalIcon, 
    PaletteIcon 
} from './Icons.tsx';

export const Help: React.FC = () => {
    return (
        <div className="max-w-4xl mx-auto space-y-12 text-slate-700 dark:text-slate-300">
            <header className="text-center">
                <HelpCircleIcon className="w-16 h-16 mx-auto text-sky-500 mb-4" />
                <h2 className="text-3xl font-bold text-slate-900 dark:text-white">使用教学</h2>
                <p className="mt-2 text-lg text-slate-500 dark:text-slate-400">欢迎使用 LingoSync AI！您的下一代游戏本地化AI工作站。</p>
            </header>

            <section id="dashboard">
                <h3 className="flex items-center gap-3 text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                    <LayoutDashboardIcon className="w-7 h-7 text-sky-500" />
                    <span>本地化</span>
                </h3>
                <div className="space-y-4 bg-white dark:bg-slate-800 p-6 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
                    <p>登录后，您将进入本地化页面。这是您所有本地化工作的起点。</p>
                    <ul className="list-disc list-inside space-y-2 pl-4">
                        <li><strong>创建项目:</strong> 点击右上角的“创建新项目”按钮，为您的新游戏或应用启动本地化工作流。</li>
                        <li><strong>管理项目:</strong> 所有项目将以卡片形式展示。点击项目卡片即可进入该项目的专属工作区。</li>
                        <li><strong>安全删除:</strong> 删除项目是不可逆操作，系统会要求您输入密码进行二次确认，以防误删。</li>
                    </ul>
                </div>
            </section>
            
            <div className="text-center">
                 <h2 className="text-2xl font-bold text-slate-900 dark:text-white">项目工作区工具</h2>
                 <p className="text-slate-500 dark:text-slate-400 mt-1">进入项目后，您可以使用以下工具处理该项目的数据。</p>
            </div>


            <section id="scene_library">
                <h3 className="flex items-center gap-3 text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                    <ImageIcon className="w-7 h-7 text-sky-500" />
                    <span>AI场景校对翻译</span>
                </h3>
                <div className="space-y-4 bg-white dark:bg-slate-800 p-6 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
                    <p>此功能通过结合<strong className="text-slate-800 dark:text-white">文本文件</strong>和<strong className="text-slate-800 dark:text-white">游戏截图</strong>，利用AI进行上下文感知翻译和校对，是本应用的核心优势。</p>
                    <ul className="list-disc list-inside space-y-2 pl-4">
                        <li><strong>配置:</strong> 首先，为项目添加需要处理的语言。然后，为每种语言上传对应的JSON配置文件和相关场景的游戏截图。截图为AI提供了关键的视觉上下文。</li>
                        <li><strong>AI检查优化:</strong> 配置完成后，切换到“AI检查优化”选项卡，点击按钮。AI将分析文本内容和截图，找出可能的翻译不准确、风格不符或文化不当之处，并提供优化建议。</li>
                        <li><strong>优势:</strong> 极大提升翻译质量，确保文本与游戏画面和情境完美匹配，避免“看图说话”式的低级错误。</li>
                    </ul>
                </div>
            </section>

            <section id="translate">
                <h3 className="flex items-center gap-3 text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                    <SparklesIcon className="w-7 h-7 text-sky-500" />
                    <span>AI校对与翻译</span>
                </h3>
                 <div className="space-y-4 bg-white dark:bg-slate-800 p-6 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
                    <p>提供独立的AI校对和批量翻译功能。</p>
                    <ul className="list-disc list-inside space-y-2 pl-4">
                        <li><strong>中文润色校对:</strong> 上传一个中文JSON文件，AI将对其进行语法、风格和用词方面的校对与润色，特别适合优化最终交付的文本质量。</li>
                        <li><strong>多语言翻译:</strong> 上传一个源语言文件，选择多个目标语言，AI将为您批量生成翻译版本，极大提高本地化效率。</li>
                    </ul>
                </div>
            </section>

            <section id="audit">
                <h3 className="flex items-center gap-3 text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                    <PencilIcon className="w-7 h-7 text-sky-500" />
                    <span>审查现有翻译</span>
                </h3>
                 <div className="space-y-4 bg-white dark:bg-slate-800 p-6 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
                    <p>用于检查已有的翻译文件是否存在<strong className="text-slate-800 dark:text-white">缺失</strong>或<strong className="text-slate-800 dark:text-white">空值</strong>的键。</p>
                    <ul className="list-disc list-inside space-y-2 pl-4">
                        <li><strong>上传主语言文件:</strong> 上传作为基准的语言文件，例如 `en.json`。</li>
                        <li><strong>上传待检查文件:</strong> 上传一个或多个需要与主文件进行对比的翻译文件。</li>
                        <li><strong>开始检查:</strong> 系统将列出所有待检查文件中缺失或内容为空的键。</li>
                        <li><strong>AI生成建议:</strong> 对于检查出的问题，您可以点击“AI生成建议”按钮，让AI根据主语言文件的内容快速生成翻译建议。</li>
                    </ul>
                </div>
            </section>
            
            <section id="compare">
                <h3 className="flex items-center gap-3 text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                    <HistoryIcon className="w-7 h-7 text-sky-500" />
                    <span>版本更新对比</span>
                </h3>
                 <div className="space-y-4 bg-white dark:bg-slate-800 p-6 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
                    <p>在游戏版本迭代时，快速找出语言文件的差异。</p>
                     <ul className="list-disc list-inside space-y-2 pl-4">
                        <li>上传<strong className="text-slate-800 dark:text-white">旧版本</strong>和<strong className="text-slate-800 dark:text-white">新版本</strong>的语言文件。</li>
                        <li>系统会清晰地列出两个版本之间<strong className="text-green-600 dark:text-green-400">新增</strong>、<strong className="text-yellow-600 dark:text-yellow-400">修改</strong>和<strong className="text-red-600 dark:text-red-400">删除</strong>的条目。</li>
                        <li>这有助于翻译人员快速定位需要更新的内容，避免遗漏。</li>
                    </ul>
                </div>
            </section>

             <div className="text-center">
                 <h2 className="text-2xl font-bold text-slate-900 dark:text-white">全局工具与设置</h2>
                 <p className="text-slate-500 dark:text-slate-400 mt-1">这些工具独立于项目，可随时从主侧边栏访问。</p>
            </div>

            <section id="tools">
                <h3 className="flex items-center gap-3 text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                    <WrenchIcon className="w-7 h-7 text-sky-500" />
                    <span>实用工具</span>
                </h3>
                <div className="space-y-4 bg-white dark:bg-slate-800 p-6 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
                    <p>一组为本地化工作流设计的辅助工具集。</p>
                    <ul className="list-disc list-inside space-y-2 pl-4">
                        <li><strong>Play Store 版本日志助手:</strong> 专为应用商店设计的翻译工具。支持上下文参考、自动语言识别、字符数检查和多格式文件处理，一键生成所有语言的更新日志。</li>
                        <li><strong>XMP 检测工具:</strong> 上传图片，快速检测并提取其中嵌入的XMP元数据，便于验证资源文件。</li>
                        <li><strong>JSON 工具:</strong> 提供JSON格式的验证、美化和压缩功能。</li>
                    </ul>
                </div>
            </section>
            
            <section id="settings">
                <h3 className="flex items-center gap-3 text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                    <SlidersHorizontalIcon className="w-7 h-7 text-sky-500" />
                    <span>AI 模型设置</span>
                </h3>
                <div className="space-y-4 bg-white dark:bg-slate-800 p-6 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
                    <p>此区域允许高级用户微调AI模型的行为参数，如“温度”、“Top-K”等，以获得更符合需求的输出结果。每个参数都附有详细的中文解释。</p>
                </div>
            </section>

            <section id="demo">
                <h3 className="flex items-center gap-3 text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                    <PaletteIcon className="w-7 h-7 text-sky-500" />
                    <span>UI 功能演示</span>
                </h3>
                <div className="space-y-4 bg-white dark:bg-slate-800 p-6 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
                    <p>这是一个用于展示和测试应用内各种UI组件和交互逻辑的区域。它也作为一个“UI Kit”，提供了常用组件的代码片段，便于开发人员在扩展功能时保持视觉风格的统一。</p>
                </div>
            </section>
        </div>
    );
};