import { useEffect, useState } from 'react';
import { bizApi } from '../api';

const money = (v: unknown) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

/** 工单成本分析（v5.29）：实际领料成本 + 人工/制费标准费率 → 工单损益（与预估收入对比） */
export default function WorkOrderCostPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [onlyLoss, setOnlyLoss] = useState(false);

  useEffect(() => { bizApi.workorderCost().then(r => setData(r.data)).catch(e => setError(e.message || '加载失败')); }, []);

  if (error) return <div className="p-16 text-center"><div className="text-5xl mb-3">⚠️</div><p className="text-red-500">{error}</p></div>;
  if (!data) return <div className="p-16 text-center"><div className="erp-spinner mx-auto mb-3"></div><p className="text-sm text-slate-400">工单成本计算中…</p></div>;

  const t = data.totals || {};
  const rows: any[] = ((data.rows || []) as any[]).filter((r: any) => !onlyLoss || (Number(r.actual_qty) > 0 && Number(r.profit) < 0));

  return (
    <div className="erp-fade-in p-3 md:p-6 space-y-4 md:space-y-6 max-w-[1400px] mx-auto">
      <div className="rounded-2xl p-4 md:p-6 text-white relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #334155, #475569 55%, #64748b)' }}>
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-slate-300/20 blur-2xl"></div>
        <div className="relative">
          <h2 className="text-lg md:text-xl font-bold tracking-tight flex items-center gap-2">🏭 工单成本分析</h2>
          <p className="text-[11px] md:text-xs text-slate-200 mt-1.5">材料成本 = 实际领料 × 库存加权单价 · 人工 ¥{Number(t.labor_rate || 15)}/件 · 制造费用 ¥{Number(t.overhead_rate || 8)}/件（标准费率） · 损益 = 成品预估收入 − 总成本</p>
        </div>
      </div>

      {/* 汇总卡 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="erp-card p-4"><p className="text-[11px] text-slate-400 mb-1">工单总成本（近 {Number(t.count || 0)} 单）</p><p className="text-xl font-bold tabular-nums text-slate-800">¥{money(t.cost)}</p></div>
        <div className="erp-card p-4"><p className="text-[11px] text-slate-400 mb-1">成品预估收入</p><p className="text-xl font-bold tabular-nums text-blue-600">¥{money(t.revenue)}</p></div>
        <div className="erp-card p-4"><p className="text-[11px] text-slate-400 mb-1">工单损益合计</p><p className={`text-xl font-bold tabular-nums ${Number(t.profit || 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{Number(t.profit || 0) >= 0 ? '+' : ''}¥{money(t.profit)}</p></div>
        <div className="erp-card p-4"><p className="text-[11px] text-slate-400 mb-1">盈利工单占比</p><p className="text-xl font-bold tabular-nums text-slate-800">{Number(t.count || 0) > 0 ? ((Number(t.profit_cnt || 0) / Number(t.count)) * 100).toFixed(0) : '0'}%</p><p className="text-[10px] text-slate-400">{Number(t.profit_cnt || 0)} / {Number(t.count || 0)} 单</p></div>
      </div>

      <div className="flex justify-end">
        <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer"><input type="checkbox" checked={onlyLoss} onChange={e => setOnlyLoss(e.target.checked)} className="accent-red-500"/>只看亏损工单</label>
      </div>

      {/* 成本明细表 */}
      <div className="erp-card p-3 md:p-4 overflow-x-auto">
        <table className="erp-table text-xs w-full min-w-[1000px]">
          <thead><tr><th className="text-left">工单</th><th className="text-left">产品</th><th>实际产量</th><th>材料成本</th><th>人工成本</th><th>制费</th><th>总成本</th><th>单位成本</th><th>预估收入</th><th>工单损益</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={10} className="text-center py-10 text-slate-400">无符合条件的工单</td></tr>}
            {rows.map((r: any) => {
              const total = Number(r.total_cost || 0);
              const m = total > 0 ? (Number(r.material_cost || 0) / total) * 100 : 0;
              const l = total > 0 ? (Number(r.labor_cost || 0) / total) * 100 : 0;
              const profit = Number(r.profit || 0);
              const hasQty = Number(r.actual_qty || 0) > 0;
              const matOver = Number(r.material_cost || 0) > Number(r.plan_material_cost || 0) && Number(r.plan_material_cost || 0) > 0;
              return (
                <tr key={r.work_order_no} className={hasQty && profit < 0 ? 'bg-red-50/40' : ''}>
                  <td className="text-left"><span className="font-mono text-indigo-600 whitespace-nowrap">{r.work_order_no}</span><p className="text-[10px] text-slate-400">{r.order_status}</p></td>
                  <td className="text-left"><p className="font-medium text-slate-700 whitespace-nowrap">{r.product_name}</p><p className="font-mono text-[10px] text-slate-400">{r.product_code}</p></td>
                  <td className="tabular-nums text-center">{Number(r.actual_qty || 0).toLocaleString()}</td>
                  <td className="tabular-nums whitespace-nowrap">
                    ¥{money(r.material_cost)}
                    {matOver && <p className="text-[9px] text-red-500">超计划 ¥{money(Number(r.material_cost || 0) - Number(r.plan_material_cost || 0))}</p>}
                  </td>
                  <td className="tabular-nums whitespace-nowrap text-slate-500">¥{money(r.labor_cost)}</td>
                  <td className="tabular-nums whitespace-nowrap text-slate-500">¥{money(r.overhead_cost)}</td>
                  <td className="min-w-[120px]">
                    <p className="tabular-nums font-semibold mb-1">¥{money(total)}</p>
                    <div className="h-1.5 rounded-full overflow-hidden bg-slate-100 flex" title={`材料 ${m.toFixed(0)}% / 人工 ${l.toFixed(0)}% / 制费 ${(100 - m - l).toFixed(0)}%`}>
                      <div className="bg-indigo-400 h-full" style={{ width: `${m}%` }}></div>
                      <div className="bg-cyan-400 h-full" style={{ width: `${l}%` }}></div>
                      <div className="bg-slate-300 h-full flex-1"></div>
                    </div>
                  </td>
                  <td className="tabular-nums whitespace-nowrap">{hasQty ? `¥${money(r.unit_cost)}/件` : '—'}</td>
                  <td className="tabular-nums whitespace-nowrap text-blue-600">¥{money(r.est_revenue)}</td>
                  <td className={`tabular-nums font-bold whitespace-nowrap ${!hasQty ? 'text-slate-300' : profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{hasQty ? `${profit >= 0 ? '+' : ''}¥${money(profit)}` : '未开工'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="erp-card p-4 text-[11px] text-slate-500 space-y-1">
        <p>📏 口径说明：材料成本按领料明细 × 库存加权平均单价（缺库存价回退商品采购价）；人工与制造费用按标准费率 × 实际产量计提。</p>
        <p>⚠️ 领料超过计划用量的工单会以红字标出「超计划」金额，便于追查损耗与补料原因。</p>
      </div>
    </div>
  );
}
