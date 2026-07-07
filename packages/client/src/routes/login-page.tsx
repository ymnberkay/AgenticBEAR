import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Sparkles, Eye, EyeOff, ArrowRight, AlertCircle, Info, Github, KeyRound, Building2, ShieldCheck, Copy, Check } from 'lucide-react';
import type { SsoProviderInfo } from '@subagent/shared';
import { useAuthMethods, useLogin, useVerifyMfa, useMfaSetup, useMfaEnable, useChangePassword } from '../api/hooks/use-auth';

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

const PROVIDER_ICONS: Record<SsoProviderInfo['id'], typeof Github> = {
  github: Github,
  entra: Building2,
  oidc: KeyRound,
};

/** "Continue with <IdP>" — a full-width secondary button that navigates to the OAuth start URL. */
function SsoButton({ provider }: { provider: SsoProviderInfo }) {
  const Icon = PROVIDER_ICONS[provider.id] ?? KeyRound;
  return (
    <a
      href={provider.startUrl}
      className="flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
      style={{
        height: 44, borderRadius: 'var(--radius-md)', textDecoration: 'none',
        background: 'var(--color-bg-base)', border: '1px solid var(--color-border-default)',
        color: 'var(--color-text-primary)', fontWeight: 500, fontSize: 13.5,
        transition: 'border-color .15s, background .15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-accent)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-default)'; }}
    >
      <Icon style={{ width: 16, height: 16 }} aria-hidden="true" /> Continue with {provider.name}
    </a>
  );
}

/** TOTP secret + otpauth link + confirmation code — shared by forced enrollment on login. */
function MfaEnrollStep({ onDone, onError }: { onDone: () => void; onError: (msg: string) => void }) {
  const setup = useMfaSetup();
  const enable = useMfaEnable();
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    setup.mutate(undefined, { onError: (err) => onError(err instanceof Error ? err.message : 'Setup failed') });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirm = (e: React.FormEvent) => {
    e.preventDefault();
    enable.mutate(code, {
      onSuccess: () => onDone(),
      onError: (err) => onError(err instanceof Error ? err.message : 'Invalid code'),
    });
  };

  const copySecret = () => {
    if (!setup.data) return;
    void navigator.clipboard.writeText(setup.data.secret).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <>
      <div className="flex items-start gap-2" style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
        <ShieldCheck style={{ width: 15, height: 15, flexShrink: 0, marginTop: 1, color: 'var(--color-accent)' }} aria-hidden="true" />
        <span>Two-factor authentication is required. Add this key to your authenticator app (Google Authenticator, Authy, 1Password…), then enter the 6-digit code.</span>
      </div>
      {setup.data ? (
        <div className="flex flex-col" style={{ gap: 8 }}>
          <div className="flex items-center gap-2" style={{
            padding: '10px 12px', background: 'var(--color-bg-base)', border: '1px solid var(--color-border-default)',
            borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-mono)', fontSize: 12.5, wordBreak: 'break-all',
          }}>
            <span style={{ flex: 1, color: 'var(--color-text-primary)' }}>{setup.data.secret}</span>
            <button type="button" onClick={copySecret} aria-label="Copy secret"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? 'var(--color-success)' : 'var(--color-text-secondary)', padding: 4 }}>
              {copied ? <Check style={{ width: 14, height: 14 }} aria-hidden="true" /> : <Copy style={{ width: 14, height: 14 }} aria-hidden="true" />}
            </button>
          </div>
          <a href={setup.data.otpauthUrl} style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--color-accent)' }}>
            Open in authenticator app
          </a>
        </div>
      ) : (
        <div className="flex items-center justify-center" style={{ padding: 12 }}>
          <Loader2 className="animate-spin" style={{ width: 18, height: 18, color: 'var(--color-text-secondary)' }} aria-hidden="true" />
        </div>
      )}
      <form onSubmit={confirm} className="flex flex-col" style={{ gap: 16 }}>
        <Field id="mfa-enroll-code" name="code" label="Verification code" value={code} onChange={setCode} autoFocus autoComplete="one-time-code" required />
        <button type="submit" disabled={enable.isPending || code.length < 6}
          className="flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
          style={{
            height: 44, borderRadius: 'var(--radius-md)', border: 'none',
            background: code.length < 6 ? 'var(--color-bg-raised)' : 'var(--color-accent)',
            color: code.length < 6 ? 'var(--color-text-disabled)' : '#021526',
            fontWeight: 600, fontSize: 14, cursor: code.length < 6 ? 'not-allowed' : 'pointer',
          }}>
          {enable.isPending ? <Loader2 className="animate-spin" style={{ width: 16, height: 16 }} aria-hidden="true" /> : <>Activate <ArrowRight style={{ width: 15, height: 15 }} aria-hidden="true" /></>}
        </button>
      </form>
    </>
  );
}

/** Forced rotation of a provisional password (seeded default / admin reset). */
function PasswordChangeStep({ currentPassword, onDone, onError }: {
  currentPassword: string;
  onDone: () => void;
  onError: (msg: string) => void;
}) {
  const change = useChangePassword();
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) {
      onError('Passwords do not match');
      return;
    }
    change.mutate({ currentPassword, newPassword: next }, {
      onSuccess: () => onDone(),
      onError: (err) => onError(err instanceof Error ? err.message : 'Password change failed'),
    });
  };

  const disabled = change.isPending || !next || !confirm;
  return (
    <form onSubmit={submit} className="flex flex-col" style={{ gap: 16 }}>
      <div className="flex items-start gap-2" style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
        <ShieldCheck style={{ width: 15, height: 15, flexShrink: 0, marginTop: 1, color: 'var(--color-accent)' }} aria-hidden="true" />
        <span>Your password was set by an administrator — choose your own to continue.</span>
      </div>
      <Field id="pw-new" name="new-password" label="New password" type="password" value={next} onChange={setNext} autoFocus autoComplete="new-password" required />
      <Field id="pw-confirm" name="confirm-password" label="Confirm password" type="password" value={confirm} onChange={setConfirm} autoComplete="new-password" required />
      <button type="submit" disabled={disabled}
        className="flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
        style={{
          height: 44, borderRadius: 'var(--radius-md)', border: 'none',
          background: disabled ? 'var(--color-bg-raised)' : 'var(--color-accent)',
          color: disabled ? 'var(--color-text-disabled)' : '#021526',
          fontWeight: 600, fontSize: 14, cursor: disabled ? 'not-allowed' : 'pointer',
        }}>
        {change.isPending ? <Loader2 className="animate-spin" style={{ width: 16, height: 16 }} aria-hidden="true" /> : <>Save password <ArrowRight style={{ width: 15, height: 15 }} aria-hidden="true" /></>}
      </button>
    </form>
  );
}

export function LoginPage({ onSuccess, notice }: { onSuccess: () => void; notice?: string }) {
  const methods = useAuthMethods();
  const login = useLogin();
  const verifyMfa = useVerifyMfa();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  // 'login' → credentials/SSO; 'mfa' → code; 'password' → forced rotation; 'enroll' → forced TOTP setup.
  const [step, setStep] = useState<'login' | 'mfa' | 'password' | 'enroll'>('login');
  const [mfaToken, setMfaToken] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [enrollAfterPassword, setEnrollAfterPassword] = useState(false);
  // Break-glass: password form stays reachable for admins when local auth is off.
  const [showAdminLogin, setShowAdminLogin] = useState(false);

  // Until /api/auth/methods answers, assume password-only (matches pre-SSO deployments).
  const localEnabled = methods.data?.local ?? true;
  const providers = methods.data?.providers ?? [];
  const showLocalForm = localEnabled || showAdminLogin;

  // Single IdP + no password form → skip the button and go straight to the IdP
  // (?login=local and SSO error callbacks keep an escape hatch to this page).
  const autoSso =
    !!methods.data && !methods.data.local && methods.data.providers.length === 1 &&
    !notice && !showAdminLogin && step === 'login' &&
    !new URLSearchParams(window.location.search).has('login');
  useEffect(() => {
    if (autoSso) window.location.replace(methods.data!.providers[0].startUrl);
  }, [autoSso, methods.data]);

  /** Route a fresh session to the right follow-up step (rotation → enrollment → app). */
  const afterLogin = (user: { mustChangePassword?: boolean; totpEnabled?: boolean }, mfaSetupRequired?: boolean) => {
    const needsEnroll = !!mfaSetupRequired && !user.totpEnabled;
    if (user.mustChangePassword) {
      setEnrollAfterPassword(needsEnroll);
      setStep('password');
      return;
    }
    if (needsEnroll) {
      setStep('enroll');
      return;
    }
    onSuccess();
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    login.mutate({ username: username.trim(), password }, {
      onSuccess: (res) => {
        if ('mfaRequired' in res) {
          setMfaToken(res.mfaToken);
          setStep('mfa');
          return;
        }
        afterLogin(res.user, res.mfaSetupRequired);
      },
      onError: (err) => setError(err instanceof Error ? err.message : 'Login failed'),
    });
  };

  const submitMfa = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    verifyMfa.mutate({ mfaToken, code: mfaCode }, {
      onSuccess: (res) => afterLogin(res.user),
      onError: (err) => setError(err instanceof Error ? err.message : 'Verification failed'),
    });
  };

  const disabled = login.isPending || !username || !password;

  if (autoSso) {
    return (
      <div role="status" className="h-screen flex items-center justify-center" style={{ background: 'var(--color-bg-base)' }}>
        <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
          Redirecting to {methods.data!.providers[0].name}…
        </span>
      </div>
    );
  }

  return (
    <div className="h-screen flex items-center justify-center relative" style={{ background: 'var(--color-bg-base)', overflow: 'hidden' }}>
      {/* Ambient dot-grid + glow */}
      <div className="ambient" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0" aria-hidden="true" style={{
        backgroundImage: 'radial-gradient(700px 420px at 90% 110%, rgba(109,181,138,0.06), transparent 62%)',
      }} />

      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="relative flex flex-col"
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
            <span style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
              {step === 'mfa' ? 'Two-factor verification'
                : step === 'enroll' ? 'Set up two-factor authentication'
                : step === 'password' ? 'Choose a new password'
                : 'Sign in to your workspace'}
            </span>
          </div>
        </div>

        {notice && !error && (
          <div role="status" className="flex items-start gap-2" style={{ fontSize: 12, color: 'var(--color-accent)', fontFamily: 'var(--font-mono)', background: 'var(--color-accent-subtle)', border: '1px solid rgba(124,140,248,0.25)', borderRadius: 'var(--radius-sm)', padding: '8px 10px' }}>
            <Info style={{ width: 14, height: 14, flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
            <span>{notice}</span>
          </div>
        )}

        {step === 'login' && (
          <>
            {showLocalForm && (
              <form onSubmit={submit} method="post" className="flex flex-col" style={{ gap: 16 }}>
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
              </form>
            )}

            {providers.length > 0 && showLocalForm && (
              <div className="flex items-center" style={{ gap: 10 }} aria-hidden="true">
                <div style={{ flex: 1, height: 1, background: 'var(--color-border-subtle)' }} />
                <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>or</span>
                <div style={{ flex: 1, height: 1, background: 'var(--color-border-subtle)' }} />
              </div>
            )}

            {providers.length > 0 && (
              <div className="flex flex-col" style={{ gap: 10 }}>
                {providers.map((p) => <SsoButton key={p.id} provider={p} />)}
              </div>
            )}

            {!localEnabled && !showAdminLogin && (
              <button type="button" onClick={() => setShowAdminLogin(true)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', textDecoration: 'underline', padding: 0 }}>
                Administrator sign-in
              </button>
            )}
          </>
        )}

        {step === 'mfa' && (
          <form onSubmit={submitMfa} className="flex flex-col" style={{ gap: 16 }}>
            <div className="flex items-start gap-2" style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
              <ShieldCheck style={{ width: 15, height: 15, flexShrink: 0, marginTop: 1, color: 'var(--color-accent)' }} aria-hidden="true" />
              <span>Enter the 6-digit code from your authenticator app.</span>
            </div>
            <Field id="login-mfa-code" name="code" label="Verification code" value={mfaCode} onChange={setMfaCode} autoFocus autoComplete="one-time-code" required />
            <button type="submit" disabled={verifyMfa.isPending || mfaCode.length < 6}
              aria-busy={verifyMfa.isPending || undefined}
              className="flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
              style={{
                height: 44, borderRadius: 'var(--radius-md)', border: 'none',
                background: mfaCode.length < 6 ? 'var(--color-bg-raised)' : 'var(--color-accent)',
                color: mfaCode.length < 6 ? 'var(--color-text-disabled)' : '#021526',
                fontWeight: 600, fontSize: 14, cursor: mfaCode.length < 6 ? 'not-allowed' : 'pointer',
              }}>
              {verifyMfa.isPending ? <Loader2 className="animate-spin" style={{ width: 16, height: 16 }} aria-hidden="true" /> : <>Verify <ArrowRight style={{ width: 15, height: 15 }} aria-hidden="true" /></>}
            </button>
            <button type="button" onClick={() => { setStep('login'); setMfaCode(''); setError(''); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', textDecoration: 'underline', padding: 0 }}>
              Back to sign-in
            </button>
          </form>
        )}

        {step === 'password' && (
          <PasswordChangeStep
            currentPassword={password}
            onDone={() => {
              setError('');
              if (enrollAfterPassword) setStep('enroll');
              else onSuccess();
            }}
            onError={setError}
          />
        )}

        {step === 'enroll' && <MfaEnrollStep onDone={() => onSuccess()} onError={setError} />}

        {error && (
          <div role="alert" className="flex items-center gap-2" style={{ fontSize: 12, color: 'var(--color-error)', fontFamily: 'var(--font-mono)', background: 'var(--color-error-subtle)', border: '1px solid rgba(224,96,96,0.25)', borderRadius: 'var(--radius-sm)', padding: '8px 10px' }}>
            <AlertCircle style={{ width: 14, height: 14, flexShrink: 0 }} aria-hidden="true" /> {error}
          </div>
        )}

        <div style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', textAlign: 'center', marginTop: 2 }}>
          Authenticated access · AgenticBEAR
        </div>
      </motion.div>
    </div>
  );
}
