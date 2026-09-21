import { memo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import ChartCard from '../components/ChartCard';
import { YAxisTick } from '../components/YAxisTick';
import { formatCurrency, formatNumber } from '../dataEngine';
import FAQSection from '../components/FAQSection';

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
    { label: 'Total RMs', value: data.length, color: '#00d4ff',
      tooltip: 'Count of distinct RM Email values with at least one assigned investor, deduplicated by PAN.' },
    { label: 'Total Managed', value: formatNumber(data.reduce((s, r) => s + r.total, 0)), color: '#fbbf24',
      tooltip: 'Sum of every investor (active and exited, deduplicated by PAN) across all RMs.' },
    { label: 'Best Renewal Rate', value: data.length ? `${Math.max(...data.map(r => r.renewalRate))}%` : '—', color: '#22c55e',
      tooltip: 'The highest renewal rate among all RMs — the share of that RM\'s active investors who are on cycle 2 or later.' },
    { label: 'Total Revenue', value: `₹${formatNumber(data.reduce((s, r) => s + r.totalRevenue, 0))}`, color: '#a78bfa',
      tooltip: 'Sum of Plan Amount across every investor (active and exited) ever assigned to an RM.' },
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
          <div key={k.label} title={k.tooltip} style={{ background: 'var(--bg-card)', border: `1px solid ${k.color}40`, borderRadius: 12, padding: '1rem' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <ChartCard title="Active Investors by RM (Top 8)"
          tooltip="Currently active (Subscribed, Grace, or Cancelled-but-active) investors per RM, deduplicated by PAN — the 8 RMs with the largest active books.">
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

        <ChartCard title="Renewal Rate by RM (Top 8)"
          tooltip="Share of each RM's active investors currently on their 2nd cycle or later — a proxy for how well that RM retains clients past the first subscription.">
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

      <FAQSection items={[
        { q: 'What is this page for?',
          a: 'It breaks the whole investor base down by which relationship manager (RM) they\'re assigned to, so you can compare how many people each RM manages, how well those people stick around, and how much subscription revenue each RM\'s book represents.' },
        { q: 'Why do I see an "Unassigned" row, or why does this page say no data was found?',
          a: 'Investors are grouped by the "RM Email" column in your uploaded file. Anyone with that field blank gets grouped under "Unassigned" so they\'re not silently dropped. If the column is missing from your file entirely, the page can\'t build any groups and shows the empty-state message instead.' },
        { q: 'If one investor holds 2 products under the same RM, do they count twice?',
          a: 'No. Within each RM\'s book, investors are counted once by PAN — so "Total" and "Active" reflect unique people per RM, not subscription rows. If the same person is somehow logged under two different RM emails (a data entry issue), they would appear once under each RM, since the grouping happens by RM before deduplication.' },
        { q: 'How is "Renewal Rate" calculated here, and is it the same as the Renewal tab\'s numbers?',
          a: 'It\'s the share of an RM\'s currently active investors who are on cycle 2 or later — i.e., have renewed at least once. It\'s a per-RM slice of the same idea used elsewhere, not a different formula, but because it\'s scoped to one RM\'s book it will naturally differ from the company-wide renewal numbers on other tabs.' },
        { q: 'Does "Total Revenue" mean money already collected, or the total investor base value?',
          a: 'It\'s the sum of the Plan Amount (subscription price) across every investor ever assigned to that RM, active or exited — a measure of how much subscription revenue that RM\'s book has represented in total, not their portfolio value or a live P&L figure.' },
        { q: 'Does the period/date filter change these numbers?',
          a: 'Yes — this page respects whatever period and product/broker/state filters are currently selected on the dashboard, the same as most other tabs. If you narrow the period, both the RM totals and their renewal rates will reflect only investors matching that narrower selection.' },
      ]} />
    </div>
  );
});
