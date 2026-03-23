import { useState } from 'react';
import { useParams } from '@tanstack/react-router';
import type { Agent, AgentActivity } from '@subagent/shared';
import { useAgents } from '../../api/hooks/use-agents';
import { OrchestratorView } from '../../components/agents/orchestrator-view';
import { AgentList } from '../../components/agents/agent-list';
import { AgentBuilder } from '../../components/agents/agent-builder';
import { AgentDetailPanel, ActivityDetailPanel } from '../../components/agents/agent-detail-panel';
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
  const [selectedActivity, setSelectedActivity] = useState<AgentActivity | undefined>(undefined);

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
    setSelectedActivity(undefined);
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
      <div className="flex gap-8" style={{ maxWidth: selectedActivity ? '1200px' : '900px' }}>
        {/* Left: agent list (narrower) */}
        <div className="flex flex-col gap-6 w-[280px] shrink-0">
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

        {/* Middle: agent detail panel */}
        <div
          style={{
            width: '340px',
            flexShrink: 0,
            borderLeft: '1px solid var(--color-border-subtle)',
            paddingLeft: '32px',
          }}
        >
          <AgentDetailPanel
            agent={selectedAgent}
            status={statuses[selectedAgent.id] ?? 'idle'}
            onClose={() => { setSelectedAgent(undefined); setSelectedActivity(undefined); }}
            onEdit={() => handleEditAgent(selectedAgent)}
            selectedActivityId={selectedActivity?.id}
            onSelectActivity={(a) => setSelectedActivity(a)}
          />
        </div>

        {/* Right: activity detail panel */}
        {selectedActivity && (
          <div
            style={{
              flex: 1,
              minWidth: 0,
              borderLeft: '1px solid var(--color-border-subtle)',
              paddingLeft: '32px',
            }}
          >
            <ActivityDetailPanel
              activity={selectedActivity}
              agent={selectedAgent}
              onClose={() => setSelectedActivity(undefined)}
            />
          </div>
        )}

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
