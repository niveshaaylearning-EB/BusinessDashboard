import { useState, useEffect, useRef, memo } from 'react';

export function useDrilldown() {
  const [drilldown, setDrilldown] = useState(null);
  const open = (title, subtitle, rows, columns) => setDrilldown({ title, subtitle, rows, columns });
  const close = () => setDrilldown(null);
  return { drilldown, open, close };
}

function DrilldownModal({ drilldown, onClose }) {
  const [search, setSearch] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (drilldown) { setSearch(''); setTimeout(() => inputRef.current?.focus(), 80); }
  }, [drilldown]);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!drilldown) return null;


  const { title, subtitle, rows = [], columns = [] } = drilldown;

  const filtered = search.trim()
    ? rows.filter(row => columns.some(col => String(row[col.key] ?? '').toLowerCase().includes(search.toLowerCase())))
    : rows;

  return (
    <div className="drilldown-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="drilldown-modal">
        {/* Header */}
        <div className="drilldown-header">
          <div>
            <div className="drilldown-title">{title}</div>
            {subtitle && <div className="drilldown-subtitle">{subtitle}</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="drilldown-count">{filtered.length} of {rows.length} records</span>
            <button className="drilldown-close" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Search */}
        {rows.length > 5 && (
          <div className="drilldown-search-wrap">
            <input
              ref={inputRef}
              className="drilldown-search"
              placeholder="Search across all columns…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        )}

        {/* Table */}
        <div className="drilldown-table-wrap">
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: 13 }}>No records match your search.</div>
          ) : (
            <table className="data-table drilldown-table">
              <thead>
                <tr>
                  <th>#</th>
                  {columns.map((col, i) => (
                    <th key={i} style={{ textAlign: col.align || 'left' }}>{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, i) => (
                  <tr key={i}>
                    <td className="td-rank">{i + 1}</td>
                    {columns.map((col, ci) => (
                      <td key={ci} className={col.cls || 'td-name'} style={{ textAlign: col.align || 'left' }}>
                        {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '—')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(DrilldownModal);
