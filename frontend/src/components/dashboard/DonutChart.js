export default function DonutChart({ goodPct, good, damaged, total }) {
  const r = 50, cx = 65, cy = 65
  const circ = 2 * Math.PI * r
  const goodDash  = (goodPct / 100) * circ
  const dmgDash   = total > 0 ? (damaged / total) * circ : 0
  const goodOffset = -circ * 0.25
  const dmgOffset  = goodOffset + goodDash

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <svg width="130" height="130" viewBox="0 0 130 130">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f0f2f5" strokeWidth="14" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#2e7d45" strokeWidth="14"
          strokeDasharray={`${goodDash} ${circ - goodDash}`}
          strokeDashoffset={goodOffset} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#ef5350" strokeWidth="14"
          strokeDasharray={`${Math.max(dmgDash - 2, 1)} ${circ}`}
          strokeDashoffset={-dmgOffset - 2} strokeLinecap="round" />
      </svg>
      <div className="donut-center" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 17, fontWeight: 800 }}>{goodPct.toFixed(2)}%</div>
        <div style={{ fontSize: 9, color: 'var(--text-2)', marginTop: 1 }}>Good Bags</div>
      </div>
    </div>
  )
}
