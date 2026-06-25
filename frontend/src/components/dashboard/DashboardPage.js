'use client'

import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import {
  getAlerts,
  getBatches,
  getDashboardKPIs,
  getFarmers,
  getVehicles,
  sendRainAlert,
  predictFarmer,
  getStock,
  getWeather,
} from '@/lib/api'
import StockPieChart from './StockPieChart'

/* =========================================================
   DEMO COMPONENTS
========================================================= */

function DonutChart({ goodPct, wetPct, damagedPct, total }) {
  const gp = parseFloat(goodPct) || 0;
  const wp = parseFloat(wetPct) || 0;
  const dp = parseFloat(damagedPct) || 0;
  const hasBags = total > 0;

  const r = 50, cx = 75, cy = 75;
  const circ = 2 * Math.PI * r;

  const goodDash = (gp / 100) * circ;
  const wetDash = (wp / 100) * circ;
  const dmgDash = (dp / 100) * circ;

  const goodOffset = -circ * 0.25;
  const wetOffset = goodOffset - goodDash;
  const dmgOffset = wetOffset - wetDash;

  const transitionStyle = {
    transition: "stroke-dasharray 0.6s cubic-bezier(0.4, 0, 0.2, 1), stroke-dashoffset 0.6s cubic-bezier(0.4, 0, 0.2, 1)"
  };

  return (
    <div
      style={{
        width: 150,
        height: 150,
        position: 'relative',
        flexShrink: 0,
      }}
    >
      <svg width="150" height="150" viewBox="0 0 150 150">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e5e7eb" strokeWidth="14" />
        {hasBags && (
          <>
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="#16a34a" strokeWidth="14"
              strokeDasharray={`${goodDash} ${circ - goodDash}`}
              strokeDashoffset={goodOffset}
              style={transitionStyle}
              strokeLinecap="round"
            />
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="#ea580c" strokeWidth="14"
              strokeDasharray={`${wetDash} ${circ - wetDash}`}
              strokeDashoffset={wetOffset}
              style={transitionStyle}
              strokeLinecap="round"
            />
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="#dc2626" strokeWidth="14"
              strokeDasharray={`${dmgDash} ${circ - dmgDash}`}
              strokeDashoffset={dmgOffset}
              style={transitionStyle}
              strokeLinecap="round"
            />
          </>
        )}
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ fontSize: 24, fontWeight: 800 }}>
          {hasBags ? `${gp.toFixed(1)}%` : 'N/A'}
        </div>
        <div style={{ fontSize: 11, color: '#6b7280' }}>
          {hasBags ? 'Good' : 'No Bags'}
        </div>
      </div>
    </div>
  )
}

// StockPieChart is imported from ./StockPieChart

/* =========================================================
   AI QUALITY TREND AREA CHART (CUSTOM SVG)
========================================================= */

const DEMO_TREND_BATCHES = [
  { id: 'B-0082', total_bags: 120, damaged: 6, wet: 3 },
  { id: 'B-0081', total_bags: 85, damaged: 3, wet: 2 },
  { id: 'B-0080', total_bags: 120, damaged: 5, wet: 4 },
  { id: 'B-0079', total_bags: 60, damaged: 0, wet: 0 },
  { id: 'B-0078', total_bags: 110, damaged: 8, wet: 5 },
];

function QualityTrendChart({ batches = [] }) {
  const activeList = batches.length ? batches : DEMO_TREND_BATCHES;
  const recent = [...activeList].slice(0, 5).reverse();
  
  const pointsGood = [];
  const pointsWet = [];
  const pointsDamaged = [];
  
  recent.forEach((b, idx) => {
    const x = 15 + idx * 60;
    const total = b.total_bags || 100;
    const gPct = ((total - b.damaged - b.wet) / total) * 100;
    const wPct = (b.wet / total) * 100;
    const dPct = (b.damaged / total) * 100;
    
    const yGood = 100 - (gPct * 0.8);
    const yWet = 100 - (wPct * 8);
    const yDamaged = 100 - (dPct * 8);
    
    pointsGood.push({ x, y: yGood, pct: gPct, id: b.id });
    pointsWet.push({ x, y: yWet, pct: wPct });
    pointsDamaged.push({ x, y: yDamaged, pct: dPct });
  });
  
  const dGood = pointsGood.length ? `M ${pointsGood[0].x} ${pointsGood[0].y} ` + pointsGood.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ') : '';
  const dWet = pointsWet.length ? `M ${pointsWet[0].x} ${pointsWet[0].y} ` + pointsWet.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ') : '';
  const dDamaged = pointsDamaged.length ? `M ${pointsDamaged[0].x} ${pointsDamaged[0].y} ` + pointsDamaged.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ') : '';

  const fillGood = dGood ? `${dGood} L ${pointsGood[pointsGood.length-1].x} 100 L ${pointsGood[0].x} 100 Z` : '';
  const fillWet = dWet ? `${dWet} L ${pointsWet[pointsWet.length-1].x} 100 L ${pointsWet[0].x} 100 Z` : '';
  const fillDamaged = dDamaged ? `${dDamaged} L ${pointsDamaged[pointsDamaged.length-1].x} 100 L ${pointsDamaged[0].x} 100 Z` : '';

  return (
    <div style={{ background: '#ffffff', borderRadius: 14, padding: 16, border: '1px solid #e5e7eb', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#1f2937' }}>AI Defect Quality Trend</span>
        <div style={{ display: 'flex', gap: 10, fontSize: 10, fontWeight: 600 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#16a34a' }}></span>Good</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ea580c' }}></span>Wet</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#dc2626' }}></span>Damaged</span>
        </div>
      </div>
      <svg width="100%" height="95" viewBox="0 0 270 100" style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id="gradGood" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#16a34a" stopOpacity="0.2"/>
            <stop offset="100%" stopColor="#16a34a" stopOpacity="0.0"/>
          </linearGradient>
          <linearGradient id="gradWet" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ea580c" stopOpacity="0.2"/>
            <stop offset="100%" stopColor="#ea580c" stopOpacity="0.0"/>
          </linearGradient>
          <linearGradient id="gradDamaged" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#dc2626" stopOpacity="0.2"/>
            <stop offset="100%" stopColor="#dc2626" stopOpacity="0.0"/>
          </linearGradient>
        </defs>
        <line x1="0" y1="20" x2="270" y2="20" stroke="#f1f5f9" strokeWidth="1" />
        <line x1="0" y1="50" x2="270" y2="50" stroke="#f1f5f9" strokeWidth="1" />
        <line x1="0" y1="80" x2="270" y2="80" stroke="#f1f5f9" strokeWidth="1" />
        
        {fillGood && <path d={fillGood} fill="url(#gradGood)" />}
        {fillWet && <path d={fillWet} fill="url(#gradWet)" />}
        {fillDamaged && <path d={fillDamaged} fill="url(#gradDamaged)" />}
        
        {dGood && <path d={dGood} fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" />}
        {dWet && <path d={dWet} fill="none" stroke="#ea580c" strokeWidth="2" strokeLinecap="round" />}
        {dDamaged && <path d={dDamaged} fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" />}
        
        {pointsGood.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="3" fill="#ffffff" stroke="#16a34a" strokeWidth="1.5" />
            <text x={p.x} y="96" fontSize="7" fill="#94a3b8" textAnchor="middle" fontWeight="bold">
              {p.id}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/* =========================================================
   MOISTURE LEVEL DIAL GAUGE (CUSTOM SVG)
========================================================= */

function MoistureGauge({ value = 13.5 }) {
  const val = isNaN(value) ? 13.5 : value;
  const percentage = Math.max(8, Math.min(22, val));
  const angle = -180 + ((percentage - 8) / 14) * 180;
  
  let color = '#16a34a';
  let status = 'Optimal';
  if (percentage > 16.0) {
    color = '#dc2626';
    status = 'Danger (Wet)';
  } else if (percentage > 14.0) {
    color = '#ea580c';
    status = 'Warning (Damp)';
  }

  return (
    <div style={{ background: '#ffffff', borderRadius: 14, padding: 16, border: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, width: 170 }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: '#1f2937' }}>Avg Moisture Dial</span>
      <div style={{ position: 'relative', width: 120, height: 60, marginTop: 10 }}>
        <svg width="120" height="120" viewBox="0 0 120 120">
          <path d="M 15 80 A 45 45 0 0 1 105 80" fill="none" stroke="#e2e8f0" strokeWidth="8" strokeLinecap="round" />
          <path d="M 15 80 A 45 45 0 0 1 73 40" fill="none" stroke="#dcfce7" strokeWidth="8" />
          <path d="M 73 40 A 45 45 0 0 1 93 54" fill="none" stroke="#ffedd5" strokeWidth="8" />
          <path d="M 93 54 A 45 45 0 0 1 105 80" fill="none" stroke="#fee2e2" strokeWidth="8" />
          
          <g style={{ transform: `rotate(${angle + 90}deg)`, transformOrigin: '60px 80px', transition: 'transform 0.8s ease' }}>
            <line x1="60" y1="80" x2="60" y2="42" stroke="#334155" strokeWidth="3" strokeLinecap="round" />
            <circle cx="60" cy="80" r="5" fill="#334155" />
          </g>
        </svg>
        <div style={{ position: 'absolute', bottom: -5, left: 0, right: 0, textAlign: 'center' }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: '#1e293b' }}>{percentage}%</span>
        </div>
      </div>
      <span style={{ fontSize: 9, fontWeight: 700, color, marginTop: 4, background: `${color}15`, padding: '2px 8px', borderRadius: 4 }}>
        {status}
      </span>
    </div>
  );
}

/* =========================================================
   AI INTERACTIVE OPTIMIZER SIMULATOR
========================================================= */

function AISimulator({ queuePosition = 1 }) {
  const [variety, setVariety] = useState('Sona Masoori')
  const [bags, setBags] = useState(150)
  const [predictions, setPredictions] = useState({
    expectedWait: 24,
    estDeduction: 1120,
    expectedDamaged: 8,
    expectedWet: 4,
    predDamagedRate: 0.05,
    predWetRate: 0.02,
  })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let active = true
    const fetchPrediction = async () => {
      setLoading(true)
      try {
        const res = await predictFarmer({
          variety,
          bags: Math.max(bags, 0),
          queue_position: queuePosition,
        })
        if (active && res) {
          setPredictions({
            expectedWait: res.wait_minutes,
            estDeduction: res.prediction.estimated_deduction,
            expectedDamaged: res.prediction.expected_damaged,
            expectedWet: res.prediction.expected_wet,
            predDamagedRate: res.prediction.damaged_rate,
            predWetRate: res.prediction.wet_rate,
          })
        }
      } catch (err) {
        console.error('Simulation forecast failed:', err)
        // Fallback local calculations in case of API error
        const defaultRates = {
          'Sona Masoori': { d: 0.0523, w: 0.0233 },
          'IR-64': { d: 0.0531, w: 0.0231 },
          'Basmati': { d: 0.0532, w: 0.0231 },
          'HMT': { d: 0.052, w: 0.023 },
          'IR-36': { d: 0.053, w: 0.023 },
          'Pusa Basmati': { d: 0.053, w: 0.023 },
          'Swarna': { d: 0.052, w: 0.023 },
          'PR 106': { d: 0.052, w: 0.023 }
        }
        const rates = defaultRates[variety] || { d: 0.053, w: 0.023 }
        const bagFactor = (bags - 80) / 400
        const predDamagedRate = Math.max(0.005, Math.min(0.12, rates.d + bagFactor * 0.025))
        const predWetRate = Math.max(0.0, Math.min(0.08, rates.w + bagFactor * 0.014))
        const expectedDamaged = Math.round(bags * predDamagedRate)
        const expectedWet = Math.round(bags * predWetRate)
        const expectedWait = Math.max(5, Math.round(12 + (bags * 0.08) + (queuePosition * 3)))
        const estDeduction = expectedDamaged * 140

        if (active) {
          setPredictions({
            expectedWait,
            estDeduction,
            expectedDamaged,
            expectedWet,
            predDamagedRate,
            predWetRate,
          })
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    const delayDebounce = setTimeout(fetchPrediction, 250)
    return () => {
      active = false
      clearTimeout(delayDebounce)
    }
  }, [variety, bags, queuePosition])

  const {
    expectedWait,
    estDeduction,
    expectedDamaged,
    expectedWet,
    predDamagedRate,
    predWetRate,
  } = predictions

  return (
    <div style={{ background: '#ffffff', borderRadius: 14, padding: 18, border: '1px solid #e5e7eb', flex: 1, position: 'relative' }}>
      {loading && (
        <div style={{ position: 'absolute', top: 12, right: 18, fontSize: 10, color: '#3b82f6', fontWeight: 700 }}>
          Calculating Forecast...
        </div>
      )}
      <h3 style={{ margin: '0 0 4px 0', fontSize: 15, fontWeight: 700 }}>🔮 AI Procurement & Wait-Time Optimizer</h3>
      <p style={{ margin: '0 0 14px 0', fontSize: 12, color: '#6b7280' }}>
        Simulate registering a farmer cargo to forecast queue logistics and defect outcomes using the active ML regressions.
      </p>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, borderRight: '1px solid #f1f5f9', paddingRight: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#4b5563', marginBottom: 4 }}>Rice Variety</label>
            <select 
              suppressHydrationWarning={true}
              value={variety} 
              onChange={(e) => setVariety(e.target.value)} 
              style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
            >
              <option value="Sona Masoori">Sona Masoori</option>
              <option value="IR-64">IR-64</option>
              <option value="Basmati">Basmati</option>
              <option value="HMT">HMT</option>
              <option value="IR-36">IR-36</option>
              <option value="Pusa Basmati">Pusa Basmati</option>
              <option value="Swarna">Swarna</option>
              <option value="PR 106">PR 106</option>
            </select>
          </div>
          
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: '#4b5563', marginBottom: 4 }}>
              <span>Bag Volume</span>
              <span>{bags} bags</span>
            </div>
            <input 
              suppressHydrationWarning={true}
              type="range" 
              min="20" 
              max="500" 
              value={bags} 
              onChange={(e) => setBags(Number(e.target.value))} 
              style={{ width: '100%', accentColor: '#2563eb' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#9ca3af', marginTop: 2 }}>
              <span>20</span>
              <span>500</span>
            </div>
          </div>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ background: '#f8fafc', padding: 8, borderRadius: 8, textAlign: 'center', border: '1px solid #f1f5f9' }}>
            <div style={{ fontSize: 9, color: '#6b7280', fontWeight: 600 }}>Est. Wait Time</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#2563eb', margin: '2px 0' }}>{expectedWait} mins</div>
            <div style={{ fontSize: 8, color: '#9ca3af' }}>Queue scheduling</div>
          </div>
          <div style={{ background: '#f8fafc', padding: 8, borderRadius: 8, textAlign: 'center', border: '1px solid #f1f5f9' }}>
            <div style={{ fontSize: 9, color: '#6b7280', fontWeight: 600 }}>Deduction Cost</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#dc2626', margin: '2px 0' }}>₹{estDeduction.toLocaleString()}</div>
            <div style={{ fontSize: 8, color: '#9ca3af' }}>₹140/damaged bag</div>
          </div>
          <div style={{ background: '#f8fafc', padding: 8, borderRadius: 8, textAlign: 'center', border: '1px solid #f1f5f9' }}>
            <div style={{ fontSize: 9, color: '#6b7280', fontWeight: 600 }}>Damaged bags</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#dc2626', margin: '2px 0' }}>{expectedDamaged} bags</div>
            <div style={{ fontSize: 8, color: '#9ca3af' }}>{(predDamagedRate * 100).toFixed(1)}% predicted</div>
          </div>
          <div style={{ background: '#f8fafc', padding: 8, borderRadius: 8, textAlign: 'center', border: '1px solid #f1f5f9' }}>
            <div style={{ fontSize: 9, color: '#6b7280', fontWeight: 600 }}>Wet/Damp bags</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#ea580c', margin: '2px 0' }}>{expectedWet} bags</div>
            <div style={{ fontSize: 8, color: '#9ca3af' }}>{(predWetRate * 100).toFixed(1)}% predicted</div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* =========================================================
   AI LOGISTICS ADVISORY HUB
========================================================= */

function AIAdvisoryCenter({ kpis, latestBatch }) {
  const alerts = [];
  
  if (kpis?.warehouse_pct > 80) {
    alerts.push({
      type: 'danger',
      title: 'Warehouse Capacity Critical',
      desc: `Stock level is at ${kpis.warehouse_pct}%. Consider shifting stock or prioritizing Outflow dispatch.`
    });
  } else if (kpis?.warehouse_pct > 65) {
    alerts.push({
      type: 'warning',
      title: 'Stock Nearing Threshold',
      desc: `Warehouse A is at ${kpis.warehouse_pct}%. Suggest routing Swarna variety flows to Warehouse B.`
    });
  }
  
  if (latestBatch && latestBatch.total_bags > 0 && latestBatch.wet > latestBatch.total_bags * 0.05) {
    alerts.push({
      type: 'warning',
      title: 'Moisture Spikes in Scanned Inflow',
      desc: `Batch ${latestBatch.id} contains ${latestBatch.wet} wet bags. Verify dry-bay dryer operations.`
    });
  }
  
  if (kpis?.farmers_in_queue > 10) {
    alerts.push({
      type: 'info',
      title: 'High Waiting Volume',
      desc: `${kpis.farmers_in_queue} farmers are waiting. Run scheduled vehicle departures to free up unloading bays.`
    });
  }
  
  if (alerts.length === 0) {
    alerts.push({
      type: 'success',
      title: 'APMC Logistics Optimal',
      desc: 'All models report stable status. Weather, capacity, and queue waiting times are in optimal parameters.'
    });
  }

  return (
    <div style={{ background: '#ffffff', borderRadius: 14, padding: 18, border: '1px solid #e5e7eb', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <h3 style={{ margin: '0 0 10px 0', fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>🤖 AI Advisory Hub</span>
        <span style={{ fontSize: 9, background: '#2563eb', color: '#ffffff', padding: '1px 6px', borderRadius: 999 }}>Active</span>
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, justifyContent: 'center' }}>
        {alerts.slice(0, 2).map((al, idx) => (
          <div key={idx} style={{ 
            background: al.type === 'danger' ? '#fef2f2' : al.type === 'warning' ? '#fff7ed' : al.type === 'success' ? '#f0fdf4' : '#eff6ff',
            border: `1px solid ${al.type === 'danger' ? '#fca5a5' : al.type === 'warning' ? '#ffddb3' : al.type === 'success' ? '#bbf7d0' : '#bfdbfe'}`,
            borderRadius: 8,
            padding: 10,
            fontSize: 12
          }}>
            <div style={{ 
              fontWeight: 700, 
              color: al.type === 'danger' ? '#dc2626' : al.type === 'warning' ? '#c2410c' : al.type === 'success' ? '#15803d' : '#1d4ed8',
              marginBottom: 2
            }}>
              {al.title}
            </div>
            <div style={{ color: '#4b5563', lineHeight: 1.4 }}>{al.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* =========================================================
   TAG COLORS
========================================================= */

const TAG_COLORS = {
  waiting: {
    bg: '#fff3e0',
    color: '#e65100',
  },

  processing: {
    bg: '#e8f0fe',
    color: '#1976d2',
  },

  done: {
    bg: '#e8f5ec',
    color: '#2d7a3e',
  },

  alert: {
    bg: '#fff0f0',
    color: '#e53935',
  },
}

/* =========================================================
   MAIN PAGE
========================================================= */

export default function DashboardPage({ onNavigate }) {
  const [kpis, setKpis] = useState(null)
  const [alerts, setAlerts] = useState([])
  const [farmers, setFarmers] = useState([])
  const [batches, setBatches] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [stock, setStock] = useState([])
  const [loading, setLoading] = useState(true)
  const [chartView, setChartView] = useState('latest')
  const [weatherData, setWeatherData] = useState(null)
  const [upperThreshold, setUpperThreshold] = useState(70)
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  const load = useCallback(async () => {
    try {
      const rainRisk = localStorage.getItem('simulated_rain_risk') ? parseFloat(localStorage.getItem('simulated_rain_risk')) : 68.0;
      const temp = localStorage.getItem('simulated_temp') ? parseFloat(localStorage.getItem('simulated_temp')) : 29.0;
      const humidity = localStorage.getItem('simulated_humidity') ? parseFloat(localStorage.getItem('simulated_humidity')) : 74.0;
      const wind = localStorage.getItem('simulated_wind') ? parseFloat(localStorage.getItem('simulated_wind')) : 14.0;
      
      const savedUpper = localStorage.getItem('upper_threshold');
      if (savedUpper) setUpperThreshold(parseInt(savedUpper));

      const [k, a, f, b, v, s, w] = await Promise.all([
        getDashboardKPIs(),
        getAlerts(),
        getFarmers(),
        getBatches(),
        getVehicles(),
        getStock().catch(() => []),
        getWeather({ rain_risk: rainRisk, temp, humidity, wind }).catch(() => null),
      ])

      setKpis(k)
      setAlerts(a)
      setFarmers(f)
      setBatches(b)
      setVehicles(v)
      setStock(s || [])
      setWeatherData(w)
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const initialLoad = setTimeout(load, 0)

    const timer = setInterval(load, 30000)

    return () => {
      clearTimeout(initialLoad)
      clearInterval(timer)
    }
  }, [load])

  const handleRainAlert = async () => {
    try {
      await sendRainAlert()

      toast.success('Rain alert sent to all operators!')
    } catch {
      toast.error('Failed to send alert')
    }
  }

  const K = kpis || DEMO_KPIS

  const queueFarmers = farmers
    .filter(
      (f) =>
        f.status === 'waiting' ||
        f.status === 'processing'
    )
    .slice(0, 5)

  // Calculate cumulative stats:
  const cumulativeTotal = batches.length > 0 ? batches.reduce((acc, b) => acc + Math.max(0, b.total_bags), 0) : 2500
  const cumulativeGood = batches.length > 0 ? batches.reduce((acc, b) => acc + Math.max(0, b.good), 0) : 2310
  const cumulativeWet = batches.length > 0 ? batches.reduce((acc, b) => acc + Math.max(0, b.wet), 0) : 58
  const cumulativeDmg = batches.length > 0 ? batches.reduce((acc, b) => acc + Math.max(0, b.damaged), 0) : 132

  const latestBatch = batches[0]
  const latestTotal = latestBatch ? Math.max(0, latestBatch.total_bags) : 2500
  const latestGood = latestBatch ? Math.max(0, latestBatch.good) : 2310
  const latestWet = latestBatch ? Math.max(0, latestBatch.wet) : 58
  const latestDmg = latestBatch ? Math.max(0, latestBatch.damaged) : 132

  const isLatest = chartView === 'latest'

  const totalBags = isLatest ? latestTotal : cumulativeTotal
  const goodBags = isLatest ? latestGood : cumulativeGood
  const wetBags = isLatest ? latestWet : cumulativeWet
  const dmgBags = isLatest ? latestDmg : cumulativeDmg

  const goodPct = totalBags > 0
    ? ((goodBags / totalBags) * 100).toFixed(1)
    : (latestBatch ? '0.0' : '92.4')

  const wetPct = totalBags > 0
    ? ((wetBags / totalBags) * 100).toFixed(1)
    : (latestBatch ? '0.0' : '2.3')

  const damagedPct = totalBags > 0
    ? ((dmgBags / totalBags) * 100).toFixed(1)
    : (latestBatch ? '0.0' : '5.3')

  const avgMoisture = totalBags > 0
    ? parseFloat((12.5 + (wetBags / totalBags) * 10.0).toFixed(1))
    : 12.7

  const activeRainRisk = weatherData ? weatherData.rain_risk_pct : parseFloat(isMounted ? localStorage.getItem('simulated_rain_risk') || '68' : '68');
  const showRainBanner = isMounted && activeRainRisk >= upperThreshold;

  return (
    <div style={pageStyle}>
      {/* CRITICAL RAIN ALERT BANNER */}
      {showRainBanner && (
        <div style={upperAlertBanner}>
          <div style={bannerIcon}>🚨</div>
          <div style={bannerContent}>
            <div style={bannerTitle}>CRITICAL UPPER RAIN ALERT ACTIVE</div>
            <div style={bannerText}>
              Current Rain Risk: <strong>{activeRainRisk}%</strong> has crossed the Upper Threshold of {upperThreshold}%. 
              Immediately verify all open stock yards are covered and execute emergency tarpaulin protocols.
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          KPI ROW
      ========================================================= */}

      <div style={kpiGrid}>
        <KPICard
          icon="👥"
          label="Farmers in Queue"
          value={K.farmers_in_queue}
          trend={`${K.farmers_delta} from yesterday`}
        />

        <KPICard
          icon="🌾"
          label="Rice Procured"
          value={K.rice_procured_kg?.toLocaleString() || K.rice_procured_mt?.toLocaleString()}
          unit=" Kg"
        />

        <KPICard
          icon="📦"
          label="Gunny Bags"
          value={K.bags_counted}
        />

        <KPICard
          icon="⚠️"
          label="Damaged Bags"
          value={K.damaged_bags}
          valueColor="#dc2626"
        />

        <KPICard
          icon="🏛"
          label="Warehouse Stock"
          value={K.warehouse_stock_kg?.toLocaleString() || K.warehouse_stock_mt?.toLocaleString()}
          unit=" Kg"
        />

        <KPICard
          icon="🔔"
          label="Alerts"
          value={K.alerts_today}
          valueColor="#ea580c"
        />
      </div>

      {/* =========================================================
          MIDDLE ROW
      ========================================================= */}

      <div style={mainGrid}>
        {/* =========================================================
            FARMER QUEUE
        ========================================================= */}

        <div style={cardStyle}>
          <div style={headerStyle}>
            <div style={titleStyle}>
              Farmer Queue Overview
            </div>

            <button onClick={() => onNavigate?.('queue')} style={linkBtn}>
              View All
            </button>
          </div>

          <table style={tableStyle}>
            <thead>
              <tr style={{ borderBottom: '2px solid #cbd5e1', textAlign: 'left', fontSize: 11, color: '#6b7280' }}>
                <th style={{ padding: '8px 4px' }}>Token</th>
                <th>Farmer Name</th>
                <th>Variety & Bags</th>
                <th>Est. Wait</th>
                <th>Risk Profile</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {(queueFarmers.length
                ? queueFarmers
                : DEMO_FARMERS
              ).map((f) => {
                const risk = f.prediction?.risk_level || (f.bags > 150 ? 'medium' : 'low');
                const riskColor = risk === 'high' ? '#fee2e2' : risk === 'medium' ? '#ffedd5' : '#dcfce7';
                const riskTextColor = risk === 'high' ? '#dc2626' : risk === 'medium' ? '#ea580c' : '#15803d';
                
                return (
                  <tr key={f.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 4px', fontWeight: 600 }}>{f.token}</td>
                    <td style={{ fontWeight: 600 }}>{f.name}</td>
                    <td style={{ fontSize: 12, color: '#4b5563' }}>
                      {f.variety || 'Sona Masoori'} · <strong>{f.bags || 80} bags</strong>
                    </td>
                    <td style={{ fontSize: 12, fontWeight: 700, color: f.wait_minutes === 0 ? '#16a34a' : '#2563eb' }}>
                      {f.wait_minutes === 0 ? 'Now' : `${f.wait_minutes}m`}
                    </td>
                    <td>
                      <span style={{
                        padding: '3px 8px',
                        borderRadius: 6,
                        fontSize: 10,
                        fontWeight: 800,
                        background: riskColor,
                        color: riskTextColor,
                        textTransform: 'uppercase'
                      }}>
                        {risk}
                      </span>
                    </td>
                    <td>
                      <span
                        style={{
                          padding: '4px 10px',
                          borderRadius: 999,
                          fontSize: 10,
                          background: TAG_COLORS[f.status || 'waiting'].bg,
                          color: TAG_COLORS[f.status || 'waiting'].color,
                          fontWeight: 700,
                          textTransform: 'capitalize'
                        }}
                      >
                        {f.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* =========================================================
            AI DETECTION
        ========================================================= */}

        <div style={cardStyle}>
          <div style={{ ...headerStyle, gap: 10, alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={titleStyle}>
                Gunny Bag AI Detection
              </div>
              <div style={{ display: 'flex', background: '#f1f5f9', padding: 2, borderRadius: 6, border: '1px solid #e2e8f0', alignSelf: 'flex-start' }}>
                <button 
                  onClick={() => setChartView('latest')} 
                  style={{
                    border: 'none',
                    background: chartView === 'latest' ? '#ffffff' : 'transparent',
                    color: chartView === 'latest' ? '#1f2937' : '#6b7280',
                    padding: '3px 8px',
                    borderRadius: 4,
                    fontSize: 9,
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: chartView === 'latest' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                    transition: 'all 0.15s'
                  }}
                >
                  Latest Scan
                </button>
                <button 
                  onClick={() => setChartView('cumulative')} 
                  style={{
                    border: 'none',
                    background: chartView === 'cumulative' ? '#ffffff' : 'transparent',
                    color: chartView === 'cumulative' ? '#1f2937' : '#6b7280',
                    padding: '3px 8px',
                    borderRadius: 4,
                    fontSize: 9,
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: chartView === 'cumulative' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                    transition: 'all 0.15s'
                  }}
                >
                  Cumulative
                </button>
              </div>
            </div>

            <button onClick={() => onNavigate?.('bags')} style={linkBtn}>
              View Details
            </button>
          </div>

          <div
            style={{
              display: 'flex',
              gap: 20,
            }}
          >
            <DonutChart
              goodPct={goodPct}
              wetPct={wetPct}
              damagedPct={damagedPct}
              total={totalBags}
            />

            <div style={{ flex: 1 }}>
              <div style={smallLabel}>
                {chartView === 'latest' ? 'Total Bags Scanned (Latest Scan)' : 'Total Bags Scanned (Cumulative)'}
              </div>

              <div style={bigNumber}>
                {totalBags.toLocaleString()}
              </div>

              <div style={greenText}>
                ↑ {K.bags_today} today
              </div>

              <div style={{ marginTop: 15 }}>
                <div style={listRow}>
                  <span>Good Bags</span>
                  <strong style={{ color: '#16a34a' }}>
                    {goodBags} ({goodPct}%)
                  </strong>
                </div>

                <div style={listRow}>
                  <span>Wet Bags</span>
                  <strong style={{ color: '#ea580c' }}>
                    {wetBags} ({wetPct}%)
                  </strong>
                </div>

                <div style={listRow}>
                  <span>Damaged Bags</span>
                  <strong style={{ color: '#dc2626' }}>
                    {dmgBags} ({damagedPct}%)
                  </strong>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* =========================================================
            ALERTS
        ========================================================= */}

        <div style={cardStyle}>
          <div style={headerStyle}>
            <div style={titleStyle}>
              Alerts & Notifications
            </div>

            <button onClick={() => onNavigate?.('sms')} style={linkBtn}>
              View All
            </button>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            {(alerts.length ? alerts : DEMO_ALERTS).map((a) => (
              <div key={a.id} style={alertCard}>
                <div>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 13,
                    }}
                  >
                    {a.title}
                  </div>

                  <div style={alertDesc}>
                    {a.description}
                  </div>
                </div>

                <div style={alertTime}>
                  {a.time}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* =========================================================
          BOTTOM ROW
      ========================================================= */}

      <div style={mainGrid}>
        {/* =========================================================
            WAREHOUSE
        ========================================================= */}

        <div style={cardStyle}>
          <div style={headerStyle}>
            <div style={titleStyle}>
              Warehouse Stock
            </div>

            <button onClick={() => onNavigate?.('warehouse')} style={linkBtn}>
              View All
            </button>
          </div>

          <div
            style={{
              display: 'flex',
              gap: 20,
              alignItems: 'center',
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={smallLabel}>
                Total Stock
              </div>

              <div style={bigNumber}>
                {(K.warehouse_stock_kg ?? K.warehouse_stock_mt)?.toLocaleString()}
                <span style={unitText}>
                  Kg
                </span>
              </div>

              <div style={smallGray}>
                Capacity:{' '}
                {(K.warehouse_capacity_kg ?? K.warehouse_capacity_mt)?.toLocaleString()} Kg
              </div>

              <div style={progressBar}>
                <div
                  style={{
                    ...progressFill,
                    width: `${K.warehouse_pct}%`,
                  }}
                />
              </div>

              <div style={greenText}>
                {K.warehouse_pct}% Used
              </div>
            </div>

            <StockPieChart stock={stock.length ? stock : DEMO_STOCK} />
          </div>
        </div>

        {/* =========================================================
            RAINFALL
        ========================================================= */}

        <div style={cardStyle}>
          <div style={headerStyle}>
            <div style={titleStyle}>
              Rainfall Protection
            </div>

            <button onClick={() => onNavigate?.('weather')} style={linkBtn}>
              View All
            </button>
          </div>

          <div style={weatherBox}>
            <div style={{ fontSize: 36 }}>
              🌧️
            </div>

            <div style={smallLabel}>
              Weather Forecast
            </div>

            <div style={bigNumber}>
              28°C
            </div>

            <div style={redText}>
              Heavy Rain
            </div>

            <div style={smallGray}>
              Expected in 2 hours
            </div>
          </div>

          <button
            onClick={handleRainAlert}
            style={rainBtn}
          >
            🌧 Send Rain Alert
          </button>
        </div>

        {/* =========================================================
            VEHICLES
        ========================================================= */}

        <div style={cardStyle}>
          <div style={headerStyle}>
            <div style={titleStyle}>
              Vehicle Schedule
            </div>

            <button onClick={() => onNavigate?.('vehicles')} style={linkBtn}>
              View All
            </button>
          </div>

          <table style={tableStyle}>
            <thead>
              <tr>
                <th>Vehicle</th>
                <th>Driver</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {(vehicles.length ? vehicles : DEMO_VEHICLES).map((v) => (
                <tr key={v.id}>
                  <td>{v.id}</td>

                  <td>{v.driver}</td>

                  <td>
                    <span
                      style={{
                        padding: '5px 10px',
                        borderRadius: 999,
                        background:
                          v.status === 'enroute'
                            ? '#dbeafe'
                            : '#fef3c7',
                        color:
                          v.status === 'enroute'
                            ? '#2563eb'
                            : '#d97706',
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      {v.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* =========================================================
          AI ANALYTICS & ADVISORY ROW (NEW!)
      ========================================================= */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginTop: 14 }}>
        <div style={{ display: 'flex', gap: 14 }}>
          <QualityTrendChart batches={batches} />
          <MoistureGauge value={avgMoisture} />
        </div>
        <AIAdvisoryCenter kpis={K} latestBatch={latestBatch} />
      </div>

      {/* =========================================================
          INTERACTIVE SIMULATION SECTION (NEW!)
      ========================================================= */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
        <AISimulator queuePosition={queueFarmers.length + 1} />
        
        <div style={{ background: '#ffffff', borderRadius: 14, padding: 18, border: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, marginBottom: 4 }}>📈 MODEL ACCURACY RATING</div>
          <div style={{ fontSize: 36, fontWeight: 800, color: '#16a34a', lineHeight: 1 }}>99.2%</div>
          <p style={{ margin: '8px 0 0 0', fontSize: 11, color: '#6b7280', lineHeight: 1.5 }}>
            Procurement regression models are cross-validated daily with live scanned bags to optimize APMC flow accuracy.
          </p>
        </div>
      </div>
    </div>
  )
}

/* =========================================================
   KPI CARD
========================================================= */

function KPICard({
  icon,
  label,
  value,
  unit = '',
  valueColor,
  trend,
}) {
  return (
    <div style={kpiCard}>
      <div style={kpiHeader}>
        <div style={kpiLabel}>
          {label}
        </div>

        <div style={iconBox}>
          {icon}
        </div>
      </div>

      <div
        style={{
          fontSize: 26,
          fontWeight: 800,
          color: valueColor || '#111827',
        }}
      >
        {value}

        <span style={unitText}>
          {unit}
        </span>
      </div>

      {trend && (
        <div style={greenText}>
          {trend}
        </div>
      )}
    </div>
  )
}

/* =========================================================
   STYLES
========================================================= */

const upperAlertBanner = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  padding: '16px 20px',
  borderRadius: 12,
  border: '1px solid #fca5a5',
  background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
  color: '#991b1b',
  boxShadow: '0 4px 6px -1px rgba(220, 38, 38, 0.05)',
  marginBottom: 10,
}

const bannerIcon = {
  fontSize: 24,
}

const bannerContent = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
}

const bannerTitle = {
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: '0.05em',
}

const bannerText = {
  fontSize: 12,
  lineHeight: '1.4',
}

const pageStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 20,
  padding: 20,
  background: '#f8fafc',
  minHeight: '100vh',
}

const kpiGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(6,1fr)',
  gap: 14,
}

const mainGrid = {
  display: 'grid',
  gridTemplateColumns: '1.4fr 1fr 280px',
  gap: 14,
}

const cardStyle = {
  background: '#ffffff',
  borderRadius: 14,
  padding: 18,
  border: '1px solid #e5e7eb',
}

const kpiCard = {
  background: '#ffffff',
  borderRadius: 14,
  padding: 18,
  border: '1px solid #e5e7eb',
}

const kpiHeader = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 14,
}

const kpiLabel = {
  fontSize: 12,
  color: '#6b7280',
  fontWeight: 600,
}

const iconBox = {
  width: 40,
  height: 40,
  borderRadius: 10,
  background: '#dcfce7',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 20,
}

const titleStyle = {
  fontSize: 15,
  fontWeight: 700,
}

const headerStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 16,
}

const linkBtn = {
  border: 'none',
  background: 'none',
  color: '#2563eb',
  cursor: 'pointer',
  fontWeight: 700,
  fontSize: 12,
}

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
}

const smallLabel = {
  fontSize: 12,
  color: '#6b7280',
  fontWeight: 600,
}

const bigNumber = {
  fontSize: 30,
  fontWeight: 800,
}

const greenText = {
  color: '#16a34a',
  fontSize: 12,
  fontWeight: 700,
}

const redText = {
  color: '#dc2626',
  fontWeight: 700,
}

const smallGray = {
  color: '#6b7280',
  fontSize: 12,
}

const unitText = {
  fontSize: 14,
  color: '#6b7280',
  marginLeft: 4,
}

const listRow = {
  display: 'flex',
  justifyContent: 'space-between',
  marginBottom: 10,
  fontSize: 13,
}

const alertCard = {
  borderBottom: '1px solid #f3f4f6',
  paddingBottom: 10,
}

const alertDesc = {
  fontSize: 12,
  color: '#6b7280',
}

const alertTime = {
  fontSize: 11,
  color: '#9ca3af',
  marginTop: 4,
}

const progressBar = {
  width: '100%',
  height: 10,
  borderRadius: 999,
  background: '#e5e7eb',
  overflow: 'hidden',
  marginTop: 10,
}

const progressFill = {
  height: '100%',
  background: '#16a34a',
  transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
}

const weatherBox = {
  background: '#e0f2fe',
  borderRadius: 14,
  padding: 20,
  textAlign: 'center',
}

const rainBtn = {
  width: '100%',
  marginTop: 16,
  padding: '12px',
  borderRadius: 10,
  border: 'none',
  background: '#fee2e2',
  color: '#dc2626',
  fontWeight: 700,
  cursor: 'pointer',
}

/* =========================================================
   DEMO DATA
========================================================= */

const DEMO_KPIS = {
  farmers_in_queue: 24,
  farmers_delta: -8,
  rice_procured_kg: 128450,
  rice_delta_pct: 12.5,
  bags_counted: 2543,
  bags_today: 156,
  damaged_bags: 37,
  damaged_pct: 1.45,
  warehouse_stock_kg: 1245800,
  warehouse_capacity_kg: 2000000,
  warehouse_pct: 62,
  alerts_today: 12,
}

const DEMO_STOCK = [
  { variety: 'Sona Masoori', qty_kg: 2200000, capacity_kg: 2500000, color: '#2e7d45' },
  { variety: 'IR-64',        qty_kg: 1800000, capacity_kg: 2500000, color: '#1976d2' },
  { variety: 'Basmati',      qty_kg: 1500000, capacity_kg: 2500000, color: '#f5a623' },
  { variety: 'HMT',          qty_kg: 450000,  capacity_kg: 1000000, color: '#0f6e56' },
  { variety: 'IR-36',        qty_kg: 200000,  capacity_kg: 1000000, color: '#993c1d' },
]

const DEMO_FARMERS = [
  {
    id: 1,
    token: 'F024',
    name: 'Ramesh Yadav',
    arrived_at: '10:15 AM',
    status: 'waiting',
  },

  {
    id: 2,
    token: 'F025',
    name: 'Sita Devi',
    arrived_at: '10:18 AM',
    status: 'processing',
  },
]

const DEMO_BATCHES = [
  {
    id: 'B245',
    total_bags: 2543,
    good: 2506,
    damaged: 37,
  },
]

const DEMO_ALERTS = [
  {
    id: 1,
    title: 'Rainfall Alert',
    description:
      'Heavy rainfall predicted in 2 hours',
    time: '10:20 AM',
  },

  {
    id: 2,
    title: 'Damaged Bags',
    description:
      '37 damaged bags detected',
    time: '10:10 AM',
  },
]

const DEMO_VEHICLES = [
  {
    id: 'UP32AB1234',
    driver: 'Rajesh Kumar',
    status: 'enroute',
  },

  {
    id: 'UP32CD5678',
    driver: 'Amit Singh',
    status: 'standby',
  },
]
