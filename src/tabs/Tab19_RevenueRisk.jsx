import { memo, useState } from 'react';
import { formatNumber } from '../dataEngine';

const BUCKET_META = {
  critical: { label: '0 – 30 Days', color: '#f87171', bg: 'rgba(248,113,113,0.08)', icon: '🔴' },
  warning:  { label: '31 – 60 Days', color: '#fbbf24', bg: 'rgba(251,191,36,0.08)',   icon: '🟡' },
  watch:    { label: '61 – 90 Days', color: '#fb923c', bg: 'rgba(251,146,60,0.08)',    icon: '🟠' },
  safe:     { label: '90+ Days',     color: '#22c55e', bg: 'rgba(34,197,94,0.08)',      icon: '🟢' },
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
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Revenue at Risk (90 days)</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f87171' }}>₹{formatNumber(totalAtRisk)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{countAtRisk} unique investors</div>
        </div>
        {Object.entries(BUCKET_META).map(([key, meta]) => (
          <div key={key} style={{ background: meta.bg, border: `1px solid ${meta.color}40`, borderRadius: 12, padding: '1.2rem', cursor: 'pointer', outline: bucket === key ? `2px solid ${meta.color}` : 'none' }}
            onClick={() => setBucket(key)}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{meta.icon} {meta.label}</div>
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
    </div>
  );
});
