import { memo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Treemap, Cell, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis
} from 'recharts';
import ChartCard from '../components/ChartCard';
import { YAxisTick } from '../components/YAxisTick';
import SortableKPIGrid from '../components/SortableKPIGrid';
import InsightsPanel from '../components/InsightsPanel';
import { useState, useMemo } from 'react';
import { formatCurrency, formatNumber } from '../dataEngine';
import TabDateFilter from '../components/TabDateFilter';
import DrilldownModal, { useDrilldown } from '../components/DrilldownModal';
import FAQSection from '../components/FAQSection';

function basketLabel(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('green energy'))    return 'Green Energy';
  if (n.includes('trends trilogy'))  return 'Trends Trilogy';
  if (n.includes('mid') && n.includes('small')) return 'Mid & Small';
  if (n.includes('make in india'))   return 'Make in India';
  if (n.includes('consumer'))        return 'Consumer Trends';
  if (n.includes('techstack') || n.includes('tech stack')) return 'TechStack';
  if (n.includes('ipo'))             return 'IPO';
  return name.split(' ').slice(0, 3).join(' ');
}

const COLORS = ['#00d4ff','#fbbf24','#22c55e','#a78bfa','#f87171','#fb923c','#2dd4bf','#f472b6','#818cf8','#86efac'];

const subCols = [
  { key: 'name', label: 'Name' },
  { key: 'pan', label: 'PAN', cls: 'td-name' },
  { key: 'product', label: 'Product' },
  { key: 'broker', label: 'Broker' },
  { key: 'status', label: 'Status', align: 'right' },
  { key: 'cycle', label: 'Cycle', align: 'right', cls: 'td-num' },
];
const toRow = r => ({
  name: r.Name || r.name || '—',
  pan: String(r.PAN || '').trim().toUpperCase(),
  product: r['Smallcase Name'] || '—',
  broker: r['Broker Name'] || r['Broker'] || '—',
  status: r['Latest Subscription Status'] || '—',
  cycle: r['Cycle Number'] || '—',
});

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-bright)', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
      <div style={{ color: 'var(--text-secondary)', marginBottom: 6 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, display: 'flex', gap: 8, justifyContent: 'space-between' }}>
          <span>{p.name}</span><span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{typeof p.value === 'number' ? p.value.toLocaleString() : p.value}</span>
        </div>
      ))}
    </div>
  );
};

export default memo(function Tab03Product({ products, insights, currentMaster, filters, setFilters }) {
  const [sortKey, setSortKey] = useState('total');
  const [sortDir, setSortDir] = useState(-1);
  const { drilldown, open: openDrilldown, close: closeDrilldown } = useDrilldown();

  const productInsights = useMemo(() => {
    if (!products?.length) return [];

    const totalActive = products.reduce((s, p) => s + (p.active || 0), 0);

    const topActive = [...products].sort((a, b) => b.active - a.active)[0];
    const topActiveShare = totalActive > 0 ? ((topActive.active / totalActive) * 100).toFixed(1) : '—';

    const bestRenewal = [...products].sort((a, b) => b.renewalRate - a.renewalRate)[0];
    const worstRenewal = [...products].sort((a, b) => a.renewalRate - b.renewalRate)[0];

    const topNW = [...products].sort((a, b) => b.avgNetworth - a.avgNetworth)[0];

    const withPnL = products.filter(p => p.avgPnL && p.avgPnL !== 0);
    const bestPnL = withPnL.length ? [...withPnL].sort((a, b) => b.avgPnL - a.avgPnL)[0] : null;
    const worstPnL = withPnL.length ? [...withPnL].sort((a, b) => a.avgPnL - b.avgPnL)[0] : null;

    const mostTopHeavy = [...products].sort((a, b) => {
      const ra = a.total > 0 ? (a.c1 || 0) / a.total : 0;
      const rb = b.total > 0 ? (b.c1 || 0) / b.total : 0;
      return rb - ra;
    })[0];
    const topHeavyRatio = mostTopHeavy?.total > 0
      ? (((mostTopHeavy.c1 || 0) / mostTopHeavy.total) * 100).toFixed(1)
      : '—';

    const insights = [
      {
        icon: '🏆',
        category: 'Top Product by Active Subscribers',
        title: `${topActive.product} — ${topActive.active.toLocaleString('en-IN')} active`,
        detail: `Commands ${topActiveShare}% of total active subscriber base (${totalActive.toLocaleString('en-IN')} across all products)`,
        color: '#22c55e',
      },
      {
        icon: '🔄',
        category: 'Best Retention (Renewal Rate)',
        title: `${bestRenewal.product} — ${bestRenewal.renewalRate}% renewal`,
        detail: `Highest subscriber loyalty; ${bestRenewal.active.toLocaleString('en-IN')} active of ${bestRenewal.total.toLocaleString('en-IN')} total`,
        color: '#22c55e',
      },
      {
        icon: '⚠️',
        category: 'Highest Churn Risk (Lowest Renewal)',
        title: `${worstRenewal.product} — ${worstRenewal.renewalRate}% renewal`,
        detail: `Lowest retention rate; ${worstRenewal.exited.toLocaleString('en-IN')} of ${worstRenewal.total.toLocaleString('en-IN')} total subscribers have exited`,
        color: '#f87171',
      },
      {
        icon: '💰',
        category: 'Highest Avg Networth Investors',
        title: `${topNW.product} — ₹${topNW.avgNetworth?.toLocaleString('en-IN')}`,
        detail: `Attracts the wealthiest investor profile; ${topNW.active.toLocaleString('en-IN')} active subscribers`,
        color: '#fbbf24',
      },
    ];

    if (bestPnL) {
      insights.push({
        icon: '📈',
        category: 'Best Avg PnL Product',
        title: `${bestPnL.product} — ₹${bestPnL.avgPnL.toLocaleString('en-IN')} avg PnL`,
        detail: `Highest average investor returns across ${bestPnL.active.toLocaleString('en-IN')} active subscribers`,
        color: '#22c55e',
      });
    }

    if (worstPnL && worstPnL !== bestPnL) {
      insights.push({
        icon: '📉',
        category: 'Worst Avg PnL Product',
        title: `${worstPnL.product} — ₹${worstPnL.avgPnL.toLocaleString('en-IN')} avg PnL`,
        detail: `Lowest average investor returns; may need strategy review or investor communication`,
        color: '#f87171',
      });
    }

    insights.push({
      icon: '🔺',
      category: 'Most Top-Heavy Product (C1 Exits)',
      title: `${mostTopHeavy.product} — ${topHeavyRatio}% in Cycle 1`,
      detail: `${(mostTopHeavy.c1 || 0).toLocaleString('en-IN')} of ${mostTopHeavy.total.toLocaleString('en-IN')} subscribers are in Cycle 1 — highest first-cycle concentration`,
      color: '#a78bfa',
    });

    insights.push({
      icon: '📊',
      category: 'Total Active Across All Products',
      title: `${totalActive.toLocaleString('en-IN')} active subscribers`,
      detail: `Aggregated across ${products.length} products; average ${Math.round(totalActive / products.length).toLocaleString('en-IN')} active per product`,
      color: '#22d3ee',
    });

    return insights;
  }, [products]);

  if (!products?.length) return <div className="empty-state"><span className="empty-state-icon">🎯</span><div>No product data available</div></div>;

  const sorted = [...products].sort((a, b) => sortDir * ((b[sortKey] || 0) - (a[sortKey] || 0)));
  const treemapData = products.map((p, i) => ({ name: p.product, size: p.total, value: p.total }));

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => -d);
    else { setSortKey(key); setSortDir(-1); }
  };

  const topByNW = [...products].sort((a, b) => b.avgNetworth - a.avgNetworth);
  const topByRenewal = [...products].sort((a, b) => b.renewalRate - a.renewalRate);
  const onDateChange = (from, to) => setFilters(prev => ({ ...prev, dateFrom: from, dateTo: to }));

  const handleBarClick = (p) => {
    if (!p?.activePayload?.[0]) return;
    const productName = p.activePayload[0].payload.product;
    const rows = (currentMaster || [])
      .filter(r => r['Smallcase Name'] === productName)
      .map(toRow);
    openDrilldown(
      productName + ' — Subscribers',
      'All subscribers for this product',
      rows,
      subCols
    );
  };

  const TreemapContent = ({ root, depth, x, y, width, height, index, name, value }) => {
    if (width < 30 || height < 20) return null;
    return (
      <g
        style={{ cursor: 'pointer' }}
        onClick={() => {
          const rows = (currentMaster || [])
            .filter(r => r['Smallcase Name'] === name)
            .map(toRow);
          openDrilldown(
            name + ' — Subscribers',
            'All subscribers for this product',
            rows,
            subCols
          );
        }}
      >
        <rect x={x} y={y} width={width} height={height}
          style={{ fill: COLORS[index % COLORS.length], stroke: 'var(--bg-base)', strokeWidth: 2, opacity: 0.85, cursor: 'pointer' }} />
        {width > 60 && height > 30 && (
          <>
            <text x={x + 8} y={y + 18} fill="white" fontSize={11} fontWeight={600} style={{ pointerEvents: 'none' }}>
              {name?.length > 14 ? name.slice(0, 13) + '…' : name}
            </text>
            {height > 42 && (
              <text x={x + 8} y={y + 32} fill="rgba(255,255,255,0.7)" fontSize={10} style={{ pointerEvents: 'none' }}>
                {value?.toLocaleString()}
              </text>
            )}
          </>
        )}
      </g>
    );
  };

  return (
    <div>
      <DrilldownModal drilldown={drilldown} onClose={closeDrilldown} />
      <div className="section-heading">
        <div><div className="section-title">🎯 Product Intelligence</div><div className="section-subtitle">Performance metrics for every smallcase subscription product</div></div>
        <div className="section-divider" />
        <div className="section-badge">{products.length} Products</div>
      </div>
      <TabDateFilter dateFrom={filters?.dateFrom} dateTo={filters?.dateTo} onChange={onDateChange} />

      {/* KPI Summary */}
      <SortableKPIGrid storageKey="product" cols="175px" cards={[
        { id: 'top_product',      label: 'Top Product',         value: products[0]?.product,  small: true, accent: 'var(--accent-cyan)',  icon: '🏆', sub: `${products[0]?.total} subs`,
          tooltip: 'The product with the most total subscription records ever created (active + exited combined) — the biggest basket by lifetime volume, not necessarily the most active today.' },
        { id: 'best_renewal',     label: 'Best Renewal',        value: topByRenewal[0]?.product, small: true, accent: 'var(--accent-green)', icon: '🔄', sub: `${topByRenewal[0]?.renewalRate}% renewal`,
          tooltip: 'The product with the highest % of its currently active subscribers on Cycle 2 or later — i.e. the basket whose active base has renewed the most.' },
        { id: 'highest_nw',       label: 'Highest NW Product',  value: topByNW[0]?.product,   small: true, accent: 'var(--accent-gold)',  icon: '💰', sub: formatCurrency(topByNW[0]?.avgNetworth, true),
          tooltip: 'The product whose active subscribers have the highest average declared networth — an indicator of which basket attracts the wealthiest (HNI) investors.' },
      ]} />

      {/* Treemap */}
      <ChartCard title="Product Size Treemap" subtitle="Relative subscriber share by product — click any segment to see subscribers" style={{ marginBottom: '1rem' }}
        tooltip="Segment size is proportional to a product's total subscription count ever recorded (active + exited) — the bigger the box, the larger that product's lifetime subscriber volume.">
        <ResponsiveContainer width="100%" height={250}>
          <Treemap data={treemapData} dataKey="size" aspectRatio={4 / 3} content={<TreemapContent />}>
            <Tooltip formatter={(v, n) => [v.toLocaleString(), 'Subscribers']} />
          </Treemap>
        </ResponsiveContainer>
        <div className="chart-clickable-hint">💡 Click any product segment to see subscriber list</div>
      </ChartCard>

      {/* Full-width bar charts */}
      <ChartCard title="Active vs Exited by Product" subtitle="Current subscription state per product" style={{ marginBottom: '1rem' }}
        tooltip="Active = subscriptions currently in Subscribed, Grace Period or Cancelled-but-still-active status; Exited = subscriptions whose Cycle Level Status is Unsubscribed. Compares each product's live base against its cumulative churn.">
        <ResponsiveContainer width="100%" height={Math.max(260, products.length * 36)}>
          <BarChart
            data={products}
            layout="vertical"
            margin={{ left: 10, right: 30, top: 5, bottom: 5 }}
            onClick={handleBarClick}
            style={{ cursor: 'pointer' }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
            <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
            <YAxis dataKey="product" type="category" width={120} tick={<YAxisTick formatter={basketLabel} fontSize={11} />} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="active" name="Active" fill="#22c55e" stackId="a" />
            <Bar dataKey="exited" name="Exited" fill="#f87171" stackId="a" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <div className="chart-clickable-hint">💡 Click any bar to see subscriber list</div>
      </ChartCard>

      <div className="charts-grid charts-grid-2" style={{ marginBottom: '1rem' }}>
        <ChartCard title="Renewal Rate by Product" subtitle="% of current subscribers with Cycle > 1"
          tooltip="Of a product's currently active subscribers, the % who are on their 2nd cycle or later — i.e. have renewed at least once. Higher bars mean stickier, more loyal subscriber bases.">
          <ResponsiveContainer width="100%" height={Math.max(220, topByRenewal.length * 32)}>
            <BarChart
              data={topByRenewal}
              layout="vertical"
              margin={{ left: 10, right: 30, top: 5, bottom: 5 }}
              onClick={handleBarClick}
              style={{ cursor: 'pointer' }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
              <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} unit="%" domain={[0, 100]} />
              <YAxis dataKey="product" type="category" width={120} tick={<YAxisTick formatter={basketLabel} />} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="renewalRate" name="Renewal %" fill="#22c55e" radius={[0, 4, 4, 0]}>
                {topByRenewal.map((_, i) => <Cell key={i} fill={`hsl(${140 + i * 10}, 70%, 50%)`} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="chart-clickable-hint">💡 Click any bar to see subscriber list</div>
        </ChartCard>

        <ChartCard title="Average Networth by Product" subtitle="Avg investor networth per product (HNI indicator)"
          tooltip="Average self-declared networth across a product's active subscribers (rows with no networth recorded are excluded, not treated as zero) — a proxy for how affluent that basket's investor base is.">
          <ResponsiveContainer width="100%" height={Math.max(220, topByNW.length * 32)}>
            <BarChart
              data={topByNW}
              layout="vertical"
              margin={{ left: 10, right: 30, top: 5, bottom: 5 }}
              onClick={handleBarClick}
              style={{ cursor: 'pointer' }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
              <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickFormatter={v => formatCurrency(v, true)} />
              <YAxis dataKey="product" type="category" width={120} tick={<YAxisTick formatter={basketLabel} />} />
              <Tooltip content={<CustomTooltip />} formatter={(v) => [formatCurrency(v), 'Avg Networth']} />
              <Bar dataKey="avgNetworth" name="Avg Networth" radius={[0, 4, 4, 0]}>
                {topByNW.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="chart-clickable-hint">💡 Click any bar to see subscriber list</div>
        </ChartCard>
      </div>

      {/* Product Leaderboard Table */}
      <ChartCard title="Product Leaderboard" subtitle="Comprehensive metrics for all products — click column headers to sort"
        tooltip="Total Subs = all-time subscription records (active + exited); Renewal % and the financial averages (Plan, Discount, Avg NW) are computed over currently active subscribers only, so exited subscribers don't skew them — Avg Cycle is the one exception, averaged across all records for the product.">
        <div className="data-table-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                {[
                  ['product',        'Product',    false],
                  ['total',          'Total Subs', true],
                  ['active',         'Active',     true],
                  ['exited',         'Exited',     true],
                  ['renewalRate',    'Renewal %',  true],
                  ['avgPlanAmount',  'Avg Plan',   true],
                  ['avgDiscount',    'Avg Disc',   true],
                  ['avgNetworth',    'Avg NW',     true],
                  ['avgCycle',       'Avg Cycle',  true],
                ].map(([k, l, num]) => (
                  <th key={k} onClick={() => handleSort(k)} style={{ cursor: 'pointer', ...(num && { textAlign: 'right' }) }}>
                    {l} {sortKey === k ? (sortDir === -1 ? '↓' : '↑') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((p, i) => (
                <tr key={i}>
                  <td className="td-rank">{i + 1}</td>
                  <td className="td-name">{p.product}</td>
                  <td className="td-num">{p.total?.toLocaleString()}</td>
                  <td className="td-good">{p.active?.toLocaleString()}</td>
                  <td className="td-bad">{p.exited?.toLocaleString()}</td>
                  <td className={p.renewalRate >= 40 ? 'td-good' : p.renewalRate >= 20 ? 'td-warn' : 'td-bad'}>{p.renewalRate}%</td>
                  <td className="td-num">{formatCurrency(p.avgPlanAmount, true)}</td>
                  <td className="td-warn">{formatCurrency(p.avgDiscount, true)}</td>
                  <td className="td-num">{formatCurrency(p.avgNetworth, true)}</td>
                  <td className="td-num">{p.avgCycle}x</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>

      <div style={{ marginTop: '1rem' }}>
        <InsightsPanel insights={productInsights} title="🤖 Product Intelligence — Basket Performance Analysis" max={8} />
      </div>

      <FAQSection items={[
        { q: 'What is this page for?',
          a: 'A side-by-side comparison of every smallcase product (basket) — how many subscribers each has, how many stick around and renew, how wealthy their investors are, and how they\'re performing financially. Use it to see which baskets are pulling their weight and which need attention.' },
        { q: 'Does selecting a period or filter here change these numbers?',
          a: 'Yes. Every metric on this page — Total Subs, Active, Exited, Renewal %, and all the financial averages — is scoped to whatever period and dimension filters (product, broker, state, etc.) are currently selected at the top of the dashboard, using the same filtered dataset as the rest of the app.' },
        { q: '"Total Subs" for a product — is that people or subscription records?',
          a: 'It\'s subscription records, not unique people. If a product has been resubscribed many times by the same investors over the years (each renewal cycle is its own record in the underlying data), Total Subs reflects that full history for the product, not a headcount of distinct investors.' },
        { q: 'Why is "Renewal Rate" different from "Avg Cycle"?',
          a: 'Renewal Rate only looks at currently active subscribers, and asks what share of them are on their 2nd cycle or later (i.e. have renewed at least once). Avg Cycle is a different number — the average cycle count across ALL subscription records for that product, active and exited combined — so a product can have a high Avg Cycle from historical loyal subscribers while its currently-active Renewal Rate is lower, or vice versa.' },
        { q: 'Why do "Avg Plan Amount," "Avg Discount" and "Avg Networth" only reflect some subscribers?',
          a: 'These averages are calculated only over active subscribers, and specifically only over the ones with a non-zero value for that field — for example, Avg Discount averages just the subscribers who actually used a discount, not everyone (that would understate the real discount size for the people who used one). Rows with no plan amount or networth on record are also left out rather than counted as zero, so a product with a lot of missing data won\'t show an artificially low average.' },
        { q: 'What does "Avg P&L" mean here, and why can it be negative for a popular product?',
          a: 'It\'s the average cumulative profit or loss across a product\'s currently active subscribers\' portfolios. A product can be very popular (lots of active subscribers) while its average investor is currently down — subscriber count and investment performance are two separate things, and this page tracks both.' },
        { q: 'The Treemap box sizes and the "Active vs Exited" bar chart look different for the same product — why?',
          a: 'The Treemap sizes boxes by Total Subs (all-time subscription records, active + exited together), while the bar chart splits that same total into how much is currently active (green) vs. has exited (red). A big Treemap box with a large red portion means a product with high lifetime volume but weak current retention.' },
      ]} />
    </div>
  );
});
