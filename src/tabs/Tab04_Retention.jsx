import { memo, useMemo, useState } from 'react';
import Tab10Cancellation from './Tab10_Cancellation';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
  BarChart, Bar, Cell
} from 'recharts';
import ChartCard from '../components/ChartCard';
import SortableKPIGrid from '../components/SortableKPIGrid';
import InsightsPanel from '../components/InsightsPanel';
import DrilldownModal, { useDrilldown } from '../components/DrilldownModal';
import { parseExcelDate, isActive } from '../dataEngine';
import FAQSection from '../components/FAQSection';

const ALL_INTERVALS = [0, 1, 3, 6, 12, 24];
const INTERVALS = ALL_INTERVALS;
const INTERVAL_LABELS = { 0: 'M0', 1: 'M1', 3: 'M3', 6: 'M6', 12: 'M12', 24: 'M24' };

const getColor = (pct) => {
  if (pct === null || pct === undefined) return 'transparent';
  if (pct >= 80) return 'rgba(34,197,94,0.7)';
  if (pct >= 60) return 'rgba(34,197,94,0.45)';
  if (pct >= 40) return 'rgba(251,191,36,0.5)';
  if (pct >= 20) return 'rgba(251,115,36,0.5)';
  return 'rgba(248,113,113,0.55)';
};

const CustomTooltip = ({ active, payload, label, unit = '%' }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-bright)', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
      <div style={{ color: 'var(--text-secondary)', marginBottom: 6 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, display: 'flex', gap: 8, justifyContent: 'space-between' }}>
          <span>{p.name}</span>
          <span style={{ fontWeight: 600 }}>
            {typeof p.value === 'number' ? p.value.toLocaleString('en-IN') : p.value}{unit}
          </span>
        </div>
      ))}
    </div>
  );
};

function RetentionContent({ cohorts: allCohorts, currentMaster, insights, filters, setFilters }) {
  const [intervalFilter, setIntervalFilter] = useState([3, 6, 12]);
  const [minYear, setMinYear] = useState(2020);
  const { drilldown, open: openDrilldown, close: closeDrilldown } = useDrilldown();

  const cohortCols = [
    { key: 'name', label: 'Name' },
    { key: 'pan', label: 'PAN', cls: 'td-name' },
    { key: 'product', label: 'Product' },
    { key: 'status', label: 'Status', align: 'right' },
    { key: 'cycle', label: 'Cycle', align: 'right', cls: 'td-num' },
    { key: 'firstDate', label: 'First Sub', align: 'right' },
  ];

  const handleCohortClick = (cohortKey) => {
    const [yr, mo] = cohortKey.split('-').map(Number);
    if (!yr || !mo) return;
    const from = new Date(yr, mo - 1, 1).getTime();
    const to   = new Date(yr, mo, 0, 23, 59, 59).getTime();
    const rows = (currentMaster || []).filter(r => {
      const d = parseExcelDate(r['First Subscription Date']) || parseExcelDate(r['Subscription Start Date']);
      return d && d.getTime() >= from && d.getTime() <= to;
    }).map(r => ({
      name: r.Name || r.name || '—',
      pan: String(r.PAN || '').trim().toUpperCase(),
      product: r['Smallcase Name'] || '—',
      status: r['Latest Subscription Status'] || '—',
      cycle: r['Cycle Number'] || '—',
      firstDate: (parseExcelDate(r['First Subscription Date']) || parseExcelDate(r['Subscription Start Date']))?.toLocaleDateString('en-IN') || '—',
    }));
    openDrilldown(`Cohort ${cohortKey}`, `Investors whose first subscription was in ${cohortKey}`, rows, cohortCols);
  };
  // Filter cohorts only by minYear dropdown — never by date range (survival analysis needs all history).
  const cohorts = useMemo(
    () => (allCohorts || []).filter(c => parseInt(c.cohort) >= minYear),
    [allCohorts, minYear]
  );

  // Per-basket top retention (current active % per cohort month, per product)
  // Only ranks cohorts ≥3 months old — newer cohorts are trivially 100% and misleading.
  const basketRetention = useMemo(() => {
    if (!currentMaster?.length) return [];

    const now = new Date();
    const MIN_AGE_MONTHS = 3;
    const cohortAge = (ck) => {
      const [yr, mo] = ck.split('-').map(Number);
      return (now.getFullYear() - yr) * 12 + (now.getMonth() + 1 - mo);
    };

    const products = [...new Set(currentMaster.map(r => String(r['Smallcase Name'] || '')).filter(Boolean))];
    return products.map(product => {
      const rows = currentMaster.filter(r => String(r['Smallcase Name'] || '') === product);
      const cohortMap = new Map();
      for (const r of rows) {
        const firstDate = parseExcelDate(r['First Subscription Date']) || parseExcelDate(r['Subscription Start Date']);
        if (!firstDate || firstDate.getFullYear() < minYear) continue;
        const ck = `${firstDate.getFullYear()}-${String(firstDate.getMonth() + 1).padStart(2, '0')}`;
        if (!cohortMap.has(ck)) cohortMap.set(ck, { total: 0, active: 0 });
        cohortMap.get(ck).total++;
        if (isActive(r)) cohortMap.get(ck).active++;
      }

      const allMonths = [...cohortMap.entries()]
        .map(([month, v]) => ({
          month,
          total: v.total,
          active: v.active,
          retPct: v.total > 0 ? Math.round(v.active / v.total * 100) : 0,
          ageMonths: cohortAge(month),
        }))
        .filter(m => m.total >= 3);

      // Prefer mature cohorts (≥3 months old) so trivial 100% new cohorts don't crowd out the ranking.
      // Fall back to all cohorts only if fewer than 3 mature ones exist for this product.
      const mature = allMonths.filter(m => m.ageMonths >= MIN_AGE_MONTHS);
      const pool = mature.length >= 3 ? mature : allMonths;

      const topMonths = pool
        .sort((a, b) => b.retPct - a.retPct || b.ageMonths - a.ageMonths)
        .slice(0, 5);

      return { product, topMonths, usingMature: mature.length >= 3 };
    }).filter(p => p.topMonths.length > 0).sort((a, b) => a.product.localeCompare(b.product));
  }, [currentMaster, minYear]);

  const retentionInsights = useMemo(() => {
    if (!cohorts?.length) return [];
    const insights = [];

    const cohortsWithM12 = cohorts.filter(c => c.m12 !== null && c.m12 !== undefined && c.size >= 10);
    const bestM12 = cohortsWithM12.length
      ? [...cohortsWithM12].sort((a, b) => b.m12 - a.m12)[0]
      : null;
    const worstM12 = cohortsWithM12.length
      ? [...cohortsWithM12].sort((a, b) => a.m12 - b.m12)[0]
      : null;

    if (bestM12) {
      insights.push({
        icon: '🏆',
        category: 'Retention Champion',
        title: `Best M12: ${bestM12.cohort}`,
        detail: `${bestM12.m12}% of ${bestM12.size.toLocaleString('en-IN')} subscribers still active at 12 months — strongest cohort retention on record.`,
        color: '#22c55e',
      });
    }
    if (worstM12) {
      insights.push({
        icon: '⚠️',
        category: 'Attention Required',
        title: `Weakest M12: ${worstM12.cohort}`,
        detail: `Only ${worstM12.m12}% retained at 12 months (${worstM12.size.toLocaleString('en-IN')} subs). Investigate product or pricing changes around that cohort.`,
        color: '#f87171',
      });
    }

    const m1vals = cohorts.filter(c => c.m1 !== null && c.m1 !== undefined && c.m1 > 0);
    const avgM1 = m1vals.length
      ? Math.round(m1vals.reduce((a, c) => a + c.m1, 0) / m1vals.length)
      : null;
    if (avgM1 !== null) {
      insights.push({
        icon: '📅',
        category: 'Early Retention',
        title: `Avg M1 Retention: ${avgM1}%`,
        detail: `Platform-wide first-month retention averages ${avgM1}% across ${m1vals.length} cohorts. ${avgM1 >= 70 ? 'Strong early engagement.' : avgM1 >= 50 ? 'Moderate early retention — room to improve onboarding.' : 'Early churn is high — onboarding needs urgent review.'}`,
        color: avgM1 >= 70 ? '#22c55e' : avgM1 >= 50 ? '#fbbf24' : '#f87171',
      });
    }

    const m6vals = cohorts.filter(c => c.m6 !== null && c.m6 !== undefined);
    const avgM6 = m6vals.length
      ? Math.round(m6vals.reduce((a, c) => a + c.m6, 0) / m6vals.length)
      : null;
    if (avgM6 !== null) {
      insights.push({
        icon: '📊',
        category: '6-Month Survival',
        title: `Avg M6 Retention: ${avgM6}%`,
        detail: `On average ${avgM6}% of subscribers survive to 6 months across ${m6vals.length} cohorts. ${avgM6 >= 50 ? 'Healthy 6-month stickiness.' : 'Majority of churn happens before M6 — mid-cycle engagement is critical.'}`,
        color: avgM6 >= 50 ? '#22c55e' : '#fbbf24',
      });
    }

    const m12vals = cohorts.filter(c => c.m12 !== null && c.m12 !== undefined);
    const avgM12 = m12vals.length
      ? Math.round(m12vals.reduce((a, c) => a + c.m12, 0) / m12vals.length)
      : null;
    if (avgM12 !== null) {
      insights.push({
        icon: '🎯',
        category: '12-Month Survival',
        title: `Avg M12 Retention: ${avgM12}%`,
        detail: `1-year survival rate is ${avgM12}% across ${m12vals.length} cohorts. ${avgM12 >= 40 ? 'Above-average long-term loyalty.' : 'Less than half survive year one — long-term retention strategies needed.'}`,
        color: avgM12 >= 40 ? '#22c55e' : '#f87171',
      });
    }

    const recent3 = cohorts.slice(-3).filter(c => c.m1 !== null && c.m1 !== undefined);
    const prev3 = cohorts.slice(-6, -3).filter(c => c.m1 !== null && c.m1 !== undefined);
    if (recent3.length >= 2 && prev3.length >= 2) {
      const recentAvgM1 = recent3.reduce((a, c) => a + c.m1, 0) / recent3.length;
      const prevAvgM1 = prev3.reduce((a, c) => a + c.m1, 0) / prev3.length;
      const delta = +(recentAvgM1 - prevAvgM1).toFixed(1);
      const improving = delta > 0;
      const flat = delta === 0;
      insights.push({
        icon: improving ? '📈' : flat ? '➡️' : '📉',
        category: 'Trend Analysis',
        title: `M1 Trend: ${improving ? '+' : ''}${delta}pp vs Prior Period`,
        detail: `Recent 3-cohort avg M1 retention is ${Math.round(recentAvgM1)}% vs ${Math.round(prevAvgM1)}% in the preceding 3 cohorts. ${improving ? 'Early retention is improving — recent acquisitions are sticking.' : flat ? 'Early retention is unchanged.' : 'Early retention is declining — investigate recent cohort quality.'}`,
        color: improving ? '#22c55e' : flat ? '#64748b' : '#f87171',
      });
    }

    const biggestDrop = cohorts
      .filter(c => c.m1 !== null && c.m6 !== null && c.m1 > 0)
      .map(c => ({ cohort: c.cohort, size: c.size, drop: c.m1 - c.m6 }))
      .sort((a, b) => b.drop - a.drop)[0];
    if (biggestDrop) {
      insights.push({
        icon: '🔻',
        category: 'Drop-off Alert',
        title: `Worst M1→M6 Drop: ${biggestDrop.cohort}`,
        detail: `Lost ${biggestDrop.drop.toFixed(1)}pp between M1 and M6 (${biggestDrop.size.toLocaleString('en-IN')} subs). Mid-cycle churn spike — check if a renewal event or fee change occurred around this cohort.`,
        color: '#fb923c',
      });
    }

    const largestCohort = [...cohorts].sort((a, b) => b.size - a.size)[0];
    if (largestCohort) {
      insights.push({
        icon: '🚀',
        category: 'Acquisition Peak',
        title: `Largest Cohort: ${largestCohort.cohort}`,
        detail: `${largestCohort.size.toLocaleString('en-IN')} subscribers acquired — biggest single-month intake. ${largestCohort.m6 !== null ? `M6 retention for this cohort: ${largestCohort.m6}%.` : 'M6 data not yet available for this cohort.'}`,
        color: '#22d3ee',
      });
    }

    return insights;
  }, [cohorts]);

  if (!cohorts?.length) return (
    <div className="empty-state">
      <span className="empty-state-icon">🔒</span>
      <div>No cohort data available. Ensure First Subscription Date or Subscription Start Date is present.</div>
    </div>
  );

  const recentCohorts = cohorts.slice(-18);
  const avgRetention = {};
  INTERVALS.forEach(interval => {
    const vals = cohorts.map(c => c[`m${interval}`]).filter(v => v !== null && v !== undefined);
    avgRetention[interval] = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  });

  // Retention curves for chart
  const retentionCurveData = INTERVALS.filter(i => avgRetention[i] !== null).map(i => ({
    label: INTERVAL_LABELS[i],
    'Avg Retention': avgRetention[i],
  }));

  const bestByInterval = {};
  const worstByInterval = {};
  for (const iv of [3, 6, 12]) {
    const valid = cohorts.filter(c => c[`m${iv}`] !== null && c[`m${iv}`] !== undefined && c.size >= 5);
    bestByInterval[iv]  = [...valid].sort((a, b) => b[`m${iv}`] - a[`m${iv}`])[0] || null;
    worstByInterval[iv] = [...valid].sort((a, b) => a[`m${iv}`] - b[`m${iv}`])[0] || null;
  }
  const latestCohort = cohorts[cohorts.length - 1];
  const totalCohortUsers = cohorts.reduce((a, c) => a + c.size, 0);
  const toggleInterval = (iv) => setIntervalFilter(prev => prev.includes(iv) ? prev.filter(x => x !== iv) : [...prev, iv]);
  const availableYears = [...new Set((allCohorts || []).map(c => parseInt(c.cohort)))].sort();

  return (
    <div>
      <DrilldownModal drilldown={drilldown} onClose={closeDrilldown} />

      <div className="section-heading">
        <div>
          <div className="section-title">🔒 Retention & Cohort Analysis</div>
          <div className="section-subtitle">How well we retain subscribers over time — cohort-based survival analysis</div>
        </div>
        <div className="section-divider" />
        {/* Year filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>From:</span>
          <select value={minYear} onChange={e => setMinYear(parseInt(e.target.value))}
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', borderRadius: 6, padding: '3px 8px', fontSize: 12, cursor: 'pointer' }}>
            {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        {/* Interval filter checkboxes */}
        <div style={{ display: 'flex', gap: 6 }}>
          {[3, 6, 12].map(iv => (
            <button key={iv} onClick={() => toggleInterval(iv)}
              style={{ padding: '3px 10px', borderRadius: 12, fontSize: 11, cursor: 'pointer', fontWeight: 600,
                background: intervalFilter.includes(iv) ? 'var(--accent-cyan)' : 'var(--bg-elevated)',
                color: intervalFilter.includes(iv) ? '#000' : 'var(--text-muted)',
                border: '1px solid var(--border-default)' }}>
              M{iv}
            </button>
          ))}
        </div>
        <div className="section-badge">{cohorts.length} Cohorts</div>
      </div>
      {/* KPIs */}
      <SortableKPIGrid storageKey="retention" cols="160px" cards={[
        { id: 'total_cohorts',   label: 'Total Cohorts',     value: cohorts.length,                    accent: 'var(--accent-cyan)',   icon: '📊',
          tooltip: 'Number of monthly acquisition cohorts (grouped by First Subscription Date, from the selected start year onward) with at least one subscriber tracked for survival.' },
        { id: 'm0_retention',    label: 'M0 Retention',      value: `${avgRetention[0] || 100}%`,       accent: 'var(--accent-green)',  icon: '🟢', sub: 'Baseline',
          tooltip: 'Average % of each cohort still active by the end of their own acquisition month — the starting baseline (near 100%) that every later interval is measured against.' },
        { id: 'm3_retention',    label: 'M3 Retention',      value: `${avgRetention[3] ?? '—'}%`,       accent: 'var(--accent-teal)',   icon: '📅',
          tooltip: 'Average % of each cohort still active 3 months after their acquisition month, averaged across all cohorts old enough to have reached M3.' },
        { id: 'm6_retention',    label: 'M6 Retention',      value: `${avgRetention[6] ?? '—'}%`,       accent: 'var(--accent-gold)',   icon: '📅', sub: '6-month survival',
          tooltip: 'Average % of each cohort still active 6 months after their acquisition month — a key mid-term stickiness benchmark across all cohorts old enough to have reached M6.' },
        { id: 'm12_retention',   label: 'M12 Retention',     value: `${avgRetention[12] ?? '—'}%`,      accent: avgRetention[12] > 40 ? 'var(--accent-green)' : 'var(--accent-red)', icon: '📅', sub: '1-year survival',
          tooltip: 'Average % of each cohort still active a full year after their acquisition month — the headline long-term loyalty number, averaged across cohorts old enough to have reached M12.' },
        { id: 'best_m3',  label: 'Best M3 Cohort',   value: bestByInterval[3]?.cohort  || '—', accent: 'var(--accent-green)',  small: true, sub: bestByInterval[3]  ? `${bestByInterval[3].m3}% at M3`  : '',
          tooltip: 'The acquisition cohort (min. 5 subscribers) with the highest % still active at 3 months — the strongest early-retention cohort on record.' },
        { id: 'worst_m3', label: 'Worst M3 Cohort',  value: worstByInterval[3]?.cohort || '—', accent: 'var(--accent-red)',    small: true, sub: worstByInterval[3] ? `${worstByInterval[3].m3}% at M3` : '',
          tooltip: 'The acquisition cohort (min. 5 subscribers) with the lowest % still active at 3 months — worth investigating what was different about how or when these subscribers joined.' },
        { id: 'best_m6',  label: 'Best M6 Cohort',   value: bestByInterval[6]?.cohort  || '—', accent: 'var(--accent-green)',  small: true, sub: bestByInterval[6]  ? `${bestByInterval[6].m6}% at M6`  : '',
          tooltip: 'The acquisition cohort (min. 5 subscribers) with the highest % still active at 6 months.' },
        { id: 'worst_m6', label: 'Worst M6 Cohort',  value: worstByInterval[6]?.cohort || '—', accent: 'var(--accent-red)',    small: true, sub: worstByInterval[6] ? `${worstByInterval[6].m6}% at M6` : '',
          tooltip: 'The acquisition cohort (min. 5 subscribers) with the lowest % still active at 6 months.' },
        { id: 'best_m12', label: 'Best M12 Cohort',  value: bestByInterval[12]?.cohort  || '—', accent: 'var(--accent-green)', small: true, sub: bestByInterval[12]  ? `${bestByInterval[12].m12}% at M12`  : '',
          tooltip: 'The acquisition cohort (min. 5 subscribers) with the highest % still active at 12 months — the best-performing cohort for long-term loyalty.' },
        { id: 'worst_m12',label: 'Worst M12 Cohort', value: worstByInterval[12]?.cohort || '—', accent: 'var(--accent-red)',   small: true, sub: worstByInterval[12] ? `${worstByInterval[12].m12}% at M12` : '',
          tooltip: 'The acquisition cohort (min. 5 subscribers) with the lowest % still active at 12 months — the weakest cohort for long-term loyalty.' },
        { id: 'largest_cohort',  label: 'Largest Cohort',    value: [...cohorts].sort((a,b)=>b.size-a.size)[0]?.cohort, accent: 'var(--accent-cyan)', small: true, sub: `${[...cohorts].sort((a,b)=>b.size-a.size)[0]?.size} subscribers`,
          tooltip: 'The single acquisition month that brought in the most unique investors — your biggest single-month intake by First Subscription Date.' },
        { id: 'cohort_users',    label: 'Total Cohort Users', value: totalCohortUsers?.toLocaleString(), accent: 'var(--accent-purple)',
          tooltip: 'Sum of cohort sizes across all cohorts shown (from the selected start year onward) — the total number of unique investors whose retention is being tracked here.' },
      ]} />

      {/* Retention Curves */}
      <div className="charts-grid charts-grid-2" style={{ marginBottom: '1rem' }}>
        <ChartCard title="Average Retention Curve" subtitle="Avg % of cohort still active at each time interval"
          tooltip="Averages the M0/M1/M3/M6/M12/M24 retention % across all cohorts old enough to have reached each interval — shows the typical survival shape over a subscriber's lifetime, independent of any single cohort's quirks.">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={retentionCurveData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
              <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} unit="%" domain={[0, 100]} />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={50} stroke="#fbbf24" strokeDasharray="4 4" />
              <Line type="monotone" dataKey="Avg Retention" stroke="#00d4ff" strokeWidth={3} dot={{ fill: '#00d4ff', r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Cohort Size Distribution" subtitle="Number of subscribers per monthly cohort"
          tooltip="Number of unique investors (by PAN) whose First Subscription Date falls in each month — shows acquisition volume over time, last 24 cohorts.">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={cohorts.slice(-24)} margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
              <XAxis dataKey="cohort" tick={{ fill: 'var(--text-muted)', fontSize: 9 }} interval="preserveStartEnd" />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
              <Tooltip content={<CustomTooltip unit="" />} />
              <Line type="monotone" dataKey="size" name="Cohort Size" stroke="#fbbf24" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Cohort Heatmap */}
      <ChartCard title="Monthly Cohort Retention Heatmap" subtitle="Each row = acquisition cohort · Click a row to see subscriber list · Color = retention %"
        tooltip="Each cell is the % of that row's cohort still active at the given month offset (M0/M1/M3/…). Reading a row left-to-right shows how that specific acquisition month's subscribers survived over time; a blank cell means the cohort isn't old enough yet to have reached that interval.">
        <div className="cohort-table">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.74rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-elevated)' }}>
                <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border-default)' }}>Cohort</th>
                <th style={{ padding: '8px 6px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.7rem', borderBottom: '1px solid var(--border-default)' }}>Size</th>
                {INTERVALS.map(i => (
                  <th key={i} style={{ padding: '8px 6px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.7rem', borderBottom: '1px solid var(--border-default)' }}>M{i}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentCohorts.map((c, ri) => (
                <tr key={c.cohort} style={{ borderBottom: '1px solid var(--border-dim)', cursor: 'pointer', transition: 'background 0.12s' }}
                  onClick={() => handleCohortClick(c.cohort)}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,212,255,0.05)'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}>
                  <td style={{ padding: '5px 10px', color: 'var(--accent-cyan)', fontFamily: 'monospace', fontSize: '0.72rem', whiteSpace: 'nowrap', textDecoration: 'underline dotted' }}>{c.cohort}</td>
                  <td style={{ padding: '5px 6px', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '0.72rem' }}>{c.size}</td>
                  {INTERVALS.map(interval => {
                    const val = c[`m${interval}`];
                    return (
                      <td key={interval} style={{ padding: '3px', textAlign: 'center' }}>
                        {val !== null && val !== undefined ? (
                          <div style={{
                            background: getColor(val),
                            borderRadius: 4,
                            padding: '4px 4px',
                            color: 'white',
                            fontFamily: 'monospace',
                            fontWeight: 600,
                            fontSize: '0.72rem',
                            minWidth: 36,
                          }}>{val}%</div>
                        ) : (
                          <div style={{ color: 'var(--border-bright)', fontSize: '0.7rem', textAlign: 'center' }}>—</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {/* Average Row */}
              <tr style={{ background: 'var(--bg-elevated)', borderTop: '2px solid var(--border-default)' }}>
                <td style={{ padding: '6px 10px', color: 'var(--text-primary)', fontWeight: 700, fontSize: '0.72rem' }}>Platform Average</td>
                <td style={{ padding: '6px', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '0.72rem' }}>
                  {Math.round(cohorts.reduce((a, c) => a + c.size, 0) / cohorts.length)}
                </td>
                {INTERVALS.map(interval => (
                  <td key={interval} style={{ padding: '3px', textAlign: 'center' }}>
                    {avgRetention[interval] !== null ? (
                      <div style={{
                        background: getColor(avgRetention[interval]),
                        borderRadius: 4, padding: '4px',
                        color: 'white', fontFamily: 'monospace', fontWeight: 700, fontSize: '0.72rem',
                        border: '1px solid rgba(255,255,255,0.2)',
                      }}>{avgRetention[interval]}%</div>
                    ) : '—'}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </ChartCard>

      {/* ─── PER-BASKET TOP 5 RETENTION MONTHS ─── */}
      {basketRetention.length > 0 && (
        <>
          <div className="section-heading" style={{ marginTop: '1.5rem' }}>
            <div>
              <div className="section-title">🧺 Top 5 Retention Months — Per Basket</div>
              <div className="section-subtitle">Mature cohorts (≥3 months old) with highest current-active % per basket · min 3 subscribers</div>
            </div>
            <div className="section-divider" />
            <div style={{ display: 'flex', gap: 6 }}>
              {[3, 6, 12].map(iv => (
                <button key={iv} onClick={() => toggleInterval(iv)}
                  style={{ padding: '3px 10px', borderRadius: 12, fontSize: 11, cursor: 'pointer', fontWeight: 600,
                    background: intervalFilter.includes(iv) ? 'var(--accent-cyan)' : 'var(--bg-elevated)',
                    color: intervalFilter.includes(iv) ? '#000' : 'var(--text-muted)',
                    border: '1px solid var(--border-default)' }}>
                  M{iv}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
            {basketRetention.map((p, pi) => (
              <ChartCard key={pi} title={p.product} subtitle="Top 5 cohort months by current active %"
                tooltip="For this product, the 5 acquisition-month cohorts (min. 3 subscribers) with the highest % still active today. Cohorts under 3 months old are excluded where possible since they're trivially close to 100% and would otherwise dominate the ranking.">

                <table className="data-table" style={{ fontSize: 11 }}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Cohort</th>
                      <th style={{ textAlign: 'right' }}>Total</th>
                      <th style={{ textAlign: 'right' }}>Active</th>
                      <th style={{ textAlign: 'right' }}>Ret %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.topMonths.map((m, mi) => (
                      <tr key={mi}>
                        <td className="td-rank">{mi + 1}</td>
                        <td className="td-name" style={{ fontFamily: 'monospace' }}>{m.month}</td>
                        <td className="td-num">{m.total}</td>
                        <td className="td-num">{m.active}</td>
                        <td className={m.retPct >= 60 ? 'td-good' : m.retPct >= 30 ? 'td-warn' : 'td-bad'}>{m.retPct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ChartCard>
            ))}
          </div>
        </>
      )}

      <div style={{ marginTop: '1rem' }}>
        <InsightsPanel insights={retentionInsights} title="🤖 Retention Intelligence — Cohort Survival Analysis" max={8} />
      </div>

      <FAQSection items={[
        { q: 'What is this page for?',
          a: 'It groups subscribers by the month they first joined (a "cohort" — just a batch of people who started around the same time) and tracks what % of each batch is still active as time passes. This shows whether people who join today are more or less likely to stick around than people who joined a year ago.' },
        { q: 'How is a subscriber assigned to a cohort?',
          a: 'By the month of their First Subscription Date (or Subscription Start Date if that\'s missing) — someone who first joined in March 2024 is in the "2024-03" cohort forever, even if they later renewed, switched products, or came back after a break. Each person (by PAN) is counted once per cohort.' },
        { q: 'What do the M0 / M1 / M3 / M6 / M12 / M24 columns mean?',
          a: 'They\'re checkpoints in months after a cohort\'s start: M0 is the end of their joining month (close to 100% by definition), M6 is 6 months later, M12 is a full year later, and so on. Each number is the % of that cohort still active at that checkpoint. A blank cell just means the cohort isn\'t old enough yet to have reached that checkpoint — it\'s not a zero.' },
        { q: 'Does the Period filter at the top of the dashboard narrow this page down?',
          a: 'It works a bit differently here than on most other pages. The retention percentages themselves are always calculated from each cohort\'s FULL history (they have to be, to correctly track someone for a full year) — the period filter doesn\'t shrink that math. What it DOES do is control which acquisition-month rows are shown: picking a period only displays cohorts that started within that window, while every row shown still has its retention % calculated the normal, full-history way. The Smallcase/Broker/etc. filters, by contrast, do genuinely narrow which subscribers are counted before cohorts are built.' },
        { q: 'Why is there also a "From: [year]" dropdown, separate from the main filters?',
          a: 'That\'s a page-specific shortcut for trimming the cohort list by starting year, so you can quickly focus on recent cohorts without touching the dashboard-wide period filter. It only affects which cohort rows are displayed here.' },
        { q: 'Why does a brand-new cohort always look great, and older ones look "worse"?',
          a: 'A cohort that started last month hasn\'t had time to lose anyone yet, so it\'s naturally close to 100% at M0/M1 — that\'s not a real achievement, just recency. That\'s also why the "Top 5 Retention Months" panel per product deliberately favors cohorts at least 3 months old where possible, so it\'s ranking genuine survival rather than cohorts too young to have been tested.' },
        { q: 'What\'s the difference between this page\'s Renewal-based numbers and the Retention Rate shown on the Executive page?',
          a: 'This page measures long-term survival of a fixed group of people over many months (did they stay active at all, on any cycle). The Executive page\'s Retention Rate is a single current-month snapshot (100% minus this month\'s churn), and the Subscriber Movement page\'s Renewal % is narrower still — it only looks at people who were actually due to renew that month. All three are valid, but they answer different questions and won\'t match each other.' },
      ]} />
    </div>
  );
}

function SubTabBar({ tabs, active, onSelect }) {
  return (
    <div style={{ display: 'flex', gap: 0, background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-default)', paddingLeft: '1rem' }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onSelect(t.id)} style={{
          padding: '10px 18px', fontSize: 13, fontWeight: active === t.id ? 700 : 400,
          color: active === t.id ? 'var(--accent-cyan)' : 'var(--text-muted)',
          background: 'none', border: 'none', borderBottom: active === t.id ? '2px solid var(--accent-cyan)' : '2px solid transparent',
          cursor: 'pointer', transition: 'color 0.15s', display: 'flex', alignItems: 'center', gap: 6,
        }}>{t.icon} {t.label}</button>
      ))}
    </div>
  );
}

export default memo(function Tab04Retention(props) {
  const [sub, setSub] = useState('retention');
  return (
    <>
      <SubTabBar tabs={[{id:'retention',label:'Retention & Cohort',icon:'🔒'},{id:'cancel',label:'Cancellation',icon:'⚠️'}]} active={sub} onSelect={setSub} />
      {sub === 'retention' ? <RetentionContent {...props} /> : <Tab10Cancellation {...props} />}
    </>
  );
});
