export function YAxisTick({
  x, y, payload,
  maxChars = 16,
  fontSize  = 10,
  fill      = 'var(--text-secondary)',
  formatter = null,
}) {
  const raw   = String(payload?.value ?? '');
  const label = formatter
    ? formatter(raw)
    : (raw.length > maxChars ? raw.slice(0, maxChars - 1) + '…' : raw);

  return (
    <g transform={`translate(${x},${y})`}>
      <title>{raw}</title>
      <text
        x={0} y={0} dy={4}
        textAnchor="end"
        fill={fill}
        fontSize={fontSize}
        style={{ userSelect: 'none' }}
      >
        {label}
      </text>
    </g>
  );
}
