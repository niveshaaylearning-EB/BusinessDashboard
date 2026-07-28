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
        <div key={i} style={{ color: p.color, display: 'flex', gap: 8, justifyContent: 'space-between' }}>
          <span>{p.name}</span><span style={{ fontWeight: 600 }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
};

export default memo(function Tab24RMPerformance({ rmPerformance }) {
  const [sortKey, setSortKey] = useState('total');
  const [search, setSearch] = useState('');
  const data = (rmPerformance || []).filter(r => r.rm !== 'Unassigned' || r.total > 0);

  if (!data.length) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: '3rem', marginBottom: 12 }}>📋</div>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>No RM Data Found</div>
        <div style={{ fontSize: 12 }}>This tab requires an "RM Email" column in your dataset.</div>
      </div>
    );
  }

  const sorted = [...data]
    .filter(r => !search || r.rm.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => b[sortKey] - a[sortKey]);

  const top5 = sorted.slice(0, 8);
  const kpiRows = [
    { label: 'Total RMs', value: data.length, color: '#00d4ff' },
    { label: 'Total Managed', value: formatNumber(data.reduce((s, r) => s + r.total, 0)), color: '#fbbf24' },
    { label: 'Best Renewal Rate', value: data.length ? `${Math.max(...data.map(r => r.renewalRate))}%` : '—', color: '#22c55e' },
    { label: 'Total Revenue', value: `₹${formatNumber(data.reduce((s, r) => s + r.totalRevenue, 0))}`, color: '#a78bfa' },
  ];

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: '1.5rem' }}>👥</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>RM Performance Dashboard</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Relationship manager performance — active investors, renewal rate, revenue generated</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        {kpiRows.map(k => (
          <div key={k.label} style={{ background: 'var(--bg-card)', border: `1px solid ${k.color}40`, borderRadius: 12, padding: '1rem' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <ChartCard title="Active Investors by RM (Top 8)">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={top5} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
              <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
              <YAxis type="category" dataKey="rm" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} width={120} />
              <Tooltip content={<Tip />} />
              <Bar dataKey="active" name="Active" fill="#00d4ff" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Renewal Rate by RM (Top 8)">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={top5} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
              <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} domain={[0, 100]} />
              <YAxis type="category" dataKey="rm" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} width={120} />
              <Tooltip content={<Tip />} />
              <Bar dataKey="renewalRate" name="Renewal %" fill="#22c55e" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div style={{ background: 'var(--bg-card)', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border-default)' }}>
        <div style={{ padding: '1rem 1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-default)', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontWeight: 600 }}>All RMs ({sorted.length})</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input placeholder="Search RM email…" value={search} onChange={e => setSearch(e.target.value)}
              style={{ padding: '6px 12px', fontSize: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)', width: 200 }} />
            <select value={sortKey} onChange={e => setSortKey(e.target.value)}
              style={{ padding: '6px 10px', fontSize: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)' }}>
              <option value="total">Sort by Total</option>
              <option value="active">Sort by Active</option>
              <option value="renewalRate">Sort by Renewal %</option>
              <option value="totalRevenue">Sort by Revenue</option>
              <option value="avgNetworth">Sort by Avg NW</option>
            </select>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg-elevated)' }}>
                {['RM Email', 'Total', 'Active', 'Exited', 'Active %', 'Renewal %', 'Avg NW ₹', 'Avg PnL ₹', 'Total Revenue ₹'].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: h === 'RM Email' ? 'left' : 'right', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={r.rm} style={{ borderBottom: '1px solid var(--border-default)', background: i % 2 === 0 ? 'transparent' : 'var(--bg-elevated)' }}>
                  <td style={{ padding: '7px 10px', color: 'var(--text-primary)', fontWeight: 500, fontSize: 11 }}>{r.rm}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-secondary)' }}>{r.total}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', color: '#22c55e', fontWeight: 600 }}>{r.active}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', color: '#f87171' }}>{r.exited}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-secondary)' }}>{r.activeRate}%</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', color: r.renewalRate >= 60 ? '#22c55e' : r.renewalRate >= 40 ? '#fbbf24' : '#f87171', fontWeight: 600 }}>{r.renewalRate}%</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-secondary)' }}>{r.avgNetworth ? `₹${r.avgNetworth.toLocaleString('en-IN')}` : '—'}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', color: r.avgPnL >= 0 ? '#22c55e' : '#f87171' }}>{r.avgPnL !== 0 ? `${r.avgPnL >= 0 ? '+' : ''}₹${r.avgPnL.toLocaleString('en-IN')}` : '—'}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', color: '#fbbf24', fontWeight: 600 }}>₹{r.totalRevenue.toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
});
