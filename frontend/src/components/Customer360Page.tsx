import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { bizApi, dataApi } from '../api';

const money = (v: unknown) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

function Sec({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <div className="erp-card p-4 md:p-5">
      <h3 className="text-sm font-semibold text-slate-700 mb-3">{title}{count !== undefined && <span className="text-[11px] font-normal text-slate-400 ml-2">{count} 条</span>}</h3>
      {children}
    </div>
  );
}

/** 客户 360 视图（v5.30）：档案 + 信用 + 订单 + 应收 + 合同 + 催收一屏聚合 */
export default function Customer360Page({ initialCode = '' }: { initialCode?: string }) {
  const [customers, setCustomers] = useState<any[]>([]);
  const [code, setCode] = useState(initialCode);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    dataApi.list('cust_customer_main', 1, 200, '').then(r => {
      const cs = r.data?.rows || [];
      setCustomers(cs);
      if (!initialCode && cs.length > 0) setCode(String(cs[0].customer_code));
    }).catch(() => {});
  }, [initialCode]);

  const load = useCallback((c: string) => {
    if (!c) return;
    setData(null); setError('');
    bizApi.customer360(c).then(r => setData(r.data)).catch(e => setError(e.message || '加载失败'));
  }, []);
  useEffect(() => { load(code); }, [code, load]);

  const c = data?.customer || {};
  const credit = data?.credit || {};
  const os = data?.orderStats || {};
  const rs = data?.receivableStats || {};
  const used = Number(credit.used || 0), limit = Number(credit.credit_limit || 0);
  const creditPct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;

  return (
    <div className="erp-fade-in p-3 md:p-6 space-y-4 md:space-y-6 max-w-[1400px] mx-auto">
      {/* 头部：客户选择 + 档案摘要 */}
      <div className="rounded-2xl p-4 md:p-6 text-white relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0c4a6e, #0369a1 55%, #0ea5e9)' }}>
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-sky-400/20 blur-2xl"></div>
        <div className="relative flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg md:text-xl font-bold tracking-tight flex items-center gap-2">👤 客户 360 视图</h2>
            <p className="text-[11px] md:text-xs text-sky-200 mt-1.5">档案 · 信用 · 订单 · 应收 · 合同 · 催收，一屏全景穿透</p>
          </div>
          <select value={code} onChange={e => setCode(e.target.value)} className="px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-sm focus:outline-none min-w-[220px] [color-scheme:dark]">
            {customers.map(x => <option key={x.customer_code} value={x.customer_code}>{x.customer_name}（{x.customer_code}）</option>)}
          </select>
        </div>
        {data && (
          <div className="relative mt-4 flex flex-wrap gap-x-6 gap-y-1.5 text-xs">
            <span className="text-sky-100">编码 <b className="font-mono">{c.customer_code}</b></span>
            <span className="text-sky-100">类型 {c.customer_type || '—'}</span>
            <span className="text-sky-100">行业 {c.industry || '—'}</span>
            <span className="text-sky-100">区域 {c.region || '—'}</span>
            <span className="text-sky-100">联系人 {c.contact_person || '—'}</span>
            <span className="text-sky-100">等级 <span className="px-1.5 py-0.5 rounded bg-white/15 font-bold">{c.level || '—'}</span></span>
          </div>
        )}
      </div>

      {error && <div className="erp-card p-8 text-center"><div className="text-4xl mb-2">⚠️</div><p className="text-sm text-red-500">{error}</p></div>}
      {!data && !error && <div className="p-12 text-center"><div className="erp-spinner mx-auto mb-3"></div><p className="text-sm text-slate-400">客户全景数据聚合中…</p></div>}

      {data && (
        <>
          {/* 核心指标 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="erp-card p-4"><p className="text-[11px] text-slate-400 mb-1">累计订单</p><p className="text-lg font-bold tabular-nums text-slate-800">{Number(os.cnt || 0)} 单</p><p className="text-[10px] text-slate-400">合计 ¥{money(os.amount)}</p></div>
            <div className="erp-card p-4"><p className="text-[11px] text-slate-400 mb-1">应收未收</p><p className={`text-lg font-bold tabular-nums ${Number(rs.remain || 0) > 0 ? 'text-red-500' : 'text-emerald-600'}`}>¥{money(rs.remain)}</p><p className="text-[10px] text-slate-400">{Number(rs.cnt || 0)} 笔未结清</p></div>
            <div className="erp-card p-4 lg:col-span-2">
              <div className="flex items-center justify-between mb-1"><p className="text-[11px] text-slate-400">信用占用</p><span className="text-[10px] tabular-nums text-slate-500">¥{money(used)} / {limit > 0 ? `¥${money(limit)}` : '未启用'}</span></div>
              {limit > 0 ? (
                <>
                  <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${creditPct >= 100 ? 'bg-red-400' : creditPct >= 90 ? 'bg-amber-400' : 'bg-emerald-400'}`} style={{ width: `${creditPct}%` }}></div></div>
                  <p className="text-[10px] text-slate-400 mt-1">占用率 {creditPct.toFixed(1)}% · 在途订单 ¥{money(credit.open_order_amount)}{creditPct >= 90 && <span className="text-amber-600 font-medium ml-1">⚠️ 接近/超出额度，下单将被信用中枢拦截</span>}</p>
                </>
              ) : <p className="text-[10px] text-slate-400 mt-1">额度为 0 = 不启用信用管控，下单不拦截</p>}
            </div>
          </div>

          {/* 复购分析（v5.32） */}
          {data.repurchase && (
            <div className="erp-card p-4 md:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-700">🔁 复购分析</h3>
                <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${data.repurchase.is_repeat ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                  {data.repurchase.is_repeat ? '✓ 复购客户' : '首购客户（尚无复购）'}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-[10px] text-slate-400 mb-0.5">累计订单 / 复购金额</p>
                  <p className="text-base font-bold tabular-nums text-slate-800">{Number(data.repurchase.order_count || 0)} 单 · ¥{money(data.repurchase.repurchase_amount)}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">复购金额 = 首单之后的订单合计</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-[10px] text-slate-400 mb-0.5">平均购买间隔</p>
                  <p className="text-base font-bold tabular-nums text-slate-800">{data.repurchase.is_repeat ? `${Number(data.repurchase.avg_interval_days || 0).toFixed(0)} 天` : '—'}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{data.repurchase.is_repeat && Number(data.repurchase.avg_interval_days) > 0 && Number(data.repurchase.avg_interval_days) < 45 ? '高频复购，重点维护' : data.repurchase.is_repeat ? '可提前触达促复购' : '积累订单后自动计算'}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-[10px] text-slate-400 mb-1">近 6 月下单金额</p>
                  {(data.repurchase.trend || []).length === 0 ? <p className="text-xs text-slate-400 py-2">暂无数据</p> : (
                    <div className="flex items-end gap-1.5 h-12">
                      {(data.repurchase.trend || []).map((t: any) => {
                        const max = Math.max(...(data.repurchase.trend || []).map((x: any) => Number(x.amount) || 0), 1);
                        return <div key={t.month} className="flex-1 flex flex-col items-center gap-0.5" title={`${t.month}：¥${Number(t.amount).toLocaleString()}`}>
                          <div className="w-full rounded-t bg-emerald-400/80" style={{ height: `${Math.max(4, (Number(t.amount) / max) * 32)}px` }}></div>
                          <span className="text-[8px] text-slate-400">{String(t.month).slice(5)}</span>
                        </div>;
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
            {/* 销售订单 */}
            <Sec title="🧾 销售订单（近 30 单）" count={(data.orders || []).length}>
              {(data.orders || []).length === 0 ? <p className="text-xs text-slate-400 text-center py-6">暂无订单</p> : (
                <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                  <table className="erp-table text-xs w-full min-w-[480px]">
                    <thead><tr><th className="text-left">单号</th><th>日期</th><th>金额</th><th>状态</th><th>发货</th></tr></thead>
                    <tbody>
                      {(data.orders || []).map((o: any) => (
                        <tr key={o.sales_no}>
                          <td className="text-left font-mono text-indigo-600 whitespace-nowrap">{o.sales_no}</td>
                          <td className="tabular-nums whitespace-nowrap">{String(o.sales_date || '').slice(0, 10)}</td>
                          <td className="tabular-nums font-semibold whitespace-nowrap">¥{money(o.total_amount)}</td>
                          <td className="whitespace-nowrap text-slate-500">{o.sales_status}</td>
                          <td className="whitespace-nowrap"><span className={`px-1.5 py-0.5 rounded text-[10px] ${o.shipping_status === '已出库' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>{o.shipping_status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Sec>

            {/* 应收未收 */}
            <Sec title="💰 应收未收" count={(data.receivables || []).length}>
              {(data.receivables || []).length === 0 ? <p className="text-xs text-slate-400 text-center py-6">🎉 无未结应收</p> : (
                <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                  <table className="erp-table text-xs w-full min-w-[480px]">
                    <thead><tr><th className="text-left">应收单</th><th>未收余额</th><th>到期日</th><th>状态</th></tr></thead>
                    <tbody>
                      {(data.receivables || []).map((r: any) => {
                        const overdue = r.remain_amount > 0 && new Date(String(r.due_date).slice(0, 10).replace(/-/g, '/')).getTime() < Date.now();
                        return (
                          <tr key={r.receivable_no} className={overdue ? 'bg-red-50/40' : ''}>
                            <td className="text-left font-mono text-indigo-600 whitespace-nowrap">{r.receivable_no}</td>
                            <td className="tabular-nums font-bold text-red-500 whitespace-nowrap">¥{money(r.remain_amount)}</td>
                            <td className="tabular-nums whitespace-nowrap">{String(r.due_date || '').slice(0, 10)}{overdue && <span className="text-red-500 font-bold ml-1">逾期</span>}</td>
                            <td className="whitespace-nowrap text-slate-500">{r.status}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Sec>

            {/* 合同 */}
            <Sec title="📑 关联合同" count={(data.contracts || []).length}>
              {(data.contracts || []).length === 0 ? <p className="text-xs text-slate-400 text-center py-6">暂无合同</p> : (
                <div className="space-y-2">
                  {(data.contracts || []).map((ct: any) => (
                    <div key={ct.contract_no} className="flex flex-wrap items-center gap-x-4 gap-y-1 border border-slate-100 rounded-xl px-3 py-2 text-[11px]">
                      <span className="font-mono text-indigo-600">{ct.contract_no}</span>
                      <span className="text-slate-600 truncate max-w-[160px]">{ct.contract_name}</span>
                      <span className="tabular-nums font-semibold text-slate-700">¥{money(ct.amount)}</span>
                      <span className="text-slate-400">至 {String(ct.end_date || '').slice(0, 10)}</span>
                      <span className={`ml-auto px-1.5 py-0.5 rounded ${ct.status === '执行中' ? 'bg-blue-50 text-blue-600' : ct.status === '已完结' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>{ct.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </Sec>

            {/* 催收记录 */}
            <Sec title="📣 催收记录" count={(data.collections || []).length}>
              {(data.collections || []).length === 0 ? <p className="text-xs text-slate-400 text-center py-6">暂无催收记录</p> : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {(data.collections || []).map((h: any, i: number) => (
                    <div key={i} className="border border-slate-100 rounded-xl p-2.5 text-[11px] space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${h.result === '已回款' ? 'bg-emerald-50 text-emerald-600' : h.result === '承诺付款' ? 'bg-blue-50 text-blue-600' : h.result === '无回应' ? 'bg-red-50 text-red-500' : 'bg-amber-50 text-amber-600'}`}>{h.result}</span>
                        <span className="text-slate-500">{h.method} · {h.collector}</span>
                        <span className="text-slate-400 ml-auto tabular-nums">{String(h.collect_date || '').slice(0, 10)}</span>
                      </div>
                      {h.content && <p className="text-slate-600">{h.content}</p>}
                    </div>
                  ))}
                </div>
              )}
            </Sec>
          </div>
        </>
      )}
    </div>
  );
}
