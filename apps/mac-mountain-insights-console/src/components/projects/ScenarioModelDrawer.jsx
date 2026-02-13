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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { macEngineInvoke } from '@/api/macEngineClient';
import { base44 } from '@/api/base44Client';
import { runSSOTQuery } from '@/api/ssotQuery';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import MetricExplanation from './MetricExplanation';
import { MAC_AWS_ONLY } from '@/lib/mac-app-flags';

// Mac Mountain Financial Policy
const financePolicy = {
  irrGreenThresholdPct: 15,
  irrYellowThresholdPct: 0,
  moicGreenThreshold: 2.0,
  moicYellowThreshold: 1.0,
  npvGreenFloor: 0,
  npvYellowBandRatio: 0.05
};

const DEFAULT_ASSUMPTIONS = {
  arpu_start: 63,
  penetration_start_pct: 10,
  penetration_target_pct: 40,
  ramp_months: 36,
  capex_per_passing: 1200,
  opex_per_sub: 25,
  discount_rate_pct: 10,
  analysis_months: 120,
  subscription_months: 36,
  subscription_rate: 40,
  install_cost_per_subscriber: 0,
  opex_per_passing: 0,
  min_monthly_opex: 0,
  cogs_pct_revenue: 0,
  min_non_circuit_cogs: 0,
  circuit: false,
  circuit_type: 1,
  ebitda_multiple: 15
};

const MODEL_PROFILES = [
  { value: 'standard', label: 'Standard Pipeline Model' },
  { value: 'developer_template_2_9_26', label: 'Developer Template 2-9-26 (Exec Dashboard)' },
  { value: 'horton', label: 'Horton Developer Profile' },
  { value: 'acme', label: 'Acme Developer Profile' }
];

const inferModelProfile = (projectMeta = {}, fallback = 'standard') => {
  const entity = String(projectMeta?.entity || '').toLowerCase();
  const name = String(projectMeta?.project_name || '').toLowerCase();
  if (entity.includes('horton') || name.includes('horton')) {
    return 'horton';
  }
  if (entity.includes('acme') || name.includes('acme')) {
    return 'acme';
  }
  if (entity.includes('prospect') || name.includes('prospect')) {
    return 'developer_template_2_9_26';
  }
  return fallback;
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

const buildEomonthDates = (startDate, months) => {
  const dates = [];
  for (let i = 0; i < months; i += 1) {
    const d = new Date(startDate);
    d.setMonth(d.getMonth() + i + 1, 0);
    dates.push(d);
  }
  return dates;
};

const computeXirr = (cashflows, dates) => {
  if (!cashflows.length || cashflows.length !== dates.length) {
    return { rate: null, status: 'invalid_input', reason: 'Cashflows and dates length mismatch' };
  }
  const minCF = Math.min(...cashflows);
  const maxCF = Math.max(...cashflows);
  if (!(minCF < 0 && maxCF > 0)) {
    return { rate: null, status: 'no_sign_change', reason: 'No sign change in cashflows' };
  }

  const day0 = dates[0].getTime();
  const yearFrac = dates.map((d) => (d.getTime() - day0) / (365 * 24 * 60 * 60 * 1000));
  const xnpv = (rate) => {
    let total = 0;
    for (let i = 0; i < cashflows.length; i += 1) {
      total += cashflows[i] / Math.pow(1 + rate, yearFrac[i]);
    }
    return total;
  };

  let low = -0.95;
  let high = 3.0;
  let fLow = xnpv(low);
  let fHigh = xnpv(high);
  if (fLow * fHigh > 0) {
    return { rate: null, status: 'no_root_in_range', reason: 'No XIRR root in range [-95%, +300%]' };
  }

  let rate = null;
  for (let i = 0; i < 80; i += 1) {
    const mid = (low + high) / 2;
    const fMid = xnpv(mid);
    if (Math.abs(fMid) < 1e-6) {
      rate = mid;
      break;
    }
    if (fLow * fMid < 0) {
      high = mid;
      fHigh = fMid;
    } else {
      low = mid;
      fLow = fMid;
    }
    rate = mid;
  }

  return { rate, status: 'converged', reason: null };
};

const runDeveloperTemplateModel = (assumptions) => {
  const {
    passings,
    build_months,
    subscription_months,
    subscription_rate,
    capex_per_passing,
    install_cost_per_subscriber,
    arpu_start,
    circuit,
    circuit_type,
    min_non_circuit_cogs,
    cogs_pct_revenue,
    opex_per_sub,
    opex_per_passing,
    min_monthly_opex,
    ebitda_multiple,
    discount_rate_pct,
    analysis_months,
    model_profile,
    start_date
  } = assumptions;

  const months = analysis_months || 120;
  const subscriptionDelay = assumptions.subscription_start_delay_months != null
    ? assumptions.subscription_start_delay_months
    : 5;
  const passingsStartDelay = assumptions.passings_start_delay_months != null
    ? assumptions.passings_start_delay_months
    : 1;
  const blueprintShare = assumptions.blueprint_share ?? 0.5;
  const contributionShare = assumptions.contribution_share ?? 0.5;
  const distributionStartMonth = assumptions.distribution_start_month ?? 27;

  const normalizedProfile = String(model_profile || '').trim().toLowerCase() || 'developer_template_2_9_26';
  const circuitDefaults = {
    1: { nrc: 0, mrc: 1300, threshold: 100 },
    2: { nrc: 0, mrc: 2400, threshold: 200 },
    5: { nrc: 0, mrc: 3500, threshold: 500 },
    10: { nrc: 0, mrc: 5000, threshold: 1000 }
  };
  const circuitConfig = circuitDefaults[circuit_type] || circuitDefaults[1];
  const effectiveCircuitNrc = assumptions.circuit_nrc ?? circuitConfig.nrc;
  const effectiveCircuitMrc = assumptions.circuit_mrc ?? circuitConfig.mrc;
  const effectiveCircuitThreshold = assumptions.circuit_sub_threshold ?? circuitConfig.threshold;

  const totalPassings = passings || 0;
  const totalSubscribersTarget = totalPassings * (subscription_rate ?? 0);
  const subscriptionMonths = subscription_months || build_months || 36;
  const passingsPerMonth = build_months ? (totalPassings / build_months) : 0;
  const subsPerMonth = subscriptionMonths ? (totalSubscribersTarget / subscriptionMonths) : 0;
  const distributionThreshold = totalSubscribersTarget * (arpu_start || 0);

  const epsilon = 1e-6;
  let passingsEnd = 0;
  let subscribersEnd = 0;
  let totalCircuitsPrev = 0;
  let ebCashPrev = 0;
  let cumulativeContribution = 0;

  const monthly = [];
  const cashOutflows = [];
  const cashInflows = [];

  for (let i = 0; i < months; i += 1) {
    const monthNumber = i + 1;
    const remainingPassings = totalPassings - passingsEnd;
    const passingsAdded = (i < passingsStartDelay || remainingPassings <= epsilon)
      ? 0
      : Math.min(passingsPerMonth, remainingPassings);
    passingsEnd = Math.min(totalPassings, passingsEnd + passingsAdded);

    let subscribersAdded = 0;
    const remainingSubscribers = totalSubscribersTarget - subscribersEnd;
    if (i >= subscriptionDelay && remainingSubscribers > epsilon) {
      subscribersAdded = Math.min(subsPerMonth, remainingSubscribers);
    }
    subscribersEnd = Math.min(totalSubscribersTarget, subscribersEnd + subscribersAdded);

    const revenue = subscribersEnd * (arpu_start || 0);

    let totalCircuits = 0;
    let circuitCostNrc = 0;
    let circuitCostMrc = 0;
    if (circuit) {
      const firstCircuit = passingsEnd > 0 ? 1 : 0;
      const additionalCircuits = subscribersEnd >= effectiveCircuitThreshold
        ? Math.floor(subscribersEnd / effectiveCircuitThreshold)
        : 0;
      totalCircuits = firstCircuit + additionalCircuits;
      const circuitAdditions = totalCircuits - totalCircuitsPrev;
      circuitCostNrc = circuitAdditions * effectiveCircuitNrc;
      circuitCostMrc = totalCircuits * effectiveCircuitMrc;
    }

    const otherCogs = revenue === 0
      ? 0
      : Math.max(min_non_circuit_cogs || 0, revenue * (cogs_pct_revenue || 0));
    const grossProfit = revenue - circuitCostNrc - circuitCostMrc - otherCogs;

    let opex = 0;
    if (i === 0) {
      opex = passingsAdded > 1 ? 5000 : 0;
    } else {
      const opexVariable = (passingsEnd * (opex_per_passing || 0)) + (subscribersEnd * (opex_per_sub || 0));
      opex = Math.max(opexVariable, min_monthly_opex || 0);
    }

    const ebitda = grossProfit - opex;

    const capexPerPassing = passingsAdded * (capex_per_passing || 0);
    const capexPerSubscriber = subscribersAdded * (install_cost_per_subscriber || 0);
    const capexBook = capexPerPassing + capexPerSubscriber;
    const projectCapex = -capexBook;
    const projectFcf = projectCapex + ebitda;

    const bbCash = i === 0 ? 0 : ebCashPrev;
    const contribution = (bbCash + projectFcf) < 0 ? -(bbCash + projectFcf) : 0;
    let distribution = 0;
    if (monthNumber >= distributionStartMonth && projectFcf > 0) {
      const tentative = bbCash + projectFcf + contribution;
      if (tentative > distributionThreshold) {
        distribution = tentative - distributionThreshold;
      }
    }
    const ebCash = bbCash + projectFcf + contribution - distribution;

    const tier1 = -contribution;
    if (tier1 < 0) {
      cumulativeContribution += tier1 * contributionShare;
    }
    const cashOut = monthNumber === 1 ? cumulativeContribution : (cumulativeContribution - (monthly[i - 1]?.cumulative_contribution ?? 0));
    const cashIn = projectFcf > 0 ? projectFcf * blueprintShare : 0;

    monthly.push({
      month_number: monthNumber,
      passings_added: passingsAdded,
      passings: passingsEnd,
      subscribers_added: subscribersAdded,
      subscribers: subscribersEnd,
      revenue,
      circuit_count: totalCircuits,
      circuit_cost_nrc: circuitCostNrc,
      circuit_cost_mrc: circuitCostMrc,
      other_cogs: otherCogs,
      gross_profit: grossProfit,
      opex,
      ebitda,
      capex_book: capexBook,
      project_fcf: projectFcf,
      bb_cash: bbCash,
      contribution,
      distribution,
      eb_cash: ebCash,
      cumulative_contribution: cumulativeContribution,
      cash_out: cashOut,
      cash_in: cashIn,
      fcf: cashIn
    });

    cashOutflows.push(cashOut);
    cashInflows.push(cashIn);
    ebCashPrev = ebCash;
    totalCircuitsPrev = totalCircuits;
  }

  const terminalEbitda = monthly.slice(-12).reduce((sum, m) => sum + (m.ebitda || 0), 0);
  const terminalValueEbitda = terminalEbitda > 0 ? terminalEbitda * (ebitda_multiple || 0) : 0;
  const saleProceeds = terminalValueEbitda * blueprintShare;
  const endingCashShare = (monthly[monthly.length - 1]?.eb_cash || 0) * blueprintShare;
  if (monthly.length) {
    monthly[monthly.length - 1].fcf = (monthly[monthly.length - 1].fcf || 0) + saleProceeds;
  }

  const cashflows = monthly.map((m, idx) => {
    if (idx === 0) return (m.cash_out + m.cash_in - 0.01);
    if (idx === monthly.length - 1) return m.cash_out + saleProceeds + endingCashShare;
    return m.cash_out + m.cash_in;
  });

  const startDate = start_date ? new Date(start_date) : new Date('2025-01-31');
  const dates = buildEomonthDates(startDate, months);
  const irrResult = computeXirr(cashflows, dates);
  const irrAnnualPct = irrResult.rate != null ? Number((irrResult.rate * 100).toFixed(2)) : null;

  const cashInvested = -cashOutflows.reduce((sum, v) => sum + v, 0);
  const cashReturned = cashInflows.reduce((sum, v) => sum + v, 0) + saleProceeds;
  const moic = cashInvested > 0 ? Number((cashReturned / cashInvested).toFixed(2)) : null;

  const discountRate = (discount_rate_pct || 10) / 100;
  const npv = cashflows.reduce((sum, cf, idx) => {
    const t = (dates[idx].getTime() - dates[0].getTime()) / (365 * 24 * 60 * 60 * 1000);
    return sum + cf / Math.pow(1 + discountRate, t);
  }, 0);

  const peakSubscribers = Math.max(...monthly.map((m) => m.subscribers || 0));
  const peakEbitda = Math.max(...monthly.map((m) => m.ebitda || 0));
  const totalCapexBook = monthly.reduce((sum, m) => sum + (m.capex_book || 0), 0);
  const peakExternalCash = Math.max(...monthly.map((m) => -(m.cumulative_contribution || 0)));

  return {
    monthly,
    metrics: {
      total_capex_book: Math.round(totalCapexBook),
      actual_cash_invested: Math.round(cashInvested),
      peak_external_cash: Math.round(peakExternalCash),
      npv: Math.round(npv),
      irr_monthly_decimal: null,
      irr_annual_pct: irrAnnualPct,
      irr_status: irrResult.status,
      irr_reason: irrResult.reason,
      moic,
      moic_status: moic != null ? 'defined' : 'not_defined',
      peak_subscribers: Math.round(peakSubscribers),
      peak_monthly_ebitda: Math.round(peakEbitda),
      terminal_value: Math.round(terminalValueEbitda),
      terminal_value_ebitda: Math.round(terminalValueEbitda),
      terminal_value_method: 'ebitda',
      model_profile: normalizedProfile,
      cash_returned: Math.round(cashReturned)
    },
    metric_explanations: []
  };
}

// Client-side financial calculations aligned to the back-end model
const runFinancialModel = (assumptions) => {
  const months = assumptions.analysis_months || 120;
  const monthly = [];

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
    subscription_months,
    subscription_rate,
    subscription_start_delay_months,
    install_cost_per_subscriber = 0,
    opex_per_passing = 0,
    min_monthly_opex = 0,
    cogs_pct_revenue = 0,
    min_non_circuit_cogs = 0,
    circuit = false,
    circuit_type = 1,
    circuit_nrc,
    circuit_mrc,
    circuit_sub_threshold,
    ebitda_multiple = 15,
    startup_opex = 0,
    model_profile,
    terminal_value_method,
    terminal_value_weight,
    per_subscriber_terminal_value
  } = assumptions;

  const normalizeRate = (value, fallback) => {
    if (value === null || value === undefined || value === '') return fallback;
    const num = Number(value);
    if (Number.isNaN(num)) return fallback;
    return num > 1 ? num / 100 : num;
  };

  const normalizedProfile = String(model_profile || '').trim().toLowerCase();
  const profileKey = normalizedProfile || 'standard';
  const isDeveloperTemplate = ['developer_template_2_9_26', 'developer_template', 'exec_dashboard', 'horton', 'acme'].includes(profileKey);
  if (isDeveloperTemplate) {
    return runDeveloperTemplateModel({ ...assumptions, model_profile: profileKey });
  }
  const effectiveSubscriptionDelay = subscription_start_delay_months != null
    ? subscription_start_delay_months
    : (isDeveloperTemplate ? 0 : 6);

  const effectiveSubscriptionRate = normalizeRate(subscription_rate, penetration_target_pct ?? 0.4);
  const effectiveSubscriptionMonths = subscription_months || ramp_months || 36;

  const circuitDefaults = {
    1: { nrc: 0, mrc: 1300, threshold: 100 },
    2: { nrc: 0, mrc: 2400, threshold: 200 },
    5: { nrc: 0, mrc: 3500, threshold: 500 },
    10: { nrc: 0, mrc: 5000, threshold: 1000 }
  };
  const circuitConfig = circuitDefaults[circuit_type] || circuitDefaults[1];
  const effectiveCircuitNrc = circuit_nrc ?? circuitConfig.nrc;
  const effectiveCircuitMrc = circuit_mrc ?? circuitConfig.mrc;
  const effectiveCircuitThreshold = circuit_sub_threshold ?? circuitConfig.threshold;

  const total_capex_book = total_capex || (
    (passings || 0) * (capex_per_passing || 0) +
    (passings || 0) * effectiveSubscriptionRate * (install_cost_per_subscriber || 0)
  );
  const monthly_rate = discount_rate_pct / 100 / 12;

  if (total_capex_book <= 0 || !passings) {
    return {
      monthly: [],
      metrics: {
        total_capex_book: 0,
        actual_cash_invested: 0,
        peak_external_cash: 0,
        npv: null,
        irr: null,
        irr_status: 'not_defined_no_investment',
        moic: null,
        moic_status: 'not_defined_no_investment',
        peak_subscribers: 0,
        peak_monthly_ebitda: 0,
        terminal_value: 0,
        terminal_ebitda: 0,
        terminal_value_ebitda: 0,
        terminal_value_subscriber: 0,
        terminal_value_method: null,
        terminal_value_weight: null,
        model_profile: profileKey,
        subscription_start_delay_months: effectiveSubscriptionDelay,
        min_fcf: 0,
        max_fcf: 0,
        count_pos_fcf_months: 0,
        count_neg_fcf_months: 0
      }
    };
  }

  const monthly_capex_schedule = total_capex_book / (build_months || 1);
  let cumulative_external_cash = 0;
  let peak_external_cash = 0;
  let passings_end = 0;
  let subscribers_end = 0;
  let totalCircuitsPrev = 0;

  const passings_add_per_month = build_months ? (passings / build_months) : 0;
  const totalSubscribersTarget = passings * effectiveSubscriptionRate;
  const subscribers_add_per_month = effectiveSubscriptionMonths ? (totalSubscribersTarget / effectiveSubscriptionMonths) : 0;

  for (let month = 1; month <= months; month += 1) {
    const passings_added = month <= build_months ? passings_add_per_month : 0;
    passings_end = Math.min(passings, passings_end + passings_added);

    let subscribers_added = 0;
    if (month > effectiveSubscriptionDelay && subscribers_end < totalSubscribersTarget) {
      subscribers_added = Math.min(subscribers_add_per_month, totalSubscribersTarget - subscribers_end);
    }
    subscribers_end = Math.min(totalSubscribersTarget, subscribers_end + subscribers_added);

    const penetration = passings_end > 0 ? subscribers_end / passings_end : 0;
    const revenue = subscribers_end * arpu_start;

    let totalCircuits = 0;
    let circuit_cost_nrc = 0;
    let circuit_cost_mrc = 0;

    if (circuit) {
      const firstCircuit = subscribers_end > 0 ? 1 : 0;
      const additionalCircuits = subscribers_end >= effectiveCircuitThreshold
        ? Math.floor(subscribers_end / effectiveCircuitThreshold)
        : 0;
      totalCircuits = firstCircuit + additionalCircuits;
      const circuitAdditions = totalCircuits - totalCircuitsPrev;
      circuit_cost_nrc = circuitAdditions * effectiveCircuitNrc;
      circuit_cost_mrc = totalCircuits * effectiveCircuitMrc;
    }

    const other_cogs = revenue > 0
      ? Math.max(min_non_circuit_cogs || 0, revenue * (cogs_pct_revenue || 0))
      : 0;

    const gross_profit = revenue - circuit_cost_nrc - circuit_cost_mrc - other_cogs;
    const opex_variable = (passings_end * (opex_per_passing || 0)) + (subscribers_end * (opex_per_sub || 0));
    const opex_base = Math.max(min_monthly_opex || 0, opex_variable);
    const opex = (month === 1 ? startup_opex : 0) + opex_base;
    const ebitda = gross_profit - opex;

    const useDetailCapex = (capex_per_passing || install_cost_per_subscriber) && passings;
    const capex_book = useDetailCapex
      ? (passings_added * (capex_per_passing || 0)) + (subscribers_added * (install_cost_per_subscriber || 0))
      : (month <= build_months ? monthly_capex_schedule : 0);

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
      passings_added,
      passings: passings_end,
      subscribers_added,
      subscribers: subscribers_end,
      penetration_pct: penetration * 100,
      arpu: arpu_start,
      revenue,
      circuit_count: totalCircuits,
      circuit_cost_nrc,
      circuit_cost_mrc,
      other_cogs,
      gross_profit,
      opex,
      ebitda,
      capex_book,
      external_cash_this_month,
      cumulative_external_cash,
      fcf,
      pv
    });

    totalCircuitsPrev = totalCircuits;
  }

  const actual_cash_invested = peak_external_cash;

  const terminalEbitda = monthly.slice(-12).reduce((sum, m) => sum + Number(m.ebitda || 0), 0);
  const terminalValueEbitda = terminalEbitda > 0 ? terminalEbitda * (ebitda_multiple || 0) : 0;
  const terminalSubscriberValue = per_subscriber_terminal_value != null
    ? per_subscriber_terminal_value
    : (isDeveloperTemplate ? 10000 : 0);
  const terminalValueSubscribers = terminalSubscriberValue && subscribers_end
    ? subscribers_end * terminalSubscriberValue
    : 0;
  const terminalMethod = String(terminal_value_method || (isDeveloperTemplate ? 'blended' : 'ebitda')).toLowerCase();
  const terminalWeight = terminal_value_weight != null ? terminal_value_weight : 0.5;
  let terminal_value = terminalValueEbitda;
  if (terminalMethod === 'subscriber') {
    terminal_value = terminalValueSubscribers;
  } else if (terminalMethod === 'blended') {
    terminal_value = (terminalValueEbitda * terminalWeight) + (terminalValueSubscribers * (1 - terminalWeight));
  }
  if (monthly.length) {
    const last = monthly[monthly.length - 1];
    last.terminal_value = terminal_value;
    last.terminal_value_ebitda = terminalValueEbitda;
    last.terminal_value_subscriber = terminalValueSubscribers;
    const fcfWithTerminal = Number(last.fcf || 0) + terminal_value;
    last.fcf_with_terminal = fcfWithTerminal;
    const pvWithTerminal = fcfWithTerminal * Math.pow(1 + monthly_rate, -months);
    last.pv_with_terminal = pvWithTerminal;
  }

  const npv = monthly.reduce((sum, m) => sum + Number(m.pv || 0), -actual_cash_invested) +
    (terminal_value * Math.pow(1 + monthly_rate, -months));

  let irr_monthly_decimal = null;
  let irrStatus = 'converged';
  let irrReason = null;
  let irrDebug = null;
  const cashflows = [-actual_cash_invested, ...monthly.map((m, idx) => {
    const base = Number(m.fcf || 0);
    return idx === monthly.length - 1 ? base + terminal_value : base;
  })];
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
      let npvVal = -actual_cash_invested;
      monthly.forEach((m, idx) => {
        const fcfVal = Number(m.fcf || 0) + (idx === monthly.length - 1 ? terminal_value : 0);
        npvVal += fcfVal / Math.pow(1 + rate, idx + 1);
      });
      return npvVal;
    };

    const npvAtNeg95 = testNPV(-0.95);
    const npvAtPos300 = testNPV(3.0);

    if (npvAtNeg95 * npvAtPos300 > 0) {
      irrStatus = 'no_root_in_range';
      irrReason = 'No IRR solution found in range [-95%, +300%] monthly';
      irrDebug = { npv_at_neg95: npvAtNeg95, npv_at_pos300: npvAtPos300 };
    } else {
      let rate = 0.10;
      let irrConverged = false;
      let iterations = 0;
      let lastNPV = 0;
      let lastDerivative = 0;

      for (let i = 0; i < 50; i += 1) {
        iterations = i + 1;
        let npvAtRate = -actual_cash_invested;
        let derivative = 0;

        monthly.forEach((m, idx) => {
          const factor = Math.pow(1 + rate, -(idx + 1));
          const fcfVal = Number(m.fcf || 0) + (idx === monthly.length - 1 ? terminal_value : 0);
          npvAtRate += fcfVal * factor;
          derivative -= (idx + 1) * fcfVal * factor / (1 + rate);
        });

        lastNPV = npvAtRate;
        lastDerivative = derivative;

        if (Math.abs(npvAtRate) < 0.001) {
          irr_monthly_decimal = rate;
          irrConverged = true;
          break;
        }

        if (Math.abs(derivative) < 1e-10) {
          irrStatus = 'derivative_too_small';
          irrReason = 'Newton-Raphson derivative too small to continue';
          break;
        }

        const step = npvAtRate / derivative;
        rate = rate - step;
        if (rate < -0.95) rate = -0.95;
        if (rate > 3.0) rate = 3.0;

        if (Math.abs(step) < 1e-8) {
          irr_monthly_decimal = rate;
          irrConverged = true;
          break;
        }
      }

      if (!irrConverged && irrStatus === 'converged') {
        let low = -0.95;
        let high = 3.0;
        for (let i = 0; i < 100; i += 1) {
          iterations += 1;
          const mid = (low + high) / 2;
          const npvMid = testNPV(mid);
          if (Math.abs(npvMid) < 0.001) {
            irr_monthly_decimal = mid;
            irrConverged = true;
            break;
          }
          const npvLow = testNPV(low);
          if (npvLow * npvMid < 0) {
            high = mid;
          } else {
            low = mid;
          }
          if (Math.abs(high - low) < 1e-7) {
            irr_monthly_decimal = mid;
            irrConverged = true;
            break;
          }
        }
      }

      if (!irrConverged && irrStatus === 'converged') {
        irrStatus = 'did_not_converge';
        irrReason = `Solver failed to converge after ${iterations} iterations`;
        irrDebug = {
          iterations,
          last_rate_monthly: rate,
          npv_at_last_rate: lastNPV,
          derivative_at_last_rate: lastDerivative,
          min_cashflow: minCF,
          max_cashflow: maxCF,
          has_sign_change: hasSignChange
        };
      }
    }
  }

  const distributed_sum_pos_fcf = monthly.reduce((sum, m, idx) => {
    const fcfVal = Number(m.fcf || 0) + (idx === monthly.length - 1 ? terminal_value : 0);
    return sum + Math.max(0, fcfVal);
  }, 0);
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

  const fcfValues = monthly.map((m) => Number(m.fcf || 0));
  const min_fcf = Math.min(...fcfValues);
  const max_fcf = Math.max(...fcfValues);
  const count_pos_fcf_months = fcfValues.filter((f) => f > 0).length;
  const count_neg_fcf_months = fcfValues.filter((f) => f < 0).length;

  const peakSubscribers = Math.max(...monthly.map((m) => Number(m.subscribers || 0)));
  const peakEbitda = Math.max(...monthly.map((m) => Number(m.ebitda || 0)));

  const irr_annual_pct = irr_monthly_decimal !== null
    ? ((Math.pow(1 + irr_monthly_decimal, 12) - 1) * 100)
    : null;

  const metrics = {
    total_capex_book: Math.round(total_capex_book),
    actual_cash_invested: Math.round(actual_cash_invested),
    peak_external_cash: Math.round(peak_external_cash),
    npv: Math.round(npv),
    irr_monthly_decimal: irr_monthly_decimal !== null ? Number(irr_monthly_decimal.toFixed(6)) : null,
    irr_annual_pct: irr_annual_pct !== null ? Number(irr_annual_pct.toFixed(2)) : null,
    irr_status: irrStatus,
    irr_reason: irrReason,
    irr_debug: irrDebug,
    moic: moic !== null ? Number(moic.toFixed(2)) : null,
    moic_status: moicStatus,
    moic_reason: moicReason,
    peak_subscribers: Math.round(peakSubscribers),
    peak_monthly_ebitda: Math.round(peakEbitda),
    min_fcf: Math.round(min_fcf),
    max_fcf: Math.round(max_fcf),
    count_pos_fcf_months,
    count_neg_fcf_months,
    terminal_value: Math.round(terminal_value),
    terminal_ebitda: Math.round(terminalEbitda),
    terminal_value_ebitda: Math.round(terminalValueEbitda),
    terminal_value_subscriber: Math.round(terminalValueSubscribers),
    terminal_value_method: terminalMethod,
    terminal_value_weight: terminalMethod === 'blended' ? terminalWeight : null,
    model_profile: profileKey,
    subscription_start_delay_months: effectiveSubscriptionDelay
  };

  return { monthly, metrics };
};

const calculateFinancials = (inputs) => {
  const model = runFinancialModel(inputs);
  const metrics = model.metrics || {};
  return {
    summary: {
      ...metrics,
      npv_color: classifyNPV(metrics.npv, metrics.actual_cash_invested),
      irr_color: metrics.irr_annual_pct !== null ? classifyIRR(metrics.irr_annual_pct) : 'unknown',
      moic_color: metrics.moic !== null ? classifyMOIC(metrics.moic) : 'unknown',
      cashflow_summary: {
        min_fcf: metrics.min_fcf ?? 0,
        max_fcf: metrics.max_fcf ?? 0,
        count_pos_fcf_months: metrics.count_pos_fcf_months ?? 0,
        count_neg_fcf_months: metrics.count_neg_fcf_months ?? 0
      }
    },
    monthly: model.monthly || []
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
    model_profile: 'standard',
    arpu_start: 63,
    penetration_start_pct: 10,
    penetration_target_pct: 40,
    ramp_months: 36,
    capex_per_passing: 1200,
    subscription_months: 36,
    subscription_rate: 40,
    install_cost_per_subscriber: 0,
    opex_per_sub: 25,
    opex_per_passing: 0,
    min_monthly_opex: 0,
    cogs_pct_revenue: 0,
    min_non_circuit_cogs: 0,
    circuit: false,
    circuit_type: 1,
    ebitda_multiple: 15,
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
  const [defaultsPrompt, setDefaultsPrompt] = useState({
    open: false,
    missing: [],
    defaults: {},
    saveAsNew: false
  });

  // Fetch scenarios registry (scenarios.json)
  const { data: scenariosRegistry, refetch: refetchRegistry } = useQuery({
    queryKey: ['scenarios-registry', projectId],
    queryFn: async () => {
      const response = await macEngineInvoke('manageScenariosRegistry', {
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
      const response = await macEngineInvoke('listProjectModelOutputs', {
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
      const response = await runSSOTQuery({
        queryId: 'project_detail',
        params: { project_id: projectId },
        label: 'Scenario Project Metadata'
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
          opex_per_passing: values[11],
          subscription_months: values[12],
          subscription_rate: values[13],
          install_cost_per_subscriber: values[14],
          min_monthly_opex: values[15],
          cogs_pct_revenue: values[16],
          min_non_circuit_cogs: values[17],
          circuit: values[18],
          circuit_type: values[19],
          ebitda_multiple: values[20],
          discount_rate_pct: values[21]
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
      if (projectData.subscription_months) {
        updatedInputs.subscription_months = projectData.subscription_months;
        shouldUpdate = true;
      }
      if (projectData.subscription_rate) {
        updatedInputs.subscription_rate = projectData.subscription_rate * 100;
        shouldUpdate = true;
      }
      if (projectData.install_cost_per_subscriber) {
        updatedInputs.install_cost_per_subscriber = projectData.install_cost_per_subscriber;
        shouldUpdate = true;
      }
      if (projectData.opex_per_sub) {
        updatedInputs.opex_per_sub = projectData.opex_per_sub;
        shouldUpdate = true;
      }
      if (projectData.opex_per_passing) {
        updatedInputs.opex_per_passing = projectData.opex_per_passing;
        shouldUpdate = true;
      }
      if (projectData.min_monthly_opex) {
        updatedInputs.min_monthly_opex = projectData.min_monthly_opex;
        shouldUpdate = true;
      }
      if (projectData.cogs_pct_revenue !== null && projectData.cogs_pct_revenue !== undefined) {
        updatedInputs.cogs_pct_revenue = projectData.cogs_pct_revenue * 100;
        shouldUpdate = true;
      }
      if (projectData.min_non_circuit_cogs) {
        updatedInputs.min_non_circuit_cogs = projectData.min_non_circuit_cogs;
        shouldUpdate = true;
      }
      if (projectData.circuit !== null && projectData.circuit !== undefined) {
        updatedInputs.circuit = projectData.circuit === true || String(projectData.circuit).toLowerCase() === 'true' || String(projectData.circuit).toLowerCase() === 'yes';
        shouldUpdate = true;
      }
      if (projectData.circuit_type) {
        updatedInputs.circuit_type = projectData.circuit_type;
        shouldUpdate = true;
      }
      if (projectData.ebitda_multiple) {
        updatedInputs.ebitda_multiple = projectData.ebitda_multiple;
        shouldUpdate = true;
      }
      if (projectData.discount_rate_pct) {
        updatedInputs.discount_rate_pct = projectData.discount_rate_pct;
        shouldUpdate = true;
      }
      const inferredProfile = inferModelProfile(projectData, updatedInputs.model_profile || 'standard');
      if (inferredProfile && inferredProfile !== updatedInputs.model_profile) {
        updatedInputs.model_profile = inferredProfile;
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

  const normalizeRate = (value, fallback = 0) => {
    if (value === null || value === undefined || value === '') return fallback;
    const num = Number(value);
    if (Number.isNaN(num)) return fallback;
    return num > 1 ? num / 100 : num;
  };

  // Calculate effective total_capex for display and validation
  // In override mode, use manual total_capex; otherwise auto-compute
  const effectiveSubscriptionRate = normalizeRate(inputs.subscription_rate, normalizeRate(inputs.penetration_target_pct, 0.4));
  const capexFromPassing = Number(inputs.passings || 0) * Number(inputs.capex_per_passing || 0);
  const capexFromInstall = Number(inputs.passings || 0) * effectiveSubscriptionRate * Number(inputs.install_cost_per_subscriber || 0);
  const effectiveTotalCapex = capexOverrideMode
    ? Number(inputs.total_capex)
    : (capexFromPassing + capexFromInstall);
  
  // Calculate implied capex per passing when in override mode
  const impliedCapexPerPassing = capexOverrideMode && inputs.passings 
    ? (Number(inputs.total_capex) / Number(inputs.passings))
    : null;

  const hasPositiveNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0;
  };

  const formatDefaultValue = (key, value) => {
    if (value == null) return '—';
    if (key === 'start_date') return value;
    if (key === 'circuit') return value ? 'Yes' : 'No';
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed.toLocaleString();
    return String(value);
  };

  const buildMissingAndDefaults = (rawInputs) => {
    const missing = [];
    const defaults = {};
    const optionalDefaults = {};
    const todayValue = new Date().toISOString().split('T')[0];

    if (!hasPositiveNumber(rawInputs.passings)) {
      missing.push({ key: 'passings', label: 'Passings' });
      if (hasPositiveNumber(projectData?.passings)) {
        defaults.passings = Number(projectData.passings);
      }
    }

    if (!hasPositiveNumber(rawInputs.build_months)) {
      missing.push({ key: 'build_months', label: 'Build Months' });
      if (hasPositiveNumber(projectData?.build_months)) {
        defaults.build_months = Number(projectData.build_months);
      }
    }

    if (!rawInputs.start_date) {
      missing.push({ key: 'start_date', label: 'Project Start Date' });
      defaults.start_date = todayValue;
    }

    if (capexOverrideMode) {
      if (!hasPositiveNumber(rawInputs.total_capex)) {
        missing.push({ key: 'total_capex', label: 'Total CAPEX' });
        if (hasPositiveNumber(projectData?.total_capex)) {
          defaults.total_capex = Number(projectData.total_capex);
        } else if (hasPositiveNumber(rawInputs.passings) || hasPositiveNumber(defaults.passings)) {
          const passingsValue = hasPositiveNumber(rawInputs.passings)
            ? Number(rawInputs.passings)
            : Number(defaults.passings);
          const capexPerPassingValue = hasPositiveNumber(rawInputs.capex_per_passing)
            ? Number(rawInputs.capex_per_passing)
            : DEFAULT_ASSUMPTIONS.capex_per_passing;
          defaults.total_capex = passingsValue * capexPerPassingValue;
        }
      }
    } else if (!hasPositiveNumber(rawInputs.capex_per_passing)) {
      missing.push({ key: 'capex_per_passing', label: 'Capex per Passing' });
      if (hasPositiveNumber(projectData?.capex_per_passing)) {
        defaults.capex_per_passing = Number(projectData.capex_per_passing);
      } else {
        defaults.capex_per_passing = DEFAULT_ASSUMPTIONS.capex_per_passing;
      }
    }

    if (!hasPositiveNumber(rawInputs.arpu_start)) {
      missing.push({ key: 'arpu_start', label: 'ARPU' });
      if (hasPositiveNumber(projectData?.arpu_start)) {
        defaults.arpu_start = Number(projectData.arpu_start);
      } else {
        defaults.arpu_start = DEFAULT_ASSUMPTIONS.arpu_start;
      }
    }
    const hasSubscriptionRate = hasPositiveNumber(rawInputs.subscription_rate) || hasPositiveNumber(rawInputs.penetration_target_pct);
    if (!hasSubscriptionRate) {
      missing.push({ key: 'subscription_rate', label: 'Subscription Rate' });
      if (hasPositiveNumber(projectData?.subscription_rate)) {
        defaults.subscription_rate = Number(projectData.subscription_rate) * 100;
      } else {
        defaults.subscription_rate = DEFAULT_ASSUMPTIONS.subscription_rate;
      }
    }
    const hasSubscriptionMonths = hasPositiveNumber(rawInputs.subscription_months) || hasPositiveNumber(rawInputs.ramp_months);
    if (!hasSubscriptionMonths) {
      missing.push({ key: 'subscription_months', label: 'Subscription Months' });
      if (hasPositiveNumber(projectData?.subscription_months)) {
        defaults.subscription_months = Number(projectData.subscription_months);
      } else {
        defaults.subscription_months = DEFAULT_ASSUMPTIONS.subscription_months;
      }
    }
    if (!hasPositiveNumber(rawInputs.opex_per_sub)) {
      missing.push({ key: 'opex_per_sub', label: 'Opex per Subscriber' });
      if (hasPositiveNumber(projectData?.opex_per_sub)) {
        defaults.opex_per_sub = Number(projectData.opex_per_sub);
      } else {
        defaults.opex_per_sub = DEFAULT_ASSUMPTIONS.opex_per_sub;
      }
    }

    if (!hasPositiveNumber(rawInputs.penetration_start_pct)) {
      optionalDefaults.penetration_start_pct = DEFAULT_ASSUMPTIONS.penetration_start_pct;
    }
    if (!hasPositiveNumber(rawInputs.penetration_target_pct)) {
      optionalDefaults.penetration_target_pct = DEFAULT_ASSUMPTIONS.penetration_target_pct;
    }
    if (!hasPositiveNumber(rawInputs.ramp_months)) {
      optionalDefaults.ramp_months = DEFAULT_ASSUMPTIONS.ramp_months;
    }
    if (!hasPositiveNumber(rawInputs.install_cost_per_subscriber)) {
      optionalDefaults.install_cost_per_subscriber = DEFAULT_ASSUMPTIONS.install_cost_per_subscriber;
    }
    if (!hasPositiveNumber(rawInputs.opex_per_passing)) {
      optionalDefaults.opex_per_passing = DEFAULT_ASSUMPTIONS.opex_per_passing;
    }
    if (!hasPositiveNumber(rawInputs.min_monthly_opex)) {
      optionalDefaults.min_monthly_opex = DEFAULT_ASSUMPTIONS.min_monthly_opex;
    }
    if (rawInputs.cogs_pct_revenue === '' || rawInputs.cogs_pct_revenue === null || rawInputs.cogs_pct_revenue === undefined) {
      optionalDefaults.cogs_pct_revenue = DEFAULT_ASSUMPTIONS.cogs_pct_revenue;
    }
    if (!hasPositiveNumber(rawInputs.min_non_circuit_cogs)) {
      optionalDefaults.min_non_circuit_cogs = DEFAULT_ASSUMPTIONS.min_non_circuit_cogs;
    }
    if (rawInputs.circuit === null || rawInputs.circuit === undefined) {
      optionalDefaults.circuit = DEFAULT_ASSUMPTIONS.circuit;
    }
    if (!hasPositiveNumber(rawInputs.circuit_type)) {
      optionalDefaults.circuit_type = DEFAULT_ASSUMPTIONS.circuit_type;
    }
    if (!hasPositiveNumber(rawInputs.ebitda_multiple)) {
      optionalDefaults.ebitda_multiple = DEFAULT_ASSUMPTIONS.ebitda_multiple;
    }
    if (!hasPositiveNumber(rawInputs.discount_rate_pct)) {
      optionalDefaults.discount_rate_pct = DEFAULT_ASSUMPTIONS.discount_rate_pct;
    }
    if (!hasPositiveNumber(rawInputs.analysis_months)) {
      optionalDefaults.analysis_months = DEFAULT_ASSUMPTIONS.analysis_months;
    }

    return { missing, defaults, optionalDefaults };
  };
  
  // Calculate results on every input change
  const results = inputs.passings && inputs.build_months ? calculateFinancials({
    ...inputs,
    passings: Number(inputs.passings),
    build_months: Number(inputs.build_months),
    total_capex: effectiveTotalCapex,
    penetration_start_pct: inputs.penetration_start_pct / 100,
    penetration_target_pct: inputs.penetration_target_pct / 100,
    subscription_months: Number(inputs.subscription_months) || inputs.ramp_months,
    subscription_rate: normalizeRate(inputs.subscription_rate, normalizeRate(inputs.penetration_target_pct, 0.4)),
    install_cost_per_subscriber: Number(inputs.install_cost_per_subscriber) || 0,
    opex_per_passing: Number(inputs.opex_per_passing) || 0,
    min_monthly_opex: Number(inputs.min_monthly_opex) || 0,
    cogs_pct_revenue: normalizeRate(inputs.cogs_pct_revenue, 0),
    min_non_circuit_cogs: Number(inputs.min_non_circuit_cogs) || 0,
    circuit: inputs.circuit,
    circuit_type: Number(inputs.circuit_type) || 1,
    ebitda_multiple: Number(inputs.ebitda_multiple) || 15,
    discount_rate_pct: inputs.discount_rate_pct,
    model_profile: inputs.model_profile
  }) : null;

  const handleSaveScenario = async (saveAsNew = false, overrideInputs = null, allowDefaults = false) => {
    const rawInputs = overrideInputs || inputs;
    console.log('🚀 handleSaveScenario called', { saveAsNew, projectId, rawInputs });
    
    // Check Capital Committee permission (UI gate - server enforces)
    try {
      if (!MAC_AWS_ONLY) {
        const user = await base44.auth.me();
        const CAPITAL_COMMITTEE = ['patrick.cochran@icloud.com', 'patch.cochran@macmtn.com'];
        if (!CAPITAL_COMMITTEE.includes(user?.email?.toLowerCase())) {
          console.error('❌ Permission denied - not Capital Committee');
          toast.error('Only Capital Committee members can save scenarios');
          return;
        }
        console.log('✅ Permission check passed');
      }
    } catch (error) {
      console.error('❌ Permission check failed:', error);
      toast.error('Permission check failed');
      return;
    }

    const { missing, defaults, optionalDefaults } = buildMissingAndDefaults(rawInputs);
    const unresolved = missing.filter(field => defaults[field.key] == null || defaults[field.key] === '');

    if (missing.length > 0 && !allowDefaults) {
      if (unresolved.length > 0) {
        const missingLabels = unresolved.map(field => field.label).join(', ');
        toast.error(`Missing required inputs: ${missingLabels}`);
        return;
      }
      setDefaultsPrompt({
        open: true,
        missing,
        defaults,
        saveAsNew
      });
      return;
    }

    if (missing.length > 0 && allowDefaults && unresolved.length > 0) {
      const missingLabels = unresolved.map(field => field.label).join(', ');
      toast.error(`Missing required inputs: ${missingLabels}`);
      return;
    }

    const resolvedInputs = {
      ...rawInputs,
      ...optionalDefaults,
      ...(allowDefaults ? defaults : {})
    };
    resolvedInputs.model_profile = resolvedInputs.model_profile || inferModelProfile(projectData, inputs.model_profile || 'standard');

    if (allowDefaults && Object.keys(defaults).length > 0) {
      setInputs(prev => ({ ...prev, ...defaults, ...optionalDefaults }));
    } else if (Object.keys(optionalDefaults).length > 0) {
      setInputs(prev => ({ ...prev, ...optionalDefaults }));
    }

    // Validation
    if (!hasPositiveNumber(resolvedInputs.passings) || !hasPositiveNumber(resolvedInputs.build_months)) {
      console.error('❌ Validation failed: missing passings or build_months');
      toast.error('Required: Passings and Build Months');
      return;
    }

    if (!resolvedInputs.start_date) {
      console.error('❌ Validation failed: missing start_date');
      toast.error('Project Start Date is required');
      return;
    }

    const subscriptionRateForCapex = normalizeRate(
      resolvedInputs.subscription_rate,
      normalizeRate(resolvedInputs.penetration_target_pct, 0.4)
    );
    const capexFromPassingResolved = Number(resolvedInputs.passings || 0) * Number(resolvedInputs.capex_per_passing || 0);
    const capexFromInstallResolved = Number(resolvedInputs.passings || 0) * subscriptionRateForCapex * Number(resolvedInputs.install_cost_per_subscriber || 0);
    const effectiveTotalCapexForSave = capexOverrideMode
      ? Number(resolvedInputs.total_capex)
      : (capexFromPassingResolved + capexFromInstallResolved);

    if (!effectiveTotalCapexForSave || effectiveTotalCapexForSave <= 0) {
      console.error('❌ Validation failed: total_capex <= 0', effectiveTotalCapexForSave);
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
      const startDate = new Date(resolvedInputs.start_date);
      const today = new Date();
      const start_month_offset = Math.round(
        (startDate.getFullYear() - today.getFullYear()) * 12 + 
        (startDate.getMonth() - today.getMonth())
      );

      const scenarioInputs = {
        passings: Number(resolvedInputs.passings),
        build_months: Number(resolvedInputs.build_months),
        total_capex: effectiveTotalCapexForSave,
        capex_per_passing: resolvedInputs.capex_per_passing,
        capex_override_mode: capexOverrideMode,
        start_date: resolvedInputs.start_date,
        start_month_offset: start_month_offset,
        arpu_start: resolvedInputs.arpu_start,
        penetration_start_pct: resolvedInputs.penetration_start_pct / 100,
        penetration_target_pct: resolvedInputs.penetration_target_pct / 100,
        ramp_months: resolvedInputs.ramp_months,
        opex_per_sub: resolvedInputs.opex_per_sub,
        opex_per_passing: resolvedInputs.opex_per_passing,
        subscription_months: resolvedInputs.subscription_months,
        subscription_rate: normalizeRate(
          resolvedInputs.subscription_rate,
          normalizeRate(resolvedInputs.penetration_target_pct, 0.4)
        ),
        install_cost_per_subscriber: resolvedInputs.install_cost_per_subscriber,
        min_monthly_opex: resolvedInputs.min_monthly_opex,
        cogs_pct_revenue: normalizeRate(resolvedInputs.cogs_pct_revenue, 0),
        min_non_circuit_cogs: resolvedInputs.min_non_circuit_cogs,
        circuit: resolvedInputs.circuit,
        circuit_type: resolvedInputs.circuit_type,
        ebitda_multiple: resolvedInputs.ebitda_multiple,
        discount_rate_pct: resolvedInputs.discount_rate_pct,
        analysis_months: resolvedInputs.analysis_months,
        model_profile: resolvedInputs.model_profile
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
      const response = await macEngineInvoke('runProjectModel', requestPayload);
      
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
            const metrics = response.data.metrics || results?.summary || {};
            
            await macEngineInvoke('createMondayScenarioSubitem', {
              monday_item_id: parseInt(projectData.monday_item_id, 10),
              scenario_name: finalScenarioName,
              npv: metrics.npv || 0,
              irr_pct: metrics.irr_annual_pct || 0,
              moic: metrics.moic || 0,
              cash_invested: metrics.actual_cash_invested || 0,
              peak_subs: metrics.peak_subscribers || 0,
              peak_ebitda: metrics.peak_monthly_ebitda || 0
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
          model_profile: scenario.inputs.model_profile || inferModelProfile(projectData, inputs.model_profile || 'standard'),
          arpu_start: scenario.inputs.arpu_start || 63,
          penetration_start_pct: (scenario.inputs.penetration_start_pct * 100) || 10,
          penetration_target_pct: (scenario.inputs.penetration_target_pct * 100) || 40,
          ramp_months: scenario.inputs.ramp_months || 36,
          capex_per_passing: scenario.inputs.capex_per_passing || 1200,
          subscription_months: scenario.inputs.subscription_months || scenario.inputs.ramp_months || 36,
          subscription_rate: (scenario.inputs.subscription_rate * 100) || 40,
          install_cost_per_subscriber: scenario.inputs.install_cost_per_subscriber || 0,
          opex_per_sub: scenario.inputs.opex_per_sub || 25,
          opex_per_passing: scenario.inputs.opex_per_passing || 0,
          min_monthly_opex: scenario.inputs.min_monthly_opex || 0,
          cogs_pct_revenue: (scenario.inputs.cogs_pct_revenue * 100) || 0,
          min_non_circuit_cogs: scenario.inputs.min_non_circuit_cogs || 0,
          circuit: scenario.inputs.circuit || false,
          circuit_type: scenario.inputs.circuit_type || 1,
          ebitda_multiple: scenario.inputs.ebitda_multiple || 15,
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
      const response = await macEngineInvoke('listProjectModelOutputs', {
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
      const response = await macEngineInvoke('listProjectModelOutputs', {
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
      <AlertDialog
        open={defaultsPrompt.open}
        onOpenChange={(open) => setDefaultsPrompt(prev => ({ ...prev, open }))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Use default assumptions?</AlertDialogTitle>
            <AlertDialogDescription>
              Some required inputs are missing. You can apply defaults to continue, or cancel and fill them manually.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 text-sm">
            <div className="font-medium">Missing inputs</div>
            <ul className="space-y-1">
              {defaultsPrompt.missing.map((field) => (
                <li key={field.key} className="flex items-center justify-between gap-3">
                  <span>{field.label}</span>
                  <span className="text-muted-foreground">
                    Default: {formatDefaultValue(field.key, defaultsPrompt.defaults[field.key])}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const nextInputs = { ...inputs, ...defaultsPrompt.defaults };
                setDefaultsPrompt(prev => ({ ...prev, open: false }));
                await handleSaveScenario(defaultsPrompt.saveAsNew, nextInputs, true);
              }}
            >
              Use defaults and continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
                  <div className="col-span-2">
                    <Label>Model Profile</Label>
                    <Select
                      value={inputs.model_profile || 'standard'}
                      onValueChange={(value) => setInputs({ ...inputs, model_profile: value })}
                    >
                      <SelectTrigger className="mt-2">
                        <SelectValue placeholder="Choose a model profile" />
                      </SelectTrigger>
                      <SelectContent>
                        {MODEL_PROFILES.map((profile) => (
                          <SelectItem key={profile.value} value={profile.value}>
                            {profile.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-2">
                      Profiles are assumption presets. Use <strong>Developer Template 2-9-26</strong> for Prospect/Exec Dashboard alignment. Use
                      <strong> Horton</strong> or <strong>Acme</strong> for developer-specific runs. Use <strong>Standard</strong> for the general baseline.
                    </p>
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
                        Auto-computed: {inputs.passings} × ${inputs.capex_per_passing} + {inputs.passings} × {normalizeRate(inputs.subscription_rate, normalizeRate(inputs.penetration_target_pct, 0.4)) * 100}% × ${inputs.install_cost_per_subscriber} = {effectiveTotalCapex.toLocaleString()}
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
                        <Label>Install Cost per Subscriber ($)</Label>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>Installation cost applied per subscriber.</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <Input
                        type="number"
                        value={inputs.install_cost_per_subscriber}
                        onChange={(e) => setInputs({...inputs, install_cost_per_subscriber: Number(e.target.value)})}
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
                        <Label>OpEx per Passing ($)</Label>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>Monthly operating cost per passing.</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <Input
                        type="number"
                        value={inputs.opex_per_passing}
                        onChange={(e) => setInputs({...inputs, opex_per_passing: Number(e.target.value)})}
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-1 mb-2">
                        <Label>Min Monthly OpEx ($)</Label>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>Minimum monthly OpEx floor regardless of scale.</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <Input
                        type="number"
                        value={inputs.min_monthly_opex}
                        onChange={(e) => setInputs({...inputs, min_monthly_opex: Number(e.target.value)})}
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-1 mb-2">
                        <Label>Subscription Rate (%)</Label>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>Target subscriber penetration (e.g., 40 for 40%).</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <Input
                        type="number"
                        value={inputs.subscription_rate}
                        onChange={(e) => setInputs({...inputs, subscription_rate: Number(e.target.value)})}
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-1 mb-2">
                        <Label>Subscription Months</Label>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>Months to reach target subscriber count.</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <Input
                        type="number"
                        value={inputs.subscription_months}
                        onChange={(e) => setInputs({...inputs, subscription_months: Number(e.target.value)})}
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-1 mb-2">
                        <Label>COGS % of Revenue</Label>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>Variable COGS as a percent of revenue (e.g., 5 for 5%).</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <Input
                        type="number"
                        value={inputs.cogs_pct_revenue}
                        onChange={(e) => setInputs({...inputs, cogs_pct_revenue: Number(e.target.value)})}
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-1 mb-2">
                        <Label>Min Non-Circuit COGS ($)</Label>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>Monthly COGS floor for non-circuit expenses.</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <Input
                        type="number"
                        value={inputs.min_non_circuit_cogs}
                        onChange={(e) => setInputs({...inputs, min_non_circuit_cogs: Number(e.target.value)})}
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-1 mb-2">
                        <Label>Circuit Enabled</Label>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>Enable circuit costs using the default type thresholds.</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <Select value={inputs.circuit ? 'yes' : 'no'} onValueChange={(value) => setInputs({...inputs, circuit: value === 'yes'})}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="no">No</SelectItem>
                          <SelectItem value="yes">Yes</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <div className="flex items-center gap-1 mb-2">
                        <Label>Circuit Type</Label>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>Selects default NRC/MRC/threshold presets.</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <Select value={String(inputs.circuit_type || 1)} onValueChange={(value) => setInputs({...inputs, circuit_type: Number(value)})}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1 Gig</SelectItem>
                          <SelectItem value="2">2 Gig</SelectItem>
                          <SelectItem value="5">5 Gig</SelectItem>
                          <SelectItem value="10">10 Gig</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <div className="flex items-center gap-1 mb-2">
                        <Label>EBITDA Multiple</Label>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>Terminal value multiple applied to last 12 months EBITDA.</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <Input
                        type="number"
                        value={inputs.ebitda_multiple}
                        onChange={(e) => setInputs({...inputs, ebitda_multiple: Number(e.target.value)})}
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
                        disabled={saving}
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
                        disabled={saving}
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
