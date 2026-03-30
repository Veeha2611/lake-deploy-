import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Loader2 } from 'lucide-react';

export default function EnhancedTopicCard({ topic, onSubtopicClick, onMainClick }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const Icon = topic.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -8, scale: 1.02 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="cursor-pointer hover:shadow-2xl transition-all duration-300 group border-border overflow-hidden relative h-full bg-gradient-to-br from-card via-card/95 to-card/80">
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-[var(--mac-sky)]/30 to-transparent rounded-full -translate-y-16 translate-x-16 group-hover:scale-150 transition-transform duration-500" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-[var(--mac-forest)]/10 to-transparent rounded-full translate-y-12 -translate-x-12 group-hover:scale-150 transition-transform duration-500" />
        <div className={`h-3 bg-gradient-to-r ${topic.color} shadow-sm`} />
        
        <button
          onClick={() => {
            if (topic.subtopics && topic.subtopics.length > 0) {
              setIsExpanded(!isExpanded);
            } else {
              onMainClick(topic);
            }
          }}
          className="w-full text-left"
        >
          <CardHeader className="relative z-10 pb-4">
            <div className="flex items-start justify-between mb-4">
              <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${topic.color} shadow-xl group-hover:shadow-2xl group-hover:scale-110 transition-all duration-300 flex items-center justify-center relative overflow-hidden`}>
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
                <Icon className="w-8 h-8 text-white relative z-10 drop-shadow-lg" />
              </div>
              {topic.subtopics && topic.subtopics.length > 0 && (
                <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-secondary/50 text-xs text-muted-foreground">
                  <span>{topic.subtopics.length}</span>
                  <ChevronRight 
                    className={`w-4 h-4 transition-transform duration-300 ${isExpanded ? 'rotate-90' : ''}`} 
                  />
                </div>
              )}
            </div>
            <CardTitle className="text-lg font-bold text-card-foreground group-hover:text-[var(--mac-forest)] transition-colors leading-tight">
              {topic.name}
            </CardTitle>
          </CardHeader>
        </button>

        <CardContent className="pt-0 relative z-10">
          <p className="text-muted-foreground text-sm leading-relaxed mb-4">
            {topic.description}
          </p>

          <AnimatePresence>
            {isExpanded && topic.subtopics && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="space-y-1 border-t border-border pt-3 mt-2"
              >
                {topic.subtopics.map((subtopic, idx) => (
                  <button
                    key={idx}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSubtopicClick(topic, subtopic);
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-secondary transition-colors group/subtopic"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-card-foreground group-hover/subtopic:text-[var(--mac-forest)] font-medium">
                        {subtopic.label}
                      </span>
                      <ChevronRight className="w-3 h-3 text-muted-foreground group-hover/subtopic:text-[var(--mac-forest)] group-hover/subtopic:translate-x-1 transition-all" />
                    </div>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {!isExpanded && (
            <div className="flex items-center text-sm text-[var(--mac-forest)] font-semibold opacity-0 group-hover:opacity-100 transition-all mt-2">
              <span className="px-3 py-1.5 rounded-lg bg-[var(--mac-forest)]/10 group-hover:bg-[var(--mac-forest)]/20 transition-colors">
                Explore
              </span>
              <svg className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}