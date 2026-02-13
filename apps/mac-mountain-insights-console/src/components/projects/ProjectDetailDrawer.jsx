import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Loader2, Save, X, HelpCircle, TrendingUp, FileText } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import EconomicsTab from './EconomicsTab';
import ScenarioModelDrawer from './ScenarioModelDrawer';

const STAGES = [
  'Term Sheet / NDA',
  'Project Discussion',
  'Contract Discussion',
  'Final Documents Negotiation',
  'Signed'
];

const PRIORITIES = [
  'Low',
  'Medium',
  'High',
  'Must Win'
];

export default function ProjectDetailDrawer({ isOpen, onClose, project, onSave }) {
  const [formData, setFormData] = useState(project || {});
  const [saving, setSaving] = useState(false);
  const [showScenarioDrawer, setShowScenarioDrawer] = useState(false);

  React.useEffect(() => {
    if (project) {
      setFormData(project);
    }
  }, [project]);

  const handleSave = async () => {
    // Validate required fields (only entity and project_name)
    if (!formData.entity || !formData.project_name) {
      toast.error('Please fill in required fields: Entity and Project Name');
      return;
    }

    setSaving(true);
    try {
      console.log('Saving project update with payload:', { project: formData });
      const response = await base44.functions.invoke('saveProject', {
        project: formData
      });
      console.log('saveProject response:', response);

      if (response.data.success) {
        toast.success(response.data.message || 'Project saved to S3 change-file.');
        onSave?.();
        onClose();
      } else {
        console.error('saveProject failed:', response.data);
        toast.error(response.data.message || response.data.error || 'Failed to save project');
      }
    } catch (error) {
      console.error('saveProject error:', error);
      toast.error('Error saving project: ' + (error.response?.data?.message || error.message));
    } finally {
      setSaving(false);
    }
  };

  if (!project) return null;

  return (
    <>
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-[var(--mac-forest)]">
            {project.project_name}
          </DialogTitle>
          <DialogDescription>
            {project.entity} • {project.project_type}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="details" className="py-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="details" className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Details
            </TabsTrigger>
            <TabsTrigger value="economics" className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Economics
            </TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4">
          {/* Read-only fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">Entity</Label>
              <p className="text-sm font-medium">{project.entity || '-'}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Project Type</Label>
              <p className="text-sm font-medium">{project.project_type || '-'}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">State</Label>
              <p className="text-sm font-medium">{project.state || '-'}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Partner</Label>
              <p className="text-sm font-medium">{project.partner || '-'}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Split %</Label>
              <p className="text-sm font-medium">{project.split_pct || '-'}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Investment Amount</Label>
              <p className="text-sm font-medium">
                {project.investment ? `$${Number(project.investment).toLocaleString()}` : '-'}
              </p>
            </div>
          </div>

          {/* Editable fields */}
          <TooltipProvider>
            <div className="border-t pt-4 space-y-4">
              <h4 className="font-semibold text-sm">Editable Fields</h4>
              
              <div>
                <div className="flex items-center gap-1 mb-2">
                  <Label htmlFor="stage">Stage</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Where this project sits in the pipeline: Term Sheet, Project Discussion, Contract Discussion, Final Docs, or Signed</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Select 
                  value={formData.stage || ''} 
                  onValueChange={(val) => setFormData({...formData, stage: val})}
                >
                  <SelectTrigger id="stage">
                    <SelectValue placeholder="Select stage" />
                  </SelectTrigger>
                  <SelectContent>
                    {STAGES.map(stage => (
                      <SelectItem key={stage} value={stage}>{stage}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <div className="flex items-center gap-1 mb-2">
                  <Label htmlFor="priority">Priority</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>How important is this project? Low, Medium, High, or Must Win</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Select 
                  value={formData.priority || ''} 
                  onValueChange={(val) => setFormData({...formData, priority: val})}
                >
                  <SelectTrigger id="priority">
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map(priority => (
                      <SelectItem key={priority} value={priority}>{priority}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <div className="flex items-center gap-1 mb-2">
                  <Label htmlFor="owner">Owner</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Person who is on the hook to move this forward. Usually one person, not a team</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Input
                  id="owner"
                  value={formData.owner || ''}
                  onChange={(e) => setFormData({...formData, owner: e.target.value})}
                  placeholder="e.g., Sarah Johnson"
                />
              </div>

              <div>
                <div className="flex items-center gap-1 mb-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Anything future you or a teammate would want to remember in one or two sentences</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Textarea
                  id="notes"
                  value={formData.notes || ''}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  placeholder="Add any important details or context..."
                  rows={4}
                />
              </div>
            </div>
          </TooltipProvider>
          </TabsContent>

          <TabsContent value="economics">
            <div className="space-y-4 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">Financial Modeling</h3>
                  <p className="text-sm text-muted-foreground">
                    Create and compare multiple scenarios
                  </p>
                </div>
                <Button
                  onClick={() => setShowScenarioDrawer(true)}
                  className="bg-[var(--mac-forest)] hover:bg-[var(--mac-dark)]"
                >
                  Generate Model
                </Button>
              </div>
              <EconomicsTab 
                project={project} 
                onOpenScenarioDrawer={() => setShowScenarioDrawer(true)} 
              />
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-3 border-t pt-4">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            <X className="w-4 h-4 mr-2" />
            Cancel
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={saving}
            className="bg-[var(--mac-forest)] hover:bg-[var(--mac-dark)]"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    <ScenarioModelDrawer
      isOpen={showScenarioDrawer}
      onClose={() => setShowScenarioDrawer(false)}
      projectId={project?.project_id}
      projectName={project?.project_name}
      defaultTab="inputs"
    />
  </>
  );
}
