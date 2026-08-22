import { memo } from 'react';
import ChartCard from '../components/ChartCard';
import SortableKPIGrid from '../components/SortableKPIGrid';
import { formatCurrency, formatNumber } from '../dataEngine';

export default memo(function Tab12Insights({ insights = [], kpis, products, brokerMetrics, geoMetrics, monthly }) {
  if (!insights?.length) return (
    <div className="empty-state"><span className="empty-state-icon">🤖</span><div>Load data to generate AI insights</div></div>
  );

  // Build additional computed insights
  const allInsights = [...insights];

  // Add product lifecycle insight
  if (products?.length >= 2) {
    const sortedByPnL = [...products].sort((a, b) => b.avgPnL - a.avgPnL);
    allInsights.push({
      icon: '📈',
      category: 'Portfolio Performance',
      color: '#22c55e',
      title: `${sortedByPnL[0]?.product} generates the best portfolio returns for investors`,
      detail: `Avg PnL: ₹${sortedByPnL[0]?.avgPnL?.toLocaleString()} vs ${sortedByPnL[sortedByPnL.length-1]?.product} at ₹${sortedByPnL[sortedByPnL.length-1]?.avgPnL?.toLocaleString()}`,
    });
  }

  // Add cohort quality insight
  if (monthly?.length >= 6) {
    const recent3 = monthly.slice(-3);
    const prev3 = monthly.slice(-6, -3);
    const recentNewAvg = recent3.reduce((a, m) => a + m.new, 0) / 3;
    const prevNewAvg = prev3.reduce((a, m) => a + m.new, 0) / 3;
    const acqChange = prevNewAvg > 0 ? ((recentNewAvg - prevNewAvg) / prevNewAvg * 100).toFixed(0) : 0;
    allInsights.push({
      icon: '🎯',
      category: 'Acquisition Trend',
      color: acqChange >= 0 ? '#22c55e' : '#f87171',
      title: `New subscription acquisition ${acqChange >= 0 ? 'accelerated' : 'decelerated'} by ${Math.abs(acqChange)}% in the last quarter`,
      detail: `Recent 3-month avg: ${Math.round(recentNewAvg)} new/month vs prior 3-month: ${Math.round(prevNewAvg)} new/month`,
    });
  }

  // Revenue potential
  if (kpis?.avgPlanAmount && kpis?.exitedSubscribers) {
    const recoveryPotential = kpis.exitedSubscribers * kpis.avgPlanAmount;
    allInsights.push({
      icon: '💡',
      category: 'Win-Back Opportunity',
      color: '#fbbf24',
      title: `Recovering 20% of exited subscribers could generate ₹${formatCurrency(recoveryPotential * 0.2, true)} in incremental revenue`,
      detail: `${kpis.exitedSubscribers.toLocaleString()} exited users × ₹${kpis.avgPlanAmount.toLocaleString()} avg plan × 20% win-back scenario`,
    });
  }

  // Plan amount tier insight
  if (kpis?.avgPlanAmount && kpis?.medianNetworth) {
    const planToNWRatio = kpis.medianNetworth > 0 ? (kpis.avgPlanAmount / kpis.medianNetworth * 100).toFixed(2) : 0;
    allInsights.push({
      icon: '⚖️',
      category: 'Affordability Index',
      color: '#a78bfa',
      title: `Average plan is ${planToNWRatio}% of median investor networth`,
      detail: `Avg plan: ₹${kpis.avgPlanAmount?.toLocaleString()} · Median networth: ₹${kpis.medianNetworth?.toLocaleString()}`,
    });
  }

  // ── WHERE WE ARE LAGGING (monthly-based) ─────────────────────────────────

  // Renewal conversion rate trend — is it getting worse?
  if (monthly?.length >= 6) {
    const eligible3 = monthly.slice(-3).filter(m => m.eligible > 0);
    const eligiblePrev3 = monthly.slice(-6, -3).filter(m => m.eligible > 0);
    if (eligible3.length && eligiblePrev3.length) {
      const recentRate = eligible3.reduce((a, m) => a + m.eligibleRenewalRate, 0) / eligible3.length;
      const prevRate   = eligiblePrev3.reduce((a, m) => a + m.eligibleRenewalRate, 0) / eligiblePrev3.length;
      const delta = +(recentRate - prevRate).toFixed(1);
      allInsights.push({
        icon: delta >= 0 ? '📈' : '📉',
        category: 'Renewal Conversion Trend',
        color: delta >= 0 ? '#22c55e' : '#f87171',
        title: `Renewal conversion rate ${delta >= 0 ? 'improved' : 'declined'} by ${Math.abs(delta)}pp over the last quarter`,
        detail: `Recent 3-month avg: ${recentRate.toFixed(1)}% vs prior 3-month: ${prevRate.toFixed(1)}% — ${delta < 0 ? 'review renewal drivers urgently' : 'sustain current approach'}`,
      });
    }
  }

  // Months where churn rate exceeded 5%
  if (monthly?.length >= 3) {
    const highChurnMonths = monthly.filter(m => m.churnRate > 5);
    if (highChurnMonths.length >= 2) {
      const worst = [...highChurnMonths].sort((a, b) => b.churnRate - a.churnRate)[0];
      allInsights.push({
        icon: '🚨',
        category: 'High Churn Pattern',
        color: '#f87171',
        title: `${highChurnMonths.length} months recorded churn rate above 5% — worst was ${worst.month} at ${worst.churnRate}%`,
        detail: `Systemic exit pressure detected. Review subscriber experience, pricing, and product quality in those periods`,
      });
    }
  }

  // Low renewal conversion months
  if (monthly?.length >= 3) {
    const lowConvMonths = monthly.filter(m => m.eligible > 50 && m.eligibleRenewalRate < 50);
    if (lowConvMonths.length >= 2) {
      const worst = [...lowConvMonths].sort((a, b) => a.eligibleRenewalRate - b.eligibleRenewalRate)[0];
      allInsights.push({
        icon: '⚠️',
        category: 'Renewal Conversion Gap',
        color: '#fbbf24',
        title: `${lowConvMonths.length} months had renewal conversion below 50% — worst was ${worst.month} at ${worst.eligibleRenewalRate}%`,
        detail: `${worst.eligible?.toLocaleString()} eligible, only ${worst.renewedEligible?.toLocaleString()} renewed. Proactive pre-expiry outreach could close this gap`,
      });
    }
  }

  // Net loss streak (if still ongoing)
  if (monthly?.length >= 2) {
    const last = monthly[monthly.length - 1];
    const prev = monthly[monthly.length - 2];
    if (last.net < 0 && prev.net < 0) {
      const recentLoss = monthly.slice(-6).filter(m => m.net < 0);
      const totalDrop = recentLoss.reduce((a, m) => a + m.net, 0);
      allInsights.push({
        icon: '🔴',
        category: 'Subscriber Base Shrinking',
        color: '#f87171',
        title: `Net subscriber base has declined in ${recentLoss.length} of the last 6 months (total: ${totalDrop.toLocaleString()})`,
        detail: `Exits are consistently outpacing new subscriptions — acquisition and retention must be addressed simultaneously`,
      });
    }
  }

  const categories = [...new Set(allInsights.map(i => i.category))];

  return (
    <div>
      <div className="section-heading">
        <div>
          <div className="section-title">🤖 Advanced Executive Insights</div>
          <div className="section-subtitle">AI-generated actionable intelligence for leadership decision-making</div>
        </div>
        <div className="section-divider" />
        <div className="section-badge">{allInsights.length} Insights</div>
      </div>

      {/* Summary Metrics */}
      <SortableKPIGrid storageKey="insights" cols="200px" cards={[
        { id: 'total_insights', label: 'Total Insights Generated', value: allInsights.length, accent: 'var(--accent-cyan)',  icon: '🤖',
          tooltip: 'Count of every auto-generated narrative insight on this page — the base insights plus the additional performance, trend and revenue-opportunity insights computed here.' },
        { id: 'growth_opps',   label: 'Growth Opportunities',      value: allInsights.filter(i => ['Growth Leader','Acquisition Trend','Win-Back Opportunity','Retention Champion'].includes(i.category)).length, accent: 'var(--accent-green)', icon: '📈',
          tooltip: 'Insights flagging positive momentum or untapped upside — strong performers, accelerating acquisition, and win-back revenue potential.' },
        { id: 'lag_alerts',    label: 'Lagging Areas',             value: allInsights.filter(i => ['Retention Laggard','Distributor Laggard','Regional Laggard','Decline Alert','Acquisition Slowdown','Exit Spike','High Churn Pattern','Renewal Conversion Gap','Subscriber Base Shrinking'].includes(i.category)).length, accent: 'var(--accent-red)', icon: '⚠️',
          tooltip: 'Insights flagging underperformance that needs attention — retention/distributor/regional laggards, declines, high-churn months, and renewal conversion gaps.' },
        { id: 'quality_sigs',  label: 'Quality Signals',           value: allInsights.filter(i => ['HNI Magnet','Retention Champion','Top Distributor','Platform Health'].includes(i.category)).length, accent: 'var(--accent-gold)',  icon: '💎',
          tooltip: 'Insights highlighting particularly strong, healthy signals in the business — high-value investor attraction, top retention performers, top distributors, and overall platform health.' },
      ]} />

      {/* Full Insights Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {allInsights.map((ins, i) => (
          <div key={i} style={{
            background: 'var(--bg-card)',
            border: `1px solid ${ins.color || 'var(--border-default)'}22`,
            borderLeft: `3px solid ${ins.color || 'var(--accent-cyan)'}`,
            borderRadius: 'var(--radius-lg)',
            padding: '1rem 1.25rem',
            transition: 'all 0.2s',
          }}>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '1.4rem', lineHeight: 1, flexShrink: 0, marginTop: 2 }}>{ins.icon}</span>
              <div>
                <div style={{
                  fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em',
                  fontWeight: 700, color: ins.color || 'var(--accent-cyan)', marginBottom: 4,
                }}>{ins.category}</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-primary)', fontWeight: 500, lineHeight: 1.5, marginBottom: 6 }}>
                  {ins.title}
                </div>
                {ins.detail && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    {ins.detail}
                  </div>
                )}
              </div>
            </div>
            <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-dim)', display: 'flex', gap: 6 }}>
              <span style={{
                background: `${ins.color || 'var(--accent-cyan)'}22`,
                border: `1px solid ${ins.color || 'var(--accent-cyan)'}33`,
                borderRadius: 20, padding: '2px 8px', fontSize: '0.68rem',
                color: ins.color || 'var(--accent-cyan)',
              }}>{ins.category}</span>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
                Insight #{i + 1}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Category Summary */}
      <ChartCard title="Insights by Category" subtitle="Distribution of generated insights across different intelligence dimensions"
        tooltip="How the generated insights are spread across intelligence categories — a category with many insights is where the most notable patterns (good or bad) were detected this period.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem', padding: '0.5rem 0' }}>
          {categories.map(cat => {
            const catInsights = allInsights.filter(i => i.category === cat);
            const color = catInsights[0]?.color || 'var(--accent-cyan)';
            return (
              <div key={cat} style={{
                background: `${color}11`, border: `1px solid ${color}22`,
                borderRadius: 8, padding: '0.75rem 1rem',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <span style={{ fontSize: '1.2rem' }}>{catInsights[0]?.icon}</span>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color }}>{cat}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{catInsights.length} insight{catInsights.length > 1 ? 's' : ''}</div>
                </div>
              </div>
            );
          })}
        </div>
      </ChartCard>
    </div>
  );
});
