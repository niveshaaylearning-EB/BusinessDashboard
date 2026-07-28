import { memo } from 'react';

function KPICard({ label, value, sub, trend, trendDir, icon, accent = 'var(--accent-cyan)', small }) {
  return (
    <div className="kpi-card" style={{ '--kpi-accent': accent }}>
      {icon && <div className="kpi-icon">{icon}</div>}
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value ${small ? 'small' : ''}`}>{value}</div>
      {(sub || trend) && (
        <div className="kpi-sub">
          {trend !== undefined && (
            <span className={`kpi-trend ${trendDir === 'up' ? 'up' : trendDir === 'down' ? 'down' : 'neutral'}`}>
              {trendDir === 'up' ? '▲' : trendDir === 'down' ? '▼' : '●'} {trend}
            </span>
          )}
          {sub && <span>{sub}</span>}
        </div>
      )}
    </div>
  );
}

export default memo(KPICard);
