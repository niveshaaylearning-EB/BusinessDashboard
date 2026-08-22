import { memo, useMemo, useState } from 'react';
import SortableKPIGrid from '../components/SortableKPIGrid';
import InsightsPanel from '../components/InsightsPanel';
import TabDateFilter from '../components/TabDateFilter';
import ChartCard from '../components/ChartCard';
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, LineChart, Line, ReferenceLine,
} from 'recharts';
import DrilldownModal, { useDrilldown } from '../components/DrilldownModal';

const PAGE_SIZE = 24;

function fmt(v)    { const n = Number(v); return isNaN(n) ? '—' : Math.round(n).toLocaleString('en-IN'); }
function fmtPct(v) { const n = Number(v); return isNaN(n) ? '—' : `${n.toFixed(1)}%`; }
function sign(v)   { return v > 0 ? `+${fmt(v)}` : fmt(v); }

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-bright)', borderRadius:8, padding:'10px 14px', fontSize:12 }}>
      <div style={{ color:'var(--text-secondary)', marginBottom:6, fontWeight:600 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color:p.color, display:'flex', gap:10, justifyContent:'space-between', marginBottom:2 }}>
          <span>{p.name}</span>
          <span style={{ fontWeight:600, fontFamily:'monospace' }}>
            {typeof p.value === 'number' ? p.value.toLocaleString('en-IN') : p.value}
          </span>
        </div>
      ))}
    </div>
  );
};

export default memo(function Tab17SubscriberFlow({ monthly, currentMaster, filters, setFilters }) {
  const [page, setPage] = useState(1);

  const { drilldown, open: openDrilldown, close: closeDrilldown } = useDrilldown();

  const subCols = [
    { key: 'name',    label: 'Name' },
    { key: 'pan',     label: 'PAN',     cls: 'td-name' },
    { key: 'product', label: 'Product' },
    { key: 'broker',  label: 'Broker' },
    { key: 'status',  label: 'Status',  align: 'right' },
    { key: 'cycle',   label: 'Cycle',   align: 'right', cls: 'td-num' },
  ];
  const toRow = r => ({
    name:    r.Name || r.name || '—',
    pan:     String(r.PAN || '').trim().toUpperCase(),
    product: r['Smallcase Name'] || '—',
    broker:  r['Broker Name'] || r['Broker'] || '—',
    status:  r['Latest Subscription Status'] || '—',
    cycle:   r['Cycle Number'] || '—',
  });

  const master = currentMaster || [];

  // Helper: filter master rows by a month label (e.g. "Jan '24")
  const rowsForMonth = (monthLabel) =>
    master.filter(r => {
      const rDate = r['Subscription Start Date'] || r['Start Date'] || '';
      const d = new Date(rDate);
      if (isNaN(d)) return false;
      const mLabel = d.toLocaleString('default', { month: 'short', year: '2-digit' });
      return mLabel === monthLabel;
    }).map(toRow);

  const filteredMonthly = useMemo(() => {
    if (!monthly?.length) return [];
    return monthly.filter(m => {
      const d = m.monthDate instanceof Date ? m.monthDate : new Date(m.monthDate);
      if (filters?.dateFrom && d < filters.dateFrom) return false;
      if (filters?.dateTo   && d > filters.dateTo)   return false;
      return true;
    });
  }, [monthly, filters?.dateFrom, filters?.dateTo]);

  const kpis = useMemo(() => {
    const n = filteredMonthly.length || 1;
    const totalNew       = filteredMonthly.reduce((s, m) => s + (m.newUnique  || 0), 0);
    const totalRenewals  = filteredMonthly.reduce((s, m) => s + (m.renewals   || 0), 0);
    const totalExits     = filteredMonthly.reduce((s, m) => s + (m.exited     || 0), 0);
    const totalIn        = totalNew + totalRenewals;
    const netFlow        = totalIn - totalExits;
    const latestActive   = filteredMonthly.length ? (filteredMonthly[filteredMonthly.length - 1].closing || 0) : 0;
    const bestNetMonth   = [...filteredMonthly].sort((a, b) => (b.net || 0) - (a.net || 0))[0];
    const worstNetMonth  = [...filteredMonthly].sort((a, b) => (a.net || 0) - (b.net || 0))[0];
    return {
      totalNew, totalRenewals, totalExits, totalIn, netFlow, latestActive,
      renewalRate:        totalIn > 0 ? +(totalRenewals / totalIn * 100).toFixed(1) : 0,
      exitRate:           totalIn > 0 ? +(totalExits    / totalIn * 100).toFixed(1) : 0,
      avgMonthlyNew:      Math.round(totalNew       / n),
      avgMonthlyRenewals: Math.round(totalRenewals  / n),
      avgMonthlyExits:    Math.round(totalExits      / n),
      avgMonthlyNet:      Math.round(netFlow         / n),
      bestNetMonth:       bestNetMonth?.month  || '—',
      worstNetMonth:      worstNetMonth?.month || '—',
    };
  }, [filteredMonthly]);

  const cumulativeData = useMemo(() => {
    let cumNew = 0, cumRenewals = 0, cumExits = 0;
    return filteredMonthly.map(m => {
      cumNew       += m.newUnique || 0;
      cumRenewals  += m.renewals  || 0;
      cumExits     += m.exited    || 0;
      return {
        month:          m.month,
        cumNew,
        cumRenewals,
        cumIn:          cumNew + cumRenewals,
        cumExits,
        netCumulative:  cumNew + cumRenewals - cumExits,
      };
    });
  }, [filteredMonthly]);

  const flowInsights = useMemo(() => {
    if (!filteredMonthly.length) return [];
    const items = [];

    const bestNew = [...filteredMonthly].sort((a, b) => (b.newUnique || 0) - (a.newUnique || 0))[0];
    if (bestNew?.newUnique > 0) items.push({
      icon: '🚀', category: 'Peak Acquisition', color: '#22c55e',
      title: `"${bestNew.month}" was the best acquisition month — ${fmt(bestNew.newUnique)} new subscribers`,
      detail: `Renewals that month: ${fmt(bestNew.renewals || 0)}. Total inflow: ${fmt((bestNew.newUnique || 0) + (bestNew.renewals || 0))}.`,
    });

    const bestRenewal = [...filteredMonthly].sort((a, b) => (b.renewals || 0) - (a.renewals || 0))[0];
    if (bestRenewal?.renewals > 0) items.push({
      icon: '🔄', category: 'Peak Renewals', color: '#22d3ee',
      title: `"${bestRenewal.month}" had the highest renewals — ${fmt(bestRenewal.renewals)} cycles renewed`,
      detail: `New subscriptions that month: ${fmt(bestRenewal.newUnique || 0)}. Exits: ${fmt(bestRenewal.exited || 0)}.`,
    });

    const worstExit = [...filteredMonthly].sort((a, b) => (b.exited || 0) - (a.exited || 0))[0];
    if (worstExit?.exited > 0) items.push({
      icon: '⚠️', category: 'Peak Exits', color: '#f87171',
      title: `"${worstExit.month}" saw the most exits — ${fmt(worstExit.exited)} unsubscriptions`,
      detail: `Net flow that month: ${sign(worstExit.net || 0)}. New came in: ${fmt((worstExit.newUnique || 0) + (worstExit.renewals || 0))}.`,
    });

    const bestNet = [...filteredMonthly].sort((a, b) => (b.net || 0) - (a.net || 0))[0];
    if (bestNet) items.push({
      icon: '📈', category: 'Best Net Month', color: '#a78bfa',
      title: `"${bestNet.month}" had the best net growth: ${sign(bestNet.net || 0)} subscribers`,
      detail: `Inflow: ${fmt((bestNet.newUnique || 0) + (bestNet.renewals || 0))}. Exits: ${fmt(bestNet.exited || 0)}.`,
    });

    items.push({
      icon: kpis.netFlow >= 0 ? '📊' : '📉',
      category: 'Overall Balance',
      color: kpis.netFlow >= 0 ? '#22c55e' : '#f87171',
      title: kpis.netFlow >= 0
        ? `Net positive: ${fmt(kpis.totalIn)} subscriptions in vs ${fmt(kpis.totalExits)} exits — net ${sign(kpis.netFlow)}`
        : `Net negative: ${fmt(kpis.totalExits)} exits exceeded ${fmt(kpis.totalIn)} inflows — net ${sign(kpis.netFlow)}`,
      detail: `Renewal share: ${kpis.renewalRate}% of inflows are returning subscribers. Exit rate on total inflows: ${kpis.exitRate}%.`,
    });

    if (filteredMonthly.length >= 6) {
      const last3 = filteredMonthly.slice(-3);
      const prev3 = filteredMonthly.slice(-6, -3);
      const l3net = last3.reduce((s, m) => s + (m.net || 0), 0);
      const p3net = prev3.reduce((s, m) => s + (m.net || 0), 0);
      const improving = l3net > p3net;
      items.push({
        icon: improving ? '✅' : '⚡', category: 'Recent Trend', color: improving ? '#22c55e' : '#fbbf24',
        title: `Net flow ${improving ? 'improving' : 'declining'}: last 3M net ${sign(l3net)} vs ${sign(p3net)} prior 3M`,
        detail: `${Math.abs(l3net - p3net).toLocaleString('en-IN')} subscriber difference between the two periods.`,
      });

      const rr = ms => { const i = ms.reduce((s,m) => s+(m.newUnique||0)+(m.renewals||0),0); const r = ms.reduce((s,m)=>s+(m.renewals||0),0); return i>0?+(r/i*100).toFixed(1):0; };
      const l3rr = rr(last3), p3rr = rr(prev3);
      const rrDir = l3rr > p3rr ? 'rising' : l3rr < p3rr ? 'falling' : 'stable';
      items.push({
        icon: '♻️', category: 'Renewal Trend', color: l3rr > p3rr ? '#22c55e' : l3rr === p3rr ? '#94a3b8' : '#fbbf24',
        title: `Renewal rate ${rrDir}: ${l3rr}% last 3M vs ${p3rr}% prior 3M`,
        detail: `A rising renewal rate means more subscribers are repeat-paying customers — a strong retention signal.`,
      });
    }

    return items;
  }, [filteredMonthly, kpis]);

  const onDateChange = (from, to) => { setFilters(prev => ({ ...prev, dateFrom: from, dateTo: to })); setPage(1); };

  const last24 = filteredMonthly.slice(-24);

  const compositionData = last24.map(m => {
    const total = (m.newUnique || 0) + (m.renewals || 0);
    return {
      month:   m.month,
      newPct:  total > 0 ? +((m.newUnique || 0) / total * 100).toFixed(1) : 0,
      renPct:  total > 0 ? +((m.renewals  || 0) / total * 100).toFixed(1) : 0,
      rawNew:  m.newUnique || 0,
      rawRen:  m.renewals  || 0,
    };
  });
  const tableData = [...filteredMonthly].reverse();
  const totalPages = Math.max(1, Math.ceil(tableData.length / PAGE_SIZE));
  const pageRows = tableData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const kpiCards = [
    { id:'totalNew',        label:'Total New Subscribers',  icon:'🆕', accent:'#22c55e',               value: fmt(kpis.totalNew),         sub:'First-time (Cycle 1) entries',
      tooltip: 'Count of first-time subscriptions (Cycle Number 1) that started within the selected period — genuinely new investors, not renewals of an existing subscription.' },
    { id:'totalRenewals',   label:'Total Renewals',         icon:'🔄', accent:'var(--accent-cyan)',     value: fmt(kpis.totalRenewals),    sub:'Cycle 2+ re-subscriptions',
      tooltip: 'Count of Cycle 2+ re-subscriptions within the period — existing investors renewing their plan rather than first-time signups.' },
    { id:'totalIn',         label:'Total Subscriptions In', icon:'📥', accent:'#a78bfa',               value: fmt(kpis.totalIn),          sub:'New + Renewals combined',
      tooltip: 'Every subscription event that added a paying cycle in this period — Total New plus Total Renewals combined, regardless of whether the investor was new or returning.' },
    { id:'totalExits',      label:'Total Exits',            icon:'🚪', accent:'var(--accent-red)',      value: fmt(kpis.totalExits),       sub:'Unsubscriptions (all cycles)',
      tooltip: 'Total unsubscriptions recorded in the period, across all cycles — both first-time cancellations and investors who chose not to renew.' },
    { id:'netFlow',         label:'Net Flow',               icon:'⚖️', accent: kpis.netFlow>=0?'#22c55e':'#f87171', value: sign(kpis.netFlow), sub:'Total In minus Total Exits',
      tooltip: 'Total Subscriptions In minus Total Exits for the period. Positive means the subscriber base grew over this window; negative means more people left than joined.' },
    { id:'renewalRate',     label:'Renewal Rate',           icon:'♻️', accent:'#22d3ee',               value: fmtPct(kpis.renewalRate),   sub:'Renewals ÷ Total Inflows',
      tooltip: 'Renewals as a share of total inflows (New + Renewals). A higher rate means more of your growth is coming from existing investors renewing rather than fresh acquisition.' },
    { id:'exitRate',        label:'Exit Rate',              icon:'📉', accent:'#fbbf24',               value: fmtPct(kpis.exitRate),      sub:'Exits ÷ Total Inflows',
      tooltip: 'Exits as a share of total inflows for the period — a rough churn-pressure gauge relative to how many subscriptions came in over the same window.' },
    { id:'latestActive',    label:'Active Subscribers',     icon:'✅', accent:'var(--accent-green)',    value: fmt(kpis.latestActive),     sub:'At end of selected period',
      tooltip: 'Active subscriber count (closing balance) at the end of the last month in the selected period.' },
    { id:'avgNew',          label:'Avg Monthly New',        icon:'📊', accent:'#34d399',               value: fmt(kpis.avgMonthlyNew),    sub:'New subscribers per month',
      tooltip: 'Total New Subscribers in the period divided by the number of months covered — the average pace of first-time acquisition per month.' },
    { id:'avgRenewals',     label:'Avg Monthly Renewals',   icon:'🔁', accent:'#67e8f9',               value: fmt(kpis.avgMonthlyRenewals),sub:'Renewals per month',
      tooltip: 'Total Renewals divided by the number of months in the period — the average pace of renewal activity per month.' },
    { id:'avgExits',        label:'Avg Monthly Exits',      icon:'⚠️', accent:'#fb923c',               value: fmt(kpis.avgMonthlyExits),  sub:'Exits per month',
      tooltip: 'Total Exits divided by the number of months in the period — the average monthly cancellation volume.' },
    { id:'avgNet',          label:'Avg Monthly Net',        icon:'📈', accent: kpis.avgMonthlyNet>=0?'#22c55e':'#f87171', value: sign(kpis.avgMonthlyNet), sub:'Avg net subscribers per month',
      tooltip: 'Average of (Inflows − Exits) across the months in the period — the typical net subscriber gain or loss in a given month.' },
  ];

  if (!monthly?.length) return (
    <div className="empty-state">
      <span className="empty-state-icon">🌊</span>
      <div>No data loaded</div>
    </div>
  );

  return (
    <div>
      <DrilldownModal drilldown={drilldown} onClose={closeDrilldown} />
      <div className="section-heading">
        <div>
          <div className="section-title">🌊 Subscriber Flow Analysis</div>
          <div className="section-subtitle">
            Complete inflow vs outflow — new subscribers, renewals, exits, and net movement month by month
          </div>
        </div>
        <div className="section-divider" />
        <div className="section-badge">Flow</div>
      </div>

      <TabDateFilter dateFrom={filters?.dateFrom} dateTo={filters?.dateTo} onChange={onDateChange} />

      <SortableKPIGrid storageKey="flow17" cards={kpiCards} cols="155px" />

      {/* Chart Row 1: Monthly Inflow vs Exits */}
      <div className="charts-grid charts-grid-2" style={{ marginBottom:'1rem' }}>
        <ChartCard title="Monthly Inflow vs Exits" subtitle="New subscribers + renewals vs exits per month" badge="Flow"
          tooltip="Stacked green/cyan bars show new (Cycle 1) and renewal subscriptions coming in each month against the red exits bar — compare bar heights to see whether growth is outpacing cancellations.">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={last24}
              style={{ cursor: 'pointer' }}
              onClick={p => {
                if (!p?.activePayload?.[0]) return;
                const data = p.activePayload[0].payload;
                const rows = rowsForMonth(data.month);
                const totalIn = (data.newUnique || 0) + (data.renewals || 0);
                openDrilldown(
                  `Subscriber Flow — ${data.month}`,
                  `${fmt(totalIn)} in · ${fmt(data.exited || 0)} exits · ${rows.length} records found`,
                  rows, subCols
                );
              }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
              <XAxis dataKey="month" tick={{ fill:'var(--text-muted)', fontSize:9 }} interval={2} />
              <YAxis tick={{ fill:'var(--text-muted)', fontSize:10 }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize:11 }} />
              <Bar dataKey="newUnique" name="New (C1)"    fill="#22c55e" stackId="in" radius={[0,0,0,0]} />
              <Bar dataKey="renewals"  name="Renewals"    fill="#22d3ee" stackId="in" radius={[3,3,0,0]} />
              <Bar dataKey="exited"    name="Exits"       fill="#f87171" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="chart-clickable-hint">💡 Click any bar/point to see details</div>
        </ChartCard>

        <ChartCard title="Net Monthly Flow" subtitle="Net subscribers added or lost each month" badge="Net"
          tooltip="Net subscribers gained (green, above zero) or lost (red, below zero) in each month — Total In minus Exits for that specific month.">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={last24}
              style={{ cursor: 'pointer' }}
              onClick={p => {
                if (!p?.activePayload?.[0]) return;
                const data = p.activePayload[0].payload;
                const rows = rowsForMonth(data.month);
                openDrilldown(
                  `Net Flow — ${data.month}`,
                  `Net ${data.net >= 0 ? '+' : ''}${fmt(data.net)} · ${rows.length} records found`,
                  rows, subCols
                );
              }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
              <XAxis dataKey="month" tick={{ fill:'var(--text-muted)', fontSize:9 }} interval={2} />
              <YAxis tick={{ fill:'var(--text-muted)', fontSize:10 }} />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={0} stroke="var(--border-bright)" strokeWidth={1} />
              <Bar dataKey="net" name="Net Flow" radius={[3,3,0,0]}>
                {last24.map((m, i) => (
                  <Cell key={i} fill={m.net >= 0 ? '#22c55e' : '#f87171'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="chart-clickable-hint">💡 Click any bar/point to see details</div>
        </ChartCard>
      </div>

      {/* Chart Row 2: Cumulative + Renewal Composition */}
      <div className="charts-grid charts-grid-2" style={{ marginBottom:'1rem' }}>
        <ChartCard title="Cumulative Flow" subtitle="Running total of new, renewals, exits, and net subscribers" badge="Cumulative"
          tooltip="Running totals since the start of the selected period — cumulative inflow, cumulative exits, and the resulting net subscriber count over time. A widening gap between the lines shows sustained growth or decline.">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={cumulativeData.slice(-24)}
              style={{ cursor: 'pointer' }}
              onClick={p => {
                if (!p?.activePayload?.[0]) return;
                const data = p.activePayload[0].payload;
                const rows = rowsForMonth(data.month);
                openDrilldown(
                  `Cumulative Flow — up to ${data.month}`,
                  `Cum. In: ${fmt(data.cumIn)} · Cum. Exits: ${fmt(data.cumExits)} · Net: ${fmt(data.netCumulative)} · ${rows.length} records for this month`,
                  rows, subCols
                );
              }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
              <XAxis dataKey="month" tick={{ fill:'var(--text-muted)', fontSize:9 }} interval={2} />
              <YAxis tick={{ fill:'var(--text-muted)', fontSize:10 }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize:11 }} />
              <Line dataKey="cumIn"          name="Total In"      stroke="#22d3ee" dot={false} strokeWidth={2} />
              <Line dataKey="cumExits"       name="Cum. Exits"    stroke="#f87171" dot={false} strokeWidth={2} />
              <Line dataKey="netCumulative"  name="Net Total"     stroke="#22c55e" dot={false} strokeWidth={2} strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
          <div className="chart-clickable-hint">💡 Click any bar/point to see details</div>
        </ChartCard>

        <ChartCard title="Inflow Composition" subtitle="New vs Renewal split each month (%)" badge="Mix"
          tooltip="Each month's inflow split into the percentage that came from new (Cycle 1) signups vs renewals — shows whether growth relies more on fresh acquisition or repeat business.">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={compositionData}
              style={{ cursor: 'pointer' }}
              onClick={p => {
                if (!p?.activePayload?.[0]) return;
                const data = p.activePayload[0].payload;
                const rows = rowsForMonth(data.month);
                openDrilldown(
                  `Inflow Composition — ${data.month}`,
                  `New (C1): ${data.newPct}% (${fmt(data.rawNew)}) · Renewals: ${data.renPct}% (${fmt(data.rawRen)}) · ${rows.length} records found`,
                  rows, subCols
                );
              }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
              <XAxis dataKey="month" tick={{ fill:'var(--text-muted)', fontSize:9 }} interval={2} />
              <YAxis unit="%" tick={{ fill:'var(--text-muted)', fontSize:10 }} domain={[0,100]} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const d = compositionData.find(m => m.month === label);
                  return (
                    <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-bright)', borderRadius:8, padding:'10px 14px', fontSize:12 }}>
                      <div style={{ color:'var(--text-secondary)', marginBottom:6 }}>{label}</div>
                      <div style={{ color:'#22c55e' }}>New (C1): {d?.newPct}% ({fmt(d?.rawNew)})</div>
                      <div style={{ color:'#22d3ee' }}>Renewals: {d?.renPct}% ({fmt(d?.rawRen)})</div>
                    </div>
                  );
                }}
              />
              <Legend wrapperStyle={{ fontSize:11 }} />
              <Bar dataKey="newPct" name="New %" fill="#22c55e" stackId="pct" radius={[0,0,0,0]} />
              <Bar dataKey="renPct" name="Renewal %" fill="#22d3ee" stackId="pct" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="chart-clickable-hint">💡 Click any bar/point to see details</div>
        </ChartCard>
      </div>

      {/* Detailed Table */}
      <div style={{ marginBottom:'0.5rem', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ color:'var(--text-secondary)', fontSize:13, fontWeight:600 }}>
          📋 Month-by-Month Subscriber Flow
        </div>
        <span style={{ color:'var(--text-muted)', fontSize:12 }}>
          {filteredMonthly.length} months · Page {page} / {totalPages}
        </span>
      </div>

      <div className="data-table-wrap" style={{ maxHeight:520, overflowY:'auto', overflowX:'auto' }}>
        <table className="data-table" style={{ minWidth:900 }}>
          <thead>
            <tr>
              <th>Month</th>
              <th style={{ textAlign:'right', color:'#22c55e'  }}>New (C1)</th>
              <th style={{ textAlign:'right', color:'#22d3ee'  }}>Renewals (C2+)</th>
              <th style={{ textAlign:'right', color:'#a78bfa'  }}>Total In</th>
              <th style={{ textAlign:'right', color:'#f87171'  }}>Exits</th>
              <th style={{ textAlign:'right' }}>Net</th>
              <th style={{ textAlign:'right' }}>Active (EOD)</th>
              <th style={{ textAlign:'right' }}>Renewal %</th>
              <th style={{ textAlign:'right' }}>Churn %</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((m, i) => {
              const totalIn  = (m.newUnique || 0) + (m.renewals || 0);
              const renPct   = totalIn > 0 ? ((m.renewals  || 0) / totalIn * 100).toFixed(1) : '—';
              const churnPct = m.opening  > 0 ? ((m.exited   || 0) / m.opening  * 100).toFixed(1) : '—';
              const net      = m.net ?? ((m.newUnique || 0) + (m.renewals || 0) - (m.exited || 0));
              return (
                <tr key={i}>
                  <td className="td-name" style={{ whiteSpace:'nowrap', fontWeight:600 }}>{m.month}</td>
                  <td style={{ textAlign:'right', color:'#22c55e',  fontFamily:'monospace' }}>{fmt(m.newUnique || 0)}</td>
                  <td style={{ textAlign:'right', color:'#22d3ee',  fontFamily:'monospace' }}>{fmt(m.renewals  || 0)}</td>
                  <td style={{ textAlign:'right', color:'#a78bfa',  fontFamily:'monospace', fontWeight:600 }}>{fmt(totalIn)}</td>
                  <td style={{ textAlign:'right', color:'#f87171',  fontFamily:'monospace' }}>{fmt(m.exited   || 0)}</td>
                  <td style={{ textAlign:'right', color: net >= 0 ? '#22c55e' : '#f87171', fontFamily:'monospace', fontWeight:600 }}>
                    {net >= 0 ? '+' : ''}{fmt(net)}
                  </td>
                  <td style={{ textAlign:'right', fontFamily:'monospace' }}>{fmt(m.closing || 0)}</td>
                  <td style={{ textAlign:'right', color:'var(--text-muted)', fontSize:11 }}>
                    {renPct !== '—' ? `${renPct}%` : '—'}
                  </td>
                  <td style={{ textAlign:'right', color:'var(--text-muted)', fontSize:11 }}>
                    {churnPct !== '—' ? `${churnPct}%` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop:'1px solid var(--border-bright)', fontWeight:700, background:'var(--bg-card)' }}>
              <td>Total</td>
              <td style={{ textAlign:'right', color:'#22c55e', fontFamily:'monospace' }}>{fmt(kpis.totalNew)}</td>
              <td style={{ textAlign:'right', color:'#22d3ee', fontFamily:'monospace' }}>{fmt(kpis.totalRenewals)}</td>
              <td style={{ textAlign:'right', color:'#a78bfa', fontFamily:'monospace' }}>{fmt(kpis.totalIn)}</td>
              <td style={{ textAlign:'right', color:'#f87171', fontFamily:'monospace' }}>{fmt(kpis.totalExits)}</td>
              <td style={{ textAlign:'right', color: kpis.netFlow>=0?'#22c55e':'#f87171', fontFamily:'monospace' }}>
                {sign(kpis.netFlow)}
              </td>
              <td style={{ textAlign:'right', fontFamily:'monospace' }}>—</td>
              <td style={{ textAlign:'right', color:'var(--text-muted)', fontSize:11 }}>{fmtPct(kpis.renewalRate)}</td>
              <td style={{ textAlign:'right', color:'var(--text-muted)', fontSize:11 }}>{fmtPct(kpis.exitRate)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display:'flex', justifyContent:'center', gap:8, padding:'0.75rem 0', alignItems:'center' }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-icon">← Prev</button>
          <span style={{ color:'var(--text-muted)', fontSize:12 }}>Page {page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="btn-icon">Next →</button>
        </div>
      )}
      <InsightsPanel insights={flowInsights} title="🤖 Flow Intelligence — Subscriber Movement Analysis" max={8} />
    </div>
  );
});
