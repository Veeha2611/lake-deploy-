import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Play } from 'lucide-react';

export default function ModelInputModal({ isOpen, onClose, onSubmit, projectId, generating, error }) {
  const [formData, setFormData] = useState({
    passings: '',
    buildmonths: ''
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.passings || !formData.buildmonths) {
      return;
    }

    await onSubmit({
      passings: Number(formData.passings),
      buildmonths: Number(formData.buildmonths)
    });
    
    // Reset form only if no error (parent will close modal on success)
    if (!error) {
      setFormData({ passings: '', buildmonths: '' });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-[var(--mac-forest)]">
            Generate Financial Report
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {error && (
            <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-800 dark:text-red-200">
              {error}
            </div>
          )}

          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              Enter the minimum required inputs to generate a financial model. All other parameters will use intelligent defaults.
            </p>
          </div>

          <div>
            <Label htmlFor="passings">Total Controlled Lots (Passings) *</Label>
            <Input
              id="passings"
              type="number"
              min="1"
              value={formData.passings}
              onChange={(e) => setFormData({...formData, passings: e.target.value})}
              placeholder="e.g., 500"
              required
              disabled={generating}
              className="mt-2"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Total number of homes or lots that will be passed by infrastructure
            </p>
          </div>

          <div>
            <Label htmlFor="buildmonths">Build Months *</Label>
            <Input
              id="buildmonths"
              type="number"
              min="1"
              max="120"
              value={formData.buildmonths}
              onChange={(e) => setFormData({...formData, buildmonths: e.target.value})}
              placeholder="e.g., 18"
              required
              disabled={generating}
              className="mt-2"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Number of months to complete the build-out (max 120)
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose} disabled={generating}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={generating || !formData.passings || !formData.buildmonths}
              className="bg-[var(--mac-forest)] hover:bg-[var(--mac-dark)]"
            >
              {generating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Play className="w-4 h-4 mr-2" />
              )}
              Run Model
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}