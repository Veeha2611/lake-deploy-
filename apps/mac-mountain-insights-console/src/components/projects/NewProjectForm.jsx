import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Loader2, Plus, X, HelpCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

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

export default function NewProjectForm({ isOpen, onClose, onSuccess, onOpenModel }) {
  const [formData, setFormData] = useState({
    entity: '',
    project_name: '',
    project_type: '',
    state: '',
    partner: '',
    split_pct: '',
    stage: '',
    priority: '',
    owner: '',
    notes: ''
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate required fields (only entity and project_name required)
    if (!formData.entity || !formData.project_name) {
      toast.error('Please fill in all required fields: Entity and Project Name');
      return;
    }

    setSaving(true);
    try {
      console.log('Sending saveProject request with payload:', { project: formData });
      const response = await base44.functions.invoke('saveProject', {
        project: formData
      });
      console.log('saveProject response:', response);

      if (response.data.success) {
        const projectId = response.data.project_id;
        const projectName = formData.project_name;
        toast.success(response.data.message || 'Project saved to S3 change-file.');
        onSuccess?.();
        onClose();
        setFormData({
          entity: '',
          project_name: '',
          project_type: '',
          state: '',
          partner: '',
          split_pct: '',
          stage: '',
          priority: '',
          owner: '',
          notes: ''
        });
        
        // Prompt to generate model
        setTimeout(() => {
          const shouldGenerate = window.confirm('Project created successfully!\n\nWould you like to generate a financial model now?');
          if (shouldGenerate && onOpenModel) {
            onOpenModel(projectId, projectName);
          }
        }, 500);
      } else {
        console.error('saveProject failed:', response.data);
        toast.error(response.data.message || response.data.error || 'Failed to create project');
      }
    } catch (error) {
      console.error('saveProject error:', error);
      toast.error('Error creating project: ' + (error.response?.data?.message || error.message));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-[var(--mac-forest)]">
            New Project
          </DialogTitle>
        </DialogHeader>

        <TooltipProvider>
          <form onSubmit={handleSubmit} className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="flex items-center gap-1 mb-2">
                  <Label htmlFor="entity">Entity *</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Business entity or division (e.g., Blueprint, GMF, GWI, Mountain Analytics)</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Input
                  id="entity"
                  value={formData.entity}
                  onChange={(e) => setFormData({...formData, entity: e.target.value})}
                  placeholder="e.g., Mountain Analytics"
                  required
                />
              </div>

              <div>
                <div className="flex items-center gap-1 mb-2">
                  <Label htmlFor="project_name">Project Name *</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Short, human-readable name for this project. Example: "Stowe – Fiber build phase 1"</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Input
                  id="project_name"
                  value={formData.project_name}
                  onChange={(e) => setFormData({...formData, project_name: e.target.value})}
                  placeholder="e.g., Denver Fiber Expansion"
                  required
                />
              </div>

              <div>
               <div className="flex items-center gap-1 mb-2">
                 <Label htmlFor="project_type">Project Type *</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>What kind of work is this? Examples: "Investment", "Infrastructure", "Mac Mountain – IPv4", "GWI – Lake Feature"</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Input
                  id="project_type"
                  value={formData.project_type}
                  onChange={(e) => setFormData({...formData, project_type: e.target.value})}
                  placeholder="e.g., Infrastructure"
                  required
                />
              </div>

              <div>
               <div className="flex items-center gap-1 mb-2">
                 <Label htmlFor="state">State *</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Geographic state or location where this project takes place</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Input
                  id="state"
                  value={formData.state}
                  onChange={(e) => setFormData({...formData, state: e.target.value})}
                  placeholder="e.g., Colorado"
                  required
                />
              </div>

              <div>
                <div className="flex items-center gap-1 mb-2">
                  <Label htmlFor="partner">Partner</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Partner or co-investor name (if applicable)</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Input
                  id="partner"
                  value={formData.partner}
                  onChange={(e) => setFormData({...formData, partner: e.target.value})}
                  placeholder="e.g., Mountain Fiber Partners"
                />
              </div>

              <div>
                <div className="flex items-center gap-1 mb-2">
                  <Label htmlFor="split_pct">Split %</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Partner ownership percentage or revenue share (e.g., "30%", "50/50", "Mac 70%, Partner 30%")</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Input
                  id="split_pct"
                  value={formData.split_pct}
                  onChange={(e) => setFormData({...formData, split_pct: e.target.value})}
                  placeholder="e.g., 30%"
                />
              </div>

              <div>
               <div className="flex items-center gap-1 mb-2">
                 <Label htmlFor="stage">Stage *</Label>
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
                  value={formData.stage} 
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
                 <Label htmlFor="priority">Priority *</Label>
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
                  value={formData.priority} 
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

              <div className="col-span-2">
               <div className="flex items-center gap-1 mb-2">
                 <Label htmlFor="owner">Owner *</Label>
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
                  value={formData.owner}
                  onChange={(e) => setFormData({...formData, owner: e.target.value})}
                  placeholder="e.g., Sarah Johnson"
                  required
                />
              </div>

              <div className="col-span-2">
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
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  placeholder="Add any important details or context..."
                  rows={3}
                />
              </div>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-xs">
              <p className="text-blue-800 dark:text-blue-200">
                After saving, you can generate a model immediately. If the Projects list is waiting on ETL, you'll still see your saved file in "Update History."
              </p>
            </div>

            <div className="flex justify-end gap-3 border-t pt-4">
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={saving}
                className="bg-[var(--mac-forest)] hover:bg-[var(--mac-dark)]"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4 mr-2" />
                )}
                Create Project
              </Button>
            </div>
          </form>
        </TooltipProvider>
      </DialogContent>
    </Dialog>
  );
}
