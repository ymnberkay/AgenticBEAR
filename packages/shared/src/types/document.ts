/** A project knowledge document — injected into agent context so agents share project knowledge. */
export interface ProjectDocument {
  id: string;
  projectId: string;
  name: string;
  content: string;
  createdAt: string;
}

export interface CreateProjectDocumentInput {
  name: string;
  content: string;
}
