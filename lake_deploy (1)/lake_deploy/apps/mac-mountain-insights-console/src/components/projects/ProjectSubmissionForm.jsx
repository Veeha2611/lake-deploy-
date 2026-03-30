import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Send, AlertCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function ProjectSubmissionForm({ isOpen, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    project_name: '',
    entity: '',
    state: '',
    project_type: 'Infrastructure',
    passings_estimate: '',
    arpu_estimate: '63',
    build_duration_estimate: '',
    notes: '',
    submitted_by: ''
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.project_name || !formData.entity || !formData.passings_estimate) {
      toast.error('Fill required fields: Project Name, Entity, Passings Estimate');
      return;
    }

    setSubmitting(true);
    try {
      const user = await base44.auth.me();
      
      const response = await base44.functions.invoke('submitProjectForReview', {
        submission: {
          ...formData,
          submitted_by: user.email,
          submitted_at: new Date().toISOString(),
          status: 'pending_review'
        }
      });

      if (response.data.success) {
        toast.success('Project submitted for Capital Committee review');
        setFormData({
          project_name: '',
          entity: '',
          state: '',
          project_type: 'Infrastructure',
          passings_estimate: '',
          arpu_estimate: '63',
          build_duration_estimate: '',
          notes: ''
        });
        onSuccess?.();
        onClose();
      } else {
        toast.error(response.data.message || 'Submission failed');
      }
    } catch (error) {
      toast.error('Error submitting project: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-[var(--mac-forest)]">
            Submit Project for Review
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-2">
            Sales / BD: Submit project basics for Capital Committee approval
          </p>
        </DialogHeader>

        <Card className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200">
          <CardContent className="p-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5" />
              <div className="text-sm text-blue-800 dark:text-blue-200">
                <p className="font-semibold">Submission Process</p>
                <p className="text-xs mt-1">
                  Your submission goes to Capital Committee for sanity checks (passings, build rates, take rates, ARPU). 
                  After approval, they'll create the full scenario model.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Project Name *</Label>
              <Input
                value={formData.project_name}
                onChange={(e) => setFormData({...formData, project_name: e.target.value})}
                placeholder="Austin Fiber Build"
              />
            </div>
            <div>
              <Label>Entity *</Label>
              <Select
                value={formData.entity}
                onValueChange={(value) => setFormData({...formData, entity: value})}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select entity..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Mountain Analytics">Mountain Analytics</SelectItem>
                  <SelectItem value="Blueprint">Blueprint</SelectItem>
                  <SelectItem value="GMF">GMF</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>State *</Label>
              <Input
                value={formData.state}
                onChange={(e) => setFormData({...formData, state: e.target.value})}
                placeholder="Texas"
              />
            </div>
            <div>
              <Label>Project Type</Label>
              <Select
                value={formData.project_type}
                onValueChange={(value) => setFormData({...formData, project_type: value})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Infrastructure">Infrastructure</SelectItem>
                  <SelectItem value="Acquisition">Acquisition</SelectItem>
                  <SelectItem value="Joint Venture">Joint Venture</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Passings Estimate *</Label>
              <Input
                type="number"
                value={formData.passings_estimate}
                onChange={(e) => setFormData({...formData, passings_estimate: e.target.value})}
                placeholder="10000"
              />
            </div>
            <div>
              <Label>ARPU Estimate ($)</Label>
              <Input
                type="number"
                value={formData.arpu_estimate}
                onChange={(e) => setFormData({...formData, arpu_estimate: e.target.value})}
                placeholder="63"
              />
            </div>
            <div>
              <Label>Build Duration (months)</Label>
              <Input
                type="number"
                value={formData.build_duration_estimate}
                onChange={(e) => setFormData({...formData, build_duration_estimate: e.target.value})}
                placeholder="18"
              />
            </div>
          </div>

          <div>
            <Label>Notes / Additional Context</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({...formData, notes: e.target.value})}
              placeholder="Key details, partnerships, timeline considerations..."
              className="h-24"
            />
          </div>

          <div className="flex justify-end gap-3 border-t pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={submitting}
              className="bg-[var(--mac-forest)] hover:bg-[var(--mac-dark)]"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              Submit for Review
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}