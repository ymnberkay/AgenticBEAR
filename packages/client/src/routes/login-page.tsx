import { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Sparkles, Eye, EyeOff, ArrowRight, AlertCircle, Info } from 'lucide-react';
import { useLogin } from '../api/hooks/use-auth';

/** A labelled input with an indigo focus ring, matching the app's form style. */
function Field({
  id, label, type = 'text', value, onChange, autoFocus, trailing, autoComplete, name, required,
}: {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  trailing?: React.ReactNode;
  autoComplete?: string;
  name?: string;
  required?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div className="flex flex-col" style={{ gap: 6 }}>
      <label
        htmlFor={id}
        style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}
      >
        {label}
        {required && <span aria-hidden="true" style={{ color: 'var(--color-error)', marginLeft: 4 }}>*</span>}
      </label>
      <div className="relative">
        <input
          id={id}
          name={name ?? id}
          type={type}
          value={value}
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          required={required}
          aria-required={required || undefined}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            width: '100%', height: 44, padding: trailing ? '0 44px 0 13px' : '0 13px',
            background: 'var(--color-bg-base)', color: 'var(--color-text-primary)',
            border: `1px solid ${focused ? 'var(--color-accent)' : 'var(--color-border-default)'}`,
            borderRadius: 'var(--radius-md)', outline: 'none',
            boxShadow: focused ? '0 0 0 3px var(--color-accent-subtle)' : 'none',
            fontFamily: 'var(--font-sans)', fontSize: 14, transition: 'border-color .15s, box-shadow .15s',
          }}
        />
        {trailing && <div className="absolute" style={{ right: 6, top: '50%', transform: 'translateY(-50%)' }}>{trailing}</div>}
      </div>
    </div>
  );
}

export function LoginPage({ onSuccess, notice }: { onSuccess: () => void; notice?: string }) {
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
      <div className="ambient" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0" aria-hidden="true" style={{
        backgroundImage: 'radial-gradient(700px 420px at 90% 110%, rgba(109,181,138,0.06), transparent 62%)',
      }} />

      <motion.form
        onSubmit={submit}
        initial={{ opacity: 0, y: 14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="relative flex flex-col"
        method="post"
        aria-labelledby="login-heading"
        style={{
          width: 360, padding: 30, gap: 16,
          background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)',
          borderRadius: 'var(--radius-2xl)', boxShadow: 'var(--shadow-lg)',
        }}
      >
        {/* Brand */}
        <div className="flex flex-col items-center" style={{ gap: 12, marginBottom: 4 }}>
          <div aria-hidden="true" className="flex items-center justify-center" style={{ width: 52, height: 52, borderRadius: 'var(--radius-lg)', background: 'var(--color-accent-subtle)', border: '1px solid rgba(124,140,248,0.3)' }}>
            <Sparkles style={{ width: 25, height: 25, color: 'var(--color-accent)' }} />
          </div>
          <div className="flex flex-col items-center" style={{ gap: 3 }}>
            <h1 id="login-heading" style={{ fontSize: 19, fontWeight: 600, color: 'var(--color-text-primary)', letterSpacing: '-0.01em' }}>AgenticBEAR</h1>
            <span style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>Sign in to your workspace</span>
          </div>
        </div>

        {notice && !error && (
          <div role="status" className="flex items-start gap-2" style={{ fontSize: 12, color: 'var(--color-accent)', fontFamily: 'var(--font-mono)', background: 'var(--color-accent-subtle)', border: '1px solid rgba(124,140,248,0.25)', borderRadius: 'var(--radius-sm)', padding: '8px 10px' }}>
            <Info style={{ width: 14, height: 14, flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
            <span>{notice}</span>
          </div>
        )}

        <Field id="login-username" name="username" label="Username" value={username} onChange={setUsername} autoFocus autoComplete="username" required />
        <Field
          id="login-password" name="password"
          label="Password" type={show ? 'text' : 'password'} value={password} onChange={setPassword}
          autoComplete="current-password" required
          trailing={
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? 'Hide password' : 'Show password'}
              aria-pressed={show}
              className="flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
              style={{ width: 32, height: 32, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', borderRadius: 'var(--radius-sm)' }}
            >
              {show ? <EyeOff style={{ width: 16, height: 16 }} aria-hidden="true" /> : <Eye style={{ width: 16, height: 16 }} aria-hidden="true" />}
            </button>
          }
        />

        {error && (
          <div role="alert" className="flex items-center gap-2" style={{ fontSize: 12, color: 'var(--color-error)', fontFamily: 'var(--font-mono)', background: 'var(--color-error-subtle)', border: '1px solid rgba(224,96,96,0.25)', borderRadius: 'var(--radius-sm)', padding: '8px 10px' }}>
            <AlertCircle style={{ width: 14, height: 14, flexShrink: 0 }} aria-hidden="true" /> {error}
          </div>
        )}

        <button type="submit" disabled={disabled}
          aria-busy={login.isPending || undefined}
          className="flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
          style={{
            height: 44, marginTop: 2, borderRadius: 'var(--radius-md)', border: 'none',
            background: disabled ? 'var(--color-bg-raised)' : 'var(--color-accent)',
            color: disabled ? 'var(--color-text-disabled)' : '#021526',
            fontWeight: 600, fontSize: 14, cursor: disabled ? 'not-allowed' : 'pointer', transition: 'background .15s',
          }}
          onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = 'var(--color-accent-hover)'; }}
          onMouseLeave={(e) => { if (!disabled) e.currentTarget.style.background = 'var(--color-accent)'; }}>
          {login.isPending ? <Loader2 className="animate-spin" style={{ width: 16, height: 16 }} aria-hidden="true" /> : <>Sign in <ArrowRight style={{ width: 15, height: 15 }} aria-hidden="true" /></>}
        </button>

        <div style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', textAlign: 'center', marginTop: 2 }}>
          Authenticated access · AgenticBEAR
        </div>
      </motion.form>
    </div>
  );
}
