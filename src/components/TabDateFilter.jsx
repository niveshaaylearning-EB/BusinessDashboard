const PRESETS = [
  { label: 'All Time', value: null  },
  { label: '1M',       value: 1    },
  { label: '3M',       value: 3    },
  { label: '6M',       value: 6    },
  { label: 'YTD',      value: 'ytd'},
  { label: '1Y',       value: 12   },
  { label: '2Y',       value: 24   },
];

function toInputStr(d) {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return '';
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function computePreset(value) {
  if (value === null) return { from: null, to: null };
  const to = new Date(); to.setHours(23, 59, 59, 999);
  let from;
  if (value === 'ytd') {
    from = new Date(to.getFullYear(), 0, 1);
  } else {
    from = new Date(to.getFullYear(), to.getMonth() - value, to.getDate());
    if (from.getDate() !== to.getDate()) from.setDate(0);
  }
  return { from, to };
}

function detectActive(dateFrom, dateTo) {
  if (!dateFrom && !dateTo) return null;
  const from = dateFrom instanceof Date ? dateFrom : new Date(dateFrom);
  const to   = dateTo   instanceof Date ? dateTo   : new Date(dateTo || new Date());
  for (const p of PRESETS) {
    if (p.value === null) continue;
    const { from: pf, to: pt } = computePreset(p.value);
    if (pf && Math.abs(from - pf) < 86400000 * 2 && Math.abs(to - pt) < 86400000 * 2) return p.value;
  }
  return 'custom';
}

const INPUT_STYLE = {
  background: 'var(--bg-card)', border: '1px solid var(--border-default)',
  borderRadius: 6, color: 'var(--text-primary)', padding: '3px 8px',
  fontSize: 11, cursor: 'pointer', colorScheme: 'dark', outline: 'none',
};

export default function TabDateFilter({ dateFrom, dateTo, onChange, label = 'Period' }) {
  const active = detectActive(dateFrom, dateTo);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap',
      padding: '0.5rem 0.875rem', background: 'var(--bg-elevated)', borderRadius: 8,
      border: '1px solid var(--border-default)', marginBottom: '1rem',
    }}>
      <span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', marginRight: 2 }}>
        📅 {label}:
      </span>

      {PRESETS.map(p => {
        const isActive = p.value === null ? active === null : active === p.value;
        return (
          <button key={p.label}
            onClick={() => { const { from, to } = computePreset(p.value); onChange(from, to); }}
            style={{
              padding: '3px 10px', fontSize: 11, borderRadius: 12, cursor: 'pointer',
              border: `1px solid ${isActive ? 'var(--accent-cyan)' : 'var(--border-dim)'}`,
              background: isActive ? 'rgba(0,212,255,0.12)' : 'transparent',
              color: isActive ? 'var(--accent-cyan)' : 'var(--text-secondary)',
              fontWeight: isActive ? 600 : 400,
            }}>
            {p.label}
          </button>
        );
      })}

      <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 4 }}>Custom:</span>
      <input type="date" value={toInputStr(dateFrom)}
        onChange={e => onChange(e.target.value ? new Date(e.target.value) : null, dateTo)}
        style={INPUT_STYLE} />
      <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>→</span>
      <input type="date" value={toInputStr(dateTo)}
        onChange={e => {
          const d = e.target.value ? new Date(e.target.value + 'T23:59:59') : null;
          onChange(dateFrom, d);
        }}
        style={INPUT_STYLE} />

      {(dateFrom || dateTo) && (
        <button onClick={() => onChange(null, null)} style={{
          background: 'none', border: '1px solid var(--border-dim)', borderRadius: 6,
          color: 'var(--text-muted)', padding: '3px 8px', fontSize: 11, cursor: 'pointer', marginLeft: 4,
        }}>
          ✕ Clear
        </button>
      )}
    </div>
  );
}
