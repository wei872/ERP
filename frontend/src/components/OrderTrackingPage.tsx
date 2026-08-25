import { useEffect, useState } from 'react';
import { bizApi } from '../api';

const STAGE_LABELS: Record<'sales' | 'purchase', string[]> = {
  sales: ['已下单', '已审核', '已出库', '已回款'],
  purchase: ['已下单', '已审批', '已入库', '已付款'],
};
const TITLE: Record<'sales' | 'purchase', { title: string; desc: string; party: string; statusLabel: string; subLabel: string }> = {
  sales: { title: '🚚 销售执行跟踪', desc: '最近 25 张销售单的四段执行进度：下单 → 审核 → 出库 → 回款（回款进度实时取自应收核销）', party: '客户', statusLabel: '单据', subLabel: '发货' },
  purchase: { title: '🛒 采购执行跟踪', desc: '最近 25 张采购单的四段执行进度：下单 → 审批 → 入库 → 付款（付款进度实时取自应付核销）', party: '供应商', statusLabel: '单据', subLabel: '到货' },
};

function StageBar({ stage, progress, stages }: { stage: number; progress: number; stages: string[] }) {
  return (
    <div className="min-w-[220px]">
      <div className="flex items-center gap-1">
        {stages.map((s, i) => (
          <div key={s} className="flex items-center gap-1 flex-1 last:flex-none">
            <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0 ${i <= stage ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-400'}`}>
              {i <= stage ? '✓' : i + 1}
            </div>
            {i < stages.length - 1 && <div className={`h-0.5 flex-1 ${i < stage ? 'bg-indigo-400' : 'bg-slate-200'}`}></div>}
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-1">
        {stages.map((s, i) => (
          <span key={s} className={`text-[9px] ${i <= stage ? 'text-indigo-600 font-medium' : 'text-slate-400'}`}>{s}</span>
        ))}
      </div>
      {stage >= 2 && (
        <div className="mt-1.5">
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${Number(progress) >= 100 ? 'bg-emerald-400' : 'bg-amber-400'}`} style={{ width: `${Math.min(100, Number(progress) || 0)}%` }}></div>
          </div>
          <p className="text-[9px] text-slate-400 mt-0.5">{stages[3].replace('已', '')}进度 {Number(progress) || 0}%</p>
        </div>
      )}
    </div>
  );
}

/** 订单执行跟踪（通用：销售/采购） */
export default function OrderTrackingPage({ kind }: { kind: 'sales' | 'purchase' }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const stages = STAGE_LABELS[kind];
  const meta = TITLE[kind];

  useEffect(() => {
    setLoading(true); setError('');
    const p = kind === 'sales' ? bizApi.salesTracking() : bizApi.purchaseTracking();
    p.then(r => { setRows(r.data || []); setLoading(false); })
      .catch(e => { setError(e.message || '加载失败'); setLoading(false); });
  }, [kind]);

  const stageCount = [0, 1, 2, 3].map(i => rows.filter(r => Number(r.stage) === i).length);

  if (error) return <div className="p-16 text-center"><div className="text-5xl mb-3">⚠️</div><p className="text-red-500">{error}</p></div>;

  return (
    <div className="erp-fade-in p-6 space-y-5 max-w-[1400px] mx-auto">
      <div>
        <h2 className="text-xl font-bold text-slate-800 tracking-tight">{meta.title}</h2>
        <p className="text-sm text-slate-400 mt-1">{meta.desc}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stages.map((s, i) => (
          <div key={s} className="erp-card p-4 flex items-center gap-3">
            <span className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold ${i === 0 ? 'bg-slate-100 text-slate-500' : i === 1 ? 'bg-blue-50 text-blue-600' : i === 2 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>{i + 1}</span>
            <div>
              <p className="text-[11px] text-slate-400">处于「{s}」阶段</p>
              <p className="text-lg font-bold text-slate-800 tabular-nums">{loading ? '-' : stageCount[i]}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="erp-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="erp-table">
            <thead><tr><th>单号</th><th>{meta.party}</th><th>日期</th><th className="text-right">金额</th><th>执行进度</th><th>状态</th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.sales_no || r.order_no}>
                  <td className="font-mono whitespace-nowrap text-indigo-600">{r.sales_no || r.order_no}</td>
                  <td className="whitespace-nowrap">{r.customer_name || r.party_name || '—'}</td>
                  <td className="whitespace-nowrap text-slate-500">{String(r.sales_date || r.order_date || '').slice(0, 10)}</td>
                  <td className="text-right tabular-nums whitespace-nowrap font-medium">¥{Number(r.total_amount || 0).toLocaleString()}</td>
                  <td><StageBar stage={Number(r.stage) || 0} progress={r.rcv_progress} stages={stages} /></td>
                  <td className="whitespace-nowrap">
                    <div className="flex flex-col gap-0.5 text-[10px]">
                      <span className="text-slate-500">{meta.statusLabel} {r.sales_status || r.order_status || '—'}</span>
                      <span className={String(r.shipping_status || '').includes(kind === 'sales' ? '已出库' : '到货') ? 'text-emerald-600' : 'text-slate-400'}>{meta.subLabel} {r.shipping_status || (kind === 'sales' ? '未发货' : '未到货')}</span>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && !loading && (
                <tr><td colSpan={6} className="py-14 text-center">
                  <div className="text-4xl mb-3">{kind === 'sales' ? '🚚' : '🛒'}</div>
                  <p className="text-sm text-slate-400">暂无{kind === 'sales' ? '销售' : '采购'}单 —— 发生业务后自动呈现执行进度</p>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
