import type { ModelConfig } from '@subagent/shared';
import { useModelOptions, encodeModelValue, decodeModelValue } from '../../hooks/use-model-options';

interface ModelConfigFormProps {
  config: ModelConfig;
  onChange: (config: ModelConfig) => void;
}

export function ModelConfigForm({ config, onChange }: ModelConfigFormProps) {
  const groups = useModelOptions();
  const currentValue = encodeModelValue(config.model, config.providerId);
  const currentModel = groups.flatMap((g) => g.options).find((o) => o.value === currentValue);

  return (
    <div>
      <h3
        style={{
          fontSize: '10px',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--color-text-disabled)',
          marginBottom: '10px',
        }}
      >
        Model Configuration
      </h3>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label
            style={{
              fontSize: '12.5px',
              fontWeight: 600,
              color: 'var(--color-text-secondary)',
            }}
          >
            Model
          </label>
          <div className="relative">
            <select
              value={currentValue}
              onChange={(e) => {
                const { model, providerId } = decodeModelValue(e.target.value);
                // Send null (not undefined) for built-ins so the server merge CLEARS any stale
                // custom providerId — otherwise a Claude model would keep an old Azure/etc. provider.
                onChange({ ...config, model, providerId: providerId ?? null });
              }}
              className="w-full appearance-none pr-8 focus:outline-none transition-all duration-200"
              style={{
                height: '40px',
                padding: '0 12px',
                fontSize: '13px',
                color: 'var(--color-text-primary)',
                background: 'var(--glass-bg)',
                border: '1px solid var(--color-border-default)',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'rgba(110, 172, 218, 0.5)';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(110, 172, 218, 0.1)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-border-default)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              {groups.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <div
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
        </div>

        {currentModel && (
          <div
            className="flex items-center gap-3"
            style={{ fontSize: '10px', color: 'var(--color-text-disabled)', paddingLeft: '2px' }}
          >
            {currentModel.contextWindow ? (
              <>
                <span>Context: {(currentModel.contextWindow / 1000).toFixed(0)}K tokens</span>
                <span style={{ color: 'var(--color-border-subtle)' }}>·</span>
              </>
            ) : null}
            <span>Input: ${currentModel.costPer1kInput ?? 0}/1K</span>
            <span style={{ color: 'var(--color-border-subtle)' }}>·</span>
            <span>Output: ${currentModel.costPer1kOutput ?? 0}/1K</span>
          </div>
        )}
      </div>
    </div>
  );
}
