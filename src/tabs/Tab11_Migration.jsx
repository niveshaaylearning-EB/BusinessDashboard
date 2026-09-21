import { memo, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import ChartCard from '../components/ChartCard';
import SortableKPIGrid from '../components/SortableKPIGrid';
import InsightsPanel from '../components/InsightsPanel';
import FAQSection from '../components/FAQSection';
import { formatNumber, normalizeData } from '../dataEngine';
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

function SankeyMigration({ flows }) {
  if (!flows?.length) return <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>No migration flows found (need multi-product users)</div>;

  const top15 = flows.slice(0, 15);
  const maxFlow = Math.max(...top15.map(f => f.count));

  return (
    <div style={{ padding: '1rem 0' }}>
      {top15.map((flow, i) => {
        const pct = maxFlow > 0 ? (flow.count / maxFlow * 100) : 0;
        const fromShort = flow.from?.length > 18 ? flow.from.slice(0, 17) + '…' : flow.from;
        const toShort = flow.to?.length > 18 ? flow.to.slice(0, 17) + '…' : flow.to;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.6rem' }}>
            <div style={{ width: 130, fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'right', flexShrink: 0 }}>{fromShort}</div>
            <div style={{ flex: 1, height: 24, background: 'var(--bg-elevated)', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
              <div style={{
                height: '100%',
                width: `${Math.max(pct, 2)}%`,
                background: `linear-gradient(90deg, ${COLORS[i % COLORS.length]}, ${COLORS[i % COLORS.length]}66)`,
                borderRadius: 4,
                display: 'flex', alignItems: 'center', paddingLeft: 8,
                transition: 'width 0.5s ease',
              }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--bg-void)', fontWeight: 600 }}>
                  {flow.count > 0 ? `→ ${flow.count}` : ''}
                </span>
              </div>
            </div>
            <div style={{ width: 130, fontSize: '0.75rem', color: 'var(--text-secondary)', flexShrink: 0 }}>{toShort}</div>
            <div style={{ width: 35, fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'right' }}>{flow.count}</div>
          </div>
        );
      })}
    </div>
  );
}

export default memo(function Tab11Migration({ migrationData, currentMaster, rawData, insights, filters, setFilters }) {
  if (!migrationData) return <div className="empty-state"><span className="empty-state-icon">🔀</span><div>No migration data available</div></div>;

  const { flows, multiProductAdoption, entryProducts, exitProducts } = migrationData;

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

  // rawData still has original Excel headers ("Cycle No", "smallcase Name") — normalize before use
  const master = currentMaster || (rawData ? normalizeData(rawData) : null) || [];

  const onDateChange = (from, to) => setFilters(prev => ({ ...prev, dateFrom: from, dateTo: to }));

  const migrationInsights = useMemo(() => {
    if (!migrationData) return [];
    const insights = [];

    const multiPct = multiProductAdoption?.multiPct ?? 0;
    const multiCount = multiProductAdoption?.multi ?? 0;
    const singleCount = multiProductAdoption?.single ?? 0;
    insights.push({
      icon: '📦',
      category: 'Multi-Product Adoption',
      title: `${multiPct}% of investors hold multiple products (${multiCount.toLocaleString('en-IN')} subscribers)`,
      detail: multiPct > 30
        ? 'Strong cross-product engagement. Investors trust the brand enough to subscribe to more than one offering — a strong base for upsell campaigns.'
        : multiPct > 15
        ? 'Moderate cross-sell success. There is meaningful room to grow multi-product adoption through targeted recommendations.'
        : `Low multi-product rate. ${singleCount.toLocaleString('en-IN')} single-product investors represent a large untapped upsell opportunity.`,
      color: multiPct > 30 ? '#22c55e' : multiPct > 15 ? '#fbbf24' : '#f87171',
    });

    if (multiPct > 30) {
      insights.push({
        icon: '🚀',
        category: 'Cross-Sell Signal',
        title: 'Multi-product rate exceeds 30% — strong cross-sell momentum detected',
        detail: 'With over 30% of your base holding multiple products, the business has clear evidence that bundling strategies and upgrade journeys are working. Lean into this.',
        color: '#22c55e',
      });
    }

    const topEntry = entryProducts?.[0];
    if (topEntry) {
      insights.push({
        icon: '🚪',
        category: 'Entry Product',
        title: `"${topEntry.product}" is the most common first subscription (${topEntry.count.toLocaleString('en-IN')} new investors)`,
        detail: 'This is your acquisition gateway. Optimise onboarding, early engagement, and cross-sell prompts specifically for this product to maximise lifetime value from the start.',
        color: '#22d3ee',
      });
    }

    const topExit = exitProducts?.[0];
    if (topExit) {
      insights.push({
        icon: '🎯',
        category: 'Top Destination Product',
        title: `"${topExit.product}" attracts the most migrations (${topExit.count.toLocaleString('en-IN')} arrivals)`,
        detail: 'This product is the most common upgrade or migration destination. Study what drives investors here — pricing, features, or brand trust — and replicate that pull across other products.',
        color: '#a78bfa',
      });
    }

    if (topEntry && topExit && topEntry.product === topExit.product) {
      insights.push({
        icon: '🔄',
        category: 'Gateway Product',
        title: `"${topEntry.product}" is both the top entry and top destination — a true gateway product`,
        detail: 'This product sits at the hub of your migration network. Investors both start here and return here. It plays a central role in subscriber journey design and should be treated as a flagship.',
        color: '#fbbf24',
      });
    }

    const allFlows = flows ?? [];
    const topFlow = allFlows[0];
    if (topFlow) {
      insights.push({
        icon: '➡️',
        category: 'Top Migration Path',
        title: `Most common journey: "${topFlow.from}" → "${topFlow.to}" (${topFlow.count.toLocaleString('en-IN')} users)`,
        detail: 'This is the dominant upgrade or cross-sell path in your subscriber base. Consider building an explicit recommendation or in-product nudge along this route to increase its frequency.',
        color: '#22d3ee',
      });
    }

    const uniquePaths = allFlows.length;
    insights.push({
      icon: '🗺️',
      category: 'Migration Network',
      title: `${uniquePaths} unique product migration path${uniquePaths === 1 ? '' : 's'} observed`,
      detail: uniquePaths >= 10
        ? 'Rich migration network — investors explore many product combinations. This flexibility is a strength but also signals need for structured journey guidance.'
        : uniquePaths >= 4
        ? 'Moderate path diversity. A few dominant routes exist alongside some niche journeys — focus on reinforcing the top 3 paths.'
        : uniquePaths > 0
        ? 'Concentrated migration patterns. Investors follow predictable paths — makes cross-sell targeting straightforward.'
        : 'No migration flows detected. All subscribers appear to be single-product users with no cross-product movement.',
      color: uniquePaths >= 10 ? '#a78bfa' : uniquePaths >= 4 ? '#22d3ee' : uniquePaths > 0 ? '#22c55e' : '#f87171',
    });

    return insights;
  }, [migrationData]);

  const pieData = [
    { name: 'Single Product', value: multiProductAdoption?.single ?? 0 },
    { name: 'Multi-Product', value: multiProductAdoption?.multi ?? 0 },
  ];

  const topFlows = (flows || []).slice(0, 10).map(f => ({
    label: `${f.from?.slice(0,10)}… → ${f.to?.slice(0,10)}…`,
    count: f.count,
    from: f.from,
    to: f.to,
  }));

  return (
    <div>
      <DrilldownModal drilldown={drilldown} onClose={closeDrilldown} />
      <div className="section-heading">
        <div><div className="section-title">🔀 Product Migration Analytics</div><div className="section-subtitle">How investors move between products — entry points, destination products and upgrade paths</div></div>
        <div className="section-divider" />
        <div className="section-badge">Journey Intelligence</div>
      </div>
      <TabDateFilter dateFrom={filters?.dateFrom} dateTo={filters?.dateTo} onChange={onDateChange} />

      {/* KPIs */}
      <SortableKPIGrid storageKey="migration" cols="175px" cards={[
        { id: 'multi_product',  label: 'Multi-Product Investors',  value: formatNumber(multiProductAdoption.multi),   accent: 'var(--accent-cyan)',  icon: '📦', sub: `${multiProductAdoption.multiPct}% of all investors`,
          tooltip: 'Unique investor PANs who have held 2 or more distinct products at any point — each one is proof of successful cross-sell and a candidate for further upsell.' },
        { id: 'single_product', label: 'Single-Product Investors', value: formatNumber(multiProductAdoption.single),  accent: 'var(--accent-purple)', icon: '📌', sub: 'Upsell opportunity',
          tooltip: 'Unique investors who have only ever subscribed to one product — the largest pool of untapped cross-sell and upsell potential.' },
        { id: 'top_entry',      label: 'Top Entry Product',        value: entryProducts?.[0]?.product, small: true,   accent: 'var(--accent-green)', icon: '🚀', sub: `${entryProducts?.[0]?.count} journeys`,
          tooltip: 'Among investors who went on to hold multiple products, the product they most often started with — your strongest gateway into a multi-product relationship.' },
        { id: 'top_dest',       label: 'Top Destination Product',  value: exitProducts?.[0]?.product,  small: true,   accent: 'var(--accent-gold)',  icon: '🎯', sub: `${exitProducts?.[0]?.count} arrivals`,
          tooltip: 'Among investors who held multiple products, the product they most often ended up on last — the strongest upgrade or cross-sell destination.' },
      ]} />

      {/* Sankey + Pie */}
      <div className="charts-grid charts-grid-2" style={{ marginBottom: '1rem' }}>
        <ChartCard title="Single vs Multi-Product Adoption" subtitle="Investor portfolio diversification"
          tooltip="Share of all unique investors holding exactly one product vs. two or more — a higher multi-product slice means stronger cross-sell penetration across the base.">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" outerRadius={100} dataKey="value" nameKey="name" labelLine={false}
                label={({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }) => {
                  const RADIAN = Math.PI / 180;
                  const r = innerRadius + (outerRadius - innerRadius) * 0.5;
                  const x = cx + r * Math.cos(-midAngle * RADIAN);
                  const y = cy + r * Math.sin(-midAngle * RADIAN);
                  if (percent < 0.04) return null;
                  return (
                    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={10}>
                      {(percent * 100).toFixed(0)}%
                    </text>
                  );
                }}>
                <Cell fill="#00d4ff" />
                <Cell fill="#a78bfa" />
              </Pie>
              <Tooltip formatter={(v, n) => [v.toLocaleString() + ' investors', n]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Top Migration Flows by Volume" subtitle="Most common product-to-product journeys"
          tooltip="Each bar is a distinct first-product → last-product journey among multi-product investors, sized by how many investors made that exact move — the longest bars are your most common upgrade or cross-sell paths.">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={topFlows.slice(0, 8)} layout="vertical"
              style={{ cursor: 'pointer' }}
              onClick={p => {
                if (!p?.activePayload?.[0]) return;
                const data = p.activePayload[0].payload;
                const rows = master.filter(r => {
                  const prod = r['Smallcase Name'] || '';
                  return prod === data.from || prod === data.to;
                }).map(toRow);
                openDrilldown(
                  `Migration: ${data.from} → ${data.to}`,
                  `${rows.length} subscriber records matching this migration path`,
                  rows, subCols
                );
              }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
              <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
              <YAxis dataKey="label" type="category" tick={{ fill: 'var(--text-secondary)', fontSize: 8 }} width={140} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name="Users" radius={[0, 4, 4, 0]}>
                {topFlows.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="chart-clickable-hint">💡 Click any bar/point to see details</div>
        </ChartCard>
      </div>

      {/* Entry & Destination Products */}
      <div className="charts-grid charts-grid-2" style={{ marginBottom: '1rem' }}>
        {entryProducts?.length > 0 && (
          <ChartCard title="Top Entry Products" subtitle="Which products most users subscribe to first"
            tooltip="For investors who eventually held multiple products, which product they started with most often — shows which offering acts as the on-ramp into a multi-product relationship.">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={entryProducts}
                style={{ cursor: 'pointer' }}
                onClick={p => {
                  if (!p?.activePayload?.[0]) return;
                  const data = p.activePayload[0].payload;
                  const rows = master.filter(r =>
                    (r['Smallcase Name'] || '') === data.product
                  ).map(toRow);
                  openDrilldown(
                    `Entry Product: ${data.product}`,
                    `${rows.length} subscribers who entered via this product`,
                    rows, subCols
                  );
                }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
                <XAxis dataKey="product" tick={{ fill: 'var(--text-muted)', fontSize: 9 }} angle={-20} textAnchor="end" height={50} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="Users entering via this product" radius={[3, 3, 0, 0]}>
                  {entryProducts.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="chart-clickable-hint">💡 Click any bar/point to see details</div>
          </ChartCard>
        )}
        {exitProducts?.length > 0 && (
          <ChartCard title="Top Destination Products" subtitle="Products that attract the most migrations"
            tooltip="For investors who held multiple products, which product they most often ended up on last — shows where cross-sell journeys are landing.">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={exitProducts}
                style={{ cursor: 'pointer' }}
                onClick={p => {
                  if (!p?.activePayload?.[0]) return;
                  const data = p.activePayload[0].payload;
                  const rows = master.filter(r =>
                    (r['Smallcase Name'] || '') === data.product
                  ).map(toRow);
                  openDrilldown(
                    `Destination Product: ${data.product}`,
                    `${rows.length} subscribers currently in this destination product`,
                    rows, subCols
                  );
                }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
                <XAxis dataKey="product" tick={{ fill: 'var(--text-muted)', fontSize: 9 }} angle={-20} textAnchor="end" height={50} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="Users arriving here" radius={[3, 3, 0, 0]}>
                  {exitProducts.map((_, i) => <Cell key={i} fill={COLORS[(i + 2) % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="chart-clickable-hint">💡 Click any bar/point to see details</div>
          </ChartCard>
        )}
      </div>

      {/* Migration Flow Visualization */}
      <ChartCard title="Product Migration Flow Visualization" subtitle="From product (left) → To product (right) · Bar width = number of users" style={{ marginBottom: '1rem' }}
        tooltip="Bar width is proportional to the number of investors who moved from the product on the left to the product on the right — scan for the widest bars to see the dominant product-to-product journeys at a glance.">
        <SankeyMigration flows={flows} />
      </ChartCard>

      {/* Migration Matrix Table */}
      {flows?.length > 0 && (
        <ChartCard title="Migration Flow Detail Table" subtitle="All product-to-product movement records"
          tooltip="The complete list of first-product → last-product transitions behind the charts above, with the exact number of investors who made each move.">
          <div className="data-table-wrap" style={{ maxHeight: 340, overflowY: 'auto' }}>
            <table className="data-table">
              <thead><tr>
                <th>#</th><th>From Product</th><th>To Product</th><th style={{textAlign:'right'}}>Users</th>
              </tr></thead>
              <tbody>
                {flows.map((f, i) => (
                  <tr key={i}>
                    <td className="td-rank">{i + 1}</td>
                    <td className="td-name">{f.from}</td>
                    <td className="td-good">{f.to}</td>
                    <td className="td-num">{f.count?.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
      )}

      <div style={{ marginTop: '1rem' }}>
        <InsightsPanel insights={migrationInsights} title="🤖 Migration Intelligence — Cross-Product Journey Analysis" max={8} />
      </div>

      <FAQSection items={[
        { q: 'What is this page showing?',
          a: 'How investors move between products over time — who started on one basket and later ended up on a different one. It only looks at people who have held 2 or more products; someone who has only ever subscribed to one product doesn\'t appear in any of the flows here (they show up as "Single Product" in the adoption split instead).' },
        { q: 'How is a "migration" actually identified?',
          a: 'For every investor (by PAN) who has held more than one distinct product, we look at their very first product (by subscription start date) and their most recent one. If those two are different, that\'s counted as one migration from the first to the last. It\'s a start-to-now comparison, not a count of every product they\'ve ever touched — someone who went A → B → A would show as "no migration" here, since they ended up back where they started.' },
        { q: 'What does "Multi-Product Investors" vs "Single-Product Investors" mean?',
          a: 'Multi-Product counts unique people (by PAN) who have held 2+ different products at any point in their history, even if they\'re only active on one right now. Single-Product is everyone else — people who have only ever touched one basket. A high Single-Product number is really a list of upsell candidates, since they\'ve never been introduced to a second product.' },
        { q: 'What are "Top Entry Product" and "Top Destination Product"?',
          a: 'Among people who went on to hold multiple products, Entry Product is the one they most commonly started on — effectively your best on-ramp into a multi-product relationship. Destination Product is the one they most commonly ended up on most recently — your strongest upgrade/cross-sell landing spot. If the same product tops both lists, it\'s acting as a true hub in the customer journey.' },
        { q: 'How does the Period filter affect the numbers on this page?',
          a: 'Working out someone\'s first and last product always requires their FULL subscription history, so that part of the calculation is never limited by the Period filter. What the Period filter does is narrow down which migrations get counted at all — only migrations where the move to the destination product started within the selected period are included. Pick a narrow period and you\'ll see fewer, more recent migrations; clear the filter and you see the full all-time list.' },
        { q: 'Why don\'t the migration counts add up to my total subscriber count?',
          a: 'This page only counts people who changed their product over time — the majority of a subscriber base that has always stuck with one product simply isn\'t part of any flow. The list of flows is also capped at the top 25 by volume, and the Entry/Destination Product cards only show the top 5 each, so smaller or rarer paths won\'t appear individually (they\'re still counted in the total Multi-Product number, just not broken out).' },
        { q: 'Where do the "Migration Intelligence" insights at the bottom come from?',
          a: 'They\'re generated directly from the flow data above — the multi-product adoption rate, the top entry/destination products, and the single busiest migration path — not a separate AI process. They\'ll update automatically if you change the Period filter, since the underlying flow data changes too.' },
      ]} />
    </div>
  );
});
