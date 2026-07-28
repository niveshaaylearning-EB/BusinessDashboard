import { memo, useMemo, useState } from 'react';
import Tab21InvestorSearch from './Tab21_InvestorSearch';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import ChartCard from '../components/ChartCard';
import SortableKPIGrid from '../components/SortableKPIGrid';
import InsightsPanel from '../components/InsightsPanel';
import { formatCurrency, formatNumber } from '../dataEngine';
import TabDateFilter from '../components/TabDateFilter';
import DrilldownModal, { useDrilldown } from '../components/DrilldownModal';

const NW_COLORS = ['#475569', '#0ea5e9', '#22c55e', '#fbbf24', '#f97316'];
const PNL_COLORS = ['#f87171', '#94a3b8', '#22c55e', '#fbbf24'];

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

const PieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }) => {
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  if (percent < 0.04) return null;
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={10}>
      {(percent * 100).toFixed(0)}%
    </text>
  );
};

// NW bucket label -> [min, max) in rupees (max=Infinity for top bucket)
const NW_BUCKET_RANGES = {
  '< ₹5L':      [0,         500000],
  '₹5L-₹25L':   [500000,    2500000],
  '₹25L-₹1Cr':  [2500000,   10000000],
  '> ₹1Cr':     [10000000,  Infinity],
};

// PL bucket label -> [min, max) percentage
const PL_BUCKET_RANGES = {
  'Loss':         [-Infinity, 0],
  'Breakeven':    [0,         5],
  'Profitable':   [5,         25],
  'High Performers': [25,     Infinity],
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
  name:    r.Name || r.name || '—',
  pan:     String(r.PAN || '').trim().toUpperCase(),
  product: r['Smallcase Name'] || '—',
  broker:  r['Broker Name'] || r['Broker'] || '—',
  status:  r['Latest Subscription Status'] || '—',
  cycle:   r['Cycle Number'] || '—',
});

function InvestorContent({ investorSegments, currentMaster, insights, filters, setFilters }) {
  const { drilldown, open: openDrilldown, close: closeDrilldown } = useDrilldown();

  if (!investorSegments) return <div className="empty-state"><span className="empty-state-icon">💰</span><div>No investor data</div></div>;

  const onDateChange = (from, to) => setFilters(prev => ({ ...prev, dateFrom: from, dateTo: to }));

  const { networthData, pnlData } = investorSegments;
  const totalByNW = networthData.reduce((a, b) => a + b.count, 0);
  const totalByPnL = pnlData.reduce((a, b) => a + b.count, 0);

  const hniCount = networthData.filter(b => ['₹25L-₹1Cr', '> ₹1Cr'].includes(b.label)).reduce((a, b) => a + b.count, 0);
  const hniPct = totalByNW > 0 ? +(hniCount / totalByNW * 100).toFixed(1) : 0;
  const profitableCount = pnlData.filter(b => ['Profitable', 'High Performers'].includes(b.label)).reduce((a, b) => a + b.count, 0);
  const profitPct = totalByPnL > 0 ? +(profitableCount / totalByPnL * 100).toFixed(1) : 0;

  // --- Drilldown helpers ---

  const handleNWClick = (p) => {
    if (!p?.activePayload?.[0]) return;
    const data = p.activePayload[0].payload;
    const label = data.label;
    const range = NW_BUCKET_RANGES[label];

    let rows;
    if (range && Array.isArray(currentMaster) && currentMaster.length > 0) {
      const [lo, hi] = range;
      rows = currentMaster
        .filter(r => {
          const nw = Number(r['Networth'] || r['Net Worth'] || 0);
          return nw >= lo && nw < hi;
        })
        .map(toRow);
    }

    // Fallback: show chart summary row if no master data or no range found
    if (!rows || rows.length === 0) {
      rows = [{
        name: label,
        pan: '—',
        product: `Count: ${data.count ?? '—'}`,
        broker: `Avg Plan: ${data.avgPlanAmount != null ? formatCurrency(data.avgPlanAmount, true) : '—'}`,
        status: `Renewal: ${data.renewalRate != null ? data.renewalRate + '%' : '—'}`,
        cycle: '—',
      }];
    }

    openDrilldown(
      `Networth Bucket: ${label}`,
      `${rows.length} subscriber${rows.length !== 1 ? 's' : ''} in this networth tier`,
      rows,
      subCols
    );
  };

  const handlePLClick = (p) => {
    if (!p?.activePayload?.[0]) return;
    const data = p.activePayload[0].payload;
    const label = data.label;
    const range = PL_BUCKET_RANGES[label];

    let rows;
    if (range && Array.isArray(currentMaster) && currentMaster.length > 0) {
      const [lo, hi] = range;
      rows = currentMaster
        .filter(r => {
          const pl = Number(r['PnL'] || r['P&L'] || r['PL'] || r['Portfolio PnL'] || 0);
          return pl >= lo && pl < hi;
        })
        .map(toRow);
    }

    // Fallback: show chart summary row
    if (!rows || rows.length === 0) {
      rows = [{
        name: label,
        pan: '—',
        product: `Count: ${data.count ?? '—'}`,
        broker: `Avg Networth: ${data.avgNetworth != null ? formatCurrency(data.avgNetworth, true) : '—'}`,
        status: '—',
        cycle: '—',
      }];
    }

    openDrilldown(
      `PnL Bucket: ${label}`,
      `${rows.length} subscriber${rows.length !== 1 ? 's' : ''} in this PnL tier`,
      rows,
      subCols
    );
  };

  const investorInsights = useMemo(() => {
    const nwData = investorSegments?.networthData || [];
    const pnl = investorSegments?.pnlData || [];
    const total = nwData.reduce((s, t) => s + (t.count ?? 0), 0);
    const totalPnl = pnl.reduce((s, t) => s + (t.count ?? 0), 0);

    const isHNI = (label) => {
      const l = (label || '').toLowerCase();
      return l.includes('hni') || l.includes('1cr') || l.includes('crore') || label === '₹25L-₹1Cr' || label === '> ₹1Cr';
    };

    const hniTiers = nwData.filter(t => isHNI(t.label));
    const hniTotal = hniTiers.reduce((s, t) => s + (t.count ?? 0), 0);
    const hniPct = total > 0 ? +((hniTotal / total) * 100).toFixed(1) : 0;

    const sortedByRenewal = [...nwData].filter(t => (t.renewalRate ?? 0) > 0).sort((a, b) => (b.renewalRate ?? 0) - (a.renewalRate ?? 0));
    const bestRenewalTier = sortedByRenewal[0] || null;
    const worstRenewalTier = sortedByRenewal[sortedByRenewal.length - 1] || null;

    const profitTiers = pnl.filter(t => {
      const l = (t.label || '').toLowerCase();
      return l.includes('profit') || l.includes('positive') || l.includes('>0') || l.includes('high performer');
    });
    const profitCount = profitTiers.reduce((s, t) => s + (t.count ?? 0), 0);
    const profitPct = totalPnl > 0 ? +((profitCount / totalPnl) * 100).toFixed(1) : 0;

    const highestPlanTier = nwData.length > 0
      ? [...nwData].sort((a, b) => (b.avgPlanAmount ?? 0) - (a.avgPlanAmount ?? 0))[0]
      : null;

    const massTier = nwData.length > 0
      ? [...nwData].sort((a, b) => (b.count ?? 0) - (a.count ?? 0))[0]
      : null;

    const result = [];

    result.push({
      icon: '💎',
      category: 'HNI Base',
      title: `HNI Investors: ${hniTotal.toLocaleString('en-IN')} (${hniPct}% of base)`,
      detail: hniPct > 20
        ? `Strong HNI representation. High-value subscribers drive disproportionate revenue — protect this segment.`
        : hniPct > 10
        ? `Moderate HNI share at ${hniPct}%. Targeted campaigns can deepen penetration in this segment.`
        : `HNI share is low at ${hniPct}%. Explore referral programs and premium product positioning.`,
      color: hniPct > 20 ? '#22c55e' : hniPct > 10 ? '#fbbf24' : '#f87171',
    });

    if (bestRenewalTier && worstRenewalTier && bestRenewalTier.label !== worstRenewalTier.label) {
      result.push({
        icon: '🔄',
        category: 'Best Renewal Tier',
        title: `${bestRenewalTier.label} has best renewal rate (${bestRenewalTier.renewalRate}%)`,
        detail: `This tier renews most consistently — target similar profiles for acquisition to improve overall retention.`,
        color: '#22c55e',
      });

      result.push({
        icon: '📉',
        category: 'Weakest Renewal Tier',
        title: `${worstRenewalTier.label} has lowest renewal rate (${worstRenewalTier.renewalRate}%)`,
        detail: `Lowest renewal tier — consider re-engagement campaigns, satisfaction surveys, or tiered pricing for this segment.`,
        color: '#f87171',
      });
    }

    result.push({
      icon: '📈',
      category: 'Portfolio Profitability',
      title: `${profitPct}% of investors are profitable (${profitCount.toLocaleString('en-IN')} users)`,
      detail: profitPct > 60
        ? `Most subscribers have positive portfolio outcomes — strong validation for product quality and advisory value.`
        : profitPct > 40
        ? `Roughly half the base is profitable. Market conditions and product mix explain variance — monitor closely.`
        : `Less than half of investors show positive PnL. Consider enhanced content or strategy guidance to improve outcomes.`,
      color: profitPct > 60 ? '#22c55e' : profitPct > 40 ? '#fbbf24' : '#f87171',
    });

    if (highestPlanTier) {
      result.push({
        icon: '🏷️',
        category: 'Highest Plan Value',
        title: `${highestPlanTier.label} buys highest avg plan (${formatCurrency(highestPlanTier.avgPlanAmount, true)})`,
        detail: `This tier's purchasing power translates to the highest plan values — prioritize premium product development for them.`,
        color: '#fbbf24',
      });
    }

    if (hniPct > 20) {
      result.push({
        icon: '⭐',
        category: 'Acquisition Quality',
        title: 'High-quality acquisition base: HNI share exceeds 20%',
        detail: 'Over 1 in 5 subscribers is HNI-classified. This indicates strong brand positioning in premium investor segments.',
        color: '#22c55e',
      });
    }

    if (massTier) {
      result.push({
        icon: '👥',
        category: 'Mass Market Tier',
        title: `"${massTier.label}" is the largest subscriber group (${massTier.count.toLocaleString('en-IN')})`,
        detail: `This tier forms your volume base. Retention and upsell strategies here have the broadest revenue impact.`,
        color: '#22d3ee',
      });
    }

    return result;
  }, [investorSegments]);

  return (
    <div>
      <DrilldownModal drilldown={drilldown} onClose={closeDrilldown} />

      <div className="section-heading">
        <div><div className="section-title">💰 Investor Intelligence</div><div className="section-subtitle">Subscriber segmentation by networth and portfolio performance</div></div>
        <div className="section-divider" />
        <div className="section-badge">Wealth Segmentation</div>
      </div>
      <TabDateFilter dateFrom={filters?.dateFrom} dateTo={filters?.dateTo} onChange={onDateChange} />

      {/* KPIs */}
      <SortableKPIGrid storageKey="investor" cols="175px" cards={[
        { id: 'hni_count',    label: 'HNI Investors (>25L)',  value: formatNumber(hniCount),  accent: 'var(--accent-gold)',  icon: '💎', sub: `${hniPct}% of base` },
        { id: 'profitable',   label: 'Profitable Investors',  value: `${profitPct}%`,          accent: 'var(--accent-green)', icon: '📈', sub: formatNumber(profitableCount) + ' investors' },
        { id: 'hni_avg_plan', label: 'HNI Avg Plan',          value: formatCurrency(networthData.find(b => b.label === '> ₹1Cr')?.avgPlanAmount || 0, true), accent: 'var(--accent-gold)', icon: '🏷️' },
        { id: 'hni_renewal',  label: 'HNI Renewal Rate',      value: `${networthData.find(b => b.label === '> ₹1Cr')?.renewalRate || 0}%`, accent: 'var(--accent-teal)', icon: '🔄' },
      ]} />

      {/* Networth Distribution */}
      <div className="charts-grid charts-grid-2" style={{ marginBottom: '1rem' }}>
        <ChartCard title="Networth Bucket Distribution" subtitle="Click a bar to drill into subscribers — Subscriber count across networth tiers">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={networthData} onClick={handleNWClick} style={{ cursor: 'pointer' }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
              <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name="Subscribers" radius={[4, 4, 0, 0]}>
                {networthData.map((_, i) => <Cell key={i} fill={NW_COLORS[i % NW_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Networth Segment Share (Pie)" subtitle="Distribution of investors by networth bucket">
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={networthData} cx="50%" cy="50%" outerRadius={100} dataKey="count" nameKey="label" labelLine={false} label={<PieLabel />}>
                {networthData.map((_, i) => <Cell key={i} fill={NW_COLORS[i % NW_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v, n) => [v.toLocaleString() + ' investors', n]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Avg Plan by Networth */}
      <div className="charts-grid charts-grid-2" style={{ marginBottom: '1rem' }}>
        <ChartCard title="Avg Plan Amount by Networth Tier" subtitle="Click a bar to drill into subscribers — Higher networth → higher plan value correlation">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={networthData} onClick={handleNWClick} style={{ cursor: 'pointer' }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
              <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickFormatter={v => formatCurrency(v, true)} />
              <Tooltip content={<CustomTooltip />} formatter={(v) => [formatCurrency(v), 'Avg Plan Amount']} />
              <Bar dataKey="avgPlanAmount" name="Avg Plan" fill="#fbbf24" radius={[4, 4, 0, 0]}>
                {networthData.map((_, i) => <Cell key={i} fill={NW_COLORS[i % NW_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Renewal Rate by Networth Tier" subtitle="Click a bar to drill into subscribers — Do higher-networth investors renew more?">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={networthData} onClick={handleNWClick} style={{ cursor: 'pointer' }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
              <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} unit="%" domain={[0, 100]} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="renewalRate" name="Renewal %" radius={[4, 4, 0, 0]}>
                {networthData.map((p, i) => <Cell key={i} fill={p.renewalRate >= 40 ? '#22c55e' : p.renewalRate >= 20 ? '#fbbf24' : '#f87171'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* PnL Distribution */}
      <div className="charts-grid charts-grid-2" style={{ marginBottom: '1rem' }}>
        <ChartCard title="PnL Bucket Distribution" subtitle="Click a bar to drill into subscribers — % return on networth · Profitable = P&L > 5%">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={pnlData} onClick={handlePLClick} style={{ cursor: 'pointer' }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
              <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name="Investors" radius={[4, 4, 0, 0]}>
                {pnlData.map((_, i) => <Cell key={i} fill={PNL_COLORS[i % PNL_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="PnL Segment — Avg Networth" subtitle="Click a bar to drill into subscribers — Networth profile of each PnL tier">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={pnlData} onClick={handlePLClick} style={{ cursor: 'pointer' }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
              <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickFormatter={v => formatCurrency(v, true)} />
              <Tooltip content={<CustomTooltip />} formatter={(v) => [formatCurrency(v), 'Avg Networth']} />
              <Bar dataKey="avgNetworth" name="Avg Networth" fill="#a78bfa" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Networth Summary Table */}
      <ChartCard title="Investor Segment Comparison" subtitle="Full metrics matrix across all networth tiers">
        <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr>
              <th>Networth Tier</th>
              <th style={{textAlign:'right'}}>Investors</th>
              <th style={{textAlign:'right'}}>Avg Plan ₹</th>
              <th style={{textAlign:'right'}}>Renewal %</th>
              <th style={{textAlign:'right'}}>Avg PnL ₹</th>
            </tr></thead>
            <tbody>
              {networthData.map((b, i) => (
                <tr key={i}>
                  <td className="td-name">{b.label}</td>
                  <td className="td-num">{b.count?.toLocaleString()}</td>
                  <td className="td-num">{formatCurrency(b.avgPlanAmount, true)}</td>
                  <td className={b.renewalRate >= 40 ? 'td-good' : b.renewalRate >= 20 ? 'td-warn' : 'td-bad'}>{b.renewalRate}%</td>
                  <td className={b.avgPnL >= 0 ? 'td-good' : 'td-bad'}>{formatCurrency(b.avgPnL, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>

      <div style={{ marginTop: '1rem' }}>
        <InsightsPanel insights={investorInsights} title="🤖 Investor Intelligence — Portfolio & Segment Analysis" max={8} />
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

export default memo(function Tab07Investor(props) {
  const [sub, setSub] = useState('segments');
  return (
    <>
      <SubTabBar
        tabs={[
          { id: 'segments', label: 'Investor Segments', icon: '👥' },
          { id: 'search', label: 'Investor Search', icon: '🔍' },
        ]}
        active={sub}
        onSelect={setSub}
      />
      {sub === 'segments' ? <InvestorContent {...props} /> : <Tab21InvestorSearch rawData={props.currentMaster} />}
    </>
  );
});
