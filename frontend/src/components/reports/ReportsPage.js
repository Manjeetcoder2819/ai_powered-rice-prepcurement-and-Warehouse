'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { getWeeklySummary, downloadReport } from '@/lib/api'

export default function ReportsPage() {
  const [weeklySummary, setWeeklySummary] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getWeeklySummary()
      .then(setWeeklySummary)
      .catch((err) => {
        console.error("Failed to load weekly summary:", err)
        setWeeklySummary(FALLBACK_WEEKLY)
      })
      .finally(() => setLoading(false))
  }, [])

  const handleDownload = (type, name) => {
    try {
      const url = downloadReport(type)
      window.open(url, '_blank')
      toast.success(`${name} downloaded successfully`)
    } catch (error) {
      console.error(error)
      toast.error(`Failed to download ${name}`)
    }
  }

  const reports = [
    {
      id: 'daily',
      title: 'Daily Queue Report',
      desc: 'Token allocations, farmer records, village data, bag counts, and entry timestamps.',
      icon: '📋',
      color: '#2563eb',
      bgLight: '#eff6ff',
    },
    {
      id: 'warehouse',
      title: 'Warehouse Stock Report',
      desc: 'Variety levels, utilized vs total capacity in Kg, zone mappings, and stock balances.',
      icon: '🏢',
      color: '#059669',
      bgLight: '#ecfdf5',
    },
    {
      id: 'damage',
      title: 'Quality & Damage Report',
      desc: 'AI-scanned bag counts, clean vs damaged/wet ratios, and quality deduction audit logs.',
      icon: '⚠️',
      color: '#dc2626',
      bgLight: '#fef2f2',
    },
    {
      id: 'vehicle',
      title: 'Vehicle Logistics Report',
      desc: 'Driver schedules, load descriptions, slot times, and gate verification progress.',
      icon: '🚛',
      color: '#7c3aed',
      bgLight: '#f5f3ff',
    },
    {
      id: 'sms',
      title: 'SMS Notification Logs',
      desc: 'Log records of SMS updates sent to farmers, drivers, and yard operators.',
      icon: '📱',
      color: '#ea580c',
      bgLight: '#fff7ed',
    },
    {
      id: 'weather',
      title: 'Weather Monitor Log',
      desc: 'Rain risk indicators, temperatures, alerts, and preventative yard actions logged.',
      icon: '🌧️',
      color: '#0891b2',
      bgLight: '#ecfeff',
    },
  ]

  // Calculate chart max bags for scaling
  const maxBags = weeklySummary.length
    ? Math.max(...weeklySummary.map(d => d.bags))
    : 1

  return (
    <div style={pageStyle}>
      {/* Title & Introduction */}
      <div style={headerCard}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 32 }}>📊</span>
          <div>
            <h2 style={headerTitle}>Reports & Analytics Portal</h2>
            <p style={headerSubtitle}>
              Monitor APMC preprocurement metrics, check weekly performance, and download comprehensive dataset reports in CSV format.
            </p>
          </div>
        </div>
      </div>

      {/* Main Layout Grid */}
      <div style={mainGrid}>
        
        {/* DOWNLOAD REPORTS CARDS */}
        <div>
          <h3 style={sectionTitle}>Download Excel/CSV Datasets</h3>
          <div style={cardsGrid}>
            {reports.map((r) => (
              <div key={r.id} style={reportCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ ...iconWrapper, background: r.bgLight, color: r.color }}>
                    {r.icon}
                  </div>
                  <button 
                    onClick={() => handleDownload(r.id, r.title)}
                    style={{ ...downloadBtn, background: r.color }}
                  >
                    📥 Download
                  </button>
                </div>
                <h4 style={cardTitle}>{r.title}</h4>
                <p style={cardDesc}>{r.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* WEEKLY PERFORMANCE GRAPH AND TABLE */}
        <div style={sidebarSection}>
          <h3 style={sectionTitle}>Weekly Procurement Summary</h3>
          <div style={summaryCard}>
            
            {/* Visual Mini Chart */}
            <div style={chartWrapper}>
              <div style={chartHeader}>Bags Processed — Mon to Sun</div>
              <div style={chartBars}>
                {weeklySummary.map((d, idx) => {
                  const pct = maxBags > 0 ? (d.bags / maxBags) * 100 : 0
                  return (
                    <div key={idx} style={barCol}>
                      <div style={barWrapper}>
                        <div 
                          style={{ 
                            ...barFill, 
                            height: `${pct}%`,
                            background: d.bags > 4000 ? '#16a34a' : d.bags > 0 ? '#3b82f6' : '#e5e7eb'
                          }} 
                          title={`${d.bags} Bags`}
                        />
                      </div>
                      <div style={barLabel}>{d.day}</div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Weekly Table */}
            <div style={tableWrapper}>
              {loading ? (
                <div style={loadingText}>Loading summary data...</div>
              ) : (
                <table style={summaryTable}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Day</th>
                      <th style={thStyle}>Farmers</th>
                      <th style={thStyle}>Bags</th>
                      <th style={thStyle}>Damaged</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weeklySummary.map((row, idx) => (
                      <tr key={idx} style={idx % 2 === 0 ? trEvenStyle : trOddStyle}>
                        <td style={tdStyle}><strong>{row.day}</strong></td>
                        <td style={tdStyle}>{row.farmers}</td>
                        <td style={tdStyle}>{row.bags.toLocaleString()}</td>
                        <td style={{ ...tdStyle, color: row.damaged > 0 ? '#dc2626' : '#6b7280' }}>
                          {row.damaged > 0 ? `⚠️ ${row.damaged}` : '0'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

          </div>
        </div>

      </div>
    </div>
  )
}

/* =========================================================
   FALLBACK DATA
========================================================= */
const FALLBACK_WEEKLY = [
  { day: 'Mon', bags: 3200, farmers: 98,  damaged: 45 },
  { day: 'Tue', bags: 4100, farmers: 121, damaged: 62 },
  { day: 'Wed', bags: 4650, farmers: 135, damaged: 38 },
  { day: 'Thu', bags: 3800, farmers: 108, damaged: 55 },
  { day: 'Fri', bags: 4820, farmers: 142, damaged: 37 },
  { day: 'Sat', bags: 2900, farmers: 87,  damaged: 28 },
  { day: 'Sun', bags: 0,    farmers: 0,   damaged: 0  },
]

/* =========================================================
   STYLES
========================================================= */
const pageStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 24,
  padding: '10px 0',
}

const headerCard = {
  background: '#ffffff',
  borderRadius: 16,
  padding: 24,
  border: '1px solid #e5e7eb',
}

const headerTitle = {
  margin: 0,
  fontSize: 22,
  fontWeight: 800,
  color: '#111827',
}

const headerSubtitle = {
  margin: '8px 0 0 0',
  color: '#4b5563',
  fontSize: 14,
  lineHeight: 1.5,
}

const mainGrid = {
  display: 'grid',
  gridTemplateColumns: '1.4fr 1fr',
  gap: 24,
}

const sectionTitle = {
  margin: '0 0 16px 0',
  fontSize: 16,
  fontWeight: 800,
  color: '#1f2937',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const cardsGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  gap: 16,
}

const reportCard = {
  background: '#ffffff',
  borderRadius: 14,
  padding: 20,
  border: '1px solid #e5e7eb',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  minHeight: 180,
  transition: 'transform 0.2s, box-shadow 0.2s',
  cursor: 'default',
  boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
}

const iconWrapper = {
  width: 42,
  height: 42,
  borderRadius: 10,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 20,
  fontWeight: 'bold',
}

const downloadBtn = {
  padding: '6px 12px',
  borderRadius: 6,
  border: 'none',
  color: '#ffffff',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
}

const cardTitle = {
  margin: '16px 0 6px 0',
  fontSize: 15,
  fontWeight: 700,
  color: '#111827',
}

const cardDesc = {
  margin: 0,
  fontSize: 12,
  color: '#6b7280',
  lineHeight: 1.5,
}

const sidebarSection = {
  display: 'flex',
  flexDirection: 'column',
}

const summaryCard = {
  background: '#ffffff',
  borderRadius: 16,
  padding: 20,
  border: '1px solid #e5e7eb',
  display: 'flex',
  flexDirection: 'column',
  gap: 20,
}

const chartWrapper = {
  border: '1px solid #f3f4f6',
  borderRadius: 12,
  padding: 16,
  background: '#f9fafb',
}

const chartHeader = {
  fontSize: 12,
  fontWeight: 700,
  color: '#4b5563',
  marginBottom: 16,
  textAlign: 'center',
}

const chartBars = {
  display: 'flex',
  justifyContent: 'space-around',
  height: 100,
  alignItems: 'flex-end',
}

const barCol = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  flex: 1,
}

const barWrapper = {
  height: 80,
  width: 14,
  background: '#e5e7eb',
  borderRadius: 4,
  overflow: 'hidden',
  display: 'flex',
  alignItems: 'flex-end',
}

const barFill = {
  width: '100%',
  borderRadius: 4,
  transition: 'height 0.4s ease',
}

const barLabel = {
  fontSize: 10,
  color: '#6b7280',
  marginTop: 6,
  fontWeight: 600,
}

const tableWrapper = {
  overflowX: 'auto',
}

const loadingText = {
  padding: 20,
  textAlign: 'center',
  color: '#6b7280',
  fontSize: 13,
}

const summaryTable = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 12,
}

const thStyle = {
  textAlign: 'left',
  padding: '8px 10px',
  borderBottom: '2px solid #e5e7eb',
  color: '#374151',
  fontWeight: 700,
}

const tdStyle = {
  padding: '10px',
  borderBottom: '1px solid #f3f4f6',
  color: '#4b5563',
}

const trEvenStyle = {
  background: '#ffffff',
}

const trOddStyle = {
  background: '#f9fafb',
}
