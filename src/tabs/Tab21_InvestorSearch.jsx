import { memo, useState, useCallback } from 'react';
import { searchInvestor, formatCurrency } from '../dataEngine';

const STATUS_COLOR = (s) => {
  const u = String(s).toUpperCase();
  if (u.includes('SUBSCRIBED') && !u.includes('UN')) return { bg: 'rgba(34,197,94,0.15)', color: '#22c55e' };
  if (u.includes('GRACE')) return { bg: 'rgba(251,191,36,0.15)', color: '#fbbf24' };
  return { bg: 'rgba(248,113,113,0.15)', color: '#f87171' };
};

export default memo(function Tab21InvestorSearch({ rawData }) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState(null);
  const [searched, setSearched] = useState(false);

  const doSearch = useCallback(() => {
    if (!query.trim() || query.trim().length < 2) return;
    const r = searchInvestor(rawData, query);
    setResult(r);
    setSearched(true);
  }, [query, rawData]);

  const handleKey = (e) => { if (e.key === 'Enter') doSearch(); };

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: '1.5rem' }}>🔍</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>Investor 360° Search</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Search any investor by name, PAN, or email — see their complete subscription history</div>
        </div>
      </div>

      {/* Search Bar */}
      <div style={{ display: 'flex', gap: 10, maxWidth: 600 }}>
        <input
          value={query} onChange={e => setQuery(e.target.value)} onKeyDown={handleKey}
          placeholder="Enter name, PAN, or email address…"
          style={{ flex: 1, padding: '10px 16px', fontSize: 14, background: 'var(--bg-elevated)', border: '1px solid var(--border-bright)', borderRadius: 10, color: 'var(--text-primary)', outline: 'none' }}
        />
        <button onClick={doSearch} className="btn-primary" style={{ padding: '10px 24px', fontSize: 14 }}>Search</button>
        {result && <button onClick={() => { setResult(null); setSearched(false); setQuery(''); }}
          style={{ padding: '10px 14px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 10, color: 'var(--text-muted)', cursor: 'pointer' }}>✕ Clear</button>}
      </div>

      {searched && result && !result.found && (
        <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '2rem', textAlign: 'center' }}>
          No investor found matching "<strong style={{ color: 'var(--text-primary)' }}>{query}</strong>"
        </div>
      )}

      {result?.found && (
        <>
          {/* Identity Card */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-bright)', borderRadius: 14, padding: '1.5rem', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '1.5rem', alignItems: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg,#00d4ff,#a78bfa)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem', fontWeight: 700, color: '#fff' }}>
              {(result.name || '?')[0].toUpperCase()}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1.2rem', color: 'var(--text-primary)', marginBottom: 4 }}>{result.name}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 12, color: 'var(--text-muted)' }}>
                <span>🪪 PAN: <strong style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>{result.pan}</strong></span>
                <span>📧 {result.email || '—'}</span>
                <span>📍 {result.state || '—'}</span>
                <span>🏦 {result.broker || '—'}</span>
                <span>📡 Source: {result.attribution || '—'}</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                {result.products.map(p => (
                  <span key={p} style={{ padding: '2px 10px', background: 'rgba(0,212,255,0.12)', color: '#00d4ff', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>{p}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Financial Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            {[
              { label: 'Total Spend', value: `₹${result.totalSpend.toLocaleString('en-IN')}`, color: '#fbbf24',
                tooltip: 'Sum of plan amounts paid across every cycle and product this investor has ever subscribed to — full historical revenue contribution, not a monthly-equivalent figure.' },
              { label: 'Networth', value: result.networth ? `₹${result.networth.toLocaleString('en-IN')}` : '—', color: '#00d4ff',
                tooltip: "Self-reported net worth from the investor's most recent subscription record." },
              { label: 'P&L', value: result.pnl !== 0 ? `${result.pnl >= 0 ? '+' : ''}₹${result.pnl.toLocaleString('en-IN')}` : '—', color: result.pnl >= 0 ? '#22c55e' : '#f87171',
                tooltip: "Reported portfolio profit/loss from the investor's most recent subscription record — independent of subscription revenue paid." },
              { label: 'Max Renewal Cycle', value: `Cycle ${result.maxCycle}`, color: '#a78bfa',
                tooltip: "Highest cycle number reached across all of this investor's subscriptions. Cycle 1 means they've never renewed; higher numbers mean more renewals." },
              { label: 'Products Subscribed', value: result.products.length, color: '#fb923c',
                tooltip: 'Count of distinct products (smallcases) this investor has subscribed to across their full history.' },
              { label: 'First Subscription', value: result.firstSubDate, color: 'var(--text-secondary)',
                tooltip: 'Earliest subscription start date on record for this investor, across any product.' },
            ].map(k => (
              <div key={k.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 10, padding: '0.9rem 1rem' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                  {k.label}
                  {k.tooltip && <span title={k.tooltip} style={{ cursor: 'help' }}>ⓘ</span>}
                </div>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: k.color }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Subscription Timeline */}
          <div style={{ background: 'var(--bg-card)', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border-default)' }}>
            <div style={{ padding: '0.9rem 1.2rem', fontWeight: 600, borderBottom: '1px solid var(--border-default)', color: 'var(--text-primary)' }}>
              📅 Subscription Timeline ({result.timeline.length} entries)
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-elevated)' }}>
                    {['Product', 'Cycle', 'Status', 'Start Date', 'End Date', 'Plan ₹', 'Discount ₹', 'Offer Code', 'Cancel Reason'].map(h => (
                      <th key={h} style={{ padding: '7px 10px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.timeline.map((t, i) => {
                    const sc = STATUS_COLOR(t.status);
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-default)', background: i % 2 === 0 ? 'transparent' : 'var(--bg-elevated)' }}>
                        <td style={{ padding: '7px 10px', color: 'var(--text-primary)', fontWeight: 500, whiteSpace: 'nowrap' }}>{t.product}</td>
                        <td style={{ padding: '7px 10px', color: '#a78bfa', fontWeight: 600 }}>C{t.cycle}</td>
                        <td style={{ padding: '7px 10px' }}>
                          <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: sc.bg, color: sc.color }}>{t.status}</span>
                        </td>
                        <td style={{ padding: '7px 10px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{t.startDate}</td>
                        <td style={{ padding: '7px 10px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{t.endDate}</td>
                        <td style={{ padding: '7px 10px', color: '#22c55e', fontWeight: 600 }}>₹{t.planAmount.toLocaleString('en-IN')}</td>
                        <td style={{ padding: '7px 10px', color: t.discount > 0 ? '#fbbf24' : 'var(--text-muted)' }}>{t.discount > 0 ? `₹${t.discount.toLocaleString('en-IN')}` : '—'}</td>
                        <td style={{ padding: '7px 10px', color: 'var(--text-muted)', fontSize: 11 }}>{t.offerCode !== '—' ? t.offerCode : '—'}</td>
                        <td style={{ padding: '7px 10px', color: t.cancelReason !== '—' ? '#f87171' : 'var(--text-muted)', fontSize: 11 }}>{t.cancelReason}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {!searched && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: '1rem' }}>
          {[
            { icon: '🪪', label: 'Search by PAN', example: 'e.g. ABCDE1234F' },
            { icon: '📧', label: 'Search by Email', example: 'e.g. john@gmail.com' },
            { icon: '👤', label: 'Search by Name', example: 'e.g. Rajesh Kumar' },
          ].map(h => (
            <div key={h.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 12, padding: '1.2rem', textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', marginBottom: 8 }}>{h.icon}</div>
              <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>{h.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{h.example}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
