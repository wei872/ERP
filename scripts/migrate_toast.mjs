#!/usr/bin/env node
/** 一次性迁移：各页面本地 toast → 全局 toastNotify（删局部 state 与横幅） */
import { readFileSync, writeFileSync } from 'node:fs';
const files = [
  'FinanceTemplate.tsx','FinancialStatementsPage.tsx','InventoryClosingPage.tsx','ModulePage.tsx',
  'MrpPage.tsx','ProductionPage.tsx','RbacPage.tsx','ReconciliationPage.tsx','VoucherPage.tsx','WorkflowPage.tsx',
];
for (const f of files) {
  const p = `frontend/src/components/${f}`;
  let s = readFileSync(p, 'utf8');
  const before = s;
  // 1) toastFn 实现替换（4 种变体）
  s = s.replace(/const toastFn = (useCallback\()?\((m|msg): string\) => \{ setToast\(\2\); setTimeout\(\(\) => setToast\(''\), \d+\); \}(, \[\])?\);/g,
    (_, cb, arg, deps) => cb ? `const toastFn = useCallback((${arg}: string) => toastNotify(${arg})${deps});` : `const toastFn = (${arg}: string) => toastNotify(${arg});`);
  // 2) 删除局部 toast state
  s = s.replace(/\n? *const \[toast, setToast\] = useState\(''\);/g, '');
  // 3) 删除横幅渲染
  s = s.replace(/ *\{toast && <div className="erp-toast">\{toast\}<\/div>\}\n?/g, '');
  // 4) 顶部加 import（若尚未引入）
  if (!s.includes("from '../utils/toast'")) {
    s = `import { toastNotify } from '../utils/toast';\n` + s;
  }
  if (s !== before) { writeFileSync(p, s); console.log('✅', f); } else console.log('— 未变', f);
}
