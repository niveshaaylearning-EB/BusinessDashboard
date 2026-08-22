import { memo, useState, useMemo } from 'react';
import Tab18MRR from './Tab18_MRR';
import SortableKPIGrid from '../components/SortableKPIGrid';
import InsightsPanel from '../components/InsightsPanel';
import TabDateFilter from '../components/TabDateFilter';
import {
  LineChart, Line, BarChart, Bar, ComposedChart, ReferenceLine, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import ChartCard from '../components/ChartCard';
import DrilldownModal, { useDrilldown } from '../components/DrilldownModal';
import { parseExcelDate } from '../dataEngine';

function fmtDate(d) {
  if (!d) return '';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtNum(n) {
  const v = Number(n);
  return isNaN(v) ? '—' : Math.round(v).toLocaleString('en-IN');
}

function fmtCr(n) {
  const v = Number(n);
  if (isNaN(v) || v === 0) return '₹0 Cr';
  const cr = v / 1e7;
  return `₹${cr >= 100 ? Math.round(cr).toLocaleString('en-IN') : cr.toFixed(2)} Cr`;
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-bright)', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
      <div style={{ color: 'var(--text-secondary)', marginBottom: 6 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, display: 'flex', gap: 10, justifyContent: 'space-between' }}>
          <span>{p.name}</span>
          <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{Number(p.value).toLocaleString('en-IN')}</span>
        </div>
      ))}
    </div>
  );
};

const COLUMNS = [
  { key: 'monthFull',                label: 'Month',                      fmt: v => v,          numeric: false },
  { key: 'aumCrores',                label: 'AUM (Cr)',                   fmt: v => `₹${Number(v).toFixed(2)} Cr`, numeric: true  },
  { key: 'totalActiveSubscriptions', label: 'Active Subscriptions',       fmt: fmtNum,          numeric: true  },
  { key: 'totalInvestors',           label: 'Total Investors',            fmt: fmtNum,          numeric: true  },
  { key: 'newSubscriptions',         label: 'New Subscriptions',          fmt: fmtNum,          numeric: true  },
  { key: 'newSignups',               label: 'New Signups',                fmt: fmtNum,          numeric: true  },
  { key: 'totalSignups',             label: 'Total Signups (Cumul.)',     fmt: fmtNum,          numeric: true  },
  { key: 'totalSubscriptionCycles',  label: 'Total Sub. Cycles (Cumul.)',fmt: fmtNum,          numeric: true  },
  { key: 'completedCycles',          label: 'Completed Cycles (Cumul.)', fmt: fmtNum,          numeric: true  },
];

function AUMContent({ summaryData, monthly, currentMaster, filters, setFilters }) {
  const [sortKey, setSortKey]   = useState('date');
  const [sortDir, setSortDir]   = useState(-1);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [search, setSearch]     = useState('');

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

  const onDateChange = (from, to) => setFilters(prev => ({ ...prev, dateFrom: from, dateTo: to }));

  if (!summaryData?.length) {
    return (
      <div className="empty-state">
        <span className="empty-state-icon">🏦</span>
        <div>No data available</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>Upload your subscription file to generate the AUM &amp; Summary timeline</div>
      </div>
    );
  }

  const aumInsights = useMemo(() => {
    if (!summaryData?.length) return [];
    const insights = [];
    const sorted = [...summaryData].sort((a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0));
    const latest = sorted[sorted.length - 1];

    // Peak AUM month
    const hasAUM = summaryData.some(r => r.aum > 0);
    if (hasAUM) {
      const peakRow = sorted.reduce((best, r) => (r.aumCrores > (best?.aumCrores || 0) ? r : best), null);
      if (peakRow) {
        insights.push({
          icon: '🏦',
          category: 'AUM',
          title: `Peak AUM — ${peakRow.monthFull}`,
          detail: `Highest recorded AUM at ₹${Number(peakRow.aumCrores).toFixed(2)} Cr`,
          color: '#fbbf24',
        });
      }
    }

    // Latest AUM vs 3 months ago
    if (hasAUM && sorted.length >= 4) {
      const prev3 = sorted[sorted.length - 4];
      const latestAUM = Number(latest.aumCrores) || 0;
      const prev3AUM = Number(prev3.aumCrores) || 0;
      if (prev3AUM > 0) {
        const growthPct = +((latestAUM - prev3AUM) / prev3AUM * 100).toFixed(1);
        const isUp = growthPct >= 0;
        insights.push({
          icon: isUp ? '📈' : '📉',
          category: 'AUM Trend',
          title: `AUM ${isUp ? 'Up' : 'Down'} ${Math.abs(growthPct)}% over 3 months`,
          detail: `${prev3.monthFull} ₹${prev3AUM.toFixed(2)} Cr → ${latest.monthFull} ₹${latestAUM.toFixed(2)} Cr`,
          color: isUp ? '#22c55e' : '#f87171',
        });
      }
    }

    // Month with highest new subscriptions
    const peakNewSubs = sorted.reduce((best, r) => ((r.newSubscriptions || 0) > (best?.newSubscriptions || 0) ? r : best), null);
    if (peakNewSubs && peakNewSubs.newSubscriptions > 0) {
      insights.push({
        icon: '🆕',
        category: 'Acquisition',
        title: `Best Acquisition Month — ${peakNewSubs.monthFull}`,
        detail: `${Number(peakNewSubs.newSubscriptions).toLocaleString('en-IN')} new subscriptions in that month`,
        color: '#22c55e',
      });
    }

    // Avg monthly new subscriptions
    const totalNewSubs = sorted.reduce((s, r) => s + (r.newSubscriptions || 0), 0);
    const avgNewSubs = sorted.length > 0 ? totalNewSubs / sorted.length : 0;
    if (avgNewSubs > 0) {
      insights.push({
        icon: '📊',
        category: 'Acquisition',
        title: `Avg ${Math.round(avgNewSubs).toLocaleString('en-IN')} new subscriptions / month`,
        detail: `Across ${sorted.length} months of data`,
        color: '#22d3ee',
      });
    }

    // Month with highest active subscriptions
    const peakActive = sorted.reduce((best, r) => ((r.totalActiveSubscriptions || 0) > (best?.totalActiveSubscriptions || 0) ? r : best), null);
    if (peakActive && peakActive.totalActiveSubscriptions > 0) {
      insights.push({
        icon: '✅',
        category: 'Active Base',
        title: `Peak Active Subscriptions — ${peakActive.monthFull}`,
        detail: `${Number(peakActive.totalActiveSubscriptions).toLocaleString('en-IN')} active subscriptions`,
        color: '#22d3ee',
      });
    }

    // AUM momentum — last 3 months all positive growth?
    if (hasAUM && sorted.length >= 4) {
      const last3 = sorted.slice(-3);
      const prev = sorted.slice(-4, -3)[0];
      const growthDirs = last3.map((r, i) => {
        const prevAUM = i === 0 ? Number(prev.aumCrores) : Number(last3[i - 1].aumCrores);
        return Number(r.aumCrores) - prevAUM;
      });
      const allPositive = growthDirs.every(d => d > 0);
      const allNegative = growthDirs.every(d => d < 0);
      if (allPositive) {
        insights.push({
          icon: '🚀',
          category: 'Momentum',
          title: 'Consistent AUM Growth — last 3 months',
          detail: 'AUM has increased every month for the last 3 months — positive momentum',
          color: '#22c55e',
        });
      } else if (allNegative) {
        insights.push({
          icon: '⚠️',
          category: 'Concern',
          title: 'AUM Declining — last 3 consecutive months',
          detail: 'AUM has fallen every month for the last 3 months — review subscriber exits',
          color: '#f87171',
        });
      }
    }

    // Total investors milestone
    const latestInvestors = Number(latest?.totalInvestors) || 0;
    if (latestInvestors > 0) {
      insights.push({
        icon: '👤',
        category: 'Investors',
        title: `${latestInvestors.toLocaleString('en-IN')} total investors as of ${latest.monthFull}`,
        detail: 'Unique investor PANs with active subscriptions in latest month',
        color: '#a78bfa',
      });
    }

    return insights;
  }, [summaryData]);

  // Filter
  const filtered = useMemo(() => {
    let rows = summaryData;
    // Append time so the string is parsed as LOCAL time, not UTC midnight
    if (dateFrom) rows = rows.filter(r => r.date >= new Date(dateFrom + 'T00:00:00'));
    if (dateTo)   rows = rows.filter(r => r.date <= new Date(dateTo   + 'T23:59:59'));
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(r => r.monthFull.toLowerCase().includes(q));
    }
    return rows;
  }, [summaryData, dateFrom, dateTo, search]);

  // Sort
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = sortKey === 'date' ? a.date?.getTime() || 0 : Number(a[sortKey]) || 0;
      const bv = sortKey === 'date' ? b.date?.getTime() || 0 : Number(b[sortKey]) || 0;
      return sortDir * (av - bv);
    });
  }, [filtered, sortKey, sortDir]);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => -d);
    else { setSortKey(key); setSortDir(-1); }
  };

  // Latest row for KPI cards
  const latest = [...summaryData].sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0))[0];

  // Chart data in chronological order (filtered)
  const chartData = useMemo(() =>
    [...filtered].sort((a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0))
      .map(r => ({ ...r, label: r.month }))
  , [filtered]);

  const hasAUM = summaryData.some(r => r.aum > 0);

  const latestKpiCards = latest ? [
    ...(hasAUM ? [{ id: 'aum', label: 'AUM (Active Subs)', value: `🏦 ${fmtCr(latest.aum)}`, accent: 'var(--accent-gold)', sub: `Latest month · ${latest.month}`,
      tooltip: 'Sum of AUM (or Networth if no AUM column exists) across every subscription active at the end of the latest month — the portfolio value currently under management.' }] : []),
    { id: 'active_subs',   label: 'Active Subscriptions',  value: `✅ ${fmtNum(latest.totalActiveSubscriptions)}`, accent: 'var(--accent-cyan)',   sub: `Deduped by Email+Scid · ${latest.month}`,
      tooltip: 'Count of active subscription records (deduplicated by Email+Scid) at the end of the latest month — an investor holding 2 products counts twice.' },
    { id: 'total_inv',     label: 'Total Investors',        value: `👤 ${fmtNum(latest.totalInvestors)}`,           accent: 'var(--accent-teal)',   sub: `Unique PANs active · ${latest.month}`,
      tooltip: 'Count of distinct investor PANs with at least one active subscription at the end of the latest month — each investor counts once regardless of how many products they hold.' },
    { id: 'new_subs',      label: 'New Subscriptions',      value: `🆕 ${fmtNum(latest.newSubscriptions)}`,         accent: 'var(--accent-green)',  sub: `New + Renewal starts · ${latest.month}`,
      tooltip: 'All subscription starts in the latest month — first-time signups plus renewals of an existing subscription.' },
    { id: 'new_signups',   label: 'New Signups',            value: `📝 ${fmtNum(latest.newSignups)}`,               accent: 'var(--accent-green)',  sub: `First-time (Cycle 1) · ${latest.month}`,
      tooltip: 'First-time subscriptions (Cycle 1) that started in the latest month — excludes renewals, so this isolates pure new-investor acquisition.' },
    { id: 'total_signups', label: 'Total Signups (Ever)',   value: `🧾 ${fmtNum(latest.totalSignups)}`,             accent: 'var(--accent-cyan)',   sub: 'Cumulative unique investors',
      tooltip: 'Running total of every distinct investor PAN that has ever subscribed, up to and including the latest month — never decreases.' },
    { id: 'total_cycles',  label: 'Total Sub. Cycles',      value: `🔢 ${fmtNum(latest.totalSubscriptionCycles)}`,  accent: 'var(--accent-teal)',   sub: 'Cumulative · deduped',
      tooltip: 'Running total of every distinct investor-product-cycle combination started up to the latest month — counts each renewal cycle once.' },
    { id: 'completed',     label: 'Completed Cycles',       value: `✔️ ${fmtNum(latest.completedCycles)}`,          accent: 'var(--accent-purple)', sub: 'Cumulative UNSUBSCRIBED',
      tooltip: 'Running total of subscription cycles that have reached UNSUBSCRIBED status by the latest month — cycles that ran their course, whether or not the investor later renewed.' },
  ] : [];

  return (
    <div>
      <DrilldownModal drilldown={drilldown} onClose={closeDrilldown} />
      {/* Header */}
      <div className="section-heading">
        <div>
          <div className="section-title">🏦 AUM & Summary Intelligence</div>
          <div className="section-subtitle">
            Monthly snapshots derived from subscription data · Email+Scid deduplication applied · {summaryData.length} months
          </div>
        </div>
        <div className="section-divider" />
        <div className="section-badge">{latest ? fmtDate(latest.date) : 'Latest'}</div>
      </div>
      <TabDateFilter dateFrom={filters?.dateFrom} dateTo={filters?.dateTo} onChange={onDateChange} />

      {/* KPI cards — latest month */}
      {latestKpiCards.length > 0 && <SortableKPIGrid storageKey="aumsummary" cards={latestKpiCards} />}

      {/* Charts */}
      {chartData.length > 1 && (
        <>
          <div className="charts-grid charts-grid-2" style={{ marginBottom: '1rem' }}>
            {hasAUM && (
              <ChartCard title="AUM Trend" subtitle="Sum of AUM / Networth for active subscribers each month" badge="AUM"
                tooltip="Total AUM (or Networth fallback) of every active subscription at the end of each month — a rising line means more assets are under management, a falling one means AUM is shrinking.">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
                    <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line type="monotone" dataKey="aumCrores" name="AUM (Cr)" stroke="#fbbf24" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
            )}
            <ChartCard title="Active Subscriptions & Investors" subtitle="Month-end active subscriber count and unique investor count" badge="Growth"
              tooltip="Active subscription records vs. distinct active investors at the end of each month — the gap between the two lines shows how many investors hold more than one product.">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
                  <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="totalActiveSubscriptions" name="Active Subs" stroke="#00d4ff" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="totalInvestors" name="Investors" stroke="#22c55e" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <div className="charts-grid charts-grid-2" style={{ marginBottom: '1rem' }}>
            <ChartCard title="New Subscriptions & Signups" subtitle="Monthly new starts (all cycles) and first-time signups (Cycle 1)" badge="Acquisition"
              tooltip="New Subscriptions counts every start in the month (first-time plus renewals); New Signups is the subset that are brand-new (Cycle 1) investors — the gap between the two bars is renewal volume.">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData}
                  style={{ cursor: 'pointer' }}
                  onClick={p => {
                    if (!p?.activePayload?.[0]) return;
                    const data = p.activePayload[0].payload;
                    const rows = master.filter(r => {
                      const d = parseExcelDate(r['Subscription Start Date']);
                      if (!d) return false;
                      // Match format used by getAUMSummaryTimeline: "Jan '24"
                      const mLabel = `${d.toLocaleString('default', { month: 'short' })} '${String(d.getFullYear()).slice(2)}`;
                      return mLabel === data.label || mLabel === data.month;
                    }).map(toRow);
                    openDrilldown(
                      `New Subscriptions — ${data.monthFull || data.label}`,
                      `${fmtNum(data.newSubscriptions)} new subs · ${fmtNum(data.newSignups)} first-time signups · ${rows.length} records found`,
                      rows, subCols
                    );
                  }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
                  <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="newSubscriptions" name="New Subscriptions" fill="#00d4ff" radius={[3,3,0,0]} />
                  <Bar dataKey="newSignups" name="New Signups" fill="#22c55e" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="chart-clickable-hint">💡 Click any bar/point to see details</div>
            </ChartCard>

            <ChartCard title="Cumulative Growth" subtitle="Running total of unique investors and subscription cycles over time" badge="Cumulative"
              tooltip="Running totals since inception — unique investors ever signed up, total subscription cycles started, and cycles that have completed (unsubscribed) — always non-decreasing by definition.">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
                  <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="totalSignups" name="Total Signups" stroke="#fbbf24" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="totalSubscriptionCycles" name="Total Cycles" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="completedCycles" name="Completed Cycles" stroke="#f87171" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </>
      )}

      {/* ── Subscriber vs Unsubscriber Analysis ── */}
      {monthly?.length > 0 && (() => {
        const last18 = monthly.slice(-18);
        const totalNew    = last18.reduce((s, r) => s + (r.new    || 0), 0);
        const totalExited = last18.reduce((s, r) => s + (r.exited || 0), 0);
        const totalNet    = totalNew - totalExited;
        return (
          <div style={{ marginBottom: '1.5rem' }}>
            <div className="section-heading" style={{ marginBottom: '0.75rem' }}>
              <div>
                <div className="section-title" style={{ fontSize: 14 }}>📊 Subscriber vs Unsubscriber Analysis</div>
                <div className="section-subtitle">Monthly new subscriptions vs exits · last 18 months · net growth direction</div>
              </div>
              <div className="section-divider" />
              <div style={{ display: 'flex', gap: 12 }}>
                <span style={{ fontSize: 12, color: 'var(--accent-green)', fontWeight: 600 }}>+{fmtNum(totalNew)} new</span>
                <span style={{ fontSize: 12, color: 'var(--accent-red)',   fontWeight: 600 }}>−{fmtNum(totalExited)} exited</span>
                <span style={{ fontSize: 12, color: totalNet >= 0 ? 'var(--accent-teal)' : 'var(--accent-red)', fontWeight: 600 }}>
                  {totalNet >= 0 ? '+' : ''}{fmtNum(totalNet)} net
                </span>
              </div>
            </div>

            <div className="charts-grid charts-grid-2" style={{ marginBottom: '1rem' }}>
              <ChartCard title="New vs Exited — Monthly" subtitle="Side-by-side comparison of subscriptions started vs ended each month" badge="Flow"
                tooltip="Subscriptions that started vs. subscriptions that ended in each of the last 18 months — an exit only counts here once the investor fails to renew within the 15-day grace period, so short payment delays aren't mistaken for churn.">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={last18} barGap={2}
                    style={{ cursor: 'pointer' }}
                    onClick={p => {
                      if (!p?.activePayload?.[0]) return;
                      const data = p.activePayload[0].payload;
                      const clickedSeries = p.activePayload[0].dataKey;
                      const rows = master.filter(r => {
                        const d = parseExcelDate(r['Subscription Start Date']);
                        if (!d) return false;
                        const mLabel = `${d.toLocaleString('default', { month: 'short' })} '${String(d.getFullYear()).slice(2)}`;
                        return mLabel === data.month;
                      }).map(toRow);
                      const label = clickedSeries === 'exited' ? 'Exits' : 'New Subs';
                      openDrilldown(
                        `${label} — ${data.month}`,
                        `${rows.length} subscriber records for ${data.month}`,
                        rows, subCols
                      );
                    }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
                    <XAxis dataKey="month" tick={{ fill: 'var(--text-muted)', fontSize: 9 }} interval={1} />
                    <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="new"    name="New Subs"  fill="#22c55e" radius={[3,3,0,0]} />
                    <Bar dataKey="exited" name="Exited"    fill="#f87171" radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="chart-clickable-hint">💡 Click any bar/point to see details</div>
              </ChartCard>

              <ChartCard title="Net Growth per Month" subtitle="New minus Exited — positive = net gain, negative = net loss" badge="Net"
                tooltip="New minus Exited for each month — green bars above zero mean the base grew that month, red bars below zero mean more subscriptions ended than began.">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={last18}
                    style={{ cursor: 'pointer' }}
                    onClick={p => {
                      if (!p?.activePayload?.[0]) return;
                      const data = p.activePayload[0].payload;
                      const rows = master.filter(r => {
                        const d = parseExcelDate(r['Subscription Start Date']);
                        if (!d) return false;
                        const mLabel = `${d.toLocaleString('default', { month: 'short' })} '${String(d.getFullYear()).slice(2)}`;
                        return mLabel === data.month;
                      }).map(toRow);
                      openDrilldown(
                        `Net Growth — ${data.month}`,
                        `Net ${data.net >= 0 ? '+' : ''}${data.net} · ${rows.length} subscriber records for this month`,
                        rows, subCols
                      );
                    }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
                    <XAxis dataKey="month" tick={{ fill: 'var(--text-muted)', fontSize: 9 }} interval={1} />
                    <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <ReferenceLine y={0} stroke="var(--border-bright)" strokeWidth={1.5} />
                    <Bar dataKey="net" name="Net Growth" radius={[3,3,0,0]}>
                      {last18.map((entry, idx) => (
                        <Cell key={idx} fill={entry.net >= 0 ? '#22c55e' : '#f87171'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="chart-clickable-hint">💡 Click any bar/point to see details</div>
              </ChartCard>
            </div>

            <div className="charts-grid charts-grid-1" style={{ marginBottom: '1rem' }}>
              <ChartCard title="Active Subscriber Trend vs Monthly Exits" subtitle="Closing active count (left) overlaid with exit volume per month (right)" badge="Trend"
                tooltip="Line shows the month-end active subscription count (left axis) overlaid with the volume of exits that month (right axis) — helps spot whether exit spikes actually dent the active base or get absorbed by new growth.">
                <ResponsiveContainer width="100%" height={220}>
                  <ComposedChart data={last18}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
                    <XAxis dataKey="month" tick={{ fill: 'var(--text-muted)', fontSize: 9 }} interval={1} />
                    <YAxis yAxisId="left"  tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line yAxisId="left"  type="monotone" dataKey="closing" name="Active Subs" stroke="#00d4ff" strokeWidth={2} dot={false} />
                    <Bar  yAxisId="right" dataKey="exited" name="Exits"      fill="#f8717155" radius={[3,3,0,0]} />
                  </ComposedChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          </div>
        );
      })()}

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>From</span>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-dim)', borderRadius: 6, color: 'var(--text-primary)', padding: '4px 8px', fontSize: 12 }} />
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>To</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-dim)', borderRadius: 6, color: 'var(--text-primary)', padding: '4px 8px', fontSize: 12 }} />
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo(''); }}
              style={{ background: 'none', border: '1px solid var(--border-dim)', borderRadius: 6, color: 'var(--text-muted)', padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}>
              Clear
            </button>
          )}
        </div>
        <input
          placeholder="Search month..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-dim)', borderRadius: 6, color: 'var(--text-primary)', padding: '4px 10px', fontSize: 12, minWidth: 160 }}
        />
        <span style={{ color: 'var(--text-muted)', fontSize: 12, marginLeft: 'auto' }}>
          {sorted.length} of {summaryData.length} months
        </span>
      </div>

      {/* Table */}
      <div className="data-table-wrap" style={{ maxHeight: 520, overflowY: 'auto', overflowX: 'auto' }}>
        <table className="data-table" style={{ minWidth: 1000 }}>
          <thead>
            <tr>
              <th onClick={() => handleSort('date')} style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>
                Month {sortKey === 'date' ? (sortDir === 1 ? '↑' : '↓') : ''}
              </th>
              {COLUMNS.filter(c => c.key !== 'monthFull' && (c.key !== 'aumCrores' || hasAUM)).map(col => (
                <th key={col.key} onClick={() => handleSort(col.key)} style={{ cursor: 'pointer', whiteSpace: 'nowrap', ...(col.numeric && { textAlign: 'right' }) }}>
                  {col.label} {sortKey === col.key ? (sortDir === 1 ? '↑' : '↓') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr key={i}>
                <td className="td-name" style={{ whiteSpace: 'nowrap' }}>{row.monthFull}</td>
                {COLUMNS.filter(c => c.key !== 'monthFull' && (c.key !== 'aumCrores' || hasAUM)).map(col => (
                  <td key={col.key} className="td-num" style={{ whiteSpace: 'nowrap' }}>
                    {col.fmt(row[col.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {aumInsights.length > 0 && (
        <InsightsPanel insights={aumInsights} title="🤖 AUM Intelligence — Growth & Subscription Trends" max={8} />
      )}
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

export default memo(function Tab13AUMSummary(props) {
  const [sub, setSub] = useState('aum');
  return (
    <>
      <SubTabBar tabs={[{id:'aum',label:'AUM & Summary',icon:'🏦'},{id:'mrr',label:'MRR / ARR',icon:'💵'}]} active={sub} onSelect={setSub} />
      {sub === 'aum' ? <AUMContent {...props} /> : <Tab18MRR {...props} />}
    </>
  );
});
