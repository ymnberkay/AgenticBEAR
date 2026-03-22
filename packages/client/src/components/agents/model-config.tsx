import type { ModelConfig, ClaudeModel } from '@subagent/shared';
import { CLAUDE_MODELS } from '@subagent/shared';
import { Select } from '../ui/select';
import { Input } from '../ui/input';

interface ModelConfigFormProps {
  config: ModelConfig;
  onChange: (config: ModelConfig) => void;
}

export function ModelConfigForm({ config, onChange }: ModelConfigFormProps) {
  const models = Object.entries(CLAUDE_MODELS) as [ClaudeModel, (typeof CLAUDE_MODELS)[ClaudeModel]][];
  const currentModel = CLAUDE_MODELS[config.model];

  return (
    <div>
      <h3 className="text-[10px] font-medium uppercase text-text-tertiary tracking-[0.08em] mb-3">Model Configuration</h3>

      <div className="flex flex-col gap-3">
        <Select
          label="Model"
          value={config.model}
          onChange={(e) =>
            onChange({ ...config, model: e.target.value as ClaudeModel })
          }
        >
          {models.map(([key, info]) => (
            <option key={key} value={key}>
              {info.label}
            </option>
          ))}
        </Select>

        {currentModel && (
          <div className="flex items-center gap-2.5 text-[10px] text-text-tertiary px-1">
            <span>Context: {(currentModel.contextWindow / 1000).toFixed(0)}K tokens</span>
            <span>Input: ${currentModel.costPer1kInput}/1K</span>
            <span>Output: ${currentModel.costPer1kOutput}/1K</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Max Tokens"
            type="number"
            value={config.maxTokens}
            onChange={(e) =>
              onChange({ ...config, maxTokens: parseInt(e.target.value) || 0 })
            }
            min={1}
            max={200000}
          />

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium uppercase text-text-tertiary tracking-[0.08em]">
              Temperature: {config.temperature.toFixed(1)}
            </label>
            <div className="flex items-center gap-2 h-7">
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={config.temperature}
                onChange={(e) =>
                  onChange({ ...config, temperature: parseFloat(e.target.value) })
                }
                className="w-full h-1 appearance-none rounded-full bg-bg-raised accent-[#00d4ff] cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#00d4ff]"
              />
            </div>
            <div className="flex justify-between text-[10px] text-text-tertiary">
              <span>Precise</span>
              <span>Creative</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
