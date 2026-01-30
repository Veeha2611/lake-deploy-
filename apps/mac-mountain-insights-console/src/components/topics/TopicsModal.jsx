import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Search, Users, TrendingDown, BarChart3, AlertCircle, Zap, DollarSign, Target } from 'lucide-react';
import TopicDetailModal from './TopicDetailModal';

export default function TopicsModal({ isOpen, onClose }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTopic, setSelectedTopic] = useState(null);

  const topics = [
    {
      id: 'active_customers',
      name: 'Active Customers',
      description: 'Total and active customer counts',
      icon: Users,
      color: 'from-blue-500 to-blue-600',
      question: 'How many active customers do we have?'
    },
    {
      id: 'mrr_trends',
      name: 'MRR Trends',
      description: 'Monthly recurring revenue analysis',
      icon: TrendingDown,
      color: 'from-emerald-500 to-emerald-600',
      question: 'What is our total MRR trend over the last 6 months?'
    },
    {
      id: 'action_bands',
      name: 'Action Bands A–E',
      description: 'Customer health distribution',
      icon: BarChart3,
      color: 'from-purple-500 to-purple-600',
      question: 'Show me the A-E band distribution'
    },
    {
      id: 'worst_e_band',
      name: 'Worst E-Band Accounts',
      description: 'Highest risk accounts requiring attention',
      icon: AlertCircle,
      color: 'from-red-500 to-red-600',
      question: 'List the worst E-band accounts'
    },
    {
      id: 'hosted_pbx',
      name: 'Hosted PBX Opportunities',
      description: 'Migration uplift potential',
      icon: Zap,
      color: 'from-amber-500 to-amber-600',
      question: 'What are the hosted PBX migration opportunities?'
    },
    {
      id: 'low_margin',
      name: 'Low Margin Accounts',
      description: 'Accounts needing immediate action',
      icon: Target,
      color: 'from-orange-500 to-orange-600',
      question: 'Show me low margin accounts that need attention'
    },
    {
      id: 'pricing_opportunities',
      name: 'C-Band Pricing',
      description: 'Low-ticket accounts with pricing potential',
      icon: DollarSign,
      color: 'from-teal-500 to-teal-600',
      question: 'C-Band price opportunities - low-ticket accounts with pricing improvement potential'
    }
  ];

  const filteredTopics = topics.filter(topic =>
    topic.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    topic.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      <Dialog open={isOpen && !selectedTopic} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-transparent">
              Explore Data Topics
            </DialogTitle>
          </DialogHeader>

          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search topics..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTopics.map((topic) => {
              const Icon = topic.icon;
              return (
                <button
                  key={topic.id}
                  onClick={() => setSelectedTopic(topic)}
                  className="bg-white border border-slate-200 rounded-xl p-5 hover:shadow-lg hover:border-[var(--mac-forest)] transition-all group text-left"
                >
                  <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${topic.color} flex items-center justify-center mb-4 shadow-md group-hover:scale-110 transition-transform`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-base font-semibold text-slate-900 mb-2 group-hover:text-[var(--mac-forest)] transition-colors">
                    {topic.name}
                  </h3>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    {topic.description}
                  </p>
                </button>
              );
            })}
          </div>

          {filteredTopics.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              No topics found matching "{searchQuery}"
            </div>
          )}
        </DialogContent>
      </Dialog>

      {selectedTopic && (
        <TopicDetailModal
          isOpen={true}
          onClose={() => setSelectedTopic(null)}
          topic={selectedTopic}
        />
      )}
    </>
  );
}