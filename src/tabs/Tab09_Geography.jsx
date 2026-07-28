import { memo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell
} from 'recharts';
import ChartCard from '../components/ChartCard';
import { YAxisTick } from '../components/YAxisTick';
import SortableKPIGrid from '../components/SortableKPIGrid';
import InsightsPanel from '../components/InsightsPanel';
import { formatCurrency, formatNumber } from '../dataEngine';
import { useState, useMemo } from 'react';
import TabDateFilter from '../components/TabDateFilter';
import DrilldownModal, { useDrilldown } from '../components/DrilldownModal';

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

const COLORS = ['#00d4ff','#fbbf24','#22c55e','#a78bfa','#f87171','#fb923c','#2dd4bf','#f472b6','#818cf8','#86efac'];

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

export default memo(function Tab09Geography({ geoMetrics, insights, filters, setFilters, currentMaster }) {
  const onDateChange = (from, to) => setFilters(prev => ({ ...prev, dateFrom: from, dateTo: to }));
  const [sortKey, setSortKey] = useState('total');
  const [sortDir, setSortDir] = useState(-1);
  const { drilldown, open: openDrilldown, close: closeDrilldown } = useDrilldown();

  const geoInsights = useMemo(() => {
    if (!geoMetrics?.length) return [];
    const insights = [];
    const totalSubs = geoMetrics.reduce((a, s) => a + (s.total || 0), 0);
    if (!totalSubs) return [];

    const byTotal = [...geoMetrics].sort((a, b) => (b.total || 0) - (a.total || 0));
    const byNW = [...geoMetrics].sort((a, b) => (b.avgNetworth || 0) - (a.avgNetworth || 0));
    const byRenewal = [...geoMetrics].filter(s => (s.total || 0) >= 3).sort((a, b) => (b.renewalRate || 0) - (a.renewalRate || 0));
    const byActiveRate = [...geoMetrics].filter(s => (s.total || 0) >= 3).sort((a, b) => (b.activeRate || 0) - (a.activeRate || 0));

    const topState = byTotal[0];
    const topShare = Math.round((topState.total / totalSubs) * 100);
    insights.push({
      icon: '📍',
      category: 'Geographic Leader',
      title: `${topState.state} leads with ${topShare}% of all subscribers`,
      detail: `${topState.total?.toLocaleString('en-IN')} total subscriptions — the dominant geography contributing ${topShare}% of the subscriber base.`,
      color: '#22d3ee',
    });

    const topNW = byNW[0];
    insights.push({
      icon: '💰',
      category: 'Wealth Hub',
      title: `${topNW.state} has the wealthiest subscriber base`,
      detail: `Average networth of ₹${topNW.avgNetworth?.toLocaleString('en-IN')} — highest across all states, indicating premium investor concentration.`,
      color: '#a78bfa',
    });

    if (byRenewal.length > 0) {
      const loyalState = byRenewal[0];
      insights.push({
        icon: '🔄',
        category: 'Regional Retention',
        title: `${loyalState.state} is the most loyal region at ${loyalState.renewalRate}% renewal`,
        detail: `Highest renewal rate among states with 3+ subscribers — strong subscriber satisfaction and product-market fit in this region.`,
        color: '#22c55e',
      });

      const churnState = byRenewal[byRenewal.length - 1];
      insights.push({
        icon: '⚠️',
        category: 'Churn Risk Region',
        title: `${churnState.state} has highest churn risk at ${churnState.renewalRate}% renewal`,
        detail: `Lowest renewal rate among qualified states — targeted retention campaigns or product repositioning may improve outcomes here.`,
        color: '#f87171',
      });
    }

    const top3 = byTotal.slice(0, 3);
    const top3Total = top3.reduce((a, s) => a + (s.total || 0), 0);
    const top3Share = Math.round((top3Total / totalSubs) * 100);
    insights.push({
      icon: '📊',
      category: 'Geographic Concentration',
      title: `Top 3 states control ${top3Share}% of all subscriptions`,
      detail: `${top3.map(s => s.state).join(', ')} together account for ${top3Total.toLocaleString('en-IN')} of ${totalSubs.toLocaleString('en-IN')} total subscribers.`,
      color: top3Share > 60 ? '#f87171' : '#fbbf24',
    });

    const medianIdx = Math.floor(byTotal.length / 2);
    const bottomHalf = byTotal.slice(medianIdx);
    const emergingState = bottomHalf.filter(s => (s.total || 0) >= 3).sort((a, b) => (b.renewalRate || 0) - (a.renewalRate || 0))[0];
    if (emergingState) {
      insights.push({
        icon: '🌱',
        category: 'Emerging Region',
        title: `${emergingState.state} is a high-potential emerging market`,
        detail: `Despite lower subscriber volume (${emergingState.total?.toLocaleString('en-IN')} subs), it has a ${emergingState.renewalRate ?? 0}% renewal rate — strong loyalty signal from a growing region.`,
        color: '#fb923c',
      });
    }

    if (byActiveRate.length > 0) {
      const topActive = byActiveRate[0];
      insights.push({
        icon: '⚡',
        category: 'Highest Active Rate',
        title: `${topActive.state} has best active rate at ${topActive.activeRate}%`,
        detail: `${topActive.activeRate}% of subscribers from ${topActive.state} are currently active — the strongest engagement rate across all geographies.`,
        color: '#22c55e',
      });
    }

    insights.push({
      icon: '🗺️',
      category: 'Coverage',
      title: `Subscribers span ${geoMetrics.length} states across India`,
      detail: `Geographic footprint covers ${geoMetrics.length} states with ${totalSubs.toLocaleString('en-IN')} total subscriptions — broad national reach.`,
      color: '#22d3ee',
    });

    return insights;
  }, [geoMetrics]);

  if (!geoMetrics?.length) return <div className="empty-state"><span className="empty-state-icon">🗺️</span><div>No geography data available</div></div>;

  const sorted = [...geoMetrics].sort((a, b) => sortDir * ((b[sortKey] || 0) - (a[sortKey] || 0)));
  const handleSort = (k) => { if (sortKey === k) setSortDir(d => -d); else { setSortKey(k); setSortDir(-1); } };
  const top10 = [...geoMetrics].sort((a, b) => b.total - a.total).slice(0, 10);
  const topByNW = [...geoMetrics].sort((a, b) => b.avgNetworth - a.avgNetworth).slice(0, 10);
  const topByRenewal = [...geoMetrics].filter(s => s.total >= 3).sort((a, b) => b.renewalRate - a.renewalRate).slice(0, 8);

  const totalSubs = geoMetrics.reduce((a, s) => a + s.total, 0);
  const topState = geoMetrics[0];
  const topNWState = [...geoMetrics].sort((a, b) => b.avgNetworth - a.avgNetworth)[0];

  return (
    <div>
      <DrilldownModal drilldown={drilldown} onClose={closeDrilldown} />
      <div className="section-heading">
        <div><div className="section-title">🗺️ Geography Intelligence</div><div className="section-subtitle">State-wise subscriber distribution, networth and retention analysis</div></div>
        <div className="section-divider" />
        <div className="section-badge">{geoMetrics.length} States</div>
      </div>
      <TabDateFilter dateFrom={filters?.dateFrom} dateTo={filters?.dateTo} onChange={onDateChange} />

      {/* KPIs */}
      <SortableKPIGrid storageKey="geo" cols="175px" cards={[
        { id: 'top_state_vol',   label: 'Top State (Volume)', value: topState?.state,    small: true, accent: 'var(--accent-cyan)',  icon: '📍', sub: `${topState?.total} subs (${topState?.networthShare}% NW)` },
        { id: 'top_state_nw',    label: 'Top State (NW)',     value: topNWState?.state,  small: true, accent: 'var(--accent-gold)',  icon: '💰', sub: `Avg NW: ${formatCurrency(topNWState?.avgNetworth, true)}` },
        { id: 'states_covered',  label: 'States Covered',     value: geoMetrics.length,              accent: 'var(--accent-teal)',  icon: '🗺️' },
        { id: 'top5_share',      label: 'Top 5 States Share', value: `${Math.round(top10.slice(0,5).reduce((a,s)=>a+s.total,0)/totalSubs*100)}%`, accent: 'var(--accent-purple)', icon: '📊', sub: 'of all subscribers' },
      ]} />

      {/* Volume Charts */}
      <div className="charts-grid charts-grid-2" style={{ marginBottom: '1rem' }}>
        <ChartCard title="Top 10 States — Subscriber Count" subtitle="States ranked by total subscription count">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={top10}
              layout="vertical"
              style={{ cursor: 'pointer' }}
              onClick={p => {
                if (!p?.activePayload?.[0]) return;
                const stateName = p.activePayload[0].payload?.state;
                if (!stateName) return;
                const rows = (currentMaster || []).filter(r => r['State'] === stateName).map(toRow);
                openDrilldown(`Subscribers — ${stateName}`, `${rows.length} subscriber(s) in ${stateName}`, rows, subCols);
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
              <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
              <YAxis dataKey="state" type="category" width={145} tick={<YAxisTick maxChars={25} fontSize={10} />} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="active" name="Active" stackId="a" fill="#22c55e" />
              <Bar dataKey="exited" name="Exited" stackId="a" fill="#f87171" />
            </BarChart>
          </ResponsiveContainer>
          <div className="chart-clickable-hint">Click a bar to see subscribers for that state</div>
        </ChartCard>

        <ChartCard title="Top 10 States — Avg Networth" subtitle="Wealthiest investor bases by state">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={topByNW}
              layout="vertical"
              style={{ cursor: 'pointer' }}
              onClick={p => {
                if (!p?.activePayload?.[0]) return;
                const stateName = p.activePayload[0].payload?.state;
                if (!stateName) return;
                const rows = (currentMaster || []).filter(r => r['State'] === stateName).map(toRow);
                openDrilldown(`Subscribers — ${stateName}`, `${rows.length} subscriber(s) in ${stateName}`, rows, subCols);
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
              <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickFormatter={v => formatCurrency(v, true)} />
              <YAxis dataKey="state" type="category" width={145} tick={<YAxisTick maxChars={25} fontSize={10} />} />
              <Tooltip content={<CustomTooltip />} formatter={(v) => [formatCurrency(v), 'Avg Networth']} />
              <Bar dataKey="avgNetworth" name="Avg Networth" radius={[0, 4, 4, 0]}>
                {topByNW.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="chart-clickable-hint">Click a bar to see subscribers for that state</div>
        </ChartCard>
      </div>

      {/* Renewal & NW Share */}
      <div className="charts-grid charts-grid-2" style={{ marginBottom: '1rem' }}>
        <ChartCard title="Renewal Rate by State" subtitle="Subscriber loyalty by geography">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart
              data={topByRenewal}
              layout="vertical"
              style={{ cursor: 'pointer' }}
              onClick={p => {
                if (!p?.activePayload?.[0]) return;
                const stateName = p.activePayload[0].payload?.state;
                if (!stateName) return;
                const rows = (currentMaster || []).filter(r => r['State'] === stateName).map(toRow);
                openDrilldown(`Subscribers — ${stateName}`, `${rows.length} subscriber(s) in ${stateName}`, rows, subCols);
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
              <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} unit="%" domain={[0, 100]} />
              <YAxis dataKey="state" type="category" width={145} tick={<YAxisTick maxChars={25} fontSize={10} />} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="renewalRate" name="Renewal %" radius={[0, 4, 4, 0]}>
                {topByRenewal.map((s, i) => <Cell key={i} fill={s.renewalRate >= 40 ? '#22c55e' : s.renewalRate >= 20 ? '#fbbf24' : '#f87171'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="chart-clickable-hint">Click a bar to see subscribers for that state</div>
        </ChartCard>

        <ChartCard title="Networth Concentration by State" subtitle="% of total subscriber networth contributed by each state">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart
              data={[...geoMetrics].sort((a, b) => b.networthShare - a.networthShare).slice(0, 10)}
              layout="vertical"
              style={{ cursor: 'pointer' }}
              onClick={p => {
                if (!p?.activePayload?.[0]) return;
                const stateName = p.activePayload[0].payload?.state;
                if (!stateName) return;
                const rows = (currentMaster || []).filter(r => r['State'] === stateName).map(toRow);
                openDrilldown(`Subscribers — ${stateName}`, `${rows.length} subscriber(s) in ${stateName}`, rows, subCols);
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
              <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} unit="%" />
              <YAxis dataKey="state" type="category" width={145} tick={<YAxisTick maxChars={25} fontSize={10} />} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="networthShare" name="NW Share %" fill="#fbbf24" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="chart-clickable-hint">Click a bar to see subscribers for that state</div>
        </ChartCard>
      </div>

      {/* Full State Table */}
      <ChartCard title="State Intelligence Table" subtitle="Complete metrics for all states — click headers to sort">
        <div className="data-table-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                {[
                  ['state',         'State',      false],
                  ['total',         'Total',      true],
                  ['active',        'Active',     true],
                  ['exited',        'Exited',     true],
                  ['renewalRate',   'Renewal %',  true],
                  ['avgNetworth',   'Avg NW',     true],
                  ['avgPnL',        'Avg PnL',    true],
                  ['networthShare', 'NW Share %', true],
                ].map(([k, l, num]) => (
                  <th key={k} onClick={() => handleSort(k)} style={{ cursor: 'pointer', ...(num && { textAlign: 'right' }) }}>
                    {l} {sortKey === k ? (sortDir === -1 ? '↓' : '↑') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((s, i) => (
                <tr key={i}>
                  <td className="td-rank">{i + 1}</td>
                  <td className="td-name">{s.state}</td>
                  <td className="td-num">{s.total?.toLocaleString()}</td>
                  <td className="td-good">{s.active?.toLocaleString()}</td>
                  <td className="td-bad">{s.exited?.toLocaleString()}</td>
                  <td className={s.renewalRate >= 40 ? 'td-good' : s.renewalRate >= 20 ? 'td-warn' : 'td-bad'}>{s.renewalRate}%</td>
                  <td className="td-num">{formatCurrency(s.avgNetworth, true)}</td>
                  <td className={s.avgPnL >= 0 ? 'td-good' : 'td-bad'}>{formatCurrency(s.avgPnL, true)}</td>
                  <td className="td-warn">{s.networthShare}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>

      <div style={{ marginTop: '1rem' }}>
        <InsightsPanel insights={geoInsights} title="🤖 Geography Intelligence — Regional Distribution Analysis" max={8} />
      </div>
    </div>
  );
});
