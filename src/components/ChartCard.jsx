export default function ChartCard({ title, subtitle, badge, children, style, tooltip }) {
  return (
    <div className="chart-card" style={style}>
      <div className="chart-header">
        <div>
          <div className="chart-title">
            {title}
            {tooltip && <span className="kpi-info" title={tooltip}>ⓘ</span>}
          </div>
          {subtitle && <div className="chart-subtitle">{subtitle}</div>}
        </div>
        {badge && <span className="chart-badge">{badge}</span>}
      </div>
      {children}
    </div>
  );
}
