import { useEffect, useState } from 'react';
import { BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ComposedChart } from 'recharts';
import { bizApi } from '../api';

type TimePeriod = 'weekly' | 'monthly' | 'yearly';
const PERIOD_LABELS: Record<TimePeriod, string> = { weekly: '按周(近7天)', monthly: '按月', yearly: '按年' };
const COLORS = ['#6366f1','#06b6d4','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899'];
const EMPTY: { name: string; value: number }[] = [];

function n2v(n: any): number { const v = Number(n); return Number.isFinite(v) ? v : 0; }
function fmt(v: number): string { if (v >= 10000000) return `${(v/10000).toFixed(0)}万`; if (v >= 10000) return `${(v/10000).toFixed(1)}万`; return v.toLocaleString(); }

export default function ReportPage() {
  const [period, setPeriod] = useState<TimePeriod>('monthly');
  const [activeTab, setActiveTab] = useState<string>('sales');
  const [data, setData] = useState<any>(null);
  const [showGuide, setShowGuide] = useState(false);
  useEffect(() => { bizApi.report().then(r => setData(r.data)).catch(() => setData({})); }, []);

  const tabMeta: Record<string, { title: string; icon: string; color: string }> = {
    sales: { title: '销售报表', icon: '💰', color: '#6366f1' },
    purchase: { title: '采购报表', icon: '🛒', color: '#06b6d4' },
    inventory: { title: '库存报表', icon: '📦', color: '#10b981' },
    finance: { title: '财务报表', icon: '💳', color: '#f59e0b' },
    production: { title: '生产报表', icon: '🏗️', color: '#8b5cf6' },
    hr: { title: '人力报表', icon: '👤', color: '#ec4899' },
  };

  const current = tabMeta[activeTab] || tabMeta.sales;
  const agg = data?.[activeTab] || { weekly: EMPTY, monthly: EMPTY, yearly: EMPTY };
  const chartData = (agg[period] || EMPTY).map((d: any) => ({ name: String(d.name), value: n2v(d.value) }));
  const deptExpense = (data?.deptExpense || []).map((d: any) => ({ name: d.name || '未知', budget: n2v(d.budget), actual: n2v(d.actual) }));
  const topProducts = (data?.topProducts || []).map((d: any) => ({ name: d.name || '未知', sales: n2v(d.sales) }));
  const inventoryAlert = (data?.inventoryAlert || []).map((d: any) => ({
    name: d.name || '未知', value: n2v(d.value), fill: d.name === '正常' ? '#10b981' : d.name === '预警' ? '#f59e0b' : d.name === '缺货' ? '#ef4444' : '#6366f1'
  }));
  const kpi = data?.kpi || {};

  return (<div className="p-6 space-y-6 max-w-[1600px] mx-auto erp-fade-in">
    {/* UI 引导与联动卡片（默认收起） */}
    <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-500/30 rounded-2xl px-5 py-3 text-white shadow-lg">
      <button onClick={() => setShowGuide(s => !s)} className="w-full flex items-center justify-between text-left">
        <h3 className="font-bold text-sm flex items-center gap-2 text-indigo-300">
          <span>💡</span> 报表中心使用指南与后台数据联动说明
        </h3>
        <span className="flex items-center gap-2">
          <span className="text-[11px] bg-indigo-500/20 text-indigo-300 px-2.5 py-0.5 rounded-full border border-indigo-400/30 font-medium">全量实时穿透计算</span>
          <span className="text-indigo-300/70 text-xs">{showGuide ? '▲ 收起' : '▼ 展开'}</span>
        </span>
      </button>
      {showGuide && <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-300 leading-relaxed mt-3">
        <div className="bg-white/5 rounded-xl p-3.5 border border-white/10 space-y-1.5">
          <div className="font-semibold text-amber-300 flex items-center gap-1.5">
            <span>📝</span> 步骤指引：
          </div>
          <ol className="list-decimal list-inside space-y-1 pl-1 text-slate-200">
            <li>顶部切换【周/月/年】聚合维度，查看不同时间跨度的数据趋势。</li>
            <li>点击中部 6 大维度标签（销售/采购/库存/财务/生产/人力），查看特定领域走势。</li>
            <li>悬停柱状图与饼图区域，可精确穿透查看具体金额与占比。</li>
          </ol>
        </div>
        <div className="bg-white/5 rounded-xl p-3.5 border border-white/10 space-y-1.5">
          <div className="font-semibold text-emerald-300 flex items-center gap-1.5">
            <span>🔄</span> 自动数据联动：
          </div>
          <ul className="list-disc list-inside space-y-1 pl-1 text-slate-200">
            <li>销售出库 / 采购入库完成 ➔ 自动实时重算销售/采购趋势与 TOP8 热销品。</li>
            <li>生产领料 / 完工结算完成 ➔ 实时更新生产报表与库存价值汇总。</li>
            <li>财务核销与期末关账完成 ➔ 实时更新财务收入支出与净利润 KPI。</li>
          </ul>
        </div>
      </div>}
    </div>

    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4"><div><h2 className="text-xl font-bold text-gray-800">📊 报表中心</h2><p className="text-sm text-gray-500 mt-1">数据全部来自业务表实时聚合，按周/月/年查看公司运营状况</p></div><div className="flex items-center gap-2 bg-white rounded-xl p-1 shadow-sm border border-gray-100">{(['weekly','monthly','yearly'] as TimePeriod[]).map(p=>(<button key={p} onClick={()=>setPeriod(p)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${period===p?'bg-blue-500 text-white shadow-sm':'text-gray-500 hover:bg-gray-50'}`}>{PERIOD_LABELS[p]}</button>))}</div></div>
    <div className="flex gap-2 overflow-x-auto pb-2">{Object.entries(tabMeta).map(([key, report])=>(<button key={key} onClick={()=>setActiveTab(key)} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${activeTab===key?'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg':'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'}`}><span>{report.icon}</span>{report.title}</button>))}</div>
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100"><div className="flex items-center justify-between mb-6"><h3 className="font-semibold text-gray-800 text-lg">{current.icon} {current.title} - {PERIOD_LABELS[period]}趋势</h3></div><ResponsiveContainer width="100%" height={360}><ComposedChart data={chartData}><defs><linearGradient id={`grad-${activeTab}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={current.color} stopOpacity={0.2}/><stop offset="95%" stopColor={current.color} stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/><XAxis dataKey="name" tick={{fontSize:11}} stroke="#9ca3af"/><YAxis tick={{fontSize:11}} stroke="#9ca3af" tickFormatter={fmt}/><Tooltip formatter={(v:any)=>[`¥${fmt(Number(v))}`,current.title]}/><Area type="monotone" dataKey="value" fill={`url(#grad-${activeTab})`} stroke={current.color} strokeWidth={2}/><Bar dataKey="value" fill={current.color} opacity={0.3} radius={[4,4,0,0]}/></ComposedChart></ResponsiveContainer>{chartData.length===0&&<p className="text-center text-sm text-gray-400 mt-2">暂无{current.title}数据</p>}</div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100"><h3 className="font-semibold text-gray-800 mb-4">部门预算 vs 实际</h3><ResponsiveContainer width="100%" height={280}><BarChart data={deptExpense.length?deptExpense:[{name:'暂无',budget:0,actual:0}]}><CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/><XAxis dataKey="name" tick={{fontSize:10}} stroke="#9ca3af"/><YAxis tick={{fontSize:10}} stroke="#9ca3af" tickFormatter={fmt}/><Tooltip formatter={(v:any)=>`¥${fmt(Number(v))}`}/><Legend/><Bar dataKey="budget" name="预算" fill="#6366f1" radius={[4,4,0,0]}/><Bar dataKey="actual" name="实际" fill="#06b6d4" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer>{deptExpense.length===0&&<p className="text-center text-xs text-gray-400 mt-2">暂无 HR 薪资数据</p>}</div>
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100"><h3 className="font-semibold text-gray-800 mb-4">热销产品 TOP8</h3><ResponsiveContainer width="100%" height={280}><BarChart data={topProducts.length?topProducts:[{name:'暂无',sales:0}]} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/><XAxis type="number" tick={{fontSize:10}} stroke="#9ca3af"/><YAxis type="category" dataKey="name" tick={{fontSize:10}} stroke="#9ca3af" width={90}/><Tooltip/><Bar dataKey="sales" name="销售额" fill="#8b5cf6" radius={[0,4,4,0]}/></BarChart></ResponsiveContainer>{topProducts.length===0&&<p className="text-center text-xs text-gray-400 mt-2">暂无销售明细数据</p>}</div>
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100"><h3 className="font-semibold text-gray-800 mb-4">库存状态分布</h3><ResponsiveContainer width="100%" height={280}><PieChart><Pie data={inventoryAlert.length?inventoryAlert:[{name:'暂无',value:1,fill:'#6366f1'}]} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value" label={({name,value}:any)=>`${name}:${value}`}>{(inventoryAlert.length?inventoryAlert:[{name:'暂无',value:1,fill:'#6366f1'}]).map((entry:any,i:number)=><Cell key={i} fill={entry.fill}/>)}</Pie><Tooltip/><Legend/></PieChart></ResponsiveContainer>{inventoryAlert.length===0&&<p className="text-center text-xs text-gray-400 mt-2">暂无库存数据</p>}</div>
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100"><h3 className="font-semibold text-gray-800 mb-4">销售月度趋势</h3><ResponsiveContainer width="100%" height={280}><AreaChart data={(data?.sales?.monthly||EMPTY).map((d:any)=>({name:String(d.name),value:n2v(d.value)}))}><CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/><XAxis dataKey="name" tick={{fontSize:10}} stroke="#9ca3af"/><YAxis tick={{fontSize:10}} stroke="#9ca3af" tickFormatter={fmt}/><Tooltip formatter={(v:any)=>`¥${fmt(Number(v))}`}/><Area type="monotone" dataKey="value" name="销售额" stroke="#6366f1" fill="#6366f120"/></AreaChart></ResponsiveContainer></div>
    </div>
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {[{l:'累计销售',v:`¥${fmt(n2v(kpi.totalSales))}`},{l:'累计采购',v:`¥${fmt(n2v(kpi.totalPurchase))}`},{l:'库存总值',v:`¥${fmt(n2v(kpi.inventoryValue))}`},{l:'本年净利润',v:`¥${fmt(n2v(kpi.netProfit))}`},{l:'累计生产',v:`${fmt(n2v(kpi.production))}件`},{l:'在编员工',v:`${n2v(kpi.employees)}人`}].map((item,i)=>(<div key={i} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-center"><div className="text-xs text-gray-400 mb-1">{item.l}</div><div className="text-lg font-bold text-gray-800">{item.v}</div></div>))}
    </div>
  </div>);
}