import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { PromptTemplate } from '@subagent/shared';
import { useTemplates } from '../api/hooks/use-templates';
import { TemplateList } from '../components/templates/template-list';
import { TemplateEditor } from '../components/templates/template-editor';
import { Dialog } from '../components/ui/dialog';
import { Button } from '../components/ui/button';

export function TemplatesPage() {
  const { data: templates, isLoading } = useTemplates();
  const [showEditor, setShowEditor] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<PromptTemplate | undefined>();

  const handleSelect = (template: PromptTemplate) => {
    setEditingTemplate(template);
    setShowEditor(true);
  };

  const handleCreate = () => {
    setEditingTemplate(undefined);
    setShowEditor(true);
  };

  return (
    <div className="h-full overflow-y-auto w-full">
    <div className="px-6 py-8 pr-8">
      <div className="flex items-end justify-between mb-8" style={{ borderBottom: '1px solid var(--color-border-subtle)', paddingBottom: '20px' }}>
        <div>
          <h1 className="text-[18px] font-semibold text-text-primary tracking-tight">Templates</h1>
          <p className="text-[12px] text-text-secondary mt-1">
            Reusable prompt templates for your agents
          </p>
        </div>
        <Button
          variant="primary"
          icon={<Plus className="h-3.5 w-3.5" />}
          onClick={handleCreate}
        >
          New Template
        </Button>
      </div>

      <TemplateList
        templates={templates}
        isLoading={isLoading}
        onSelect={handleSelect}
      />

      <Dialog
        open={showEditor}
        onClose={() => setShowEditor(false)}
        maxWidth="680px"
      >
        <TemplateEditor
          template={editingTemplate}
          onClose={() => setShowEditor(false)}
        />
      </Dialog>
    </div>
    </div>
  );
}
