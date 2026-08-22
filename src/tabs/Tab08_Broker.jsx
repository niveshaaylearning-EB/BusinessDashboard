import { memo, useState, useMemo } from 'react';
import Tab24RMPerformance from './Tab24_RMPerformance';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Cell
} from 'recharts';
import ChartCard from '../components/ChartCard';
import { YAxisTick } from '../components/YAxisTick';
import SortableKPIGrid from '../components/SortableKPIGrid';
import InsightsPanel from '../components/InsightsPanel';
import { formatCurrency, formatNumber } from '../dataEngine';
import TabDateFilter from '../components/TabDateFilter';
import DrilldownModal, { useDrilldown } from '../components/DrilldownModal';

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

const brokerCols = [
  { key: 'name',    label: 'Name' },
  { key: 'pan',     label: 'PAN',         cls: 'td-name' },
  { key: 'product', label: 'Product' },
  { key: 'status',  label: 'Status' },
  { key: 'cycle',   label: 'Cycle',       align: 'right', cls: 'td-num' },
  { key: 'nw',      label: 'Networth ₹',  align: 'right', cls: 'td-num',
    render: (v) => v ? Math.round(Number(v)).toLocaleString('en-IN') : '—' },
];
const toBrokerRow = r => ({
  name:    r.Name    || r.name    || '—',
  pan:     String(r.PAN || '').trim().toUpperCase(),
  product: r['Smallcase Name'] || '—',
  status:  r['Latest Subscription Status'] || '—',
  cycle:   r['Cycle Number']   || '—',
  nw:      r['Networth'] || r['Net Worth'] || 0,
});

function BrokerContent({ brokerMetrics, attributionMetrics, insights, filters, setFilters, currentMaster }) {
  const onDateChange = (from, to) => setFilters(prev => ({ ...prev, dateFrom: from, dateTo: to }));
  const [sortKey, setSortKey] = useState('total');
  const [sortDir, setSortDir] = useState(-1);
  const { drilldown, open: openDrilldown, close: closeDrilldown } = useDrilldown();

  // Helper: filter currentMaster by broker name and open drilldown
  const openBrokerDrilldown = (brokerName) => {
    if (!brokerName || !currentMaster?.length) return;
    const rows = currentMaster.filter(r =>
      (r['Broker Name'] === brokerName || r['Broker'] === brokerName)
    );
    openDrilldown(
      `Subscribers — ${brokerName}`,
      `${rows.length} subscriber records via this broker`,
      rows.map(toBrokerRow),
      brokerCols
    );
  };

  const handleBrokerBarClick = (p) => {
    if (!p?.activePayload?.[0]) return;
    const data = p.activePayload[0].payload;
    const brokerName = data.broker;
    openBrokerDrilldown(brokerName);
  };

  const brokerInsights = useMemo(() => {
    if (!brokerMetrics?.length) return [];
    const insights = [];
    const totalSubs = brokerMetrics.reduce((a, b) => a + (b.total || 0), 0);
    if (!totalSubs) return [];

    const byTotal = [...brokerMetrics].sort((a, b) => (b.total || 0) - (a.total || 0));
    const byActive = [...brokerMetrics].sort((a, b) => (b.active || 0) - (a.active || 0));
    const byRenewal = [...brokerMetrics].filter(b => (b.total || 0) >= 3).sort((a, b) => (b.renewalRate || 0) - (a.renewalRate || 0));
    const byNW = [...brokerMetrics].sort((a, b) => (b.avgNetworth || 0) - (a.avgNetworth || 0));
    const byActiveRate = [...brokerMetrics].filter(b => (b.total || 0) >= 3).sort((a, b) => (b.activeRate || 0) - (a.activeRate || 0));

    const topByVol = byTotal[0];
    const topShare = totalSubs > 0 ? Math.round((topByVol.total / totalSubs) * 100) : 0;
    insights.push({
      icon: '🏆',
      category: 'Volume Leader',
      title: `${topByVol.broker} leads with ${topShare}% market share`,
      detail: `${topByVol.total?.toLocaleString('en-IN')} total subscriptions out of ${totalSubs.toLocaleString('en-IN')} — the single largest distribution channel.`,
      color: '#22d3ee',
    });

    const topByActive = byActive[0];
    insights.push({
      icon: '✅',
      category: 'Active Subscribers',
      title: `${topByActive.broker} drives the most active subs`,
      detail: `${topByActive.active?.toLocaleString('en-IN')} active subscribers — highest active base across all broker channels.`,
      color: '#22c55e',
    });

    if (byRenewal.length > 0) {
      const bestRenewal = byRenewal[0];
      insights.push({
        icon: '🔄',
        category: 'Renewal Champion',
        title: `${bestRenewal.broker} has best renewal rate at ${bestRenewal.renewalRate}%`,
        detail: `Highest renewal rate among brokers with 3+ subscribers — indicating strong subscriber quality and satisfaction.`,
        color: '#22c55e',
      });

      const worstRenewal = byRenewal[byRenewal.length - 1];
      insights.push({
        icon: '⚠️',
        category: 'Churn Risk',
        title: `${worstRenewal.broker} has lowest renewal rate at ${worstRenewal.renewalRate}%`,
        detail: `Highest churn among qualified brokers — consider reviewing subscriber fit or onboarding quality for this channel.`,
        color: '#f87171',
      });
    }

    const topNW = byNW[0];
    insights.push({
      icon: '💎',
      category: 'Wealth Quality',
      title: `${topNW.broker} brings highest avg networth subscribers`,
      detail: `Average subscriber networth of ₹${topNW.avgNetworth?.toLocaleString('en-IN')} — premium investor segment from this channel.`,
      color: '#a78bfa',
    });

    const concentrationRisk = topShare > 40;
    insights.push({
      icon: concentrationRisk ? '🚨' : '✅',
      category: 'Concentration Risk',
      title: concentrationRisk
        ? `High dependency: top broker holds ${topShare}% of volume`
        : `Distribution healthy: top broker holds only ${topShare}% of volume`,
      detail: concentrationRisk
        ? `Over 40% reliance on a single broker creates pipeline risk — diversifying channels is advised.`
        : `No single broker dominates — distribution network is well diversified across partners.`,
      color: concentrationRisk ? '#f87171' : '#22c55e',
    });

    const top3 = byTotal.slice(0, 3);
    const top3Total = top3.reduce((a, b) => a + (b.total || 0), 0);
    const top3Share = totalSubs > 0 ? Math.round((top3Total / totalSubs) * 100) : 0;
    insights.push({
      icon: '📊',
      category: 'Top 3 Concentration',
      title: `Top 3 brokers account for ${top3Share}% of all subscriptions`,
      detail: `${top3.map(b => b.broker).join(', ')} collectively drive ${top3Total.toLocaleString('en-IN')} out of ${totalSubs.toLocaleString('en-IN')} total subs.`,
      color: '#fbbf24',
    });

    if (byActiveRate.length > 0) {
      const topActive = byActiveRate[0];
      insights.push({
        icon: '⚡',
        category: 'Active Rate Leader',
        title: `${topActive.broker} has highest active rate at ${topActive.activeRate}%`,
        detail: `${topActive.activeRate}% of subscribers acquired through this broker are still active — best engagement efficiency across the network.`,
        color: '#fb923c',
      });
    }

    return insights;
  }, [brokerMetrics, attributionMetrics]);

  if (!brokerMetrics?.length) return <div className="empty-state"><span className="empty-state-icon">🤝</span><div>No broker data available</div></div>;

  const sorted = [...brokerMetrics].sort((a, b) => sortDir * ((b[sortKey] || 0) - (a[sortKey] || 0)));
  const handleSort = (k) => { if (sortKey === k) setSortDir(d => -d); else { setSortKey(k); setSortDir(-1); } };
  const top10 = sorted.slice(0, 10);
  const topByNW = [...brokerMetrics].sort((a, b) => b.avgNetworth - a.avgNetworth).slice(0, 8);
  const topByRenewal = [...brokerMetrics].sort((a, b) => b.renewalRate - a.renewalRate).slice(0, 8);

  const topBroker = brokerMetrics[0];
  const bestQuality = [...brokerMetrics].filter(b => b.total >= 3).sort((a, b) => b.avgNetworth - a.avgNetworth)[0];

  return (
    <div>
      <DrilldownModal drilldown={drilldown} onClose={closeDrilldown} />

      <div className="section-heading">
        <div><div className="section-title">🤝 Broker & Distributor Intelligence</div><div className="section-subtitle">Quality and volume metrics for each distribution partner</div></div>
        <div className="section-divider" />
        <div className="section-badge">{brokerMetrics.length} Brokers</div>
      </div>
      <TabDateFilter dateFrom={filters?.dateFrom} dateTo={filters?.dateTo} onChange={onDateChange} />

      {/* KPIs */}
      <SortableKPIGrid storageKey="broker" cols="175px" cards={[
        { id: 'top_broker_vol',   label: 'Top Broker (Volume)',    value: topBroker?.broker,      small: true, accent: 'var(--accent-cyan)',  icon: '🏆', sub: `${topBroker?.total} subscriptions`,
          tooltip: 'Broker with the most total subscriptions ever acquired (active + exited, deduplicated per investor) — the largest distribution channel by raw volume.' },
        { id: 'best_quality',     label: 'Best Quality Broker',    value: bestQuality?.broker,    small: true, accent: 'var(--accent-gold)',  icon: '💎', sub: `Avg NW: ${formatCurrency(bestQuality?.avgNetworth, true)}`,
          tooltip: 'Among brokers with at least 3 total subscribers, the one whose currently active subscribers have the highest average declared net worth.' },
        { id: 'best_renewal',     label: 'Best Renewal Broker',    value: topByRenewal[0]?.broker, small: true, accent: 'var(--accent-green)', icon: '🔄', sub: `${topByRenewal[0]?.renewalRate}% renewal`,
          tooltip: 'Broker with the highest renewal rate (% of its active subscribers on cycle 2+) across ALL brokers — no minimum-subscriber threshold, so a broker with very few clients can top this list if all of them happened to renew.' },
        { id: 'best_retention',   label: 'Best Retention Broker',  value: [...brokerMetrics].filter(b=>b.total>=3).sort((a,b)=>b.renewalRate-a.renewalRate)[0]?.broker, small: true, accent: 'var(--accent-teal)', icon: '🔒', sub: `${[...brokerMetrics].filter(b=>b.total>=3).sort((a,b)=>b.renewalRate-a.renewalRate)[0]?.renewalRate}% renewal rate`,
          tooltip: 'The same renewal-rate metric as "Best Renewal Broker", but restricted to brokers with 3+ total subscribers — a more statistically reliable read on which channel actually retains investors best.' },
      ]} />

      {/* Volume & Quality Charts */}
      <div className="charts-grid charts-grid-2" style={{ marginBottom: '1rem' }}>
        <ChartCard title="Broker Volume Ranking" subtitle="Active and exited subscriptions per broker"
          tooltip="Top 10 brokers by total subscriptions ever acquired (deduplicated per investor), split into how many are still active vs. have exited.">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={top10}
              layout="vertical"
              onClick={handleBrokerBarClick}
              style={{ cursor: 'pointer' }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
              <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
              <YAxis dataKey="broker" type="category" width={105} tick={<YAxisTick maxChars={13} fontSize={9} />} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="active" name="Active" stackId="a" fill="#22c55e" />
              <Bar dataKey="exited" name="Exited" stackId="a" fill="#f87171" />
            </BarChart>
          </ResponsiveContainer>
          <div className="chart-clickable-hint">💡 Click any bar to see subscriber details</div>
        </ChartCard>

        <ChartCard title="Avg Networth by Broker" subtitle="Quality indicator — investor wealth per broker channel"
          tooltip="Average declared net worth of each broker's currently active subscribers — a proxy for the wealth/quality of the client base each channel brings in, not their volume.">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={topByNW}
              layout="vertical"
              onClick={handleBrokerBarClick}
              style={{ cursor: 'pointer' }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
              <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickFormatter={v => formatCurrency(v, true)} />
              <YAxis dataKey="broker" type="category" width={105} tick={<YAxisTick maxChars={13} fontSize={9} />} />
              <Tooltip content={<CustomTooltip />} formatter={(v) => [formatCurrency(v), 'Avg Networth']} />
              <Bar dataKey="avgNetworth" name="Avg Networth" radius={[0, 4, 4, 0]}>
                {topByNW.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="chart-clickable-hint">💡 Click any bar to see subscriber details</div>
        </ChartCard>
      </div>

      {/* Renewal */}
      <div className="charts-grid charts-grid-2" style={{ marginBottom: '1rem' }}>
        <ChartCard title="Renewal Rate by Broker" subtitle="Which brokers bring the most loyal subscribers"
          tooltip="Brokers ranked by % of their active subscribers on cycle 2 or later (i.e. renewed at least once). No minimum-subscriber threshold is applied here, so results for very small brokers may reflect a tiny sample.">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart
              data={topByRenewal}
              layout="vertical"
              onClick={handleBrokerBarClick}
              style={{ cursor: 'pointer' }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
              <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} unit="%" domain={[0, 100]} />
              <YAxis dataKey="broker" type="category" width={105} tick={<YAxisTick maxChars={13} fontSize={9} />} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="renewalRate" name="Renewal %" radius={[0, 4, 4, 0]}>
                {topByRenewal.map((p, i) => <Cell key={i} fill={p.renewalRate >= 40 ? '#22c55e' : p.renewalRate >= 20 ? '#fbbf24' : '#f87171'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="chart-clickable-hint">💡 Click any bar to see subscriber details</div>
        </ChartCard>

        {/* Attribution Source Chart */}
        {attributionMetrics?.length > 0 && (
          <ChartCard title="Acquisition Channel Analysis" subtitle="Subscriptions by attribution / traffic source"
            tooltip="Subscriptions grouped by acquisition/traffic source (Attribution Source) rather than broker — shows how many signups from each channel are still active versus the total ever acquired.">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={attributionMetrics.slice(0, 8)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
                <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                <YAxis dataKey="source" type="category" width={100} tick={<YAxisTick maxChars={12} fontSize={9} />} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="active" name="Active" fill="#22c55e" />
                <Bar dataKey="total" name="Total" fill="#00d4ff" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </div>

      {/* Leaderboard Table */}
      <ChartCard title="Broker Performance Leaderboard" subtitle="Click headers to sort — full metrics per broker"
        tooltip="Full metrics per broker: total (active+exited) subscriptions, current active/exited counts, renewal rate of active subscribers, and average net worth/P&L/plan amount computed on active subscribers only.">
        <div className="data-table-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                {[
                  ['broker',        'Broker',     false],
                  ['total',         'Total',      true],
                  ['active',        'Active',     true],
                  ['exited',        'Exited',     true],
                  ['renewalRate',   'Renewal %',  true],
                  ['avgNetworth',   'Avg NW',     true],
                  ['avgPnL',        'Avg PnL',    true],
                  ['avgPlanAmount', 'Avg Plan',   true],
                ].map(([k, l, num]) => (
                  <th key={k} onClick={() => handleSort(k)} style={{ cursor: 'pointer', ...(num && { textAlign: 'right' }) }}>
                    {l} {sortKey === k ? (sortDir === -1 ? '↓' : '↑') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((b, i) => (
                <tr
                  key={i}
                  style={{ cursor: 'pointer' }}
                  onClick={() => openBrokerDrilldown(b.broker)}
                >
                  <td className="td-rank">{i + 1}</td>
                  <td className="td-name">{b.broker}</td>
                  <td className="td-num">{b.total?.toLocaleString()}</td>
                  <td className="td-good">{b.active?.toLocaleString()}</td>
                  <td className="td-bad">{b.exited?.toLocaleString()}</td>
                  <td className={b.renewalRate >= 40 ? 'td-good' : b.renewalRate >= 20 ? 'td-warn' : 'td-bad'}>{b.renewalRate}%</td>
                  <td className="td-num">{formatCurrency(b.avgNetworth, true)}</td>
                  <td className={b.avgPnL >= 0 ? 'td-good' : 'td-bad'}>{formatCurrency(b.avgPnL, true)}</td>
                  <td className="td-num">{formatCurrency(b.avgPlanAmount, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>

      <div style={{ marginTop: '1rem' }}>
        <InsightsPanel insights={brokerInsights} title="🤖 Broker Intelligence — Distribution Network Analysis" max={8} />
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

export default memo(function Tab08Broker(props) {
  const [sub, setSub] = useState('broker');
  return (
    <>
      <SubTabBar
        tabs={[
          { id: 'broker', label: 'Broker Analytics', icon: '🏢' },
          { id: 'rm', label: 'RM Performance', icon: '👔' },
        ]}
        active={sub}
        onSelect={setSub}
      />
      {sub === 'broker' ? <BrokerContent {...props} /> : <Tab24RMPerformance rmPerformance={props.rmPerformance} />}
    </>
  );
});
