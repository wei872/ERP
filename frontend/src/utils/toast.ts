/**
 * 全局轻量通知系统（无需 Context）：
 *   toastNotify('保存成功')            → 自动按文案判定类型
 *   toastNotify('失败', 'error')       → 显式指定类型
 * ToastHost 组件挂载在 App 根部，统一渲染所有页面产生的通知。
 */
export type ToastType = 'success' | 'error' | 'warn' | 'info';
export interface ToastMsg { id: number; type: ToastType; text: string }

let listeners: Array<(t: ToastMsg) => void> = [];
let seq = 0;

export function subscribeToast(fn: (t: ToastMsg) => void): () => void {
  listeners.push(fn);
  return () => { listeners = listeners.filter(l => l !== fn); };
}

function autoType(text: string): ToastType {
  if (/失败|错误|不足|拒绝|不能|无法|过期|驳回/.test(text)) return 'error';
  if (/成功|完成|已生成|通过/.test(text)) return 'success';
  if (/警告|预警|注意|请/.test(text)) return 'warn';
  return 'info';
}

export function toastNotify(text: string, type?: ToastType) {
  if (!text) return;
  const t: ToastMsg = { id: ++seq, type: type || autoType(text), text };
  listeners.forEach(l => l(t));
}
