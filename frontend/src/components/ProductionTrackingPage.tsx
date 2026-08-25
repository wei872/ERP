import { useEffect, useState } from 'react';
import { bizApi } from '../api';

const STAGES = ['已创建', '已领料', '生产中', '已完工'];

/** 生产工单执行跟踪：创建 → 领料 → 生产 → 完工（按数量进度） */
export default function ProductionTrackingPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    bizApi.productionTracking().then(r => { setRows(r.data || []); setLoading(false); })
      .catch(e => { setError(e.message || '加载失败'); setLoading(false); });
  }, []);

  const stageCount = [0, 1, 2, 3].map(i => rows.filter(r => Number(r.stage) === i).length);

  if (error) return <div className="p-16 text-center"><div className="text-5xl mb-3">⚠️</div><p className="text-red-500">{error}</p></div>;

  return (
    <div className="erp-fade-in p-6 space-y-5 max-w-[1400px] mx-auto">
      <div>
        <h2 className="text-xl font-bold text-slate-800 tracking-tight">🏗️ 生产执行跟踪</h2>
        <p className="text-sm text-slate-400 mt-1">最近 25 张工单的四段执行进度：创建 → 领料 → 生产 → 完工（进度按完工数量 ÷ 计划数量实时计算）</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {STAGES.map((s, i) => (
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
            <thead><tr><th>工单号</th><th>产品</th><th>开工日期</th><th className="text-right">计划 / 完工 / 报废</th><th className="min-w-[240px]">完工进度</th><th>执行阶段</th></tr></thead>
            <tbody>
              {rows.map(r => {
                const progress = Number(r.progress) || 0;
                const stage = Number(r.stage) || 0;
                return (
                  <tr key={r.work_order_no}>
                    <td className="font-mono whitespace-nowrap text-indigo-600">{r.work_order_no}</td>
                    <td className="whitespace-nowrap">
                      <span className="text-slate-700">{r.product_name}</span>
                      <span className="block font-mono text-[10px] text-slate-400">{r.product_code}</span>
                    </td>
                    <td className="whitespace-nowrap text-slate-500">{String(r.start_date || '').slice(0, 10)}</td>
                    <td className="text-right tabular-nums whitespace-nowrap">
                      <span className="text-slate-500">{Number(r.plan_qty || 0)}</span>
                      <span className="mx-1 text-slate-300">/</span>
                      <span className="font-semibold text-emerald-600">{Number(r.actual_qty || 0)}</span>
                      <span className="mx-1 text-slate-300">/</span>
                      <span className={Number(r.scrap_qty) > 0 ? 'text-red-500' : 'text-slate-400'}>{Number(r.scrap_qty || 0)}</span>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${progress >= 100 ? 'bg-emerald-400' : progress >= 50 ? 'bg-blue-400' : 'bg-amber-400'}`} style={{ width: `${Math.min(100, progress)}%` }}></div>
                        </div>
                        <span className="text-[11px] tabular-nums text-slate-500 w-10 text-right shrink-0">{progress}%</span>
                      </div>
                      {Number(r.issued_qty) > 0 && <p className="text-[9px] text-slate-400 mt-0.5">已领料 {Number(r.issued_qty)}</p>}
                    </td>
                    <td className="whitespace-nowrap">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${stage === 3 ? 'bg-emerald-50 text-emerald-700' : stage === 2 ? 'bg-amber-50 text-amber-600' : stage === 1 ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
                        {STAGES[stage]}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && !loading && (
                <tr><td colSpan={6} className="py-14 text-center">
                  <div className="text-4xl mb-3">🏗️</div>
                  <p className="text-sm text-slate-400">暂无生产工单 —— 创建工单后自动呈现执行进度</p>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
