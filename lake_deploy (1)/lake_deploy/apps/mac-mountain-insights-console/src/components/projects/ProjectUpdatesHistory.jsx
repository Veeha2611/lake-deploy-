import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, History, Download, Eye, FileText, Briefcase, TestTube } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function ProjectUpdatesHistory({ onMount }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState(null);
  const [loadingContent, setLoadingContent] = useState(false);
  
  React.useEffect(() => {
    if (onMount) onMount(refetch);
  }, [onMount]);

  const { data: filesData, isLoading, refetch } = useQuery({
    queryKey: ['project-updates-history'],
    queryFn: async () => {
      console.log('Fetching project updates from S3...');
      const response = await base44.functions.invoke('listProjectUpdates', {
        action: 'list'
      });
      console.log('listProjectUpdates response:', response.data);
      return response.data;
    },
    refetchInterval: 30000, // Reduced to 30 seconds for better testing
  });

  const handleViewContent = async (file) => {
    setSelectedFile(file);
    setLoadingContent(true);
    try {
      const response = await base44.functions.invoke('listProjectUpdates', {
        action: 'content',
        key: file.key
      });
      setFileContent(response.data.content);
    } catch (error) {
      toast.error('Failed to load file content');
    } finally {
      setLoadingContent(false);
    }
  };

  const handleDownload = async (file) => {
    try {
      console.log('Download button clicked for file:', file.key);
      console.log('Calling listProjectUpdates with action=download');
      
      const response = await base44.functions.invoke('listProjectUpdates', {
        action: 'download',
        key: file.key
      });
      
      console.log('listProjectUpdates download response:', response.data);
      
      if (response.data.download_url) {
        console.log('Using window.location.assign for Safari-safe download:', response.data.download_url);
        // Safari-safe: navigate to presigned URL to trigger download
        window.location.assign(response.data.download_url);
        toast.success('Download started');
      } else {
        console.error('No download_url in response:', response.data);
        toast.error('No download URL received');
      }
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Failed to download file: ' + error.message);
    }
  };

  const files = filesData?.files || [];
  const testFiles = files.filter(f => f.is_test === true);
  const realFiles = files.filter(f => f.is_test === false);

  return (
    <>
      <Dialog onOpenChange={(open) => { if (open) refetch(); }}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <History className="w-4 h-4 mr-2" />
            View Update History
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-[var(--mac-forest)]">
              Project Updates History
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                Every project creation or update generates a CSV file in S3. View or download any file below.
              </p>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-[var(--mac-forest)]" />
              </div>
            ) : files.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No update files found</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Real Project Files */}
                {realFiles.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="font-semibold text-sm flex items-center gap-2">
                      <Briefcase className="w-4 h-4" />
                      Real Project Updates
                    </h3>
                    {realFiles.map((file, index) => (
                  <Card key={file.key} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-[var(--mac-forest)]" />
                            <p className="font-medium text-sm">{file.file_name}</p>
                            {index === 0 && (
                              <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
                                Latest
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                            <span>{format(new Date(file.last_modified), 'MMM d, yyyy h:mm a')}</span>
                            <span>{(file.size_bytes / 1024).toFixed(2)} KB</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewContent(file)}
                          >
                            <Eye className="w-4 h-4 mr-2" />
                            View
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDownload(file)}
                          >
                            <Download className="w-4 h-4 mr-2" />
                            Download
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                    ))}
                  </div>
                )}

                {/* Test Project Files */}
                {testFiles.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="font-semibold text-sm flex items-center gap-2">
                      <TestTube className="w-4 h-4 text-amber-600" />
                      Test Project Updates
                    </h3>
                    {testFiles.map((file) => (
                      <Card key={file.key} className="hover:shadow-md transition-shadow border-amber-200 dark:border-amber-800">
                        <CardContent className="p-4 bg-amber-50/50 dark:bg-amber-900/10">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <FileText className="w-4 h-4 text-amber-600" />
                                <p className="font-medium text-sm">{file.file_name}</p>
                                <Badge variant="outline" className="text-xs bg-amber-100 text-amber-800 border-amber-300">
                                  Test Data
                                </Badge>
                              </div>
                              <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                                <span>{format(new Date(file.last_modified), 'MMM d, yyyy h:mm a')}</span>
                                <span>{(file.size_bytes / 1024).toFixed(2)} KB</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleViewContent(file)}
                              >
                                <Eye className="w-4 h-4 mr-2" />
                                View
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDownload(file)}
                              >
                                <Download className="w-4 h-4 mr-2" />
                                Download
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* File Content Modal */}
      <Dialog open={!!selectedFile} onOpenChange={() => { setSelectedFile(null); setFileContent(null); }}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              {selectedFile?.file_name}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            {loadingContent ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-[var(--mac-forest)]" />
              </div>
            ) : (
              <div className="bg-slate-900 text-slate-100 rounded-lg p-4 overflow-x-auto">
                <pre className="text-xs whitespace-pre">{fileContent}</pre>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}