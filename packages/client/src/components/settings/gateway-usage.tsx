import { useState } from 'react';
import { Zap } from 'lucide-react';
import { useGatewayUsage, useGatewayKeys } from '../../api/hooks/use-gateway';
import type { AnalyticsRange } from '../../api/hooks/use-analytics';
import { Section, Stat, FilterSelect, money, fmtTokens } from './ui';

/** External gateway (API-key) usage — filterable by key and model. */
export function GatewayUsage({ range }: { range: AnalyticsRange }) {
  const [keyId, setKeyId] = useState('all');
  const [model, setModel] = useState('all');

  // Unfiltered (range only) → builds the model dropdown + ensures the key list is stable.
  const base = useGatewayUsage({ range });
  // Filtered view actually shown.
  const { data } = useGatewayUsage({
    range,
    keyId: keyId === 'all' ? undefined : keyId,
    model: model === 'all' ? undefined : model,
  });
  const { data: keys } = useGatewayKeys();

  const keyName = (id: string) => (id === '(none)' ? '(open / no key)' : keys?.find((k) => k.id === id)?.name || id.slice(0, 8));
  const keyOptions = [
    { value: 'all', label: 'all keys' },
    ...(base.data?.byKey ?? []).map((b) => ({ value: b.key, label: keyName(b.key) })),
  ];
  const modelOptions = [
    { value: 'all', label: 'all models' },
    ...(base.data?.byModel ?? []).map((b) => ({ value: b.key, label: b.label })),
  ];

  return (
    <Section
      icon={<Zap style={{ width: 13, height: 13 }} />} color="#e2b04a" title="Gateway — External Apps"
      action={
        <div className="flex items-center gap-2">
          <FilterSelect value={keyId} onChange={setKeyId} options={keyOptions} />
          <FilterSelect value={model} onChange={setModel} options={modelOptions} />
        </div>
      }
    >
      {!data || data.totalRequests === 0 ? (
        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>No gateway calls for this filter.</span>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-6">
            <Stat label="requests" value={String(data.totalRequests)} />
            <Stat label="in" value={fmtTokens(data.totalInputTokens)} />
            <Stat label="out" value={fmtTokens(data.totalOutputTokens)} />
            <Stat label="cost" value={money(data.totalCostUsd)} />
            <Stat label="saved" value={money(data.savedUsd)} color={data.savedUsd > 0 ? '#6db58a' : undefined} />
          </div>

          <div>
            <div style={{ fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', marginBottom: 6 }}>by model</div>
            <div className="flex flex-col gap-1">
              {data.byModel.map((m) => (
                <div key={m.key} className="flex items-center justify-between" style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
                  <code style={{ wordBreak: 'break-all', color: 'var(--color-text-primary)' }}>{m.label}</code>
                  <span style={{ flexShrink: 0 }}>{m.requests} · ↑{fmtTokens(m.inputTokens)} ↓{fmtTokens(m.outputTokens)} · {money(m.costUsd)}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', marginBottom: 6 }}>by key</div>
            <div className="flex flex-col gap-1">
              {data.byKey.map((k) => (
                <div key={k.key} className="flex items-center justify-between" style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
                  <span style={{ color: 'var(--color-text-primary)' }}>{keyName(k.key)}</span>
                  <span style={{ flexShrink: 0 }}>{k.requests} · ↑{fmtTokens(k.inputTokens)} ↓{fmtTokens(k.outputTokens)} · {money(k.costUsd)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Section>
  );
}
