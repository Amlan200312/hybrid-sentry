function WiFiSignalBars({ dbm, size = 16 }) {
  const bars = !dbm ? 0 : dbm > -60 ? 4 : dbm > -70 ? 3 : dbm > -80 ? 2 : 1
  const color = bars >= 3 ? '#3fb950' : bars === 2 ? '#d29922' : '#f85149'
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
      {[1, 2, 3, 4].map(i => (
        <rect
          key={i}
          x={1 + (i - 1) * 4}
          y={16 - i * 3.5}
          width={3}
          height={i * 3.5 - 0.5}
          rx={1}
          fill={i <= bars ? color : 'var(--text-muted)'}
          opacity={i <= bars ? 1 : 0.25}
        />
      ))}
    </svg>
  )
}

export default WiFiSignalBars
