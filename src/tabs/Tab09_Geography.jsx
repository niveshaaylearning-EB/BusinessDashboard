import { memo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell
} from 'recharts';
import ChartCard from '../components/ChartCard';
import { YAxisTick } from '../components/YAxisTick';
import SortableKPIGrid from '../components/SortableKPIGrid';
import InsightsPanel from '../components/InsightsPanel';
import FAQSection from '../components/FAQSection';
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
        { id: 'top_state_vol',   label: 'Top State (Volume)', value: topState?.state,    small: true, accent: 'var(--accent-cyan)',  icon: '📍', sub: `${topState?.total} subs (${topState?.networthShare}% NW)`,
          tooltip: 'State with the most total subscriptions ever recorded (active + exited, deduplicated per investor). The "% NW" in the sub-label is this state\'s share of the nation\'s total active-subscriber net worth, not its share of subscriber count.' },
        { id: 'top_state_nw',    label: 'Top State (NW)',     value: topNWState?.state,  small: true, accent: 'var(--accent-gold)',  icon: '💰', sub: `Avg NW: ${formatCurrency(topNWState?.avgNetworth, true)}`,
          tooltip: 'State whose active subscribers have the highest average declared net worth per investor — distinct from networth share, which measures aggregate ₹ concentration rather than the per-person average.' },
        { id: 'states_covered',  label: 'States Covered',     value: geoMetrics.length,              accent: 'var(--accent-teal)',  icon: '🗺️',
          tooltip: 'Number of distinct states with at least one recorded subscriber, active or exited.' },
        { id: 'top5_share',      label: 'Top 5 States Share', value: `${Math.round(top10.slice(0,5).reduce((a,s)=>a+s.total,0)/totalSubs*100)}%`, accent: 'var(--accent-purple)', icon: '📊', sub: 'of all subscribers',
          tooltip: '% of all subscriptions (active + exited) concentrated in the 5 states with the highest subscriber volume — a geographic concentration indicator.' },
      ]} />

      {/* Volume Charts */}
      <div className="charts-grid charts-grid-2" style={{ marginBottom: '1rem' }}>
        <ChartCard title="Top 10 States — Subscriber Count" subtitle="States ranked by total subscription count"
          tooltip="Top 10 states by total subscriptions ever recorded, broken down into currently active vs. exited.">
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

        <ChartCard title="Top 10 States — Avg Networth" subtitle="Wealthiest investor bases by state"
          tooltip="States ranked by the average declared net worth of their currently active subscribers — the wealthiest per-investor base, not the largest total headcount.">
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
        <ChartCard title="Renewal Rate by State" subtitle="Subscriber loyalty by geography"
          tooltip="States ranked by % of active subscribers on cycle 2+ (renewed at least once); only states with 3+ total subscribers are included to avoid small-sample distortion.">
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

        <ChartCard title="Networth Concentration by State" subtitle="% of total subscriber networth contributed by each state"
          tooltip="% of the total net worth held by all active subscribers nationwide that is concentrated in each state — a measure of where the wealth is located, not where the headcount is.">
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
      <ChartCard title="State Intelligence Table" subtitle="Complete metrics for all states — click headers to sort"
        tooltip="Complete per-state metrics: total/active/exited subscriptions, renewal rate and average P&L/net worth of active subscribers, and each state's share of nationwide active-subscriber net worth.">
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

      <FAQSection items={[
        { q: 'What is this page for?',
          a: 'It breaks the subscriber base down by state, so you can see where your customers actually live — which states bring the most people, which have the wealthiest investors, and where people are most likely to stay subscribed.' },
        { q: 'How is a state\'s "Total" subscriber count worked out?',
          a: 'Every subscription row (active or exited) with that state on record is narrowed down to one row per person first — if the same investor appears twice for the same state, only their most recent cycle counts. Active and Exited are then split from that same de-duplicated group.' },
        { q: 'The "Top State (Volume)" card shows a "% NW" figure — is that the state\'s share of subscribers?',
          a: 'No, that\'s an easy mix-up. The "% NW" is this state\'s share of the country\'s total active-subscriber net worth (i.e. how much of the nation\'s wealth sits with investors in that state), not its share of headcount. A state can lead heavily in subscriber count while still holding a modest share of total net worth, or vice versa.' },
        { q: 'How is "Networth Concentration by State" different from just ranking states by subscriber count?',
          a: 'It measures where the money is, not where the people are. A state with relatively few, very wealthy subscribers can show a high networth share here while ranking low on the plain subscriber-count chart — the two views intentionally tell different stories.' },
        { q: 'Why is "Renewal Rate by State" missing some smaller states?',
          a: 'That chart only includes states with at least 3 total subscribers, so a rate isn\'t built on just one or two people (which could show a misleading 0% or 100%). Smaller states still appear in the full table at the bottom, just not in that particular ranked chart.' },
        { q: 'How does the Period filter change this page?',
          a: 'It limits every state\'s numbers to subscribers who were active at some point during your chosen window. Without a period selected, you\'re seeing each state\'s complete, all-time subscriber picture.' },
        { q: 'A state\'s Avg PnL or Avg Networth looks off compared to what I\'d expect — why?',
          a: 'These averages are calculated only from a state\'s currently active subscribers, and can be skewed by a small handful of very large or very negative portfolios if that state has few subscribers. Check the subscriber count column alongside it before drawing conclusions from a state with a small sample.' },
      ]} />
    </div>
  );
});
