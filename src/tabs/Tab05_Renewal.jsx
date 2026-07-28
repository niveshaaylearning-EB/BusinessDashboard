import { memo, useMemo, useState } from 'react';
import Tab19RevenueRisk from './Tab19_RevenueRisk';
import Tab25RenewalCalendar from './Tab25_RenewalCalendar';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LineChart, Line, Cell
} from 'recharts';
import ChartCard from '../components/ChartCard';
import { YAxisTick } from '../components/YAxisTick';
import SortableKPIGrid from '../components/SortableKPIGrid';
import InsightsPanel from '../components/InsightsPanel';
import DrilldownModal, { useDrilldown } from '../components/DrilldownModal';
import { formatNumber, parseExcelDate, isActive, normalizeData } from '../dataEngine';
import TabDateFilter from '../components/TabDateFilter';

const TENURE_BUCKETS = [
  { label: '<6 Months',  min: 0,  max: 6,        color: '#00d4ff' },
  { label: '6–12 Months', min: 6,  max: 12,       color: '#22c55e' },
  { label: '1–2 Years',  min: 12, max: 24,        color: '#fbbf24' },
  { label: '2–3 Years',  min: 24, max: 36,        color: '#fb923c' },
  { label: '3+ Years',   min: 36, max: Infinity,  color: '#a78bfa' },
];

function fmtTenure(months) {
  if (months < 12) return `${months}mo`;
  const y = Math.floor(months / 12), m = months % 12;
  return m > 0 ? `${y}y ${m}mo` : `${y}yr${y > 1 ? 's' : ''}`;
}

const COLORS = ['#00d4ff', '#fbbf24', '#22c55e', '#a78bfa', '#f87171'];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-bright)', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
      <div style={{ color: 'var(--text-secondary)', marginBottom: 6 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, display: 'flex', gap: 8, justifyContent: 'space-between' }}>
          <span>{p.name}</span><span style={{ fontWeight: 600 }}>{typeof p.value === 'number' ? p.value.toLocaleString() : p.value}</span>
        </div>
      ))}
    </div>
  );
};

function FunnelChart({ data, onRowClick }) {
  if (!data?.length) return null;
  const max = Math.max(...data.map(d => d.count));
  const FCOLORS = ['#00d4ff', '#22c55e', '#fbbf24', '#fb923c', '#a78bfa'];

  return (
    <div className="funnel-wrap">
      {data.map((step, i) => {
        const pct = max > 0 ? (step.count / max) * 100 : 0;
        return (
          <div key={i} className="funnel-step" onClick={() => onRowClick?.(step.cycle)}
            style={{ cursor: onRowClick ? 'pointer' : 'default', transition: 'background 0.15s' }}
            onMouseEnter={e => { if (onRowClick) e.currentTarget.style.background = 'rgba(0,212,255,0.06)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = ''; }}>
            <div className="funnel-label">{step.cycle}</div>
            <div className="funnel-bar-container">
              <div className="funnel-bar" style={{ width: `${Math.max(pct, 2)}%`, background: `linear-gradient(90deg, ${FCOLORS[i]}, ${FCOLORS[i]}88)` }}>
                <span className="funnel-bar-text">{step.count > 0 ? step.count.toLocaleString() : ''}</span>
              </div>
            </div>
            <div className="funnel-count">{step.count.toLocaleString()}</div>
            <div className="funnel-conv" style={{ color: i === 0 ? 'var(--text-muted)' : step.conversionRate >= 50 ? 'var(--accent-green)' : step.conversionRate >= 25 ? 'var(--accent-gold)' : 'var(--accent-red)' }}>
              {i === 0 ? '100%' : `→ ${step.conversionRate}%`}
            </div>
          </div>
        );
      })}
      <div className="chart-clickable-hint" style={{ marginTop: 4 }}>💡 Click any cycle row to see subscriber list</div>
    </div>
  );
}

function RenewalContent({ renewalFunnel, renewalByProduct, currentMaster, insights, filters, setFilters, rawData, filteredRaw }) {
  const { drilldown, open: openDrilldown, close: closeDrilldown } = useDrilldown();

  // Period renewal rate: of all subscription events in the selected date range,
  // what % were renewals (Cycle >= 2) vs first-time (Cycle = 1)?
  const periodRenewalRate = useMemo(() => {
    const rows = normalizeData((filteredRaw?.length ? filteredRaw : rawData) || []);
    if (!rows.length) return null;
    const activeRows = rows.filter(r => String(r['Cycle Level Status'] || '').trim().toUpperCase() !== 'UNSUBSCRIBED');
    if (!activeRows.length) return null;
    const renewals  = activeRows.filter(r => (Number(r['Cycle Number']) || 0) >= 2).length;
    const total     = activeRows.length;
    return total > 0 ? Math.round(renewals / total * 100) : null;
  }, [filteredRaw, rawData]);

  const hasPeriod = !!(filters?.dateFrom || filters?.dateTo);

  const cycleCols = [
    { key: 'name', label: 'Name' },
    { key: 'pan', label: 'PAN', cls: 'td-name' },
    { key: 'product', label: 'Product' },
    { key: 'broker', label: 'Broker' },
    { key: 'status', label: 'Status', align: 'right' },
    { key: 'cycle', label: 'Cycle', align: 'right', cls: 'td-num' },
  ];

  const handleCycleClick = (cycleLabel) => {
    const cycleNum = cycleLabel === 'C5+' ? 5 : parseInt(cycleLabel.replace('C', ''));
    if (!cycleNum) return;
    const rows = (currentMaster || []).filter(r => {
      const c = Number(r['Cycle Number']) || 0;
      return cycleLabel === 'C5+' ? c >= 5 : c === cycleNum;
    }).filter(isActive).map(r => ({
      name: r.Name || r.name || '—',
      pan: String(r.PAN || '').trim().toUpperCase(),
      product: r['Smallcase Name'] || '—',
      broker: r['Broker Name'] || r['Broker'] || '—',
      status: r['Latest Subscription Status'] || '—',
      cycle: r['Cycle Number'] || '—',
    }));
    openDrilldown(`${cycleLabel} Subscribers`, `Active investors currently at Cycle ${cycleLabel}`, rows, cycleCols);
  };
  const renewalInsights = useMemo(() => {
    if (!renewalFunnel?.length) return [];
    const result = [];

    const c1 = renewalFunnel[0]?.count || 0;
    const c2 = renewalFunnel[1]?.count || 0;
    const c3 = renewalFunnel[2]?.count || 0;
    const c4 = renewalFunnel[3]?.count || 0;
    const c5 = renewalFunnel[4]?.count || 0;

    const c1c2Rate = c1 > 0 ? +(c2 / c1 * 100).toFixed(1) : 0;
    result.push({
      icon: '🔄',
      category: 'First Renewal',
      title: `C1→C2 Conversion: ${c1c2Rate}%`,
      detail: `${c2.toLocaleString('en-IN')} of ${c1.toLocaleString('en-IN')} first-cycle subscribers renewed. ${c1c2Rate >= 50 ? 'Strong first renewal — product is delivering initial value.' : c1c2Rate >= 30 ? 'Moderate first renewal — a targeted win-back campaign could recover lapsed C1 subscribers.' : 'Less than a third renew — first-renewal conversion is the top priority to fix.'}`,
      color: c1c2Rate >= 50 ? '#22c55e' : c1c2Rate >= 30 ? '#fbbf24' : '#f87171',
    });

    const transitions = [
      { label: 'C1→C2', from: c1, to: c2 },
      { label: 'C2→C3', from: c2, to: c3 },
      { label: 'C3→C4', from: c3, to: c4 },
      { label: 'C4→C5+', from: c4, to: c5 },
    ];
    const drops = transitions
      .filter(t => t.from > 0)
      .map(t => ({ label: t.label, lost: t.from - t.to, rate: +((t.to / t.from) * 100).toFixed(1) }))
      .sort((a, b) => b.lost - a.lost);
    if (drops.length) {
      const worst = drops[0];
      result.push({
        icon: '📉',
        category: 'Funnel Drop-off',
        title: `Steepest Drop: ${worst.label} (${worst.rate}% pass-through)`,
        detail: `${worst.lost.toLocaleString('en-IN')} subscribers are lost at the ${worst.label} transition — the single largest churn point in the renewal funnel. Intervening here has the highest leverage.`,
        color: '#f87171',
      });
    }

    const c5Rate = c1 > 0 ? +(c5 / c1 * 100).toFixed(1) : 0;
    result.push({
      icon: '🏅',
      category: 'Long-term Stickiness',
      title: `C5+ Stickiness: ${c5Rate}% of C1 reach Cycle 5+`,
      detail: `${c5.toLocaleString('en-IN')} subscribers have renewed 5 or more times out of ${c1.toLocaleString('en-IN')} who started at C1. ${c5Rate >= 20 ? 'Strong long-term loyalty base.' : c5Rate >= 10 ? 'Moderate loyalty cohort — nurture multi-year subscribers with exclusive benefits.' : 'Very few reach multi-year status — long-term retention programs are under-developed.'}`,
      color: c5Rate >= 20 ? '#22c55e' : c5Rate >= 10 ? '#fbbf24' : '#f87171',
    });

    const c1Share = c1 > 0 ? +((c1 / (c1 + c2 + c3 + c4 + c5)) * 100).toFixed(1) : 0;
    result.push({
      icon: '1️⃣',
      category: 'Trial Cohort',
      title: `${c1Share}% of Active Base is C1`,
      detail: `${c1.toLocaleString('en-IN')} subscribers are still in their first cycle. ${c1Share >= 50 ? 'More than half the base is new — revenue is heavily dependent on first-renewal conversion.' : c1Share >= 30 ? 'Significant share in trial phase — first-renewal conversion strongly drives near-term revenue.' : 'Mature renewal base — most revenue comes from loyal repeat subscribers.'}`,
      color: c1Share >= 50 ? '#fbbf24' : '#22d3ee',
    });

    if (renewalByProduct?.length) {
      const withRates = renewalByProduct.filter(p => p.c1 > 0 && p.c1c2Rate !== undefined && p.c1c2Rate !== null);

      if (withRates.length) {
        const bestC1C2 = [...withRates].sort((a, b) => b.c1c2Rate - a.c1c2Rate)[0];
        result.push({
          icon: '⭐',
          category: 'Product Champion',
          title: `Best C1→C2: ${bestC1C2.product}`,
          detail: `${bestC1C2.c1c2Rate}% first-renewal rate on ${bestC1C2.c1.toLocaleString('en-IN')} C1 subscribers. Study what makes this product sticky and replicate across the portfolio.`,
          color: '#22c55e',
        });

        const worstC1C2 = [...withRates].sort((a, b) => a.c1c2Rate - b.c1c2Rate)[0];
        result.push({
          icon: '🔻',
          category: 'Renewal Risk',
          title: `Weakest C1→C2: ${worstC1C2.product}`,
          detail: `Only ${worstC1C2.c1c2Rate}% of ${worstC1C2.c1.toLocaleString('en-IN')} C1 subscribers renewed. Product-market fit or onboarding experience needs review.`,
          color: '#f87171',
        });

        const withC3C4 = renewalByProduct.filter(p => p.c3 > 0 && p.c3c4Rate !== undefined && p.c3c4Rate !== null);
        if (withC3C4.length) {
          const loyaltyChamp = [...withC3C4].sort((a, b) => b.c3c4Rate - a.c3c4Rate)[0];
          result.push({
            icon: '💎',
            category: 'Loyalty Champion',
            title: `Best C3→C4: ${loyaltyChamp.product}`,
            detail: `${loyaltyChamp.c3c4Rate}% C3→C4 conversion — the strongest long-term loyalty rate in the portfolio. Subscribers at C3+ are deeply committed to this product.`,
            color: '#a78bfa',
          });
        }
      }
    }

    return result;
  }, [renewalFunnel, renewalByProduct]);

  const tenureData = useMemo(() => {
    const empty = { buckets: TENURE_BUCKETS.map(b => ({ ...b, count: 0 })), totalWithDate: 0, allClients: [] };
    if (!currentMaster?.length) return empty;

    // Step 1: collect unique active PANs + their best name/product/cycle from currentMaster
    const activePANs = new Map();
    for (const r of currentMaster.filter(isActive)) {
      const pan = String(r.PAN || '').trim().toUpperCase();
      if (!pan) continue;
      const cycle = Number(r['Cycle Number']) || 0;
      const name = String(r.Name || r.name || '').trim();
      const product = String(r['Smallcase Name'] || '').trim();
      if (!activePANs.has(pan)) {
        activePANs.set(pan, { pan, name, product, cycle });
      } else {
        const ex = activePANs.get(pan);
        if (cycle > ex.cycle) ex.cycle = cycle;
        if (!ex.name && name) ex.name = name;
      }
    }

    // Step 2: scan ALL rawData rows to find the absolute earliest subscription date per
    // active PAN — currentMaster tiebreaks on LATEST date, so long-tenure clients
    // would otherwise show their most-recent renewal date instead of their original one.
    const panFirstDate = new Map();
    const source = rawData?.length ? rawData : currentMaster;
    for (const r of source) {
      const pan = String(r.PAN || r.pan || '').trim().toUpperCase();
      if (!pan || !activePANs.has(pan)) continue;
      const d = parseExcelDate(r['First Subscription Date']) || parseExcelDate(r['Subscription Start Date']);
      if (!d) continue;
      if (!panFirstDate.has(pan) || d < panFirstDate.get(pan)) panFirstDate.set(pan, d);
    }

    const today = new Date();
    const buckets = TENURE_BUCKETS.map(b => ({ ...b, count: 0 }));
    const allClients = [];
    for (const [pan, info] of activePANs) {
      const firstDate = panFirstDate.get(pan);
      if (!firstDate) continue;
      const months = Math.round((today - firstDate) / (1000 * 60 * 60 * 24 * 30.44));
      const firstDateStr = firstDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      allClients.push({ ...info, firstDate, months, tenureLabel: fmtTenure(months), firstDateStr });
      for (const b of buckets) { if (months >= b.min && months < b.max) { b.count++; break; } }
    }
    return { buckets, totalWithDate: allClients.length, allClients };
  }, [currentMaster, rawData]);

  const longestTenure = useMemo(() =>
    [...tenureData.allClients].sort((a, b) => a.firstDate - b.firstDate).slice(0, 30),
    [tenureData]);

  const onDateChange = (from, to) => setFilters(prev => ({ ...prev, dateFrom: from, dateTo: to }));

  if (!renewalFunnel?.length) return <div className="empty-state"><span className="empty-state-icon">🔄</span><div>No renewal data available</div></div>;

  const c1 = renewalFunnel[0]?.count || 0;
  const c2 = renewalFunnel[1]?.count || 0;
  const c3 = renewalFunnel[2]?.count || 0;
  const c4 = renewalFunnel[3]?.count || 0;
  const c5 = renewalFunnel[4]?.count || 0;
  const c1c2Rate = c1 > 0 ? +(c2 / c1 * 100).toFixed(1) : 0;
  const c2c3Rate = c2 > 0 ? +(c3 / c2 * 100).toFixed(1) : 0;
  const c3c4Rate = c3 > 0 ? +(c4 / c3 * 100).toFixed(1) : 0;
  const c4c5Rate = c4 > 0 ? +(c5 / c4 * 100).toFixed(1) : 0;

  const topRenewalProds = [...(renewalByProduct || [])].sort((a, b) => b.c1c2Rate - a.c1c2Rate).slice(0, 8);
  const cycleDistChart = renewalByProduct?.slice(0, 8).map(p => ({
    product: p.product.length > 14 ? p.product.slice(0, 13) + '…' : p.product,
    c1: p.c1, c2: p.c2, c3: p.c3, c4: p.c4, c5: p.c5plus,
  }));

  return (
    <div>
      <DrilldownModal drilldown={drilldown} onClose={closeDrilldown} />

      <div className="section-heading">
        <div><div className="section-title">🔄 Renewal Analytics</div><div className="section-subtitle">Subscription cycle progression — where subscribers renew and where they drop off</div></div>
        <div className="section-divider" />
        <div className="section-badge">Cycle Intelligence</div>
      </div>
      <TabDateFilter dateFrom={filters?.dateFrom} dateTo={filters?.dateTo} onChange={onDateChange} />

      {/* Period Renewal Rate banner — shown when a date filter is active */}
      {periodRenewalRate !== null && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16,
          background: periodRenewalRate >= 60 ? 'rgba(34,197,94,0.12)' : periodRenewalRate >= 40 ? 'rgba(251,191,36,0.12)' : 'rgba(248,113,113,0.12)',
          border: `1px solid ${periodRenewalRate >= 60 ? 'rgba(34,197,94,0.4)' : periodRenewalRate >= 40 ? 'rgba(251,191,36,0.4)' : 'rgba(248,113,113,0.4)'}`,
          borderRadius: 12, padding: '1rem 1.5rem', marginBottom: '1rem',
        }}>
          <div style={{ fontSize: '2.2rem', fontWeight: 800, color: periodRenewalRate >= 60 ? '#22c55e' : periodRenewalRate >= 40 ? '#fbbf24' : '#f87171', letterSpacing: -1 }}>
            {periodRenewalRate}%
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
              Avg Renewal Rate — {hasPeriod ? 'Selected Period' : 'All Time'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              % of active subscription cycles in this period that are renewals (Cycle 2+)
            </div>
          </div>
        </div>
      )}

      {/* KPIs */}
      <SortableKPIGrid storageKey="renewal" cols="150px" cards={[
        { id: 'c1_subs',   label: 'Cycle 1 Subs',     value: formatNumber(c1), accent: 'var(--accent-cyan)',   icon: '1️⃣' },
        { id: 'c2_subs',   label: 'Cycle 2 Subs',     value: formatNumber(c2), accent: 'var(--accent-teal)',   icon: '2️⃣', sub: `C1→C2: ${c1c2Rate}%` },
        { id: 'c3_subs',   label: 'Cycle 3 Subs',     value: formatNumber(c3), accent: 'var(--accent-green)',  icon: '3️⃣', sub: `C2→C3: ${c2c3Rate}%` },
        { id: 'c4_subs',   label: 'Cycle 4 Subs',     value: formatNumber(c4), accent: 'var(--accent-purple)', icon: '4️⃣', sub: `C3→C4: ${c3c4Rate}%` },
        { id: 'c5_subs',   label: 'Cycle 5+ Subs',    value: formatNumber(c5), accent: 'var(--accent-gold)',   icon: '5️⃣', sub: `C4→C5: ${c4c5Rate}%` },
        { id: 'c1c2_rate', label: 'C1→C2 Conversion', value: `${c1c2Rate}%`,   accent: c1c2Rate >= 40 ? 'var(--accent-green)' : 'var(--accent-red)', icon: '🎯' },
        { id: 'c2c3_rate', label: 'C2→C3 Conversion', value: `${c2c3Rate}%`,   accent: c2c3Rate >= 40 ? 'var(--accent-green)' : 'var(--accent-red)', icon: '📈' },
        { id: 'c3c4_rate', label: 'C3→C4 Conversion', value: `${c3c4Rate}%`,   accent: c3c4Rate >= 40 ? 'var(--accent-green)' : 'var(--accent-red)', icon: '🔄' },
        { id: 'c4c5_rate', label: 'C4→C5 Conversion', value: `${c4c5Rate}%`,   accent: c4c5Rate >= 40 ? 'var(--accent-green)' : 'var(--accent-red)', icon: '🚀' },
      ]} />

      {/* Funnel + Bar */}
      <div className="charts-grid charts-grid-2" style={{ marginBottom: '1rem' }}>
        <ChartCard title="Renewal Funnel" subtitle="Subscriber count at each subscription cycle — click a row to drill down">
          <FunnelChart data={renewalFunnel} onRowClick={cycle => handleCycleClick(cycle)} />
        </ChartCard>

        <ChartCard title="Cycle Distribution (All Cycles)" subtitle="Click a bar to see all subscribers at that cycle">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={renewalFunnel} onClick={p => { if (p?.activePayload?.[0]) handleCycleClick(p.activePayload[0].payload.cycle); }} style={{ cursor: 'pointer' }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
              <XAxis dataKey="cycle" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name="Subscribers" radius={[4, 4, 0, 0]}>
                {renewalFunnel.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="chart-clickable-hint">💡 Click any cycle bar to see subscriber list</div>
        </ChartCard>
      </div>

      {/* By Product */}
      <div className="charts-grid charts-grid-2" style={{ marginBottom: '1rem' }}>
        <ChartCard title="C1→C2 Renewal Rate by Product" subtitle="Which products have the strongest first renewal">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={topRenewalProds} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
              <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} unit="%" domain={[0, 100]} />
              <YAxis dataKey="product" type="category" width={115} tick={<YAxisTick maxChars={14} />} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="c1c2Rate" name="C1→C2 Rate %" fill="#22c55e" radius={[0, 4, 4, 0]}>
                {topRenewalProds.map((p, i) => (
                  <Cell key={i} fill={p.c1c2Rate >= 50 ? '#22c55e' : p.c1c2Rate >= 25 ? '#fbbf24' : '#f87171'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Cycle Distribution by Product" subtitle="Stacked view of renewal depth per product">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={cycleDistChart} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
              <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
              <YAxis dataKey="product" type="category" width={105} tick={<YAxisTick maxChars={13} fontSize={9} />} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="c1" name="Cycle 1" stackId="a" fill="#00d4ff" />
              <Bar dataKey="c2" name="Cycle 2" stackId="a" fill="#22c55e" />
              <Bar dataKey="c3" name="Cycle 3" stackId="a" fill="#fbbf24" />
              <Bar dataKey="c4" name="Cycle 4" stackId="a" fill="#fb923c" />
              <Bar dataKey="c5" name="Cycle 5+" stackId="a" fill="#a78bfa" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Renewal Detail Table */}
      <ChartCard title="Renewal Details by Product" subtitle="Full cycle breakdown and conversion rates per product">
        <div className="data-table-wrap" style={{ maxHeight: 380, overflowY: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th><th>Product</th><th style={{ textAlign: 'right' }}>Total</th>
                <th style={{ textAlign: 'right' }}>C1</th><th style={{ textAlign: 'right' }}>C2</th>
                <th style={{ textAlign: 'right' }}>C3</th><th style={{ textAlign: 'right' }}>C4</th>
                <th style={{ textAlign: 'right' }}>C5+</th>
                <th style={{ textAlign: 'right' }}>C1→C2</th><th style={{ textAlign: 'right' }}>C2→C3</th>
              </tr>
            </thead>
            <tbody>
              {(renewalByProduct || []).map((p, i) => (
                <tr key={i}>
                  <td className="td-rank">{i + 1}</td>
                  <td className="td-name">{p.product}</td>
                  <td className="td-num">{p.total?.toLocaleString()}</td>
                  <td className="td-num">{p.c1?.toLocaleString()}</td>
                  <td className="td-num">{p.c2?.toLocaleString()}</td>
                  <td className="td-num">{p.c3?.toLocaleString()}</td>
                  <td className="td-num">{p.c4?.toLocaleString()}</td>
                  <td className="td-num">{p.c5plus?.toLocaleString()}</td>
                  <td className={p.c1c2Rate >= 40 ? 'td-good' : p.c1c2Rate >= 20 ? 'td-warn' : 'td-bad'}>{p.c1c2Rate}%</td>
                  <td className={p.c2c3Rate >= 40 ? 'td-good' : p.c2c3Rate >= 20 ? 'td-warn' : 'td-bad'}>{p.c2c3Rate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>

      {/* ─── TENURE & LOYALTY SECTION ─── */}
      {tenureData.totalWithDate > 0 && (
        <>
          <div className="section-heading" style={{ marginTop: '1.5rem' }}>
            <div>
              <div className="section-title">⏳ Client Tenure & Loyalty History</div>
              <div className="section-subtitle">How long active investors have been with NIA and their renewal depth</div>
            </div>
            <div className="section-divider" />
            <div className="section-badge">{tenureData.totalWithDate} Clients</div>
          </div>

          {/* Tenure KPI cards */}
          <SortableKPIGrid storageKey="tenure" cols="140px" cards={tenureData.buckets.map((b, i) => ({
            id: `tenure_${i}`,
            label: b.label,
            value: formatNumber(b.count),
            sub: tenureData.totalWithDate > 0 ? `${+(b.count / tenureData.totalWithDate * 100).toFixed(1)}% of base` : '—',
            accent: b.color,
            icon: ['🌱', '📅', '📆', '🏅', '💎'][i],
          }))} />

          {/* Tenure bar chart */}
          <div className="charts-grid charts-grid-2" style={{ marginBottom: '1rem' }}>
            <ChartCard title="Investor Tenure Distribution" subtitle="How long active clients have been subscribed">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={tenureData.buckets}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
                  <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" name="Investors" radius={[4, 4, 0, 0]}>
                    {tenureData.buckets.map((b, i) => <Cell key={i} fill={b.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Cycle Depth vs Tenure" subtitle="Distribution of renewal cycles across tenure bands">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={(() => {
                  const groups = TENURE_BUCKETS.map(b => ({ label: b.label, c1: 0, c2: 0, c3: 0, c4: 0, 'c5+': 0 }));
                  for (const c of tenureData.allClients) {
                    const bi = TENURE_BUCKETS.findIndex(b => c.months >= b.min && c.months < b.max);
                    if (bi < 0) continue;
                    const key = c.cycle >= 5 ? 'c5+' : c.cycle >= 1 ? `c${c.cycle}` : 'c1';
                    groups[bi][key]++;
                  }
                  return groups;
                })()}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
                  <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="c1" name="Cycle 1" stackId="a" fill="#00d4ff" />
                  <Bar dataKey="c2" name="Cycle 2" stackId="a" fill="#22c55e" />
                  <Bar dataKey="c3" name="Cycle 3" stackId="a" fill="#fbbf24" />
                  <Bar dataKey="c4" name="Cycle 4" stackId="a" fill="#fb923c" />
                  <Bar dataKey="c5+" name="Cycle 5+" stackId="a" fill="#a78bfa" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Longest-tenure client table */}
          <ChartCard title="Longest-Tenured Active Clients" subtitle="Top 30 clients by earliest subscription start — your most loyal investors">
            <div className="data-table-wrap" style={{ maxHeight: 360, overflowY: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Name</th>
                    <th>PAN</th>
                    <th>Product</th>
                    <th style={{ textAlign: 'right' }}>Member Since</th>
                    <th style={{ textAlign: 'right' }}>Tenure</th>
                    <th style={{ textAlign: 'right' }}>Current Cycle</th>
                  </tr>
                </thead>
                <tbody>
                  {longestTenure.map((c, i) => (
                    <tr key={i}>
                      <td className="td-rank">{i + 1}</td>
                      <td className="td-name">{c.name || '—'}</td>
                      <td className="td-name" style={{ fontFamily: 'monospace', fontSize: 11 }}>{c.pan}</td>
                      <td className="td-name" style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.product || '—'}</td>
                      <td className="td-num">{c.firstDateStr}</td>
                      <td className="td-num" style={{ color: c.months >= 36 ? 'var(--accent-purple)' : c.months >= 24 ? 'var(--accent-gold)' : c.months >= 12 ? 'var(--accent-green)' : 'var(--text-secondary)' }}>{c.tenureLabel}</td>
                      <td className="td-num" style={{ color: c.cycle >= 5 ? 'var(--accent-purple)' : c.cycle >= 3 ? 'var(--accent-gold)' : 'var(--text-secondary)' }}>C{c.cycle || 1}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartCard>
        </>
      )}

      <div style={{ marginTop: '1rem' }}>
        <InsightsPanel insights={renewalInsights} title="🤖 Renewal Intelligence — Funnel & Product Loyalty Analysis" max={8} />
      </div>
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

export default memo(function Tab05Renewal(props) {
  const [sub, setSub] = useState('renewal');
  return (
    <>
      <SubTabBar tabs={[{id:'renewal',label:'Renewal Funnel',icon:'🔄'},{id:'risk',label:'Revenue at Risk',icon:'⚠️'},{id:'calendar',label:'Renewal Calendar',icon:'📅'}]} active={sub} onSelect={setSub} />
      {sub === 'renewal' && <RenewalContent {...props} />}
      {sub === 'risk' && <Tab19RevenueRisk {...props} />}
      {sub === 'calendar' && <Tab25RenewalCalendar {...props} />}
    </>
  );
});
