import { useEffect, useState } from 'react';
import { BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuth } from '../context/AuthContext';
import { bizApi } from '../api';
import { useMeta } from '../meta/store';

const COLORS = ['#6366f1','#06b6d4','#10b981','#f59e0b','#ef4444','#8b5cf6'];
const EMPTY: { name: string; value: number }[] = [];

function StatCard({ icon, label, value, gradient, sub }: { icon: string; label: string; value: string; gradient: string; sub?: string }) {
  return (
    <div className="erp-card erp-card-hover p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-slate-400 font-medium mb-1.5">{label}</p>
          <p className="text-2xl font-bold text-slate-800 tracking-tight tabular-nums">{value}</p>
          {sub && <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"></span>{sub}</p>}
        </div>
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl bg-gradient-to-br ${gradient}`} style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>{icon}</div>
      </div>
    </div>
  );
}

function ChartCard({ title, children, empty }: { title: string; children: React.ReactNode; empty?: boolean }) {
  return (
    <div className="erp-card p-6">
      <h3 className="font-semibold text-slate-800 text-sm mb-4 flex items-center gap-2">{title}</h3>
      {children}
      {empty && <p className="text-center text-xs text-slate-400 mt-3">暂无数据</p>}
    </div>
  );
}

function n2v(n: any): number { const v = Number(n); return Number.isFinite(v) ? v : 0; }
function fmt(v: number): string { return v >= 10000 ? `${(v/10000).toFixed(1)}万` : v.toLocaleString(); }

function GuidanceCard({ steps, linkages }: { steps: string[]; linkages: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-500/30 rounded-2xl px-5 py-3 text-white shadow-lg">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between text-left">
        <h3 className="font-bold text-sm flex items-center gap-2 text-indigo-300">
          <span>💡</span> 业务操作指南与后台数据联动说明
        </h3>
        <span className="flex items-center gap-2">
          <span className="text-[11px] bg-indigo-500/20 text-indigo-300 px-2.5 py-0.5 rounded-full border border-indigo-400/30 font-medium">全自动实时同步</span>
          <span className="text-indigo-300/70 text-xs">{open ? '▲ 收起' : '▼ 展开'}</span>
        </span>
      </button>
      {open && <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-300 leading-relaxed mt-3">
        <div className="bg-white/5 rounded-xl p-3.5 border border-white/10 space-y-1.5">
          <div className="font-semibold text-amber-300 flex items-center gap-1.5">
            <span>📝</span> 界面使用步骤指南：
          </div>
          <ol className="list-decimal list-inside space-y-1 pl-1 text-slate-200">
            {steps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
        </div>
        <div className="bg-white/5 rounded-xl p-3.5 border border-white/10 space-y-1.5">
          <div className="font-semibold text-emerald-300 flex items-center gap-1.5">
            <span>🔄</span> 跨模块数据全自动联动：
          </div>
          <ul className="list-disc list-inside space-y-1 pl-1 text-slate-200">
            {linkages.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        </div>
      </div>}
    </div>
  );
}

const FEED_META: Record<string, { icon: string; cls: string }> = {
  sale: { icon: '💰', cls: 'bg-blue-50 text-blue-600' },
  purchase: { icon: '🛒', cls: 'bg-cyan-50 text-cyan-600' },
  voucher: { icon: '📒', cls: 'bg-amber-50 text-amber-600' },
  approval: { icon: '🔁', cls: 'bg-violet-50 text-violet-600' },
  stock: { icon: '📦', cls: 'bg-emerald-50 text-emerald-600' },
};

/** 经营动态：最近的销售/采购/凭证/审批/库存事件，业务脉搏一目了然 */
function ActivityFeed({ items }: { items: any[] }) {
  return (
    <div className="erp-card p-5 h-full">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2">⚡ 经营动态</h3>
        <span className="text-[11px] text-slate-400">最近 {items.length} 条</span>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-8">暂无业务动态 —— 发生销售/采购/审批等业务后自动呈现</p>
      ) : (
        <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
          {items.map((it, i) => {
            const m = FEED_META[it.kind] || FEED_META.stock;
            const amt = Number(it.amount);
            return (
              <div key={i} className="flex items-center gap-3 py-1.5 border-b border-slate-50 last:border-0">
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0 ${m.cls}`}>{m.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-slate-700 truncate">{it.title}</p>
                  <p className="text-[11px] text-slate-400 truncate">{it.sub || '—'} · {String(it.date || '').slice(0, 10)}</p>
                </div>
                <div className="text-right shrink-0">
                  {Number.isFinite(amt) && amt !== 0 && <p className="text-xs font-semibold text-slate-700 tabular-nums">¥{amt.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>}
                  {it.status && <p className="text-[10px] text-slate-400">{it.status}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { currentUser, users } = useAuth();
  const { tables } = useMeta();
  const [data, setData] = useState<any>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [activity, setActivity] = useState<any[]>([]);
  useEffect(() => {
    let cancelled = false;
    setLoadFailed(false);
    bizApi.dashboard().then(r => { if (!cancelled) setData(r.data); })
      .catch(() => { if (!cancelled) setLoadFailed(true); });
    bizApi.activityFeed().then(r => { if (!cancelled) setActivity(r.data || []); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const stats = data?.stats || {};
  const salesMonthly = data?.salesMonthly || EMPTY;
  const salesWeekly = data?.salesWeekly || EMPTY;
  const purchaseMonthly = data?.purchaseMonthly || EMPTY;
  const productCategory = (data?.productCategory || []).map((d: any) => ({ name: d.name || '未知', value: n2v(d.value) }));
  const qualityMonthly = data?.qualityMonthly || EMPTY;

  const onlineUsers = users.filter(u => u.status === 'active').length;
  const pendingUsers = users.filter(u => u.status === 'pending').length;
  const roleDistribution = (() => {
    const c: Record<string, number> = {};
    const l: Record<string, string> = { sales:'销售', aftersale:'售后', warehouse:'仓管', accounting:'会计', production:'生产', hr:'人事', procurement:'采购' };
    users.filter(u => u.role !== 'admin' && u.status === 'active').forEach(u => {
      const lb = l[u.role] || u.role; c[lb] = (c[lb] || 0) + 1;
    });
    return Object.entries(c).map(([name, value]) => ({ name, value }));
  })();

  if (data === null && !loadFailed) return <div className="p-16 text-center"><div className="erp-spinner mb-3"></div><p className="text-sm text-slate-400">仪表盘加载中...</p></div>;
  if (data === null && loadFailed) return (
    <div className="p-16 text-center erp-fade-in">
      <div className="text-5xl mb-4">⚠️</div>
      <p className="text-red-500 font-medium mb-2">仪表盘数据加载失败</p>
      <p className="text-xs text-slate-400">请确认后端服务已启动且数据库已加载 init.sql / upgrade.sql</p>
    </div>
  );

  const curMonthSales = n2v(salesMonthly.length ? salesMonthly[salesMonthly.length - 1].value : 0);
  const curMonthPurchase = n2v(purchaseMonthly.length ? purchaseMonthly[purchaseMonthly.length - 1].value : 0);

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto erp-fade-in">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_370px] gap-6 items-start">
        <GuidanceCard
          steps={[
            '第一步：观察顶部 Hero 看板，查看当前在线人员与待审核注册用户。',
            '第二步：查阅 KPI 指标卡，销售额/采购额/订单数/净利润与实际业务完全一致。',
            '第三步：悬停趋势图与存货分布图，洞察企业存货占用与周度/月度销售波动。'
          ]}
          linkages={[
            '【销售出库】完成 ➔ 自动累加累计销售总额、总订单数并更新销售趋势图。',
            '【采购入库】完成 ➔ 自动累加采购总额并更新采购趋势图。',
            '【期末关账】完成 ➔ 自动提取 4104 科目净利润并同步至经营 KPI 看板。'
          ]}
        />
        <ActivityFeed items={activity} />
      </div>
      {/* Hero Banner */}
      <div className="rounded-2xl p-8 text-white relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed, #6366f1)' }}>
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '30px 30px' }}></div>
        <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}></div>
        <div className="absolute -bottom-32 -left-20 w-72 h-72 rounded-full" style={{ background: 'rgba(255,255,255,0.04)' }}></div>
        <div className="relative">
          <h2 className="text-2xl font-bold mb-2 tracking-tight">欢迎回来，{currentUser?.realName} 👋</h2>
          <p className="text-indigo-100 text-sm">{new Date().toLocaleDateString('zh-CN',{year:'numeric',month:'long',day:'numeric',weekday:'long'})} · ERP 企业管理系统 · {tables.length || 0} 张数据表</p>
          <div className="flex gap-4 mt-5">
            <div className="bg-white/15 backdrop-blur-md rounded-xl px-5 py-3 border border-white/10">
              <div className="text-xs text-indigo-100 mb-1">在职用户</div>
              <div className="text-2xl font-bold tabular-nums">{onlineUsers}</div>
            </div>
            {currentUser?.role==='admin' && pendingUsers>0 && (
              <div className="bg-red-500/30 backdrop-blur-md rounded-xl px-5 py-3 border border-red-300/20">
                <div className="text-xs text-red-100 mb-1">待审核</div>
                <div className="text-2xl font-bold tabular-nums">{pendingUsers}</div>
              </div>
            )}
            <div className="bg-white/15 backdrop-blur-md rounded-xl px-5 py-3 border border-white/10">
              <div className="text-xs text-indigo-100 mb-1">数据库表数</div>
              <div className="text-2xl font-bold tabular-nums">{n2v(stats.totalTables?.value)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard icon="💰" label="累计销售总额" value={`¥${fmt(n2v(stats.totalSales?.value))}`} gradient="from-blue-400 to-blue-600" sub={`本月新增 ¥${fmt(curMonthSales)}`}/>
        <StatCard icon="📦" label="累计销售单数" value={n2v(stats.totalOrders?.value).toLocaleString()} gradient="from-indigo-400 to-indigo-600"/>
        <StatCard icon="👥" label="客户总数" value={n2v(stats.totalCustomers?.value).toLocaleString()} gradient="from-emerald-400 to-emerald-600"/>
        <StatCard icon="🏗️" label="累计生产产量" value={`${fmt(n2v(stats.productionOutput?.value))}件`} gradient="from-orange-400 to-orange-600"/>
        <StatCard icon="📈" label="本年净利润" value={`¥${fmt(n2v(stats.netProfit?.value))}`} gradient="from-teal-400 to-teal-600" sub="4104 本年利润结转"/>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="📈 销售趋势（按月）">
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={salesMonthly} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs><linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/><stop offset="95%" stopColor="#6366f1" stopOpacity={0}/></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v:any) => fmt(Number(v))}/>
              <Tooltip contentStyle={{ borderRadius: '0.75rem', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px rgba(0,0,0,0.08)' }}/>
              <Area type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2.5} fill="url(#salesGrad)"/>
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="🛒 采购趋势（按月）">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={purchaseMonthly} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v:any) => fmt(Number(v))}/>
              <Tooltip contentStyle={{ borderRadius: '0.75rem', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px rgba(0,0,0,0.08)' }} cursor={{ fill: 'rgba(6,182,212,0.05)' }}/>
              <Bar dataKey="value" fill="#06b6d4" radius={[6, 6, 0, 0]} maxBarSize={48}/>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <ChartCard title="📦 库存金额分布 TOP10" empty={productCategory.length === 0}>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={productCategory.length ? productCategory : [{ name: '暂无', value: 1 }]} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value" label={({ name, percent }: any) => `${name} ${((percent || 0) * 100).toFixed(0)}%`} labelLine={false}>
                {(productCategory.length ? productCategory : [{ name: '暂无', value: 1 }]).map((_: any, i: any) => <Cell key={i} fill={COLORS[i % COLORS.length]}/>)}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: '0.75rem', border: '1px solid #e2e8f0' }}/>
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="📊 近 7 天销售趋势" empty={salesWeekly.length === 0}>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={salesWeekly} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v:any) => fmt(Number(v))}/>
              <Tooltip contentStyle={{ borderRadius: '0.75rem', border: '1px solid #e2e8f0' }}/>
              <Line type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2.5} dot={{ fill: '#10b981', r: 4 }} activeDot={{ r: 6 }}/>
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        {currentUser?.role === 'admin' ? (
          <ChartCard title="👥 部门人员分布">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={roleDistribution} layout="vertical" margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false}/>
                <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}/>
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={40}/>
                <Tooltip contentStyle={{ borderRadius: '0.75rem', border: '1px solid #e2e8f0' }} cursor={{ fill: 'rgba(139,92,246,0.05)' }}/>
                <Bar dataKey="value" fill="#8b5cf6" radius={[0, 6, 6, 0]} maxBarSize={28}/>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        ) : (
          <ChartCard title="✅ 质量合格率趋势">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={qualityMonthly.length ? qualityMonthly : [{ name: '暂无', value: 100 }]} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}/>
                <YAxis domain={[60, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}/>
                <Tooltip contentStyle={{ borderRadius: '0.75rem', border: '1px solid #e2e8f0' }}/>
                <Line type="monotone" dataKey="value" stroke="#f59e0b" strokeWidth={2.5} dot={{ fill: '#f59e0b', r: 4 }}/>
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </div>

      {/* Bottom KPI Gradient Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: '准时交货率', value: `${n2v(stats.onTimeDelivery?.value)}%`, from: '#3b82f6', to: '#2563eb' },
          { label: '质量合格率', value: `${n2v(stats.qualityRate?.value)}%`, from: '#10b981', to: '#059669' },
          { label: '累计采购总额', value: `¥${fmt(n2v(stats.totalPurchase?.value))}`, from: '#8b5cf6', to: '#7c3aed', sub: `本月新增 ¥${fmt(curMonthPurchase)}` },
          { label: '在编员工数', value: String(n2v(stats.totalEmployees?.value)), from: '#f59e0b', to: '#d97706' },
        ].map((c, i) => (
          <div key={i} className="rounded-2xl p-5 text-white relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${c.from}, ${c.to})`, boxShadow: '0 8px 20px -6px rgba(0,0,0,0.15)' }}>
            <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-white/10"></div>
            <div className="relative">
              <div className="text-sm opacity-80 mb-1.5 font-medium">{c.label}</div>
              <div className="text-3xl font-bold tracking-tight tabular-nums">{c.value}</div>
              {c.sub && <div className="text-[11px] opacity-75 mt-1.5 tabular-nums">{c.sub}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}