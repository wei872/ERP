import { useEffect, useState } from 'react';
import { bizApi } from '../api';

type Msg = {
  id: string;
  key: string;
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
  const [readKeys, setReadKeys] = useState<Set<string>>(new Set());
  const [hideRead, setHideRead] = useState(true);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'red' | 'amber'>('all');

  useEffect(() => {
    Promise.all([bizApi.todos(), bizApi.dailyReport().catch(() => null), bizApi.messageReadList().catch(() => ({ data: [] as string[] }))])
      .then(([todosRes, dailyRes, readRes]) => {
        setReadKeys(new Set((readRes.data || []) as string[]));
        const t = todosRes.data || {};
        const a = dailyRes?.data?.alerts || {};
        const list: Msg[] = [];
        let id = 0;
        const push = (key: string, icon: string, tone: Msg['tone'], title: string, desc: string, jump?: Msg['jump']) => {
          list.push({ id: String(id++), key, icon, tone, title, desc, jump });
        };
        if ((t.pendingApprovals || 0) > 0) {
          push(`approval:${t.pendingApprovals}`, '🔁', 'violet', `${t.pendingApprovals} 条审批待办`, '点击进入工作流处理', { type: 'workflow' });
        }
        (t.lowStock?.items || []).forEach((it: any) => {
          push(`lowstock:${it.product_code}`, '📦', 'amber', `库存预警：${it.product_name}`, `现存量 ${Number(it.qty || 0)}，低于安全线 ${Number(it.min_stock || 0)}`, { type: 'table', tableKey: 'trade_inventory_balance', search: String(it.product_code || '') });
        });
        if ((t.overdueReceivable?.count || 0) > 0) {
          push(`rcv-overdue:${t.overdueReceivable.count}:${Number(t.overdueReceivable.amount || 0)}`, '💰', 'red', `${t.overdueReceivable.count} 笔应收已逾期`, `逾期金额 ¥${Number(t.overdueReceivable.amount || 0).toLocaleString()}，请催收`, { type: 'reconciliation' });
        }
        if ((t.overduePayable?.count || 0) > 0) {
          push(`pay-overdue:${t.overduePayable.count}:${Number(t.overduePayable.amount || 0)}`, '🧾', 'amber', `${t.overduePayable.count} 笔应付已逾期`, `逾期金额 ¥${Number(t.overduePayable.amount || 0).toLocaleString()}，请安排付款`, { type: 'reconciliation' });
        }
        if ((t.pendingUsers || 0) > 0) {
          push(`pending-users:${t.pendingUsers}`, '👤', 'blue', `${t.pendingUsers} 个用户待审核`, '新注册账号等待开通', { type: 'users' });
        }
        if ((a.expiredContracts || 0) > 0) {
          push(`contract-expired:${a.expiredContracts}`, '📄', 'red', `${a.expiredContracts} 份合同已过期未完结`, '请及时续签或关闭', { type: 'table', tableKey: 'cust_contract_main' });
        }
        if ((a.expiringContracts || 0) > 0) {
          push(`contract-expiring:${a.expiringContracts}`, '📄', 'amber', `${a.expiringContracts} 份合同 30 天内到期`, '请提前安排续签', { type: 'table', tableKey: 'cust_contract_main' });
        }
        if ((a.highCreditUsage || 0) > 0) {
          push(`credit-high:${a.highCreditUsage}`, '💳', 'amber', `${a.highCreditUsage} 家客户信用占用 ≥90%`, '请关注回款，避免超额度', { type: 'table', tableKey: 'cust_customer_main' });
        }
        setMsgs(list);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const base = filter === 'all' ? msgs : msgs.filter(m => m.tone === filter);
  const shown = hideRead ? base.filter(m => !readKeys.has(m.key)) : base;
  const unreadCount = msgs.filter(m => !readKeys.has(m.key)).length;
  const redCount = base.filter(m => m.tone === 'red' && !readKeys.has(m.key)).length;
  const amberCount = base.filter(m => m.tone === 'amber' && !readKeys.has(m.key)).length;

  const jumpTo = (m: Msg) => {
    // 标记已读（持久化），然后跳转
    if (!readKeys.has(m.key)) {
      setReadKeys(prev => new Set(prev).add(m.key));
      bizApi.messageRead(m.key).catch(() => {});
    }
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
        <div className="erp-card p-4"><p className="text-[11px] text-slate-400 mb-1">未读消息</p><p className="text-xl font-bold text-slate-800 tabular-nums">{loading ? '-' : unreadCount}</p><p className="text-[10px] text-slate-300 mt-0.5">共 {msgs.length} 条</p></div>
        <button onClick={() => setFilter(filter === 'red' ? 'all' : 'red')} className={`erp-card p-4 text-left transition-all ${filter === 'red' ? 'ring-2 ring-red-300' : ''}`}><p className="text-[11px] text-red-400 mb-1">紧急未读</p><p className="text-xl font-bold text-red-500 tabular-nums">{loading ? '-' : redCount}</p></button>
        <button onClick={() => setFilter(filter === 'amber' ? 'all' : 'amber')} className={`erp-card p-4 text-left transition-all ${filter === 'amber' ? 'ring-2 ring-amber-300' : ''}`}><p className="text-[11px] text-amber-500 mb-1">提醒未读</p><p className="text-xl font-bold text-amber-600 tabular-nums">{loading ? '-' : amberCount}</p></button>
      </div>

      {/* 已读开关 */}
      <div className="flex items-center justify-end">
        <button onClick={() => setHideRead(h => !h)} className="text-xs text-slate-500 hover:text-indigo-600 transition-colors flex items-center gap-1.5">
          <span className={`w-8 h-4.5 rounded-full relative transition-colors ${hideRead ? 'bg-indigo-500' : 'bg-slate-300'}`} style={{ height: 18 }}>
            <span className={`absolute top-0.5 w-3.5 h-3.5 bg-white rounded-full transition-all ${hideRead ? 'left-4' : 'left-0.5'}`}></span>
          </span>
          {hideRead ? '仅显示未读' : '显示全部（含已读）'}
        </button>
      </div>

      {/* 消息列表 */}
      <div className="erp-card overflow-hidden">
        {loading ? (
          <div className="py-14 text-center"><div className="erp-spinner mx-auto mb-3"></div><p className="text-sm text-slate-400">消息汇总中...</p></div>
        ) : shown.length === 0 ? (
          <div className="py-16 text-center">
            <div className="text-5xl mb-3">{hideRead && msgs.length > 0 ? '✅' : '🎉'}</div>
            <p className="text-slate-500 text-sm font-medium">{hideRead && msgs.length > 0 ? '未读消息已全部处理' : '暂无消息'}</p>
            <p className="text-xs text-slate-400 mt-1">{hideRead && msgs.length > 0 ? '（上方开关可查看已读消息）' : '业务运转良好'}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {shown.map(m => {
              const isRead = readKeys.has(m.key);
              return (
                <button key={m.id} onClick={() => jumpTo(m)} className={`w-full flex items-center gap-4 px-5 py-4 text-left transition-colors ${isRead ? 'opacity-50 hover:bg-slate-50' : 'hover:bg-slate-50'}`}>
                  <span className={`w-11 h-11 rounded-xl flex items-center justify-center text-lg border shrink-0 ${TONE_CLS[m.tone]}`}>{m.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800 truncate flex items-center gap-2">{m.title}{!isRead && <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0"></span>}</p>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">{m.desc}</p>
                  </div>
                  {m.jump && <span className="text-xs text-indigo-500 font-medium shrink-0 flex items-center gap-1">{isRead ? '再次查看' : '去处理'} <span>→</span></span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
