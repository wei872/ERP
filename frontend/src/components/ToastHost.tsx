import { useEffect, useState } from 'react';
import { subscribeToast, type ToastMsg } from '../utils/toast';

const STYLE: Record<string, { icon: string; cls: string }> = {
  success: { icon: '✅', cls: 'bg-emerald-50 border-emerald-200 text-emerald-800' },
  error: { icon: '⛔', cls: 'bg-red-50 border-red-200 text-red-700' },
  warn: { icon: '⚠️', cls: 'bg-amber-50 border-amber-200 text-amber-800' },
  info: { icon: '💡', cls: 'bg-indigo-50 border-indigo-200 text-indigo-800' },
};

/** 全局通知宿主：顶部居中堆叠，3.2 秒自动消失，点击可立即关闭 */
export default function ToastHost() {
  const [items, setItems] = useState<ToastMsg[]>([]);

  useEffect(() => {
    const timers = new Map<number, ReturnType<typeof setTimeout>>();
    const unsub = subscribeToast(t => {
      setItems(prev => [...prev.slice(-3), t]); // 最多同屏 4 条
      timers.set(t.id, setTimeout(() => setItems(prev => prev.filter(x => x.id !== t.id)), 3200));
    });
    return () => { unsub(); timers.forEach(clearTimeout); };
  }, []);

  if (items.length === 0) return null;
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] flex flex-col items-center gap-2 pointer-events-none px-4 w-full max-w-lg">
      {items.map(t => {
        const s = STYLE[t.type] || STYLE.info;
        return (
          <div key={t.id} onClick={() => setItems(prev => prev.filter(x => x.id !== t.id))}
            className={`pointer-events-auto cursor-pointer flex items-center gap-2.5 px-4 py-2.5 rounded-xl border shadow-lg backdrop-blur-md text-sm font-medium erp-toast-in ${s.cls}`}>
            <span className="text-base leading-none">{s.icon}</span>
            <span className="max-w-sm truncate" title={t.text}>{t.text}</span>
          </div>
        );
      })}
    </div>
  );
}
