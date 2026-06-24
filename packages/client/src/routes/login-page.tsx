import { useState } from 'react';
import { Loader2, Lock } from 'lucide-react';
import { useLogin } from '../api/hooks/use-auth';

const inputStyle: React.CSSProperties = {
  width: '100%', height: 40, padding: '0 12px', background: 'var(--color-bg-base)',
  border: '1px solid var(--color-border-default)', color: 'var(--color-text-primary)',
  fontFamily: 'var(--font-mono)', fontSize: 13, outline: 'none',
};

export function LoginPage({ onSuccess }: { onSuccess: () => void }) {
  const login = useLogin();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    login.mutate({ username: username.trim(), password }, {
      onSuccess: () => onSuccess(),
      onError: (err) => setError(err instanceof Error ? err.message : 'Login failed'),
    });
  };

  return (
    <div className="h-screen flex items-center justify-center" style={{ background: 'var(--color-bg-base)' }}>
      <form onSubmit={submit} className="flex flex-col" style={{ width: 320, padding: 28, background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderTop: '3px solid #6EACDA' }}>
        <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
          <Lock style={{ width: 16, height: 16, color: '#6EACDA' }} />
          <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)' }}>AgenticBEAR</span>
        </div>
        <p style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', marginTop: 0, marginBottom: 18 }}>Sign in to continue</p>

        <label style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', marginBottom: 4 }}>Username</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus style={{ ...inputStyle, marginBottom: 12 }} />

        <label style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', marginBottom: 4 }}>Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ ...inputStyle, marginBottom: 16 }} />

        {error && <div style={{ fontSize: 12, color: '#d88a8a', fontFamily: 'var(--font-mono)', marginBottom: 12 }}>{error}</div>}

        <button type="submit" disabled={login.isPending || !username || !password}
          className="flex items-center justify-center gap-2"
          style={{ height: 40, background: login.isPending || !username || !password ? 'var(--color-bg-base)' : '#6EACDA', color: login.isPending || !username || !password ? 'var(--color-text-disabled)' : '#021526', border: 'none', fontWeight: 600, fontSize: 13.5, cursor: login.isPending ? 'wait' : 'pointer' }}>
          {login.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
