import { memo, useState } from 'react';
import { formatNumber } from '../dataEngine';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function monthLabel(key) {
  const [yr, mo] = key.split('-').map(Number);
  return `${MONTH_NAMES[mo - 1]} '${String(yr).slice(2)}`;
}

export default memo(function Tab25RenewalCalendar({ renewalCalendar }) {
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');
  const months = renewalCalendar || [];

  const totalDue = months.reduce((s, m) => s + m.count, 0);
  const totalRevenue = months.reduce((s, m) => s + m.revenue, 0);
  const maxCount = Math.max(...months.map(m => m.count), 1);

  const selectedMonth = selected ? months.find(m => m.month === selected) : null;
  const rows = (selectedMonth?.rows || []).filter(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    return r.name.toLowerCase().includes(q) || r.pan.toLowerCase().includes(q) || r.product.toLowerCase().includes(q);
  });

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: '1.5rem' }}>📅</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>Renewal Calendar</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Active subscriptions expiring by month — plan outreach campaigns ahead of time</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-bright)', borderRadius: 12, padding: '1rem' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Renewals Due (next 12 mo)</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#00d4ff' }}>{formatNumber(totalDue)}</div>
        </div>
        <div style={{ background: 'var(--bg-card)', border: '1px solid #22c55e40', borderRadius: 12, padding: '1rem' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Revenue at Renewal</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#22c55e' }}>₹{formatNumber(totalRevenue)}</div>
        </div>
        <div style={{ background: 'var(--bg-card)', border: '1px solid #fbbf2440', borderRadius: 12, padding: '1rem' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Avg Monthly Renewals</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#fbbf24' }}>{months.length > 0 ? Math.round(totalDue / months.length) : 0}</div>
        </div>
        <div style={{ background: 'var(--bg-card)', border: '1px solid #a78bfa40', borderRadius: 12, padding: '1rem' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Peak Month</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#a78bfa' }}>
            {months.length > 0 ? monthLabel(months.reduce((max, m) => m.count > max.count ? m : max, months[0]).month) : '—'}
          </div>
        </div>
      </div>

      {/* Calendar Heat Grid */}
      <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: '1.5rem', border: '1px solid var(--border-default)' }}>
        <div style={{ fontWeight: 600, marginBottom: '1rem', color: 'var(--text-primary)' }}>Month-by-Month Renewal Volume</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10 }}>
          {months.map(m => {
            const pct = m.count / maxCount;
            const isSelected = selected === m.month;
            return (
              <div key={m.month}
                onClick={() => setSelected(isSelected ? null : m.month)}
                style={{
                  borderRadius: 10, padding: '0.9rem', cursor: 'pointer',
                  background: isSelected ? 'rgba(0,212,255,0.2)' : `rgba(0,212,255,${0.05 + pct * 0.35})`,
                  border: `1px solid ${isSelected ? 'var(--accent-cyan)' : `rgba(0,212,255,${0.1 + pct * 0.4})`}`,
                  transition: 'all 0.15s',
                }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{monthLabel(m.month)}</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: isSelected ? 'var(--accent-cyan)' : 'var(--text-primary)' }}>{m.count}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>₹{formatNumber(m.revenue)}</div>
              </div>
            );
          })}
        </div>
        {months.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>No upcoming renewals found in the next 12 months</div>
        )}
      </div>

      {/* Detail Table */}
      {selectedMonth && (
        <div style={{ background: 'var(--bg-card)', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border-default)' }}>
          <div style={{ padding: '1rem 1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-default)', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontWeight: 600, color: 'var(--accent-cyan)' }}>
              📅 {monthLabel(selectedMonth.month)} — {selectedMonth.count} renewals · ₹{formatNumber(selectedMonth.revenue)} at stake
            </div>
            <input placeholder="Search name / PAN / product…" value={search} onChange={e => setSearch(e.target.value)}
              style={{ padding: '6px 12px', fontSize: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)', width: 260 }} />
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--bg-elevated)' }}>
                  {['Name', 'PAN', 'Product', 'Broker', 'Cycle', 'Plan ₹', 'Expiry', 'Networth ₹'].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: ['Cycle', 'Plan ₹', 'Networth ₹'].includes(h) ? 'right' : 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11 }}>{h}</th>
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
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: '#22c55e', fontWeight: 600 }}>₹{r.planAmount.toLocaleString('en-IN')}</td>
                    <td style={{ padding: '7px 10px', color: 'var(--text-secondary)' }}>{r.expiryDate}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-secondary)' }}>{r.networth ? `₹${r.networth.toLocaleString('en-IN')}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
});
