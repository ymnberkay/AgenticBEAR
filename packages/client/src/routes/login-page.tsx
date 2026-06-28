import { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Sparkles, Eye, EyeOff, ArrowRight, AlertCircle } from 'lucide-react';
import { useLogin } from '../api/hooks/use-auth';

/** A labelled input with an indigo focus ring, matching the app's form style. */
function Field({
  label, type = 'text', value, onChange, autoFocus, trailing,
}: {
  label: string; type?: string; value: string; onChange: (v: string) => void; autoFocus?: boolean; trailing?: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div className="flex flex-col" style={{ gap: 6 }}>
      <label style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>{label}</label>
      <div className="relative">
        <input
          type={type}
          value={value}
          autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            width: '100%', height: 42, padding: trailing ? '0 40px 0 13px' : '0 13px',
            background: 'var(--color-bg-base)', color: 'var(--color-text-primary)',
            border: `1px solid ${focused ? 'var(--color-accent)' : 'var(--color-border-default)'}`,
            borderRadius: 'var(--radius-md)', outline: 'none',
            boxShadow: focused ? '0 0 0 3px var(--color-accent-subtle)' : 'none',
            fontFamily: 'var(--font-sans)', fontSize: 14, transition: 'border-color .15s, box-shadow .15s',
          }}
        />
        {trailing && <div className="absolute" style={{ right: 8, top: '50%', transform: 'translateY(-50%)' }}>{trailing}</div>}
      </div>
    </div>
  );
}

export function LoginPage({ onSuccess }: { onSuccess: () => void }) {
  const login = useLogin();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    login.mutate({ username: username.trim(), password }, {
      onSuccess: () => onSuccess(),
      onError: (err) => setError(err instanceof Error ? err.message : 'Login failed'),
    });
  };

  const disabled = login.isPending || !username || !password;

  return (
    <div className="h-screen flex items-center justify-center relative" style={{ background: 'var(--color-bg-base)', overflow: 'hidden' }}>
      {/* Ambient dot-grid + glow */}
      <div className="ambient" />
      <div className="pointer-events-none absolute inset-0" style={{
        backgroundImage: 'radial-gradient(700px 420px at 90% 110%, rgba(109,181,138,0.06), transparent 62%)',
      }} />

      <motion.form
        onSubmit={submit}
        initial={{ opacity: 0, y: 14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="relative flex flex-col"
        style={{
          width: 360, padding: 30, gap: 16,
          background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)',
          borderRadius: 'var(--radius-2xl)', boxShadow: 'var(--shadow-lg)',
        }}
      >
        {/* Brand */}
        <div className="flex flex-col items-center" style={{ gap: 12, marginBottom: 4 }}>
          <div className="flex items-center justify-center" style={{ width: 52, height: 52, borderRadius: 'var(--radius-lg)', background: 'var(--color-accent-subtle)', border: '1px solid rgba(124,140,248,0.3)' }}>
            <Sparkles style={{ width: 25, height: 25, color: 'var(--color-accent)' }} />
          </div>
          <div className="flex flex-col items-center" style={{ gap: 3 }}>
            <span style={{ fontSize: 19, fontWeight: 600, color: 'var(--color-text-primary)', letterSpacing: '-0.01em' }}>AgenticBEAR</span>
            <span style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)' }}>Sign in to your workspace</span>
          </div>
        </div>

        <Field label="Username" value={username} onChange={setUsername} autoFocus />
        <Field
          label="Password" type={show ? 'text' : 'password'} value={password} onChange={setPassword}
          trailing={
            <button type="button" onClick={() => setShow((s) => !s)} title={show ? 'Hide' : 'Show'}
              className="flex items-center justify-center" style={{ width: 28, height: 28, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-tertiary)' }}>
              {show ? <EyeOff style={{ width: 15, height: 15 }} /> : <Eye style={{ width: 15, height: 15 }} />}
            </button>
          }
        />

        {error && (
          <div className="flex items-center gap-2" style={{ fontSize: 12, color: 'var(--color-error)', fontFamily: 'var(--font-mono)', background: 'var(--color-error-subtle)', border: '1px solid rgba(224,96,96,0.25)', borderRadius: 'var(--radius-sm)', padding: '8px 10px' }}>
            <AlertCircle style={{ width: 14, height: 14, flexShrink: 0 }} /> {error}
          </div>
        )}

        <button type="submit" disabled={disabled}
          className="flex items-center justify-center gap-2"
          style={{
            height: 42, marginTop: 2, borderRadius: 'var(--radius-md)', border: 'none',
            background: disabled ? 'var(--color-bg-raised)' : 'var(--color-accent)',
            color: disabled ? 'var(--color-text-disabled)' : '#021526',
            fontWeight: 600, fontSize: 14, cursor: disabled ? 'default' : 'pointer', transition: 'background .15s',
          }}
          onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = 'var(--color-accent-hover)'; }}
          onMouseLeave={(e) => { if (!disabled) e.currentTarget.style.background = 'var(--color-accent)'; }}>
          {login.isPending ? <Loader2 className="animate-spin" style={{ width: 16, height: 16 }} /> : <>Sign in <ArrowRight style={{ width: 15, height: 15 }} /></>}
        </button>

        <div style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', textAlign: 'center', marginTop: 2 }}>
          Authenticated access · AgenticBEAR
        </div>
      </motion.form>
    </div>
  );
}
