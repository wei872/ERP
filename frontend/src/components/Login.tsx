import { useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { type UserRole, ROLE_LABELS, ROLE_COLORS } from '../types';

export default function Login() {
  const { login, register } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState(''); const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState(''); const [realName, setRealName] = useState('');
  const [phone, setPhone] = useState(''); const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('sales');
  const depts: Record<UserRole, string> = { admin:'管理层', sales:'销售部', aftersale:'售后部', warehouse:'仓储部', accounting:'财务部', production:'生产部', hr:'人事部', procurement:'采购部' };
  const [error, setError] = useState(''); const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: FormEvent) => { e.preventDefault(); setError(''); if(!username||!password){setError('请输入用户名和密码');return;} setLoading(true); const r=await login(username,password); setLoading(false); if(!r)setError('用户名或密码错误，或账号尚未审核通过'); };
  const handleRegister = async (e: FormEvent) => { e.preventDefault(); setError(''); if(!username||!password||!realName||!phone){setError('请填写所有必填项');return;} if(password!==confirmPassword){setError('两次密码输入不一致');return;} if(password.length<6){setError('密码至少6位');return;} const r=await register({username,password,role,realName,phone,email,department:depts[role]}); if(r.success){setSuccess('注册成功！请等待管理员审核通过后即可登录。');setTimeout(()=>{setIsLogin(true);setSuccess('');},3000);}else setError(r.message); };

  const inputCls = "w-full px-4 py-3 bg-white/8 border border-white/10 rounded-xl text-white placeholder-white/30 transition-all focus:outline-none focus:border-indigo-400 focus:bg-white/12 focus:ring-4 focus:ring-indigo-500/15";
  const labelCls = "block text-indigo-200/80 text-xs font-medium mb-1.5";

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 relative overflow-hidden erp-fade-in">
      <div className="absolute inset-0">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full blur-3xl animate-pulse" style={{ background: 'rgba(99,102,241,0.15)' }}></div>
        <div className="absolute -bottom-40 -left-40 w-[28rem] h-[28rem] rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s', background: 'rgba(139,92,246,0.12)' }}></div>
        <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '40px 40px' }}></div>
      </div>
      <div className="relative z-10 w-full max-w-md mx-4">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-4" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 12px 30px rgba(99,102,241,0.4)' }}>
            <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">ERP 企业管理系统</h1>
          <p className="text-indigo-200/60 text-sm">智能化企业管理平台 · 高效协同</p>
        </div>
        <div className="bg-white/8 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/15 p-8 erp-modal-panel">
          <div className="flex bg-white/5 rounded-xl p-1 mb-6">
            <button onClick={() => { setIsLogin(true); setError(''); setSuccess(''); }} className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${isLogin ? 'text-white shadow-lg' : 'text-white/50 hover:text-white/80'}`} style={isLogin ? { background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' } : {}}>登录</button>
            <button onClick={() => { setIsLogin(false); setError(''); setSuccess(''); }} className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${!isLogin ? 'text-white shadow-lg' : 'text-white/50 hover:text-white/80'}`} style={!isLogin ? { background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' } : {}}>注册</button>
          </div>
          {error && <div className="bg-red-500/15 border border-red-500/25 rounded-xl p-3 mb-4 text-red-200 text-sm flex items-center gap-2"><svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/></svg>{error}</div>}
          {success && <div className="bg-emerald-500/15 border border-emerald-500/25 rounded-xl p-3 mb-4 text-emerald-200 text-sm flex items-center gap-2"><svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>{success}</div>}
          {isLogin ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div><label className={labelCls}>用户名</label><input type="text" value={username} onChange={e => setUsername(e.target.value)} className={inputCls} placeholder="请输入用户名"/></div>
              <div><label className={labelCls}>密码</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} className={inputCls} placeholder="请输入密码"/></div>
              <button type="submit" disabled={loading} className="w-full py-3 text-white rounded-xl font-medium transition-all active:scale-[0.98] disabled:opacity-50" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 8px 25px rgba(99,102,241,0.4)' }}>{loading ? '登录中...' : '登 录'}</button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <div><label className={labelCls}>用户名 *</label><input type="text" value={username} onChange={e => setUsername(e.target.value)} className={inputCls} placeholder="请设置用户名"/></div>
              <div><label className={labelCls}>真实姓名 *</label><input type="text" value={realName} onChange={e => setRealName(e.target.value)} className={inputCls} placeholder="请输入真实姓名"/></div>
              <div><label className={labelCls}>选择身份 *</label><div className="grid grid-cols-3 gap-2">{(['sales','aftersale','warehouse','accounting','production','hr','procurement'] as UserRole[]).map(r => (<button key={r} type="button" onClick={() => setRole(r)} className={`px-2.5 py-2.5 rounded-lg text-xs font-medium transition-all border ${role === r ? `${ROLE_COLORS[r]} border-indigo-400 ring-2 ring-indigo-400/30` : 'bg-white/5 border-white/10 text-white/55 hover:bg-white/10 hover:text-white'}`}>{ROLE_LABELS[r]}</button>))}</div></div>
              <div className="grid grid-cols-2 gap-3"><div><label className={labelCls}>手机号 *</label><input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className={inputCls} placeholder="手机号"/></div><div><label className={labelCls}>邮箱</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputCls} placeholder="邮箱(选填)"/></div></div>
              <div className="grid grid-cols-2 gap-3"><div><label className={labelCls}>密码 *</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} className={inputCls} placeholder="至少6位"/></div><div><label className={labelCls}>确认密码 *</label><input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className={inputCls} placeholder="再次输入"/></div></div>
              <button type="submit" className="w-full py-3 text-white rounded-xl font-medium transition-all active:scale-[0.98]" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 8px 25px rgba(99,102,241,0.4)' }}>提交注册</button>
            </form>
          )}
        </div>
        <div className="text-center mt-6 text-white/20 text-xs">© 2025 ERP 企业管理系统</div>
      </div>
    </div>
  );
}