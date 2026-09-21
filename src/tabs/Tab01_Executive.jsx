import { memo, useState } from 'react';
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts';
import SortableKPIGrid from '../components/SortableKPIGrid';
import ChartCard from '../components/ChartCard';
import { YAxisTick } from '../components/YAxisTick';
import InsightsPanel from '../components/InsightsPanel';
import FAQSection from '../components/FAQSection';
import { formatCurrency, formatNumber, formatExact, formatCurrencyExact, formatCrores, parseExcelDate } from '../dataEngine';
import TabDateFilter from '../components/TabDateFilter';
import DrilldownModal, { useDrilldown } from '../components/DrilldownModal';

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

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--bg-elevated)', border: '1px solid var(--border-bright)',
      borderRadius: 8, padding: '10px 14px', fontSize: 12,
    }}>
      <div style={{ color: 'var(--text-secondary)', marginBottom: 6 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, display: 'flex', gap: 8, justifyContent: 'space-between' }}>
          <span>{p.name}</span>
          <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{p.value?.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
};

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
  cycle:   r['Cycle Number']   || '—',
});

export default memo(function Tab01Executive({ kpis, prevKpis, monthly, retentionMetrics, products, insights, goal, setGoal, currentUser, filters, setFilters, currentMaster, totalAUMAllTime }) {
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState('');
  const { drilldown, open: openDrilldown, close: closeDrilldown } = useDrilldown();

  if (!kpis) return <div className="empty-state"><span className="empty-state-icon">📊</span><div>No data loaded</div></div>;

  // Period-over-period delta helper
  const delta = (cur, prev) => {
    if (!prevKpis || !prev || prev === 0) return {};
    const pct = +((cur - prev) / Math.abs(prev) * 100).toFixed(1);
    return {
      trend: `${pct > 0 ? '+' : ''}${pct}% vs prev period`,
      trendDir: pct > 0 ? 'up' : pct < 0 ? 'down' : 'neutral',
    };
  };

  // MoM / YoY retention sub-label
  const retSub = (() => {
    if (!retentionMetrics) return null;
    const parts = [];
    if (retentionMetrics.momChange !== null) {
      const dir = retentionMetrics.momChange > 0 ? '▲' : retentionMetrics.momChange < 0 ? '▼' : '—';
      parts.push(`vs LM: ${dir} ${Math.abs(retentionMetrics.momChange)}%`);
    }
    if (retentionMetrics.yoyChange !== null) {
      const dir = retentionMetrics.yoyChange > 0 ? '▲' : retentionMetrics.yoyChange < 0 ? '▼' : '—';
      parts.push(`vs LY: ${dir} ${Math.abs(retentionMetrics.yoyChange)}%`);
    }
    return parts.join('  ·  ') || null;
  })();

  const onDateChange = (from, to) => setFilters(prev => ({ ...prev, dateFrom: from, dateTo: to }));

  // Drilldown handlers
  const handleMonthBarClick = (p, dataKeys) => {
    if (!p?.activePayload?.[0]) return;
    const data = p.activePayload[0].payload;
    const month = data.month;
    if (!month || !currentMaster?.length) return;
    const rows = currentMaster.filter(r => {
      const parsed = parseExcelDate(r['Subscription Start Date']);
      if (!parsed) return false;
      // Match the format produced by getMonthlyMovement: "Jan '24"
      const rowMonth = `${parsed.toLocaleString('default', { month: 'short' })} '${String(parsed.getFullYear()).slice(2)}`;
      return month === rowMonth;
    });
    openDrilldown(
      `Subscribers — ${month}`,
      `${rows.length} subscription records in this month`,
      rows.map(toRow),
      subCols
    );
  };

  const handleProductBarClick = (p) => {
    if (!p?.activePayload?.[0]) return;
    const data = p.activePayload[0].payload;
    const productName = data.product;
    if (!productName || !currentMaster?.length) return;
    const rows = currentMaster.filter(r => (r['Smallcase Name'] || '') === productName);
    openDrilldown(
      `Subscribers — ${basketLabel(productName)}`,
      `${rows.length} records for this product`,
      rows.map(toRow),
      subCols
    );
  };

  const hasActiveFilter = !!(filters?.dateFrom || filters?.dateTo ||
    ['smallcase', 'state', 'broker', 'attribution', 'riskProfile', 'planType', 'status']
      .some(k => filters?.[k]?.length));

  const kpiList = [
    // ── Row 1: Subscriber counts ──────────────────────────────────────
    {
      label: 'Unique Investors',
      value: formatExact(kpis.totalUniqueSubscribers),
      icon: '👤', accent: 'var(--accent-cyan)', sub: 'All unique PANs',
      tooltip: 'Count of distinct investors (by PAN) matching the current filters — one person counted once even if they hold multiple baskets.',
      ...delta(kpis.totalUniqueSubscribers, prevKpis?.totalUniqueSubscribers),
    },
    {
      label: 'Total Subscriptions',
      value: formatExact(kpis.totalSubscriptions),
      icon: '📋', accent: 'var(--accent-cyan)', sub: 'Excl. private smallcases',
      tooltip: 'Every subscription record matching the current filters — an investor holding 2 baskets counts as 2 here, not 1.',
      ...delta(kpis.totalSubscriptions, prevKpis?.totalSubscriptions),
    },
    {
      label: 'Active Subscribers',
      value: formatExact(kpis.activeSubscribers),
      icon: '✅', accent: 'var(--accent-green)', sub: 'Subscribed + Grace + Cancelled-Active',
      tooltip: 'Unique investors currently in a live status (Subscribed, Grace Period, or Cancelled-but-still-active). With a period selected, only counts those whose current cycle started or ended within it.',
      ...delta(kpis.activeSubscribers, prevKpis?.activeSubscribers),
    },
    {
      label: 'Active Subscriptions',
      value: formatExact(kpis.totalActiveSubscriptions),
      icon: '📦', accent: 'var(--accent-cyan)', sub: 'Total active subscription rows (multi-basket counted)',
      tooltip: 'Same as Active Subscribers, but counting every active basket separately — an investor active in 2 products counts as 2 here.',
      ...delta(kpis.totalActiveSubscriptions, prevKpis?.totalActiveSubscriptions),
    },
    {
      label: 'Exited Subscribers',
      value: formatExact(kpis.exitedSubscribers),
      icon: '⬛', accent: 'var(--accent-red)', sub: 'Status: Unsubscribed',
      tooltip: 'Investors whose subscription is Unsubscribed — they churned rather than renewed. With a period selected, only those who exited within it.',
      ...delta(kpis.exitedSubscribers, prevKpis?.exitedSubscribers),
    },

    // ── Row 2: MTD movement ───────────────────────────────────────────
    {
      label: 'New Unique (MTD)',
      value: `+${formatExact(kpis.newUniqueMTD)}`,
      icon: '🆕', accent: 'var(--accent-green)',
      sub: 'Cycle 1 starts this month',
      tooltip: 'First-time signups (Cycle 1) that started this calendar month. Always the real current month — not affected by the Period filter.',
      trend: `+${formatExact(kpis.newUniqueMTD)}`, trendDir: 'up',
    },
    {
      label: 'Renewals (MTD)',
      value: `+${formatExact(kpis.renewalsMTD)}`,
      icon: '🔄', accent: 'var(--accent-teal)',
      sub: 'Cycle 2+ starts this month',
      tooltip: 'Renewal cycles (Cycle 2 or later) that started this calendar month — returning customers, not new signups. Always the real current month.',
      trend: `+${formatExact(kpis.renewalsMTD)}`, trendDir: 'up',
    },
    {
      label: 'Net Growth (MTD)',
      value: `${kpis.netGrowthMTD >= 0 ? '+' : ''}${formatExact(kpis.netGrowthMTD)}`,
      icon: '📈', accent: kpis.netGrowthMTD >= 0 ? 'var(--accent-green)' : 'var(--accent-red)',
      tooltip: 'New Unique (MTD) minus Exited (MTD) — the net change in unique investors so far this calendar month.',
      trendDir: kpis.netGrowthMTD >= 0 ? 'up' : 'down',
    },

    // ── Row 3: Rates ──────────────────────────────────────────────────
    {
      label: 'Retention Rate',
      value: `${retentionMetrics?.current ?? kpis.retentionRate}%`,
      icon: '🔒', accent: 'var(--accent-teal)',
      sub: retSub,
      tooltip: '% of the opening subscriber base for the current month that has NOT churned — 100% minus this month\'s churn rate. A snapshot of the current month, separate from the Period filter.',
      trend: prevKpis
        ? `${kpis.retentionRate > prevKpis.retentionRate ? '+' : ''}${(kpis.retentionRate - prevKpis.retentionRate).toFixed(1)}% vs prev period`
        : retentionMetrics?.momChange !== null ? `${retentionMetrics?.momChange > 0 ? '+' : ''}${retentionMetrics?.momChange}% MoM` : undefined,
      trendDir: prevKpis
        ? (kpis.retentionRate > prevKpis.retentionRate ? 'up' : kpis.retentionRate < prevKpis.retentionRate ? 'down' : 'neutral')
        : retentionMetrics?.momChange > 0 ? 'up' : retentionMetrics?.momChange < 0 ? 'down' : 'neutral',
    },
    {
      label: 'Renewal Rate',
      value: `${kpis.renewalRate}%`,
      icon: '🔁', accent: 'var(--accent-purple)',
      sub: 'Active subs with Cycle > 1',
      tooltip: '% of currently active subscribers (matching current filters) who are on their 2nd cycle or later — i.e. have renewed at least once. Different from the Renewal Intelligence tab\'s month-by-month conversion rate.',
      ...delta(kpis.renewalRate, prevKpis?.renewalRate),
    },

    // ── Row 4: Financials (active only) ───────────────────────────────
    {
      label: 'Avg Networth',
      value: formatCurrencyExact(kpis.avgNetworth),
      icon: '💳', accent: 'var(--accent-gold)',
      sub: `Median: ${formatCurrencyExact(kpis.medianNetworth)} · Active only`,
      tooltip: 'Average portfolio net worth across active, unique investors matching current filters. Median is also shown since a few very large portfolios can skew the average upward.',
    },
    {
      label: 'Avg P&L',
      value: formatCurrencyExact(kpis.avgPL),
      icon: '💹', accent: kpis.avgPL >= 0 ? 'var(--accent-green)' : 'var(--accent-red)',
      sub: 'Avg Total P&L per active subscriber',
      tooltip: 'Average cumulative profit/loss per active subscriber\'s portfolio, matching current filters. Positive means the average active subscriber is up overall.',
    },
    {
      label: 'Avg Plan Amount',
      value: formatCurrencyExact(kpis.avgPlanAmount),
      icon: '🏷️', accent: 'var(--accent-cyan)',
      sub: 'Active subscribers only',
      tooltip: 'Average subscription plan price paid by active subscribers matching current filters (before any discount is applied).',
    },
    {
      label: 'Avg Discount',
      value: formatCurrencyExact(kpis.avgDiscount),
      icon: '🎯', accent: 'var(--accent-orange)',
      sub: 'Among discounted · Active only',
      tooltip: 'Average discount amount, but only among active subscribers who actually used an offer/discount code — not averaged across everyone.',
    },
    {
      label: 'Discount Penetration',
      value: `${kpis.discountPenetration}%`,
      icon: '📉', accent: 'var(--accent-orange)',
      sub: 'Active subs with discount',
      tooltip: '% of active subscribers (matching current filters) who are on a discounted plan, out of all active subscribers.',
    },

    // ── Row 5: Products ───────────────────────────────────────────────
    {
      label: 'Total Products',
      value: kpis.totalProducts,
      icon: '🎯', accent: 'var(--accent-purple)',
      sub: 'Excl. private smallcases',
      tooltip: 'Number of distinct smallcase products represented in the currently filtered data (private/internal smallcases excluded).',
    },
    {
      label: 'Avg Products / User',
      value: kpis.avgProductsPerUser,
      icon: '📦', accent: 'var(--accent-teal)',
      sub: 'Cross-sell ratio',
      tooltip: 'Average number of distinct products each unique investor holds — how well cross-sell is working. Above 1 means investors typically hold more than one basket.',
    },

    // ── Row 6: Exit ───────────────────────────────────────────────────
    {
      label: 'Exited Last Month',
      value: formatExact(kpis.exitedLastMonth),
      icon: '⚠️', accent: 'var(--accent-red)',
      sub: 'Exits in the previous month',
      tooltip: 'How many subscribers churned in the calendar month before this one. Always the real previous month — not affected by the Period filter.',
      trendDir: kpis.exitedLastMonth > 0 ? 'down' : 'neutral',
    },

    // ── Row 7: AUM & Historical ───────────────────────────────────────
    // AUM always shows the all-time total (unaffected by filters) as a stable
    // headline figure; a second card only appears once a specific period or
    // basket/dimension filter is picked, showing AUM for just that selection.
    {
      label: 'Total AUM (All Time)',
      value: formatCrores(totalAUMAllTime),
      icon: '🏦', accent: 'var(--accent-gold)',
      sub: 'Active subscribers · In Crores',
      tooltip: 'Total assets under management across ALL currently active subscribers, company-wide — permanently unfiltered, so it never changes with Period/Smallcase/etc. A stable headline reference number.',
    },
    ...(hasActiveFilter ? [{
      label: 'AUM (Selected Filter)',
      value: formatCrores(kpis.totalAUM),
      icon: '🎯', accent: 'var(--accent-cyan)',
      sub: 'Active subscribers matching current filters',
      tooltip: 'Total AUM narrowed to whatever Period/Smallcase/etc. filters are currently active — only appears once a filter is selected, so you can compare it against the all-time total alongside it.',
    }] : []),
    {
      label: 'Total Signups',
      value: formatExact(kpis.totalSignupsEver),
      icon: '🧾', accent: 'var(--accent-cyan)',
      sub: 'Unique investors ever (incl. exited)',
      tooltip: 'Every unique investor who has EVER signed up, including those who have since fully exited — the all-time historical reach of the business, not just who\'s active today.',
    },
  ];

  const last12 = monthly?.slice(-12) || [];
  const last24 = monthly?.slice(-24) || [];

  const activeSubs = kpis.activeSubscribers || 0;
  const goalPct = goal > 0 ? Math.min(100, Math.round(activeSubs / goal * 100)) : 0;

  return (
    <div>
      <DrilldownModal drilldown={drilldown} onClose={closeDrilldown} />

      {/* Goal Tracking */}
      {(goal > 0 || currentUser?.role === 'admin') && (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-lg)', padding: '14px 20px', marginBottom: '1rem',
          display: 'flex', alignItems: 'center', gap: 16,
        }}>
          <div style={{ fontSize: 20 }}>🎯</div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                Subscriber Goal
                {goal > 0 && (
                  <span style={{ marginLeft: 10, fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>
                    {formatExact(activeSubs)} / {formatExact(goal)} active subscribers · {goalPct}%
                  </span>
                )}
              </div>
              {currentUser?.role === 'admin' && !editingGoal && (
                <button onClick={() => { setGoalInput(String(goal || '')); setEditingGoal(true); }}
                  style={{ background: 'none', border: '1px solid var(--border-default)', borderRadius: 6,
                    color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11, padding: '3px 10px' }}>
                  {goal > 0 ? 'Edit Goal' : 'Set Goal'}
                </button>
              )}
              {editingGoal && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="number" value={goalInput} onChange={e => setGoalInput(e.target.value)}
                    placeholder="Target subscribers" min="0"
                    style={{ width: 140, padding: '4px 10px', fontSize: 12, borderRadius: 6,
                      background: 'var(--bg-elevated)', border: '1px solid var(--accent-cyan)',
                      color: 'var(--text-primary)', outline: 'none' }} />
                  <button onClick={() => { setGoal(Number(goalInput) || 0); setEditingGoal(false); }}
                    style={{ background: 'var(--accent-cyan)', border: 'none', borderRadius: 6,
                      color: '#000', cursor: 'pointer', fontSize: 11, padding: '4px 12px', fontWeight: 600 }}>Save</button>
                  <button onClick={() => setEditingGoal(false)}
                    style={{ background: 'none', border: '1px solid var(--border-default)', borderRadius: 6,
                      color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11, padding: '4px 10px' }}>Cancel</button>
                </div>
              )}
            </div>
            {goal > 0 ? (
              <div style={{ background: 'var(--bg-elevated)', borderRadius: 6, height: 10, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${goalPct}%`,
                  background: goalPct >= 100 ? '#22c55e' : goalPct >= 75 ? '#00d4ff' : goalPct >= 50 ? '#fbbf24' : '#f87171',
                  transition: 'width 0.6s ease', borderRadius: 6,
                }} />
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Set a subscriber target to track progress here (admin only).
              </div>
            )}
          </div>
        </div>
      )}

      {/* Period comparison banner */}
      {prevKpis && (
        <div style={{
          background: 'rgba(0,212,255,0.05)', border: '1px solid rgba(0,212,255,0.2)',
          borderRadius: 8, padding: '7px 14px', marginBottom: '0.75rem',
          fontSize: 12, color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span>🔄</span>
          <span>Showing period comparison — KPI trends show change vs equivalent prior period</span>
        </div>
      )}

      {/* KPI Grid */}
      <div className="section-heading">
        <div>
          <div className="section-title">⚡ Executive Command Center</div>
          <div className="section-subtitle">Current state from deduplicated subscription master · Active-subscriber financials · Private smallcases excluded</div>
        </div>
        <div className="section-divider" />
        <div className="section-badge">{prevKpis ? 'Period Comparison' : 'Live Dashboard'}</div>
      </div>

      <TabDateFilter dateFrom={filters?.dateFrom} dateTo={filters?.dateTo} onChange={onDateChange} />

      <SortableKPIGrid
        storageKey="exec"
        cards={kpiList.map(k => ({ ...k, id: k.label.toLowerCase().replace(/[^a-z0-9]+/g, '_') }))}
      />

      {/* New Unique vs Renewals — Monthly Breakdown */}
      <div className="charts-grid charts-grid-2" style={{ marginBottom: '1rem' }}>
        <ChartCard title="New Unique vs Renewal Subscribers" subtitle="Monthly split: first-time subscribers (Cycle 1) vs returning renewals (Cycle 2+)" badge="Acquisition Split"
          tooltip="Shows, month by month, how much of your subscriber activity is brand-new signups vs. existing customers renewing. A month leaning heavily toward renewals means growth is coming from retention, not new acquisition.">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={last12}
              onClick={p => handleMonthBarClick(p, ['newUnique', 'renewals'])}
              style={{ cursor: 'pointer' }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
              <XAxis dataKey="month" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="newUnique" name="New Unique" fill="#22c55e" stackId="a" radius={[0, 0, 0, 0]} />
              <Bar dataKey="renewals" name="Renewals" fill="#00d4ff" stackId="a" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="chart-clickable-hint">💡 Click any bar to see subscriber details</div>
        </ChartCard>

        <ChartCard title="Monthly Net Additions" subtitle="New starts minus exits per month — net growth direction" badge="MTD Trend"
          tooltip="Bars above zero mean more people joined than left that month (growing); below zero means more churned than joined (shrinking). Use this to spot which months drove real growth vs. decline.">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={last12}
              onClick={p => handleMonthBarClick(p, ['new', 'exited', 'net'])}
              style={{ cursor: 'pointer' }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
              <XAxis dataKey="month" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={0} stroke="var(--border-bright)" />
              <Bar dataKey="new" name="New" fill="#22c55e" radius={[0, 0, 0, 0]} />
              <Bar dataKey="exited" name="Exited" fill="#f87171" radius={[0, 0, 0, 0]} />
              <Bar dataKey="net" name="Net" fill="#fbbf24" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="chart-clickable-hint">💡 Click any bar to see subscriber details</div>
        </ChartCard>
      </div>

      {/* Subscriber growth */}
      <div className="charts-grid charts-grid-1" style={{ marginBottom: '1rem' }}>
        <ChartCard title="Subscriber Growth Trend" subtitle="Closing active subscribers per month (24-month view)" badge="Historical"
          tooltip="The total number of active subscribers at the end of each month, over the last 2 years — the long-term trajectory of the business, independent of any single month's ups and downs.">
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={last24}>
              <defs>
                <linearGradient id="gradClose" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00d4ff" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#00d4ff" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
              <XAxis dataKey="month" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="closing" name="Active Subs" stroke="#00d4ff" fill="url(#gradClose)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Product quick view */}
      {products?.length > 0 && (
        <div className="charts-grid charts-grid-2" style={{ marginBottom: '1rem' }}>
          <ChartCard title="Product Mix — Active Subscribers" subtitle="Active subscriber distribution by product (excl. private)"
            tooltip="Each bar's total length is a product's all-time subscriber volume, split into still-active (cyan) vs. churned (red). A product with a large red share has retention problems even if its total volume looks big.">
            <ResponsiveContainer width="100%" height={Math.max(240, products.length * 40)}>
              <BarChart
                data={products}
                layout="vertical"
                margin={{ left: 10, right: 20, top: 5, bottom: 5 }}
                barCategoryGap="20%"
                onClick={handleProductBarClick}
                style={{ cursor: 'pointer' }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
                <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                <YAxis dataKey="product" type="category" width={120} tick={<YAxisTick formatter={basketLabel} fontSize={11} />} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="active" name="Active" stackId="a" fill="#00d4ff" />
                <Bar dataKey="exited" name="Exited" stackId="a" fill="#f87171" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="chart-clickable-hint">💡 Click any bar to see subscriber details</div>
          </ChartCard>

          <ChartCard title="Renewal Rate by Product" subtitle="% of active subscribers who have renewed (Cycle > 1)"
            tooltip="For each product, what share of its current active base has renewed at least once. Higher bars mean stickier products — useful for spotting which baskets to promote or which need retention work.">
            <ResponsiveContainer width="100%" height={Math.max(240, products.length * 40)}>
              <BarChart
                data={products}
                layout="vertical"
                margin={{ left: 10, right: 20, top: 5, bottom: 5 }}
                barCategoryGap="20%"
                onClick={handleProductBarClick}
                style={{ cursor: 'pointer' }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
                <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} unit="%" domain={[0, 100]} />
                <YAxis dataKey="product" type="category" width={120} tick={<YAxisTick formatter={basketLabel} fontSize={11} />} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="renewalRate" name="Renewal %" fill="#22c55e" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="chart-clickable-hint">💡 Click any bar to see subscriber details</div>
          </ChartCard>
        </div>
      )}

      <InsightsPanel insights={insights} max={6} />

      <FAQSection items={[
        { q: 'What is this page for?',
          a: 'A single-screen snapshot of the whole business: how many subscribers you have, how much is under management, how healthy renewals and retention are, and which products are carrying the base. It\'s the page to check first — every other tab drills into one specific piece of this.' },
        { q: 'Why does "Total AUM (All Time)" not change when I pick a period or filter, but everything else does?',
          a: 'That one card is deliberately always showing the full, current portfolio value regardless of any filter — it\'s meant to be a stable headline number you can always trust. Every other card and chart on this page (and the rest of the dashboard) respects whatever period/product/broker filters you\'ve selected. If you pick a specific period or product, a second card — "AUM (Selected Filter)" — appears alongside it showing the AUM for just that slice.' },
        { q: 'I picked a period like "6M" — what exactly does that filter to?',
          a: 'It scopes every number to activity that happened in that window: a subscriber counts if they started their subscription in that window, or if they exited/unsubscribed in that window. Someone who started before the window and is still active won\'t show up as "new," but they will still count toward the active total. This is stricter than "who was active at some point during this window" — it\'s "what happened during this window."' },
        { q: 'What\'s the difference between "Total Subscriptions" and "Unique Investors" in the ticker bar?',
          a: 'Total Subscriptions counts every subscription record — if one person holds 2 products, that\'s 2. Unique Investors counts each person once by PAN, no matter how many products or renewal cycles they have. Most of the KPI cards on this page use per-product counting (like Total Subscriptions), since a person can be active on one product and exited on another.' },
        { q: 'How is "Retention Rate" different from "Renewal Rate"?',
          a: 'Retention Rate is a simple snapshot: what share of all subscriptions are currently active, out of everyone who ever subscribed. Renewal Rate is narrower and more specific: of the people who were actually due to renew (their cycle came up for renewal), what share of them renewed. Renewal Rate is the better signal for "are we losing people at the moment of choice," since it excludes people who are simply still mid-subscription and not due yet.' },
        { q: 'Where do the AI-generated insights at the bottom come from?',
          a: 'They\'re computed directly from the same filtered numbers shown above — best/worst performing products, growth trends, concentration risk, retention laggards, etc. — not a separate AI model call. They update live as you change filters, so they always describe whatever slice of data you\'re currently looking at.' },
        { q: 'Something on this page looks wrong or doesn\'t match another tab — what should I check first?',
          a: 'Check whether the same filters (period, product, broker) are applied on both tabs — a mismatch there is the most common reason two tabs show different numbers for what looks like "the same thing." Also check the ⓘ tooltip next to the specific card — many numbers that look similar are actually counted differently (per-person vs. per-product, or lifetime vs. within-period), and the tooltip spells out exactly which one you\'re looking at.' },
      ]} />
    </div>
  );
});
