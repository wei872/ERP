import { useEffect, useState } from 'react';
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { bizApi } from '../api';

const COLORS = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316'];
const n2v = (n: unknown) => { const v = Number(n); return Number.isFinite(v) ? v : 0; };
const fmt = (v: number) => v >= 100000000 ? `${(v / 100000000).toFixed(2)}亿` : v >= 10000 ? `${(v / 10000).toFixed(1)}万` : v.toLocaleString();

/** 大屏可配置项（v5.25）：KPI 卡 6 项 + 图表面板 4 项，显隐持久化到本机 */
const KPI_KEYS: Array<{ key: string; label: string }> = [
  { key: 'sales', label: '💰 累计销售额' },
  { key: 'purchase', label: '🛒 累计采购额' },
  { key: 'orders', label: '📦 销售订单数' },
  { key: 'profit', label: '📈 本年净利润' },
  { key: 'todos', label: '🔔 审批待办' },
  { key: 'lowStock', label: '⚠️ 库存预警' },
];
const SECTION_KEYS: Array<{ key: string; label: string }> = [
  { key: 'salesTrend', label: '📈 销售趋势（按月）' },
  { key: 'purchaseTrend', label: '🛒 采购趋势（按月）' },
  { key: 'activity', label: '⚡ 经营动态' },
  { key: 'stockPie', label: '📦 库存价值分布' },
];
const CFG_KEY = 'erp_bigscreen_cfg';
const defaultCfg = () => {
  const d: Record<string, boolean> = {};
  KPI_KEYS.forEach(k => { d[k.key] = true; });
  SECTION_KEYS.forEach(k => { d[k.key] = true; });
  return d;
};

function Kpi({ icon, label, value, accent }: { icon: string; label: string; value: string; accent: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md px-5 py-4 flex items-center gap-4">
      <span className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0 ${accent}`}>{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] text-slate-400 mb-0.5 truncate">{label}</p>
        <p className="text-xl font-bold text-white tabular-nums tracking-tight truncate">{value}</p>
      </div>
    </div>
  );
}

/** 数据大屏：经营全景投屏模式（60 秒自动刷新，Esc 或按钮退出；KPI 与面板可配置，v5.25） */
export default function BigScreen({ onExit }: { onExit: () => void }) {
  const [data, setData] = useState<any>(null);
  const [todos, setTodos] = useState<any>(null);
  const [activity, setActivity] = useState<any[]>([]);
  const [now, setNow] = useState(new Date());
  const [cfg, setCfg] = useState<Record<string, boolean>>(() => {
    try { return { ...defaultCfg(), ...JSON.parse(localStorage.getItem(CFG_KEY) || '{}') }; } catch { return defaultCfg(); }
  });
  const [cfgOpen, setCfgOpen] = useState(false);
  const toggleCfg = (key: string) => {
    setCfg(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem(CFG_KEY, JSON.stringify(next));
      return next;
    });
  };

  useEffect(() => {
    const load = () => {
      bizApi.dashboard().then(r => setData(r.data)).catch(() => {});
      bizApi.todos().then(r => setTodos(r.data)).catch(() => {});
      bizApi.activityFeed().then(r => setActivity(r.data || [])).catch(() => {});
    };
    load();
    const iv = setInterval(load, 60000);
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => { clearInterval(iv); clearInterval(clock); };
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onExit(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onExit]);

  const stats = data?.stats || {};
  const salesMonthly = (data?.salesMonthly || []).map((d: any) => ({ name: String(d.name).slice(5), value: n2v(d.value) }));
  const purchaseMonthly = (data?.purchaseMonthly || []).map((d: any) => ({ name: String(d.name).slice(5), value: n2v(d.value) }));
  const productCategory = data?.productCategory || [];
  const darkTooltip = { borderRadius: 12, background: 'rgba(15,23,42,0.92)', border: '1px solid rgba(255,255,255,0.12)', color: '#e2e8f0', fontSize: 12 };
  const visibleKpis = KPI_KEYS.filter(k => cfg[k.key]);

  return (
    <div className="fixed inset-0 z-[150] overflow-y-auto text-white" style={{ background: 'radial-gradient(ellipse at 20% 0%, #1e1b4b 0%, #0f172a 45%, #020617 100%)' }}>
      <div className="max-w-[1700px] mx-auto p-6 space-y-5">
        {/* 标题栏 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
              <span className="w-9 h-9 rounded-xl flex items-center justify-center text-base font-bold" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>E</span>
              ERP 经营驾驶舱
            </h1>
            <p className="text-xs text-slate-400 mt-1.5">业务数据实时投屏 · 每 60 秒自动刷新 · 指标可按需配置</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-2xl font-bold tabular-nums tracking-wider">{now.toLocaleTimeString('zh-CN', { hour12: false })}</p>
              <p className="text-[11px] text-slate-400">{now.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}</p>
            </div>
            <button onClick={() => setCfgOpen(true)} title="配置大屏指标" className="px-4 py-2 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-sm transition-colors">⚙️ 配置指标</button>
            <button onClick={onExit} title="退出大屏（Esc）" className="px-4 py-2 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-sm transition-colors">✕ 退出大屏</button>
          </div>
        </div>

        {/* KPI 行（可配置显隐） */}
        {visibleKpis.length > 0 && (
          <div className={`grid grid-cols-2 md:grid-cols-3 gap-3 ${visibleKpis.length >= 5 ? 'xl:grid-cols-6' : visibleKpis.length >= 3 ? 'xl:grid-cols-4' : 'xl:grid-cols-2'}`}>
            {cfg.sales && <Kpi icon="💰" label="累计销售额" value={`¥${fmt(n2v(stats.totalSales?.value))}`} accent="bg-blue-500/20 text-blue-300" />}
            {cfg.purchase && <Kpi icon="🛒" label="累计采购额" value={`¥${fmt(n2v(stats.totalPurchase?.value))}`} accent="bg-cyan-500/20 text-cyan-300" />}
            {cfg.orders && <Kpi icon="📦" label="销售订单数" value={n2v(stats.totalOrders?.value).toLocaleString()} accent="bg-indigo-500/20 text-indigo-300" />}
            {cfg.profit && <Kpi icon="📈" label="本年净利润" value={`¥${fmt(n2v(stats.netProfit?.value))}`} accent="bg-emerald-500/20 text-emerald-300" />}
            {cfg.todos && <Kpi icon="🔔" label="审批待办" value={`${n2v(todos?.pendingApprovals)}`} accent="bg-violet-500/20 text-violet-300" />}
            {cfg.lowStock && <Kpi icon="⚠️" label="库存预警" value={`${n2v(todos?.lowStock?.count)}`} accent="bg-amber-500/20 text-amber-300" />}
          </div>
        )}

        {/* 趋势图（可配置显隐） */}
        {(cfg.salesTrend || cfg.purchaseTrend) && (
          <div className={`grid grid-cols-1 gap-5 ${cfg.salesTrend && cfg.purchaseTrend ? 'lg:grid-cols-2' : ''}`}>
            {cfg.salesTrend && (
              <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-5">
                <h3 className="text-sm font-semibold text-slate-200 mb-3">📈 销售趋势（按月）</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={salesMonthly} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <defs><linearGradient id="bsSales" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#818cf8" stopOpacity={0.5} /><stop offset="95%" stopColor="#818cf8" stopOpacity={0} /></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => fmt(v)} />
                    <Tooltip contentStyle={darkTooltip} formatter={(v: any) => [`¥${Number(v).toLocaleString()}`, '销售额']} />
                    <Area type="monotone" dataKey="value" stroke="#818cf8" strokeWidth={2.5} fill="url(#bsSales)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
            {cfg.purchaseTrend && (
              <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-5">
                <h3 className="text-sm font-semibold text-slate-200 mb-3">🛒 采购趋势（按月）</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={purchaseMonthly} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => fmt(v)} />
                    <Tooltip contentStyle={darkTooltip} cursor={{ fill: 'rgba(34,211,238,0.06)' }} formatter={(v: any) => [`¥${Number(v).toLocaleString()}`, '采购额']} />
                    <Bar dataKey="value" fill="#22d3ee" radius={[6, 6, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* 动态 + 分布（可配置显隐） */}
        {(cfg.activity || cfg.stockPie) && (
          <div className={`grid grid-cols-1 gap-5 ${cfg.activity && cfg.stockPie ? 'lg:grid-cols-3' : ''}`}>
            {cfg.activity && (
              <div className={`${cfg.stockPie ? 'lg:col-span-2' : ''} rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-5`}>
                <h3 className="text-sm font-semibold text-slate-200 mb-3">⚡ 经营动态</h3>
                <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                  {activity.length === 0 && <p className="text-xs text-slate-500 text-center py-8">暂无业务动态</p>}
                  {activity.map((it, i) => (
                    <div key={i} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0 text-xs">
                      <span className="w-7 h-7 rounded-lg bg-white/8 flex items-center justify-center shrink-0">{{ sale: '💰', purchase: '🛒', voucher: '📒', approval: '🔁', stock: '📦' }[it.kind as string] || '📄'}</span>
                      <span className="flex-1 min-w-0 truncate text-slate-300">{it.title} <span className="text-slate-500">{it.sub}</span></span>
                      {Number(it.amount) > 0 && <span className="tabular-nums text-slate-200 font-medium shrink-0">¥{Number(it.amount).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>}
                      <span className="text-slate-500 shrink-0">{String(it.date || '').slice(5, 10)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {cfg.stockPie && (
              <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-5">
                <h3 className="text-sm font-semibold text-slate-200 mb-3">📦 库存价值分布</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={productCategory.length ? productCategory : [{ name: '暂无', value: 1 }]} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={78} paddingAngle={3}>
                      {(productCategory.length ? productCategory : [{ name: '暂无', value: 1 }]).map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={darkTooltip} formatter={(v: any) => `¥${Number(v).toLocaleString()}`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 指标配置弹窗 */}
      {cfgOpen && (
        <div className="fixed inset-0 z-[160] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setCfgOpen(false)}>
          <div className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-md p-6 text-white erp-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-base flex items-center gap-2">⚙️ 大屏指标配置</h3>
              <button onClick={() => setCfgOpen(false)} className="text-slate-400 hover:text-white p-1 rounded-lg">✕</button>
            </div>
            <p className="text-[11px] text-slate-400 mb-3">勾选需要投屏的指标，配置自动保存到本机，投屏时按此渲染。</p>
            <p className="text-xs font-semibold text-slate-300 mb-2">KPI 指标卡</p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {KPI_KEYS.map(k => (
                <label key={k.key} className="flex items-center gap-2 text-xs text-slate-200 bg-white/5 border border-white/10 rounded-xl px-3 py-2 cursor-pointer hover:bg-white/10">
                  <input type="checkbox" checked={!!cfg[k.key]} onChange={() => toggleCfg(k.key)} className="accent-indigo-500"/>{k.label}
                </label>
              ))}
            </div>
            <p className="text-xs font-semibold text-slate-300 mb-2">图表面板</p>
            <div className="grid grid-cols-2 gap-2 mb-5">
              {SECTION_KEYS.map(k => (
                <label key={k.key} className="flex items-center gap-2 text-xs text-slate-200 bg-white/5 border border-white/10 rounded-xl px-3 py-2 cursor-pointer hover:bg-white/10">
                  <input type="checkbox" checked={!!cfg[k.key]} onChange={() => toggleCfg(k.key)} className="accent-indigo-500"/>{k.label}
                </label>
              ))}
            </div>
            <button onClick={() => { const d = defaultCfg(); setCfg(d); localStorage.setItem(CFG_KEY, JSON.stringify(d)); }} className="w-full py-2 rounded-xl text-xs bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10">恢复默认配置</button>
          </div>
        </div>
      )}
    </div>
  );
}
