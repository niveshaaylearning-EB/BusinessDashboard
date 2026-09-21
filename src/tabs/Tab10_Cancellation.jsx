import { memo, useMemo } from 'react';
import TabDateFilter from '../components/TabDateFilter';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LineChart, Line, Cell, ComposedChart
} from 'recharts';
import ChartCard from '../components/ChartCard';
import { YAxisTick } from '../components/YAxisTick';
import SortableKPIGrid from '../components/SortableKPIGrid';
import InsightsPanel from '../components/InsightsPanel';
import FAQSection from '../components/FAQSection';
import { formatNumber, normalizeData } from '../dataEngine';
import DrilldownModal, { useDrilldown } from '../components/DrilldownModal';

const COLORS = ['#f87171','#fb923c','#fbbf24','#a78bfa','#00d4ff','#22c55e','#2dd4bf','#f472b6'];

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

const cancelCols = [
  { key: 'name',    label: 'Name' },
  { key: 'pan',     label: 'PAN',     cls: 'td-name' },
  { key: 'product', label: 'Product' },
  { key: 'broker',  label: 'Broker' },
  { key: 'status',  label: 'Status',  align: 'right' },
  { key: 'cycle',   label: 'Cycle',   align: 'right', cls: 'td-num' },
  { key: 'reason',  label: 'Reason' },
];

const toRow = r => ({
  name:    r.Name || r.name || '—',
  pan:     String(r.PAN || '').trim().toUpperCase(),
  product: r['Smallcase Name'] || '—',
  broker:  r['Broker Name'] || r['Broker'] || '—',
  status:  r['Latest Subscription Status'] || '—',
  cycle:   r['Cycle Number'] || '—',
  reason:  r['Cancellation Reason'] || '—',
});

export default memo(function Tab10Cancellation({ cancellationMetrics, currentMaster, rawData, insights, filters, setFilters }) {
  const { drilldown, open: openDrilldown, close: closeDrilldown } = useDrilldown();

  const onDateChange = (from, to) => setFilters(prev => ({ ...prev, dateFrom: from, dateTo: to }));

  if (!cancellationMetrics?.reasons?.length) return (
    <div className="empty-state">
      <span className="empty-state-icon">⚠️</span>
      <div>No cancellation reason data available. Ensure the Cancellation Reason column has data.</div>
    </div>
  );

  const { reasons, total, monthlyTrend } = cancellationMetrics;
  const top8 = reasons.slice(0, 8);

  // Source for filtering: prefer currentMaster, then rawData (normalized — rawData
  // still has original Excel headers like "Cycle No" / "smallcase Name")
  const masterData = Array.isArray(currentMaster) && currentMaster.length > 0
    ? currentMaster
    : Array.isArray(rawData) && rawData.length > 0
    ? normalizeData(rawData)
    : [];

  const handleReasonClick = (p) => {
    if (!p?.activePayload?.[0]) return;
    const data = p.activePayload[0].payload;
    // The chart data uses a truncated 'reason' key; try both full and short form
    const clickedReason = data.reason;

    let rows = [];
    if (masterData.length > 0) {
      rows = masterData
        .filter(r => {
          const cancelReason = r['Cancellation Reason'] || '';
          // Match on exact or starts-with (handles truncated chart labels)
          return cancelReason === clickedReason ||
            cancelReason.startsWith(clickedReason.replace('…', ''));
        })
        .map(toRow);
    }

    // Fallback: show chart summary when no master rows found
    if (rows.length === 0) {
      rows = [{
        name: clickedReason,
        pan: '—',
        product: '—',
        broker: '—',
        status: `Count: ${data.count ?? '—'}`,
        cycle: `${data.pct ?? '—'}%`,
        reason: clickedReason,
      }];
    }

    openDrilldown(
      `Cancellation Reason: ${clickedReason}`,
      `${rows.length} subscriber${rows.length !== 1 ? 's' : ''} cancelled for this reason`,
      rows,
      cancelCols
    );
  };

  // Pareto chart uses a truncated reason key; we need a wrapper that maps back to full reason
  const handleParetoClick = (p) => {
    if (!p?.activePayload?.[0]) return;
    const data = p.activePayload[0].payload;
    // paretoData has truncated reason; find the matching full reason from reasons[]
    const fullMatch = reasons.find(r =>
      r.reason === data.reason ||
      (data.reason?.endsWith('…') && (r.reason||'').startsWith(data.reason.slice(0, -1)))
    );
    const clickedReason = fullMatch?.reason || data.reason;

    let rows = [];
    if (masterData.length > 0) {
      rows = masterData
        .filter(r => (r['Cancellation Reason'] || '') === clickedReason)
        .map(toRow);
    }

    if (rows.length === 0) {
      rows = [{
        name: clickedReason,
        pan: '—',
        product: '—',
        broker: '—',
        status: `Count: ${data.count ?? '—'}`,
        cycle: `${data.pct ?? '—'}%`,
        reason: clickedReason,
      }];
    }

    openDrilldown(
      `Cancellation Reason: ${clickedReason}`,
      `${rows.length} subscriber${rows.length !== 1 ? 's' : ''} cancelled for this reason`,
      rows,
      cancelCols
    );
  };

  const cancellationInsights = useMemo(() => {
    if (!reasons?.length) return [];
    const insights = [];

    const topReason = reasons[0];
    const topPct = topReason?.pct ?? 0;
    insights.push({
      icon: '🔍',
      category: 'Top Cancel Reason',
      title: `"${topReason?.reason}" is the #1 exit driver at ${topPct}%`,
      detail: `${(topReason?.count ?? 0).toLocaleString('en-IN')} of ${(total ?? 0).toLocaleString('en-IN')} cancellations are attributed to this single reason. This is your highest-priority retention fix.`,
      color: topPct > 30 ? '#f87171' : '#fb923c',
    });

    const top3Pct = reasons.slice(0, 3).reduce((acc, r) => acc + (r.pct ?? 0), 0);
    insights.push({
      icon: '📊',
      category: 'Pareto Analysis',
      title: `Top 3 reasons account for ${top3Pct.toFixed(0)}% of all cancellations`,
      detail: top3Pct >= 70
        ? 'Strong Pareto concentration — fixing these three issues could recover the majority of churned subscribers.'
        : 'Cancellations are moderately distributed. Addressing top 3 will still yield significant impact.',
      color: top3Pct >= 70 ? '#fbbf24' : '#22d3ee',
    });

    if (topPct > 40) {
      insights.push({
        icon: '🎯',
        category: 'Single Dominant Driver',
        title: `"${topReason?.reason}" covers over 40% — a fixable, high-confidence target`,
        detail: 'When one reason dominates this heavily, a focused product or service intervention has a measurable, near-certain impact on churn reduction.',
        color: '#f87171',
      });
    }

    if (topPct > 60) {
      insights.push({
        icon: '⚡',
        category: 'Critical Concentration',
        title: `Over 60% of exits share one reason — very high confidence fix target`,
        detail: `"${topReason?.reason}" is not just the top reason — it is an overwhelming majority of your churn signal. Immediate intervention recommended.`,
        color: '#f87171',
      });
    }

    const trend = monthlyTrend ?? [];
    if (trend.length >= 6) {
      const recent = trend.slice(-3);
      const prior = trend.slice(-6, -3);
      const recentAvg = recent.reduce((s, m) => s + (m.count ?? 0), 0) / 3;
      const priorAvg = prior.reduce((s, m) => s + (m.count ?? 0), 0) / 3;
      const changePct = priorAvg > 0 ? ((recentAvg - priorAvg) / priorAvg * 100).toFixed(1) : null;
      if (changePct !== null) {
        const accelerating = recentAvg > priorAvg;
        insights.push({
          icon: accelerating ? '📈' : '📉',
          category: 'Cancellation Trend',
          title: accelerating
            ? `Cancellations accelerating — up ${changePct}% in last 3 months vs prior 3`
            : `Cancellations decelerating — down ${Math.abs(changePct)}% in last 3 months vs prior 3`,
          detail: accelerating
            ? `Recent 3-month average: ${recentAvg.toFixed(0)} exits/month vs ${priorAvg.toFixed(0)} prior. Churn is worsening — time-sensitive action needed.`
            : `Recent 3-month average: ${recentAvg.toFixed(0)} exits/month vs ${priorAvg.toFixed(0)} prior. Retention efforts appear to be working.`,
          color: accelerating ? '#f87171' : '#22c55e',
        });
      }
    }

    if (trend.length > 0) {
      const peakMonth = trend.reduce((best, m) => (m.count ?? 0) > (best.count ?? 0) ? m : best, trend[0]);
      insights.push({
        icon: '📅',
        category: 'Peak Exit Month',
        title: `Highest cancellations recorded in ${peakMonth.month ?? peakMonth.label ?? 'unknown month'} (${(peakMonth.count ?? 0).toLocaleString('en-IN')} exits)`,
        detail: 'Investigate what happened in this period — market events, service disruptions, or product changes may explain the spike.',
        color: '#fbbf24',
      });
    }

    insights.push({
      icon: '📋',
      category: 'Reason Diversity',
      title: `${reasons.length} distinct cancellation reason${reasons.length === 1 ? '' : 's'} identified`,
      detail: reasons.length <= 3
        ? 'Cancellation causes are highly concentrated. A small, targeted fix could address the majority of churn.'
        : reasons.length >= 8
        ? 'Exit reasons are diverse — no single silver bullet. A multi-front retention strategy is required.'
        : 'Moderate diversity in exit reasons. Prioritise top 3 while keeping a broad retention approach.',
      color: reasons.length <= 3 ? '#22c55e' : reasons.length >= 8 ? '#fb923c' : '#22d3ee',
    });

    return insights;
  }, [cancellationMetrics]);

  // Pareto: bars + cumulative line
  const paretoData = top8.map(r => { const rsn = r.reason || ''; return { reason: rsn.length > 18 ? rsn.slice(0, 17) + '…' : rsn, count: r.count, pct: r.pct, cumPct: r.cumPct }; });

  return (
    <div>
      <DrilldownModal drilldown={drilldown} onClose={closeDrilldown} />

      <div className="section-heading">
        <div><div className="section-title">⚠️ Cancellation Intelligence</div><div className="section-subtitle">Why subscribers exit — reason analysis for targeted retention intervention</div></div>
        <div className="section-divider" />
        <div className="section-badge">{total} Cancellations</div>
      </div>
      <TabDateFilter dateFrom={filters?.dateFrom} dateTo={filters?.dateTo} onChange={onDateChange} />

      {/* KPIs */}
      <SortableKPIGrid storageKey="cancel" cols="175px" cards={[
        { id: 'total_cancel',  label: 'Total Cancellations',  value: formatNumber(total),                                                    accent: 'var(--accent-red)',    icon: '⛔',
          tooltip: 'Number of unsubscribe events with a recorded, non-blank cancellation reason (one per investor-product, counted at their most recent cancelled cycle) — exits with no reason logged are excluded from this count and the breakdown below.' },
        { id: 'top_reason',    label: 'Top Reason',            value: reasons[0]?.reason,                             small: true,            accent: 'var(--accent-orange)', icon: '🔍', sub: `${reasons[0]?.count} exits (${reasons[0]?.pct}%)`,
          tooltip: 'The single most common cancellation reason, and what share of all reason-tagged cancellations it accounts for.' },
        { id: 'top3_cover',    label: 'Top 3 Reasons Cover',  value: `${reasons.slice(0,3).reduce((a,r)=>a+r.pct,0).toFixed(0)}%`,           accent: 'var(--accent-gold)',   icon: '📊', sub: 'of all cancellations',
          tooltip: 'Combined share of all reason-tagged cancellations explained by just the three most common reasons — a high number here means fixing just a few root causes could address most of your churn.' },
        { id: 'unique_reasons',label: 'Unique Reasons',        value: reasons.length,                                                         accent: 'var(--accent-purple)', icon: '📋',
          tooltip: 'Number of distinct cancellation reasons recorded across all exits.' },
      ]} />

      {/* Pareto */}
      <ChartCard title="Cancellation Pareto Analysis" subtitle="Click a bar to see subscribers — Top reasons ranked by volume + cumulative % line (80/20 analysis)" style={{ marginBottom: '1rem' }}
        tooltip="Cancellation reasons ranked by volume (bars) with a cumulative percentage line — where the line crosses 80% marks the small set of reasons responsible for the bulk of churn.">
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={paretoData} onClick={handleParetoClick} style={{ cursor: 'pointer' }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
            <XAxis dataKey="reason" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} angle={-20} textAnchor="end" height={50} />
            <YAxis yAxisId="left" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
            <YAxis yAxisId="right" orientation="right" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} unit="%" domain={[0, 100]} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar yAxisId="left" dataKey="count" name="Count" fill="#f87171" radius={[3, 3, 0, 0]} />
            <Line yAxisId="right" type="monotone" dataKey="cumPct" name="Cumulative %" stroke="#fbbf24" strokeWidth={2} dot={{ r: 3, fill: '#fbbf24' }} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Trend + Reason Distribution */}
      <div className="charts-grid charts-grid-2" style={{ marginBottom: '1rem' }}>
        {monthlyTrend?.length > 0 && (
          <ChartCard title="Monthly Exit Trend" subtitle="Number of subscriber exits per month"
            tooltip="Count of unsubscribe events per month, based on Exit Date (or Cycle End Date as fallback) — includes ALL exits, even ones without a logged cancellation reason, so monthly totals can exceed the reason-based KPIs above.">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyTrend.slice(-18)}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
                <XAxis dataKey="month" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="Exits" fill="#f87171" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        <ChartCard title="Reason Distribution (Horizontal)" subtitle="Click a bar to see subscribers — All cancellation reasons ranked by volume"
          tooltip="Top cancellation reasons ranked by raw exit count — same underlying data as the Pareto chart, shown without the cumulative line.">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={top8} layout="vertical" onClick={handleReasonClick} style={{ cursor: 'pointer' }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
              <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
              <YAxis dataKey="reason" type="category" width={115} tick={<YAxisTick maxChars={14} fontSize={9} />} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name="Count" radius={[0, 4, 4, 0]}>
                {top8.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Full Cancellation Reasons Table */}
      <ChartCard title="Cancellation Reason Detail" subtitle="All reasons with count, percentage and cumulative coverage"
        tooltip="Every recorded cancellation reason with its count, share of total reason-tagged cancellations, and running cumulative percentage (Pareto order).">
        <div className="data-table-wrap" style={{ maxHeight: 380, overflowY: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th><th>Cancellation Reason</th>
                <th style={{textAlign:'right'}}>Count</th>
                <th style={{textAlign:'right'}}>% of Total</th>
                <th style={{textAlign:'right'}}>Cumulative %</th>
                <th>Pareto Bar</th>
              </tr>
            </thead>
            <tbody>
              {reasons.map((r, i) => (
                <tr key={i}>
                  <td className="td-rank">{i + 1}</td>
                  <td className="td-name">{r.reason}</td>
                  <td className="td-num">{r.count?.toLocaleString()}</td>
                  <td className="td-warn">{r.pct}%</td>
                  <td className={r.cumPct <= 80 ? 'td-bad' : 'td-num'}>{r.cumPct}%</td>
                  <td>
                    <div className="bar-cell">
                      <div className="bar-fill" style={{ width: `${r.pct}%`, '--bar-color': r.pct > 20 ? '#f87171' : '#fb923c', background: `linear-gradient(90deg, ${r.pct > 20 ? '#f87171' : '#fb923c'}, transparent)`, maxWidth: 120 }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>

      <div style={{ marginTop: '1rem' }}>
        <InsightsPanel insights={cancellationInsights} title="🤖 Cancellation Intelligence — Why Clients Cancel" max={8} />
      </div>

      <FAQSection items={[
        { q: 'What is this page for?',
          a: 'It\'s the "why did they leave" view — it groups every cancellation by the reason the subscriber (or the system) recorded, so you can see which one or two problems are causing most of your cancellations and are worth fixing first. You\'ll find it as the "Cancellation Reasons" tab inside Retention Intelligence.' },
        { q: 'How is a cancellation counted — could the same person be counted twice?',
          a: 'No. Each unique investor-and-product combination is only counted once, using their latest cancelled cycle. So if someone cancelled a product, came back, and cancelled it again, that shows up as a single, up-to-date cancellation event, not two.' },
        { q: 'Why does "Total Cancellations" not match the bars on the Monthly Exit Trend chart?',
          a: 'The Monthly Exit Trend chart counts every exit event, whether or not a reason was logged for it. The "Total Cancellations" KPI and the reason breakdown below it only count exits that actually have a non-blank Cancellation Reason on file. So the monthly trend total can be higher than the reason-based figures — that gap is exactly the exits with no reason recorded.' },
        { q: 'What does the "Pareto" chart and the cumulative % line mean?',
          a: 'It\'s the classic "which few problems cause most of the pain" view: reasons are ranked from most to least common (bars), and the line running through them adds up their share as you go left to right. Where that line crosses 80% tells you the small handful of reasons responsible for the bulk of your cancellations — fix those first for the biggest impact.' },
        { q: 'How does the Period filter on this page affect the numbers?',
          a: 'It limits which subscription records are even looked at — only rows that were active at some point in, or exited during, your chosen window are counted, matching the same filter behavior as the rest of the dashboard. Clear it to see cancellation reasons across the full history in the file.' },
        { q: 'I clicked a bar and the drilldown shows a one-line summary instead of a subscriber list — why?',
          a: 'The chart uses a shortened version of long reason text to keep labels readable, and occasionally that shortened label doesn\'t match cleanly back to actual subscriber rows (for example, if the filtered dataset for this page has no matching rows). In that case it falls back to showing the reason\'s count and percentage instead of individual names.' },
        { q: 'Is "Cancellation Reason" the same thing as churn overall?',
          a: 'Not quite — this page only covers people who exited AND had a reason recorded for leaving. The broader picture of everyone who has left (with or without a stated reason) lives in the Unsubscriber and Retention tabs; this page is specifically for understanding the "why," not the full headcount of who left.' },
      ]} />
    </div>
  );
});
