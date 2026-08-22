import { memo, useMemo } from 'react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import ChartCard from '../components/ChartCard';
import { YAxisTick } from '../components/YAxisTick';
import { formatCurrency, formatNumber } from '../dataEngine';

const COLORS = ['#00d4ff', '#fbbf24', '#22c55e', '#a78bfa', '#f87171', '#fb923c', '#2dd4bf'];

const Tip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-bright)', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
      <div style={{ color: 'var(--text-secondary)', marginBottom: 6 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, display: 'flex', gap: 8, justifyContent: 'space-between' }}>
          <span>{p.name}</span><span style={{ fontWeight: 600 }}>₹{Math.abs(Number(p.value)).toLocaleString('en-IN')}</span>
        </div>
      ))}
    </div>
  );
};

export default memo(function Tab18MRR({ mrrMetrics }) {
  const d = mrrMetrics || {};
  const kpis = [
    { label: 'Monthly Recurring Revenue', value: `₹${formatNumber(d.currentMRR || 0)}`, sub: 'Active subscriptions — plan-normalised', color: '#00d4ff',
      tooltip: 'Total plan revenue expected next month from currently active subscriptions. Annual plans are divided by 12, quarterly by 3, and half-yearly by 6 to get a monthly-equivalent figure (plans with no stated duration above ₹3,000 are also assumed annual).' },
    { label: 'Annual Run Rate (ARR)', value: `₹${formatNumber(d.currentARR || 0)}`, sub: 'MRR × 12', color: '#22c55e',
      tooltip: 'Monthly Recurring Revenue × 12 — a simple annualized projection of the current MRR snapshot, not a forecast of actual future billings.' },
    { label: 'Active Investors', value: formatNumber(d.activeInvestors || 0), sub: 'Unique PANs with active subscription', color: '#fbbf24',
      tooltip: 'Count of unique investors (by PAN) currently in an active status — Subscribed, Grace Period, or Cancelled-but-still-active — deduplicated so one investor with multiple rows is only counted once.' },
    { label: 'Avg Revenue / Investor', value: `₹${formatNumber(d.avgRevenuePerUser || 0)}/mo`, sub: 'MRR per unique investor', color: '#a78bfa',
      tooltip: 'Current MRR divided by Active Investors — the average monthly-equivalent revenue contributed per active investor.' },
  ];

  const trend = d.trend || [];
  const byProduct = d.byProduct || [];

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: '1.5rem' }}>💵</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-primary)' }}>MRR / ARR Tracker</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Monthly & Annual Recurring Revenue — plan amounts normalised to monthly basis</div>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ background: 'var(--bg-card)', border: `1px solid ${k.color}40`, borderRadius: 12, padding: '1.2rem' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
              {k.label}
              {k.tooltip && <span title={k.tooltip} style={{ cursor: 'help', color: 'var(--text-muted)' }}>ⓘ</span>}
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* MRR Trend */}
      {trend.length > 0 && (
        <ChartCard title="MRR Trend — New vs Churn"
          tooltip="Reconstructed from subscription history: green New MRR is revenue added by subscriptions starting that month, red Churn MRR is revenue lost from cycles that ended in cancellation that month, and cyan Active MRR is the running cumulative balance (New minus Churn carried forward) — an approximation of recurring revenue at each point in time.">
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
              <YAxis tickFormatter={v => `₹${(v / 1000).toFixed(0)}K`} tick={<YAxisTick />} />
              <Tooltip content={<Tip />} />
              <Legend iconType="circle" />
              <Area type="monotone" dataKey="activeMRR" name="Active MRR" stroke="#00d4ff" fill="#00d4ff20" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="newMRR" name="New MRR" stroke="#22c55e" fill="#22c55e20" strokeWidth={1.5} dot={false} />
              <Area type="monotone" dataKey="churnMRR" name="Churn MRR" stroke="#f87171" fill="#f8717120" strokeWidth={1.5} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* MRR by Product */}
      {byProduct.length > 0 && (
        <ChartCard title="MRR by Product"
          tooltip="Current monthly-equivalent revenue and annualized run rate broken down by product, based on today's active subscriptions only. The share bar shows each product's percentage contribution to total current MRR.">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
                  {['Product', 'Monthly Revenue', 'Annual Run Rate', 'Share'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: h === 'Product' ? 'left' : 'right', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {byProduct.map((r, i) => {
                  const totalMRR = byProduct.reduce((s, p) => s + p.mrr, 0);
                  const share = totalMRR > 0 ? (r.mrr / totalMRR * 100).toFixed(1) : 0;
                  return (
                    <tr key={r.product} style={{ borderBottom: '1px solid var(--border-default)', background: i % 2 === 0 ? 'transparent' : 'var(--bg-elevated)' }}>
                      <td style={{ padding: '8px 12px', color: 'var(--text-primary)', fontWeight: 500 }}><span style={{ color: COLORS[i % COLORS.length], marginRight: 8 }}>●</span>{r.product}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: '#22c55e', fontWeight: 600 }}>₹{r.mrr.toLocaleString('en-IN')}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: '#00d4ff' }}>₹{r.arr.toLocaleString('en-IN')}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                          <div style={{ width: 60, height: 4, background: 'var(--bg-elevated)', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${share}%`, height: '100%', background: COLORS[i % COLORS.length] }} />
                          </div>
                          {share}%
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </ChartCard>
      )}
    </div>
  );
});
