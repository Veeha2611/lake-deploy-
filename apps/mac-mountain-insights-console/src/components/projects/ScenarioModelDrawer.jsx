import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save, Download, Plus, TrendingUp, ChevronDown, ChevronRight, Eye, HelpCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import MetricExplanation from './MetricExplanation';

// Mac Mountain Financial Policy
const financePolicy = {
  irrGreenThresholdPct: 15,
  irrYellowThresholdPct: 0,
  moicGreenThreshold: 2.0,
  moicYellowThreshold: 1.0,
  npvGreenFloor: 0,
  npvYellowBandRatio: 0.05
};

function classifyIRR(irrPct) {
  if (irrPct == null || Number.isNaN(irrPct)) return 'unknown';
  if (irrPct <= financePolicy.irrYellowThresholdPct) return 'red';
  if (irrPct < financePolicy.irrGreenThresholdPct) return 'yellow';
  return 'green';
}

function classifyMOIC(moic) {
  if (moic == null || Number.isNaN(moic)) return 'unknown';
  if (moic <= financePolicy.moicYellowThreshold) return 'red';
  if (moic < financePolicy.moicGreenThreshold) return 'yellow';
  return 'green';
}

function classifyNPV(npv, initialInvestment) {
  if (npv == null || Number.isNaN(npv)) return 'unknown';
  const bandWidth = Math.abs(initialInvestment || 0) * financePolicy.npvYellowBandRatio;
  if (npv < -bandWidth) return 'red';
  if (Math.abs(npv) <= bandWidth) return 'yellow';
  return 'green';
}

// Display formatters for IRR and MOIC that handle null/non-convergent cases
function formatIrrDisplay(irrAnnualPct, irrStatus, irrReason) {
  // Non-convergent / null / non-finite → Not defined with reason
  if (irrStatus !== 'converged' || irrAnnualPct == null || !isFinite(irrAnnualPct)) {
    const reason = irrReason || 'No valid rate of return';
    return { label: 'Not defined', reason, color: 'neutral' };
  }

  // Apply v1.4.1 thresholds
  const color = classifyIRR(irrAnnualPct);
  return { label: `${irrAnnualPct.toFixed(1)}%`, reason: null, color };
}

function formatMoicDisplay(moic, moicStatus, moicReason) {
  // Not defined / null / non-finite → Not defined with reason
  if (moicStatus !== 'defined' || moic == null || !isFinite(moic)) {
    const reason = moicReason || 'No positive returns';
    return { label: 'Not defined', reason, color: 'neutral' };
  }

  // Apply v1.4.1 thresholds
  const color = classifyMOIC(moic);
  return { label: `${moic.toFixed(2)}x`, reason: null, color };
}

// Client-side financial calculations with EBITDA reinvestment logic
const calculateFinancials = (inputs) => {
  const {
    passings,
    build_months,
    total_capex,
    arpu_start = 63,
    penetration_start_pct = 0.10,
    penetration_target_pct = 0.40,
    ramp_months = 36,
    capex_per_passing = 1200,
    opex_per_sub = 25,
    discount_rate_pct = 10,
    analysis_months = 120
  } = inputs;

  const total_capex_book = total_capex || (passings * capex_per_passing);
  const monthly_rate = discount_rate_pct / 100 / 12;

  // Edge case: Zero or negative total CAPEX
  if (total_capex_book <= 0) {
    return {
      summary: {
        total_capex_book: 0,
        actual_cash_invested: 0,
        peak_external_cash: 0,
        npv: null,
        npv_color: 'unknown',
        irr_monthly_decimal: null,
        irr_annual_pct: null,
        irr_status: 'no_investment',
        irr_reason: 'Total CAPEX must be greater than zero',
        irr_color: 'unknown',
        distributed_sum_pos_fcf: 0,
        paid_in: 0,
        moic: null,
        moic_status: 'not_defined',
        moic_reason: 'No external investment required',
        moic_color: 'unknown',
        peak_subscribers: 0,
        peak_ebitda: 0,
        cashflow_summary: {
          min_fcf: 0,
          max_fcf: 0,
          count_pos_fcf_months: 0,
          count_neg_fcf_months: 0
        }
      },
      monthly: []
    };
  }

  // Calculate monthly cashflows with reinvestment tracking
  const monthly = [];
  const monthly_capex_schedule = total_capex_book / build_months;
  let cumulative_external_cash = 0;
  let peak_external_cash = 0;
  
  for (let month = 1; month <= analysis_months; month++) {
    // Subscriber growth
    const buildProgress = Math.min(month / build_months, 1);
    const rampProgress = Math.min(Math.max(month - build_months, 0) / ramp_months, 1);
    const penetration = penetration_start_pct + (penetration_target_pct - penetration_start_pct) * rampProgress;
    const subscribers = Math.floor(passings * buildProgress * penetration);
    
    const revenue = subscribers * arpu_start;
    const opex = subscribers * opex_per_sub;
    const ebitda = revenue - opex;
    const capex_book = month <= build_months ? monthly_capex_schedule : 0;
    
    // Reinvestment logic
    let external_cash_this_month = 0;
    if (ebitda < 0) {
      external_cash_this_month = capex_book - ebitda;
    } else {
      external_cash_this_month = Math.max(0, capex_book - ebitda);
    }
    
    cumulative_external_cash += external_cash_this_month;
    peak_external_cash = Math.max(peak_external_cash, cumulative_external_cash);
    
    const fcf = ebitda - capex_book;
    const discountFactor = Math.pow(1 + monthly_rate, -month);
    const pv = fcf * discountFactor;
    
    monthly.push({
      month,
      subscribers,
      penetration_pct: (penetration * 100).toFixed(2),
      revenue: revenue.toFixed(2),
      opex: opex.toFixed(2),
      ebitda: ebitda.toFixed(2),
      capex_book: capex_book.toFixed(2),
      external_cash_this_month: external_cash_this_month.toFixed(2),
      cumulative_external_cash: cumulative_external_cash.toFixed(2),
      fcf: fcf.toFixed(2),
      pv: pv.toFixed(2)
    });
  }

  const actual_cash_invested = peak_external_cash;
  
  // Calculate NPV using Actual Cash Invested
  const npv = monthly.reduce((sum, m) => sum + parseFloat(m.pv), -actual_cash_invested);
  
  // Calculate IRR using robust solver with explicit cashflow checks
  let irr_monthly_decimal = null;
  let irrStatus = 'converged';
  let irrReason = null;
  
  const cashflows = [-actual_cash_invested, ...monthly.map(m => parseFloat(m.fcf))];
  const minCF = Math.min(...cashflows);
  const maxCF = Math.max(...cashflows);
  const hasSignChange = minCF < 0 && maxCF > 0;
  
  if (actual_cash_invested <= 0) {
    irrStatus = 'no_investment';
    irrReason = 'Actual cash invested is zero or negative';
  } else if (!hasSignChange) {
    irrStatus = 'no_sign_change';
    irrReason = 'No sign change in cashflow sequence - IRR does not exist';
  } else {
    const testNPV = (rate) => {
      let npv = -actual_cash_invested;
      monthly.forEach((m, idx) => {
        npv += parseFloat(m.fcf) / Math.pow(1 + rate, idx + 1);
      });
      return npv;
    };
    
    // Newton-Raphson with bisection fallback
    let rate = 0.10;
    let converged = false;
    
    for (let i = 0; i < 50; i++) {
      let npvAtRate = -actual_cash_invested;
      let derivative = 0;
      
      monthly.forEach((m, idx) => {
        const factor = Math.pow(1 + rate, -(idx + 1));
        npvAtRate += parseFloat(m.fcf) * factor;
        derivative -= (idx + 1) * parseFloat(m.fcf) * factor / (1 + rate);
      });
      
      if (Math.abs(npvAtRate) < 0.001) {
        irr_monthly_decimal = rate;
        converged = true;
        break;
      }
      
      if (Math.abs(derivative) < 1e-10) break;
      
      rate = rate - npvAtRate / derivative;
      if (rate < -0.95) rate = -0.95;
      if (rate > 3.0) rate = 3.0;
    }
    
    // Bisection fallback
    if (!converged) {
      let low = -0.95, high = 3.0;
      for (let i = 0; i < 100; i++) {
        const mid = (low + high) / 2;
        const npvMid = testNPV(mid);
        
        if (Math.abs(npvMid) < 0.001) {
          irr_monthly_decimal = mid;
          converged = true;
          break;
        }
        
        const npvLow = testNPV(low);
        if (npvLow * npvMid < 0) high = mid;
        else low = mid;
        
        if (Math.abs(high - low) < 1e-7) {
          irr_monthly_decimal = mid;
          converged = true;
          break;
        }
      }
    }
    
    if (!converged) {
      irrStatus = 'did_not_converge';
      irrReason = 'IRR solver failed to converge';
    }
  }
  
  const irr_annual_pct = irr_monthly_decimal !== null 
    ? ((Math.pow(1 + irr_monthly_decimal, 12) - 1) * 100)
    : null;
  
  // Calculate MOIC using same cashflow vector as IRR/NPV
  const distributed_sum_pos_fcf = monthly.reduce((sum, m) => sum + Math.max(0, parseFloat(m.fcf)), 0);
  const paid_in = actual_cash_invested;
  let moic = null;
  let moicStatus = 'defined';
  let moicReason = null;

  if (paid_in <= 0) {
    moicStatus = 'not_defined';
    moicReason = 'No external investment required';
  } else if (distributed_sum_pos_fcf <= 0) {
    moicStatus = 'not_defined';
    moicReason = 'No positive cashflows over modeled horizon';
  } else {
    moic = distributed_sum_pos_fcf / paid_in;
  }
  
  // Cashflow summary for diagnostics
  const fcfValues = monthly.map(m => parseFloat(m.fcf));
  const min_fcf = Math.min(...fcfValues);
  const max_fcf = Math.max(...fcfValues);
  const count_pos_fcf_months = fcfValues.filter(f => f > 0).length;
  const count_neg_fcf_months = fcfValues.filter(f => f < 0).length;
  
  const peakSubscribers = Math.max(...monthly.map(m => m.subscribers));
  const peakEbitda = Math.max(...monthly.map(m => parseFloat(m.ebitda)));

  return {
    summary: {
      total_capex_book,
      actual_cash_invested,
      peak_external_cash,
      npv,
      npv_color: classifyNPV(npv, actual_cash_invested),
      irr_monthly_decimal,
      irr_annual_pct,
      irr_status: irrStatus,
      irr_reason: irrReason,
      irr_color: irr_annual_pct !== null ? classifyIRR(irr_annual_pct) : 'unknown',
      distributed_sum_pos_fcf,
      paid_in,
      moic,
      moic_status: moicStatus,
      moic_reason: moicReason,
      moic_color: moic !== null ? classifyMOIC(moic) : 'unknown',
      peak_subscribers: peakSubscribers,
      peak_ebitda: peakEbitda,
      cashflow_summary: {
        min_fcf: Math.round(min_fcf),
        max_fcf: Math.round(max_fcf),
        count_pos_fcf_months,
        count_neg_fcf_months
      }
    },
    monthly
  };
};

export default function ScenarioModelDrawer({ 
  isOpen, 
  onClose, 
  projectId, 
  projectName, 
  defaultTab = 'inputs',
  autoSelectScenarioId = null  // Used for "Generate Financial Report" to auto-select the newly created scenario
}) {
  const [inputs, setInputs] = useState({
    passings: '',
    build_months: '',
    total_capex: '',
    start_date: new Date().toISOString().split('T')[0],
    arpu_start: 63,
    penetration_start_pct: 10,
    penetration_target_pct: 40,
    ramp_months: 36,
    capex_per_passing: 1200,
    opex_per_sub: 25,
    discount_rate_pct: 10,
    analysis_months: 120
  });

  const [capexOverrideMode, setCapexOverrideMode] = useState(false);

  const [selectedScenarioId, setSelectedScenarioId] = useState(autoSelectScenarioId);
  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [viewContent, setViewContent] = useState(null);
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [metricExplanations, setMetricExplanations] = useState([]);
  const [scenarioName, setScenarioName] = useState('');

  // Fetch scenarios registry (scenarios.json)
  const { data: scenariosRegistry, refetch: refetchRegistry } = useQuery({
    queryKey: ['scenarios-registry', projectId],
    queryFn: async () => {
      const response = await base44.functions.invoke('manageScenariosRegistry', {
        action: 'get',
        project_id: projectId
      });
      return response.data.registry;
    },
    enabled: !!projectId && isOpen
  });

  // Fetch model outputs (runs)
  const { data: scenariosData, refetch: refetchOutputs } = useQuery({
    queryKey: ['project-scenarios', projectId],
    queryFn: async () => {
      const response = await base44.functions.invoke('listProjectModelOutputs', {
        project_id: projectId,
        action: 'list'
      });
      return response.data;
    },
    enabled: !!projectId && isOpen
  });

  const refetch = () => {
    refetchRegistry();
    refetchOutputs();
  };

  // Fetch project metadata for scenario naming
  const { data: projectData } = useQuery({
    queryKey: ['project-metadata', projectId],
    queryFn: async () => {
      const response = await base44.functions.invoke('aiLayerQuery', {
        template_id: 'freeform_sql_v1',
        params: {
          sql: `SELECT entity, project_name, passings, build_months, total_capex, arpu_start, penetration_start_pct, penetration_target_pct, ramp_months, capex_per_passing, opex_per_sub, discount_rate_pct FROM curated_core.projects_enriched WHERE project_id = '${projectId}' LIMIT 1`
        }
      });
      const row = response.data?.data_rows?.[0];
      if (row) {
        const values = Array.isArray(row) ? row : Object.values(row);
        return { 
          entity: values[0], 
          project_name: values[1],
          passings: values[2],
          build_months: values[3],
          total_capex: values[4],
          arpu_start: values[5],
          penetration_start_pct: values[6],
          penetration_target_pct: values[7],
          ramp_months: values[8],
          capex_per_passing: values[9],
          opex_per_sub: values[10],
          discount_rate_pct: values[11]
        };
      }
      return { entity: '', project_name: projectName };
    },
    enabled: !!projectId && isOpen
  });

  // Auto-populate inputs from Monday data on drawer open
  useEffect(() => {
    if (isOpen && projectData && !selectedScenarioId) {
      const updatedInputs = { ...inputs };
      let shouldUpdate = false;

      if (projectData.passings && !inputs.passings) {
        updatedInputs.passings = projectData.passings;
        shouldUpdate = true;
      }
      if (projectData.build_months && !inputs.build_months) {
        updatedInputs.build_months = projectData.build_months;
        shouldUpdate = true;
      }
      if (projectData.total_capex && !inputs.total_capex) {
        updatedInputs.total_capex = projectData.total_capex;
        shouldUpdate = true;
      }
      if (projectData.arpu_start) {
        updatedInputs.arpu_start = projectData.arpu_start;
        shouldUpdate = true;
      }
      if (projectData.penetration_start_pct) {
        updatedInputs.penetration_start_pct = projectData.penetration_start_pct * 100;
        shouldUpdate = true;
      }
      if (projectData.penetration_target_pct) {
        updatedInputs.penetration_target_pct = projectData.penetration_target_pct * 100;
        shouldUpdate = true;
      }
      if (projectData.ramp_months) {
        updatedInputs.ramp_months = projectData.ramp_months;
        shouldUpdate = true;
      }
      if (projectData.capex_per_passing) {
        updatedInputs.capex_per_passing = projectData.capex_per_passing;
        shouldUpdate = true;
      }
      if (projectData.opex_per_sub) {
        updatedInputs.opex_per_sub = projectData.opex_per_sub;
        shouldUpdate = true;
      }
      if (projectData.discount_rate_pct) {
        updatedInputs.discount_rate_pct = projectData.discount_rate_pct;
        shouldUpdate = true;
      }

      if (shouldUpdate) {
        setInputs(updatedInputs);
      }
    }
  }, [isOpen, projectData, selectedScenarioId]);

  // Compute default scenario name: "<entity> — <project_name> — Scenario <N>"
  const existingScenarioCount = scenariosRegistry?.scenarios?.filter(s => !s.is_test)?.length || 0;
  const entity = projectData?.entity || '';
  const pName = projectData?.project_name || projectName || 'Project';
  const defaultScenarioName = entity 
    ? `${entity} — ${pName} — Scenario ${existingScenarioCount + 1}`
    : `${pName} — Scenario ${existingScenarioCount + 1}`;
  
  // When drawer opens or registry changes, update scenario name if it's empty
  useEffect(() => {
    if (isOpen && !scenarioName) {
      setScenarioName(defaultScenarioName);
    }
  }, [isOpen, defaultScenarioName]);
  
  // When autoSelectScenarioId changes (from Generate Financial Report), update selectedScenarioId
  useEffect(() => {
    if (autoSelectScenarioId) {
      setSelectedScenarioId(autoSelectScenarioId);
    }
  }, [autoSelectScenarioId]);

  // Reset state when drawer closes
  useEffect(() => {
    if (!isOpen) {
      setScenarioName('');
      setSelectedScenarioId(null);
      setCapexOverrideMode(false);
    }
  }, [isOpen]);

  // Calculate effective total_capex for display and validation
  // In override mode, use manual total_capex; otherwise auto-compute
  const effectiveTotalCapex = capexOverrideMode 
    ? Number(inputs.total_capex) 
    : (Number(inputs.passings) * inputs.capex_per_passing);
  
  // Calculate implied capex per passing when in override mode
  const impliedCapexPerPassing = capexOverrideMode && inputs.passings 
    ? (Number(inputs.total_capex) / Number(inputs.passings))
    : null;
  
  // Button should be enabled when we have required inputs and valid effective total capex
  const canSave = inputs.passings && inputs.build_months && inputs.start_date && effectiveTotalCapex > 0;
  
  // Calculate results on every input change
  const results = inputs.passings && inputs.build_months ? calculateFinancials({
    ...inputs,
    passings: Number(inputs.passings),
    build_months: Number(inputs.build_months),
    total_capex: effectiveTotalCapex,
    penetration_start_pct: inputs.penetration_start_pct / 100,
    penetration_target_pct: inputs.penetration_target_pct / 100,
    discount_rate_pct: inputs.discount_rate_pct
  }) : null;

  const handleSaveScenario = async (saveAsNew = false) => {
    console.log('🚀 handleSaveScenario called', { saveAsNew, projectId, inputs });
    
    // Check Capital Committee permission (UI gate - server enforces)
    try {
      const user = await base44.auth.me();
      const CAPITAL_COMMITTEE = ['patrick.cochran@icloud.com', 'patch.cochran@macmtn.com'];
      if (!CAPITAL_COMMITTEE.includes(user?.email?.toLowerCase())) {
        console.error('❌ Permission denied - not Capital Committee');
        toast.error('Only Capital Committee members can save scenarios');
        return;
      }
      console.log('✅ Permission check passed');
    } catch (error) {
      console.error('❌ Permission check failed:', error);
      toast.error('Permission check failed');
      return;
    }

    // Validation
    if (!inputs.passings || !inputs.build_months) {
      console.error('❌ Validation failed: missing passings or build_months');
      toast.error('Required: Passings and Build Months');
      return;
    }

    if (!inputs.start_date) {
      console.error('❌ Validation failed: missing start_date');
      toast.error('Project Start Date is required');
      return;
    }

    const totalCapexValue = Number(inputs.total_capex) || (Number(inputs.passings) * inputs.capex_per_passing);
    if (!totalCapexValue || totalCapexValue <= 0) {
      console.error('❌ Validation failed: total_capex <= 0', totalCapexValue);
      toast.error('Total CAPEX must be greater than zero to calculate IRR/NPV/MOIC');
      return;
    }
    console.log('✅ All validations passed');

    setSaving(true);
    try {
      const scenario_id = saveAsNew ? `scenario_${Date.now()}` : (selectedScenarioId || `scenario_${Date.now()}`);

      // Determine final scenario name
      const finalScenarioName = (scenarioName && scenarioName.trim().length > 0)
        ? scenarioName.trim()
        : defaultScenarioName;

      // Calculate start_month_offset (months from today)
      const startDate = new Date(inputs.start_date);
      const today = new Date();
      const start_month_offset = Math.round(
        (startDate.getFullYear() - today.getFullYear()) * 12 + 
        (startDate.getMonth() - today.getMonth())
      );

      const scenarioInputs = {
        passings: Number(inputs.passings),
        build_months: Number(inputs.build_months),
        total_capex: effectiveTotalCapex,
        capex_per_passing: inputs.capex_per_passing,
        capex_override_mode: capexOverrideMode,
        start_date: inputs.start_date,
        start_month_offset: start_month_offset,
        arpu_start: inputs.arpu_start,
        penetration_start_pct: inputs.penetration_start_pct / 100,
        penetration_target_pct: inputs.penetration_target_pct / 100,
        ramp_months: inputs.ramp_months,
        opex_per_sub: inputs.opex_per_sub,
        discount_rate_pct: inputs.discount_rate_pct,
        analysis_months: inputs.analysis_months
      };

      const requestPayload = {
        project_id: projectId,
        scenario: {
          scenario_id,
          scenario_name: finalScenarioName,
          inputs: scenarioInputs,
          is_test: false
        }
      };
      
      console.log('📤 Calling runProjectModel with payload:', requestPayload);
      
      // Run the model - registry update happens inside runProjectModel
      const response = await base44.functions.invoke('runProjectModel', requestPayload);
      
      console.log('📥 runProjectModel response:', response.data);

      if (response.data.success) {
        console.log('✅ Scenario saved successfully');
        toast.success(saveAsNew ? 'New scenario saved!' : 'Scenario saved!');
        setSelectedScenarioId(scenario_id);

        // Store metric explanations for display
        if (response.data.metric_explanations) {
          setMetricExplanations(response.data.metric_explanations);
        }

        // Create Monday subitem if project has monday_item_id
        try {
          if (projectData?.monday_item_id) {
            const mondayBoardId = Deno.env?.get?.('MONDAY_BOARD_ID') || process.env.MONDAY_BOARD_ID;
            const metrics = response.data.metrics || results?.summary || {};
            
            await base44.functions.invoke('createMondayScenarioSubitem', {
              monday_item_id: parseInt(projectData.monday_item_id),
              monday_board_id: mondayBoardId,
              scenario_name: finalScenarioName,
              npv: metrics.npv || 0,
              irr_pct: metrics.irr_annual_pct || 0,
              moic: metrics.moic || 0,
              cash_invested: metrics.actual_cash_invested || 0,
              peak_subs: metrics.peak_subscribers || 0,
              peak_ebitda: metrics.peak_ebitda || 0
            });
            console.log('✅ Monday subitem created');
          }
        } catch (err) {
          console.warn('Warning: Monday subitem creation failed', err.message);
          // Don't fail—subitem creation is optional
        }

        // Force refresh both registry and outputs
        console.log('🔄 Refetching registry and outputs...');
        await refetchRegistry();
        await refetchOutputs();
        console.log('✅ Refetch complete');

        // Switch to Saved Scenarios tab to show the result
        setActiveTab('scenarios');
      } else {
        console.error('❌ runProjectModel returned success=false:', response.data);
        toast.error(response.data.error || response.data.message || 'Failed to save scenario');
      }
    } catch (error) {
      console.error('❌ Save scenario error:', error);
      console.error('Error response:', error.response);
      const errorMsg = error.response?.data?.error || error.response?.data?.message || error.message;
      toast.error('Error saving scenario: ' + errorMsg);
    } finally {
      setSaving(false);
    }
  };

  const handleLoadScenario = async (scenario) => {
    try {
      // Load from registry (which has the inputs)
      if (scenario.inputs) {
        setInputs({
          passings: scenario.inputs.passings,
          build_months: scenario.inputs.build_months,
          total_capex: scenario.inputs.total_capex || (scenario.inputs.passings * (scenario.inputs.capex_per_passing || 1200)),
          start_date: scenario.inputs.start_date || new Date().toISOString().split('T')[0],
          arpu_start: scenario.inputs.arpu_start || 63,
          penetration_start_pct: (scenario.inputs.penetration_start_pct * 100) || 10,
          penetration_target_pct: (scenario.inputs.penetration_target_pct * 100) || 40,
          ramp_months: scenario.inputs.ramp_months || 36,
          capex_per_passing: scenario.inputs.capex_per_passing || 1200,
          opex_per_sub: scenario.inputs.opex_per_sub || 25,
          discount_rate_pct: scenario.inputs.discount_rate_pct || 10,
          analysis_months: scenario.inputs.analysis_months || 120
        });
        
        // Restore override mode state
        setCapexOverrideMode(scenario.inputs.capex_override_mode || false);
        
        // Use scenario name or fallback to legacy naming
        const displayName = scenario.scenario_name && scenario.scenario_name.trim().length > 0
          ? scenario.scenario_name
          : `${projectName} — Scenario (legacy)`;
        setScenarioName(displayName);
        setSelectedScenarioId(scenario.scenario_id);
        toast.success('Scenario loaded');
      }
    } catch (error) {
      console.error('Load scenario error:', error);
      toast.error('Failed to load scenario');
    }
  };

  const handleDownload = async (file) => {
    try {
      const response = await base44.functions.invoke('listProjectModelOutputs', {
        project_id: projectId,
        action: 'download',
        key: file.key
      });

      if (response.data.download_url) {
        window.location.assign(response.data.download_url);
        toast.success('Download started');
      }
    } catch (error) {
      toast.error('Download failed');
    }
  };

  const handleViewContent = async (file) => {
    try {
      const response = await base44.functions.invoke('listProjectModelOutputs', {
        project_id: projectId,
        action: 'content',
        key: file.key
      });

      setViewContent({ name: file.file_name, content: response.data.content });
    } catch (error) {
      toast.error('Failed to load content');
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-[var(--mac-forest)]">
              Model Scenarios — {projectName}
            </DialogTitle>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="py-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="inputs">Scenario Inputs</TabsTrigger>
              <TabsTrigger value="scenarios">Saved Scenarios</TabsTrigger>
            </TabsList>

            <TabsContent value="inputs" className="space-y-6">
              <TooltipProvider>
              {/* Scenario Name */}
              <div>
                <Label>Scenario Name</Label>
                <Input
                  value={scenarioName}
                  onChange={(e) => setScenarioName(e.target.value)}
                  placeholder="e.g., Base Case"
                  className="mt-2"
                />
              </div>

              {/* Required Inputs */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Required Inputs</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <div className="flex items-center gap-1 mb-2">
                      <Label>Project Start Date *</Label>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>Calendar date when this project begins construction. Critical for portfolio timing analysis.</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Input
                      type="date"
                      value={inputs.start_date}
                      onChange={(e) => setInputs({...inputs, start_date: e.target.value})}
                    />
                    {selectedScenarioId && !inputs.start_date && (
                      <p className="text-xs text-amber-600 mt-1">
                        (Legacy scenario – start date defaulted to today; please review)
                      </p>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-1 mb-2">
                      <Label>Passings (Homes) *</Label>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>Total homes/lots passed by the build. This drives subscriber counts.</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Input
                      type="number"
                      value={inputs.passings}
                      onChange={(e) => setInputs({...inputs, passings: e.target.value})}
                      placeholder="10000"
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-1 mb-2">
                      <Label>Build Months *</Label>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>How long the build takes. Faster build usually increases early cashflows.</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Input
                      type="number"
                      value={inputs.build_months}
                      onChange={(e) => setInputs({...inputs, build_months: e.target.value})}
                      placeholder="18"
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-1 mb-2">
                      <Label>Total Capex ($) *</Label>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>Total project investment. Required for IRR/MOIC. Default auto-computes as passings × capex per passing.</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        value={capexOverrideMode ? inputs.total_capex : (inputs.passings ? inputs.passings * inputs.capex_per_passing : '')}
                        onChange={(e) => {
                          const totalCapex = e.target.value;
                          setInputs({...inputs, total_capex: totalCapex});
                          setCapexOverrideMode(true);
                        }}
                        placeholder="12000000"
                        className={capexOverrideMode ? 'border-amber-500' : ''}
                      />
                      {capexOverrideMode && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setCapexOverrideMode(false);
                            setInputs({...inputs, total_capex: ''});
                          }}
                          className="whitespace-nowrap"
                        >
                          Revert
                        </Button>
                      )}
                    </div>
                    {capexOverrideMode && impliedCapexPerPassing && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Implied: ${impliedCapexPerPassing.toLocaleString()} per passing
                      </p>
                    )}
                    {!capexOverrideMode && inputs.passings && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Auto-computed: {inputs.passings} × ${inputs.capex_per_passing} = ${(inputs.passings * inputs.capex_per_passing).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-1 mb-2">
                      <Label>Discount Rate (%) *</Label>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>Used to compute NPV (Net Present Value).</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Input
                      type="number"
                      value={inputs.discount_rate_pct}
                      onChange={(e) => setInputs({...inputs, discount_rate_pct: Number(e.target.value)})}
                      placeholder="10"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Instant Results */}
              {results && (
                <Card className="bg-gradient-to-r from-emerald-50 to-blue-50 dark:from-emerald-950 dark:to-blue-950 border-2">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <TrendingUp className="w-4 h-4" />
                      Instant Results
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Two CAPEX numbers - Alex's core ask */}
                    <div className="grid grid-cols-2 gap-4 pb-4 border-b">
                      <div>
                        <div className="flex items-center gap-1 mb-1">
                          <p className="text-xs text-muted-foreground">Total CAPEX (Book)</p>
                          <MetricExplanation explanation={metricExplanations.find(e => e.metric_name === "Total CAPEX (Book)")} />
                        </div>
                        <p className="text-lg font-bold">${results.summary.total_capex_book.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground mt-1">Cost to build if you never reinvest EBITDA</p>
                      </div>
                      <div>
                        <div className="flex items-center gap-1 mb-1">
                          <p className="text-xs text-muted-foreground">Actual Cash Invested</p>
                          <MetricExplanation explanation={metricExplanations.find(e => e.metric_name === "Actual Cash Invested")} />
                        </div>
                        <p className="text-lg font-bold text-emerald-600">${results.summary.actual_cash_invested.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          External cash needed (EBITDA fills ${(results.summary.total_capex_book - results.summary.actual_cash_invested).toLocaleString()})
                        </p>
                      </div>
                    </div>

                    {/* Returns */}
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <div className="flex items-center gap-1 mb-1">
                          <p className="text-xs text-muted-foreground">NPV</p>
                          <MetricExplanation explanation={metricExplanations.find(e => e.metric_name === "NPV (Net Present Value)")} />
                        </div>
                        {results.summary.npv !== null ? (
                          <p className={`text-lg font-bold ${
                            results.summary.npv_color === 'green' ? 'text-green-600' :
                            results.summary.npv_color === 'yellow' ? 'text-yellow-600' :
                            results.summary.npv_color === 'red' ? 'text-red-600' : ''
                          }`}>
                            ${results.summary.npv.toLocaleString(undefined, {maximumFractionDigits: 0})}
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground">Not calculated</p>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-1 mb-1">
                          <p className="text-xs text-muted-foreground">IRR</p>
                          <MetricExplanation explanation={metricExplanations.find(e => e.metric_name === "IRR (Internal Rate of Return)")} />
                        </div>
                        {(() => {
                          const irrDisplay = formatIrrDisplay(results.summary.irr_annual_pct, results.summary.irr_status, results.summary.irr_reason);
                          return (
                            <div>
                              <p className={`text-lg font-bold ${
                                irrDisplay.color === 'green' ? 'text-green-600' :
                                irrDisplay.color === 'yellow' ? 'text-yellow-600' :
                                irrDisplay.color === 'red' ? 'text-red-600' :
                                'text-muted-foreground'
                              }`}>
                                {irrDisplay.label}
                              </p>
                              {irrDisplay.reason && (
                                <p className="text-xs text-muted-foreground mt-1">{irrDisplay.reason}</p>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                      <div>
                        <div className="flex items-center gap-1 mb-1">
                          <p className="text-xs text-muted-foreground">MOIC</p>
                          <MetricExplanation explanation={metricExplanations.find(e => e.metric_name === "MOIC (Multiple on Invested Capital)")} />
                        </div>
                        {(() => {
                          const moicDisplay = formatMoicDisplay(results.summary.moic, results.summary.moic_status, results.summary.moic_reason);
                          return (
                            <div>
                              <p className={`text-lg font-bold ${
                                moicDisplay.color === 'green' ? 'text-green-600' :
                                moicDisplay.color === 'yellow' ? 'text-yellow-600' :
                                moicDisplay.color === 'red' ? 'text-red-600' :
                                'text-muted-foreground'
                              }`}>
                                {moicDisplay.label}
                              </p>
                              {moicDisplay.reason && (
                                <p className="text-xs text-muted-foreground mt-1">{moicDisplay.reason}</p>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Adjustable Inputs */}
              <Card>
                <CardHeader className="cursor-pointer" onClick={() => setShowAdvanced(!showAdvanced)}>
                  <CardTitle className="text-base flex items-center gap-2">
                    {showAdvanced ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    Advanced Inputs
                  </CardTitle>
                </CardHeader>
                {showAdvanced && (
                  <CardContent className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-center gap-1 mb-2">
                        <Label>ARPU Start ($)</Label>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>Starting monthly revenue per subscriber.</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <Input
                        type="number"
                        value={inputs.arpu_start}
                        onChange={(e) => setInputs({...inputs, arpu_start: Number(e.target.value)})}
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-1 mb-2">
                        <Label>Starting Penetration (%)</Label>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>Penetration rate at month 1 (as a percentage, e.g., 10 for 10%).</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <Input
                        type="number"
                        value={inputs.penetration_start_pct}
                        onChange={(e) => setInputs({...inputs, penetration_start_pct: Number(e.target.value)})}
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-1 mb-2">
                        <Label>Target Penetration (%)</Label>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>Where penetration levels off (e.g., 40 for 40%).</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <Input
                        type="number"
                        value={inputs.penetration_target_pct}
                        onChange={(e) => setInputs({...inputs, penetration_target_pct: Number(e.target.value)})}
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-1 mb-2">
                        <Label>Ramp Months</Label>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>How many months it takes to reach target penetration.</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <Input
                        type="number"
                        value={inputs.ramp_months}
                        onChange={(e) => setInputs({...inputs, ramp_months: Number(e.target.value)})}
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-1 mb-2">
                        <Label>CapEx per Passing ($)</Label>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>Upfront build cost per passing.</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <Input
                        type="number"
                        value={inputs.capex_per_passing}
                        onChange={(e) => setInputs({...inputs, capex_per_passing: Number(e.target.value)})}
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-1 mb-2">
                        <Label>OpEx per Sub ($)</Label>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>Monthly operating cost per subscriber.</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <Input
                        type="number"
                        value={inputs.opex_per_sub}
                        onChange={(e) => setInputs({...inputs, opex_per_sub: Number(e.target.value)})}
                      />
                    </div>

                    <div>
                      <div className="flex items-center gap-1 mb-2">
                        <Label>Analysis Months</Label>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>How many months to model (default 120 for 10-year projection).</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <Input
                        type="number"
                        value={inputs.analysis_months}
                        onChange={(e) => setInputs({...inputs, analysis_months: Number(e.target.value)})}
                      />
                    </div>
                  </CardContent>
                )}
              </Card>

              {/* Monthly Preview */}
              {results && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Monthly Economics Preview (First 24 months)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left p-2">Month</th>
                            <th className="text-right p-2">Subs</th>
                            <th className="text-right p-2">Revenue</th>
                            <th className="text-right p-2">EBITDA</th>
                            <th className="text-right p-2">CAPEX (Book)</th>
                            <th className="text-right p-2">External Cash</th>
                            <th className="text-right p-2">Cum. External</th>
                          </tr>
                        </thead>
                        <tbody>
                          {results.monthly.slice(0, 24).map((row) => (
                            <tr key={row.month} className="border-b">
                              <td className="p-2">{row.month}</td>
                              <td className="text-right p-2">{row.subscribers}</td>
                              <td className="text-right p-2">${Number(row.revenue).toLocaleString()}</td>
                              <td className="text-right p-2">${Number(row.ebitda).toLocaleString()}</td>
                              <td className="text-right p-2">${Number(row.capex_book).toLocaleString()}</td>
                              <td className="text-right p-2">${Number(row.external_cash_this_month).toLocaleString()}</td>
                              <td className="text-right p-2 font-semibold">${Number(row.cumulative_external_cash).toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Validation Messages */}
              {(!inputs.passings || !inputs.build_months) && (
                <div className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                  ⚠️ Enter Passings and Build Months to save a scenario.
                </div>
              )}
              {inputs.passings && inputs.build_months && effectiveTotalCapex <= 0 && (
                <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-3">
                  ⚠️ Total CAPEX must be greater than zero to calculate IRR/NPV/MOIC. Current: ${effectiveTotalCapex.toLocaleString()}
                </div>
              )}
              {!inputs.start_date && (
                <div className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                  ⚠️ Project Start Date is required for portfolio timing analysis.
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3 border-t pt-4">
                <Button variant="outline" onClick={onClose}>Close</Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleSaveScenario(true)}
                        disabled={saving || !canSave}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Save as New
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Creates a new scenario so you can compare options</p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button
                        type="button"
                        onClick={() => handleSaveScenario(false)}
                        disabled={saving || !canSave}
                        className="bg-[var(--mac-forest)] hover:bg-[var(--mac-dark)]"
                      >
                        {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                        Save Scenario
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Overwrites the current scenario with updated inputs</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              </TooltipProvider>
              </TabsContent>

            <TabsContent value="scenarios" className="space-y-4">
              {scenariosData?.runs?.length > 0 ? (
                // Group runs by scenario_id and show latest
                (() => {
                  const scenarioMap = new Map();
                  scenariosData.runs.forEach(run => {
                    // NEVER use "Unnamed Scenario" - always generate a proper name
                    const runName = (run.scenario_name && run.scenario_name.trim().length > 0 && run.scenario_name !== 'Unnamed Scenario')
                      ? run.scenario_name
                      : null;
                    
                    if (!scenarioMap.has(run.scenario_id)) {
                      scenarioMap.set(run.scenario_id, {
                        scenario_id: run.scenario_id,
                        scenario_name: runName,
                        runs: []
                      });
                    }
                    scenarioMap.get(run.scenario_id).runs.push(run);
                  });
                  
                  return Array.from(scenarioMap.values()).map((scenario) => {
                    const runs = scenario.runs.sort((a, b) => 
                      new Date(b.created) - new Date(a.created)
                    );
                    const latestRun = runs[0];

                    // Handle scenario naming with fallback for legacy/unnamed scenarios
                    // NEVER show "Unnamed Scenario"
                    const displayName = (scenario.scenario_name && scenario.scenario_name.trim().length > 0 && scenario.scenario_name !== 'Unnamed Scenario')
                      ? scenario.scenario_name
                      : `${projectName} — Scenario (legacy)`;
                    
                    // Check if this scenario is the auto-selected one (from Generate Financial Report)
                    const isAutoSelected = selectedScenarioId === scenario.scenario_id;

                    return (
                      <Card 
                        key={scenario.scenario_id} 
                        className={`border-l-4 ${isAutoSelected ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20' : 'border-[var(--mac-forest)]'}`}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-semibold">{displayName}</h4>
                                {isAutoSelected && (
                                  <Badge variant="outline" className="text-xs bg-emerald-100 text-emerald-800 border-emerald-300">
                                    Just Created
                                  </Badge>
                                )}
                                {latestRun.is_test && (
                                  <Badge variant="outline" className="text-xs bg-amber-100 text-amber-800 border-amber-300">
                                    Test
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Latest run: {new Date(latestRun.created).toLocaleDateString()} • {runs.length} run{runs.length > 1 ? 's' : ''}
                              </p>
                              {latestRun.inputs?.start_date && (
                                <p className="text-xs text-muted-foreground">
                                  Start date: {new Date(latestRun.inputs.start_date).toLocaleDateString()}
                                  {!latestRun.inputs.start_date && ' (defaulted)'}
                                </p>
                              )}
                              </div>
                          </div>
                          
                          {/* Show metrics summary for the latest run */}
                          {latestRun.metrics && (
                            <div className="space-y-3 mb-4">
                              {/* Two CAPEX numbers */}
                              <div className="grid grid-cols-2 gap-2 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border-l-4 border-emerald-500">
                                <div>
                                  <p className="text-xs text-muted-foreground">Total CAPEX (Book)</p>
                                  <p className="font-semibold text-sm">
                                    ${Number(latestRun.metrics.total_capex_book || latestRun.metrics.initial_investment || 0).toLocaleString()}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">Actual Cash Invested</p>
                                  <p className="font-semibold text-sm text-emerald-600">
                                    ${Number(latestRun.metrics.actual_cash_invested || latestRun.metrics.peak_external_cash || latestRun.metrics.initial_investment || 0).toLocaleString()}
                                  </p>
                                </div>
                              </div>

                              {/* Returns */}
                              <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                                <div>
                                  <p className="text-xs text-muted-foreground">NPV</p>
                                  <p className={`font-semibold text-sm ${
                                    latestRun.metrics.npv_color === 'green' ? 'text-green-600' :
                                    latestRun.metrics.npv_color === 'yellow' ? 'text-yellow-600' :
                                    latestRun.metrics.npv_color === 'red' ? 'text-red-600' : ''
                                  }`}>
                                    ${Number(latestRun.metrics.npv || 0).toLocaleString()}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">IRR</p>
                                  {(() => {
                                    const irrValue = latestRun.metrics.irr_annual_pct ? parseFloat(latestRun.metrics.irr_annual_pct) : null;
                                    const irrStatus = latestRun.metrics.irr_status || (irrValue != null ? 'converged' : 'did_not_converge');
                                    const irrReason = latestRun.metrics.irr_reason;
                                    const irrDisplay = formatIrrDisplay(irrValue, irrStatus, irrReason);
                                    return (
                                      <div>
                                        <p className={`font-semibold text-sm ${
                                          irrDisplay.color === 'green' ? 'text-green-600' :
                                          irrDisplay.color === 'yellow' ? 'text-yellow-600' :
                                          irrDisplay.color === 'red' ? 'text-red-600' :
                                          'text-muted-foreground'
                                        }`}>
                                          {irrDisplay.label}
                                        </p>
                                        {irrDisplay.reason && (
                                          <p className="text-xs text-muted-foreground">{irrDisplay.reason}</p>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">MOIC</p>
                                  {(() => {
                                    const moicValue = latestRun.metrics.moic ? parseFloat(latestRun.metrics.moic) : null;
                                    const moicStatus = latestRun.metrics.moic_status || (moicValue != null ? 'defined' : 'not_defined');
                                    const moicReason = latestRun.metrics.moic_reason;
                                    const moicDisplay = formatMoicDisplay(moicValue, moicStatus, moicReason);
                                    return (
                                      <div>
                                        <p className={`font-semibold text-sm ${
                                          moicDisplay.color === 'green' ? 'text-green-600' :
                                          moicDisplay.color === 'yellow' ? 'text-yellow-600' :
                                          moicDisplay.color === 'red' ? 'text-red-600' :
                                          'text-muted-foreground'
                                        }`}>
                                          {moicDisplay.label}
                                        </p>
                                        {moicDisplay.reason && (
                                          <p className="text-xs text-muted-foreground">{moicDisplay.reason}</p>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </div>
                              </div>
                            </div>
                          )}
                          
                          {runs.length > 0 && (
                            <div className="mt-4 space-y-2">
                              <h5 className="text-xs font-semibold text-muted-foreground">Files</h5>
                              <div className="space-y-1">
                                {latestRun.files?.map((file) => (
                                  <div key={file.key} className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-800 rounded text-xs">
                                    <span>{file.file_name}</span>
                                    <div className="flex gap-2">
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => handleViewContent(file)}
                                      >
                                        <Eye className="w-3 h-3" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => handleDownload(file)}
                                      >
                                        <Download className="w-3 h-3" />
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                              {runs.length > 1 && (
                                <p className="text-xs text-muted-foreground mt-2">
                                  + {runs.length - 1} older run{runs.length > 2 ? 's' : ''}
                                </p>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  });
                })()
              ) : (
                <Card className="border-dashed">
                  <CardContent className="py-8 text-center">
                    <p className="text-muted-foreground">No scenarios saved yet</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      Create your first scenario in the "Scenario Inputs" tab
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* View Content Modal */}
      <Dialog open={!!viewContent} onOpenChange={() => setViewContent(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{viewContent?.name}</DialogTitle>
          </DialogHeader>
          <div className="overflow-auto max-h-[60vh] bg-slate-900 text-slate-100 rounded-lg p-4">
            <pre className="text-xs whitespace-pre">{viewContent?.content}</pre>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}