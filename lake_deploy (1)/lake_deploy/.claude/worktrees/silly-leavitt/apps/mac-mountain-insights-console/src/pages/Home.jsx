import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import {
  ArrowRight,
  Sparkles,
  ShieldCheck,
  LayoutDashboard,
  MessageSquare,
  Briefcase,
  Settings,
  Map
} from 'lucide-react';
import DataFreshnessWidget from '@/components/dashboard/DataFreshnessWidget';
import QuickActionBanner from '@/components/dashboard/QuickActionBanner';
import FinanceKPITiles from '@/components/dashboard/FinanceKPITiles';

const focusAreas = [
  {
    title: 'Finance Pulse',
    description: 'MRR, ARPU, and billing movement with SSOT proof packs.',
    page: 'Dashboard',
    icon: LayoutDashboard,
    cta: 'Open Dashboard'
  },
  {
    title: 'Intelligence Console',
    description: 'Deterministic answers with evidence-backed narratives.',
    page: 'Console',
    icon: MessageSquare,
    cta: 'Ask the Lake'
  },
  {
    title: 'Projects & Pipeline',
    description: 'Live delivery view of active projects and priorities.',
    page: 'Projects',
    icon: Briefcase,
    cta: 'View Projects'
  },
  {
    title: 'MAC App Engine',
    description: 'Query registry, orchestration, and AI routing controls.',
    page: 'MACAppEngine',
    icon: Settings,
    cta: 'Open Engine'
  }
];

const highlightItems = [
  'Guardrails enforced across SSOT and curated sources',
  'Deterministic templates before AI narration',
  'Read-only safety with evidence pack traceability'
];

export default function Home() {
  return (
    <div className="relative min-h-screen mac-dashboard">
      <div className="mac-dashboard-bg">
        <div className="mac-glow" />
        <div className="mac-grid" />
      </div>

      <div className="relative z-10 px-6 py-10 lg:px-10 space-y-10">
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]"
        >
          <div className="relative mac-panel-strong rounded-3xl p-8 overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(197,228,237,0.7),transparent_55%),radial-gradient(circle_at_bottom_right,rgba(92,123,95,0.25),transparent_45%)]" />
            <div className="relative z-10 space-y-6">
              <div className="mac-section-meta">MAC MOUNTAIN · COMMAND CENTER</div>
              <h1 className="font-display text-3xl lg:text-4xl text-[var(--mac-ink)] dark:text-[var(--mac-ice)]">
                SSOT clarity the moment you land.
              </h1>
              <p className="text-sm lg:text-base text-muted-foreground max-w-xl">
                The MAC AI Console is your operational cockpit: curated insights, deterministic answers, and guardrails that
                keep every decision anchored to evidence.
              </p>

              <div className="grid gap-3 sm:grid-cols-3">
                {highlightItems.map((item) => (
                  <div key={item} className="mac-panel rounded-2xl p-4">
                    <div className="flex items-start gap-3">
                      <div className="mac-icon-badge">
                        <ShieldCheck className="w-4 h-4" />
                      </div>
                      <p className="text-sm text-card-foreground font-medium">
                        {item}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-3">
                <Link
                  to={createPageUrl('Dashboard')}
                  className="mac-button-primary inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs uppercase tracking-[0.18em]"
                >
                  Go to Dashboard
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  to={createPageUrl('Console')}
                  className="mac-button-outline inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs uppercase tracking-[0.18em]"
                >
                  Ask the Lake
                  <Sparkles className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="mac-panel rounded-3xl p-6 space-y-4">
              <div className="mac-section-meta">LIVE STATUS</div>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-display text-xl">Lake & Guardrails</h3>
                  <p className="text-sm text-muted-foreground">Freshness, guards, and anomalies at a glance.</p>
                </div>
                <div className="mac-icon-badge">
                  <Map className="w-4 h-4" />
                </div>
              </div>
              <DataFreshnessWidget />
              <div className="text-xs text-muted-foreground">
                Click the status card to drill into per-system partitions, exceptions, and guard query IDs.
              </div>
            </div>

            <div className="mac-panel rounded-3xl p-6 space-y-3">
              <div className="mac-section-meta">FOCUS TODAY</div>
              <div className="space-y-2 text-sm text-card-foreground">
                <div className="flex items-start gap-3">
                  <div className="mac-icon-badge">
                    <LayoutDashboard className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold">Confirm KPI alignment</div>
                    <p className="text-xs text-muted-foreground">Latest MRR, ARPU, and customer counts match SSOT.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mac-icon-badge">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold">Run golden questions</div>
                    <p className="text-xs text-muted-foreground">Validate deterministic responses and evidence packs.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mac-icon-badge">
                    <Briefcase className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold">Review project risk</div>
                    <p className="text-xs text-muted-foreground">Spot delivery slip or guardrail warnings early.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.section>

        <QuickActionBanner />

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="mac-section-meta">PRIMARY KPIS</div>
              <h2 className="font-display text-2xl">Finance & Revenue Snapshot</h2>
            </div>
          </div>
          <FinanceKPITiles />
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="mac-section-meta">FOCUS AREAS</div>
              <h2 className="font-display text-2xl">Jump into the right lane</h2>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {focusAreas.map((area) => {
              const Icon = area.icon;
              return (
                <motion.div
                  key={area.title}
                  whileHover={{ y: -4 }}
                  transition={{ duration: 0.2 }}
                  className="mac-panel rounded-2xl p-6 flex flex-col gap-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="mac-icon-badge">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-semibold text-lg text-card-foreground">{area.title}</div>
                      <div className="text-sm text-muted-foreground">{area.description}</div>
                    </div>
                  </div>
                  <Link
                    to={createPageUrl(area.page)}
                    className="mac-button-outline inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs uppercase tracking-[0.18em] w-fit"
                  >
                    {area.cta}
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
