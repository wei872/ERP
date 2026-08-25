import { useEffect, useState } from 'react';
import { bizApi } from '../api';

type Msg = {
  id: string;
  icon: string;
  tone: 'red' | 'amber' | 'blue' | 'violet';
  title: string;
  desc: string;
  jump?: { type: string; tableKey?: string; search?: string };
};

const TONE_CLS: Record<string, string> = {
  red: 'bg-red-50 text-red-500 border-red-100',
  amber: 'bg-amber-50 text-amber-600 border-amber-100',
  blue: 'bg-blue-50 text-blue-600 border-blue-100',
  violet: 'bg-violet-50 text-violet-600 border-violet-100',
};

/** 消息中心：聚合审批待办 / 库存预警 / 逾期款项 / 合同到期 / 信用预警，统一收件箱 + 一键跳转 */
export default function MessageCenterPage() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'red' | 'amber'>('all');

  useEffect(() => {
    Promise.all([bizApi.todos(), bizApi.dailyReport().catch(() => null)])
      .then(([todosRes, dailyRes]) => {
        const t = todosRes.data || {};
        const a = dailyRes?.data?.alerts || {};
        const list: Msg[] = [];
        let id = 0;
        // 审批待办
        if ((t.pendingApprovals || 0) > 0) {
          list.push({ id: String(id++), icon: '🔁', tone: 'violet', title: `${t.pendingApprovals} 条审批待办`, desc: '点击进入工作流处理', jump: { type: 'workflow' } });
        }
        // 库存预警（逐条）
        (t.lowStock?.items || []).forEach((it: any) => {
          list.push({ id: String(id++), icon: '📦', tone: 'amber', title: `库存预警：${it.product_name}`, desc: `现存量 ${Number(it.qty || 0)}，低于安全线 ${Number(it.min_stock || 0)}`, jump: { type: 'table', tableKey: 'trade_inventory_balance', search: String(it.product_code || '') } });
        });
        // 应收逾期
        if ((t.overdueReceivable?.count || 0) > 0) {
          list.push({ id: String(id++), icon: '💰', tone: 'red', title: `${t.overdueReceivable.count} 笔应收已逾期`, desc: `逾期金额 ¥${Number(t.overdueReceivable.amount || 0).toLocaleString()}，请催收`, jump: { type: 'reconciliation' } });
        }
        // 应付逾期
        if ((t.overduePayable?.count || 0) > 0) {
          list.push({ id: String(id++), icon: '🧾', tone: 'amber', title: `${t.overduePayable.count} 笔应付已逾期`, desc: `逾期金额 ¥${Number(t.overduePayable.amount || 0).toLocaleString()}，请安排付款`, jump: { type: 'reconciliation' } });
        }
        // 待审用户
        if ((t.pendingUsers || 0) > 0) {
          list.push({ id: String(id++), icon: '👤', tone: 'blue', title: `${t.pendingUsers} 个用户待审核`, desc: '新注册账号等待开通', jump: { type: 'users' } });
        }
        // 合同到期 / 过期
        if ((a.expiredContracts || 0) > 0) {
          list.push({ id: String(id++), icon: '📄', tone: 'red', title: `${a.expiredContracts} 份合同已过期未完结`, desc: '请及时续签或关闭', jump: { type: 'table', tableKey: 'cust_contract_main' } });
        }
        if ((a.expiringContracts || 0) > 0) {
          list.push({ id: String(id++), icon: '📄', tone: 'amber', title: `${a.expiringContracts} 份合同 30 天内到期`, desc: '请提前安排续签', jump: { type: 'table', tableKey: 'cust_contract_main' } });
        }
        // 信用占用
        if ((a.highCreditUsage || 0) > 0) {
          list.push({ id: String(id++), icon: '💳', tone: 'amber', title: `${a.highCreditUsage} 家客户信用占用 ≥90%`, desc: '请关注回款，避免超额度', jump: { type: 'table', tableKey: 'cust_customer_main' } });
        }
        setMsgs(list);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const shown = filter === 'all' ? msgs : msgs.filter(m => m.tone === filter || (filter === 'red' && m.tone === 'red'));
  const redCount = msgs.filter(m => m.tone === 'red').length;
  const amberCount = msgs.filter(m => m.tone === 'amber').length;

  const jumpTo = (m: Msg) => {
    if (!m.jump) return;
    window.dispatchEvent(new CustomEvent('erp:navigate', { detail: m.jump }));
  };

  return (
    <div className="erp-fade-in p-6 space-y-5 max-w-[900px] mx-auto">
      <div>
        <h2 className="text-xl font-bold text-slate-800 tracking-tight">📬 消息中心</h2>
        <p className="text-sm text-slate-400 mt-1">统一收件箱：审批待办 / 库存预警 / 逾期款项 / 合同到期 / 信用预警，点击任一条直达处理页面</p>
      </div>

      {/* 汇总卡 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="erp-card p-4"><p className="text-[11px] text-slate-400 mb-1">全部消息</p><p className="text-xl font-bold text-slate-800 tabular-nums">{loading ? '-' : msgs.length}</p></div>
        <button onClick={() => setFilter(filter === 'red' ? 'all' : 'red')} className={`erp-card p-4 text-left transition-all ${filter === 'red' ? 'ring-2 ring-red-300' : ''}`}><p className="text-[11px] text-red-400 mb-1">紧急（红）</p><p className="text-xl font-bold text-red-500 tabular-nums">{loading ? '-' : redCount}</p></button>
        <button onClick={() => setFilter(filter === 'amber' ? 'all' : 'amber')} className={`erp-card p-4 text-left transition-all ${filter === 'amber' ? 'ring-2 ring-amber-300' : ''}`}><p className="text-[11px] text-amber-500 mb-1">提醒（黄）</p><p className="text-xl font-bold text-amber-600 tabular-nums">{loading ? '-' : amberCount}</p></button>
      </div>

      {/* 消息列表 */}
      <div className="erp-card overflow-hidden">
        {loading ? (
          <div className="py-14 text-center"><div className="erp-spinner mx-auto mb-3"></div><p className="text-sm text-slate-400">消息汇总中...</p></div>
        ) : shown.length === 0 ? (
          <div className="py-16 text-center">
            <div className="text-5xl mb-3">🎉</div>
            <p className="text-slate-500 text-sm font-medium">太棒了，暂无待处理消息</p>
            <p className="text-xs text-slate-400 mt-1">{filter !== 'all' ? '（当前为筛选视图，点击上方汇总卡可切回全部）' : '业务运转良好'}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {shown.map(m => (
              <button key={m.id} onClick={() => jumpTo(m)} className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-slate-50 transition-colors">
                <span className={`w-11 h-11 rounded-xl flex items-center justify-center text-lg border shrink-0 ${TONE_CLS[m.tone]}`}>{m.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800 truncate">{m.title}</p>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">{m.desc}</p>
                </div>
                {m.jump && <span className="text-xs text-indigo-500 font-medium shrink-0 flex items-center gap-1">去处理 <span>→</span></span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
