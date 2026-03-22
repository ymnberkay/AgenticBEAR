import { useState } from 'react';
import { useParams } from '@tanstack/react-router';
import type { Agent } from '@subagent/shared';
import { useAgents } from '../../api/hooks/use-agents';
import { OrchestratorView } from '../../components/agents/orchestrator-view';
import { AgentList } from '../../components/agents/agent-list';
import { AgentBuilder } from '../../components/agents/agent-builder';
import { Dialog } from '../../components/ui/dialog';
import { useSelectionStore } from '../../stores/selection.store';

export function ProjectAgentsPage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const { data: agents, isLoading } = useAgents(projectId);
  const selectAgent = useSelectionStore((s) => s.selectAgent);

  const [showBuilder, setShowBuilder] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | undefined>(undefined);

  const orchestrator = agents?.find((a) => a.role === 'orchestrator');

  const handleAddAgent = () => {
    setEditingAgent(undefined);
    setShowBuilder(true);
  };

  const handleSelectAgent = (agent: Agent) => {
    selectAgent(agent.id);
    setEditingAgent(agent);
    setShowBuilder(true);
  };

  const handleConfigureOrchestrator = () => {
    if (orchestrator) {
      setEditingAgent(orchestrator);
    } else {
      setEditingAgent(undefined);
    }
    setShowBuilder(true);
  };

  return (
    <div className="flex flex-col gap-4">
      <OrchestratorView
        orchestrator={orchestrator}
        onConfigure={handleConfigureOrchestrator}
      />

      <div className="h-px bg-bg-raised" />

      <AgentList
        agents={agents}
        isLoading={isLoading}
        onAddAgent={handleAddAgent}
        onSelectAgent={handleSelectAgent}
      />

      <Dialog
        open={showBuilder}
        onClose={() => setShowBuilder(false)}
        maxWidth="640px"
      >
        <AgentBuilder
          projectId={projectId}
          agent={editingAgent}
          onClose={() => setShowBuilder(false)}
        />
      </Dialog>
    </div>
  );
}
