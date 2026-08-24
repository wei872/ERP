import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { hasError: boolean; error: string }

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) { super(props); this.state = { hasError: false, error: '' }; }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message + '\n' + (error.stack || '') };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, fontFamily: 'monospace', whiteSpace: 'pre-wrap', color: '#c00', background: '#fff5f5', minHeight: '100vh' }}>
          <h1 style={{ color: '#e00' }}>⚠️ 渲染错误</h1>
          <p>{this.state.error}</p>
          <button onClick={() => { localStorage.clear(); window.location.reload(); }} style={{ marginTop: 20, padding: '10px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 16 }}>清除数据并刷新</button>
        </div>
      );
    }
    return this.props.children;
  }
}

import { lazy, Suspense } from 'react';

const AuthProvider = lazy(() => import('./context/AuthContext').then(m => ({ default: m.AuthProvider })));
const Layout = lazy(() => import('./components/Layout'));
import ToastHost from './components/ToastHost';

function Loading() {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#0f172a', color:'#fff', flexDirection:'column', gap:16 }}>
      <div style={{ width:40, height:40, border:'4px solid #ffffff30', borderTopColor:'#6366f1', borderRadius:'50%', animation:'spin 1s linear infinite' }}></div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <p>加载中...</p>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<Loading />}>
        <AuthProvider>
          <Layout />
        </AuthProvider>
      </Suspense>
      <ToastHost />
    </ErrorBoundary>
  );
}

export default App;
