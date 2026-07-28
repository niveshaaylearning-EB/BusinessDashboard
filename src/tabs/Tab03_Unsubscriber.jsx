import { memo, useState, useMemo, useCallback } from 'react';
import { FixedSizeList } from 'react-window';
import SortableKPIGrid from '../components/SortableKPIGrid';
import InsightsPanel from '../components/InsightsPanel';
import TabDateFilter from '../components/TabDateFilter';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Cell,
} from 'recharts';
import ChartCard from '../components/ChartCard';
import { YAxisTick } from '../components/YAxisTick';
import { parseExcelDate, getUnsubscriberAnalysis, filterRawByExitDate } from '../dataEngine';
import DrilldownModal, { useDrilldown } from '../components/DrilldownModal';

const ROW_HEIGHT = 42;
const LIST_HEIGHT = 480;

const COLS = [
  { key: 'name',          label: 'Name',                width: 160, align: 'left' },
  { key: 'product',       label: 'Product',             width: 140, align: 'left' },
  { key: 'cycle',         label: 'Cycle',               width: 70,  align: 'right' },
  { key: 'exitDate',      label: 'Exit Date',           width: 100, align: 'right' },
  { key: 'startDate',     label: 'First Sub Date',      width: 110, align: 'right' },
  { key: 'plan',          label: 'Plan Amount',         width: 110, align: 'right' },
  { key: 'pnl',           label: 'P&L at Exit',         width: 120, align: 'right' },
  { key: 'currentStatus', label: 'Current Status',      width: 110, align: 'center' },
  { key: 'broker',        label: 'Broker',              width: 130, align: 'left' },
  { key: 'state',         label: 'State',               width: 100, align: 'left' },
  { key: 'reason',        label: 'Cancellation Reason', width: 200, align: 'left' },
];
const TABLE_WIDTH = COLS.reduce((s, c) => s + c.width, 0);

function fmt(v) {
  const n = Number(v);
  return isNaN(n) || !v ? '—' : Math.round(n).toLocaleString('en-IN');
}
function fmtDate(val) {
  const d = val instanceof Date ? val : parseExcelDate(val);
  if (!d) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtCurrency(v) {
  const n = Number(v);
  if (!n) return '—';
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}
function fmtPL(v) {
  const n = Number(v);
  if (isNaN(n)) return '—';
  if (n === 0) return '₹0';
  const abs = Math.abs(Math.round(n)).toLocaleString('en-IN');
  return n > 0 ? `+₹${abs}` : `-₹${abs}`;
}
function fmtPLShort(v) {
  const n = Number(v);
  if (isNaN(n)) return '—';
  const sign = n >= 0 ? '+' : '-';
  const abs = Math.abs(n);
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(1)}Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(1)}L`;
  if (abs >= 1e3) return `${sign}₹${(abs / 1e3).toFixed(0)}K`;
  return `${sign}₹${Math.round(abs).toLocaleString('en-IN')}`;
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

const PRODUCT_COLORS = ['#f87171','#fb923c','#fbbf24','#a3e635','#34d399','#22d3ee','#818cf8','#e879f9'];

const PL_BUCKET_COLORS = {
  '< -5L':      '#991b1b',
  '-5L to -1L': '#dc2626',
  '-1L to 0':   '#f87171',
  'Break-even': '#94a3b8',
  '0 to 1L':    '#34d399',
  '1L to 5L':   '#22c55e',
  '> 5L':       '#15803d',
};

export default memo(function Tab03Unsubscriber({ unsubData, rawData }) {
  const [search, setSearch]               = useState('');
  const [sortKey, setSortKey]             = useState('exitDate');
  const [sortDir, setSortDir]             = useState(-1);
  const [filterProduct, setFilterProduct] = useState('');
  const [filterBroker, setFilterBroker]   = useState('');
  const [exitFrom, setExitFrom] = useState(null);
  const [exitTo,   setExitTo]   = useState(null);
  const { drilldown, open: openDrilldown, close: closeDrilldown } = useDrilldown();

  // When a local exit-date filter is active, recompute from rawData so the
  // Unsubscriber tab can be filtered independently of the global date filter.
  const activeUnsub = useMemo(() => {
    if (!exitFrom && !exitTo) return unsubData;
    if (!rawData?.length)     return unsubData;
    return getUnsubscriberAnalysis(
      filterRawByExitDate(rawData, { dateFrom: exitFrom, dateTo: exitTo })
    );
  }, [unsubData, rawData, exitFrom, exitTo]);

  if (!activeUnsub) return (
    <div className="empty-state">
      <span className="empty-state-icon">🚪</span>
      <div>No data loaded</div>
    </div>
  );

  const {
    exits, kpis, byProduct, byCycle, byBroker, byState,
    monthlyTrend, reasons, winBackDetails = [], shortReturnDetails = [],
    plAnalysis = {}, uniqueClientPL = {}, currentStatusLookup = {},
    pnlKey = 'Total PnL', bestPLLookup = {},
  } = activeUnsub;

  // Table: enrich rows with display-ready fields including P&L and current status.
  // P&L is read from the detected column name (pnlKey). If the exit row itself has
  // blank P&L (common — P&L is a live metric only updated on active rows), fall back
  // to bestPLLookup which holds the last known non-zero P&L for that subscriber.
  const tableRows = useMemo(() => exits.map(r => {
    const email = String(r['Email']          || '').trim().toLowerCase();
    const scid  = String(r['Scid']           || '').trim();
    const pan   = String(r['PAN']            || '').trim().toUpperCase();
    const sc    = String(r['Smallcase Name'] || '').trim();
    const bk    = (email && scid) ? `${email}|||${scid}` : `${pan}|||${sc}`;
    return {
      name:          String(r['User Name']            || '').trim(),
      email,
      pan,
      product:       String(r['Smallcase Name']       || '').trim(),
      cycle:         Number(r['Cycle Number'])         || 0,
      exitDate:      parseExcelDate(r['Cycle End Date']),
      startDate:     parseExcelDate(r['First Subscription Date'] || r['Subscription Start Date']),
      broker:        String(r['Broker Name']           || '').trim(),
      state:         String(r['State']                 || '').trim(),
      plan:          Number(r['Plan Amount'])           || 0,
      reason:        String(r['Cancellation Reason']   || '').trim(),
      pnl:           Number(r[pnlKey]) || bestPLLookup[bk] || 0,
      currentStatus: currentStatusLookup[bk]           || 'Unsubscribed',
    };
  }), [exits, pnlKey, bestPLLookup, currentStatusLookup]);

  const products = useMemo(() => ['', ...byProduct.map(p => p.product)], [byProduct]);
  const brokers  = useMemo(() => ['', ...byBroker.map(b => b.broker)], [byBroker]);

  const l3mCutoff = useMemo(() => { const d = new Date(); d.setMonth(d.getMonth() - 3); d.setHours(0,0,0,0); return d; }, []);
  const l3mExitedPANs = useMemo(() => {
    const s = new Set();
    tableRows.forEach(r => { if (r.pan && r.exitDate && r.exitDate >= l3mCutoff) s.add(r.pan); });
    return s.size;
  }, [tableRows, l3mCutoff]);
  const l3mWinBacks = useMemo(() =>
    winBackDetails.filter(r => r.exitDate && r.exitDate >= l3mCutoff).length,
    [winBackDetails, l3mCutoff]
  );
  const l3mWinBackRate = l3mExitedPANs > 0
    ? ((l3mWinBacks / l3mExitedPANs) * 100).toFixed(1) : '0.0';

  // Filter
  const filtered = useMemo(() => {
    let rows = tableRows;
    if (filterProduct) rows = rows.filter(r => r.product === filterProduct);
    if (filterBroker)  rows = rows.filter(r => r.broker  === filterBroker);
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        (r.name||'').toLowerCase().includes(q) || (r.email||'').toLowerCase().includes(q) ||
        (r.pan||'').toLowerCase().includes(q)  || (r.product||'').toLowerCase().includes(q) ||
        (r.broker||'').toLowerCase().includes(q) || (r.state||'').toLowerCase().includes(q) ||
        (r.reason||'').toLowerCase().includes(q)
      );
    }
    return rows;
  }, [tableRows, filterProduct, filterBroker, search]);

  // Sort
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av, bv;
      if (sortKey === 'exitDate')  { av = a.exitDate?.getTime()  || 0; bv = b.exitDate?.getTime()  || 0; }
      else if (sortKey === 'startDate') { av = a.startDate?.getTime() || 0; bv = b.startDate?.getTime() || 0; }
      else if (sortKey === 'cycle') { av = a.cycle; bv = b.cycle; }
      else if (sortKey === 'plan')  { av = a.plan;  bv = b.plan; }
      else if (sortKey === 'pnl')   { av = a.pnl;   bv = b.pnl; }
      else { av = String(a[sortKey] || ''); bv = String(b[sortKey] || ''); return sortDir * av.localeCompare(bv); }
      return sortDir * (av - bv);
    });
  }, [filtered, sortKey, sortDir]);

  const handleSort = useCallback((key) => {
    if (sortKey === key) setSortDir(d => -d);
    else { setSortKey(key); setSortDir(-1); }
  }, [sortKey]);

  const VirtualRow = useCallback(({ index, style }) => {
    const row = sorted[index];
    const pnlColor = row.pnl > 0 ? '#22c55e' : row.pnl < 0 ? '#f87171' : 'var(--text-muted)';
    const isActive = row.currentStatus === 'Active';
    return (
      <div style={{ ...style, display: 'flex', alignItems: 'center', width: TABLE_WIDTH,
        borderBottom: '1px solid var(--border-dim)',
        background: index % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
      }}>
        <div style={{ width: 160, padding: '0 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: 'var(--text-primary)', fontWeight: 500 }}>
          {row.name || row.email || row.pan || '—'}
        </div>
        <div style={{ width: 140, padding: '0 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, color: 'var(--text-secondary)' }}>
          {row.product || '—'}
        </div>
        <div style={{ width: 70, padding: '0 8px', textAlign: 'right', fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
          C{row.cycle || 1}
        </div>
        <div style={{ width: 100, padding: '0 8px', textAlign: 'right', fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
          {fmtDate(row.exitDate)}
        </div>
        <div style={{ width: 110, padding: '0 8px', textAlign: 'right', fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          {fmtDate(row.startDate)}
        </div>
        <div style={{ width: 110, padding: '0 8px', textAlign: 'right', fontSize: 11, fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
          {fmtCurrency(row.plan)}
        </div>
        <div style={{ width: 120, padding: '0 8px', textAlign: 'right', fontSize: 12, fontFamily: 'monospace', fontWeight: 600, color: pnlColor, whiteSpace: 'nowrap' }}>
          {fmtPL(row.pnl)}
        </div>
        <div style={{ width: 110, padding: '0 8px', textAlign: 'center' }}>
          <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 8, fontWeight: 600,
            background: isActive ? '#22c55e22' : '#94a3b822',
            color: isActive ? '#22c55e' : '#94a3b8',
          }}>
            {isActive ? '✅ Active' : '🚪 Exited'}
          </span>
        </div>
        <div style={{ width: 130, padding: '0 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, color: 'var(--text-muted)' }}>
          {row.broker || '—'}
        </div>
        <div style={{ width: 100, padding: '0 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, color: 'var(--text-muted)' }}>
          {row.state || '—'}
        </div>
        <div style={{ width: 200, padding: '0 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, color: 'var(--text-muted)' }}>
          {row.reason || '—'}
        </div>
      </div>
    );
  }, [sorted]);

  const last12Months = monthlyTrend.slice(-12);
  const hasReasons   = reasons.length > 0;
  const hasPLData    = plAnalysis.byBucket?.some(b => b.count > 0);

  // P&L avg color
  const avgPL = plAnalysis.avgPLAtExit || 0;
  const avgPLColor = avgPL > 0 ? 'var(--accent-green)' : avgPL < 0 ? '#f87171' : 'var(--text-muted)';

  // AI Insights — derived from all unsubscriber dimensions
  const unsubInsights = useMemo(() => {
    const n = kpis.totalExits;
    if (!n) return [];
    const items = [];

    // 1. Top exit basket
    if (byProduct.length > 0) {
      const top = byProduct[0];
      items.push({
        icon: '🎯', category: 'Top Exit Basket', color: '#f87171',
        title: `"${top.product}" drives ${top.pct}% of all exits`,
        detail: `${top.count.toLocaleString('en-IN')} exit cycles from this basket alone.` +
                (byProduct[1] ? ` Next highest: "${byProduct[1].product}" at ${byProduct[1].pct}%.` : ''),
      });
    }

    // 2. Exit trend — last 3M vs prior 3M
    if (monthlyTrend.length >= 6) {
      const last3 = monthlyTrend.slice(-3).reduce((s, m) => s + m.count, 0);
      const prev3 = monthlyTrend.slice(-6, -3).reduce((s, m) => s + m.count, 0);
      const diff  = prev3 > 0 ? +((last3 - prev3) / prev3 * 100).toFixed(1) : 0;
      const label = diff > 10 ? 'rising ▲ — churn is accelerating' :
                    diff < -10 ? 'falling ▼ — retention is improving' : 'stable →';
      items.push({
        icon: diff > 10 ? '⚠️' : diff < -10 ? '✅' : '📊',
        category: 'Exit Trend',
        color: diff > 10 ? '#f87171' : diff < -10 ? '#22c55e' : '#94a3b8',
        title: `Monthly exits are ${label} (${diff > 0 ? '+' : ''}${diff}% vs prior 3 months)`,
        detail: `Last 3 months: ${last3.toLocaleString('en-IN')} exits vs ${prev3.toLocaleString('en-IN')} in the 3 months before.`,
      });
    }

    // 3. Peak exit month
    if (monthlyTrend.length > 0) {
      const peak = [...monthlyTrend].sort((a, b) => b.count - a.count)[0];
      items.push({
        icon: '📅', category: 'Peak Exit Month', color: '#fbbf24',
        title: `"${peak.label}" had the highest exits — ${peak.count.toLocaleString('en-IN')} unsubscriptions`,
        detail: `Cycle 1 exits: ${peak.c1.toLocaleString('en-IN')}, Cycle 2+ exits: ${peak.cPlus.toLocaleString('en-IN')}. ` +
                (peak.c1 > peak.cPlus ? 'First-time exits dominated this spike.' : 'Returning subscribers drove this spike.'),
      });
    }

    // 4. Top cancellation reason
    if (reasons.length > 0) {
      const top = reasons[0];
      items.push({
        icon: '💬', category: 'Top Cancellation Reason', color: '#a78bfa',
        title: `"${top.reason}" is cited by ${top.pct}% of subscribers as the exit reason`,
        detail: `${top.count.toLocaleString('en-IN')} subscribers gave this reason.` +
                (reasons[1] ? ` Second most common: "${reasons[1].reason}" (${reasons[1].pct}%).` : ''),
      });
    }

    // 5. P&L exit pattern
    if (kpis.pctNegativeExits > 0 || kpis.pctPositiveExits > 0) {
      const dominant = kpis.pctNegativeExits >= kpis.pctPositiveExits ? 'loss' : 'profit';
      items.push({
        icon: dominant === 'loss' ? '📉' : '📈',
        category: 'P&L at Exit',
        color: dominant === 'loss' ? '#f87171' : '#22c55e',
        title: `${kpis.pctNegativeExits}% exited in loss (avg ${fmtPLShort(kpis.avgNegativePL)}), ${kpis.pctPositiveExits}% exited in profit (avg ${fmtPLShort(kpis.avgPositivePL)})`,
        detail: `Overall avg P&L at exit: ${fmtPLShort(kpis.avgPLAtExit)}. ` +
                (dominant === 'loss'
                  ? 'Majority left while in a losing position — investigate strategy performance and expectation alignment.'
                  : 'Majority left while in profit — they may have taken gains and moved on.'),
      });
    }

    // 6. Worst-performing basket at exit (P&L)
    if (plAnalysis.byProduct?.length > 0) {
      const worst = [...plAnalysis.byProduct].sort((a, b) => a.avgPL - b.avgPL)[0];
      if (worst.avgPL < 0) {
        items.push({
          icon: '🚨', category: 'High-Loss Basket', color: '#991b1b',
          title: `"${worst.product}" has the worst avg exit P&L: ${fmtPLShort(worst.avgPL)}`,
          detail: `${worst.count.toLocaleString('en-IN')} exits from this basket averaged ${fmtPLShort(worst.avgPL)} P&L. ` +
                  'Subscribers leaving with heavy losses signal potential strategy underperformance.',
        });
      }
      const best = plAnalysis.byProduct[0];
      if (best.avgPL > 0) {
        items.push({
          icon: '💚', category: 'High-Profit Exit Basket', color: '#15803d',
          title: `"${best.product}" exits had the best avg P&L: ${fmtPLShort(best.avgPL)}`,
          detail: `${best.count.toLocaleString('en-IN')} exits averaged ${fmtPLShort(best.avgPL)} P&L. ` +
                  'Subscribers may be profit-booking — consider retention nudges at milestone gains.',
        });
      }
    }

    // 7. First-time vs multi-cycle
    const c1Rate = +((kpis.cycle1Exits / n) * 100).toFixed(1);
    items.push({
      icon: c1Rate > 60 ? '⚡' : '🔄',
      category: 'Cycle at Exit',
      color: c1Rate > 60 ? '#fbbf24' : '#22d3ee',
      title: c1Rate > 60
        ? `${c1Rate}% of exits happen on Cycle 1 — subscribers leaving before their first renewal`
        : `${(100 - c1Rate).toFixed(1)}% of exits are Cycle 2+ — subscribers who renewed at least once before leaving`,
      detail: `${kpis.cycle1Exits.toLocaleString('en-IN')} first-time exits vs ${kpis.multiCycleExits.toLocaleString('en-IN')} multi-cycle exits. Avg cycle at exit: ${kpis.avgCycleAtExit}. ` +
              (c1Rate > 60 ? 'Focus on improving first-cycle experience and value demonstration.' : 'Focus on long-term retention and renewal incentives.'),
    });

    // 8. Tenure
    if (kpis.avgTenureMonths > 0) {
      const t = kpis.avgTenureMonths;
      const label = t < 3 ? 'very short (<3 months)' : t < 6 ? 'short (3–6 months)' : t < 12 ? 'moderate (6–12 months)' : `long (${t} months)`;
      items.push({
        icon: '⏳', category: 'Tenure at Exit', color: '#a78bfa',
        title: `Avg tenure before exit: ${t} months — ${label} engagement`,
        detail: t < 6
          ? 'Early exits suggest onboarding or product-market fit issues. Focus on first 6-month experience.'
          : t < 12
          ? 'Subscribers engage for several months before leaving. Investigate what triggers the decision to exit.'
          : 'Long-tenure exits are harder to prevent but often involve major life or market events.',
      });
    }

    // 9. Top broker exits
    if (byBroker.length > 0) {
      const topB = byBroker[0];
      items.push({
        icon: '🤝', category: 'Broker Exit Concentration', color: '#fb923c',
        title: `"${topB.broker}" accounts for ${topB.pct}% of all exits`,
        detail: `${topB.count.toLocaleString('en-IN')} exits via this broker.` +
                (byBroker[1] ? ` Next: "${byBroker[1].broker}" (${byBroker[1].pct}%).` : '') +
                ' High concentration may indicate platform-specific issues or an engaged but churny user cohort.',
      });
    }

    // 10. Geography
    if (byState.length > 0) {
      const topS   = byState[0];
      const topPct = +((topS.count / n) * 100).toFixed(1);
      items.push({
        icon: '🗺️', category: 'Geographic Exit Hotspot', color: '#22d3ee',
        title: `${topS.state} is the top exit state with ${topPct}% of all exits (${topS.count.toLocaleString('en-IN')} exits)`,
        detail: byState[1]
          ? `#2: ${byState[1].state} (${+((byState[1].count / n) * 100).toFixed(1)}%). Geo concentration may reflect regional market conditions or distributor dynamics.`
          : 'Consider region-specific retention strategies.',
      });
    }

    // 11. Win-back
    if (kpis.winBacks > 0) {
      items.push({
        icon: '🔄', category: 'Win-Back Signal', color: '#34d399',
        title: `${kpis.winBackRate}% of exited investors have returned after >30 days`,
        detail: `${kpis.winBacks.toLocaleString('en-IN')} subscribers re-subscribed. ` +
                'This signals strong product value even after churn. Focus win-back campaigns on recent 3-month exits.',
      });
    }

    return items;
  }, [kpis, byProduct, byBroker, byState, monthlyTrend, reasons, plAnalysis]);

  const unsubKpiCards = [
    { id: 'totalExits',      label: 'Total Exit Cycles',       icon: '🚪', accent: 'var(--accent-red)',    value: fmt(kpis.totalExits),         sub: 'Deduped by Email+Scid+Cycle' },
    { id: 'uniqueInvestors', label: 'Unique Exited Investors', icon: '👤', accent: 'var(--accent-orange)', value: fmt(kpis.uniqueInvestors),     sub: 'Unique PANs who exited' },
    { id: 'cycle1Exits',     label: 'First-Time Exits',        icon: '⚡', accent: 'var(--accent-red)',    value: fmt(kpis.cycle1Exits),         sub: 'Exited on Cycle 1 (never renewed)' },
    { id: 'multiCycleExits', label: 'Multi-Cycle Exits',       icon: '🔄', accent: 'var(--accent-teal)',   value: fmt(kpis.multiCycleExits),     sub: 'Exited after Cycle 2+ (renewed before leaving)' },
    { id: 'avgCycleAtExit',  label: 'Avg Cycle at Exit',       icon: '📊', accent: 'var(--accent-cyan)',   value: kpis.avgCycleAtExit,           sub: 'Average cycle number on exit' },
    { id: 'avgTenure',       label: 'Avg Tenure at Exit',      icon: '⏳', accent: 'var(--accent-purple)', value: `${kpis.avgTenureMonths} mo`,  sub: 'Avg months from first sub to exit' },
    { id: 'avgPLAtExit',     label: 'Avg P&L at Exit',         icon: '💹', accent: avgPLColor,             value: fmtPLShort(avgPL),             sub: 'Avg Total P&L when subscriber exited' },
    { id: 'exitedInProfit',  label: 'Exited in Profit',        icon: '📈', accent: 'var(--accent-green)',  value: `${fmt(kpis.positiveExits)} (${kpis.pctPositiveExits}%)`, sub: 'Had positive P&L when they left' },
    { id: 'avgProfitPL',     label: 'Avg P&L — Profit Exits',  icon: '💰', accent: '#15803d',              value: fmtPLShort(kpis.avgPositivePL),  sub: `Avg gain across ${fmt(kpis.positiveExits)} profit exits` },
    { id: 'exitedInLoss',    label: 'Exited in Loss',          icon: '📉', accent: '#f87171',              value: `${fmt(kpis.negativeExits)} (${kpis.pctNegativeExits}%)`, sub: 'Had negative P&L when they left' },
    { id: 'avgLossPL',       label: 'Avg P&L — Loss Exits',    icon: '🩸', accent: '#991b1b',              value: fmtPLShort(kpis.avgNegativePL),  sub: `Avg loss across ${fmt(kpis.negativeExits)} loss exits` },
    { id: 'winBacks',        label: 'Win-Backs',               icon: '🔄', accent: 'var(--accent-green)',  value: fmt(l3mWinBacks),              sub: `of ${fmt(l3mExitedPANs)} exited (last 3 months) · >30d gap` },
    { id: 'winBackRate',     label: 'Win-Back Rate',           icon: '💚', accent: 'var(--accent-green)',  value: `${l3mWinBackRate}%`,          sub: `${fmt(l3mWinBacks)} / ${fmt(l3mExitedPANs)} exited (last 3 months)` },
  ];

  // Drilldown helpers
  const exitCols = [
    { key: 'name',      label: 'Name' },
    { key: 'pan',       label: 'PAN',       cls: 'td-name' },
    { key: 'product',   label: 'Product' },
    { key: 'broker',    label: 'Broker' },
    { key: 'cycle',     label: 'Cycle',     align: 'right', cls: 'td-num' },
    { key: 'exitDate',  label: 'Exit Date', align: 'right' },
    { key: 'reason',    label: 'Reason' },
  ];
  const exitToRow = r => ({
    name:     r.name     || r.email || '—',
    pan:      String(r.pan    || '').trim().toUpperCase(),
    product:  r.product  || '—',
    broker:   r.broker   || '—',
    cycle:    `C${r.cycle || 1}`,
    exitDate: fmtDate(r.exitDate),
    reason:   r.reason   || '—',
  });

  const winBackCols = [
    { key: 'name',        label: 'Name' },
    { key: 'pan',         label: 'PAN',             cls: 'td-name' },
    { key: 'product',     label: 'Product' },
    { key: 'broker',      label: 'Broker' },
    { key: 'exitDate',    label: 'Exit Date',        align: 'right' },
    { key: 'reSubDate',   label: 'Re-Sub Date',      align: 'right' },
    { key: 'daysGap',     label: 'Days Away',        align: 'right', cls: 'td-num' },
  ];
  const winBackToRow = r => ({
    name:       r.name      || '—',
    pan:        String(r.pan || '').trim().toUpperCase(),
    product:    r.product   || '—',
    broker:     r.broker    || '—',
    exitDate:   fmtDate(r.exitDate),
    reSubDate:  fmtDate(r.reSubDate),
    daysGap:    `${r.daysGap}d`,
  });

  const SELECT_STYLE = {
    background: 'var(--bg-card)', border: '1px solid var(--border-dim)',
    borderRadius: 6, color: 'var(--text-primary)', padding: '4px 8px', fontSize: 12,
  };

  return (
    <div>
      <DrilldownModal drilldown={drilldown} onClose={closeDrilldown} />

      {/* Header */}
      <div className="section-heading">
        <div>
          <div className="section-title">🚪 Unsubscriber Analysis</div>
          <div className="section-subtitle">
            All completed exit cycles · Email+Scid deduplicated · {kpis.totalExits.toLocaleString('en-IN')} total exits
            {(exitFrom || exitTo) && <span style={{ color: 'var(--accent-cyan)', marginLeft: 8 }}>· Filtered by exit date</span>}
          </div>
        </div>
        <div className="section-divider" />
        <div className="section-badge">{(exitFrom || exitTo) ? 'Filtered History' : 'Full Exit History'}</div>
      </div>

      <TabDateFilter
        dateFrom={exitFrom}
        dateTo={exitTo}
        onChange={(from, to) => { setExitFrom(from); setExitTo(to); }}
        label="Exit Date Range"
      />

      {kpis.totalExits === 0 && (exitFrom || exitTo) && (
        <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13,
          background: 'var(--bg-elevated)', borderRadius: 8, marginBottom: '1rem', border: '1px solid var(--border-default)' }}>
          No exits found in the selected date range. Try widening the range or click <strong>All Time</strong>.
        </div>
      )}

      {/* KPI Cards — drag to reorder */}
      <SortableKPIGrid storageKey="unsub" cards={unsubKpiCards} cols="165px" />

      {/* ── Short-Return Comparison Panel ─────────────────────────────────── */}
      {kpis.shortReturnCount > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0,
          border: '1px solid var(--border-bright)', borderRadius: 12,
          overflow: 'hidden', marginBottom: '1.25rem',
        }}>
          {/* Header */}
          <div style={{
            gridColumn: '1 / -1', padding: '10px 18px',
            background: 'rgba(251,191,36,0.08)', borderBottom: '1px solid var(--border-bright)',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: 16 }}>⚡</span>
            <div>
              <span style={{ fontWeight: 700, fontSize: 13, color: '#fbbf24' }}>
                Short-Return Impact
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 10 }}>
                {kpis.shortReturnCount} investor{kpis.shortReturnCount !== 1 ? 's' : ''} exited and returned within 30 days — numbers differ depending on how you count them
              </span>
            </div>
          </div>

          {/* View A — Inclusive */}
          <div style={{ padding: '16px 20px', borderRight: '1px solid var(--border-bright)', background: 'var(--bg-card)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#f87171', marginBottom: 8, letterSpacing: '0.04em' }}>
              📊 INCLUSIVE VIEW &nbsp;<span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>(current dashboard)</span>
            </div>
            <div style={{ display: 'flex', gap: 32, marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-primary)' }}>
                  {kpis.totalExits.toLocaleString('en-IN')}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total Exit Cycles</div>
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-primary)' }}>
                  {kpis.uniqueInvestors.toLocaleString('en-IN')}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Unique Exited Investors</div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, borderTop: '1px solid var(--border-dim)', paddingTop: 10 }}>
              Counts the exit <strong>even if the client returned within 30 days</strong>. Every unsubscription event is recorded regardless of how quickly the investor came back. Use this for strict, event-level churn tracking.
            </div>
          </div>

          {/* View B — Exclusive / Continuity */}
          <div style={{ padding: '16px 20px', background: 'var(--bg-card)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#34d399', marginBottom: 8, letterSpacing: '0.04em' }}>
              🔄 CONTINUITY VIEW &nbsp;<span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>(excluding short returns)</span>
            </div>
            <div style={{ display: 'flex', gap: 32, marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-primary)' }}>
                  {kpis.totalExitsExclShort.toLocaleString('en-IN')}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total Exit Cycles</div>
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-primary)' }}>
                  {kpis.uniqueInvestorsExclShort.toLocaleString('en-IN')}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Unique Exited Investors</div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, borderTop: '1px solid var(--border-dim)', paddingTop: 10 }}>
              Treats a return within 30 days as a <strong>continuity event — exit not counted, re-entry not counted as new</strong>. The investor is treated as if they never left. Use this to measure true long-term attrition.
            </div>
          </div>

          {/* Footer diff */}
          <div style={{
            gridColumn: '1 / -1', padding: '8px 18px',
            background: 'rgba(0,0,0,0.2)', borderTop: '1px solid var(--border-dim)',
            fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 24,
          }}>
            <span>Difference: <strong style={{ color: '#fbbf24' }}>
              {(kpis.totalExits - kpis.totalExitsExclShort)} exit cycles
            </strong> and <strong style={{ color: '#fbbf24' }}>
              {kpis.shortReturnCount} investors
            </strong> affected</span>
            <span style={{ marginLeft: 'auto' }}>Gap threshold: ≤ 30 days between exit and re-subscription</span>
          </div>
        </div>
      )}

      {/* Row 1: Monthly exit trend + Cycle distribution */}
      <div className="charts-grid charts-grid-2" style={{ marginBottom: '1rem' }}>
        <ChartCard title="Monthly Exit Trend" subtitle="Exits per month by Cycle End Date — last 12 months — click a bar to see subscribers" badge="Trend">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={last12Months}
              style={{ cursor: 'pointer' }}
              onClick={p => {
                if (!p?.activePayload?.[0]) return;
                const monthLabel = p.activePayload[0].payload?.label;
                if (!monthLabel) return;
                // Match tableRows whose exitDate month+year matches the label (e.g. "Jan 2025")
                const rows = tableRows.filter(r => {
                  if (!r.exitDate) return false;
                  const d = r.exitDate instanceof Date ? r.exitDate : new Date(r.exitDate);
                  const lbl = d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
                  return lbl === monthLabel;
                }).map(exitToRow);
                openDrilldown(
                  `Monthly Exits — ${monthLabel}`,
                  `${rows.length} exit cycles in this month`,
                  rows, exitCols
                );
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
              <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="c1"    name="Cycle 1 Exits"   fill="#f87171" radius={[0,0,0,0]} stackId="a" />
              <Bar dataKey="cPlus" name="Cycle 2+ Exits"  fill="#fb923c" radius={[3,3,0,0]} stackId="a" />
            </BarChart>
          </ResponsiveContainer>
          <div className="chart-clickable-hint">💡 Click any bar to see all exits in that month</div>
        </ChartCard>

        <ChartCard title="Exit by Cycle Number" subtitle="Which cycle were they on when they unsubscribed? — click a bar to see subscribers" badge="Cycle">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={byCycle}
              style={{ cursor: 'pointer' }}
              onClick={p => {
                if (!p?.activePayload?.[0]) return;
                const cycleNum = p.activePayload[0].payload?.cycle;
                if (cycleNum == null) return;
                const rows = tableRows.filter(r => r.cycle === Number(cycleNum)).map(exitToRow);
                openDrilldown(
                  `Exits at Cycle ${cycleNum}`,
                  `${rows.length} investors who exited on Cycle ${cycleNum}`,
                  rows, exitCols
                );
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
              <XAxis dataKey="cycle" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name="Exits" radius={[4,4,0,0]}>
                {byCycle.map((_, i) => <Cell key={i} fill={PRODUCT_COLORS[i % PRODUCT_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="chart-clickable-hint">💡 Click any bar to see investors who exited at that cycle</div>
        </ChartCard>
      </div>

      {/* Monthly Exit Trend — table */}
      {last12Months.length > 0 && (
        <div className="data-table-wrap" style={{ marginBottom: '1rem', maxHeight: 340, overflowY: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Month</th>
                <th style={{ textAlign: 'right' }}>Cycle 1 Exits</th>
                <th style={{ textAlign: 'right' }}>Cycle 2+ Exits</th>
                <th style={{ textAlign: 'right' }}>Total Exits</th>
                <th style={{ textAlign: 'right' }}>C1 Share</th>
                <th style={{ textAlign: 'right' }}>C2+ Share</th>
              </tr>
            </thead>
            <tbody>
              {[...monthlyTrend].reverse().map((m, i) => {
                const total = m.count || 0;
                const c1Pct    = total > 0 ? ((m.c1    / total) * 100).toFixed(1) : '—';
                const cPlusPct = total > 0 ? ((m.cPlus / total) * 100).toFixed(1) : '—';
                return (
                  <tr key={i}>
                    <td className="td-name" style={{ whiteSpace: 'nowrap' }}>{m.label}</td>
                    <td style={{ textAlign: 'right', color: '#f87171', fontFamily: 'monospace' }}>
                      {(m.c1 || 0).toLocaleString('en-IN')}
                    </td>
                    <td style={{ textAlign: 'right', color: '#fb923c', fontFamily: 'monospace' }}>
                      {(m.cPlus || 0).toLocaleString('en-IN')}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, fontFamily: 'monospace' }}>
                      {total.toLocaleString('en-IN')}
                    </td>
                    <td style={{ textAlign: 'right', color: 'var(--text-muted)', fontSize: 11 }}>
                      {c1Pct !== '—' ? `${c1Pct}%` : '—'}
                    </td>
                    <td style={{ textAlign: 'right', color: 'var(--text-muted)', fontSize: 11 }}>
                      {cPlusPct !== '—' ? `${cPlusPct}%` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '1px solid var(--border-bright)', fontWeight: 700 }}>
                <td>Total</td>
                <td style={{ textAlign: 'right', color: '#f87171', fontFamily: 'monospace' }}>
                  {monthlyTrend.reduce((s, m) => s + (m.c1 || 0), 0).toLocaleString('en-IN')}
                </td>
                <td style={{ textAlign: 'right', color: '#fb923c', fontFamily: 'monospace' }}>
                  {monthlyTrend.reduce((s, m) => s + (m.cPlus || 0), 0).toLocaleString('en-IN')}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                  {monthlyTrend.reduce((s, m) => s + (m.count || 0), 0).toLocaleString('en-IN')}
                </td>
                <td />
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Row 2: Exit by product + Exit by broker */}
      <div className="charts-grid charts-grid-2" style={{ marginBottom: '1rem' }}>
        <ChartCard title="Exit by Product" subtitle="Top products by total exit cycles — click a bar to see subscribers" badge="Product">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={byProduct.slice(0, 8)}
              layout="vertical"
              style={{ cursor: 'pointer' }}
              onClick={p => {
                if (!p?.activePayload?.[0]) return;
                const prod = p.activePayload[0].payload?.product;
                if (!prod) return;
                const rows = tableRows.filter(r => r.product === prod).map(exitToRow);
                openDrilldown(
                  `Exit by Product — ${prod}`,
                  `${rows.length} exit cycles for this product`,
                  rows, exitCols
                );
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
              <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
              <YAxis dataKey="product" type="category" width={115} tick={<YAxisTick maxChars={14} />} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name="Exit Cycles" fill="#f87171" radius={[0,4,4,0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="chart-clickable-hint">💡 Click any bar to see the list of unsubscribed investors for that product</div>
        </ChartCard>

        <ChartCard title="Exit by Broker" subtitle="Top brokers by exit volume — click a bar to see subscribers" badge="Broker">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={byBroker.slice(0, 8)}
              layout="vertical"
              style={{ cursor: 'pointer' }}
              onClick={p => {
                if (!p?.activePayload?.[0]) return;
                const brk = p.activePayload[0].payload?.broker;
                if (!brk) return;
                const rows = tableRows.filter(r => r.broker === brk).map(exitToRow);
                openDrilldown(
                  `Exit by Broker — ${brk}`,
                  `${rows.length} exit cycles via this broker`,
                  rows, exitCols
                );
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
              <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
              <YAxis dataKey="broker" type="category" width={115} tick={<YAxisTick maxChars={14} />} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name="Exit Cycles" fill="#fb923c" radius={[0,4,4,0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="chart-clickable-hint">💡 Click any bar to see the list of unsubscribed investors for that broker</div>
        </ChartCard>
      </div>

      {/* Row 3: Cancellation reasons + State */}
      {(hasReasons || byState.length > 0) && (
        <div className="charts-grid charts-grid-2" style={{ marginBottom: '1rem' }}>
          {hasReasons && (
            <ChartCard title="Cancellation Reasons" subtitle="Why subscribers exited — click a bar to see subscribers" badge="Reasons">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={reasons.slice(0, 8)}
                  layout="vertical"
                  style={{ cursor: 'pointer' }}
                  onClick={p => {
                    if (!p?.activePayload?.[0]) return;
                    const reason = p.activePayload[0].payload?.reason;
                    if (!reason) return;
                    const reasonCols = [
                      { key: 'name',    label: 'Name' },
                      { key: 'pan',     label: 'PAN',     cls: 'td-name' },
                      { key: 'product', label: 'Product' },
                      { key: 'broker',  label: 'Broker' },
                      { key: 'cycle',   label: 'Cycle',   align: 'right', cls: 'td-num' },
                      { key: 'exitDate',label: 'Exit Date',align: 'right' },
                    ];
                    const rows = tableRows.filter(r => r.reason === reason).map(r => ({
                      name:     r.name     || r.email || '—',
                      pan:      String(r.pan || '').trim().toUpperCase(),
                      product:  r.product  || '—',
                      broker:   r.broker   || '—',
                      cycle:    `C${r.cycle || 1}`,
                      exitDate: fmtDate(r.exitDate),
                    }));
                    openDrilldown(
                      `Exits — "${reason}"`,
                      `${rows.length} investors who gave this cancellation reason`,
                      rows, reasonCols
                    );
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
                  <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                  <YAxis dataKey="reason" type="category" tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} width={130} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" name="Count" fill="#8b5cf6" radius={[0,4,4,0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="chart-clickable-hint">💡 Click any bar to see investors who gave that cancellation reason</div>
            </ChartCard>
          )}
          {byState.length > 0 && (
            <ChartCard title="Exit by State" subtitle="Geographic distribution of exits — click a bar to see subscribers" badge="Geography">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={byState.slice(0, 8)}
                  layout="vertical"
                  style={{ cursor: 'pointer' }}
                  onClick={p => {
                    if (!p?.activePayload?.[0]) return;
                    const state = p.activePayload[0].payload?.state;
                    if (!state) return;
                    const stateCols = [
                      { key: 'name',    label: 'Name' },
                      { key: 'pan',     label: 'PAN',     cls: 'td-name' },
                      { key: 'product', label: 'Product' },
                      { key: 'broker',  label: 'Broker' },
                      { key: 'cycle',   label: 'Cycle',   align: 'right', cls: 'td-num' },
                      { key: 'exitDate',label: 'Exit Date',align: 'right' },
                    ];
                    const rows = tableRows.filter(r => r.state === state).map(r => ({
                      ...exitToRow(r),
                    }));
                    openDrilldown(
                      `Exits from ${state}`,
                      `${rows.length} exit cycles from this state`,
                      rows, stateCols
                    );
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
                  <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                  <YAxis dataKey="state" type="category" tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} width={100} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" name="Exits" fill="#22d3ee" radius={[0,4,4,0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="chart-clickable-hint">💡 Click any bar to see exits from that state</div>
            </ChartCard>
          )}
        </div>
      )}

      {/* ── P&L Analysis at Exit ──────────────────────────────────────── */}
      {hasPLData && (
        <>
          <div className="section-heading" style={{ marginTop: '0.5rem' }}>
            <div>
              <div className="section-title" style={{ fontSize: 15 }}>💹 P&L Analysis at Exit</div>
              <div className="section-subtitle">
                What was the subscriber's total P&L when they unsubscribed?
                {avgPL !== 0 && (
                  <span style={{ marginLeft: 10, color: avgPLColor, fontWeight: 600 }}>
                    Avg: {fmtPL(avgPL)}
                  </span>
                )}
              </div>
            </div>
            <div className="section-divider" />
            <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
              <span style={{ color: '#22c55e' }}>● Profit: {plAnalysis.pctPositive}%</span>
              <span style={{ color: '#f87171' }}>● Loss: {plAnalysis.pctNegative}%</span>
              <span style={{ color: '#94a3b8' }}>● Break-even: {((plAnalysis.zeroCount || 0) / (kpis.totalExits || 1) * 100).toFixed(1)}%</span>
            </div>
          </div>

          <div className="charts-grid charts-grid-2" style={{ marginBottom: '1rem' }}>
            {/* P&L Distribution Histogram */}
            <ChartCard title="P&L Distribution at Exit" subtitle="How many subscribers exited at each P&L bracket — red = loss, green = profit">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={plAnalysis.byBucket || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
                  <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const count = payload[0]?.value || 0;
                      const pct = kpis.totalExits > 0 ? ((count / kpis.totalExits) * 100).toFixed(1) : 0;
                      return (
                        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-bright)', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
                          <div style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</div>
                          <div style={{ color: PL_BUCKET_COLORS[label] || '#94a3b8', fontWeight: 700 }}>
                            {count.toLocaleString('en-IN')} exits ({pct}%)
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="count" name="Exits" radius={[4,4,0,0]}>
                    {(plAnalysis.byBucket || []).map((b, i) => (
                      <Cell key={i} fill={PL_BUCKET_COLORS[b.label] || '#94a3b8'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Avg P&L by Product at Exit */}
            <ChartCard title="Avg P&L at Exit by Product" subtitle="Which products had the best/worst P&L when subscribers left — sorted best first">
              <ResponsiveContainer width="100%" height={Math.max(240, (plAnalysis.byProduct?.length || 8) * 36)}>
                <BarChart data={plAnalysis.byProduct || []} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
                  <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                    tickFormatter={v => fmtPLShort(v)} />
                  <YAxis dataKey="product" type="category" width={130} tick={<YAxisTick fontSize={10} maxChars={16} />} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0]?.payload;
                      return (
                        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-bright)', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
                          <div style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</div>
                          <div style={{ color: d?.avgPL >= 0 ? '#22c55e' : '#f87171', fontWeight: 700 }}>
                            Avg P&L: {fmtPL(d?.avgPL)}
                          </div>
                          <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 2 }}>
                            {d?.count} exits
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="avgPL" name="Avg P&L" radius={[0,3,3,0]}>
                    {(plAnalysis.byProduct || []).map((d, i) => (
                      <Cell key={i} fill={d.avgPL >= 0 ? '#22c55e' : '#f87171'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* P&L detail table by product */}
          <ChartCard title="P&L at Exit — Full Product Breakdown"
            subtitle="Average P&L, count and % of total exits per product at the time of unsubscription"
            style={{ marginBottom: '1rem' }}>
            <div className="data-table-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Product</th>
                    <th style={{ textAlign: 'right' }}>Avg P&L at Exit</th>
                    <th style={{ textAlign: 'right' }}>Exit Count</th>
                    <th style={{ textAlign: 'right' }}>% of Exits</th>
                    <th>P&L Signal</th>
                  </tr>
                </thead>
                <tbody>
                  {(plAnalysis.byProduct || []).map((d, i) => (
                    <tr key={i}>
                      <td style={{ color: 'var(--text-muted)', fontSize: 11 }}>{i + 1}</td>
                      <td className="td-name" style={{ fontSize: 12 }}>{d.product}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, fontSize: 13,
                        color: d.avgPL > 0 ? '#22c55e' : d.avgPL < 0 ? '#f87171' : 'var(--text-muted)' }}>
                        {fmtPL(d.avgPL)}
                      </td>
                      <td className="td-num">{d.count.toLocaleString('en-IN')}</td>
                      <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>
                        {kpis.totalExits > 0 ? ((d.count / kpis.totalExits) * 100).toFixed(1) : 0}%
                      </td>
                      <td>
                        <span style={{
                          fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600,
                          background: d.avgPL > 0 ? '#22c55e22' : d.avgPL < 0 ? '#f8717122' : '#94a3b822',
                          color: d.avgPL > 0 ? '#22c55e' : d.avgPL < 0 ? '#f87171' : '#94a3b8',
                        }}>
                          {d.avgPL > 0 ? '▲ Profit' : d.avgPL < 0 ? '▼ Loss' : '─ Neutral'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartCard>
        </>
      )}

      {/* ── Unique Exit Investor P&L ─────────────────────────────────────── */}
      {(uniqueClientPL.totalClients > 0) && (
        <>
          <div className="section-heading" style={{ marginTop: '0.5rem' }}>
            <div>
              <div className="section-title" style={{ fontSize: 15 }}>👤 Unique Exit Investor P&L</div>
              <div className="section-subtitle">
                One P&L per unique investor (PAN) — total P&L summed across all their exit subscriptions
                <span style={{ marginLeft: 10, color: uniqueClientPL.avgPL > 0 ? 'var(--accent-green)' : uniqueClientPL.avgPL < 0 ? '#f87171' : 'var(--text-muted)', fontWeight: 600 }}>
                  · Avg: {fmtPLShort(uniqueClientPL.avgPL)} per investor
                </span>
              </div>
            </div>
            <div className="section-divider" />
            <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
              <span style={{ color: '#22c55e' }}>● Profit: {uniqueClientPL.pctPositive}%</span>
              <span style={{ color: '#f87171' }}>● Loss: {uniqueClientPL.pctNegative}%</span>
              <span style={{ color: '#94a3b8' }}>● Break-even: {uniqueClientPL.totalClients > 0 ? ((uniqueClientPL.zeroCount / uniqueClientPL.totalClients) * 100).toFixed(1) : 0}%</span>
            </div>
          </div>

          {/* KPI row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
            {[
              { label: 'Unique Investors',  value: uniqueClientPL.totalClients.toLocaleString('en-IN'),  color: 'var(--accent-cyan)',   icon: '👤' },
              { label: 'Exited in Profit',  value: `${uniqueClientPL.positiveCount.toLocaleString('en-IN')} (${uniqueClientPL.pctPositive}%)`, color: '#22c55e', icon: '📈' },
              { label: 'Exited in Loss',    value: `${uniqueClientPL.negativeCount.toLocaleString('en-IN')} (${uniqueClientPL.pctNegative}%)`, color: '#f87171', icon: '📉' },
              { label: 'Avg P&L / Investor',value: fmtPLShort(uniqueClientPL.avgPL), color: uniqueClientPL.avgPL >= 0 ? '#22c55e' : '#f87171', icon: '💹' },
              { label: 'Avg Profit (winners)', value: fmtPLShort(uniqueClientPL.avgPositivePL), color: '#15803d', icon: '💰' },
              { label: 'Avg Loss (losers)',  value: fmtPLShort(uniqueClientPL.avgNegativePL),  color: '#991b1b', icon: '🩸' },
            ].map(c => (
              <div key={c.label} className="kpi-card" style={{ '--kpi-accent': c.color }}>
                <div className="kpi-label">{c.label}</div>
                <div className="kpi-value small" style={{ color: c.color }}>{c.value}</div>
                <div className="kpi-icon">{c.icon}</div>
              </div>
            ))}
          </div>

          <div className="charts-grid charts-grid-2" style={{ marginBottom: '1rem' }}>
            {/* Bucket distribution */}
            <ChartCard title="P&L Distribution — Unique Investors" subtitle="How many unique investors exited at each P&L bracket (total P&L across all their subscriptions)">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={uniqueClientPL.byBucket || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
                  <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} allowDecimals={false} />
                  <Tooltip content={({ active, payload, label }) => active && payload?.length ? (
                    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-bright)', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
                      <div style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</div>
                      <div style={{ color: PL_BUCKET_COLORS[label] || '#94a3b8', fontWeight: 700 }}>
                        {payload[0].value.toLocaleString('en-IN')} investors
                      </div>
                    </div>
                  ) : null} />
                  <Bar dataKey="count" name="Investors" radius={[4,4,0,0]}>
                    {(uniqueClientPL.byBucket || []).map((b, i) => (
                      <Cell key={i} fill={PL_BUCKET_COLORS[b.label] || '#94a3b8'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Top losers + gainers */}
            <ChartCard title="Top 10 Losers vs Gainers" subtitle="Ranked by total P&L across all exit subscriptions per investor">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', height: 240, overflowY: 'auto' }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#f87171', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>▼ Top Losers</div>
                  {(uniqueClientPL.topLosers || []).filter(c => c.totalPL < 0).map((c, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0', borderBottom: '1px solid var(--border-dim)' }}>
                      <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 100 }} title={c.name || c.pan}>
                        {c.name || c.pan || '—'}
                      </span>
                      <span style={{ color: '#f87171', fontFamily: 'monospace', fontWeight: 600, flexShrink: 0 }}>{fmtPLShort(c.totalPL)}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#22c55e', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>▲ Top Gainers</div>
                  {(uniqueClientPL.topGainers || []).filter(c => c.totalPL > 0).map((c, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0', borderBottom: '1px solid var(--border-dim)' }}>
                      <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 100 }} title={c.name || c.pan}>
                        {c.name || c.pan || '—'}
                      </span>
                      <span style={{ color: '#22c55e', fontFamily: 'monospace', fontWeight: 600, flexShrink: 0 }}>{fmtPLShort(c.totalPL)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </ChartCard>
          </div>

          {/* Full investor-level P&L table */}
          <ChartCard title="All Unique Exit Investors — P&L Summary"
            subtitle={`${uniqueClientPL.totalClients.toLocaleString('en-IN')} unique investors · total P&L = sum across all exit subscriptions per PAN`}
            style={{ marginBottom: '1rem' }}>
            <div className="data-table-wrap" style={{ maxHeight: 340, overflowY: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Name / PAN</th>
                    <th style={{ textAlign: 'right' }}>Total P&L</th>
                    <th style={{ textAlign: 'right' }}>Products Exited</th>
                    <th style={{ textAlign: 'right' }}>Last Exit</th>
                    <th>P&L Signal</th>
                  </tr>
                </thead>
                <tbody>
                  {[...(uniqueClientPL.topLosers || []), ...(uniqueClientPL.topGainers || [])]
                    .filter((c, idx, arr) => arr.findIndex(x => x.pan === c.pan) === idx)
                    .sort((a, b) => a.totalPL - b.totalPL)
                    .map((c, i) => (
                    <tr key={i}>
                      <td style={{ color: 'var(--text-muted)', fontSize: 11 }}>{i + 1}</td>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: 12 }}>{c.name || '—'}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{c.pan}</div>
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700,
                        color: c.totalPL > 0 ? '#22c55e' : c.totalPL < 0 ? '#f87171' : 'var(--text-muted)' }}>
                        {fmtPL(c.totalPL)}
                      </td>
                      <td style={{ textAlign: 'right', fontSize: 11 }}>
                        <span title={c.products.join(', ')}>{c.products.length} product{c.products.length !== 1 ? 's' : ''}</span>
                      </td>
                      <td style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-muted)' }}>
                        {c.lastExitDate ? c.lastExitDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                      </td>
                      <td>
                        <span style={{
                          fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600,
                          background: c.totalPL > 0 ? '#22c55e22' : c.totalPL < 0 ? '#f8717122' : '#94a3b822',
                          color: c.totalPL > 0 ? '#22c55e' : c.totalPL < 0 ? '#f87171' : '#94a3b8',
                        }}>
                          {c.totalPL > 0 ? '▲ Profit' : c.totalPL < 0 ? '▼ Loss' : '─ Neutral'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartCard>
        </>
      )}

      {/* Table filters */}
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <select style={SELECT_STYLE} value={filterProduct} onChange={e => { setFilterProduct(e.target.value); }}>
          <option value="">All Products</option>
          {products.filter(Boolean).map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select style={SELECT_STYLE} value={filterBroker} onChange={e => { setFilterBroker(e.target.value); }}>
          <option value="">All Brokers</option>
          {brokers.filter(Boolean).map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <input
          placeholder="Search name / email / PAN / reason..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...SELECT_STYLE, minWidth: 240 }}
        />
        {(search || filterProduct || filterBroker) && (
          <button onClick={() => { setSearch(''); setFilterProduct(''); setFilterBroker(''); }}
            style={{ background: 'none', border: '1px solid var(--border-dim)', borderRadius: 6, color: 'var(--text-muted)', padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}>
            Clear
          </button>
        )}
        <span style={{ color: 'var(--text-muted)', fontSize: 12, marginLeft: 'auto' }}>
          {sorted.length.toLocaleString('en-IN')} rows — scroll to browse all
        </span>
      </div>

      {/* Virtual table */}
      <div style={{ border: '1px solid var(--border-dim)', borderRadius: 8, overflow: 'hidden', marginBottom: '1rem' }}>
        {/* Sticky header */}
        <div style={{ overflowX: 'auto', background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-bright)' }}>
          <div style={{ display: 'flex', width: TABLE_WIDTH, minWidth: '100%' }}>
            {COLS.map(col => (
              <div key={col.key} onClick={() => handleSort(col.key)} style={{
                width: col.width, flexShrink: 0, padding: '8px 8px', cursor: 'pointer',
                fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                color: sortKey === col.key ? 'var(--accent-cyan)' : 'var(--text-muted)',
                textAlign: col.align === 'right' ? 'right' : col.align === 'center' ? 'center' : 'left',
                userSelect: 'none', whiteSpace: 'nowrap',
              }}>
                {col.label}{sortKey === col.key ? (sortDir === 1 ? ' ↑' : ' ↓') : ''}
              </div>
            ))}
          </div>
        </div>
        {/* Virtual rows */}
        {sorted.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            No rows match the current filters
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <FixedSizeList
              height={Math.min(sorted.length * ROW_HEIGHT, LIST_HEIGHT)}
              itemCount={sorted.length}
              itemSize={ROW_HEIGHT}
              width={TABLE_WIDTH}
              overscanCount={8}
            >
              {VirtualRow}
            </FixedSizeList>
          </div>
        )}
      </div>

      {/* ── Win-Back Detail Table ── */}
      {winBackDetails.length > 0 && (
        <ChartCard
          title={`🔄 Win-Back Subscribers — ${winBackDetails.length} Investors`}
          subtitle="Returned after more than 30 days from exit — sorted by most recent re-subscription"
          style={{ marginTop: '1.5rem' }}
        >
          <div className="data-table-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th>PAN</th>
                  <th>Basket</th>
                  <th>Broker</th>
                  <th style={{ textAlign: 'center' }}>Exited at Cycle</th>
                  <th style={{ textAlign: 'right' }}>Exit Date</th>
                  <th style={{ textAlign: 'right' }}>Re-Subscribed On</th>
                  <th style={{ textAlign: 'center' }}>Days Away</th>
                  <th style={{ textAlign: 'center' }}>Current Cycle</th>
                </tr>
              </thead>
              <tbody>
                {winBackDetails.map((r, i) => (
                  <tr key={i}>
                    <td className="td-rank">{i + 1}</td>
                    <td className="td-name">{r.name || '—'}</td>
                    <td style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{r.pan || '—'}</td>
                    <td className="td-name">{r.product || '—'}</td>
                    <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.broker || '—'}</td>
                    <td className="td-warn" style={{ textAlign: 'center' }}>C{r.exitCycle}</td>
                    <td className="td-num" style={{ textAlign: 'right' }}>{fmtDate(r.exitDate)}</td>
                    <td className="td-good" style={{ textAlign: 'right' }}>{fmtDate(r.reSubDate)}</td>
                    <td className="td-good" style={{ textAlign: 'center', fontFamily: 'monospace' }}>{r.daysGap}d</td>
                    <td className="td-good" style={{ textAlign: 'center' }}>C{r.currentCycle}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
      )}

      {unsubInsights.length > 0 && (
        <InsightsPanel
          insights={unsubInsights}
          title="🤖 Exit Intelligence — Why Clients Are Leaving"
          max={12}
        />
      )}
    </div>
  );
});
