import { useState } from 'react';
import { ShieldCheck, ShieldOff, Copy, Check } from 'lucide-react';
import type { MfaSetupInfo } from '@subagent/shared';
import { Dialog } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { useMe, useMfaSetup, useMfaEnable, useMfaDisable } from '../../api/hooks/use-auth';

/**
 * Self-service TOTP management (user menu → "Two-factor auth"):
 * not enrolled → generate secret, add to authenticator, confirm with a code;
 * enrolled → status + disable (requires a current code).
 */
export function TwoFactorDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const me = useMe();
  const setup = useMfaSetup();
  const enable = useMfaEnable();
  const disable = useMfaDisable();
  const [pending, setPending] = useState<MfaSetupInfo | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const enrolled = !!me.data?.totpEnabled;

  const close = () => {
    setPending(null);
    setCode('');
    setError('');
    onClose();
  };

  const start = () => {
    setError('');
    setup.mutate(undefined, {
      onSuccess: (info) => setPending(info),
      onError: (err) => setError(err instanceof Error ? err.message : 'Setup failed'),
    });
  };

  const confirm = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    enable.mutate(code, {
      onSuccess: () => close(),
      onError: (err) => setError(err instanceof Error ? err.message : 'Invalid code'),
    });
  };

  const turnOff = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    disable.mutate(code, {
      onSuccess: () => close(),
      onError: (err) => setError(err instanceof Error ? err.message : 'Invalid code'),
    });
  };

  const copySecret = () => {
    if (!pending) return;
    void navigator.clipboard.writeText(pending.secret).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <Dialog open={open} onClose={close} title="Two-factor authentication" maxWidth="440px">
      <div className="flex flex-col" style={{ gap: 14 }}>
        {enrolled && !pending ? (
          <form onSubmit={turnOff} className="flex flex-col" style={{ gap: 14 }}>
            <div className="flex items-start gap-2" style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
              <ShieldCheck style={{ width: 16, height: 16, flexShrink: 0, marginTop: 1, color: 'var(--color-success)' }} aria-hidden="true" />
              <span>Two-factor authentication is <strong style={{ color: 'var(--color-text-primary)' }}>enabled</strong>. Sign-ins with your password ask for a code from your authenticator app.</span>
            </div>
            <Input label="Current code (to disable)" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" placeholder="123 456" />
            {error && <div role="alert" style={{ fontSize: 12, color: 'var(--color-error)', fontFamily: 'var(--font-mono)' }}>{error}</div>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
              <Button type="submit" variant="danger" loading={disable.isPending} icon={<ShieldOff style={{ width: 14, height: 14 }} aria-hidden="true" />}>
                Disable 2FA
              </Button>
            </div>
          </form>
        ) : !pending ? (
          <>
            <div style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
              Protect your account with time-based one-time codes (Google Authenticator, Authy, 1Password…). You will be asked for a code after entering your password.
            </div>
            {error && <div role="alert" style={{ fontSize: 12, color: 'var(--color-error)', fontFamily: 'var(--font-mono)' }}>{error}</div>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
              <Button type="button" variant="primary" loading={setup.isPending} onClick={start}>Set up 2FA</Button>
            </div>
          </>
        ) : (
          <form onSubmit={confirm} className="flex flex-col" style={{ gap: 14 }}>
            <div style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
              Add this key to your authenticator app, then confirm with the 6-digit code it shows.
            </div>
            <div className="flex items-center gap-2" style={{
              padding: '10px 12px', background: 'var(--color-bg-base)', border: '1px solid var(--color-border-default)',
              borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-mono)', fontSize: 12.5, wordBreak: 'break-all',
            }}>
              <span style={{ flex: 1, color: 'var(--color-text-primary)' }}>{pending.secret}</span>
              <button type="button" onClick={copySecret} aria-label="Copy secret"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? 'var(--color-success)' : 'var(--color-text-secondary)', padding: 4 }}>
                {copied ? <Check style={{ width: 14, height: 14 }} aria-hidden="true" /> : <Copy style={{ width: 14, height: 14 }} aria-hidden="true" />}
              </button>
            </div>
            <a href={pending.otpauthUrl} style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--color-accent)' }}>
              Open in authenticator app
            </a>
            <Input label="Verification code" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" placeholder="123 456" autoFocus required />
            {error && <div role="alert" style={{ fontSize: 12, color: 'var(--color-error)', fontFamily: 'var(--font-mono)' }}>{error}</div>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
              <Button type="submit" variant="primary" loading={enable.isPending} disabled={code.replace(/\s/g, '').length < 6}>Activate</Button>
            </div>
          </form>
        )}
      </div>
    </Dialog>
  );
}
