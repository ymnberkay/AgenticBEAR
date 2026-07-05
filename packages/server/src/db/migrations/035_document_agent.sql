-- Knowledge documents bind to one agent (NULL = legacy project-wide document).
ALTER TABLE project_documents ADD COLUMN agent_id TEXT;
CREATE INDEX IF NOT EXISTS idx_project_documents_agent ON project_documents(agent_id);
