import { memo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ScatterChart, Scatter } from 'recharts';
import ChartCard from '../components/ChartCard';
import { formatNumber } from '../dataEngine';

const COLORS = ['#00d4ff', '#fbbf24', '#22c55e', '#a78bfa', '#f87171', '#fb923c', '#2dd4bf', '#f472b6'];

const Tip = ({ active, payload, label }) => {
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

export default memo(function Tab26OfferROI({ offerCodeROI }) {
  const [sortKey, setSortKey] = useState('acquired');
  const data = (offerCodeROI || []).sort((a, b) => b[sortKey] - a[sortKey]);
  const noCode = data.find(d => d.code === 'No Code');
  const withCode = data.filter(d => d.code !== 'No Code');
  const baselineRenewal = noCode?.renewalRate || 0;

  const totalDiscountCost = withCode.reduce((s, d) => s + d.totalDiscountCost, 0);
  const totalAcquired = data.reduce((s, d) => s + d.acquired, 0);
  const totalRenewed = data.reduce((s, d) => s + d.renewed, 0);

  const top8 = data.slice(0, 8);

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: '1.5rem' }}>🎟️</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>Offer Code ROI Analysis</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Do discounts actually improve renewal rates? Acquisition vs retention comparison per offer code</div>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <div title="Count of distinct offer codes used at first subscription (excluding 'No Code'), based on each PAN's earliest cycle-1 record." style={{ background: 'var(--bg-card)', border: '1px solid var(--accent-cyan)40', borderRadius: 12, padding: '1rem' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Unique Offer Codes</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#00d4ff' }}>{withCode.length}</div>
        </div>
        <div title="Sum of Offer Discount given to every investor who signed up using a code — the total ₹ spent acquiring investors through discounts." style={{ background: 'var(--bg-card)', border: '1px solid #f8717140', borderRadius: 12, padding: '1rem' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Total Discount Cost</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#f87171' }}>₹{formatNumber(totalDiscountCost)}</div>
        </div>
        <div title="Share of all first-time subscribers (coded and non-coded) who reached cycle 2 or beyond — the blended renewal rate across every acquisition channel." style={{ background: 'var(--bg-card)', border: '1px solid #22c55e40', borderRadius: 12, padding: '1rem' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Overall Renewal (All)</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#22c55e' }}>{totalAcquired > 0 ? (totalRenewed / totalAcquired * 100).toFixed(1) : 0}%</div>
        </div>
        {noCode && (
          <div title="Renewal rate of investors who subscribed without any offer code — the benchmark used to judge whether each code's renewal rate over- or under-performs." style={{ background: 'var(--bg-card)', border: '1px solid #fbbf2440', borderRadius: 12, padding: '1rem' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Baseline (No Code)</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#fbbf24' }}>{baselineRenewal}%</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{noCode.acquired} investors</div>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <ChartCard title="Renewal Rate by Offer Code"
          tooltip="Renewal rate = share of that code's first-time subscribers who reached cycle 2 or later. Green bars beat the no-code baseline, red bars fall short — a low bar means that code is buying acquisitions that don't stick.">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={top8}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
              <XAxis dataKey="code" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
              <Tooltip content={<Tip />} />
              {baselineRenewal > 0 && (
                <Bar dataKey="renewalRate" name="Renewal %" radius={[4, 4, 0, 0]}>
                  {top8.map((d, i) => <Cell key={i} fill={d.renewalRate >= baselineRenewal ? '#22c55e' : '#f87171'} />)}
                </Bar>
              )}
              {!baselineRenewal && (
                <Bar dataKey="renewalRate" name="Renewal %" fill="#00d4ff" radius={[4, 4, 0, 0]}>
                  {top8.map((d, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              )}
            </BarChart>
          </ResponsiveContainer>
          {baselineRenewal > 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 4 }}>
              <span style={{ color: '#22c55e' }}>Green</span> = above no-code baseline ({baselineRenewal}%) &nbsp;
              <span style={{ color: '#f87171' }}>Red</span> = below baseline
            </div>
          )}
        </ChartCard>

        <ChartCard title="Acquisition Volume by Code"
          tooltip="Acquired = investors whose first subscription used that code; Renewed = how many of those went on to a 2nd cycle or later — compare the two bars to see which codes convert volume into loyalty.">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={top8}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
              <XAxis dataKey="code" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
              <Tooltip content={<Tip />} />
              <Bar dataKey="acquired" name="Acquired" fill="#00d4ff" radius={[4, 4, 0, 0]} />
              <Bar dataKey="renewed" name="Renewed" fill="#22c55e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Full Table */}
      <div style={{ background: 'var(--bg-card)', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border-default)' }}>
        <div style={{ padding: '1rem 1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-default)', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontWeight: 600 }}>All Offer Codes</div>
          <select value={sortKey} onChange={e => setSortKey(e.target.value)}
            style={{ padding: '6px 10px', fontSize: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)' }}>
            <option value="acquired">Sort by Acquired</option>
            <option value="renewalRate">Sort by Renewal %</option>
            <option value="totalDiscountCost">Sort by Discount Cost</option>
            <option value="avgNetworth">Sort by Avg NW</option>
          </select>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg-elevated)' }}>
                {['Code', 'Acquired', 'Renewed', 'Renewal %', 'vs Baseline', 'Avg Discount ₹', 'Total Discount Cost ₹', 'Avg NW ₹', 'Avg P&L ₹'].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: h === 'Code' ? 'left' : 'right', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((r, i) => {
                const diff = baselineRenewal > 0 ? r.renewalRate - baselineRenewal : null;
                return (
                  <tr key={r.code} style={{ borderBottom: '1px solid var(--border-default)', background: i % 2 === 0 ? 'transparent' : 'var(--bg-elevated)' }}>
                    <td style={{ padding: '7px 10px', color: r.code === 'No Code' ? 'var(--text-muted)' : 'var(--text-primary)', fontWeight: 600 }}>{r.code}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-secondary)' }}>{r.acquired}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: '#22c55e' }}>{r.renewed}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: diff === null ? 'var(--text-secondary)' : diff >= 0 ? '#22c55e' : '#f87171', fontWeight: 600 }}>{r.renewalRate}%</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: diff === null ? 'var(--text-muted)' : diff > 0 ? '#22c55e' : diff < 0 ? '#f87171' : 'var(--text-muted)', fontWeight: 600 }}>
                      {diff === null ? '—' : `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`}
                    </td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: '#fbbf24' }}>{r.avgDiscount > 0 ? `₹${r.avgDiscount.toLocaleString('en-IN')}` : '—'}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: '#f87171' }}>{r.totalDiscountCost > 0 ? `₹${r.totalDiscountCost.toLocaleString('en-IN')}` : '—'}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-secondary)' }}>{r.avgNetworth ? `₹${r.avgNetworth.toLocaleString('en-IN')}` : '—'}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: (r.avgPnL ?? 0) >= 0 ? '#22c55e' : '#f87171' }}>{r.avgPnL != null && r.avgPnL !== 0 ? `${r.avgPnL >= 0 ? '+' : ''}₹${r.avgPnL.toLocaleString('en-IN')}` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
});
