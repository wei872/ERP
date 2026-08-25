import { useEffect, useState } from 'react';
import { bizApi } from '../api';

const money = (v: unknown) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
};

const GRADE_STYLE: Record<string, string> = {
  A: 'bg-emerald-500 text-white', B: 'bg-blue-500 text-white',
  C: 'bg-amber-500 text-white', D: 'bg-red-400 text-white', '—': 'bg-slate-200 text-slate-500',
};

function DimBar({ label, value, weight }: { label: string; value: number | null; weight: string }) {
  return (
    <div className="min-w-[110px]">
      <div className="flex items-center justify-between text-[10px] mb-0.5">
        <span className="text-slate-400">{label} <span className="text-slate-300">({weight})</span></span>
        <span className="tabular-nums font-bold text-slate-700">{value == null ? '—' : `${Number(value).toFixed(1)}%`}</span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${value == null ? '' : Number(value) >= 90 ? 'bg-emerald-400' : Number(value) >= 75 ? 'bg-blue-400' : Number(value) >= 60 ? 'bg-amber-400' : 'bg-red-400'}`} style={{ width: `${Math.min(100, Number(value || 0))}%` }}></div>
      </div>
    </div>
  );
}

/** 供应商记分卡（v5.28）：交期40% + 质量40% + 价格20% 加权评分，星级榜单（数据源：采购单/来料检验/采购比价） */
export default function SupplierScorecardPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    bizApi.supplierScorecard().then(r => setRows(r.data || [])).catch(e => setError(e.message || '加载失败')).finally(() => setLoading(false));
  }, []);

  const ranked = rows.filter(r => Number(r.total_score ?? 0) > 0 || r.order_cnt > 0);

  return (
    <div className="erp-fade-in p-3 md:p-6 space-y-4 md:space-y-6 max-w-[1400px] mx-auto">
      <div className="rounded-2xl p-4 md:p-6 text-white relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #134e4a, #0f766e 55%, #14b8a6)' }}>
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-teal-400/20 blur-2xl"></div>
        <div className="relative">
          <h2 className="text-lg md:text-xl font-bold tracking-tight flex items-center gap-2">🏅 供应商记分卡</h2>
          <p className="text-[11px] md:text-xs text-teal-100 mt-1.5">三维加权评分：交期准时率 40%（全部到货订单占比）· 来料质量合格率 40% · 价格竞争力 20%（与同料最低价之比）</p>
        </div>
      </div>

      {error && <div className="erp-card p-8 text-center"><div className="text-4xl mb-2">⚠️</div><p className="text-sm text-red-500">{error}</p></div>}
      {loading && <div className="p-12 text-center"><div className="erp-spinner mx-auto mb-3"></div><p className="text-sm text-slate-400">评分计算中…</p></div>}

      {!loading && !error && (
        <div className="erp-card p-3 md:p-4 overflow-x-auto">
          <table className="erp-table text-xs w-full min-w-[960px]">
            <thead><tr><th>排名</th><th className="text-left">供应商</th><th>采购规模</th><th>交期（40%）</th><th>质量（40%）</th><th>价格（20%）</th><th>综合得分</th><th>评级</th></tr></thead>
            <tbody>
              {ranked.map((r, i) => (
                <tr key={r.supplier_code}>
                  <td className="text-center">{i < 3 ? ['🥇', '🥈', '🥉'][i] : <span className="text-slate-400 tabular-nums">{i + 1}</span>}</td>
                  <td className="text-left"><p className="font-medium text-slate-700 whitespace-nowrap">{r.supplier_name}</p><p className="text-[10px] text-slate-400">{r.supplier_code} · {r.supplier_type} · {r.level}</p></td>
                  <td className="whitespace-nowrap"><p className="tabular-nums font-semibold">¥{money(r.order_amount)}</p><p className="text-[10px] text-slate-400">{r.order_cnt} 单</p></td>
                  <td><DimBar label="全部到货率" value={r.delivery_rate == null ? null : Number(r.delivery_rate)} weight="40%" /></td>
                  <td><DimBar label="来料合格率" value={r.quality_rate == null ? null : Number(r.quality_rate)} weight="40%" /></td>
                  <td><DimBar label="价格竞争力" value={r.price_score == null ? null : Number(r.price_score)} weight="20%" /></td>
                  <td className="tabular-nums text-lg font-bold text-slate-800">{Number(r.total_score || 0).toFixed(1)}</td>
                  <td className="text-center">
                    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg font-bold text-sm ${GRADE_STYLE[r.grade] || GRADE_STYLE['—']}`}>{r.grade}</span>
                    <p className="text-[10px] text-amber-500 mt-0.5">{'★'.repeat(Number(r.stars || 0))}<span className="text-slate-200">{'★'.repeat(Math.max(0, 5 - Number(r.stars || 0)))}</span></p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {ranked.length === 0 && <p className="text-xs text-slate-400 text-center py-10">暂无采购数据，录入采购单与来料检验后即可生成记分卡</p>}
        </div>
      )}

      <div className="erp-card p-4 text-[11px] text-slate-500 space-y-1">
        <p>📏 评分口径：综合得分 = 各可用维度加权平均（缺数据维度不参与，避免误伤新供应商）。</p>
        <p>🏆 评级标准：≥90 → A（战略优先）；80~90 → B（合格优选）；70~80 → C（观察改进）；&lt;70 → D（限期整改/减量）。</p>
        <p>🔗 与「采购比价评级」页联动：下单前先看记分卡选供应商，再看比价页核价格。</p>
      </div>
    </div>
  );
}
