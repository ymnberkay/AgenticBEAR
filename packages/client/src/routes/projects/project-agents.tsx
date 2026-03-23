import { useState } from 'react';
import { useParams } from '@tanstack/react-router';
import type { Agent } from '@subagent/shared';
import { useAgents } from '../../api/hooks/use-agents';
import { OrchestratorView } from '../../components/agents/orchestrator-view';
import { AgentList } from '../../components/agents/agent-list';
import { AgentBuilder } from '../../components/agents/agent-builder';
import { AgentDetailPanel } from '../../components/agents/agent-detail-panel';
import { Dialog } from '../../components/ui/dialog';
import { useAgentStatus } from '../../hooks/use-agent-status';
import { useAgentStatusStore } from '../../stores/agent-status.store';

export function ProjectAgentsPage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const { data: agents, isLoading } = useAgents(projectId);
  const statuses = useAgentStatusStore((s) => s.statuses);

  const [showBuilder, setShowBuilder] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | undefined>(undefined);
  const [selectedAgent, setSelectedAgent] = useState<Agent | undefined>(undefined);

  useAgentStatus(projectId);

  const orchestrator = agents?.find((a) => a.role === 'orchestrator');

  const handleAddAgent = () => {
    setEditingAgent(undefined);
    setShowBuilder(true);
  };

  const handleEditAgent = (agent: Agent) => {
    setEditingAgent(agent);
    setShowBuilder(true);
  };

  const handleViewAgent = (agent: Agent) => {
    setSelectedAgent(agent);
  };

  const handleConfigureOrchestrator = () => {
    if (orchestrator) {
      setEditingAgent(orchestrator);
    } else {
      setEditingAgent(undefined);
    }
    setShowBuilder(true);
  };

  // If an agent is selected, show split layout
  if (selectedAgent) {
    return (
      <div className="flex gap-8 max-w-5xl">
        {/* Left: agent list (narrower) */}
        <div className="flex flex-col gap-10 w-[320px] shrink-0">
          <OrchestratorView
            orchestrator={orchestrator}
            status={orchestrator ? (statuses[orchestrator.id] ?? 'idle') : 'idle'}
            onConfigure={handleConfigureOrchestrator}
          />

          <div className="h-px" style={{ background: 'var(--color-border-subtle)' }} />

          <AgentList
            agents={agents}
            isLoading={isLoading}
            agentStatuses={statuses}
            selectedAgentId={selectedAgent.id}
            onAddAgent={handleAddAgent}
            onViewAgent={handleViewAgent}
            onEditAgent={handleEditAgent}
          />
        </div>

        {/* Right: agent detail panel */}
        <div
          className="flex-1 min-w-0"
          style={{
            borderLeft: '1px solid var(--color-border-subtle)',
            paddingLeft: '32px',
          }}
        >
          <AgentDetailPanel
            agent={selectedAgent}
            status={statuses[selectedAgent.id] ?? 'idle'}
            onClose={() => setSelectedAgent(undefined)}
            onEdit={() => handleEditAgent(selectedAgent)}
          />
        </div>

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

  return (
    <div className="flex flex-col gap-10 max-w-3xl">
      <OrchestratorView
        orchestrator={orchestrator}
        status={orchestrator ? (statuses[orchestrator.id] ?? 'idle') : 'idle'}
        onConfigure={handleConfigureOrchestrator}
      />

      <div className="h-px" style={{ background: 'var(--color-border-subtle)' }} />

      <AgentList
        agents={agents}
        isLoading={isLoading}
        agentStatuses={statuses}
        onAddAgent={handleAddAgent}
        onViewAgent={handleViewAgent}
        onEditAgent={handleEditAgent}
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
