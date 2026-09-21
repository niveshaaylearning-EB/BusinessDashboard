import { memo, useMemo, useState } from 'react';
import Tab26OfferROI from './Tab26_OfferROI';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell, LineChart, Line, ComposedChart, Area
} from 'recharts';
import ChartCard from '../components/ChartCard';
import { YAxisTick } from '../components/YAxisTick';
import SortableKPIGrid from '../components/SortableKPIGrid';
import InsightsPanel from '../components/InsightsPanel';
import FAQSection from '../components/FAQSection';
import { formatCurrency, formatNumber } from '../dataEngine';
import TabDateFilter from '../components/TabDateFilter';
import DrilldownModal, { useDrilldown } from '../components/DrilldownModal';

const subCols = [
  { key: 'name',     label: 'Name' },
  { key: 'pan',      label: 'PAN',        cls: 'td-name' },
  { key: 'product',  label: 'Product' },
  { key: 'broker',   label: 'Broker' },
  { key: 'status',   label: 'Status',     align: 'right' },
  { key: 'cycle',    label: 'Cycle',      align: 'right', cls: 'td-num' },
  { key: 'discount', label: 'Discount ₹', align: 'right', cls: 'td-num' },
];
const toRow = r => ({
  name:     r.Name || r.name || '—',
  pan:      String(r.PAN || '').trim().toUpperCase(),
  product:  r['Smallcase Name'] || '—',
  broker:   r['Broker Name'] || r['Broker'] || '—',
  status:   r['Latest Subscription Status'] || '—',
  cycle:    r['Cycle Number'] || '—',
  discount: r['Offer Discount'] || 0,
});

const COLORS = ['#00d4ff','#fbbf24','#22c55e','#a78bfa','#f87171','#fb923c','#2dd4bf','#f472b6'];

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

function fmtAmt(val) {
  if (!val || isNaN(val)) return '₹0';
  if (val >= 1e7) return `₹${(val / 1e7).toFixed(2)}Cr`;
  if (val >= 1e5) return `₹${(val / 1e5).toFixed(1)}L`;
  if (val >= 1e3) return `₹${(val / 1e3).toFixed(1)}K`;
  return `₹${val.toLocaleString('en-IN')}`;
}

function DiscountContent({ discountSummary, discountByProduct, discountByBroker, discountByState, offerCodes, insights, filters, setFilters, currentMaster }) {
  const onDateChange = (from, to) => setFilters(prev => ({ ...prev, dateFrom: from, dateTo: to }));
  const { drilldown, open: openDrilldown, close: closeDrilldown } = useDrilldown();

  if (!discountSummary) return <div className="empty-state"><span className="empty-state-icon">🏷️</span><div>No discount data available</div></div>;

  const discountInsights = useMemo(() => {
    const summary = discountSummary || {};
    const products = discountByProduct || [];
    const brokers = discountByBroker || [];
    const codes = (offerCodes || []).filter(c => c.code !== 'No Code');

    const util = summary.discountUtilization ?? 0;
    const totalDisc = summary.totalDiscountGiven ?? 0;
    const avgDisc = summary.avgDiscount ?? 0;

    const utilLabel = util > 60 ? 'High' : util > 30 ? 'Moderate' : 'Low';
    const utilColor = util > 60 ? '#f87171' : util > 30 ? '#fbbf24' : '#22c55e';

    const topProductByDiscount = products.length > 0
      ? [...products].sort((a, b) => (b.totalDiscount ?? 0) - (a.totalDiscount ?? 0))[0]
      : null;

    const topProductByUtil = products.length > 0
      ? [...products].sort((a, b) => (b.discountUtilization ?? 0) - (a.discountUtilization ?? 0))[0]
      : null;

    const topCode = codes.length > 0
      ? [...codes].sort((a, b) => (b.count ?? 0) - (a.count ?? 0))[0]
      : null;

    const topBrokerByUtil = brokers.length > 0
      ? [...brokers].sort((a, b) => (b.discountUtilization ?? 0) - (a.discountUtilization ?? 0))[0]
      : null;

    const avgDiscLabel = avgDisc > 5000 ? 'High' : avgDisc > 2000 ? 'Moderate' : 'Low';
    const avgDiscColor = avgDisc > 5000 ? '#f87171' : avgDisc > 2000 ? '#fbbf24' : '#22c55e';

    const result = [];

    result.push({
      icon: '📊',
      category: 'Utilization',
      title: `Discount Utilization: ${util}% — ${utilLabel}`,
      detail: util > 60
        ? `More than 3 in 5 subscribers received a discount — dependency is high and may compress margins.`
        : util > 30
        ? `${util}% of subscribers used a discount. Moderate reliance; monitor for upward creep.`
        : `Only ${util}% of subscribers required a discount — pricing power is strong.`,
      color: utilColor,
    });

    result.push({
      icon: '💸',
      category: 'Total Spend',
      title: `Total Discount Issued: ${fmtAmt(totalDisc)}`,
      detail: `Across ${(summary.withDiscountCount ?? 0).toLocaleString('en-IN')} discounted subscriptions out of ${(summary.totalCount ?? 0).toLocaleString('en-IN')} total.`,
      color: '#fb923c',
    });

    if (topProductByDiscount) {
      result.push({
        icon: '🏆',
        category: 'Top Product',
        title: `${topProductByDiscount.name} leads discount spend`,
        detail: `${fmtAmt(topProductByDiscount.totalDiscount)} total discounted; avg discount ${fmtAmt(topProductByDiscount.avgDiscount)} across ${(topProductByDiscount.count ?? 0).toLocaleString('en-IN')} subs.`,
        color: '#22d3ee',
      });
    }

    if (topProductByUtil) {
      const pUtil = topProductByUtil.discountUtilization ?? 0;
      result.push({
        icon: '📉',
        category: 'Discount Dependency',
        title: `${topProductByUtil.name} has highest discount rate (${pUtil}%)`,
        detail: pUtil > 70
          ? `Nearly all buyers of this product receive a discount — full-price conversion is rare.`
          : `${pUtil}% of this product's subscribers used a discount. Review pricing floor.`,
        color: pUtil > 70 ? '#f87171' : '#fbbf24',
      });
    }

    if (topCode) {
      result.push({
        icon: '🔑',
        category: 'Offer Codes',
        title: `"${topCode.code}" is the most-used offer code`,
        detail: `Used by ${(topCode.count ?? 0).toLocaleString('en-IN')} subscribers; total discount ${fmtAmt(topCode.totalDiscount)}, avg ${fmtAmt(topCode.avgDiscount)} per use.`,
        color: '#a78bfa',
      });
    }

    if (topBrokerByUtil) {
      const bUtil = topBrokerByUtil.discountUtilization ?? 0;
      result.push({
        icon: '🤝',
        category: 'Broker Discounting',
        title: `${topBrokerByUtil.broker || topBrokerByUtil.name} grants most discounts (${bUtil}%)`,
        detail: `${bUtil}% of this broker's subscribers received a discount — may indicate aggressive acquisition pricing.`,
        color: bUtil > 60 ? '#f87171' : '#fbbf24',
      });
    }

    result.push({
      icon: '🏷️',
      category: 'Avg Discount Level',
      title: `Avg Discount ${fmtAmt(avgDisc)} — ${avgDiscLabel} intensity`,
      detail: avgDisc > 5000
        ? `High per-subscriber discounting. Audit whether discount depth is justified by LTV.`
        : avgDisc > 2000
        ? `Moderate average discount. Track trend over time to catch margin erosion.`
        : `Discounts are modest relative to plan values — healthy pricing discipline.`,
      color: avgDiscColor,
    });

    if (util > 50) {
      result.push({
        icon: '⚠️',
        category: 'Margin Risk',
        title: `Margin Risk: Discount utilization exceeds 50%`,
        detail: `Over half your subscriber base is on discounted pricing. Consider tiered loyalty pricing to reduce blanket discounting.`,
        color: '#f87171',
      });
    }

    return result;
  }, [discountSummary, discountByProduct, discountByBroker, offerCodes]);

  const top10Codes = (offerCodes || []).filter(c => c.code !== 'No Code').slice(0, 10);
  const topByDiscount = (discountByProduct || []).slice(0, 8);
  const topByUtil = [...(discountByProduct || [])].sort((a, b) => b.discountUtilization - a.discountUtilization).slice(0, 8);

  return (
    <div>
      <DrilldownModal drilldown={drilldown} onClose={closeDrilldown} />
      <div className="section-heading">
        <div><div className="section-title">🏷️ Discount Intelligence</div><div className="section-subtitle">Discount dependency, offer code analysis and pricing strategy insights</div></div>
        <div className="section-divider" />
        <div className="section-badge">Pricing Analytics</div>
      </div>
      <TabDateFilter dateFrom={filters?.dateFrom} dateTo={filters?.dateTo} onChange={onDateChange} />

      {/* KPIs */}
      <SortableKPIGrid storageKey="discount" cols="160px" cards={[
        { id: 'total_discount',   label: 'Total Discount Given',   value: formatCurrency(discountSummary.totalDiscountGiven, true),      accent: 'var(--accent-orange)', icon: '💸', small: true,
          tooltip: 'Sum of all Offer Discount ₹ amounts across active subscriptions — summed per subscription row, so an investor with multiple active products contributes each discount separately.' },
        { id: 'avg_discount',     label: 'Avg Discount',           value: formatCurrency(discountSummary.avgDiscount, true),             accent: 'var(--accent-gold)',   icon: '🏷️',
          tooltip: 'Average discount amount among unique active subscribers who received a non-zero discount — subscribers with no discount are excluded from this average, not counted as zero.' },
        { id: 'median_discount',  label: 'Median Discount',        value: formatCurrency(discountSummary.medianDiscount, true),          accent: 'var(--accent-gold)',   icon: '📊',
          tooltip: 'Median discount amount among unique active subscribers with a non-zero discount — less skewed by a few very large discounts than the average above.' },
        { id: 'disc_util',        label: 'Discount Utilization',   value: `${discountSummary.discountUtilization}%`,                    accent: discountSummary.discountUtilization > 50 ? 'var(--accent-red)' : 'var(--accent-teal)', icon: '📉', sub: '% with discount',
          tooltip: '% of unique active subscribers currently on a discounted plan (Offer Discount > 0). Higher values mean more of the base needed a discount to convert or stay.' },
        { id: 'disc_subs',        label: 'Discounted Subs',        value: formatNumber(discountSummary.withDiscountCount),               accent: 'var(--accent-orange)', icon: '🎯',
          tooltip: 'Number of unique active subscribers currently receiving a non-zero discount.' },
        { id: 'offer_codes',      label: 'Unique Offer Codes',     value: (offerCodes || []).filter(c => c.code !== 'No Code').length,   accent: 'var(--accent-purple)', icon: '🔑',
          tooltip: 'Count of distinct promotional offer codes that have been used by at least one active subscriber (excludes subscriptions with no code applied).' },
      ]} />

      {/* Charts Row 1 */}
      <div className="charts-grid charts-grid-2" style={{ marginBottom: '1rem' }}>
        <ChartCard title="Total Discount by Product" subtitle="Which products consume the most discount budget"
          tooltip="Total ₹ discount given to active subscribers of each product (summed across all their subscriptions, deduplicated per investor within the product) — shows where the discount budget is concentrated.">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart
              data={topByDiscount}
              layout="vertical"
              style={{ cursor: 'pointer' }}
              onClick={p => {
                if (!p?.activePayload?.[0]) return;
                const productName = p.activePayload[0].payload?.name;
                if (!productName) return;
                const rows = (currentMaster || []).filter(r => (r['Smallcase Name'] === productName) && (r['Offer Discount'] > 0)).map(toRow);
                openDrilldown(`Discounted Subscribers — ${productName}`, `${rows.length} subscriber(s) with discount on ${productName}`, rows, subCols);
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
              <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickFormatter={v => formatCurrency(v, true)} />
              <YAxis dataKey="name" type="category" width={115} tick={<YAxisTick maxChars={14} />} />
              <Tooltip content={<CustomTooltip />} formatter={(v) => [formatCurrency(v), 'Total Discount']} />
              <Bar dataKey="totalDiscount" name="Total Discount" radius={[0, 4, 4, 0]}>
                {topByDiscount.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="chart-clickable-hint">Click a bar to see discounted subscribers for that product</div>
        </ChartCard>

        <ChartCard title="Discount Utilization % by Product" subtitle="% of subscriptions that used a discount"
          tooltip="% of each product's active subscribers (deduplicated per investor) who are on a discounted plan — a high rate means this product rarely converts at full price.">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart
              data={topByUtil}
              layout="vertical"
              style={{ cursor: 'pointer' }}
              onClick={p => {
                if (!p?.activePayload?.[0]) return;
                const productName = p.activePayload[0].payload?.name;
                if (!productName) return;
                const rows = (currentMaster || []).filter(r => (r['Smallcase Name'] === productName) && (r['Offer Discount'] > 0)).map(toRow);
                openDrilldown(`Discounted Subscribers — ${productName}`, `${rows.length} subscriber(s) with discount on ${productName}`, rows, subCols);
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
              <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} unit="%" domain={[0, 100]} />
              <YAxis dataKey="name" type="category" width={115} tick={<YAxisTick maxChars={14} />} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="discountUtilization" name="Utilization %" radius={[0, 4, 4, 0]}>
                {topByUtil.map((p, i) => (
                  <Cell key={i} fill={p.discountUtilization > 70 ? '#f87171' : p.discountUtilization > 40 ? '#fbbf24' : '#22c55e'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="chart-clickable-hint">Click a bar to see discounted subscribers for that product</div>
        </ChartCard>
      </div>

      {/* Offer Codes */}
      <ChartCard title="Offer Code Leaderboard" subtitle="Most-used promotional codes by subscription count" style={{ marginBottom: '1rem' }}
        tooltip="Ranks promotional offer codes by how many active subscribers used them (deduplicated per investor), alongside the total ₹ discount each code has driven.">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart
            data={top10Codes}
            style={{ cursor: 'pointer' }}
            onClick={p => {
              if (!p?.activePayload?.[0]) return;
              const code = p.activePayload[0].payload?.code;
              if (!code) return;
              const rows = (currentMaster || []).filter(r => r['Offer Code'] === code).map(toRow);
              openDrilldown(`Subscribers — Offer Code "${code}"`, `${rows.length} subscriber(s) used offer code ${code}`, rows, subCols);
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
            <XAxis dataKey="code" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} angle={-25} textAnchor="end" height={45} />
            <YAxis yAxisId="left" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
            <YAxis yAxisId="right" orientation="right" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickFormatter={v => formatCurrency(v, true)} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar yAxisId="left" dataKey="count" name="Subscriptions" fill="#00d4ff" radius={[3, 3, 0, 0]} />
            <Bar yAxisId="right" dataKey="totalDiscount" name="Total Discount ₹" fill="#fbbf24" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <div className="chart-clickable-hint">Click a bar to see subscribers who used that offer code</div>
      </ChartCard>

      {/* Broker Bar Chart */}
      <ChartCard title="Total Discount by Broker" subtitle="Broker-wise discount spend — click a bar to see discounted subscribers" style={{ marginBottom: '1rem' }}
        tooltip="Total ₹ discount given to active subscribers acquired through each broker — highlights which distribution channels rely most heavily on discounting to close deals.">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart
            data={(discountByBroker || []).slice(0, 8)}
            layout="vertical"
            style={{ cursor: 'pointer' }}
            onClick={p => {
              if (!p?.activePayload?.[0]) return;
              const brokerName = p.activePayload[0].payload?.name;
              if (!brokerName) return;
              const rows = (currentMaster || []).filter(r => (r['Broker Name'] === brokerName || r['Broker'] === brokerName) && (r['Offer Discount'] > 0)).map(toRow);
              openDrilldown(`Discounted Subscribers — ${brokerName}`, `${rows.length} subscriber(s) with discount via ${brokerName}`, rows, subCols);
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
            <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickFormatter={v => formatCurrency(v, true)} />
            <YAxis dataKey="name" type="category" width={115} tick={<YAxisTick maxChars={14} />} />
            <Tooltip content={<CustomTooltip />} formatter={(v) => [formatCurrency(v), 'Total Discount']} />
            <Bar dataKey="totalDiscount" name="Total Discount" radius={[0, 4, 4, 0]}>
              {(discountByBroker || []).slice(0, 8).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="chart-clickable-hint">Click a bar to see discounted subscribers for that broker</div>
      </ChartCard>

      {/* Broker & State Discount */}
      <div className="charts-grid charts-grid-2" style={{ marginBottom: '1rem' }}>
        <ChartCard title="Discount by Broker" subtitle="Avg discount and utilization rate by distributor"
          tooltip="Per-broker discount profile: active subscriber count, their average non-zero discount, what % of them are on any discount, and the total ₹ discounted through this channel.">
          <div className="data-table-wrap" style={{ maxHeight: 300, overflowY: 'auto' }}>
            <table className="data-table">
              <thead><tr>
                <th>#</th><th>Broker</th><th style={{textAlign:'right'}}>Count</th>
                <th style={{textAlign:'right'}}>Avg Disc</th><th style={{textAlign:'right'}}>Utilization</th><th style={{textAlign:'right'}}>Total</th>
              </tr></thead>
              <tbody>
                {(discountByBroker || []).map((b, i) => (
                  <tr key={i}>
                    <td className="td-rank">{i+1}</td>
                    <td className="td-name">{b.name}</td>
                    <td className="td-num">{b.count?.toLocaleString()}</td>
                    <td className="td-warn">{formatCurrency(b.avgDiscount, true)}</td>
                    <td className={b.discountUtilization > 60 ? 'td-bad' : 'td-num'}>{b.discountUtilization}%</td>
                    <td className="td-warn">{formatCurrency(b.totalDiscount, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>

        <ChartCard title="Discount by State" subtitle="Geographic discount dependency analysis"
          tooltip="Per-state discount profile: active subscriber count, their average non-zero discount, and what % of a state's active subscribers are on a discounted plan.">
          <div className="data-table-wrap" style={{ maxHeight: 300, overflowY: 'auto' }}>
            <table className="data-table">
              <thead><tr>
                <th>#</th><th>State</th><th style={{textAlign:'right'}}>Count</th>
                <th style={{textAlign:'right'}}>Avg Disc</th><th style={{textAlign:'right'}}>Utilization</th>
              </tr></thead>
              <tbody>
                {(discountByState || []).slice(0, 15).map((s, i) => (
                  <tr key={i}>
                    <td className="td-rank">{i+1}</td>
                    <td className="td-name">{s.name}</td>
                    <td className="td-num">{s.count?.toLocaleString()}</td>
                    <td className="td-warn">{formatCurrency(s.avgDiscount, true)}</td>
                    <td className={s.discountUtilization > 60 ? 'td-bad' : 'td-num'}>{s.discountUtilization}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
      </div>

      <InsightsPanel insights={discountInsights} title="🤖 Pricing Intelligence — Discount & Offer Analysis" max={8} />

      <FAQSection items={[
        { q: 'What is this page for?',
          a: 'It shows how much you\'re giving away in discounts, who is getting them, and whether relying on discounts is helping or hurting. Use it to spot products, brokers or offer codes that lean too heavily on price cuts to win business.' },
        { q: 'Why might "Total Discount Given" not match the sum of the "Total Discount by Product" bars below it?',
          a: 'The top card adds up the discount on every active subscription row — so if one person holds 2 discounted products, both amounts are counted. The bars below it, on the other hand, first narrow each product down to one row per person (their most recent cycle) before adding up the discount. So the product-by-product total will usually come out a bit lower than the headline card — that\'s expected, not an error.' },
        { q: 'How is "Avg Discount" calculated — is it averaged across everyone?',
          a: 'No. It only averages the discount amount among active subscribers who actually have a discount greater than zero. People paying full price aren\'t included as a "0" in this average, which is why the number looks meaningfully higher than if you divided total discount by every subscriber.' },
        { q: 'What does "Discount Utilization" actually measure?',
          a: 'The percentage of currently active subscribers (counted once per person, even if they hold more than one product) who are on some kind of discounted plan. A higher number means more of your base needed a price break to sign up or stay — it\'s a signal of pricing power, not a bad thing on its own, but worth watching if it keeps climbing.' },
        { q: 'Why do some subscribers show a discount but no offer code, or vice versa?',
          a: 'A subscriber can have a discount amount recorded without ever entering a promotional code (e.g. a manually applied discount), and the "No Code" group is deliberately excluded from the Offer Code Leaderboard and the "Unique Offer Codes" count — only genuine, named promo codes are counted there.' },
        { q: 'How does the Period filter at the top affect this page?',
          a: 'It narrows every chart and KPI here to subscribers who were active at some point during the period you pick, not just people who started or got a discount in that window. If you don\'t set a period, you\'re seeing all currently active discounted subscribers regardless of when they joined.' },
        { q: 'What\'s the difference between the "Discount Analytics" tab and the "Offer Code ROI" tab next to it?',
          a: 'This tab (Discount Analytics) shows discount spend and dependency by product, broker and state. The "Offer Code ROI" tab goes one level deeper into each specific promo code, weighing the discount it cost against the retention or revenue it actually brought in — useful for deciding which codes to keep running.' },
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

export default memo(function Tab06Discount(props) {
  const [sub, setSub] = useState('discount');
  return (
    <>
      <SubTabBar
        tabs={[
          { id: 'discount', label: 'Discount Analytics', icon: '🏷️' },
          { id: 'roi', label: 'Offer Code ROI', icon: '🎟️' },
        ]}
        active={sub}
        onSelect={setSub}
      />
      {sub === 'discount' ? <DiscountContent {...props} /> : <Tab26OfferROI {...props} />}
    </>
  );
});
