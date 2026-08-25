import { useState } from 'react';
import { bizApi } from '../api';
import { toastNotify } from '../utils/toast';

type Tool = '' | 'count' | 'in' | 'out';

/** 移动快捷工作台（v5.28）：大按钮快捷盘点 / 快捷出入库 / 常用入口直达，为手机单手操作优化 */
export default function MobileWorkbenchPage({ go }: { go: (page: any) => void }) {
  const [tool, setTool] = useState<Tool>('');
  const [code, setCode] = useState('');
  const [wh, setWh] = useState('默认仓');
  const [qty, setQty] = useState<number | ''>('');
  const [cost, setCost] = useState<number | ''>('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const close = () => { setTool(''); setCode(''); setQty(''); setCost(''); setReason(''); };

  const doCount = async () => {
    if (!code.trim() || qty === '') { toastNotify('请填写商品编码与实盘数量', 'warn'); return; }
    setBusy(true);
    try {
      const r = await bizApi.stockCheckConfirm({ product_code: code.trim(), warehouse: wh, actual_qty: Number(qty), reason: reason || '快捷盘点' });
      const diff = Number(r.data.diff) || 0;
      toastNotify(`快捷盘点完成 ${r.data.check_no}：差异 ${diff > 0 ? '+' : ''}${diff}，已自动调账`);
      close();
    } catch (e: any) { toastNotify('盘点失败：' + (e.message || ''), 'error'); }
    setBusy(false);
  };
  const doIn = async () => {
    if (!code.trim() || !(Number(qty) > 0)) { toastNotify('请填写商品编码与大于 0 的数量', 'warn'); return; }
    setBusy(true);
    try {
      await bizApi.stockIn({ product_code: code.trim(), warehouse: wh, qty: Number(qty), unit_cost: cost === '' ? 0 : Number(cost) });
      toastNotify(`快捷入库成功：${code.trim()} × ${qty} → ${wh}`);
      close();
    } catch (e: any) { toastNotify('入库失败：' + (e.message || ''), 'error'); }
    setBusy(false);
  };
  const doOut = async () => {
    if (!code.trim() || !(Number(qty) > 0)) { toastNotify('请填写商品编码与大于 0 的数量', 'warn'); return; }
    setBusy(true);
    try {
      await bizApi.stockOut({ product_code: code.trim(), warehouse: wh, qty: Number(qty) });
      toastNotify(`快捷出库成功：${code.trim()} × ${qty} ← ${wh}`);
      close();
    } catch (e: any) { toastNotify('出库失败：' + (e.message || ''), 'error'); }
    setBusy(false);
  };

  const TOOLS: Array<{ key: Tool; icon: string; label: string; desc: string; tone: string }> = [
    { key: 'count', icon: '📋', label: '快捷盘点', desc: '输编码+实盘数，差异自动调账', tone: 'from-emerald-500 to-teal-500' },
    { key: 'in', icon: '📥', label: '快捷入库', desc: '无单入库，记入库存流水', tone: 'from-blue-500 to-indigo-500' },
    { key: 'out', icon: '📤', label: '快捷出库', desc: '无单出库，库存不足自动拦截', tone: 'from-amber-500 to-orange-500' },
  ];
  const SHORTCUTS: Array<{ icon: string; label: string; page: any }> = [
    { icon: '🔁', label: '待办审批', page: { type: 'workflow' } },
    { icon: '📱', label: '移动审批', page: { type: 'mapproval' } },
    { icon: '📰', label: '经营日报', page: { type: 'daily' } },
    { icon: '📬', label: '消息中心', page: { type: 'messages' } },
    { icon: '📑', label: '合同跟踪', page: { type: 'contracttrack' } },
    { icon: '🚨', label: '质量异常', page: { type: 'ncr' } },
    { icon: '🏅', label: '供应商记分卡', page: { type: 'scorecard' } },
    { icon: '💎', label: '销售提成', page: { type: 'commission' } },
  ];

  return (
    <div className="erp-fade-in p-4 md:p-6 space-y-5 max-w-2xl mx-auto pb-24">
      <div className="rounded-2xl p-5 text-white relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #312e81, #4338ca 55%, #6366f1)' }}>
        <div className="absolute -top-8 -right-8 w-36 h-36 rounded-full bg-indigo-400/20 blur-2xl"></div>
        <div className="relative">
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">🧰 快捷工作台</h2>
          <p className="text-xs text-indigo-200 mt-1.5">仓库高频操作一键直达 · 大按钮单手优化 · 操作全部写入审计日志</p>
        </div>
      </div>

      {/* 三大快捷工具 */}
      <div className="grid grid-cols-1 gap-3">
        {TOOLS.map(t => (
          <button key={t.key} onClick={() => setTool(t.key)} className={`rounded-2xl p-5 text-left text-white bg-gradient-to-r ${t.tone} shadow-md active:scale-[0.98] transition-transform`}>
            <div className="flex items-center gap-4">
              <span className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center text-2xl shrink-0">{t.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold">{t.label}</p>
                <p className="text-[11px] opacity-80 mt-0.5">{t.desc}</p>
              </div>
              <span className="text-xl opacity-70">›</span>
            </div>
          </button>
        ))}
      </div>

      {/* 常用入口 */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">常用入口</h3>
        <div className="grid grid-cols-4 gap-3">
          {SHORTCUTS.map(s => (
            <button key={s.label} onClick={() => go(s.page)} className="erp-card p-3 flex flex-col items-center gap-1.5 active:scale-95 transition-transform">
              <span className="text-2xl">{s.icon}</span>
              <span className="text-[10px] text-slate-600 font-medium text-center leading-tight">{s.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 工具弹窗 */}
      {tool && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-[130] erp-modal-bg" onClick={close}>
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl erp-modal-panel max-h-[88vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b flex items-center justify-between sticky top-0 bg-white">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">{TOOLS.find(t => t.key === tool)?.icon} {TOOLS.find(t => t.key === tool)?.label}</h3>
              <button onClick={close} className="text-slate-400 hover:text-slate-600 p-1">✕</button>
            </div>
            <div className="p-5 space-y-3">
              <div><label className="text-xs font-medium text-slate-500">商品编码 *</label><input value={code} onChange={e => setCode(e.target.value)} placeholder="如 IC-0001 / FG-001" className="erp-input font-mono text-base h-11"/></div>
              <div><label className="text-xs font-medium text-slate-500">仓库</label>
                <select value={wh} onChange={e => setWh(e.target.value)} className="erp-input h-11">{['默认仓', '原料仓', '成品仓'].map(w => <option key={w}>{w}</option>)}</select>
              </div>
              <div><label className="text-xs font-medium text-slate-500">{tool === 'count' ? '实盘数量 *' : '数量 *'}</label><input type="number" min={0} value={qty} onChange={e => setQty(e.target.value === '' ? '' : Number(e.target.value))} className="erp-input font-mono tabular-nums text-base h-11"/></div>
              {tool === 'in' && <div><label className="text-xs font-medium text-slate-500">单位成本（选填）</label><input type="number" min={0} step="0.01" value={cost} onChange={e => setCost(e.target.value === '' ? '' : Number(e.target.value))} className="erp-input font-mono tabular-nums h-11"/></div>}
              {tool === 'count' && <div><label className="text-xs font-medium text-slate-500">盘点说明（选填）</label><input value={reason} onChange={e => setReason(e.target.value)} placeholder="如 破损/漏记" className="erp-input h-11"/></div>}
              {tool === 'count' && <p className="text-[11px] text-slate-400">确认后：盘盈自动入库、盘亏自动出库，生成盘点流水（与盘点页同一调账引擎）。</p>}
              <button onClick={tool === 'count' ? doCount : tool === 'in' ? doIn : doOut} disabled={busy}
                className={`w-full py-3 rounded-xl text-white text-base font-bold shadow-md disabled:opacity-50 bg-gradient-to-r ${TOOLS.find(t => t.key === tool)?.tone}`}>
                {busy ? '处理中…' : '确认执行'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
