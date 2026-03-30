import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, TrendingUp, BarChart3, AlertCircle } from 'lucide-react';
import { macEngineInvoke } from '@/api/macEngineClient';
import { runSSOTQuery } from '@/api/ssotQuery';
import { toast } from 'sonner';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const PROJECTS_PIPELINE_SQL = `
SELECT
  project_id,
  entity,
  project_name,
  project_type,
  state,
  COALESCE(NULLIF(stage, ''), 'Unknown') AS stage,
  COALESCE(NULLIF(priority, ''), 'Unranked') AS priority,
  COALESCE(NULLIF(owner, ''), 'Unassigned') AS owner
FROM curated_core.projects_enriched_live
WHERE project_id IS NOT NULL
  AND TRIM(CAST(project_id AS varchar)) <> ''
  AND LOWER(TRIM(CAST(project_id AS varchar))) <> 'nan'
  -- De-duplicate/ignore legacy placeholder projects that were used during early manual operation.
  AND NOT regexp_like(lower(COALESCE(project_name, '')), '^legacy\\s*\\(')
  -- Exclude dead deals from pipeline execution/rollups (unless explicitly reintroduced upstream).
  AND lower(COALESCE(NULLIF(stage, ''), 'unknown')) NOT IN (
    'dead', 'declined', 'decline', 'declined / dead', 'closed lost', 'lost', 'inactive'
  )
ORDER BY entity, project_name
LIMIT 500
`;

const PIPELINE_DEFAULTS_SQL = `
SELECT
  approx_percentile(passings, 0.5) AS passings_p50,
  approx_percentile(months_to_completion, 0.5) AS build_months_p50,
  approx_percentile(arpu, 0.5) AS arpu_p50,
  approx_percentile(COALESCE(investment, construction_plus_install_cost), 0.5) AS total_capex_p50,
  approx_percentile(COALESCE(capex_per_passing, total_cost_per_passing), 0.5) AS capex_per_passing_p50,
  approx_percentile(install_cost_per_subscriber, 0.5) AS install_cost_per_subscriber_p50,
  approx_percentile(opex_per_sub, 0.5) AS opex_per_sub_p50
FROM curated_core.projects_enriched_live
WHERE passings > 0
  AND months_to_completion > 0
  AND arpu > 0
`;

const FALLBACK_DEFAULTS = {
  // Reverted to the original Developer Template 2-9-26 VF baseline.
  passings: 2500,
  build_months: 36,
  arpu_start: 75,
  total_capex: null,
  capex_per_passing: 1400,
  install_cost_per_subscriber: 800,
  opex_per_sub: 14,
  opex_per_passing: 2,
  min_monthly_opex: 50000,
  cogs_pct_revenue: 0.15,
  min_non_circuit_cogs: 7500,
  circuit: true,
  circuit_type: 10,
  ebitda_multiple: 15,
  discount_rate_pct: 10,
  subscription_rate: 1,
  subscription_months: 48
};

const PROFILE_DEFAULT_OVERRIDES = {
  // Profiles are assumption presets. Blueprint now uses the original 2-9-26 VF defaults.
  standard: {
    build_months: 36,
    arpu_start: 75,
    capex_per_passing: 1400,
    install_cost_per_subscriber: 800,
    opex_per_sub: 14,
    opex_per_passing: 2,
    min_monthly_opex: 50000,
    cogs_pct_revenue: 0.15,
    min_non_circuit_cogs: 7500,
    circuit: true,
    circuit_type: 10,
    ebitda_multiple: 15,
    discount_rate_pct: 10,
    subscription_rate: 1,
    subscription_months: 48
  },
  blueprint_2026_02_15: {
    build_months: 36,
    arpu_start: 75,
    capex_per_passing: 1400,
    install_cost_per_subscriber: 800,
    opex_per_sub: 14,
    opex_per_passing: 2,
    min_monthly_opex: 50000,
    cogs_pct_revenue: 0.15,
    min_non_circuit_cogs: 7500,
    circuit: true,
    circuit_type: 10,
    ebitda_multiple: 15,
    discount_rate_pct: 10,
    subscription_rate: 1,
    subscription_months: 48
  },
  developer_template_2_9_26: {
    build_months: 36,
    arpu_start: 75,
    subscription_rate: 1,
    subscription_months: 48,
    capex_per_passing: 1400,
    install_cost_per_subscriber: 800,
    opex_per_sub: 14,
    opex_per_passing: 2,
    min_monthly_opex: 50000,
    cogs_pct_revenue: 0.15,
    min_non_circuit_cogs: 7500,
    circuit: true,
    circuit_type: 10,
    ebitda_multiple: 15,
    discount_rate_pct: 10
  },
  horton: {
    build_months: 36,
    arpu_start: 75,
    subscription_rate: 1,
    subscription_months: 48,
    capex_per_passing: 1400,
    install_cost_per_subscriber: 800,
    opex_per_sub: 14,
    opex_per_passing: 2,
    min_monthly_opex: 50000,
    cogs_pct_revenue: 0.15,
    min_non_circuit_cogs: 7500,
    circuit: true,
    circuit_type: 10,
    ebitda_multiple: 15,
    discount_rate_pct: 10
  },
  acme: {
    build_months: 36,
    arpu_start: 75,
    subscription_rate: 1,
    subscription_months: 48,
    capex_per_passing: 1400,
    install_cost_per_subscriber: 800,
    opex_per_sub: 14,
    opex_per_passing: 2,
    min_monthly_opex: 50000,
    cogs_pct_revenue: 0.15,
    min_non_circuit_cogs: 7500,
    circuit: true,
    circuit_type: 10,
    ebitda_multiple: 15,
    discount_rate_pct: 10
  }
};

const REQUIRED_INPUTS = [
  'passings',
  'build_months',
  'arpu_start',
  'subscription_rate',
  'subscription_months',
  'capex_per_passing',
  'opex_per_sub'
];

const MODEL_PROFILE_OPTIONS = [
  { value: 'all', label: 'All model profiles' },
  { value: 'standard', label: 'Standard Pipeline Model' },
  { value: 'blueprint_2026_02_15', label: 'Blueprint Baseline (2-9-26 VF)' },
  { value: 'developer_template_2_9_26', label: 'Developer Template 2-9-26 (Exec Dashboard)' },
  { value: 'horton', label: 'Horton Developer Profile' },
  { value: 'acme', label: 'Acme Developer Profile' }
];

const inferModelProfileForProject = (project) => {
  const entity = String(project?.entity || '').toLowerCase();
  const projectType = String(project?.project_type || '').toLowerCase();
  const name = String(project?.project_name || '').toLowerCase();
  if (entity.includes('blueprint') || projectType.includes('blueprint') || name.includes('blueprint')) {
    return 'developer_template_2_9_26';
  }
  if (entity.includes('horton') || projectType.includes('horton') || name.includes('horton')) {
    return 'horton';
  }
  if (entity.includes('acme') || projectType.includes('acme') || name.includes('acme')) {
    return 'acme';
  }
  if (entity.includes('prospect') || projectType.includes('prospect') || name.includes('prospect')) {
    return 'developer_template_2_9_26';
  }
  return 'standard';
};

export default function PipelineRunner({ isOpen, onClose }) {
  const [enrichedScenarios, setEnrichedScenarios] = useState([]);
  const [selectedScenarios, setSelectedScenarios] = useState({});
  const [loading, setLoading] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [running, setRunning] = useState(false);
  const [pipelineResults, setPipelineResults] = useState(null);
  const [missingData, setMissingData] = useState([]);
  const [projectsIndex, setProjectsIndex] = useState([]);
  const [baselineBusy, setBaselineBusy] = useState(false);
  const [lastRunScenarios, setLastRunScenarios] = useState([]);
  const [savedRuns, setSavedRuns] = useState([]);
  const [selectedRunId, setSelectedRunId] = useState('');
  const [savingRun, setSavingRun] = useState(false);
  const [exportingRun, setExportingRun] = useState(false);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [baselineDefaults, setBaselineDefaults] = useState(FALLBACK_DEFAULTS);
  const [defaultsQid, setDefaultsQid] = useState(null);
  const [defaultsMeta, setDefaultsMeta] = useState(null);
  const [projectsMeta, setProjectsMeta] = useState(null);
  const [lastReportUrl, setLastReportUrl] = useState('');
  const [lastRunArtifacts, setLastRunArtifacts] = useState(null);
  const [lastRunRecord, setLastRunRecord] = useState(null);
  const [applyingDefaults, setApplyingDefaults] = useState(false);
  const [modelProfileFilter, setModelProfileFilter] = useState('all');
  const [releaseTag, setReleaseTag] = useState('');

  const fetchSavedRuns = async () => {
    setLoadingRuns(true);
    try {
      const res = await macEngineInvoke('downloadPipelineResults', { action: 'list_portfolio' });
      setSavedRuns(res.data?.runs || []);
    } catch (err) {
      console.error('Failed to load saved pipeline runs:', err);
    } finally {
      setLoadingRuns(false);
    }
  };

  const normalizeDefaults = (row) => {
    const values = Array.isArray(row) ? row : Object.values(row || {});
    return {
      passings: Number(values[0]) || FALLBACK_DEFAULTS.passings,
      build_months: Number(values[1]) || FALLBACK_DEFAULTS.build_months,
      arpu_start: Number(values[2]) || FALLBACK_DEFAULTS.arpu_start,
      total_capex: Number(values[3]) || FALLBACK_DEFAULTS.total_capex,
      capex_per_passing: Number(values[4]) || FALLBACK_DEFAULTS.capex_per_passing,
      install_cost_per_subscriber: Number(values[5]) || FALLBACK_DEFAULTS.install_cost_per_subscriber,
      opex_per_sub: Number(values[6]) || FALLBACK_DEFAULTS.opex_per_sub,
      subscription_rate: FALLBACK_DEFAULTS.subscription_rate,
      subscription_months: FALLBACK_DEFAULTS.subscription_months
    };
  };

  // Fetch and enrich all scenarios
  useEffect(() => {
    if (!isOpen) return;

    const fetchEnrichedScenarios = async () => {
      setLoading(true);
      try {
        // 0. Load default baseline inputs (median) for fallback
        try {
          const defaultsResponse = await runSSOTQuery({
            queryId: 'projects_pipeline_defaults',
            sql: PIPELINE_DEFAULTS_SQL,
            label: 'Projects Pipeline Defaults'
          });
          const defaultsRow = defaultsResponse.data?.data_rows?.[0];
          const defaultsLoadedAt = new Date().toISOString();
          if (defaultsRow) {
            setBaselineDefaults(normalizeDefaults(defaultsRow));
            const qid = defaultsResponse.data?.evidence?.athena_query_execution_id || null;
            setDefaultsQid(qid);
            setDefaultsMeta({
              loaded_at: defaultsLoadedAt,
              qid,
              cached: Boolean(defaultsResponse.data?.cached),
              stale: Boolean(defaultsResponse.data?.stale),
              views_used: defaultsResponse.data?.evidence?.views_used || [],
              freshness: defaultsResponse.data?.evidence_pack?.freshness || null
            });
          } else {
            setBaselineDefaults(FALLBACK_DEFAULTS);
            setDefaultsQid(null);
            setDefaultsMeta({
              loaded_at: defaultsLoadedAt,
              qid: null,
              cached: Boolean(defaultsResponse.data?.cached),
              stale: Boolean(defaultsResponse.data?.stale),
              views_used: defaultsResponse.data?.evidence?.views_used || [],
              freshness: defaultsResponse.data?.evidence_pack?.freshness || null
            });
          }
        } catch (err) {
          console.error('Failed to load pipeline defaults:', err);
          setBaselineDefaults(FALLBACK_DEFAULTS);
          setDefaultsQid(null);
          setDefaultsMeta(null);
        }

        // 1. Load all projects from Athena with full metadata
        const projectsResponse = await runSSOTQuery({
          queryId: 'projects_pipeline',
          sql: PROJECTS_PIPELINE_SQL,
          label: 'Projects Pipeline'
        });
        setProjectsMeta({
          loaded_at: new Date().toISOString(),
          qid: projectsResponse.data?.evidence?.athena_query_execution_id || null,
          cached: Boolean(projectsResponse.data?.cached),
          stale: Boolean(projectsResponse.data?.stale),
          views_used: projectsResponse.data?.evidence?.views_used || [],
          freshness: projectsResponse.data?.evidence_pack?.freshness || null
        });

        const projectsMap = new Map();
        const projectsList = [];
        const projectRows = projectsResponse.data?.data_rows || [];
        projectRows.forEach(row => {
          const values = Array.isArray(row) ? row : Object.values(row);
          const project = {
            project_id: values[0],
            entity: values[1] || '(Unmapped)',
            project_name: values[2] || '(Unmapped)',
            project_type: values[3] || '(Unmapped)',
            state: values[4] || '(Unmapped)',
            stage: values[5] || 'Unknown',
            priority: values[6] || 'Unranked'
          };
          projectsMap.set(values[0], project);
          projectsList.push(project);
        });
        setProjectsIndex(projectsList);

        // 2. Load scenarios from registry; always include a virtual baseline for selection
        const allScenarios = [];
        for (const [project_id, project] of projectsMap) {
            const pushBaseline = () => {
              allScenarios.push({
                project_id,
                entity: project.entity,
                project_name: project.project_name,
                state: project.state,
                project_type: project.project_type,
                stage: project.stage,
                priority: project.priority,
                model_profile: inferModelProfileForProject(project),
                scenario_id: 'baseline',
                scenario_name: 'Baseline (from project)',
                start_date: null,
                start_month_offset: 0,
                is_test: false,
              scenario_inputs: null,
              latest_run: null,
              metrics: {},
              has_run: false,
              is_virtual: true
            });
          };

          try {
            // Load registry - source of truth for saved scenarios
            const registryResponse = await macEngineInvoke('manageScenariosRegistry', {
              action: 'get',
              project_id
            });

            const scenarios = registryResponse.data?.registry?.scenarios || [];
            const hasBaselineScenario = scenarios.some(s =>
              String(s.scenario_id || '').toLowerCase() === 'baseline' ||
              String(s.scenario_name || '').toLowerCase().includes('baseline')
            );

            // Get latest runs for each scenario
            let runs = [];
            try {
              const outputsResponse = await macEngineInvoke('listProjectModelOutputs', {
                project_id,
                action: 'list'
              });
              runs = outputsResponse.data?.runs || [];
            } catch (err) {
              console.error(`Failed to load runs for ${project_id}:`, err);
            }

            for (const scenario of scenarios) {
              const scenarioRuns = runs.filter(r => r.scenario_id === scenario.scenario_id);
              const latestRun = scenarioRuns.length > 0 ? scenarioRuns[0] : null;

              allScenarios.push({
                project_id,
                entity: project.entity,
                project_name: project.project_name,
                state: project.state,
                project_type: project.project_type,
                stage: project.stage,
                priority: project.priority,
                model_profile: scenario.inputs?.model_profile || inferModelProfileForProject(project),
                scenario_id: scenario.scenario_id,
                scenario_name: scenario.scenario_name || 'Unnamed',
                start_date: scenario.inputs?.start_date,
                start_month_offset: scenario.inputs?.start_month_offset || 0,
                is_test: scenario.is_test || false,
                scenario_inputs: scenario.inputs || null,
                latest_run: latestRun,
                metrics: latestRun?.metrics || {},
                has_run: !!latestRun
              });
            }

            if (!hasBaselineScenario) {
              pushBaseline();
            }
          } catch (error) {
            console.error(`Failed to load scenarios for ${project_id}:`, error);
            // Fallback: still allow baseline selection even if registry is unavailable
            pushBaseline();
          }
        }

        setEnrichedScenarios(allScenarios);
      } catch (error) {
        console.error('Failed to fetch scenarios:', error);
        toast.error('Failed to load scenarios');
      } finally {
        setLoading(false);
      }
    };

    fetchEnrichedScenarios();
    fetchSavedRuns();
  }, [isOpen, reloadNonce]);

  const parseNumber = (value) => {
    const num = Number(String(value || '').replace(/,/g, ''));
    return Number.isNaN(num) ? null : num;
  };
  const parsePercent = (value) => {
    const num = parseNumber(value);
    if (num === null) return null;
    return num > 1 ? num / 100 : num;
  };

  const resolveScenarioProfile = (scenario) => {
    return (
      scenario?.scenario_inputs?.model_profile ||
      scenario?.inputs?.model_profile ||
      scenario?.model_profile ||
      inferModelProfileForProject(scenario)
    );
  };

  const profileLabel = (profile) => {
    const match = MODEL_PROFILE_OPTIONS.find((opt) => opt.value === profile);
    return match ? match.label : profile || 'standard';
  };

  const normalizeProfile = (profile) => {
    const normalized = String(profile || '').trim().toLowerCase();
    if (!normalized) return 'standard';
    if (normalized.includes('blueprint')) return 'blueprint_2026_02_15';
    if (normalized.includes('horton')) return 'horton';
    if (normalized.includes('acme')) return 'acme';
    if (normalized.includes('developer_template') || normalized.includes('exec_dashboard')) {
      return 'developer_template_2_9_26';
    }
    return normalized;
  };

  const defaultsForProfile = (profile) => {
    const key = normalizeProfile(profile);
    return {
      ...baselineDefaults,
      ...(PROFILE_DEFAULT_OVERRIDES.standard || {}),
      ...(PROFILE_DEFAULT_OVERRIDES[key] || {})
    };
  };

  const buildBaselineInputs = (row, columns, defaults = baselineDefaults) => {
    const lookup = (name) => {
      const idx = columns.findIndex((col) => col === name);
      if (idx === -1) return null;
      return row[idx];
    };

    const defaultsUsed = {};
    const passings = parseNumber(lookup('passings'));
    const build_months = parseNumber(lookup('build_months'));
    const total_capex = parseNumber(lookup('total_capex'));
    const arpu_start = parseNumber(lookup('arpu_start'));
    const penetration_start_pct = parsePercent(lookup('penetration_start_pct'));
    const penetration_target_pct = parsePercent(lookup('penetration_target_pct'));
    const ramp_months = parseNumber(lookup('ramp_months'));
    const capex_per_passing = parseNumber(lookup('capex_per_passing'));
    const install_cost_per_subscriber = parseNumber(lookup('install_cost_per_subscriber'));
    const opex_per_sub = parseNumber(lookup('opex_per_sub'));
    const opex_per_passing = parseNumber(lookup('opex_per_passing'));
    const min_monthly_opex = parseNumber(lookup('min_monthly_opex'));
    const cogs_pct_revenue = parsePercent(lookup('cogs_pct_revenue'));
    const min_non_circuit_cogs = parseNumber(lookup('min_non_circuit_cogs'));
    const subscription_months = parseNumber(lookup('subscription_months'));
    const subscription_rate = parsePercent(lookup('subscription_rate'));
    const circuit = lookup('circuit');
    const circuit_type = parseNumber(lookup('circuit_type'));
    const ebitda_multiple = parseNumber(lookup('ebitda_multiple'));
    const discount_rate_pct = parseNumber(lookup('discount_rate_pct'));

    const resolvedPassings = passings || defaults.passings;
    if (!passings && defaults.passings) defaultsUsed.passings = defaults.passings;

    const resolvedBuildMonths = build_months || defaults.build_months;
    if (!build_months && defaults.build_months) defaultsUsed.build_months = defaults.build_months;

    const resolvedArpu = arpu_start || defaults.arpu_start;
    if (!arpu_start && defaults.arpu_start) defaultsUsed.arpu_start = defaults.arpu_start;

    const resolvedCapexPerPassing = capex_per_passing || defaults.capex_per_passing;
    if (!capex_per_passing && defaults.capex_per_passing) defaultsUsed.capex_per_passing = defaults.capex_per_passing;

    const resolvedInstallCostPerSub = install_cost_per_subscriber ?? defaults.install_cost_per_subscriber;
    if ((install_cost_per_subscriber == null || install_cost_per_subscriber === '') && defaults.install_cost_per_subscriber != null) {
      defaultsUsed.install_cost_per_subscriber = defaults.install_cost_per_subscriber;
    }

    const resolvedOpexPerSub = opex_per_sub || defaults.opex_per_sub;
    if (!opex_per_sub && defaults.opex_per_sub) defaultsUsed.opex_per_sub = defaults.opex_per_sub;

    const resolvedOpexPerPassing = opex_per_passing ?? defaults.opex_per_passing;
    if (opex_per_passing == null && defaults.opex_per_passing != null) defaultsUsed.opex_per_passing = defaults.opex_per_passing;

    const resolvedMinMonthlyOpex = min_monthly_opex ?? defaults.min_monthly_opex;
    if (min_monthly_opex == null && defaults.min_monthly_opex != null) defaultsUsed.min_monthly_opex = defaults.min_monthly_opex;

    const resolvedCogsPctRevenue = cogs_pct_revenue ?? defaults.cogs_pct_revenue;
    if (cogs_pct_revenue == null && defaults.cogs_pct_revenue != null) defaultsUsed.cogs_pct_revenue = defaults.cogs_pct_revenue;

    const resolvedEbitdaMultiple = ebitda_multiple ?? defaults.ebitda_multiple;
    if (ebitda_multiple == null && defaults.ebitda_multiple != null) defaultsUsed.ebitda_multiple = defaults.ebitda_multiple;

    const resolvedDiscountRatePct = discount_rate_pct ?? defaults.discount_rate_pct ?? FALLBACK_DEFAULTS.discount_rate_pct;
    if (discount_rate_pct == null && (defaults.discount_rate_pct != null || FALLBACK_DEFAULTS.discount_rate_pct != null)) {
      defaultsUsed.discount_rate_pct = resolvedDiscountRatePct;
    }

    const effectiveSubscriptionRate = subscription_rate ?? penetration_target_pct ?? defaults.subscription_rate ?? FALLBACK_DEFAULTS.subscription_rate;
    const normalizedCapexPerPassing = resolvedCapexPerPassing ?? 1200;
    const totalCapexDerived = total_capex || (
      (normalizedCapexPerPassing && resolvedPassings ? normalizedCapexPerPassing * resolvedPassings : 0) +
      (resolvedInstallCostPerSub && resolvedPassings ? resolvedPassings * effectiveSubscriptionRate * resolvedInstallCostPerSub : 0)
    );

    return {
      inputs: {
      passings: resolvedPassings,
      build_months: resolvedBuildMonths,
      total_capex: totalCapexDerived || null,
      arpu_start: resolvedArpu,
      penetration_start_pct: penetration_start_pct ?? 0.1,
      penetration_target_pct: penetration_target_pct ?? effectiveSubscriptionRate ?? defaults.subscription_rate ?? FALLBACK_DEFAULTS.subscription_rate,
      ramp_months: ramp_months ?? 36,
      capex_per_passing: normalizedCapexPerPassing ?? 1200,
      install_cost_per_subscriber: resolvedInstallCostPerSub ?? 0,
      opex_per_sub: resolvedOpexPerSub ?? defaults.opex_per_sub ?? FALLBACK_DEFAULTS.opex_per_sub,
      opex_per_passing: resolvedOpexPerPassing ?? defaults.opex_per_passing ?? FALLBACK_DEFAULTS.opex_per_passing,
      min_monthly_opex: resolvedMinMonthlyOpex ?? defaults.min_monthly_opex ?? FALLBACK_DEFAULTS.min_monthly_opex,
      cogs_pct_revenue: resolvedCogsPctRevenue ?? defaults.cogs_pct_revenue ?? FALLBACK_DEFAULTS.cogs_pct_revenue,
      min_non_circuit_cogs: min_non_circuit_cogs ?? 0,
      subscription_months: subscription_months ?? ramp_months ?? defaults.subscription_months ?? FALLBACK_DEFAULTS.subscription_months,
      subscription_rate: effectiveSubscriptionRate ?? defaults.subscription_rate ?? FALLBACK_DEFAULTS.subscription_rate,
      circuit: circuit ?? null,
      circuit_type: circuit_type ?? null,
      ebitda_multiple: resolvedEbitdaMultiple ?? defaults.ebitda_multiple ?? FALLBACK_DEFAULTS.ebitda_multiple,
      discount_rate_pct: resolvedDiscountRatePct,
      analysis_months: 120,
      start_date: new Date().toISOString().split('T')[0],
      start_month_offset: 0
      },
      defaults_used: defaultsUsed
    };
  };

  const listMissingBaselineInputs = (inputs) => {
    const missing = [];
    const hasPositive = (value) => value !== null && value !== undefined && Number(value) > 0;
    if (!hasPositive(inputs.passings)) missing.push('passings');
    if (!hasPositive(inputs.build_months)) missing.push('build_months');
    if (!hasPositive(inputs.arpu_start)) missing.push('arpu_start');
    if (!hasPositive(inputs.capex_per_passing) && !hasPositive(inputs.total_capex)) missing.push('capex_per_passing');
    if (!hasPositive(inputs.opex_per_sub)) missing.push('opex_per_sub');
    const hasSubscriptionRate = hasPositive(inputs.subscription_rate) || hasPositive(inputs.penetration_target_pct);
    if (!hasSubscriptionRate) missing.push('subscription_rate');
    const hasSubscriptionMonths = hasPositive(inputs.subscription_months) || hasPositive(inputs.ramp_months);
    if (!hasSubscriptionMonths) missing.push('subscription_months');
    return missing;
  };

  const applyDefaultsForMissing = async () => {
    const missingWithInputs = missingData.filter((s) => Array.isArray(s.missing_inputs) && s.missing_inputs.length > 0);
    if (missingWithInputs.length === 0) {
      toast.error('No scenarios with missing inputs found');
      return;
    }

    setApplyingDefaults(true);
    let created = 0;
    let failed = 0;
    try {
      for (const scenario of missingWithInputs) {
        try {
          const model_profile = resolveScenarioProfile(scenario);
          const baselineResponse = await macEngineInvoke('createBaselineScenario', {
            project_id: scenario.project_id,
            scenario_name: scenario.scenario_name,
            fallback_defaults: defaultsForProfile(model_profile),
            model_profile,
            use_defaults: true
          });
          if (baselineResponse.data?.success) {
            created += 1;
          } else {
            failed += 1;
          }
        } catch (err) {
          console.error('Apply defaults failed:', err);
          failed += 1;
        }
      }

      toast.success(`Defaults applied: ${created}, failed: ${failed}`);
      setMissingData([]);
      if (isOpen) {
        setLoading(true);
        const projectsResponse = await runSSOTQuery({
          queryId: 'projects_pipeline',
          sql: PROJECTS_PIPELINE_SQL,
          label: 'Projects Pipeline'
        });
        const projectsMap = new Map();
        const projectRows = projectsResponse.data?.data_rows || [];
        projectRows.forEach(row => {
          const values = Array.isArray(row) ? row : Object.values(row);
          projectsMap.set(values[0], {
            project_id: values[0],
            entity: values[1] || '(Unmapped)',
            project_name: values[2] || '(Unmapped)',
            project_type: values[3] || '(Unmapped)',
            state: values[4] || '(Unmapped)',
            stage: values[5] || 'Unknown',
            priority: values[6] || 'Unranked'
          });
        });

        const allScenarios = [];
        for (const [project_id, project] of projectsMap) {
          const pushBaseline = () => {
            allScenarios.push({
              project_id,
              entity: project.entity,
              project_name: project.project_name,
              state: project.state,
              project_type: project.project_type,
              stage: project.stage,
              priority: project.priority,
              model_profile: inferModelProfileForProject(project),
              scenario_id: 'baseline',
              scenario_name: 'Baseline (from project)',
              start_date: null,
              start_month_offset: 0,
              is_test: false,
              scenario_inputs: null,
              latest_run: null,
              metrics: {},
              has_run: false,
              is_virtual: true
            });
          };

          try {
            const registryResponse = await macEngineInvoke('manageScenariosRegistry', {
              action: 'get',
              project_id
            });
            const scenarios = registryResponse.data?.registry?.scenarios || [];
            const hasBaselineScenario = scenarios.some(s =>
              String(s.scenario_id || '').toLowerCase() === 'baseline' ||
              String(s.scenario_name || '').toLowerCase().includes('baseline')
            );

            let runs = [];
            try {
              const outputsResponse = await macEngineInvoke('listProjectModelOutputs', {
                project_id,
                action: 'list'
              });
              runs = outputsResponse.data?.runs || [];
            } catch (err) {
              console.error(`Failed to load runs for ${project_id}:`, err);
            }

            for (const scenario of scenarios) {
              const scenarioRuns = runs.filter(r => r.scenario_id === scenario.scenario_id);
              const latestRun = scenarioRuns.length > 0 ? scenarioRuns[0] : null;
              allScenarios.push({
                project_id,
                entity: project.entity,
                project_name: project.project_name,
                state: project.state,
                project_type: project.project_type,
                stage: project.stage,
                priority: project.priority,
                model_profile: scenario.inputs?.model_profile || inferModelProfileForProject(project),
                scenario_id: scenario.scenario_id,
                scenario_name: scenario.scenario_name || 'Unnamed',
                start_date: scenario.inputs?.start_date,
                start_month_offset: scenario.inputs?.start_month_offset || 0,
                is_test: scenario.is_test || false,
                scenario_inputs: scenario.inputs || null,
                latest_run: latestRun,
                metrics: latestRun?.metrics || {},
                has_run: !!latestRun
              });
            }

            if (!hasBaselineScenario) {
              pushBaseline();
            }
          } catch (err) {
            console.error('Failed to refresh scenarios after defaults:', err);
            pushBaseline();
          }
        }

        setEnrichedScenarios(allScenarios);
      }
    } catch (err) {
      console.error('Apply defaults run failed:', err);
      toast.error(err.message || 'Failed to apply defaults');
    } finally {
      setApplyingDefaults(false);
      setLoading(false);
    }
  };

  const handleGenerateBaselines = async () => {
    const missingBaselines = enrichedScenarios
      .filter(s => s.scenario_id === 'baseline' && !s.has_run)
      .filter(s => modelProfileFilter === 'all' || resolveScenarioProfile(s) === modelProfileFilter);
    if (missingBaselines.length === 0) {
      toast.success('All projects already have baseline runs');
      return;
    }

    setBaselineBusy(true);
    let created = 0;
    let skipped = 0;
    const missingIssues = [];
    try {
      for (const scenario of missingBaselines) {
        try {
          const model_profile = resolveScenarioProfile(scenario);
          const baselineResponse = await macEngineInvoke('createBaselineScenario', {
            project_id: scenario.project_id,
            scenario_name: 'Baseline (from project)',
            fallback_defaults: defaultsForProfile(model_profile),
            model_profile,
            use_defaults: true
          });
          if (baselineResponse.data?.success) {
            created += 1;
          } else {
            skipped += 1;
            if (Array.isArray(baselineResponse.data?.missing_inputs)) {
              missingIssues.push({
                ...scenario,
                missing_inputs: baselineResponse.data.missing_inputs,
                defaults_used: baselineResponse.data.defaults_used || {}
              });
            }
          }
        } catch (err) {
          console.error('Baseline generation failed:', err);
          skipped += 1;
          missingIssues.push({ ...scenario, error: err.message || 'Baseline generation failed' });
        }
      }

      toast.success(`Baseline scenarios created: ${created}, skipped: ${skipped}`);
      if (missingIssues.length > 0) {
        setMissingData(missingIssues);
      }
    } catch (err) {
      console.error('Baseline generation failed:', err);
      toast.error(err.message || 'Failed to generate baselines');
    } finally {
      setBaselineBusy(false);
      setSelectedScenarios({});
      // Refresh scenarios after baseline generation
      if (isOpen) {
        setLoading(true);
        try {
          const projectsResponse = await runSSOTQuery({
            queryId: 'projects_pipeline',
            sql: PROJECTS_PIPELINE_SQL,
            label: 'Projects Pipeline'
          });
          const projectsMap = new Map();
          const projectRows = projectsResponse.data?.data_rows || [];
          projectRows.forEach(row => {
            const values = Array.isArray(row) ? row : Object.values(row);
            projectsMap.set(values[0], {
              project_id: values[0],
              entity: values[1] || '(Unmapped)',
              project_name: values[2] || '(Unmapped)',
              project_type: values[3] || '(Unmapped)',
              state: values[4] || '(Unmapped)',
              stage: values[5] || 'Unknown',
              priority: values[6] || 'Unranked'
            });
          });

          const allScenarios = [];
          for (const [project_id, project] of projectsMap) {
            const pushBaseline = () => {
              allScenarios.push({
                project_id,
                entity: project.entity,
                project_name: project.project_name,
                state: project.state,
                project_type: project.project_type,
                stage: project.stage,
                priority: project.priority,
                model_profile: inferModelProfileForProject(project),
                scenario_id: 'baseline',
                scenario_name: 'Baseline (from project)',
                start_date: null,
                start_month_offset: 0,
                is_test: false,
                scenario_inputs: null,
                latest_run: null,
                metrics: {},
                has_run: false,
                is_virtual: true
              });
            };

            const registryResponse = await macEngineInvoke('manageScenariosRegistry', {
              action: 'get',
              project_id
            });
            const scenarios = registryResponse.data?.registry?.scenarios || [];
            const hasBaselineScenario = scenarios.some(s =>
              String(s.scenario_id || '').toLowerCase() === 'baseline' ||
              String(s.scenario_name || '').toLowerCase().includes('baseline')
            );

            let runs = [];
            try {
              const outputsResponse = await macEngineInvoke('listProjectModelOutputs', {
                project_id,
                action: 'list'
              });
              runs = outputsResponse.data?.runs || [];
            } catch (err) {
              console.error(`Failed to load runs for ${project_id}:`, err);
            }

            for (const scenario of scenarios) {
              const scenarioRuns = runs.filter(r => r.scenario_id === scenario.scenario_id);
              const latestRun = scenarioRuns.length > 0 ? scenarioRuns[0] : null;
              allScenarios.push({
                project_id,
                entity: project.entity,
                project_name: project.project_name,
                state: project.state,
                project_type: project.project_type,
                stage: project.stage,
                priority: project.priority,
                model_profile: scenario.inputs?.model_profile || inferModelProfileForProject(project),
                scenario_id: scenario.scenario_id,
                scenario_name: scenario.scenario_name || 'Unnamed',
                start_date: scenario.inputs?.start_date,
                start_month_offset: scenario.inputs?.start_month_offset || 0,
                is_test: scenario.is_test || false,
                scenario_inputs: scenario.inputs || null,
                latest_run: latestRun,
                metrics: latestRun?.metrics || {},
                has_run: !!latestRun
              });
            }

            if (!hasBaselineScenario) {
              pushBaseline();
            }
          }

          setEnrichedScenarios(allScenarios);
        } catch (err) {
          console.error('Failed to refresh scenarios:', err);
        } finally {
          setLoading(false);
        }
      }
    }
  };

  const handleLoadSavedRun = async () => {
    if (!selectedRunId) {
      toast.error('Select a saved run');
      return;
    }
    try {
      const res = await macEngineInvoke('downloadPipelineResults', {
        action: 'get_portfolio',
        run_id: selectedRunId
      });
      const run = res.data?.run;
      if (!run || !Array.isArray(run.scenarios)) {
        toast.error('Saved run missing scenarios');
        return;
      }
      const nextSelected = {};
      run.scenarios.forEach((s) => {
        if (!s.project_id || !s.scenario_id) return;
        nextSelected[`${s.project_id}_${s.scenario_id}`] = true;
      });
      setSelectedScenarios(nextSelected);
      toast.success('Loaded saved run selections');
    } catch (err) {
      console.error('Failed to load saved run:', err);
      toast.error(err.message || 'Failed to load saved run');
    }
  };

  const handleRunPipeline = async () => {
    const selectedKeys = Object.keys(selectedScenarios).filter(k => selectedScenarios[k]);
    
    if (selectedKeys.length === 0) {
      toast.error('Select at least one scenario');
      return;
    }

    setRunning(true);
    setPipelineResults(null);
    setMissingData([]);

    try {
      const selectedList = filteredScenarios.filter(s => 
        selectedScenarios[`${s.project_id}_${s.scenario_id}`]
      );

      const selectedProfiles = new Set(selectedList.map((s) => resolveScenarioProfile(s)));
      if (selectedProfiles.size > 1) {
        toast.error('Mixed model profiles selected. Use the model profile filter to run like-for-like.');
        setRunning(false);
        return;
      }

      const missing = [];
      const validScenarios = [];

      for (const scenario of selectedList) {
        const scenarioProfile = resolveScenarioProfile(scenario);
        if (scenario.has_run) {
          validScenarios.push({
            ...scenario,
            model_profile: scenarioProfile,
            inputs_source: scenario.scenario_inputs ? 'saved_scenario' : scenario.inputs_source,
            input_qid: scenario.input_qid || null
          });
          continue;
        }

        try {
          let inputs = scenario.scenario_inputs || null;
          let inputQid = scenario.input_qid || null;
          let inputsSource = scenario.scenario_inputs ? 'saved_scenario' : scenario.inputs_source;
          let defaultsUsed = scenario.defaults_used || {};

          if (!inputs) {
            const detail = await runSSOTQuery({
              queryId: 'project_detail',
              label: 'Project Detail',
              params: { project_id: scenario.project_id }
            });
            const rows = detail.data?.data_rows || [];
            const columns = detail.data?.columns || [];
            inputQid = detail.data?.evidence?.athena_query_execution_id || null;
            if (!rows.length || !columns.length) {
              missing.push({ ...scenario, error: 'Missing project detail inputs' });
              continue;
            }
            const row = Array.isArray(rows[0]) ? rows[0] : Object.values(rows[0]);
            const built = buildBaselineInputs(row, columns, defaultsForProfile(scenarioProfile));
            inputs = built.inputs;
            defaultsUsed = built.defaults_used || {};
            inputsSource = 'ssot_project_detail';
          }

          inputs = { ...inputs, model_profile: inputs.model_profile || scenarioProfile };

          const missingInputs = listMissingBaselineInputs(inputs || {});
          const defaultsApplied = defaultsUsed && Object.keys(defaultsUsed).length > 0;
          const missingList = defaultsApplied
            ? [...new Set([...missingInputs, ...Object.keys(defaultsUsed)])]
            : missingInputs;
          if (missingList.length > 0) {
            missing.push({ ...scenario, missing_inputs: missingList, defaults_used: defaultsUsed });
            continue;
          }

          const runResponse = await macEngineInvoke('runProjectModel', {
            project_id: scenario.project_id,
            scenario: {
              scenario_id: scenario.scenario_id,
              scenario_name: scenario.scenario_name,
              inputs,
              is_test: scenario.is_test || false
            }
          });

          if (!runResponse.data?.success) {
            missing.push({ ...scenario, error: runResponse.data?.error || 'Run failed' });
            continue;
          }

          validScenarios.push({
            ...scenario,
            has_run: true,
            latest_run: { run_id: runResponse.data.run_id },
            metrics: runResponse.data.metrics || {},
            defaults_used: defaultsUsed
            ,
            inputs,
            input_qid: inputQid,
            inputs_source: inputsSource,
            model_profile: scenarioProfile
          });
        } catch (err) {
          missing.push({ ...scenario, error: err.message || 'Run failed' });
        }
      }

      if (missing.length > 0) {
        setMissingData(missing);
        toast.error('Missing inputs detected. Resolve or apply defaults before running.');
        setRunning(false);
        return;
      }

      if (validScenarios.length === 0) {
        toast.error('No valid scenarios to run');
        setRunning(false);
        return;
      }

      // Call portfolio analysis
      const response = await macEngineInvoke('runPortfolioAnalysisV2', {
        projects: validScenarios.map(s => ({
          project_id: s.project_id,
          scenario_id: s.scenario_id,
          run_id: s.latest_run.run_id,
          start_month_offset: s.start_month_offset
        })),
        discount_rate_pct: 10,
        analysis_months: 120
      });

      if (response.data.success) {
        // Calculate CAPEX by Stage
        const stageBreakdown = {};
        validScenarios.forEach(s => {
          const stage = s.stage || 'Unknown';
          if (!stageBreakdown[stage]) {
            stageBreakdown[stage] = {
              count: 0,
              total_capex_book: 0,
              actual_cash_invested: 0
            };
          }
          stageBreakdown[stage].count += 1;
          stageBreakdown[stage].total_capex_book += Number(s.metrics.total_capex_book || 0);
          stageBreakdown[stage].actual_cash_invested += Number(s.metrics.actual_cash_invested || 0);
        });

        const rawMonthly = response.data.monthly || response.data.portfolio_monthly || [];
        const monthly = Array.isArray(rawMonthly) ? rawMonthly : [];
        const rawSummary = response.data.portfolio_metrics || response.data.summary || {};
        const actualCashInvested = Number(rawSummary.actual_cash_invested || 0);
        const distributions = Number(
          rawSummary.distributions ||
          rawMonthly.reduce((sum, m) => sum + Math.max(0, Number(m.fcf) || 0), 0)
        );
        const paidIn = Number(rawSummary.paid_in || actualCashInvested);
        const moic = rawSummary.moic ?? (paidIn > 0 ? Number((distributions / paidIn).toFixed(2)) : null);

        setPipelineResults({
          ...response.data,
          monthly,
          portfolio_metrics: {
            total_capex_book: Number(rawSummary.total_capex_book || 0),
            actual_cash_invested: actualCashInvested,
            npv: Number(rawSummary.npv || 0),
            irr: rawSummary.irr ?? null,
            paid_in: paidIn,
            distributions,
            moic
          },
          stage_breakdown: stageBreakdown,
          scenario_count: validScenarios.length
        });
        setLastRunScenarios(validScenarios);
        toast.success('Pipeline analysis complete');
      } else {
        toast.error(response.data.message || 'Pipeline analysis failed');
      }
    } catch (error) {
      console.error('Pipeline run error:', error);
      toast.error('Error running pipeline: ' + error.message);
    } finally {
      setRunning(false);
    }
  };

  const buildScenarioExportRows = (scenarios) => {
    return scenarios.map((s) => ({
      project_id: s.project_id,
      project_name: s.project_name,
      scenario_id: s.scenario_id,
      scenario_name: s.scenario_name,
      entity: s.entity,
      state: s.state,
      stage: s.stage,
      priority: s.priority,
      model_profile: s.model_profile || resolveScenarioProfile(s),
      run_id: s.latest_run?.run_id || null,
      inputs_source: s.inputs_source || null,
      input_qid: s.input_qid || null,
      defaults_used: s.defaults_used ? JSON.stringify(s.defaults_used) : null,
      defaults_qid: defaultsQid || null,
      total_capex_book: s.metrics?.total_capex_book || null,
      actual_cash_invested: s.metrics?.actual_cash_invested || null,
      peak_external_cash: s.metrics?.peak_external_cash || null,
      npv: s.metrics?.npv || null,
      irr: s.metrics?.irr_annual_pct ?? s.metrics?.irr ?? null,
      moic: s.metrics?.moic || null,
      peak_subscribers: s.metrics?.peak_subscribers || null,
      peak_monthly_ebitda: s.metrics?.peak_monthly_ebitda || null
    }));
  };

  const buildScenarioDetailPayload = (scenarios) => {
    return scenarios.map((s) => ({
      project_id: s.project_id,
      project_name: s.project_name,
      scenario_id: s.scenario_id,
      scenario_name: s.scenario_name,
      entity: s.entity,
      state: s.state,
      stage: s.stage,
      priority: s.priority,
      model_profile: s.model_profile || resolveScenarioProfile(s),
      run_id: s.latest_run?.run_id || null,
      inputs_source: s.inputs_source || null,
      input_qid: s.input_qid || null,
      defaults_used: s.defaults_used || null,
      defaults_qid: defaultsQid || null,
      inputs: s.scenario_inputs || s.inputs || null,
      metrics: s.metrics || {}
    }));
  };

  const handleSaveRun = async (exportOnly = false) => {
    if (!pipelineResults || lastRunScenarios.length === 0) {
      toast.error('Run the pipeline first');
      return;
    }
    if (exportOnly) {
      setExportingRun(true);
    } else {
      setSavingRun(true);
    }
    try {
      const runName = `Pipeline Run ${new Date().toISOString()}`;
      const releaseTagSanitized = String(releaseTag || '').trim();
      const res = await macEngineInvoke('downloadPipelineResults', {
        action: 'save_portfolio',
        run_name: runName,
        release_tag: releaseTagSanitized || undefined,
        scenario_metrics: buildScenarioExportRows(lastRunScenarios),
        scenario_details: buildScenarioDetailPayload(lastRunScenarios),
        portfolio_summary: pipelineResults.portfolio_metrics,
        portfolio_monthly: pipelineResults.monthly
      });
      const reportUrl = res.data?.report_url;
      const artifactUrls = res.data?.artifact_urls || null;
      const reportKey = res.data?.outputs?.report_xlsx || null;
      const runId = res.data?.run_id;
      let resolvedReportUrl = reportUrl || artifactUrls?.report_xlsx || null;

      if (!resolvedReportUrl && reportKey) {
        try {
          const downloadResponse = await macEngineInvoke('downloadPipelineResults', {
            action: 'download',
            key: reportKey
          });
          resolvedReportUrl = downloadResponse.data?.download_url || null;
        } catch (err) {
          console.error('Failed to generate report download URL:', err);
        }
      }

      if (resolvedReportUrl) {
        setLastReportUrl(resolvedReportUrl);
        const effectiveReleaseTag = res.data?.release_tag || releaseTagSanitized || null;
        setLastRunArtifacts({
          report_url: resolvedReportUrl,
          ...artifactUrls,
          run_id: runId,
          release_tag: effectiveReleaseTag
        });
        if (exportOnly) {
          const anchor = document.createElement('a');
          anchor.href = resolvedReportUrl;
          anchor.target = '_blank';
          anchor.rel = 'noopener noreferrer';
          anchor.download = '';
          document.body.appendChild(anchor);
          anchor.click();
          document.body.removeChild(anchor);
          toast.success('Report export started');
        } else {
          toast.success('Pipeline run saved');
        }
        if (releaseTagSanitized) setReleaseTag('');
      } else {
        toast.error('Export link not generated. Run saved but report URL missing.');
      }

      if (runId) {
        try {
          const runRecord = await macEngineInvoke('downloadPipelineResults', {
            action: 'get_portfolio',
            run_id: runId
          });
          setLastRunRecord(runRecord.data?.run || null);
        } catch (err) {
          console.error('Failed to load run record:', err);
        }
      }
      await fetchSavedRuns();
    } catch (err) {
      console.error('Failed to save pipeline run:', err);
      toast.error(err.message || 'Failed to save pipeline run');
    } finally {
      setSavingRun(false);
      setExportingRun(false);
    }
  };

  // Group scenarios by entity, then project
  const filteredScenarios = modelProfileFilter === 'all'
    ? enrichedScenarios
    : enrichedScenarios.filter((scenario) => resolveScenarioProfile(scenario) === modelProfileFilter);

  useEffect(() => {
    if (modelProfileFilter === 'all') return;
    setSelectedScenarios((prev) => {
      const next = {};
      filteredScenarios.forEach((scenario) => {
        const key = `${scenario.project_id}_${scenario.scenario_id}`;
        if (prev[key]) next[key] = true;
      });
      return next;
    });
  }, [modelProfileFilter, enrichedScenarios]);

  const groupedScenarios = filteredScenarios.reduce((acc, scenario) => {
    const entity = scenario.entity;
    if (!acc[entity]) acc[entity] = {};
    const project = scenario.project_name;
    if (!acc[entity][project]) acc[entity][project] = [];
    acc[entity][project].push(scenario);
    return acc;
  }, {});

  const toggleScenario = (projectId, scenarioId) => {
    const key = `${projectId}_${scenarioId}`;
    setSelectedScenarios({ ...selectedScenarios, [key]: !selectedScenarios[key] });
  };

  const formatLoadedAt = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-[var(--mac-forest)]">
            Pipeline Runner — Model Multiple Scenarios Together
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-2">
            Select saved scenarios to model the entire pipeline
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>
                SSOT snapshot: {formatLoadedAt(projectsMeta?.loaded_at)}
              </span>
              {projectsMeta?.qid ? (
                <span className="font-mono">QID {projectsMeta.qid}</span>
              ) : null}
              {projectsMeta?.cached ? <Badge variant="outline">cached</Badge> : null}
              {projectsMeta?.stale ? <Badge variant="outline" className="border-amber-300 text-amber-700">stale</Badge> : null}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReloadNonce((n) => n + 1)}
              disabled={loading}
            >
              Refresh SSOT Snapshot
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Saved Runs */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Saved Pipeline Runs</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-3">
              <select
                className="border rounded px-3 py-2 text-sm bg-background"
                value={selectedRunId}
                onChange={(e) => setSelectedRunId(e.target.value)}
                disabled={loadingRuns}
              >
                <option value="">Select a saved run…</option>
                {savedRuns.map((run) => (
                  <option key={run.run_id} value={run.run_id}>
                    {run.run_name || run.run_id}
                    {run.release_tag ? ` [${run.release_tag}]` : ''}
                    {` (${run.scenario_count || 0} scenarios)`}
                  </option>
                ))}
              </select>
              <Button variant="outline" onClick={handleLoadSavedRun} disabled={!selectedRunId}>
                Load Run
              </Button>
              <Button variant="ghost" onClick={fetchSavedRuns} disabled={loadingRuns}>
                Refresh
              </Button>
            </CardContent>
          </Card>

          {/* Scenario Selection */}
          <Card>
            <CardHeader>
            <CardTitle className="text-base">Select Scenarios</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Model profile</span>
                  <select
                    className="border rounded px-3 py-2 text-sm bg-background"
                    value={modelProfileFilter}
                    onChange={(e) => setModelProfileFilter(e.target.value)}
                  >
                    {MODEL_PROFILE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-xs text-muted-foreground">
                  Profiles are assumption presets. Run like-for-like (single profile) for comparable portfolio outputs.
                </p>
                <p className="text-xs text-muted-foreground">
                  Defaults snapshot: {formatLoadedAt(defaultsMeta?.loaded_at)}{defaultsMeta?.qid ? ` (QID ${defaultsMeta.qid})` : ''}
                </p>
                <Button
                  onClick={handleGenerateBaselines}
                  disabled={baselineBusy || loading}
                  variant="outline"
                >
                  {baselineBusy ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : null}
                  Generate Baselines (Missing Runs)
                </Button>
              </div>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-[var(--mac-forest)]" />
                </div>
              ) : Object.keys(groupedScenarios).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No scenarios found. Create scenarios in the Scenario Modeling drawer.
                </p>
              ) : (
                Object.entries(groupedScenarios).map(([entity, projects]) => (
                  <div key={entity} className="space-y-2">
                    <h3 className="font-semibold text-sm text-[var(--mac-forest)]">{entity}</h3>
                    {Object.entries(projects).map(([projectName, scenarios]) => (
                      <div key={projectName} className="ml-4 space-y-1">
                        <p className="font-medium text-sm text-slate-700 dark:text-slate-300">{projectName}</p>
                        {scenarios.map(scenario => {
                          const key = `${scenario.project_id}_${scenario.scenario_id}`;
                          const isSelected = selectedScenarios[key];
                          const scenarioProfile = resolveScenarioProfile(scenario);
                          const scenarioProfileLabel = profileLabel(scenarioProfile);
                          
                          return (
                            <div 
                              key={scenario.scenario_id} 
                              className="ml-6 flex items-center gap-3 p-2 border rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
                            >
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleScenario(scenario.project_id, scenario.scenario_id)}
                              />
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm">{scenario.scenario_name}</p>
                                  <Badge variant="outline" className="text-xs">{scenario.stage}</Badge>
                                  <Badge variant="outline" className="text-xs bg-slate-100 text-slate-700 border-slate-200">
                                    {scenarioProfileLabel}
                                  </Badge>
                                  {scenario.is_test && (
                                    <Badge variant="outline" className="text-xs bg-amber-100 text-amber-800 border-amber-300">
                                      Test
                                    </Badge>
                                  )}
                                  {!scenario.has_run && (
                                    <Badge variant="outline" className="text-xs bg-red-100 text-red-800 border-red-300">
                                      No Latest Run
                                    </Badge>
                                  )}
                                  {scenario.defaults_used && Object.keys(scenario.defaults_used).length > 0 && (
                                    <Badge variant="outline" className="text-xs bg-amber-100 text-amber-800 border-amber-300">
                                      Defaulted Inputs
                                    </Badge>
                                  )}
                                </div>
                                {scenario.has_run && (
                                  <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                                    <span>NPV: ${Number(scenario.metrics.npv || 0).toLocaleString()}</span>
                                    <span>IRR: {scenario.metrics.irr_annual_pct != null ? `${scenario.metrics.irr_annual_pct}%` : 'N/A'}</span>
                                    <span>MOIC: {scenario.metrics.moic != null ? `${scenario.metrics.moic}x` : 'N/A'}</span>
                                    <span>Cash: ${Number(scenario.metrics.actual_cash_invested || 0).toLocaleString()}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Run Button */}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <label className="text-xs text-muted-foreground">Release Tag</label>
            <input
              type="text"
              value={releaseTag}
              onChange={(e) => setReleaseTag(e.target.value)}
              placeholder="INV-20260223-ProspectDemo-v1"
              className="border rounded px-3 py-2 text-sm bg-background min-w-[260px]"
            />
          </div>
          <div className="flex flex-wrap gap-3 justify-end">
            <Button
              variant="outline"
              onClick={() => handleSaveRun(false)}
              disabled={!pipelineResults || savingRun}
            >
              {savingRun ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Save Run
            </Button>
            <Button
              variant="outline"
              onClick={() => handleSaveRun(true)}
              disabled={!pipelineResults || exportingRun}
            >
              {exportingRun ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Export Full Report
            </Button>
            <Button
              onClick={handleRunPipeline}
              disabled={running || loading}
              className="bg-[var(--mac-forest)] hover:bg-[var(--mac-dark)]"
            >
              {running ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <TrendingUp className="w-4 h-4 mr-2" />
              )}
              Run Pipeline Analysis
            </Button>
          </div>
          {lastReportUrl && (
            <div className="text-xs text-muted-foreground flex items-center justify-end gap-2">
              <span>Latest report ready:</span>
              <Button
                variant="link"
                className="p-0 h-auto text-xs"
                onClick={() => window.open(lastReportUrl, '_blank', 'noopener')}
              >
                Open report
              </Button>
            </div>
          )}
          {lastRunArtifacts && (
            <div className="text-xs text-muted-foreground flex flex-wrap items-center justify-end gap-3">
              <span>Evidence pack:</span>
              {lastRunArtifacts.release_tag && (
                <Badge variant="outline" className="text-xs">
                  Release {lastRunArtifacts.release_tag}
                </Badge>
              )}
              {lastRunArtifacts.report_url && (
                <Button
                  variant="link"
                  className="p-0 h-auto text-xs"
                  onClick={() => window.open(lastRunArtifacts.report_url, '_blank', 'noopener')}
                >
                  Report XLSX
                </Button>
              )}
              {lastRunArtifacts.run_json && (
                <Button
                  variant="link"
                  className="p-0 h-auto text-xs"
                  onClick={() => window.open(lastRunArtifacts.run_json, '_blank', 'noopener')}
                >
                  Run JSON
                </Button>
              )}
              {lastRunArtifacts.summary_csv && (
                <Button
                  variant="link"
                  className="p-0 h-auto text-xs"
                  onClick={() => window.open(lastRunArtifacts.summary_csv, '_blank', 'noopener')}
                >
                  Summary CSV
                </Button>
              )}
              {lastRunArtifacts.monthly_csv && (
                <Button
                  variant="link"
                  className="p-0 h-auto text-xs"
                  onClick={() => window.open(lastRunArtifacts.monthly_csv, '_blank', 'noopener')}
                >
                  Monthly CSV
                </Button>
              )}
              {lastRunArtifacts.scenarios_csv && (
                <Button
                  variant="link"
                  className="p-0 h-auto text-xs"
                  onClick={() => window.open(lastRunArtifacts.scenarios_csv, '_blank', 'noopener')}
                >
                  Scenario CSV
                </Button>
              )}
              {lastRunArtifacts.run_id && <span>Run ID: {lastRunArtifacts.run_id}</span>}
            </div>
          )}

          {/* Missing Data Warning */}
          {missingData.length > 0 && (
            <Card className="border-amber-500 bg-amber-50 dark:bg-amber-950">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2 text-amber-800 dark:text-amber-200">
                  <AlertCircle className="w-4 h-4" />
                  Missing Runs
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-amber-700 dark:text-amber-300 mb-3">
                  Missing inputs block investor-grade runs. Resolve manually or apply defaults explicitly.
                </p>
                <div className="flex flex-wrap gap-2 mb-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={applyDefaultsForMissing}
                    disabled={applyingDefaults}
                  >
                    {applyingDefaults ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    Apply Defaults & Create Runs
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setMissingData([])}
                  >
                    Dismiss
                  </Button>
                </div>
                <ul className="text-xs text-amber-600 dark:text-amber-400 space-y-1">
                  {missingData.map(s => {
                    const reason = s.error
                      ? `Error: ${s.error}`
                      : Array.isArray(s.missing_inputs) && s.missing_inputs.length
                        ? `Missing inputs: ${s.missing_inputs.join(', ')}`
                        : null;
                    const defaultsNote = s.defaults_used && Object.keys(s.defaults_used).length > 0
                      ? `Defaults used: ${Object.keys(s.defaults_used).join(', ')}`
                      : null;
                    return (
                      <li key={`${s.project_id}_${s.scenario_id}`}>
                        {s.project_name} — {s.scenario_name}
                        {reason ? ` (${reason})` : ''}
                        {defaultsNote ? ` (${defaultsNote})` : ''}
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Pipeline Results */}
          {pipelineResults && (
            <Accordion type="multiple" defaultValue={['summary', 'scenarios', 'charts']} className="space-y-2">
              {lastRunScenarios.length > 0 && (
                <AccordionItem value="scenarios">
                  <AccordionTrigger>Scenario Financials</AccordionTrigger>
                  <AccordionContent>
                    <Card>
                      <CardContent className="pt-4">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="border-b">
                              <tr>
                                <th className="text-left p-2">Project</th>
                                <th className="text-left p-2">Scenario</th>
                                <th className="text-right p-2">CAPEX (Book)</th>
                                <th className="text-right p-2">Actual Cash</th>
                                <th className="text-right p-2">NPV</th>
                                <th className="text-right p-2">IRR</th>
                                <th className="text-right p-2">MOIC</th>
                                <th className="text-right p-2">Peak Subs</th>
                                <th className="text-left p-2">Model Profile</th>
                                <th className="text-left p-2">Run ID</th>
                              </tr>
                            </thead>
                            <tbody>
                              {lastRunScenarios.map((s) => (
                                <tr key={`${s.project_id}_${s.scenario_id}`} className="border-b">
                                  <td className="p-2 font-medium">{s.project_name}</td>
                                  <td className="p-2">{s.scenario_name}</td>
                                  <td className="text-right p-2">
                                    {s.metrics?.total_capex_book ? `$${Number(s.metrics.total_capex_book).toLocaleString()}` : '—'}
                                  </td>
                                  <td className="text-right p-2">
                                    {s.metrics?.actual_cash_invested ? `$${Number(s.metrics.actual_cash_invested).toLocaleString()}` : '—'}
                                  </td>
                                  <td className="text-right p-2">
                                    {s.metrics?.npv ? `$${Number(s.metrics.npv).toLocaleString()}` : '—'}
                                  </td>
                                  <td className="text-right p-2">
                                    {s.metrics?.irr_annual_pct != null
                                      ? `${Number(s.metrics.irr_annual_pct).toFixed(2)}%`
                                      : (s.metrics?.irr ? `${Number(s.metrics.irr).toFixed(2)}%` : '—')}
                                  </td>
                                  <td className="text-right p-2">
                                    {s.metrics?.moic ? `${Number(s.metrics.moic).toFixed(2)}x` : '—'}
                                  </td>
                                  <td className="text-right p-2">
                                    {s.metrics?.peak_subscribers ? Number(s.metrics.peak_subscribers).toLocaleString() : '—'}
                                  </td>
                                  <td className="p-2">{profileLabel(resolveScenarioProfile(s))}</td>
                                  <td className="p-2">{s.latest_run?.run_id || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    </Card>
                  </AccordionContent>
                </AccordionItem>
              )}
              {lastRunScenarios.length > 0 && (
                <AccordionItem value="scenario-details">
                  <AccordionTrigger>Scenario Inputs & Outputs</AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4">
                      {lastRunScenarios.map((s) => (
                        <Card key={`detail_${s.project_id}_${s.scenario_id}`}>
                          <CardHeader>
                            <CardTitle className="text-sm">
                              {s.project_name} — {s.scenario_name}
                            </CardTitle>
                            <div className="text-xs text-muted-foreground">
                              Model: {profileLabel(resolveScenarioProfile(s))} • Run ID: {s.latest_run?.run_id || '—'}
                            </div>
                          </CardHeader>
                          <CardContent className="pt-2">
                            <div className="grid md:grid-cols-2 gap-4 text-xs">
                              <div>
                                <div className="font-medium mb-2">Inputs</div>
                                <table className="w-full">
                                  <tbody>
                                    {Object.entries(s.inputs || s.scenario_inputs || {}).map(([key, value]) => (
                                      <tr key={key}>
                                        <td className="py-1 pr-2 text-muted-foreground">{key}</td>
                                        <td className="py-1">{value ?? '—'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                              <div>
                                <div className="font-medium mb-2">Outputs</div>
                                <table className="w-full">
                                  <tbody>
                                    {Object.entries(s.metrics || {}).map(([key, value]) => (
                                      <tr key={key}>
                                        <td className="py-1 pr-2 text-muted-foreground">{key}</td>
                                        <td className="py-1">{value ?? '—'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )}

              <AccordionItem value="summary">
                <AccordionTrigger>Pipeline Summary</AccordionTrigger>
                <AccordionContent>
                  <Card className="bg-gradient-to-r from-emerald-50 to-blue-50 dark:from-emerald-950 dark:to-blue-950 border-2">
                    <CardContent className="space-y-4 pt-4">
                      <div>
                        <p className="text-xs text-muted-foreground mb-2">Portfolio KPI Tiles</p>
                        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                          <div className="rounded-lg border bg-background/80 p-3">
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Gross CapEx</p>
                            <p className="text-lg font-bold">${pipelineResults.portfolio_metrics.total_capex_book.toLocaleString()}</p>
                          </div>
                          <div className="rounded-lg border bg-background/80 p-3">
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Net CapEx</p>
                            <p className="text-lg font-bold text-emerald-600">${pipelineResults.portfolio_metrics.actual_cash_invested.toLocaleString()}</p>
                          </div>
                          <div className="rounded-lg border bg-background/80 p-3">
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">NPV</p>
                            <p className={`text-lg font-bold ${pipelineResults.portfolio_metrics.npv > 0 ? 'text-green-600' : 'text-red-600'}`}>
                              ${pipelineResults.portfolio_metrics.npv.toLocaleString()}
                            </p>
                          </div>
                          <div className="rounded-lg border bg-background/80 p-3">
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">IRR</p>
                            <p className="text-lg font-bold text-green-600">
                              {pipelineResults.portfolio_metrics.irr != null ? `${pipelineResults.portfolio_metrics.irr}%` : 'N/A'}
                            </p>
                          </div>
                          <div className="rounded-lg border bg-background/80 p-3">
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">MOIC</p>
                            <p className="text-lg font-bold text-green-600">
                              {pipelineResults.portfolio_metrics.moic != null ? `${pipelineResults.portfolio_metrics.moic}x` : 'N/A'}
                            </p>
                          </div>
                          <div className="rounded-lg border bg-background/80 p-3">
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Scenarios</p>
                            <p className="text-lg font-bold">{pipelineResults.scenario_count}</p>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 pb-4 border-b">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Gross CapEx</p>
                          <p className="text-2xl font-bold">
                            ${pipelineResults.portfolio_metrics.total_capex_book.toLocaleString()}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">Sum of all selected scenario build costs</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Net CapEx (Actual Cash Invested)</p>
                          <p className="text-2xl font-bold text-emerald-600">
                            ${pipelineResults.portfolio_metrics.actual_cash_invested.toLocaleString()}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Peak external cash (cross-project reinvestment)
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-5 gap-4">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Pipeline NPV</p>
                          <p className={`text-xl font-bold ${
                            pipelineResults.portfolio_metrics.npv > 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            ${pipelineResults.portfolio_metrics.npv.toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Paid In</p>
                          <p className="text-xl font-bold">
                            ${pipelineResults.portfolio_metrics.paid_in?.toLocaleString() || pipelineResults.portfolio_metrics.actual_cash_invested.toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Distributions</p>
                          <p className="text-xl font-bold">
                            ${pipelineResults.portfolio_metrics.distributions?.toLocaleString() || 'N/A'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Pipeline MOIC</p>
                          <p className="text-xl font-bold text-green-600">
                            {pipelineResults.portfolio_metrics.moic || 'N/A'}x
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Scenarios</p>
                          <p className="text-xl font-bold">
                            {pipelineResults.scenario_count}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="stage">
                <AccordionTrigger>CAPEX by Stage</AccordionTrigger>
                <AccordionContent>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="border-b">
                            <tr>
                              <th className="text-left p-2">Stage</th>
                              <th className="text-right p-2">Count</th>
                              <th className="text-right p-2">Total CAPEX (Book)</th>
                              <th className="text-right p-2">Actual Cash Needed</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(pipelineResults.stage_breakdown || {}).map(([stage, data]) => (
                              <tr key={stage} className="border-b">
                                <td className="p-2 font-medium">{stage}</td>
                                <td className="text-right p-2">{data.count}</td>
                                <td className="text-right p-2">${data.total_capex_book.toLocaleString()}</td>
                                <td className="text-right p-2 font-semibold text-emerald-600">
                                  ${data.actual_cash_invested.toLocaleString()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="monthly">
                <AccordionTrigger>Monthly Cashflow Detail</AccordionTrigger>
                <AccordionContent>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="border-b">
                            <tr>
                              <th className="text-left p-2">Month</th>
                              <th className="text-right p-2">Subscribers</th>
                              <th className="text-right p-2">Revenue</th>
                              <th className="text-right p-2">EBITDA</th>
                              <th className="text-right p-2">CAPEX</th>
                              <th className="text-right p-2">FCF</th>
                              <th className="text-right p-2">Cum. External</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(pipelineResults.monthly || []).map((row) => (
                              <tr key={row.month} className="border-b">
                                <td className="p-2">{row.month}</td>
                                <td className="text-right p-2">{Math.round(Number(row.subscribers || 0)).toLocaleString()}</td>
                                <td className="text-right p-2">${Number(row.revenue || 0).toLocaleString()}</td>
                                <td className="text-right p-2">${Number(row.ebitda || 0).toLocaleString()}</td>
                                <td className="text-right p-2">${Number(row.capex_book || 0).toLocaleString()}</td>
                                <td className="text-right p-2">${Number(row.fcf || 0).toLocaleString()}</td>
                                <td className="text-right p-2 font-semibold">
                                  ${Number(row.cumulative_external_cash || 0).toLocaleString()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="evidence">
                <AccordionTrigger>Evidence & Defaults</AccordionTrigger>
                <AccordionContent>
                  <Card>
                    <CardContent className="pt-4">
                      {lastRunRecord && (
                        <div className="text-xs text-muted-foreground mb-4 space-y-1">
                          <div>Run ID: {lastRunRecord.run_id}</div>
                          <div>Run Name: {lastRunRecord.run_name}</div>
                          <div>Run At: {lastRunRecord.run_at}</div>
                          <div>Model Version: {lastRunRecord.model_version_hash || '—'}</div>
                          <div>
                            Guard Status: {lastRunRecord.guard_status ? JSON.stringify(lastRunRecord.guard_status) : '—'}
                          </div>
                          <div>
                            Data Freshness: {Array.isArray(lastRunRecord.data_freshness)
                              ? lastRunRecord.data_freshness.map((f) => `${f.name || f.table || ''}:${f.status || ''}`).join(', ')
                              : '—'}
                          </div>
                        </div>
                      )}
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="border-b">
                            <tr>
                              <th className="text-left p-2">Project</th>
                              <th className="text-left p-2">Scenario</th>
                              <th className="text-left p-2">Inputs Source</th>
                              <th className="text-left p-2">Input QID</th>
                              <th className="text-left p-2">Defaults Used</th>
                              <th className="text-left p-2">Defaults QID</th>
                            </tr>
                          </thead>
                          <tbody>
                            {lastRunScenarios.map((s) => (
                              <tr key={`${s.project_id}_${s.scenario_id}`} className="border-b">
                                <td className="p-2">{s.project_name}</td>
                                <td className="p-2">{s.scenario_name}</td>
                                <td className="p-2">{s.inputs_source || '—'}</td>
                                <td className="p-2">{s.input_qid || '—'}</td>
                                <td className="p-2">
                                  {s.defaults_used && Object.keys(s.defaults_used).length > 0
                                    ? Object.keys(s.defaults_used).join(', ')
                                    : '—'}
                                </td>
                                <td className="p-2">{defaultsQid || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="charts">
                <AccordionTrigger>Portfolio Charts</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Cumulative External Cash Requirement</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                          <LineChart data={pipelineResults.monthly}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="month" label={{ value: 'Month', position: 'insideBottom', offset: -5 }} />
                            <YAxis label={{ value: 'Cumulative External Cash ($)', angle: -90, position: 'insideLeft' }} />
                            <Tooltip formatter={(value) => `$${Number(value).toLocaleString()}`} />
                            <Line 
                              type="monotone" 
                              dataKey="cumulative_external_cash" 
                              stroke="#059669" 
                              strokeWidth={3}
                              name="External Cash Required"
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Pipeline EBITDA Over Time</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={250}>
                          <LineChart data={pipelineResults.monthly}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="month" />
                            <YAxis />
                            <Tooltip formatter={(value) => `$${Number(value).toLocaleString()}`} />
                            <Line 
                              type="monotone" 
                              dataKey="ebitda" 
                              stroke="#5C7B5F" 
                              strokeWidth={2}
                              name="Pipeline EBITDA"
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
