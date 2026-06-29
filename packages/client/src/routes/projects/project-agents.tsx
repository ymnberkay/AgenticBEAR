import { useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { motion, AnimatePresence } from 'framer-motion';
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

  // If an agent is selected, show split layout (list · detail card · activity card)
  if (selectedAgent) {
    const PANEL: React.CSSProperties = {
      background: 'var(--color-bg-surface)',
      border: '1px solid var(--color-border-subtle)',
      borderRadius: 'var(--radius-lg)',
      padding: '18px 20px',
      overflow: 'hidden',
    };
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="flex gap-5 flex-wrap lg:flex-nowrap"
        style={{ maxWidth: selectedActivity ? 1400 : 760, minHeight: 'calc(100vh - 150px)' }}
      >
        {/* Left: agent list */}
        <div className="flex flex-col gap-6 shrink-0 overflow-y-auto w-full lg:w-[264px]" style={{ paddingRight: 4 }}>
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

        {/* Middle: agent detail card */}
        <motion.div
          key={selectedAgent.id}
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          className="shrink-0 flex flex-col w-full lg:w-[404px]"
          style={PANEL}
        >
          <AgentDetailPanel
            agent={selectedAgent}
            status={statuses[selectedAgent.id] ?? 'idle'}
            onClose={() => { setSelectedAgent(undefined); setSelectedActivity(undefined); }}
            onEdit={() => handleEditAgent(selectedAgent)}
            selectedActivityId={selectedActivity?.id}
            onSelectActivity={(a) => setSelectedActivity(a)}
          />
        </motion.div>

        {/* Right: activity detail card (animated in/out) */}
        <AnimatePresence mode="wait">
          {selectedActivity && (
            <motion.div
              key={selectedActivity.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="flex-1 min-w-0 flex flex-col"
              style={PANEL}
            >
              <ActivityDetailPanel
                activity={selectedActivity}
                agent={selectedAgent}
                onClose={() => setSelectedActivity(undefined)}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <Dialog open={showBuilder} onClose={() => setShowBuilder(false)} maxWidth="880px">
          <AgentBuilder projectId={projectId} agent={editingAgent} onClose={() => setShowBuilder(false)} />
        </Dialog>
      </motion.div>
    );
  }

  return (
    <div className="flex flex-col gap-8" style={{ maxWidth: 760 }}>
      <OrchestratorView
        orchestrator={orchestrator}
        status={orchestrator ? (statuses[orchestrator.id] ?? 'idle') : 'idle'}
        onConfigure={handleConfigureOrchestrator}
      />

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
        maxWidth="880px"
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
