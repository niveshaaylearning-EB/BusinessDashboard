import { memo, useState, useCallback, useMemo } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import ChartCard from '../components/ChartCard';
import InsightsPanel from '../components/InsightsPanel';
import TabDateFilter from '../components/TabDateFilter';
import { YAxisTick } from '../components/YAxisTick';
import {
  applyFilters, filterRawByDate, getSummaryKPIs, getMonthlyMovement,
  getProductMetrics, getBrokerMetrics, getGeographyMetrics, getCancellationMetrics,
  getUniqueFlowCounts, buildCurrentSubscriptionMaster,
  formatExact, formatCurrencyExact, formatCrores,
} from '../dataEngine';
import DrilldownModal, { useDrilldown } from '../components/DrilldownModal';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const A_COLOR  = '#00d4ff';  // cyan  — Period A
const B_COLOR  = '#f97316';  // orange — Period B
const UP_CLR   = '#22c55e';
const DOWN_CLR = '#f87171';
const NEUT_CLR = '#94a3b8';

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const toInput  = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : '');
const fromInput = (s) => (s ? new Date(s + 'T00:00:00') : null);


function pctDiff(a, b) {
  if (a === 0 && b === 0) return { pct: 0, dir: 'neutral' };
  if (!a || a === 0) return { pct: null, dir: 'up' };
  const pct = +((b - a) / Math.abs(a) * 100).toFixed(1);
  return { pct, dir: pct > 0.4 ? 'up' : pct < -0.4 ? 'down' : 'neutral' };
}

function Delta({ a, b, invertBetter }) {
  const { pct, dir } = pctDiff(a, b);
  const isUp = dir === 'up';
  const isBetter = invertBetter ? !isUp : isUp;
  const color = dir === 'neutral' ? NEUT_CLR : isBetter ? UP_CLR : DOWN_CLR;
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20,
      background: `${color}1a`, color,
    }}>
      {dir === 'neutral' ? '─' : isUp ? '▲' : '▼'} {pct !== null ? `${Math.abs(pct)}%` : 'N/A'}
    </span>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--bg-elevated)', border: '1px solid var(--border-bright)',
      borderRadius: 8, padding: '10px 14px', fontSize: 12,
    }}>
      <div style={{ color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 600 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, display: 'flex', gap: 12, justifyContent: 'space-between' }}>
          <span>{p.name}</span>
          <span style={{ fontWeight: 700, fontFamily: 'monospace' }}>{p.value?.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
};

// ─── QUICK PRESETS ────────────────────────────────────────────────────────────
function makePresets() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  const mo = (n) => new Date(now.getFullYear(), now.getMonth() - n, now.getDate());
  const yr = (n) => new Date(now.getFullYear() - n, now.getMonth(), now.getDate());

  return [
    {
      label: 'Last 1M vs Prev 1M',
      a: { from: mo(1), to: today, label: 'Last 1 Month' },
      b: { from: mo(2), to: new Date(mo(1).getTime() - 1), label: 'Prev 1 Month' },
    },
    {
      label: 'Last 3M vs Prev 3M',
      a: { from: mo(3), to: today, label: 'Last 3 Months' },
      b: { from: mo(6), to: new Date(mo(3).getTime() - 1), label: 'Prev 3 Months' },
    },
    {
      label: 'Last 6M vs Prev 6M',
      a: { from: mo(6), to: today, label: 'Last 6 Months' },
      b: { from: mo(12), to: new Date(mo(6).getTime() - 1), label: 'Prev 6 Months' },
    },
    {
      label: 'Last 1Y vs Prev 1Y',
      a: { from: yr(1), to: today, label: 'Last 1 Year' },
      b: { from: yr(2), to: new Date(yr(1).getTime() - 1), label: 'Prev 1 Year' },
    },
    {
      label: 'This Year vs Last Year',
      a: { from: new Date(now.getFullYear(), 0, 1), to: today, label: `Year ${now.getFullYear()}` },
      b: { from: new Date(now.getFullYear() - 1, 0, 1), to: new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59), label: `Year ${now.getFullYear() - 1}` },
    },
    {
      label: 'Q1 vs Q2 (this year)',
      a: { from: new Date(now.getFullYear(), 0, 1), to: new Date(now.getFullYear(), 2, 31, 23, 59, 59), label: `Q1 ${now.getFullYear()}` },
      b: { from: new Date(now.getFullYear(), 3, 1), to: new Date(now.getFullYear(), 5, 30, 23, 59, 59), label: `Q2 ${now.getFullYear()}` },
    },
  ];
}

// ─── COMPUTE ONE PERIOD ───────────────────────────────────────────────────────
// allMonthly = getMonthlyMovement(rawData) computed once on the FULL dataset.
// Filtering that array to the period gives correct new/exits/closing counts
// because movements from ALL subscriptions (not just ones that started in range)
// are included. Using filterRawByDate + getMonthlyMovement would only count
// subscriptions that started in the period, making new === exits for any slice.
function computePeriod(rawData, master, allMonthly, from, to) {
  const fromMonth = new Date(from.getFullYear(), from.getMonth(), 1).getTime();
  const toMonth   = new Date(to.getFullYear(),   to.getMonth(),   1).getTime();

  // Filter full monthly timeline to the period
  const monthly = allMonthly.filter(m => {
    const md = m.monthDate instanceof Date ? m.monthDate.getTime() : new Date(m.monthDate).getTime();
    return md >= fromMonth && md <= toMonth;
  });

  const newSubs     = monthly.reduce((s, m) => s + (m.new    || 0), 0);
  const exits       = monthly.reduce((s, m) => s + (m.exited || 0), 0);
  // Active at END of period = closing count of last month in range
  const activeAtEnd = monthly.length ? (monthly[monthly.length - 1].closing || 0) : 0;

  // Breakdown metrics (product/broker/geo/cancel) are based on subscriptions
  // that started during the period — gives correct product/broker mix analysis
  const filters     = { dateFrom: from, dateTo: to };
  const filteredRaw = filterRawByDate(rawData, filters);
  const filtered    = applyFilters(master, filters);
  const kpis        = getSummaryKPIs(filtered, filteredRaw);
  const products    = getProductMetrics(filtered, filteredRaw);
  const brokers     = getBrokerMetrics(filtered);
  const geo         = getGeographyMetrics(filtered);
  const cancel      = getCancellationMetrics(filteredRaw);
  const uniqueFlow  = getUniqueFlowCounts(rawData, from, to);

  return {
    kpis, monthly, products, brokers, geo, cancel,
    metrics: {
      newSubs,
      uniqueNewSubs:       uniqueFlow.uniqueNewSubs,
      exits,
      uniqueExits:         uniqueFlow.uniqueExits,
      netGrowth:           newSubs - exits,
      netUnique:           uniqueFlow.netUnique,
      activeSubscribers:   activeAtEnd,
      uniqueInvestors:     kpis.totalUniqueSubscribers,
      retentionRate:       kpis.retentionRate,
      renewalRate:         kpis.renewalRate,
      avgPlanAmount:       kpis.avgPlanAmount,
      discountPenetration: kpis.discountPenetration,
      totalAUM:            kpis.totalAUM,
      avgNetworth:         kpis.avgNetworth,
      avgPL:               kpis.avgPL,
    },
  };
}

// ─── METRIC DEFINITIONS ───────────────────────────────────────────────────────
const sign = v => (v >= 0 ? '+' : '') + formatExact(v);

const METRIC_ROWS = [
  // ── Subscription-level (all cycles) ─────────────────────────────
  { key: 'newSubs',            label: 'New Subscriptions (All)',     fmt: formatExact,  unit: '',  invert: false, hint: 'Total subscription starts (all cycles)', group: 'All Subscriptions' },
  { key: 'exits',              label: 'Exits (All)',                  fmt: formatExact,  unit: '',  invert: true,  hint: 'Total unsubscribes (all cycles)',         group: 'All Subscriptions' },
  { key: 'netGrowth',          label: 'Net Growth (All)',             fmt: sign,         unit: '',  invert: false, hint: 'All new starts minus all exits',          group: 'All Subscriptions' },

  // ── Unique investor level (Cycle 1 new / any-cycle exit, PAN-deduped) ──
  { key: 'uniqueNewSubs',      label: 'Unique New Investors',        fmt: formatExact,  unit: '',  invert: false, hint: 'Distinct new investor PANs (Cycle 1) in period', group: 'Unique Investors' },
  { key: 'uniqueExits',        label: 'Unique Unsubscribers',        fmt: formatExact,  unit: '',  invert: true,  hint: 'Distinct investor PANs that exited in period',   group: 'Unique Investors' },
  { key: 'netUnique',          label: 'Net Unique Growth',           fmt: sign,         unit: '',  invert: false, hint: 'Unique new investors minus unique exits',         group: 'Unique Investors' },

  // ── Portfolio snapshot ────────────────────────────────────────────
  { key: 'activeSubscribers',  label: 'Active Subscribers',          fmt: formatExact,         unit: '',   invert: false, hint: 'Active at end of period' },
  { key: 'uniqueInvestors',    label: 'Unique Investors (Total)',     fmt: formatExact,         unit: '',   invert: false, hint: 'All unique PANs in filtered master' },
  { key: 'retentionRate',      label: 'Retention Rate',              fmt: v => `${v}%`,        unit: '%',  invert: false, hint: 'Monthly avg retention' },
  { key: 'renewalRate',        label: 'Renewal Rate',                fmt: v => `${v}%`,        unit: '%',  invert: false, hint: 'Active subs with Cycle > 1' },
  { key: 'avgPlanAmount',      label: 'Avg Plan Amount',             fmt: formatCurrencyExact, unit: '₹',  invert: false, hint: 'Average subscription plan amount' },
  { key: 'discountPenetration',label: 'Discount Penetration',        fmt: v => `${v}%`,        unit: '%',  invert: false, hint: '% active subs with discount' },
  { key: 'totalAUM',           label: 'Total AUM',                   fmt: formatCrores,        unit: 'Cr', invert: false, hint: 'Assets under management' },
  { key: 'avgNetworth',        label: 'Avg Networth',                fmt: formatCurrencyExact, unit: '₹',  invert: false, hint: 'Average networth per active sub' },
  { key: 'avgPL',              label: 'Avg P&L',                     fmt: formatCurrencyExact, unit: '₹',  invert: false, hint: 'Average total P&L per active sub' },
];

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default memo(function Tab16Comparison({ rawData, filters, setFilters }) {
  const PRESETS = makePresets();

  const [aFrom,  setAFrom]  = useState(null);
  const [aTo,    setATo]    = useState(null);
  const [bFrom,  setBFrom]  = useState(null);
  const [bTo,    setBTo]    = useState(null);
  const [aLabel, setALabel] = useState('Period A');
  const [bLabel, setBLabel] = useState('Period B');
  const [result, setResult] = useState(null);
  const [computing, setComputing] = useState(false);
  const [error,  setError]  = useState('');
  const [activeSection, setActiveSection] = useState('kpis');
  const [currentMaster, setCurrentMaster] = useState([]);
  const { drilldown, open: openDrilldown, close: closeDrilldown } = useDrilldown();

  const applyPreset = (p) => {
    setAFrom(p.a.from); setATo(p.a.to); setALabel(p.a.label);
    setBFrom(p.b.from); setBTo(p.b.to); setBLabel(p.b.label);
    setResult(null); setError('');
  };

  const handleCompare = useCallback(() => {
    if (!aFrom || !aTo || !bFrom || !bTo) {
      setError('Please set both date ranges before comparing.');
      return;
    }
    if (aFrom > aTo || bFrom > bTo) {
      setError('Start date must be before end date for each period.');
      return;
    }
    setError('');
    setComputing(true);
    // Use setTimeout to allow spinner to render before heavy computation
    setTimeout(() => {
      try {
        const master     = buildCurrentSubscriptionMaster(rawData);
        setCurrentMaster(master);
        const allMonthly = getMonthlyMovement(rawData);
        const a = computePeriod(rawData, master, allMonthly, aFrom, aTo);
        const b = computePeriod(rawData, master, allMonthly, bFrom, bTo);
        setResult({ a, b });
        setActiveSection('kpis');
      } catch (e) {
        setError('Computation failed: ' + (e.message || 'Unknown error'));
      } finally {
        setComputing(false);
      }
    }, 30);
  }, [rawData, aFrom, aTo, bFrom, bTo]);

  const comparisonInsights = useMemo(() => {
    if (!result) return [];
    const insights = [];
    const a = result.a.metrics;
    const b = result.b.metrics;

    // Net growth comparison
    if (a.netGrowth !== undefined && b.netGrowth !== undefined) {
      const aBetter = a.netGrowth > b.netGrowth;
      const diff = Math.abs(b.netGrowth - a.netGrowth);
      insights.push({
        icon: b.netGrowth >= a.netGrowth ? '📈' : '📉',
        category: 'Net Growth',
        title: `${b.netGrowth >= a.netGrowth ? aLabel : bLabel} had better net growth by ${diff.toLocaleString('en-IN')}`,
        detail: `${aLabel}: ${a.netGrowth >= 0 ? '+' : ''}${a.netGrowth.toLocaleString('en-IN')}  |  ${bLabel}: ${b.netGrowth >= 0 ? '+' : ''}${b.netGrowth.toLocaleString('en-IN')}`,
        color: b.netGrowth >= a.netGrowth ? '#22c55e' : '#f87171',
      });
    }

    // New subscribers comparison
    if (a.newSubs !== undefined && b.newSubs !== undefined) {
      const aMore = a.newSubs >= b.newSubs;
      const winner = aMore ? aLabel : bLabel;
      const loser  = aMore ? bLabel : aLabel;
      const winVal = aMore ? a.newSubs : b.newSubs;
      const loseVal = aMore ? b.newSubs : a.newSubs;
      const diffPct = loseVal > 0 ? +((winVal - loseVal) / loseVal * 100).toFixed(1) : null;
      insights.push({
        icon: '🆕',
        category: 'Acquisition',
        title: `${winner} acquired more new subscribers${diffPct !== null ? ` (+${diffPct}%)` : ''}`,
        detail: `${aLabel}: ${a.newSubs.toLocaleString('en-IN')}  |  ${bLabel}: ${b.newSubs.toLocaleString('en-IN')}`,
        color: '#22c55e',
      });
    }

    // Exits comparison — lower is better
    if (a.exits !== undefined && b.exits !== undefined) {
      const aLess = a.exits <= b.exits;
      const winner = aLess ? aLabel : bLabel;
      const diff = Math.abs(b.exits - a.exits);
      insights.push({
        icon: aLess ? '✅' : '⚠️',
        category: 'Exits',
        title: `${winner} had fewer exits by ${diff.toLocaleString('en-IN')}`,
        detail: `${aLabel}: ${a.exits.toLocaleString('en-IN')} exits  |  ${bLabel}: ${b.exits.toLocaleString('en-IN')} exits`,
        color: aLess ? '#22c55e' : '#f87171',
      });
    }

    // Active subscribers at end of period
    if (a.activeSubscribers !== undefined && b.activeSubscribers !== undefined) {
      const bStronger = b.activeSubscribers >= a.activeSubscribers;
      const winner = bStronger ? bLabel : aLabel;
      const diff = Math.abs(b.activeSubscribers - a.activeSubscribers);
      insights.push({
        icon: '✅',
        category: 'Active Base',
        title: `${winner} ended with a stronger active base`,
        detail: `${aLabel}: ${a.activeSubscribers.toLocaleString('en-IN')}  |  ${bLabel}: ${b.activeSubscribers.toLocaleString('en-IN')}  (diff: ${diff.toLocaleString('en-IN')})`,
        color: '#22d3ee',
      });
    }

    // Mixed signal — Period A better acquisition, Period B better retention
    if (a.newSubs !== undefined && b.newSubs !== undefined && a.exits !== undefined && b.exits !== undefined) {
      const aMoreSubs = a.newSubs > b.newSubs;
      const bFewerExits = b.exits < a.exits;
      if (aMoreSubs && bFewerExits) {
        insights.push({
          icon: '🔀',
          category: 'Mixed Signal',
          title: `${aLabel} acquired more, but ${bLabel} retained better`,
          detail: `${aLabel} won on acquisition (+${(a.newSubs - b.newSubs).toLocaleString('en-IN')} subs), ${bLabel} won on retention (${(a.exits - b.exits).toLocaleString('en-IN')} fewer exits)`,
          color: '#fbbf24',
        });
      }
    }

    // Unique new investors comparison
    if (a.uniqueNewSubs !== undefined && b.uniqueNewSubs !== undefined) {
      const aMore = a.uniqueNewSubs >= b.uniqueNewSubs;
      const winner = aMore ? aLabel : bLabel;
      const diff = Math.abs(b.uniqueNewSubs - a.uniqueNewSubs);
      insights.push({
        icon: '👤',
        category: 'Unique New Investors',
        title: `${winner} brought in more unique new investors (+${diff.toLocaleString('en-IN')})`,
        detail: `Unique Cycle-1 PANs — ${aLabel}: ${a.uniqueNewSubs.toLocaleString('en-IN')}  |  ${bLabel}: ${b.uniqueNewSubs.toLocaleString('en-IN')}`,
        color: '#22c55e',
      });
    }

    // Unique exits comparison — lower is better
    if (a.uniqueExits !== undefined && b.uniqueExits !== undefined) {
      const aLess = a.uniqueExits <= b.uniqueExits;
      const winner = aLess ? aLabel : bLabel;
      const diff = Math.abs(b.uniqueExits - a.uniqueExits);
      insights.push({
        icon: aLess ? '✅' : '⚠️',
        category: 'Unique Unsubscribers',
        title: `${winner} had fewer unique investors exit (${diff.toLocaleString('en-IN')} fewer)`,
        detail: `Distinct exiting PANs — ${aLabel}: ${a.uniqueExits.toLocaleString('en-IN')}  |  ${bLabel}: ${b.uniqueExits.toLocaleString('en-IN')}`,
        color: aLess ? '#22c55e' : '#f87171',
      });
    }

    // Net unique comparison
    if (a.netUnique !== undefined && b.netUnique !== undefined) {
      const bBetter = b.netUnique > a.netUnique;
      insights.push({
        icon: bBetter ? '📈' : '📉',
        category: 'Net Unique Growth',
        title: `${bBetter ? aLabel : bLabel} had better net unique investor growth`,
        detail: `Unique new minus unique exits — ${aLabel}: ${a.netUnique >= 0 ? '+' : ''}${a.netUnique.toLocaleString('en-IN')}  |  ${bLabel}: ${b.netUnique >= 0 ? '+' : ''}${b.netUnique.toLocaleString('en-IN')}`,
        color: bBetter ? '#22c55e' : '#f87171',
      });
    }

    // Top product comparison
    const pA = result.a.products?.[0];
    const pB = result.b.products?.[0];
    if (pA && pB && pA.product !== pB.product) {
      insights.push({
        icon: '🎯',
        category: 'Top Product',
        title: `Top products differed between periods`,
        detail: `${aLabel} leader: "${pA.product}" (${pA.active?.toLocaleString('en-IN')})  |  ${bLabel} leader: "${pB.product}" (${pB.active?.toLocaleString('en-IN')})`,
        color: '#a78bfa',
      });
    } else if (pA && pB && pA.product === pB.product) {
      insights.push({
        icon: '🎯',
        category: 'Top Product',
        title: `"${pA.product}" led both periods`,
        detail: `${aLabel}: ${pA.active?.toLocaleString('en-IN')} active  |  ${bLabel}: ${pB.active?.toLocaleString('en-IN')} active`,
        color: '#a78bfa',
      });
    }

    // Churn rate comparison
    if (a.retentionRate !== undefined && b.retentionRate !== undefined) {
      const bHigher = Number(b.retentionRate) >= Number(a.retentionRate);
      const winner = bHigher ? bLabel : aLabel;
      insights.push({
        icon: bHigher ? '💪' : '📉',
        category: 'Retention',
        title: `${winner} had higher retention rate`,
        detail: `${aLabel}: ${a.retentionRate}%  |  ${bLabel}: ${b.retentionRate}%`,
        color: bHigher ? '#22c55e' : '#fb923c',
      });
    }

    return insights;
  }, [result, aLabel, bLabel]);

  const MO = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const fmtRange = (from, to) => {
    if (!from || !to) return null;
    const f = from instanceof Date ? from : new Date(from);
    const t = to   instanceof Date ? to   : new Date(to);
    const fs = `${MO[f.getMonth()]} ${f.getFullYear()}`;
    const ts = `${MO[t.getMonth()]} ${t.getFullYear()}`;
    return fs === ts ? fs : `${fs} – ${ts}`;
  };

  // Build normalized monthly comparison data
  const monthlyChart = result ? (() => {
    const mA = result.a.monthly, mB = result.b.monthly;
    const maxLen = Math.max(mA.length, mB.length);
    return Array.from({ length: maxLen }, (_, i) => ({
      label:      `M+${i + 1}`,
      [aLabel]:   mA[i]?.closing ?? null,
      [bLabel]:   mB[i]?.closing ?? null,
      aMonth:     mA[i]?.month,
      bMonth:     mB[i]?.month,
    }));
  })() : [];

  const netChart = result ? (() => {
    const mA = result.a.monthly, mB = result.b.monthly;
    const maxLen = Math.max(mA.length, mB.length);
    return Array.from({ length: maxLen }, (_, i) => ({
      label:           `M+${i + 1}`,
      [`${aLabel} Net`]: mA[i]?.net ?? null,
      [`${bLabel} Net`]: mB[i]?.net ?? null,
    }));
  })() : [];

  // Product comparison
  const productChart = result ? (() => {
    const pA = result.a.products.slice(0, 12);
    const pB = result.b.products.slice(0, 12);
    const names = [...new Set([...pA.map(p => p.product), ...pB.map(p => p.product)])].slice(0, 12);
    return names.map(name => ({
      product: name.length > 20 ? name.slice(0, 20) + '…' : name,
      [aLabel]: pA.find(p => p.product === name)?.active || 0,
      [bLabel]: pB.find(p => p.product === name)?.active || 0,
    })).sort((x, y) => (y[aLabel] + y[bLabel]) - (x[aLabel] + x[bLabel]));
  })() : [];

  // Broker comparison
  const brokerChart = result ? (() => {
    const bkA = result.a.brokers.slice(0, 12);
    const bkB = result.b.brokers.slice(0, 12);
    const names = [...new Set([...bkA.map(b => b.broker), ...bkB.map(b => b.broker)])].slice(0, 12);
    return names.map(name => ({
      broker: name.length > 22 ? name.slice(0, 22) + '…' : name,
      [aLabel]: bkA.find(b => b.broker === name)?.active || 0,
      [bLabel]: bkB.find(b => b.broker === name)?.active || 0,
    })).sort((x, y) => (y[aLabel] + y[bLabel]) - (x[aLabel] + x[bLabel]));
  })() : [];

  // Geo comparison
  const geoChart = result ? (() => {
    const gA = result.a.geo.slice(0, 12);
    const gB = result.b.geo.slice(0, 12);
    const names = [...new Set([...gA.map(g => g.state), ...gB.map(g => g.state)])].slice(0, 12);
    return names.map(name => ({
      state: name,
      [aLabel]: gA.find(g => g.state === name)?.active || 0,
      [bLabel]: gB.find(g => g.state === name)?.active || 0,
    })).sort((x, y) => (y[aLabel] + y[bLabel]) - (x[aLabel] + x[bLabel]));
  })() : [];

  // Cancellation reasons comparison
  const cancelChart = result ? (() => {
    const cA = result.a.cancel.reasons || [];
    const cB = result.b.cancel.reasons || [];
    const reasons = [...new Set([...cA.map(r => r.reason), ...cB.map(r => r.reason)])].slice(0, 10);
    return reasons.map(r => ({
      reason: r.length > 28 ? r.slice(0, 28) + '…' : r,
      [aLabel]: cA.find(x => x.reason === r)?.count || 0,
      [bLabel]: cB.find(x => x.reason === r)?.count || 0,
    })).sort((x, y) => (y[aLabel] + y[bLabel]) - (x[aLabel] + x[bLabel]));
  })() : [];

  const SECTIONS = [
    { id: 'kpis',     label: '📊 KPIs' },
    { id: 'growth',   label: '📈 Growth Trend' },
    { id: 'products', label: '🎯 Products' },
    { id: 'brokers',  label: '🤝 Brokers' },
    { id: 'geo',      label: '🗺️ Geography' },
    { id: 'churn',    label: '⚠️ Churn' },
  ];

  // Drilldown helpers for subscriber data
  const subCols = [
    { key: 'name',    label: 'Name' },
    { key: 'pan',     label: 'PAN',     cls: 'td-name' },
    { key: 'product', label: 'Product' },
    { key: 'broker',  label: 'Broker' },
    { key: 'status',  label: 'Status',  align: 'right' },
    { key: 'cycle',   label: 'Cycle',   align: 'right', cls: 'td-num' },
  ];
  const toRow = r => ({
    name:    r.Name    || r.name    || '—',
    pan:     String(r.PAN || '').trim().toUpperCase(),
    product: r['Smallcase Name'] || '—',
    broker:  r['Broker Name']    || r['Broker'] || '—',
    status:  r['Latest Subscription Status'] || '—',
    cycle:   r['Cycle Number'] || '—',
  });

  return (
    <div>
      <DrilldownModal drilldown={drilldown} onClose={closeDrilldown} />

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="section-heading">
        <div>
          <div className="section-title">⚖️ Period Comparison Engine</div>
          <div className="section-subtitle">Compare any two time periods — days, months, quarters, years — across all analytics dimensions</div>
        </div>
        <div className="section-divider" />
        <div className="section-badge">Comparison</div>
      </div>

      {/* ── Period Selector Card ────────────────────────────────────────── */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-xl)', padding: '1.25rem 1.5rem', marginBottom: '1rem',
      }}>
        {/* Quick Presets */}
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Quick Presets</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {PRESETS.map(p => (
              <button key={p.label} onClick={() => applyPreset(p)}
                style={{
                  padding: '5px 12px', fontSize: 11, borderRadius: 6, cursor: 'pointer',
                  border: '1px solid var(--border-default)', background: 'var(--bg-elevated)',
                  color: 'var(--text-secondary)', transition: 'all .15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = A_COLOR; e.currentTarget.style.color = A_COLOR; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Period pickers */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '1rem', alignItems: 'start' }}>
          {/* Period A */}
          <div style={{ background: `${A_COLOR}0d`, border: `1px solid ${A_COLOR}44`, borderRadius: 10, padding: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: A_COLOR }} />
              <input value={aLabel} onChange={e => setALabel(e.target.value)}
                style={{
                  background: 'transparent', border: 'none', color: A_COLOR, fontWeight: 700,
                  fontSize: 13, outline: 'none', width: '100%',
                }}
                placeholder="Period A label" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>FROM</div>
                <input type="date" value={toInput(aFrom)}
                  onChange={e => { setAFrom(fromInput(e.target.value)); setResult(null); }}
                  className="filter-date" style={{ width: '100%' }} />
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>TO</div>
                <input type="date" value={toInput(aTo)}
                  onChange={e => { setATo(fromInput(e.target.value)); setResult(null); }}
                  className="filter-date" style={{ width: '100%' }} />
              </div>
            </div>
            {aFrom && aTo && (
              <div style={{ fontSize: 11, color: A_COLOR, marginTop: 8, opacity: 0.8 }}>
                {Math.ceil((aTo - aFrom) / 86400000)} days
              </div>
            )}
          </div>

          {/* VS divider */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: 40 }}>
            <div style={{ width: 1, height: 30, background: 'var(--border-default)' }} />
            <div style={{
              width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--bg-elevated)', border: '1px solid var(--border-bright)',
              fontSize: 12, fontWeight: 700, color: 'var(--text-muted)',
            }}>VS</div>
            <div style={{ width: 1, height: 30, background: 'var(--border-default)' }} />
          </div>

          {/* Period B */}
          <div style={{ background: `${B_COLOR}0d`, border: `1px solid ${B_COLOR}44`, borderRadius: 10, padding: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: B_COLOR }} />
              <input value={bLabel} onChange={e => setBLabel(e.target.value)}
                style={{
                  background: 'transparent', border: 'none', color: B_COLOR, fontWeight: 700,
                  fontSize: 13, outline: 'none', width: '100%',
                }}
                placeholder="Period B label" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>FROM</div>
                <input type="date" value={toInput(bFrom)}
                  onChange={e => { setBFrom(fromInput(e.target.value)); setResult(null); }}
                  className="filter-date" style={{ width: '100%' }} />
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>TO</div>
                <input type="date" value={toInput(bTo)}
                  onChange={e => { setBTo(fromInput(e.target.value)); setResult(null); }}
                  className="filter-date" style={{ width: '100%' }} />
              </div>
            </div>
            {bFrom && bTo && (
              <div style={{ fontSize: 11, color: B_COLOR, marginTop: 8, opacity: 0.8 }}>
                {Math.ceil((bTo - bFrom) / 86400000)} days
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="error-banner" style={{ marginTop: '1rem' }}><span>⚠️</span><span>{error}</span></div>
        )}

        <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'center' }}>
          <button className="btn-primary"
            disabled={computing || !aFrom || !aTo || !bFrom || !bTo}
            onClick={handleCompare}
            style={{ minWidth: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {computing
              ? <><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Computing...</>
              : '⚖️ Run Comparison'}
          </button>
        </div>
      </div>

      {/* ── Results ─────────────────────────────────────────────────────── */}
      {result && (
        <>
          {/* Result header */}
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-lg)', padding: '0.875rem 1.25rem', marginBottom: '0.875rem',
            display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: A_COLOR }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: A_COLOR }}>{aLabel}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{fmtRange(aFrom, aTo)}</div>
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>VS</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: B_COLOR }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: B_COLOR }}>{bLabel}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{fmtRange(bFrom, bTo)}</div>
              </div>
            </div>
            <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
              Delta shows B vs A
            </div>
          </div>

          {/* Section nav tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: '0.875rem', flexWrap: 'wrap' }}>
            {SECTIONS.map(s => (
              <button key={s.id} onClick={() => setActiveSection(s.id)}
                style={{
                  padding: '6px 14px', fontSize: 12, borderRadius: 8, cursor: 'pointer',
                  border: `1px solid ${activeSection === s.id ? 'var(--accent-cyan)' : 'var(--border-default)'}`,
                  background: activeSection === s.id ? 'rgba(0,212,255,0.12)' : 'var(--bg-elevated)',
                  color: activeSection === s.id ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                  fontWeight: activeSection === s.id ? 600 : 400,
                }}>
                {s.label}
              </button>
            ))}
          </div>

          {/* ── KPI Metrics Table ──────────────────────────────────────── */}
          {activeSection === 'kpis' && (
            <ChartCard title="Key Metrics Comparison" subtitle="All metrics for both periods — delta shows Period B vs Period A change">
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: '28%' }}>Metric</th>
                      <th style={{ textAlign: 'right', color: A_COLOR }}>
                        <div>{aLabel}</div>
                        {fmtRange(aFrom, aTo) && <div style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-muted)', marginTop: 2 }}>{fmtRange(aFrom, aTo)}</div>}
                      </th>
                      <th style={{ textAlign: 'right', color: B_COLOR }}>
                        <div>{bLabel}</div>
                        {fmtRange(bFrom, bTo) && <div style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-muted)', marginTop: 2 }}>{fmtRange(bFrom, bTo)}</div>}
                      </th>
                      <th style={{ textAlign: 'center' }}>Delta (B vs A)</th>
                      <th style={{ width: '20%', fontSize: 10, color: 'var(--text-muted)' }}>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const rows = [];
                      let lastGroup = null;
                      METRIC_ROWS.forEach(row => {
                        if (row.group && row.group !== lastGroup) {
                          lastGroup = row.group;
                          rows.push(
                            <tr key={`grp-${row.group}`}>
                              <td colSpan={5} style={{
                                padding: '6px 12px 4px', fontSize: 10, fontWeight: 700,
                                letterSpacing: '0.08em', textTransform: 'uppercase',
                                color: 'var(--text-muted)',
                                background: 'var(--bg-elevated)',
                                borderTop: '1px solid var(--border-default)',
                              }}>
                                {row.group === 'Unique Investors' ? '👤 ' : '📋 '}{row.group}
                              </td>
                            </tr>
                          );
                        }
                        const va = result.a.metrics[row.key];
                        const vb = result.b.metrics[row.key];
                        const isNetRow = row.key === 'netGrowth' || row.key === 'netUnique';
                        rows.push(
                          <tr key={row.key} style={isNetRow ? { background: 'rgba(0,212,255,0.04)', fontWeight: 700 } : {}}>
                            <td className="td-name" style={{ fontSize: 12, fontWeight: isNetRow ? 700 : 400, paddingLeft: row.group ? 20 : 12 }}>
                              {isNetRow ? '⟹ ' : ''}{row.label}
                            </td>
                            <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 13, color: A_COLOR, fontWeight: 600 }}>
                              {row.fmt(va)}
                            </td>
                            <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 13, color: B_COLOR, fontWeight: 600 }}>
                              {row.fmt(vb)}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <Delta a={va} b={vb} invertBetter={row.invert} />
                            </td>
                            <td style={{ fontSize: 10, color: 'var(--text-muted)' }}>{row.hint}</td>
                          </tr>
                        );
                      });
                      return rows;
                    })()}
                  </tbody>
                </table>
              </div>
            </ChartCard>
          )}

          {/* ── Growth Trend ───────────────────────────────────────────── */}
          {activeSection === 'growth' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <ChartCard
                title="Subscriber Closing Count — Normalized by Month"
                subtitle="Both periods aligned to Month 1, 2, 3… for direct comparison. Hover to see actual calendar month.">
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={monthlyChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
                    <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                    <Tooltip content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const pt = monthlyChart.find(m => m.label === label);
                      return (
                        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-bright)', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
                          <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
                          {pt?.aMonth && <div style={{ color: A_COLOR, fontSize: 10, marginBottom: 2 }}>{aLabel}: {pt.aMonth}</div>}
                          {pt?.bMonth && <div style={{ color: B_COLOR, fontSize: 10, marginBottom: 6 }}>{bLabel}: {pt.bMonth}</div>}
                          {payload.map((p, i) => (
                            <div key={i} style={{ color: p.color, display: 'flex', gap: 12, justifyContent: 'space-between' }}>
                              <span>{p.name}</span>
                              <span style={{ fontWeight: 700, fontFamily: 'monospace' }}>{p.value?.toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      );
                    }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey={aLabel} stroke={A_COLOR} strokeWidth={2.5} dot={false} connectNulls />
                    <Line type="monotone" dataKey={bLabel} stroke={B_COLOR} strokeWidth={2.5} dot={false} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard
                title="Net Monthly Additions — Period Comparison"
                subtitle="Month-by-month net subscriber change (new minus exits) for both periods — click a bar to see all active subscribers">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart
                    data={netChart}
                    barGap={2}
                    style={{ cursor: 'pointer' }}
                    onClick={p => {
                      if (!p?.activePayload?.[0]) return;
                      const monthLabel = p.activePayload[0].payload?.label;
                      if (!monthLabel) return;
                      const rows = currentMaster.map(toRow);
                      openDrilldown(
                        `All Active Subscribers`,
                        `${rows.length} subscribers in current master (click a specific month's detail table for period-filtered data)`,
                        rows, subCols
                      );
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
                    <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <ReferenceLine y={0} stroke="var(--border-bright)" />
                    <Bar dataKey={`${aLabel} Net`} fill={A_COLOR} radius={[2, 2, 0, 0]} />
                    <Bar dataKey={`${bLabel} Net`} fill={B_COLOR} radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="chart-clickable-hint">💡 Click any bar to see the full active subscriber list</div>
              </ChartCard>

              {/* Monthly summary table */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                {[
                  { label: aLabel, color: A_COLOR, monthly: result.a.monthly },
                  { label: bLabel, color: B_COLOR, monthly: result.b.monthly },
                ].map(({ label, color, monthly }) => (
                  <ChartCard key={label} title={`Monthly Detail — ${label}`} subtitle={`${monthly.length} months of data`}>
                    <div className="data-table-wrap" style={{ maxHeight: 300, overflowY: 'auto' }}>
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th style={{ color }}>Month</th>
                            <th style={{ textAlign: 'right' }}>New</th>
                            <th style={{ textAlign: 'right' }}>Exited</th>
                            <th style={{ textAlign: 'right' }}>Net</th>
                            <th style={{ textAlign: 'right' }}>Closing</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...monthly].reverse().map((m, i) => (
                            <tr key={i}>
                              <td className="td-name" style={{ fontSize: 11 }}>{m.monthFull}</td>
                              <td className="td-good">+{m.new?.toLocaleString()}</td>
                              <td className="td-bad">{m.exited?.toLocaleString()}</td>
                              <td className={m.net >= 0 ? 'td-good' : 'td-bad'}>{m.net != null ? `${m.net >= 0 ? '+' : ''}${m.net.toLocaleString()}` : '—'}</td>
                              <td className="td-num">{m.closing?.toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </ChartCard>
                ))}
              </div>
            </div>
          )}

          {/* ── Products ───────────────────────────────────────────────── */}
          {activeSection === 'products' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <ChartCard title="Product Mix — Active Subscribers" subtitle="Top products by active subscriber count — click a bar to see subscriber list">
                <ResponsiveContainer width="100%" height={Math.max(280, productChart.length * 44)}>
                  <BarChart
                    data={productChart}
                    layout="vertical"
                    barGap={2}
                    margin={{ left: 10, right: 20 }}
                    style={{ cursor: 'pointer' }}
                    onClick={p => {
                      if (!p?.activePayload?.[0]) return;
                      const prod = p.activePayload[0].payload?.product;
                      if (!prod) return;
                      // Match on truncated product name too
                      const rows = currentMaster
                        .filter(r => {
                          const pName = r['Smallcase Name'] || '';
                          const truncated = pName.length > 20 ? pName.slice(0, 20) + '…' : pName;
                          return pName === prod || truncated === prod;
                        })
                        .map(toRow);
                      openDrilldown(
                        `Subscribers — ${prod}`,
                        `${rows.length} active subscribers for this product`,
                        rows, subCols
                      );
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
                    <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                    <YAxis dataKey="product" type="category" width={130} tick={<YAxisTick fontSize={11} />} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey={aLabel} fill={A_COLOR} radius={[0, 3, 3, 0]} />
                    <Bar dataKey={bLabel} fill={B_COLOR} radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="chart-clickable-hint">💡 Click any bar to see detailed subscriber data for that product</div>
              </ChartCard>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                {[
                  { label: aLabel, color: A_COLOR, products: result.a.products },
                  { label: bLabel, color: B_COLOR, products: result.b.products },
                ].map(({ label, color, products }) => (
                  <ChartCard key={label} title={`Top Products — ${label}`} subtitle="Sorted by active subscribers">
                    <div className="data-table-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th style={{ color }}>#</th>
                            <th style={{ color }}>Product</th>
                            <th style={{ textAlign: 'right' }}>Active</th>
                            <th style={{ textAlign: 'right' }}>Renewal %</th>
                            <th style={{ textAlign: 'right' }}>Churn %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {products.slice(0, 12).map((p, i) => (
                            <tr key={i}>
                              <td style={{ color: 'var(--text-muted)', fontSize: 11 }}>{i + 1}</td>
                              <td className="td-name" style={{ fontSize: 11 }}>{p.product}</td>
                              <td className="td-good">{p.active?.toLocaleString()}</td>
                              <td style={{ textAlign: 'right', fontSize: 12 }}>{p.renewalRate}%</td>
                              <td style={{ textAlign: 'right', fontSize: 12, color: p.churnRate > 30 ? '#f87171' : 'inherit' }}>{p.churnRate}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </ChartCard>
                ))}
              </div>
            </div>
          )}

          {/* ── Brokers ────────────────────────────────────────────────── */}
          {activeSection === 'brokers' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <ChartCard title="Broker Active Subscribers" subtitle="Top brokers by active subscriber count — click a bar to see subscriber list">
                <ResponsiveContainer width="100%" height={Math.max(280, brokerChart.length * 44)}>
                  <BarChart
                    data={brokerChart}
                    layout="vertical"
                    barGap={2}
                    margin={{ left: 10, right: 20 }}
                    style={{ cursor: 'pointer' }}
                    onClick={p => {
                      if (!p?.activePayload?.[0]) return;
                      const brk = p.activePayload[0].payload?.broker;
                      if (!brk) return;
                      const rows = currentMaster
                        .filter(r => {
                          const bName = r['Broker Name'] || r['Broker'] || '';
                          const truncated = bName.length > 22 ? bName.slice(0, 22) + '…' : bName;
                          return bName === brk || truncated === brk;
                        })
                        .map(toRow);
                      openDrilldown(
                        `Subscribers — ${brk}`,
                        `${rows.length} active subscribers via this broker`,
                        rows, subCols
                      );
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
                    <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                    <YAxis dataKey="broker" type="category" width={140} tick={<YAxisTick fontSize={11} />} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey={aLabel} fill={A_COLOR} radius={[0, 3, 3, 0]} />
                    <Bar dataKey={bLabel} fill={B_COLOR} radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="chart-clickable-hint">💡 Click any bar to see detailed subscriber data for that broker</div>
              </ChartCard>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                {[
                  { label: aLabel, color: A_COLOR, brokers: result.a.brokers },
                  { label: bLabel, color: B_COLOR, brokers: result.b.brokers },
                ].map(({ label, color, brokers }) => (
                  <ChartCard key={label} title={`Broker Detail — ${label}`}>
                    <div className="data-table-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th style={{ color }}>#</th>
                            <th style={{ color }}>Broker</th>
                            <th style={{ textAlign: 'right' }}>Active</th>
                            <th style={{ textAlign: 'right' }}>Exited</th>
                            <th style={{ textAlign: 'right' }}>Renewal %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {brokers.slice(0, 12).map((b, i) => (
                            <tr key={i}>
                              <td style={{ color: 'var(--text-muted)', fontSize: 11 }}>{i + 1}</td>
                              <td className="td-name" style={{ fontSize: 11 }}>{b.broker}</td>
                              <td className="td-good">{b.active?.toLocaleString()}</td>
                              <td className="td-bad">{b.exited?.toLocaleString()}</td>
                              <td style={{ textAlign: 'right', fontSize: 12 }}>{b.renewalRate}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </ChartCard>
                ))}
              </div>
            </div>
          )}

          {/* ── Geography ──────────────────────────────────────────────── */}
          {activeSection === 'geo' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <ChartCard title="State-wise Active Subscribers" subtitle="Top states by active subscriber count — click a bar to see subscriber list">
                <ResponsiveContainer width="100%" height={Math.max(280, geoChart.length * 44)}>
                  <BarChart
                    data={geoChart}
                    layout="vertical"
                    barGap={2}
                    margin={{ left: 10, right: 20 }}
                    style={{ cursor: 'pointer' }}
                    onClick={p => {
                      if (!p?.activePayload?.[0]) return;
                      const state = p.activePayload[0].payload?.state;
                      if (!state) return;
                      const geoCols = [
                        { key: 'name',    label: 'Name' },
                        { key: 'pan',     label: 'PAN',     cls: 'td-name' },
                        { key: 'product', label: 'Product' },
                        { key: 'broker',  label: 'Broker' },
                        { key: 'status',  label: 'Status',  align: 'right' },
                        { key: 'cycle',   label: 'Cycle',   align: 'right', cls: 'td-num' },
                      ];
                      const rows = currentMaster
                        .filter(r => (r['State'] || '') === state)
                        .map(toRow);
                      openDrilldown(
                        `Subscribers from ${state}`,
                        `${rows.length} active subscribers in this state`,
                        rows, geoCols
                      );
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
                    <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                    <YAxis dataKey="state" type="category" width={120} tick={<YAxisTick fontSize={11} />} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey={aLabel} fill={A_COLOR} radius={[0, 3, 3, 0]} />
                    <Bar dataKey={bLabel} fill={B_COLOR} radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="chart-clickable-hint">💡 Click any bar to see detailed subscriber data for that state</div>
              </ChartCard>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                {[
                  { label: aLabel, color: A_COLOR, geo: result.a.geo },
                  { label: bLabel, color: B_COLOR, geo: result.b.geo },
                ].map(({ label, color, geo }) => (
                  <ChartCard key={label} title={`Geography Detail — ${label}`}>
                    <div className="data-table-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th style={{ color }}>#</th>
                            <th style={{ color }}>State</th>
                            <th style={{ textAlign: 'right' }}>Active</th>
                            <th style={{ textAlign: 'right' }}>Churn %</th>
                            <th style={{ textAlign: 'right' }}>NW Share %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {geo.slice(0, 15).map((g, i) => (
                            <tr key={i}>
                              <td style={{ color: 'var(--text-muted)', fontSize: 11 }}>{i + 1}</td>
                              <td className="td-name" style={{ fontSize: 11 }}>{g.state}</td>
                              <td className="td-good">{g.active?.toLocaleString()}</td>
                              <td style={{ textAlign: 'right', fontSize: 12, color: g.churnRate > 30 ? '#f87171' : 'inherit' }}>{g.churnRate}%</td>
                              <td style={{ textAlign: 'right', fontSize: 12 }}>{g.networthShare}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </ChartCard>
                ))}
              </div>
            </div>
          )}

          {/* ── Churn ──────────────────────────────────────────────────── */}
          {activeSection === 'churn' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {cancelChart.length > 0 ? (
                <ChartCard title="Cancellation Reasons Comparison" subtitle="Top exit reasons by count — click a bar to see subscriber list">
                  <ResponsiveContainer width="100%" height={Math.max(280, cancelChart.length * 44)}>
                    <BarChart
                      data={cancelChart}
                      layout="vertical"
                      barGap={2}
                      margin={{ left: 10, right: 20 }}
                      style={{ cursor: 'pointer' }}
                      onClick={p => {
                        if (!p?.activePayload?.[0]) return;
                        const reason = p.activePayload[0].payload?.reason;
                        if (!reason) return;
                        const cancelCols = [
                          { key: 'name',    label: 'Name' },
                          { key: 'pan',     label: 'PAN',     cls: 'td-name' },
                          { key: 'product', label: 'Product' },
                          { key: 'broker',  label: 'Broker' },
                          { key: 'status',  label: 'Status',  align: 'right' },
                          { key: 'cycle',   label: 'Cycle',   align: 'right', cls: 'td-num' },
                        ];
                        const rows = currentMaster
                          .filter(r => {
                            const cr = r['Cancellation Reason'] || '';
                            const truncated = cr.length > 28 ? cr.slice(0, 28) + '…' : cr;
                            return cr === reason || truncated === reason;
                          })
                          .map(toRow);
                        openDrilldown(
                          `Cancellation Reason — "${reason}"`,
                          `${rows.length} subscribers with this cancellation reason`,
                          rows, cancelCols
                        );
                      }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
                      <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                      <YAxis dataKey="reason" type="category" width={160} tick={<YAxisTick fontSize={10} />} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey={aLabel} fill={A_COLOR} radius={[0, 3, 3, 0]} />
                      <Bar dataKey={bLabel} fill={B_COLOR} radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="chart-clickable-hint">💡 Click any bar to see subscribers who gave that cancellation reason</div>
                </ChartCard>
              ) : (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: 13 }}>
                  No cancellation reason data found for the selected periods.
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                {[
                  { label: aLabel, color: A_COLOR, cancel: result.a.cancel },
                  { label: bLabel, color: B_COLOR, cancel: result.b.cancel },
                ].map(({ label, color, cancel }) => (
                  <ChartCard key={label} title={`Churn Detail — ${label}`} subtitle={`${cancel.total || 0} total exits with reason`}>
                    <div className="data-table-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th style={{ color }}>Reason</th>
                            <th style={{ textAlign: 'right' }}>Count</th>
                            <th style={{ textAlign: 'right' }}>Share %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(cancel.reasons || []).slice(0, 12).map((r, i) => (
                            <tr key={i}>
                              <td className="td-name" style={{ fontSize: 11 }}>{r.reason}</td>
                              <td className="td-bad">{r.count?.toLocaleString()}</td>
                              <td style={{ textAlign: 'right', fontSize: 12 }}>{r.pct}%</td>
                            </tr>
                          ))}
                          {!(cancel.reasons?.length) && (
                            <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, padding: '1rem' }}>No reason data</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </ChartCard>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Empty state */}
      {!result && !computing && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '3rem', color: 'var(--text-muted)', gap: 12,
        }}>
          <div style={{ fontSize: 48 }}>⚖️</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)' }}>Select two periods and click Run Comparison</div>
          <div style={{ fontSize: 12, maxWidth: 400, textAlign: 'center', lineHeight: 1.6 }}>
            Compare any two date ranges — days, months, quarters, or years. Analyze KPIs, subscriber growth, product mix, broker performance, geography, and churn side by side.
          </div>
        </div>
      )}
      {comparisonInsights.length > 0 && (
        <InsightsPanel insights={comparisonInsights} title="🤖 Comparison Intelligence — Period-over-Period Analysis" max={8} />
      )}
    </div>
  );
});
