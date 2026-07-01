import { useState, useEffect, useMemo } from 'react';
import { Building2 } from 'lucide-react';
import { useSettings, useUpdateSettings } from '../../api/hooks/use-settings';
import { useToast } from '../ui/toast';
import { Section, inputStyle } from './ui';

function Field({ label, helper, children }: { label: string; helper?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>{label}</label>
      {children}
      {helper && <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>{helper}</span>}
    </div>
  );
}

/** Organization profile — general info about this AgenticBEAR organization. */
export function GeneralTab({ onSaved }: { onSaved?: (msg: string) => void } = {}) {
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const { show: showToast } = useToast();

  const [orgName, setOrgName] = useState('');
  const [orgDescription, setOrgDescription] = useState('');
  const [orgContact, setOrgContact] = useState('');
  const [orgWebsite, setOrgWebsite] = useState('');

  useEffect(() => {
    if (settings) {
      setOrgName(settings.orgName ?? '');
      setOrgDescription(settings.orgDescription ?? '');
      setOrgContact(settings.orgContact ?? '');
      setOrgWebsite(settings.orgWebsite ?? '');
    }
  }, [settings]);

  const dirty = useMemo(() => !!settings && (
    orgName !== (settings.orgName ?? '') ||
    orgDescription !== (settings.orgDescription ?? '') ||
    orgContact !== (settings.orgContact ?? '') ||
    orgWebsite !== (settings.orgWebsite ?? '')
  ), [settings, orgName, orgDescription, orgContact, orgWebsite]);

  const save = () =>
    updateSettings.mutate(
      { orgName: orgName.trim(), orgDescription, orgContact: orgContact.trim(), orgWebsite: orgWebsite.trim() },
      {
        onSuccess: () => onSaved?.('Organization profile saved'),
        onError: (err) => showToast(err instanceof Error ? err.message : 'Failed to save', { variant: 'error' }),
      },
    );

  const saveBtn = (
    <button
      type="button"
      onClick={save}
      disabled={!dirty || updateSettings.isPending}
      style={{ height: 28, padding: '0 14px', fontSize: 11.5, fontFamily: 'var(--font-sans)', fontWeight: 600, color: dirty ? '#021526' : 'var(--color-text-disabled)', background: dirty ? 'var(--color-accent)' : 'var(--color-bg-raised)', border: 'none', borderRadius: 'var(--radius-md)', cursor: dirty ? 'pointer' : 'default' }}
    >
      {updateSettings.isPending ? 'Saving…' : dirty ? 'Save' : 'Saved'}
    </button>
  );

  return (
    <div className="flex flex-col gap-3">
      <Section icon={<Building2 style={{ width: 13, height: 13 }} />} color="#7c8cf8" title="Organization" action={saveBtn}>
        <div className="flex flex-col gap-5">
          <Field label="Organization name" helper="Shown across the app for this organization.">
            <input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="e.g. Acme Engineering" style={inputStyle} />
          </Field>
          <Field label="Description" helper="A short description of what this organization does.">
            <textarea value={orgDescription} onChange={(e) => setOrgDescription(e.target.value)} placeholder="What does your team build?" rows={3}
              style={{ ...inputStyle, height: 'auto', padding: '8px 10px', resize: 'vertical', fontFamily: 'var(--font-sans)' }} />
          </Field>
          <div className="flex flex-col gap-5 sm:flex-row" style={{ gap: 20 }}>
            <div style={{ flex: 1 }}>
              <Field label="Contact email" helper="Primary contact / owner.">
                <input type="email" value={orgContact} onChange={(e) => setOrgContact(e.target.value)} placeholder="team@acme.dev" style={inputStyle} />
              </Field>
            </div>
            <div style={{ flex: 1 }}>
              <Field label="Website" helper="Optional org/website URL.">
                <input value={orgWebsite} onChange={(e) => setOrgWebsite(e.target.value)} placeholder="https://acme.dev" style={inputStyle} />
              </Field>
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}
