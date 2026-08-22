import { memo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import ChartCard from '../components/ChartCard';
import { YAxisTick } from '../components/YAxisTick';
import { formatCurrency, formatNumber } from '../dataEngine';

const Tip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-bright)', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
      <div style={{ color: 'var(--text-secondary)', marginBottom: 6 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, display: 'flex', gap: 8 }}>
          <span>{p.name}</span><span style={{ fontWeight: 600 }}>₹{Number(p.value).toLocaleString('en-IN')}</span>
        </div>
      ))}
    </div>
  );
};

export default memo(function Tab20LTV({ ltvData }) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('totalSpend');
  const d = ltvData || {};
  const investors = d.investors || [];
  const ltvByNW = d.ltvByNW || [];

  const filtered = investors.filter(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (r.name || '').toLowerCase().includes(q) || (r.pan || '').toLowerCase().includes(q);
  }).sort((a, b) => b[sortKey] - a[sortKey]);

  const kpis = [
    { label: 'Total Investor LTV', value: `₹${formatNumber(d.totalLTV || 0)}`, color: '#00d4ff', sub: 'All historical spend across all investors',
      tooltip: 'Sum of total historical spend — raw plan amounts, not monthly-equivalent — across every investor and every cycle/product they have ever held. This is actual realized revenue to date, not a projected or discounted lifetime value.' },
    { label: 'Avg LTV per Investor', value: `₹${formatNumber(d.avgLTV || 0)}`, color: '#22c55e', sub: 'Mean spend per unique PAN',
      tooltip: 'Total Investor LTV divided by the total number of unique investors (active and lapsed combined) — average historical spend per investor to date.' },
    { label: 'Avg Active LTV', value: `₹${formatNumber(d.avgActiveLTV || 0)}`, color: '#fbbf24', sub: 'Mean spend — currently active only',
      tooltip: 'Average historical spend to date, computed only across investors who are currently active — shows what your active base has actually paid so far, excluding lapsed investors.' },
    { label: 'Total Investors', value: formatNumber(d.totalInvestors || 0), color: '#a78bfa', sub: 'Unique PAN count in dataset',
      tooltip: 'Count of unique investors (by PAN) found in the full historical dataset — includes both currently active and lapsed/cancelled investors.' },
  ];

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: '1.5rem' }}>💎</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>Lifetime Value (LTV) Analysis</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Total revenue earned per unique investor across all products and cycles</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ background: 'var(--bg-card)', border: `1px solid ${k.color}40`, borderRadius: 12, padding: '1.2rem' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
              {k.label}
              {k.tooltip && <span title={k.tooltip} style={{ cursor: 'help', color: 'var(--text-muted)' }}>ⓘ</span>}
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {ltvByNW.length > 0 && (
        <ChartCard title="Avg LTV by Networth Tier"
          tooltip="Investors grouped by their reported net worth, showing the average historical spend to date within each tier — a proxy for whether wealthier investors also spend more on subscriptions, or whether that relationship breaks down at any tier.">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={ltvByNW}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
              <YAxis tickFormatter={v => `₹${(v / 1000).toFixed(0)}K`} tick={<YAxisTick />} />
              <Tooltip content={<Tip />} />
              <Bar dataKey="avgLTV" name="Avg LTV" fill="#fbbf24" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Top Investors Table */}
      <div style={{ background: 'var(--bg-card)', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border-default)' }}>
        <div style={{ padding: '1rem 1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-default)', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Top Investors by LTV</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input placeholder="Search name / PAN…" value={search} onChange={e => setSearch(e.target.value)}
              style={{ padding: '6px 12px', fontSize: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)', width: 220 }} />
            <select value={sortKey} onChange={e => setSortKey(e.target.value)}
              style={{ padding: '6px 10px', fontSize: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)' }}>
              <option value="totalSpend">Sort by LTV</option>
              <option value="cycles">Sort by Cycles</option>
              <option value="products">Sort by Products</option>
              <option value="networth">Sort by Networth</option>
            </select>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg-elevated)' }}>
                {['#', 'Name', 'PAN', 'Status', 'Products', 'Max Cycle', 'Total LTV ₹', 'Networth ₹', 'P&L ₹'].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: ['Total LTV ₹', 'Networth ₹', 'P&L ₹', 'Max Cycle'].includes(h) ? 'right' : 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 100).map((r, i) => (
                <tr key={r.pan} style={{ borderBottom: '1px solid var(--border-default)', background: i % 2 === 0 ? 'transparent' : 'var(--bg-elevated)' }}>
                  <td style={{ padding: '7px 10px', color: 'var(--text-muted)', fontSize: 11 }}>{i + 1}</td>
                  <td style={{ padding: '7px 10px', color: 'var(--text-primary)', fontWeight: 500 }}>{r.name}</td>
                  <td style={{ padding: '7px 10px', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 11 }}>{r.pan}</td>
                  <td style={{ padding: '7px 10px' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                      background: r.status === 'ACTIVE' ? 'rgba(34,197,94,0.15)' : 'rgba(248,113,113,0.15)',
                      color: r.status === 'ACTIVE' ? '#22c55e' : '#f87171' }}>
                      {r.status}
                    </span>
                  </td>
                  <td style={{ padding: '7px 10px', color: 'var(--text-secondary)' }}>{r.products}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-secondary)' }}>{r.cycles}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', color: '#fbbf24', fontWeight: 700 }}>₹{r.totalSpend.toLocaleString('en-IN')}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-secondary)' }}>{r.networth ? `₹${r.networth.toLocaleString('en-IN')}` : '—'}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', color: r.pnl >= 0 ? '#22c55e' : '#f87171', fontWeight: 600 }}>
                    {r.pnl !== 0 ? `${r.pnl >= 0 ? '+' : ''}₹${r.pnl.toLocaleString('en-IN')}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
});
