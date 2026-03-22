function BatteryIndicator({ percent, showText = false, large = false }) {
  const w = large ? 36 : 24
  const h = large ? 18 : 12
  const color = percent > 50 ? '#3fb950' : percent > 20 ? '#d29922' : '#f85149'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <svg width={w + 4} height={h} viewBox={`0 0 ${w + 4} ${h}`}>
        <rect x={0} y={h * 0.1} width={w} height={h * 0.8} rx={2}
          fill="none" stroke="var(--text-muted)" strokeWidth={1} />
        <rect x={w} y={h * 0.3} width={4} height={h * 0.4} rx={1} fill="var(--text-muted)" />
        <rect x={1} y={h * 0.1 + 1}
          width={Math.max(1, ((percent || 0) / 100) * (w - 2))}
          height={h * 0.8 - 2}
          rx={1} fill={color} />
      </svg>
      {showText && (
        <span style={{ fontSize: large ? 14 : 11, color, fontWeight: 600 }}>{percent}%</span>
      )}
    </div>
  )
}

export default BatteryIndicator
