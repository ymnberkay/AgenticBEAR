/**
 * Project goals — high-level objectives the user (or an agent) records so the orchestrator
 * can later pick a subset and execute on it. Distinct from Issues: goals are forward-looking
 * objectives (madde-madde "what we want this project to do"); issues are tracked work / bugs.
 */

export type GoalStatus = 'pending' | 'in_progress' | 'done';
export type GoalPriority = 'low' | 'medium' | 'high' | 'critical';
/** `excel` covers .xlsx / .xls / .csv imports; `agent` is used when an agent files a goal. */
export type GoalSource = 'user' | 'excel' | 'agent';

export interface ProjectGoal {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: GoalStatus;
  priority: GoalPriority;
  /** Sort position within the project. Lower = higher on the list. */
  orderIndex: number;
  source: GoalSource;
  /** Optional due date (ISO date or datetime). */
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateGoalInput {
  title: string;
  description?: string;
  status?: GoalStatus;
  priority?: GoalPriority;
  source?: GoalSource;
  dueDate?: string | null;
}

export interface UpdateGoalInput {
  title?: string;
  description?: string;
  status?: GoalStatus;
  priority?: GoalPriority;
  orderIndex?: number;
  dueDate?: string | null;
}

/** Returned by the bulk-create endpoint after an Excel/CSV import. */
export interface BulkCreateGoalsResult {
  created: number;
  goals: ProjectGoal[];
}
