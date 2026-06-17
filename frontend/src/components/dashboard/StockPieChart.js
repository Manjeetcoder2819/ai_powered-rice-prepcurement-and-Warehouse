const VARIETIES = [
  { name: 'Pusa Basmati', pct: 45, mt: 560,  color: '#2e7d45' },
  { name: 'Swarna',       pct: 30, mt: 374,  color: '#1976d2' },
  { name: 'PR 106',       pct: 15, mt: 187,  color: '#f5a623' },
  { name: 'Other',        pct: 10, mt: 125,  color: '#9e9e9e' },
]

export default function StockPieChart() {
  const r = 44, cx = 60, cy = 60
  const circ = 2 * Math.PI * r
  const slices = VARIETIES.reduce(
    (acc, v) => {
      const dash = (v.pct / 100) * circ
      return {
        offset: acc.offset + dash,
        items: [
          ...acc.items,
          {
            ...v,
            dash,
            offset: acc.offset,
          },
        ],
      }
    },
    { offset: -circ * 0.25, items: [] },
  ).items

  return (
    <div style={{ flexShrink: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>Stock by Variety</div>
      <svg width="120" height="120" viewBox="0 0 120 120">
        {slices.map(v => (
          <circle key={v.name} cx={cx} cy={cy} r={r} fill="none"
            stroke={v.color} strokeWidth="22"
            strokeDasharray={`${v.dash - 2} ${circ - v.dash + 2}`}
            strokeDashoffset={-v.offset} />
        ))}
        <circle cx={cx} cy={cy} r={28} fill="white" />
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
        {VARIETIES.map(v => (
          <div key={v.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: v.color, flexShrink: 0 }} />
            <span style={{ color: 'var(--text-2)', flex: 1 }}>{v.name}</span>
            <strong style={{ fontSize: 10 }}>{v.pct}% ({v.mt} MT)</strong>
          </div>
        ))}
      </div>
    </div>
  )
}
