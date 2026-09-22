import { memo, useState } from 'react';
import { formatNumber } from '../dataEngine';
import FAQSection from '../components/FAQSection';

const PRIORITY_META = {
  Hot:      { color: '#f87171', bg: 'rgba(248,113,113,0.15)', icon: '🔥', desc: 'High networth + positive P&L + recent exit — contact now',
    tooltip: 'Score of 6+ combining exit P&L (profitable exits score higher), net worth (bigger accounts score higher), a pricing-related exit reason, loyalty (cycles completed), and recency of exit — the best win-back bets.' },
  Warm:     { color: '#fb923c', bg: 'rgba(251,146,60,0.15)',  icon: '♨️',  desc: 'Good potential — personalized outreach recommended',
    tooltip: 'Score of 4-5 on the same formula (exit P&L, net worth, exit reason, cycles completed, days since exit) — good potential, worth a personalized outreach.' },
  Possible: { color: '#fbbf24', bg: 'rgba(251,191,36,0.15)', icon: '💡', desc: 'Worth a targeted campaign or offer',
    tooltip: 'Score of 2-3 — some positive signals but a weaker case for reactivation; worth including in a broader win-back campaign.' },
  Cold:     { color: '#64748b', bg: 'rgba(148,163,184,0.15)',  icon: '❄️',  desc: 'Low reactivation likelihood — low priority',
    tooltip: 'Score below 2, often from an exit tied to poor performance or losses — least likely to return, low priority for outreach.' },
};

export default memo(function Tab23Reactivation({ reactivationPipeline }) {
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const d = reactivationPipeline || {};
  const scored = d.scored || [];
  const byPriority = d.byPriority || {};

  const visible = scored.filter(r => {
    if (filter !== 'All' && r.priority !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!(r.name || '').toLowerCase().includes(q) && !(r.pan || '').toLowerCase().includes(q) && !(r.product || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: '1.5rem' }}>♻️</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>Reactivation Pipeline</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Investors who exited in last 180 days — ranked by win-back potential</div>
        </div>
      </div>

      {/* Summary KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
        <div title="Unique investor-product exits (Cycle Level Status = UNSUBSCRIBED, most recent cycle only) whose exit or cycle-end date falls within the last 180 days — the pool considered for win-back campaigns." style={{ background: 'var(--bg-card)', border: '1px solid var(--border-bright)', borderRadius: 12, padding: '1rem' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Eligible for Reactivation</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--accent-cyan)' }}>{d.total || 0}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Exits in last 6 months</div>
        </div>
        <div title="Sum of each eligible investor's last Plan Amount — the subscription revenue that could be recovered if every one of them reactivated." style={{ background: 'var(--bg-card)', border: '1px solid #22c55e40', borderRadius: 12, padding: '1rem' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Revenue Potential</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#22c55e' }}>₹{formatNumber(d.totalRevenuePotential || 0)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Based on last plan amounts</div>
        </div>
        {Object.entries(PRIORITY_META).map(([k, meta]) => (
          <div key={k} title={meta.tooltip} style={{ background: meta.bg, border: `1px solid ${meta.color}40`, borderRadius: 12, padding: '1rem', cursor: 'pointer', outline: filter === k ? `2px solid ${meta.color}` : 'none' }}
            onClick={() => setFilter(filter === k ? 'All' : k)}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{meta.icon} {k}</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: meta.color }}>{byPriority[k] || 0}</div>
          </div>
        ))}
      </div>

      {/* Priority guide */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
        {Object.entries(PRIORITY_META).map(([k, meta]) => (
          <div key={k} style={{ background: meta.bg, border: `1px solid ${meta.color}20`, borderRadius: 8, padding: '0.7rem 1rem', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <span style={{ fontSize: '1rem' }}>{meta.icon}</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: meta.color }}>{k}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{meta.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg-card)', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border-default)' }}>
        <div style={{ padding: '1rem 1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-default)', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
            {filter === 'All' ? 'All Reactivation Candidates' : `${filter} Priority`} ({visible.length})
          </div>
          <input placeholder="Search name / PAN / product…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ padding: '6px 12px', fontSize: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)', width: 260 }} />
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg-elevated)' }}>
                {['Priority', 'Score', 'Name', 'PAN', 'Product', 'Broker', 'Last Cycle', 'Exited', 'Days Ago', 'Cancel Reason', 'P&L %', 'Plan ₹'].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: ['Score', 'Last Cycle', 'Days Ago', 'P&L %', 'Plan ₹'].includes(h) ? 'right' : 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.slice(0, 150).map((r, i) => {
                const meta = PRIORITY_META[r.priority];
                return (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-default)', background: i % 2 === 0 ? 'transparent' : 'var(--bg-elevated)' }}>
                    <td style={{ padding: '7px 10px' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: meta.bg, color: meta.color }}>{meta.icon} {r.priority}</span>
                    </td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: meta.color, fontWeight: 700 }}>{r.score}</td>
                    <td style={{ padding: '7px 10px', color: 'var(--text-primary)', fontWeight: 500 }}>{r.name}</td>
                    <td style={{ padding: '7px 10px', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 11 }}>{r.pan}</td>
                    <td style={{ padding: '7px 10px', color: 'var(--text-secondary)' }}>{r.product}</td>
                    <td style={{ padding: '7px 10px', color: 'var(--text-muted)', fontSize: 11 }}>{r.broker}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-secondary)' }}>{r.cycle}</td>
                    <td style={{ padding: '7px 10px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{r.exitDate}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: r.daysSinceExit <= 30 ? '#f87171' : 'var(--text-muted)' }}>{r.daysSinceExit}d</td>
                    <td style={{ padding: '7px 10px', color: 'var(--text-muted)', fontSize: 11 }}>{r.cancelReason}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: r.pnlPct >= 0 ? '#22c55e' : '#f87171', fontWeight: 600 }}>{r.pnlPct > 0 ? '+' : ''}{r.pnlPct}%</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-secondary)' }}>₹{(r.planAmount || 0).toLocaleString('en-IN')}</td>
                  </tr>
                );
              })}
              {visible.length === 0 && (
                <tr><td colSpan={12} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No candidates in this category</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <FAQSection items={[
        { q: 'What is this page for?',
          a: 'It lists investors who have left in a recent window and ranks how worth chasing each one is for a win-back offer — so outreach effort goes to the people most likely to actually come back, not just whoever left most recently.' },
        { q: 'Who counts as "eligible" for this list?',
          a: 'One exit per person-and-product combination — if someone unsubscribed from a product more than once, only their most recent exit on that product is used. By default the window is the last 180 days from today, but if you\'ve picked a date range elsewhere on the dashboard, that range replaces the 180-day default and the list shows exits within your chosen dates instead.' },
        { q: 'How is the win-back score calculated?',
          a: 'Points are added for signs the person is worth chasing: they were profitable when they left (gaining over 10% adds +3, any gain adds +1, while a loss worse than -15% subtracts 2), they had a larger portfolio (over ₹1 crore adds +3, over ₹25 lakh adds +2, over ₹5 lakh adds +1), they\'d renewed multiple times before leaving (3+ cycles adds +2, 2 cycles adds +1), and they left recently (within 30 days adds +2, within 60 days adds +1). If their stated reason for leaving mentions price or cost, that adds +2 since a better offer might bring them back; if it mentions performance or losses, that subtracts 1, since a discount won\'t fix a trust problem.' },
        { q: 'What do Hot, Warm, Possible, and Cold actually mean?',
          a: 'They\'re just score bands: Hot is 6 or more points, Warm is 4-5, Possible is 2-3, and Cold is below 2. Higher bands mean the combination of profitability, account size, loyalty, and recency of exit all point toward a good chance of return — not a guarantee, just a priority order.' },
        { q: 'What does "Revenue Potential" mean — is that guaranteed money?',
          a: 'No. It\'s simply the sum of what every eligible person\'s last subscription plan cost, added up as if every single one of them came back. Treat it as the upper ceiling of what a fully successful win-back campaign could recover, not a forecast.' },
        { q: 'Does the product/broker/state filter narrow this list?',
          a: 'Yes — those filters apply normally here. Only the date range behaves specially, by replacing (not narrowing) the default 180-day exit window when one is selected.' },
      ]} />
    </div>
  );
});
