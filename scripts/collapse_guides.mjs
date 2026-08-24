#!/usr/bin/env node
/** 其余页面深色引导卡 → 默认收起的可折叠条（hidden 类切换，无闭合结构风险） */
import { readFileSync, writeFileSync } from 'node:fs';
const files = ['FinanceTemplate','FinancialStatementsPage','InventoryClosingPage','ProductionPage','RbacPage','ReconciliationPage','UserManagement','VoucherPage'];
for (const name of files) {
  const p = `frontend/src/components/${name}.tsx`;
  let s = readFileSync(p, 'utf8');
  // 1) 外层容器：去掉内边距大/间距，改紧凑
  if (!s.includes('rounded-2xl p-5 text-white shadow-lg space-y-3')) { console.log('skip(outer)', name); continue; }
  s = s.replace('rounded-2xl p-5 text-white shadow-lg space-y-3">', 'rounded-2xl px-5 py-3 text-white shadow-lg">');
  // 2) 头部行 → 可点击按钮（捕获 h3 与徽章）
  const headRe = /<div className="flex items-center justify-between">\s*(<h3[\s\S]*?<\/h3>)\s*(<span className="text-\[11px\][\s\S]*?<\/span>)\s*<\/div>\s*\n(\s*)<div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-300 leading-relaxed">/;
  const m = s.match(headRe);
  if (!m) { console.log('skip(head)', name); continue; }
  const h3 = m[1].replace('text-base', 'text-sm');
  s = s.replace(headRe,
`<button onClick={() => setShowGuide(s => !s)} className="w-full flex items-center justify-between text-left">
          ${h3.replace(/\n\s*/g, ' ')}
          <span className="flex items-center gap-2 shrink-0">
            ${m[2].replace(/\n\s*/g, ' ')}
            <span className="text-indigo-300/70 text-xs">{showGuide ? '▲ 收起' : '▼ 展开'}</span>
          </span>
        </button>
${m[3]}<div className={\`grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-300 leading-relaxed mt-3 \${showGuide ? '' : 'hidden'}\`}>`);
  // 3) 组件内注入 showGuide 状态（插在第一个 useState 之前）
  if (!s.includes('showGuide')) { console.log('skip(state?)', name); continue; }
  if (!s.includes('const [showGuide')) {
    const idx = s.indexOf('const [');
    if (idx === -1) { console.log('skip(no-state-anchor)', name); continue; }
    s = s.slice(0, idx) + 'const [showGuide, setShowGuide] = useState(false);\n  ' + s.slice(idx);
    if (!/import\s*{[^}]*useState/.test(s)) { console.log('WARN: no useState import in', name); }
  }
  writeFileSync(p, s);
  console.log('✅', name);
}
