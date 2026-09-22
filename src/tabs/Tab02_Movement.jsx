import { memo } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine, Cell
} from 'recharts';
import ChartCard from '../components/ChartCard';
import InsightsPanel from '../components/InsightsPanel';
import SortableKPIGrid from '../components/SortableKPIGrid';
import DrilldownModal, { useDrilldown } from '../components/DrilldownModal';
import { useState, useMemo } from 'react';
import TabDateFilter from '../components/TabDateFilter';
import { parseExcelDate, normalizeData } from '../dataEngine';
import FAQSection from '../components/FAQSection';

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--bg-elevated)', border: '1px solid var(--border-bright)',
      borderRadius: 8, padding: '10px 14px', fontSize: 12,
    }}>
      <div style={{ color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 600 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, display: 'flex', gap: 8, justifyContent: 'space-between' }}>
          <span>{p.name}</span>
          <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{p.value?.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
};

export default memo(function Tab02Movement({ monthly, insights, filters, setFilters, currentMaster, rawData }) {
  const [showAll, setShowAll] = useState(false);
  const { drilldown, open: openDrilldown, close: closeDrilldown } = useDrilldown();
  const onDateChange = (from, to) => setFilters(prev => ({ ...prev, dateFrom: from, dateTo: to }));

  const handleMonthClick = (payload, type) => {
    if (!payload?.activePayload?.[0]) return;
    const monthKey = payload.activeLabel || payload.activePayload[0]?.payload?.month;
    if (!monthKey) return;
    const [yr, mo] = monthKey.split('-').map(Number);
    if (!yr || !mo) return;
    const from = new Date(yr, mo - 1, 1).getTime();
    const to   = new Date(yr, mo, 0, 23, 59, 59).getTime();

    let rows = [];
    const cols = [
      { key: 'name', label: 'Name' },
      { key: 'pan', label: 'PAN', cls: 'td-name' },
      { key: 'product', label: 'Product' },
      { key: 'broker', label: 'Broker' },
      { key: 'date', label: 'Date', align: 'right' },
      { key: 'cycle', label: 'Cycle', align: 'right', cls: 'td-num' },
    ];

    const src = currentMaster || [];
    if (type === 'new') {
      rows = src.filter(r => {
        const d = parseExcelDate(r['First Subscription Date']) || parseExcelDate(r['Subscription Start Date']);
        return d && d.getTime() >= from && d.getTime() <= to;
      }).map(r => ({
        name: r.Name || r.name || '—',
        pan: String(r.PAN || '').trim().toUpperCase(),
        product: r['Smallcase Name'] || '—',
        broker: r['Broker Name'] || r['Broker'] || '—',
        date: (parseExcelDate(r['First Subscription Date']) || parseExcelDate(r['Subscription Start Date']))?.toLocaleDateString('en-IN') || '—',
        cycle: r['Cycle Number'] || 1,
      }));
      openDrilldown(`New Subscribers — ${monthKey}`, `Investors who first subscribed in ${monthKey}`, rows, cols);
    } else if (type === 'exited') {
      const src2 = normalizeData(rawData || []);
      rows = src2.filter(r => {
        const exitDate = parseExcelDate(r['Cycle End Date'] || r['Exit Date']);
        const status = String(r['Latest Subscription Status'] || r['Cycle Level Status'] || '').toUpperCase();
        return exitDate && exitDate.getTime() >= from && exitDate.getTime() <= to && status === 'UNSUBSCRIBED';
      }).map(r => ({
        name: r.Name || r.name || '—',
        pan: String(r.PAN || '').trim().toUpperCase(),
        product: r['Smallcase Name'] || '—',
        broker: r['Broker Name'] || r['Broker'] || '—',
        date: (parseExcelDate(r['Cycle End Date'] || r['Exit Date']))?.toLocaleDateString('en-IN') || '—',
        cycle: r['Cycle Number'] || '—',
      }));
      openDrilldown(`Exited Subscribers — ${monthKey}`, `Investors who unsubscribed in ${monthKey}`, rows, cols);
    } else {
      // generic month stats — show the month record
      const m = monthly.find(m => m.month === monthKey);
      if (!m) return;
      openDrilldown(`Movement Detail — ${m.monthFull || monthKey}`, 'Monthly subscriber movement breakdown', [
        { metric: 'Opening Subscribers', value: m.opening?.toLocaleString() },
        { metric: 'New Subscribers', value: `+${m.new?.toLocaleString()}` },
        { metric: 'Exited Subscribers', value: m.exited?.toLocaleString() },
        { metric: 'Net Movement', value: (m.net >= 0 ? '+' : '') + m.net?.toLocaleString() },
        { metric: 'Closing Subscribers', value: m.closing?.toLocaleString() },
        { metric: 'Growth %', value: `${m.growthRate >= 0 ? '+' : ''}${m.growthRate}%` },
        { metric: 'Eligible for Renewal', value: m.eligible?.toLocaleString() || '—' },
        { metric: 'Renewed (from Eligible)', value: m.renewedEligible?.toLocaleString() || '—' },
        { metric: 'Renewal Conversion Rate', value: m.eligible > 0 ? `${m.eligibleRenewalRate}%` : '—' },
      ], [
        { key: 'metric', label: 'Metric' },
        { key: 'value', label: 'Value', align: 'right', cls: 'td-num' },
      ]);
    }
  };

  const movementInsights = useMemo(() => {
    if (!monthly?.length) return [];

    const best = [...monthly].sort((a, b) => b.net - a.net)[0];
    const bestNetPct = best.opening > 0 ? ((best.net / best.opening) * 100).toFixed(1) : '—';

    const worstExit = [...monthly].sort((a, b) => b.exited - a.exited)[0];

    const last = monthly.slice(-3);
    const prior = monthly.slice(-6, -3);
    const lastNet = last.reduce((s, m) => s + (m.net || 0), 0);
    const priorNet = prior.reduce((s, m) => s + (m.net || 0), 0);
    const trendAccel = lastNet > priorNet;
    const trendFlat  = lastNet === priorNet;

    let streak = 0;
    const streakPositive = monthly[monthly.length - 1]?.net >= 0;
    for (let i = monthly.length - 1; i >= 0; i--) {
      if (streakPositive ? monthly[i].net >= 0 : monthly[i].net < 0) streak++;
      else break;
    }

    let bestWindow = null;
    let bestWindowNet = -Infinity;
    for (let i = 0; i <= monthly.length - 3; i++) {
      const windowNet = monthly[i].net + monthly[i + 1].net + monthly[i + 2].net;
      if (windowNet > bestWindowNet) {
        bestWindowNet = windowNet;
        bestWindow = `${monthly[i].month}–${monthly[i + 2].month}`;
      }
    }

    const topNew = [...monthly].sort((a, b) => b.new - a.new)[0];

    const lowestClosing = [...monthly].sort((a, b) => a.closing - b.closing)[0];

    return [
      {
        icon: '🏆',
        category: 'Best Growth Month',
        title: `${best.month} — Net +${best.net.toLocaleString('en-IN')}`,
        detail: `Grew by ${bestNetPct}% on opening base of ${best.opening.toLocaleString('en-IN')} subscribers`,
        color: '#22c55e',
      },
      {
        icon: '📉',
        category: 'Worst Exit Month',
        title: `${worstExit.month} — ${worstExit.exited.toLocaleString('en-IN')} exited`,
        detail: `Highest single-month churn; net impact was ${worstExit.net >= 0 ? '+' : ''}${worstExit.net.toLocaleString('en-IN')}`,
        color: '#f87171',
      },
      {
        icon: trendAccel ? '⬆️' : trendFlat ? '➡️' : '⬇️',
        category: 'Growth Trend (Last 3M vs Prior 3M)',
        title: trendAccel ? 'Growth is Accelerating' : trendFlat ? 'Growth is Flat' : 'Growth is Decelerating',
        detail: `Last 3M net: ${lastNet >= 0 ? '+' : ''}${lastNet.toLocaleString('en-IN')} vs prior 3M: ${priorNet >= 0 ? '+' : ''}${priorNet.toLocaleString('en-IN')}`,
        color: trendAccel ? '#22c55e' : trendFlat ? '#64748b' : '#f87171',
      },
      {
        icon: streakPositive ? '🔥' : '❄️',
        category: 'Current Streak',
        title: `${streak} consecutive month${streak !== 1 ? 's' : ''} of ${streakPositive ? 'positive' : 'negative'} net`,
        detail: streakPositive
          ? `Unbroken growth run of ${streak} month${streak !== 1 ? 's' : ''} — momentum is sustained`
          : `${streak} month${streak !== 1 ? 's' : ''} of contraction — watch churn closely`,
        color: streakPositive ? '#22c55e' : '#f87171',
      },
      {
        icon: '📊',
        category: 'Best 3-Month Rolling Window',
        title: `${bestWindow} — cumulative net +${bestWindowNet.toLocaleString('en-IN')}`,
        detail: `Highest 3-month cumulative net addition across all overlapping windows`,
        color: '#a78bfa',
      },
      {
        icon: '🆕',
        category: 'Peak New Subscriber Month',
        title: `${topNew.month} — ${topNew.new.toLocaleString('en-IN')} new subscribers`,
        detail: `Highest single-month acquisition; net movement was ${topNew.net >= 0 ? '+' : ''}${topNew.net.toLocaleString('en-IN')}`,
        color: '#22d3ee',
      },
      {
        icon: '⚠️',
        category: 'Lowest Active Base Month',
        title: `${lowestClosing.month} — ${lowestClosing.closing.toLocaleString('en-IN')} closing subscribers`,
        detail: `Smallest month-end subscriber base on record — ${lowestClosing.closing.toLocaleString('en-IN')} active`,
        color: '#fbbf24',
      },
    ];
  }, [monthly]);

  if (!monthly?.length) return <div className="empty-state"><span className="empty-state-icon">📊</span><div>No movement data available</div></div>;

  const data = showAll ? monthly : monthly.slice(-18);
  const topGrowthMonth = [...monthly].sort((a, b) => b.new - a.new)[0];
  const topExitMonth = [...monthly].sort((a, b) => b.exited - a.exited)[0];
  const bestNetMonth = [...monthly].sort((a, b) => b.net - a.net)[0];
  const worstNetMonth = [...monthly].sort((a, b) => a.net - b.net)[0];

  const displayMonths = showAll ? monthly : monthly.slice(-24);

  const summaryKpis = [
    { id: 'best_growth', label: 'Best Growth Month', value: topGrowthMonth?.month, sub: `+${topGrowthMonth?.new?.toLocaleString()} new`, accent: '#22c55e', icon: '📈',
      tooltip: 'The single calendar month with the highest count of brand-new Cycle 1 subscriptions (not net growth — a month can top this chart and still lose overall if exits were also high).' },
    { id: 'highest_exit', label: 'Highest Exit Month', value: topExitMonth?.month, sub: `${topExitMonth?.exited?.toLocaleString()} exited`, accent: '#f87171', icon: '📉',
      tooltip: 'The single calendar month with the highest number of subscriptions that ended (by Cycle End Date) and were not renewed within the 15-day grace window.' },
    { id: 'best_net', label: 'Best Net Month', value: bestNetMonth?.month, sub: `Net +${bestNetMonth?.net?.toLocaleString()}`, accent: '#00d4ff', icon: '🏆',
      tooltip: 'The month with the largest gain in closing minus opening subscription count — the best month for overall base growth, combining new starts, renewals and exits together.' },
    { id: 'worst_net', label: 'Worst Net Month', value: worstNetMonth?.month, sub: `Net ${worstNetMonth?.net?.toLocaleString()}`, accent: '#f87171', icon: '⚠️',
      tooltip: 'The month with the largest drop in closing minus opening subscription count — the worst month for overall base growth (exits outpaced new starts and renewals by the widest margin).' },
  ];

  return (
    <div>
      <DrilldownModal drilldown={drilldown} onClose={closeDrilldown} />

      <div className="section-heading">
        <div><div className="section-title">📊 Subscriber Movement Analytics</div><div className="section-subtitle">Monthly flow of new, exited and net subscriber changes</div></div>
        <div className="section-divider" />
        <button className="btn-icon" onClick={() => setShowAll(s => !s)}>
          {showAll ? '📅 Last 24 Months' : '📅 All Time'}
        </button>
      </div>

      <TabDateFilter dateFrom={filters?.dateFrom} dateTo={filters?.dateTo} onChange={onDateChange} />

      {/* Summary Cards */}
      <SortableKPIGrid storageKey="movement" cards={summaryKpis} cols="150px" />

      {/* Waterfall / Movement Chart */}
      <ChartCard title="Subscriber Waterfall — Monthly Movement" subtitle="Click any bar to see subscriber details for that month" badge="All Time"
        tooltip="Opening = active subscriptions counted at month start; New = fresh Cycle 1 starts that month; Exited = subscriptions whose cycle ended that month without renewing (past the 15-day grace window); Closing = active subscriptions counted at month end.">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={displayMonths} onClick={p => handleMonthClick(p, 'waterfall')} style={{ cursor: 'pointer' }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
            <XAxis dataKey="month" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="opening" name="Opening" fill="#475569" radius={[2, 2, 0, 0]} />
            <Bar dataKey="new" name="New" fill="#22c55e" radius={[2, 2, 0, 0]} onClick={(d) => { openDrilldown(`New Subscribers — ${d.month}`, `Investors who first subscribed in ${d.month}`, (() => { const [yr, mo] = d.month.split('-').map(Number); const from = new Date(yr, mo-1, 1).getTime(), to = new Date(yr, mo, 0, 23, 59, 59).getTime(); return (currentMaster||[]).filter(r => { const dt = parseExcelDate(r['First Subscription Date'])||parseExcelDate(r['Subscription Start Date']); return dt && dt.getTime()>=from && dt.getTime()<=to; }).map(r => ({ name: r.Name||r.name||'—', pan: String(r.PAN||'').trim().toUpperCase(), product: r['Smallcase Name']||'—', broker: r['Broker Name']||r['Broker']||'—', date: (parseExcelDate(r['First Subscription Date'])||parseExcelDate(r['Subscription Start Date']))?.toLocaleDateString('en-IN')||'—', cycle: r['Cycle Number']||1 })); })(), [{ key:'name',label:'Name' },{ key:'pan',label:'PAN',cls:'td-name' },{ key:'product',label:'Product' },{ key:'broker',label:'Broker' },{ key:'date',label:'Date',align:'right' },{ key:'cycle',label:'Cycle',align:'right',cls:'td-num' }]); }} />
            <Bar dataKey="exited" name="Exited" fill="#f87171" radius={[2, 2, 0, 0]} onClick={(d) => { openDrilldown(`Exited Subscribers — ${d.month}`, `Investors who unsubscribed in ${d.month}`, (() => { const [yr, mo] = d.month.split('-').map(Number); const from = new Date(yr, mo-1, 1).getTime(), to = new Date(yr, mo, 0, 23, 59, 59).getTime(); return (rawData||[]).filter(r => { const dt = parseExcelDate(r['Cycle End Date']||r['Exit Date']); const st = String(r['Latest Subscription Status']||r['Cycle Level Status']||'').toUpperCase(); return dt && dt.getTime()>=from && dt.getTime()<=to && st==='UNSUBSCRIBED'; }).map(r => ({ name: r.Name||r.name||'—', pan: String(r.PAN||'').trim().toUpperCase(), product: r['Smallcase Name']||'—', broker: r['Broker Name']||r['Broker']||'—', date: (parseExcelDate(r['Cycle End Date']||r['Exit Date']))?.toLocaleDateString('en-IN')||'—', cycle: r['Cycle Number']||'—' })); })(), [{ key:'name',label:'Name' },{ key:'pan',label:'PAN',cls:'td-name' },{ key:'product',label:'Product' },{ key:'broker',label:'Broker' },{ key:'date',label:'Exit Date',align:'right' },{ key:'cycle',label:'Last Cycle',align:'right',cls:'td-num' }]); }} />
            <Bar dataKey="closing" name="Closing" fill="#00d4ff" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <div className="chart-clickable-hint">💡 Click the New (green) or Exited (red) bars to see subscriber details</div>
      </ChartCard>

      <div className="charts-grid charts-grid-2" style={{ marginTop: '1rem' }}>
        {/* Net Additions */}
        <ChartCard title="Net Monthly Additions" subtitle="Click a bar to see monthly movement breakdown"
          tooltip="Closing minus opening subscriptions for the month. Green bars above zero mean the base grew that month; red bars below zero mean more subscriptions ended than were added.">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={displayMonths} onClick={p => handleMonthClick(p, 'net')} style={{ cursor: 'pointer' }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
              <XAxis dataKey="month" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={0} stroke="var(--border-bright)" strokeWidth={2} />
              <Bar dataKey="net" name="Net Additions" radius={[3, 3, 0, 0]}>
                {displayMonths.map((m, i) => (
                  <Cell key={i} fill={m.net >= 0 ? '#22c55e' : '#f87171'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="chart-clickable-hint">💡 Click a bar for full month details</div>
        </ChartCard>

        {/* Growth Rate Trend */}
        <ChartCard title="Monthly Growth Rate Trend" subtitle="Month-over-month % growth in subscriber base"
          tooltip="Net change (closing − opening) as a percentage of that month's opening base. Lets you compare growth momentum across months of different sizes, not just raw subscriber counts.">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={displayMonths}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
              <XAxis dataKey="month" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} unit="%" />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={0} stroke="#fbbf24" strokeDasharray="4 4" />
              <Line type="monotone" dataKey="growthRate" name="Growth %" stroke="#fbbf24" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Monthly Movement Table */}
      <ChartCard title="Monthly Movement Detail Table" subtitle="Opening balance, new, exited, net, closing and renewal conversion per month" style={{ marginTop: '1rem' }}
        tooltip="Eligible = subscriptions whose cycle ended that month (due to renew); Renewed = of those, how many actually resubscribed within the 15-day grace window; Renewal % = Renewed ÷ Eligible — the true conversion rate for subscribers who reached a renewal decision point.">
        <div className="data-table-wrap" style={{ maxHeight: 380, overflowY: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Month</th>
                <th style={{ textAlign: 'right' }}>Opening</th>
                <th style={{ textAlign: 'right' }}>New</th>
                <th style={{ textAlign: 'right' }}>Exited</th>
                <th style={{ textAlign: 'right' }}>Net</th>
                <th style={{ textAlign: 'right' }}>Closing</th>
                <th style={{ textAlign: 'right' }}>Growth %</th>
                <th style={{ textAlign: 'right' }}>Eligible</th>
                <th style={{ textAlign: 'right' }}>Renewed</th>
                <th style={{ textAlign: 'right' }}>Renewal %</th>
              </tr>
            </thead>
            <tbody>
              {[...monthly].reverse().map((m, i) => (
                <tr key={i}>
                  <td className="td-name">{m.monthFull}</td>
                  <td className="td-num">{m.opening?.toLocaleString()}</td>
                  <td className="td-good">+{m.new?.toLocaleString()}</td>
                  <td className="td-bad">{m.exited?.toLocaleString()}</td>
                  <td className={m.net >= 0 ? 'td-good' : 'td-bad'}>{m.net >= 0 ? '+' : ''}{m.net?.toLocaleString()}</td>
                  <td className="td-num">{m.closing?.toLocaleString()}</td>
                  <td className={m.growthRate >= 0 ? 'td-good' : 'td-bad'}>{m.growthRate >= 0 ? '+' : ''}{m.growthRate}%</td>
                  <td className="td-num">{m.eligible?.toLocaleString() || '—'}</td>
                  <td className="td-good">{m.renewedEligible?.toLocaleString() || '—'}</td>
                  <td className={m.eligibleRenewalRate >= 50 ? 'td-good' : 'td-bad'}>{m.eligible > 0 ? `${m.eligibleRenewalRate}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>

      <div style={{ marginTop: '1rem' }}>
        <InsightsPanel insights={movementInsights} title="🤖 Growth Intelligence — Monthly Movement Analysis" max={8} />
      </div>

      <FAQSection items={[
        { q: 'What is this page for?',
          a: 'It tracks how the subscriber base changes month by month — who joined, who left, who renewed, and whether the total is growing or shrinking. Think of it as a monthly bank statement for subscribers: an opening balance, money in, money out, and a closing balance.' },
        { q: 'How are "Opening" and "Closing" actually counted?',
          a: 'Opening is how many subscriptions were active at the very start of the month; Closing is how many were active at the very end. If one person holds 2 products, that counts as 2 in both — this page counts subscriptions, not people.' },
        { q: 'What\'s the difference between "New" and "Renewals"?',
          a: 'New means a brand-new subscriber starting their very first cycle (Cycle 1) that month. Renewals means an existing subscriber starting their 2nd cycle or later that month — i.e. they paid again to continue. Someone who joins and leaves in the same month still counts as both New and Exited, so the net effect on that month is zero even though two events happened.' },
        { q: 'Why does "Exited" not match a simple count of cancellations that month?',
          a: 'When someone\'s subscription cycle ends, they get a 15-day grace window to pay and continue before it\'s counted as a real exit. If they renew anywhere inside that window, it\'s counted as a renewal, not an exit — even if the payment lands in the next calendar month. Only subscriptions where the grace window passed with no renewal are counted as Exited.' },
        { q: 'What do "Eligible" and "Renewal %" in the table mean?',
          a: 'Eligible is how many subscriptions reached the end of their cycle that month — i.e. they had to make a renew-or-leave decision. Renewed is how many of those actually renewed within the grace window. Renewal % = Renewed ÷ Eligible, which is a purer measure of "when people were asked to renew, how many said yes" than the overall Retention Rate on the Executive page, which also includes people who weren\'t due to renew at all.' },
        { q: 'Does picking a period (like 3M or 6M) change what this page shows?',
          a: 'Yes — every chart and the table on this page are scoped to whatever period you select. It\'s not "who was active at some point," it\'s built from the actual monthly opening/new/exited/closing activity that happened inside that window.' },
        { q: 'Why might "Net Growth" look small even in a month with a lot of New subscribers?',
          a: 'Net is New minus Exited (plus the renewal effect washes out since renewals don\'t change the headcount). A big New number can be offset by an equally big Exited number in the same month — check both bars on the waterfall chart together rather than just one.' },
      ]} />
    </div>
  );
});
