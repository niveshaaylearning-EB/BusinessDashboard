import { memo, useState } from 'react';
import Tab23Reactivation from './Tab23_Reactivation';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import ChartCard from '../components/ChartCard';

const RISK_META = {
  Critical: { color: '#f87171', bg: 'rgba(248,113,113,0.15)', icon: '🔴',
    tooltip: 'Score of 7+ on the churn formula (first-cycle subscriber +3, P&L below -20% +4, ≤15 days left in cycle +3, heavy discount dependency +2, new subscriber +1, gains above +10% subtract 2) — most likely to churn, needs immediate outreach.' },
  High:     { color: '#fb923c', bg: 'rgba(251,146,60,0.15)',  icon: '🟠',
    tooltip: 'Score of 5-6 on the same weighted formula (cycle stage, P&L, days left in cycle, discount dependency, tenure) — elevated churn risk, prioritize right after Critical.' },
  Medium:   { color: '#fbbf24', bg: 'rgba(251,191,36,0.15)', icon: '🟡',
    tooltip: 'Score of 3-4 on the same formula — some risk factors present but not urgent; worth proactive monitoring.' },
  Low:      { color: '#22c55e', bg: 'rgba(34,197,94,0.15)',   icon: '🟢',
    tooltip: 'Score below 3 (can go negative for profitable, loyal investors) — least likely to churn based on current cycle stage, P&L, and days remaining.' },
};

function ChurnContent({ churnRisk }) {
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const d = churnRisk || {};
  const scored = d.scored || [];
  const byLevel = d.byLevel || {};

  const barData = Object.entries(RISK_META).map(([k]) => ({
    level: k, count: byLevel[k] || 0, fill: RISK_META[k].color,
  }));

  const visible = scored.filter(r => {
    if (filter !== 'All' && r.riskLevel !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!(r.name || '').toLowerCase().includes(q) && !(r.pan || '').toLowerCase().includes(q) && !(r.product || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: '1.5rem' }}>🎯</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>Churn Risk Heatmap</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Each active investor scored on churn likelihood — cycle, P&L, days left, discount dependency</div>
        </div>
      </div>

      {/* Summary Tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        {Object.entries(RISK_META).map(([level, meta]) => (
          <div key={level} title={meta.tooltip} style={{ background: meta.bg, border: `1px solid ${meta.color}40`, borderRadius: 12, padding: '1rem', cursor: 'pointer', outline: filter === level ? `2px solid ${meta.color}` : 'none' }}
            onClick={() => setFilter(filter === level ? 'All' : level)}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{meta.icon} {level} Risk</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: meta.color }}>{byLevel[level] || 0}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>investors</div>
          </div>
        ))}
        <div title="Every currently active investor (Subscribed, Grace Period, or Cancelled-but-active), deduplicated by PAN, that has been run through the churn-risk formula." style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 12, padding: '1rem', cursor: 'pointer', outline: filter === 'All' ? '2px solid var(--accent-cyan)' : 'none' }}
          onClick={() => setFilter('All')}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>⚡ All Active</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--accent-cyan)' }}>{d.total || 0}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>scored</div>
        </div>
      </div>

      <ChartCard title="Risk Distribution"
        tooltip="Count of active investors in each risk band, based on the weighted score combining cycle stage, P&L performance, renewal urgency (days left in cycle), and discount dependency — taller Critical/High bars mean more investors need retention attention now.">
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={barData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
            <XAxis dataKey="level" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
            <Tooltip formatter={(v) => [v, 'Investors']} contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-bright)', borderRadius: 8, fontSize: 12 }} />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {barData.map((b, i) => <Cell key={i} fill={b.fill} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Investor Table */}
      <div style={{ background: 'var(--bg-card)', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border-default)' }}>
        <div style={{ padding: '1rem 1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-default)', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
            {filter === 'All' ? 'All Scored Investors' : `${filter} Risk Investors`} ({visible.length})
          </div>
          <input placeholder="Search name / PAN / product…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ padding: '6px 12px', fontSize: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)', width: 260 }} />
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg-elevated)' }}>
                {['Risk', 'Score', 'Name', 'PAN', 'Product', 'Cycle', 'Days Left', 'P&L %', 'Plan ₹'].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: ['Score', 'Cycle', 'Days Left', 'P&L %', 'Plan ₹'].includes(h) ? 'right' : 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.slice(0, 150).map((r, i) => {
                const meta = RISK_META[r.riskLevel];
                return (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-default)', background: i % 2 === 0 ? 'transparent' : 'var(--bg-elevated)' }}>
                    <td style={{ padding: '7px 10px' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: meta.bg, color: meta.color }}>{meta.icon} {r.riskLevel}</span>
                    </td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: meta.color, fontWeight: 700 }}>{r.score}</td>
                    <td style={{ padding: '7px 10px', color: 'var(--text-primary)', fontWeight: 500 }}>{r.name}</td>
                    <td style={{ padding: '7px 10px', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 11 }}>{r.pan}</td>
                    <td style={{ padding: '7px 10px', color: 'var(--text-secondary)' }}>{r.product}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-secondary)' }}>{r.cycle}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: r.daysLeft <= 30 ? '#f87171' : r.daysLeft <= 60 ? '#fbbf24' : 'var(--text-secondary)', fontWeight: r.daysLeft <= 30 ? 700 : 400 }}>{r.daysLeft}d</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: r.pnlPct >= 0 ? '#22c55e' : '#f87171', fontWeight: 600 }}>{r.pnlPct > 0 ? '+' : ''}{r.pnlPct}%</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: '#22c55e' }}>₹{r.planAmount.toLocaleString('en-IN')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SubTabBar({ tabs, active, onSelect }) {
  return (
    <div style={{ display: 'flex', gap: 0, background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-default)', paddingLeft: '1rem' }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onSelect(t.id)} style={{
          padding: '10px 18px', fontSize: 13, fontWeight: active === t.id ? 700 : 400,
          color: active === t.id ? 'var(--accent-cyan)' : 'var(--text-muted)',
          background: 'none', border: 'none', borderBottom: active === t.id ? '2px solid var(--accent-cyan)' : '2px solid transparent',
          cursor: 'pointer', transition: 'color 0.15s', display: 'flex', alignItems: 'center', gap: 6,
        }}>{t.icon} {t.label}</button>
      ))}
    </div>
  );
}

export default memo(function Tab22ChurnRisk(props) {
  const [sub, setSub] = useState('churn');
  return (
    <>
      <SubTabBar
        tabs={[
          { id: 'churn', label: 'Churn Risk', icon: '🎯' },
          { id: 'reactivation', label: 'Reactivation Pipeline', icon: '♻️' },
        ]}
        active={sub}
        onSelect={setSub}
      />
      {sub === 'churn' ? <ChurnContent {...props} /> : <Tab23Reactivation reactivationPipeline={props.reactivationPipeline} />}
    </>
  );
});
