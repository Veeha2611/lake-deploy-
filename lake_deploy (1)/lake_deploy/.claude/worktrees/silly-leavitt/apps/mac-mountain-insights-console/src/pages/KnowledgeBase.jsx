import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, Loader2, RefreshCw, Download, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

export default function KnowledgeBase() {
  const [searchTerm, setSearchTerm] = useState('');

  const { data: documents, isLoading, refetch } = useQuery({
    queryKey: ['knowledge-docs'],
    queryFn: async () => {
      const response = await base44.functions.invoke('s3KnowledgeCatalog', {
        action: 'list'
      });
      return response.data;
    },
    refetchInterval: 300000,
  });

  const filteredDocs = documents?.documents?.filter(doc =>
    doc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    doc.key.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const handleRefresh = async () => {
    await refetch();
    toast.success('Knowledge base refreshed');
  };

  return (
    <div className="max-w-6xl mx-auto">
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Knowledge Base</h1>
        <p className="text-slate-600">S3 Bucket: gwi-mac-knowledge-us-east-1-pc</p>
      </motion.header>

      <div className="flex items-center gap-4 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search documents..."
            className="pl-10"
          />
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={isLoading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <Card className="bg-white border-0 shadow-sm">
          <CardContent className="p-12 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-[var(--mac-forest)]" />
          </CardContent>
        </Card>
      ) : documents?.error || documents?.ok === false ? (
        <Card className="bg-white border-0 shadow-sm border-red-200">
          <CardContent className="p-6">
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="font-semibold text-red-800 mb-1">Failed to load knowledge base</div>
              <div className="text-sm text-red-700">{documents?.error || 'Unknown error'}</div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredDocs.map((doc, idx) => (
            <motion.div
              key={doc.key}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
            >
              <Card className="bg-white border-0 shadow-sm hover:shadow-lg transition-all group">
                <CardHeader className="pb-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 shadow-md">
                      <FileText className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-sm font-semibold text-slate-900 truncate">
                        {doc.name}
                      </CardTitle>
                      <p className="text-xs text-slate-500 truncate mt-1">{doc.key}</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600">Size:</span>
                    <Badge variant="outline" className="text-xs">{formatBytes(doc.size)}</Badge>
                  </div>
                  {doc.lastModified && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600">Modified:</span>
                      <span className="text-slate-700">{new Date(doc.lastModified).toLocaleDateString()}</span>
                    </div>
                  )}
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    <Button variant="outline" size="sm" className="w-full hover:bg-blue-50">
                      <Download className="w-3 h-3 mr-2" />
                      View Document
                    </Button>
                  </a>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {!isLoading && filteredDocs.length === 0 && (
        <Card className="bg-white border-0 shadow-sm">
          <CardContent className="p-12 text-center">
            <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">
              {searchTerm ? 'No documents match your search' : 'No documents found'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}