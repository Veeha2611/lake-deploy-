import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, ArrowRight } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function ProjectSubmissionsQueue({ isOpen, onClose }) {
  const [promoting, setPromoting] = useState(null);
  const queryClient = useQueryClient();

  // Fetch submissions
  const { data: submissions, isLoading } = useQuery({
    queryKey: ['project-submissions'],
    queryFn: async () => {
      const response = await base44.functions.invoke('listProjectSubmissions');
      return response.data.submissions || [];
    },
    enabled: isOpen
  });

  const handlePromote = async (submission) => {
    setPromoting(submission.submission_id);
    try {
      const response = await base44.functions.invoke('promoteSubmissionToProject', {
        submission_id: submission.submission_id,
        submission
      });

      if (response.data.success) {
        toast.success('Project promoted successfully!');
        queryClient.invalidateQueries({ queryKey: ['project-submissions'] });
        queryClient.invalidateQueries({ queryKey: ['projects'] });
      } else {
        toast.error(response.data.message || 'Failed to promote project');
      }
    } catch (error) {
      toast.error('Error promoting project: ' + error.message);
    } finally {
      setPromoting(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-[var(--mac-forest)]">
            Capital Committee - Project Submissions Queue
          </DialogTitle>
        </DialogHeader>

        <div className="py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : !submissions || submissions.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground">No pending submissions</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {submissions.map((submission) => (
                <Card key={submission.submission_id} className="border-l-4 border-amber-500">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">{submission.project_name}</CardTitle>
                        <div className="flex gap-2 mt-2">
                          <Badge variant="outline">{submission.entity}</Badge>
                          <Badge variant="outline">{submission.state}</Badge>
                          <Badge variant="outline">{submission.project_type}</Badge>
                        </div>
                      </div>
                      <Badge className="bg-amber-100 text-amber-800 border-amber-300">
                        Pending Review
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Estimated Passings</p>
                          <p className="font-semibold">{submission.estimated_passings?.toLocaleString() || 'Not provided'}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Estimated CAPEX</p>
                          <p className="font-semibold">
                            {submission.estimated_capex 
                              ? `$${Number(submission.estimated_capex).toLocaleString()}`
                              : 'Not provided'}
                          </p>
                        </div>
                      </div>

                      {submission.notes && (
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">Notes</p>
                          <p className="text-sm bg-slate-50 dark:bg-slate-800 p-2 rounded">
                            {submission.notes}
                          </p>
                        </div>
                      )}

                      <div className="text-xs text-muted-foreground">
                        Submitted: {new Date(submission.submitted_at).toLocaleString()}
                      </div>

                      <div className="flex justify-end gap-2 pt-2 border-t">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toast.info('Mark as reviewed (not implemented yet)')}
                        >
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Mark as Reviewed
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handlePromote(submission)}
                          disabled={promoting === submission.submission_id}
                          className="bg-[var(--mac-forest)] hover:bg-[var(--mac-dark)]"
                        >
                          {promoting === submission.submission_id ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <ArrowRight className="w-4 h-4 mr-2" />
                          )}
                          Promote to Projects
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}