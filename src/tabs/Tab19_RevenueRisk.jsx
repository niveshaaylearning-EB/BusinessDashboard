import { memo, useState } from 'react';
import { formatNumber } from '../dataEngine';
import FAQSection from '../components/FAQSection';

const BUCKET_META = {
  critical: { label: '0 – 30 Days', color: '#f87171', bg: 'rgba(248,113,113,0.08)', icon: '🔴',
    tooltip: 'Active subscriptions whose current cycle ends within the next 30 days — the highest-urgency renewal outreach window (High churn risk). The ₹ figure is the full plan amount at stake, not a monthly-equivalent.' },
  warning:  { label: '31 – 60 Days', color: '#fbbf24', bg: 'rgba(251,191,36,0.08)',   icon: '🟡',
    tooltip: 'Active subscriptions renewing in 31–60 days (Medium churn risk) — a second-priority outreach window before they lapse.' },
  watch:    { label: '61 – 90 Days', color: '#fb923c', bg: 'rgba(251,146,60,0.08)',    icon: '🟠',
    tooltip: 'Active subscriptions renewing in 61–90 days (Low churn risk by the model, but worth an early heads-up) — a planning window to line up renewal outreach ahead of time.' },
  safe:     { label: '90+ Days',     color: '#22c55e', bg: 'rgba(34,197,94,0.08)',      icon: '🟢',
    tooltip: 'Active subscriptions with more than 90 days left on their current cycle — not yet due for renewal outreach.' },
};

export default memo(function Tab19RevenueRisk({ revenueAtRisk }) {
  const [bucket, setBucket] = useState('critical');
  const [search, setSearch] = useState('');
  const d = revenueAtRisk || {};
  const buckets = d.buckets || {};

  const totalAtRisk = ((buckets.critical?.revenue || 0) + (buckets.warning?.revenue || 0) + (buckets.watch?.revenue || 0));
  const countAtRisk = ((buckets.critical?.count || 0) + (buckets.warning?.count || 0) + (buckets.watch?.count || 0));

  const rows = (buckets[bucket]?.rows || []).filter(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (r.name||'').toLowerCase().includes(q) || (r.pan||'').toLowerCase().includes(q) || (r.product||'').toLowerCase().includes(q);
  });

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: '1.5rem' }}>⚠️</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-primary)' }}>Revenue at Risk</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Active subscriptions expiring soon — outreach opportunities before churn</div>
        </div>
      </div>

      {/* Summary KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <div style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 12, padding: '1.2rem' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
            Revenue at Risk (90 days)
            <span title="Sum of full plan amounts (not monthly-equivalent) for active subscriptions whose current cycle ends within the next 90 days — the renewal revenue that could be lost if these accounts don't renew. Subscriptions expiring beyond 90 days are excluded." style={{ cursor: 'help', color: 'var(--text-muted)' }}>ⓘ</span>
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f87171' }}>₹{formatNumber(totalAtRisk)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{countAtRisk} unique investors</div>
        </div>
        {Object.entries(BUCKET_META).map(([key, meta]) => (
          <div key={key} style={{ background: meta.bg, border: `1px solid ${meta.color}40`, borderRadius: 12, padding: '1.2rem', cursor: 'pointer', outline: bucket === key ? `2px solid ${meta.color}` : 'none' }}
            onClick={() => setBucket(key)}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
              {meta.icon} {meta.label}
              {meta.tooltip && <span title={meta.tooltip} style={{ cursor: 'help', color: 'var(--text-muted)' }}>ⓘ</span>}
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: meta.color }}>{formatNumber(buckets[key]?.count || 0)}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>₹{formatNumber(buckets[key]?.revenue || 0)} at stake</div>
          </div>
        ))}
      </div>

      {/* Bucket Detail Table */}
      <div style={{ background: 'var(--bg-card)', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border-default)' }}>
        <div style={{ padding: '1rem 1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-default)' }}>
          <div style={{ fontWeight: 600, color: BUCKET_META[bucket].color }}>
            {BUCKET_META[bucket].icon} {BUCKET_META[bucket].label} — {buckets[bucket]?.count || 0} investors
          </div>
          <input placeholder="Search name / PAN / product…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ padding: '6px 12px', fontSize: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)', width: 260 }} />
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg-elevated)' }}>
                {['Name', 'PAN', 'Product', 'Broker', 'Cycle', 'Plan ₹', 'Expiry', 'Days Left', 'Risk'].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 100).map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border-default)', background: i % 2 === 0 ? 'transparent' : 'var(--bg-elevated)' }}>
                  <td style={{ padding: '7px 10px', color: 'var(--text-primary)', fontWeight: 500 }}>{r.name}</td>
                  <td style={{ padding: '7px 10px', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 11 }}>{r.pan}</td>
                  <td style={{ padding: '7px 10px', color: 'var(--text-secondary)' }}>{r.product}</td>
                  <td style={{ padding: '7px 10px', color: 'var(--text-muted)', fontSize: 11 }}>{r.broker}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-secondary)' }}>{r.cycle}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', color: '#22c55e', fontWeight: 600 }}>₹{(r.planAmount || 0).toLocaleString('en-IN')}</td>
                  <td style={{ padding: '7px 10px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{r.expiryDate}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', color: r.daysLeft <= 30 ? '#f87171' : r.daysLeft <= 60 ? '#fbbf24' : 'var(--text-secondary)', fontWeight: 600 }}>{r.daysLeft}d</td>
                  <td style={{ padding: '7px 10px' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                      background: r.churnRisk === 'High' ? 'rgba(248,113,113,0.2)' : r.churnRisk === 'Medium' ? 'rgba(251,191,36,0.2)' : 'rgba(34,197,94,0.2)',
                      color: r.churnRisk === 'High' ? '#f87171' : r.churnRisk === 'Medium' ? '#fbbf24' : '#22c55e' }}>
                      {r.churnRisk}
                    </span>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={9} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No investors in this window</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <FAQSection items={[
        { q: 'What is this page for?',
          a: 'A heads-up list of active subscriptions that are about to come up for renewal in the next 90 days, grouped by how soon — so your team knows exactly who to reach out to first before they lapse. Think of it as a renewal to-do list ordered by urgency, plus how much plan revenue is riding on each group.' },
        { q: 'Why doesn\'t picking a Period (like "Last 6 Months") on other tabs change anything here?',
          a: 'This page is intentionally built to always look forward from today, not backward at a selected date range. It answers "what\'s expiring soon, starting from right now" — a subscription due in 20 days is just as urgent whether you\'re viewing "last month" or "this year" on the rest of the dashboard, so the past-dated Period filter is deliberately left out of this calculation. Product, broker, and state filters still narrow the list, since those describe who the subscriber is rather than when you\'re looking.' },
        { q: 'How are the four buckets (0–30, 31–60, 61–90, 90+ days) decided?',
          a: 'Each active subscription\'s current cycle has an end date (when it\'s due to renew). The gap between today and that end date determines the bucket — for example, a subscription ending in 25 days falls in the 0–30 day bucket. Only subscriptions with a future end date are counted at all; anything already past its end date is excluded (it would show up elsewhere as already exited/unsubscribed).' },
        { q: 'What does the ₹ figure in each bucket actually represent?',
          a: 'It\'s the sum of the full plan amount for every subscription in that bucket — not a monthly-equivalent figure like on the MRR page. So an annual plan worth ₹12,000 shows as the full ₹12,000 "at risk," since that\'s the actual renewal revenue that would be lost if the investor doesn\'t come back.' },
        { q: 'What does "Revenue at Risk (90 days)" at the top include, and why isn\'t the 90+ bucket part of it?',
          a: 'It\'s the total across the 0–30, 31–60, and 61–90 day buckets — everything due for renewal within the next three months. The 90+ Days bucket (green, "safe") is shown for context but deliberately excluded from that headline total, since those renewals are far enough out that they\'re not yet an active outreach priority.' },
        { q: 'How is "Churn Risk" (High/Medium/Low) worked out — is it a predictive model?',
          a: 'It\'s not a predictive score — it\'s a direct restatement of the time bucket: High risk means renewing within 30 days, Medium means 31–60 days, and Low means 61–90 days. It\'s a simple urgency label, not a statistical likelihood of actually churning.' },
        { q: 'Someone I know unsubscribed weeks ago — why do they still show up here?',
          a: 'They shouldn\'t — this page only includes subscriptions that are currently active with a cycle end date still in the future. If someone genuinely cancelled, check whether their record was actually updated to a cancelled/unsubscribed status in the source data; a stale status is usually a data-upload timing issue rather than this page miscounting.' },
      ]} />
    </div>
  );
});
