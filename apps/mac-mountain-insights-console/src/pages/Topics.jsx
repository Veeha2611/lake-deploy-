import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Users, TrendingUp, BarChart3, AlertCircle, Zap, Network, Ticket, DollarSign, Loader2, FileText } from 'lucide-react';
import { motion } from 'framer-motion';
import { createPageUrl } from '@/utils';
import TopicDetailModal from '@/components/topics/TopicDetailModal';
import TopicQueryModal from '@/components/topics/TopicQueryModal';
import EnhancedTopicCard from '@/components/topics/EnhancedTopicCard';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

export default function Topics({ user }) {
  const navigate = useNavigate();
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [queryModal, setQueryModal] = useState({ isOpen: false, query: null, title: null });

  // Fetch S3 documents and generate knowledge-based topics
  const { data: knowledgeTopics, isLoading: knowledgeLoading } = useQuery({
    queryKey: ['s3-knowledge-topics-investor'],
    queryFn: async () => {
      const docsResponse = await base44.functions.invoke('s3KnowledgeCatalog', { action: 'list' });
      const documents = docsResponse.data?.documents || [];

      // Filter for MASTER_Investor_FAQs.pdf only
      const investorDoc = documents.find(d => d.name === 'MASTER_Investor_FAQs.pdf');
      
      if (!investorDoc) return [];

      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `Based on the MASTER_Investor_FAQs.pdf document, generate 4-6 investor-focused topics. Each should have 3-4 actionable subtopics with specific questions that investors would ask.

Return JSON with this structure:
{
  "topics": [{
    "id": "unique_id",
    "name": "Topic Name (investor-focused)",
    "description": "Brief description relevant to investors",
    "icon": "DollarSign",
    "color": "from-emerald-500 to-emerald-600",
    "question": "Main investor question about this topic",
    "subtopics": [
      {"label": "Subtopic name", "query": "Specific investor question"}
    ]
  }]
}

Focus on topics like financial performance, growth metrics, market position, competitive advantages, etc.`,
        response_json_schema: {
          type: "object",
          properties: {
            topics: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  name: { type: "string" },
                  description: { type: "string" },
                  icon: { type: "string" },
                  color: { type: "string" },
                  question: { type: "string" },
                  subtopics: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        label: { type: "string" },
                        query: { type: "string" }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      });

      return response.topics || [];
    },
    staleTime: 600000,
  });

  const staticTopics = [
    {
      id: 'finance-revenue',
      name: 'Finance & Revenue',
      description: 'Revenue metrics, MRR trends, and financial KPIs',
      icon: DollarSign,
      color: 'from-emerald-500 to-emerald-600',
      question: 'Show me the MRR and churn summary for the last 12 months',
      subtopics: [
        { label: 'Active customer count by segment', query: 'How many active customers do we have by segment?' },
        { label: 'MRR + churn trend (last 12 months)', query: 'Show me monthly MRR and churn trends for the past 12 months' },
        { label: 'Top margin uplift opportunities (C-band)', query: 'Show me C-band accounts with pricing improvement potential' },
        { label: 'Revenue by band distribution', query: 'Show me total MRR grouped by A-E action bands' }
      ]
    },
    {
      id: 'subscriber-metrics',
      name: 'Subscriber Metrics',
      description: 'Customer growth, retention, and movement analysis',
      icon: Users,
      color: 'from-blue-500 to-blue-600',
      question: 'How many active customers do we have?',
      subtopics: [
        { label: 'Net adds/losses by month', query: 'Show me net customer adds and losses by month for the past 6 months' },
        { label: 'Churn by segment', query: 'Show me customer churn broken down by segment' },
        { label: 'Active vs inactive customers', query: 'Show me the split between active and inactive customers' }
      ]
    },
    {
      id: 'network-operations',
      name: 'Network Operations',
      description: 'Service quality, ticket burden, and operational health',
      icon: Network,
      color: 'from-purple-500 to-purple-600',
      question: 'Show me customer margin data with CCI scores',
      subtopics: [
        { label: 'Worst E-band accounts', query: 'List the worst E-band accounts that need immediate action' },
        { label: 'Ticket burden by band', query: 'Show me average ticket counts grouped by action band' },
        { label: 'Hosted PBX uplift candidates', query: 'Show me Hosted PBX migration opportunities with uplift over $1,000' },
        { label: 'High complexity customers', query: 'Show me customers with the highest complexity indicator scores' }
      ]
    },
    {
      id: 'sales-marketing',
      name: 'Sales & Marketing',
      description: 'Growth opportunities, upsell targets, and expansion',
      icon: Zap,
      color: 'from-amber-500 to-amber-600',
      question: 'Show me Hosted PBX migration opportunities with uplift over $1,000',
      subtopics: [
        { label: 'PBX migration revenue potential', query: 'Show me total revenue uplift available from Hosted PBX migrations' },
        { label: 'C-band pricing opportunities', query: 'Show me C-band accounts with low ticket burden for pricing review' },
        { label: 'A/B band expansion targets', query: 'Show me A and B band customers with growth potential' }
      ]
    },
    {
      id: 'at-risk',
      name: 'At Risk & Retention',
      description: 'Problem accounts requiring immediate attention',
      icon: AlertCircle,
      color: 'from-red-500 to-red-600',
      question: 'List the worst E-band accounts that need action',
      subtopics: [
        { label: 'D/E band account list', query: 'Show me all D and E band accounts with MRR and margin data' },
        { label: 'Negative margin accounts', query: 'Show me accounts with negative net margin' },
        { label: 'High churn risk indicators', query: 'Show me accounts with churn warning signals' }
      ]
    },
    {
      id: 'action-bands',
      name: 'Action Band Analysis',
      description: 'Customer profitability segmentation (A-E)',
      icon: BarChart3,
      color: 'from-indigo-500 to-indigo-600',
      question: 'Show me the A-E band distribution of customers',
      subtopics: [
        { label: 'Band distribution summary', query: 'Show me customer count and total MRR by action band' },
        { label: 'Band movement tracking', query: 'Show me how customers have moved between bands over time' },
        { label: 'Band-specific actions', query: 'What actions should we take for each action band?' }
      ]
    }
  ];

  const handleTopicClick = (topic) => {
    setQueryModal({ isOpen: true, query: topic.question, title: topic.name });
  };

  const handleSubtopicClick = (topic, subtopic) => {
    setQueryModal({ isOpen: true, query: subtopic.query, title: subtopic.label });
  };

  const iconMap = { FileText, Users, TrendingUp, BarChart3, AlertCircle, Zap, Network, Ticket, DollarSign };
  const allTopics = [...staticTopics, ...(knowledgeTopics || []).map(t => ({ ...t, icon: iconMap[t.icon] || FileText }))];

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <motion.header 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-8 relative px-6 py-8"
      >
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-[var(--mac-sky)]/40 via-[var(--mac-forest)]/10 to-transparent rounded-full blur-3xl -z-10" />
        <h1 className="text-4xl font-bold bg-gradient-to-r from-[var(--mac-forest)] to-[var(--mac-dark)] bg-clip-text text-transparent mb-2">
          Explore Topics
        </h1>
        <p className="text-muted-foreground text-lg">Quick access to key data insights and reports</p>
      </motion.header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {allTopics.map((topic, idx) => (
          <EnhancedTopicCard
            key={topic.id}
            topic={topic}
            onMainClick={handleTopicClick}
            onSubtopicClick={handleSubtopicClick}
          />
        ))}
        
        {knowledgeLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="col-span-full flex items-center justify-center py-8 text-muted-foreground"
          >
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Generating topics from knowledge base...
          </motion.div>
        )}
      </div>

      {/* Quick Start Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
        className="mt-8"
      >
        <Card className="bg-gradient-to-br from-[var(--mac-forest)] to-[var(--mac-dark)] text-white border-0 shadow-xl overflow-hidden relative">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-[var(--mac-sky)]/20 to-transparent rounded-full -translate-y-32 translate-x-32" />
          <CardContent className="p-8 relative z-10">
            <h3 className="text-2xl font-bold mb-2">Or ask your own question</h3>
            <p className="text-white/90 mb-6 text-lg">Query your commercial data lake in plain English — customers, margins, action bands, pricing opportunities, and more</p>
            <button
              onClick={() => navigate(createPageUrl('Console'))}
              className="bg-white text-[var(--mac-forest)] px-8 py-3 rounded-xl font-semibold hover:bg-slate-100 transition-colors shadow-lg"
            >
              Go to AI Console →
            </button>
          </CardContent>
        </Card>
      </motion.div>

      <TopicQueryModal
        isOpen={queryModal.isOpen}
        onClose={() => setQueryModal({ isOpen: false, query: null, title: null })}
        query={queryModal.query}
        title={queryModal.title}
      />
    </div>
  );
}