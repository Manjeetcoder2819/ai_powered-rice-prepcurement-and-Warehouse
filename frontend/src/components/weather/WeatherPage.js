'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { getWeather, sendRainAlert, sendRainAlertEmail, updateChecklist } from '@/lib/api'

/* =========================================================
   MAIN PAGE
========================================================= */

export default function WeatherPage() {
  const [data, setData] = useState(null)
  
  const [upperThreshold, setUpperThreshold] = useState(70)
  const [lowerThreshold, setLowerThreshold] = useState(30)
  const [isMounted, setIsMounted] = useState(false)
  const [alertSent, setAlertSent] = useState(false)

  // Simulation parameters
  const [simulatedRainRisk, setSimulatedRainRisk] = useState(68)
  const [simulatedTemp, setSimulatedTemp] = useState(29)
  const [simulatedHumidity, setSimulatedHumidity] = useState(74)
  const [simulatedWind, setSimulatedWind] = useState(14)

  useEffect(() => {
    setIsMounted(true)
    const savedUpper = localStorage.getItem('upper_threshold')
    const savedLower = localStorage.getItem('lower_threshold')
    if (savedUpper) setUpperThreshold(parseInt(savedUpper))
    if (savedLower) setLowerThreshold(parseInt(savedLower))
  }, [])

  useEffect(() => {
    if (!isMounted) return
    getWeather({
      rain_risk: simulatedRainRisk,
      temp: simulatedTemp,
      humidity: simulatedHumidity,
      wind: simulatedWind
    })
      .then(setData)
      .catch(() => setData(DEMO_WEATHER))
  }, [isMounted, simulatedRainRisk, simulatedTemp, simulatedHumidity, simulatedWind])

  const W = data || DEMO_WEATHER

  // Automated Email/SMS Alert Trigger when Upper Threshold crossed
  useEffect(() => {
    if (!isMounted || !data) return
    const currentRisk = data.rain_risk_pct
    if (currentRisk >= upperThreshold) {
      if (!alertSent) {
        setAlertSent(true)
        sendRainAlert().catch(console.error)
        sendRainAlertEmail().catch(console.error)
        toast(
          `🚨 [AI Automation] Rain Risk (${currentRisk}%) crossed Upper Threshold (${upperThreshold}%)! Automated emergency alerts sent via SMS & Email.`,
          {
            icon: '🚨',
            duration: 6000,
            style: {
              background: '#fef2f2',
              color: '#991b1b',
              border: '1px solid #fca5a5',
              fontWeight: 'bold',
            }
          }
        )
      }
    } else if (currentRisk <= lowerThreshold) {
      if (alertSent) {
        setAlertSent(false)
        toast(
          `✅ [AI Automation] Rain risk subsided to ${currentRisk}% (below Lower Threshold ${lowerThreshold}%). Clear skies confirmed. Safe operations resumed.`,
          {
            icon: '✅',
            duration: 6000,
            style: {
              background: '#f0fdf4',
              color: '#166534',
              border: '1px solid #86efac',
              fontWeight: 'bold',
            }
          }
        )
      }
    } else {
      if (alertSent) {
        setAlertSent(false)
      }
    }
  }, [data?.rain_risk_pct, upperThreshold, lowerThreshold])

  const saveUpperThreshold = (val) => {
    setUpperThreshold(val)
    localStorage.setItem('upper_threshold', val.toString())
  }

  const saveLowerThreshold = (val) => {
    setLowerThreshold(val)
    localStorage.setItem('lower_threshold', val.toString())
  }

  const handleResetSimulation = () => {
    setSimulatedRainRisk(68)
    setSimulatedTemp(29)
    setSimulatedHumidity(74)
    setSimulatedWind(14)
    toast.success('Simulation reset to standard weather conditions')
  }

  /* =========================================================
     CHECKLIST TOGGLE
  ========================================================= */

  const handleCheck = async (id) => {
    const updated = W.checklist.map((item) =>
      item.id === id ? { ...item, done: !item.done } : item
    )

    setData({
      ...W,
      checklist: updated,
    })

    try {
      const current = W.checklist.find((c) => c.id === id)
      await updateChecklist(id, !current?.done)
    } catch {}
  }

  /* =========================================================
     SEND ALERT
  ========================================================= */

  const handleAlert = async () => {
    try {
      const smsResult = await sendRainAlert()
      let emailSent = 0
      try {
        const emailResult = await sendRainAlertEmail()
        emailSent = emailResult.sent ?? 0
      } catch (err) {
        console.error("Email rain alert failed:", err)
      }
      toast.success(
        `Rain alerts sent! SMS: ${smsResult.sent ?? 0} | Email: ${emailSent} operators alerted`
      )
    } catch {
      toast.error('Failed to send alerts')
    }
  }

  /* =========================================================
     ALERT BANNERS
  ========================================================= */

  const renderAlertBanners = () => {
    if (!isMounted) return null
    if (W.rain_risk_pct >= upperThreshold) {
      return (
        <div style={upperAlertBanner}>
          <div style={bannerIcon}>🚨</div>
          <div style={bannerContent}>
            <div style={bannerTitle}>CRITICAL UPPER RAIN ALERT ACTIVE</div>
            <div style={bannerText}>
              Current Rain Risk: <strong>{W.rain_risk_pct}%</strong> has crossed your configured Upper Threshold of {upperThreshold}%. 
              Immediately verify all open stock yards are covered and execute emergency tarpaulin protocols.
            </div>
          </div>
        </div>
      )
    } else if (W.rain_risk_pct <= lowerThreshold) {
      return (
        <div style={downAlertBanner}>
          <div style={bannerIcon}>✅</div>
          <div style={bannerContent}>
            <div style={bannerTitle}>DOWN ALERT ACTIVE (SAFE OPERATIONAL STATE)</div>
            <div style={bannerText}>
              Current Rain Risk: <strong>{W.rain_risk_pct}%</strong> is below your configured Lower Threshold of {lowerThreshold}%. 
              Safe unloading operations are active across all yard counters.
            </div>
          </div>
        </div>
      )
    } else {
      return (
        <div style={cautionAlertBanner}>
          <div style={bannerIcon}>⚠️</div>
          <div style={bannerContent}>
            <div style={bannerTitle}>MONITORING ALERT ACTIVE (TRANSITION ZONE)</div>
            <div style={bannerText}>
              Current Rain Risk: <strong>{W.rain_risk_pct}%</strong> is between the Lower ({lowerThreshold}%) and Upper ({upperThreshold}%) thresholds. 
              Prepare tarpaulin covers, monitor wind speeds, and keep unloading crews on standby.
            </div>
          </div>
        </div>
      )
    }
  }

  const riskColor =
    W.rain_risk_pct >= upperThreshold
      ? '#dc2626'
      : W.rain_risk_pct <= lowerThreshold
      ? '#16a34a'
      : '#ea580c'

  return (
    <div style={pageStyle}>
      {/* DYNAMIC UPPER & DOWN RAIN ALERT BANNERS */}
      {renderAlertBanners()}

      {/* TOP SECTION: WEATHER CARD + THRESHOLD CONFIGURATION */}
      <div style={topGridSection}>
        <div style={weatherCard}>
          {/* ICON */}
          <div style={weatherIcon}>
            {W.rain_risk_pct >= upperThreshold
              ? '🌧️'
              : W.rain_risk_pct <= lowerThreshold
              ? '☀️'
              : '⛅'}
          </div>

          {/* WEATHER DETAILS */}
          <div style={{ flex: 1 }}>
            <div style={tempText}>{W.temp_c}°C</div>
            <div style={weatherDesc}>
              {W.description} · Pimpri, Maharashtra
            </div>
            <div style={weatherMeta}>
              Humidity: {W.humidity}% · Wind: {W.wind_kmh} km/h · Visibility: 8 km
            </div>
          </div>

          {/* RAIN RISK */}
          <div style={riskSection}>
            <div style={riskLabel}>Rain Risk</div>
            <div style={progressBar}>
              <div
                style={{
                  ...progressFill,
                  width: `${W.rain_risk_pct}%`,
                  background:
                    W.rain_risk_pct >= upperThreshold
                      ? '#ef4444'
                      : W.rain_risk_pct <= lowerThreshold
                      ? '#10b981'
                      : '#f5a623',
                }}
              />
            </div>
            <div style={{ ...riskValue, color: riskColor }}>
              {W.rain_risk_pct}%
            </div>
          </div>

          {/* ALERT BUTTON */}
          {W.rain_risk_pct >= upperThreshold && (
            <button onClick={handleAlert} style={alertBtn}>
              🚨 Send Rain Alert
            </button>
          )}
        </div>

        {/* THRESHOLD CONFIGURATION CARD */}
        <div style={thresholdConfigCard}>
          <div style={thresholdTitle}>Rain Alert Configurations</div>
          
          <div style={thresholdGroup}>
            <div style={thresholdLabelRow}>
              <span>🚨 Upper Alert Threshold:</span>
              <strong>{upperThreshold}%</strong>
            </div>
            <input
              type="range"
              min="50"
              max="95"
              step="5"
              value={upperThreshold}
              onChange={(e) => saveUpperThreshold(parseInt(e.target.value))}
              style={sliderStyle}
            />
            <div style={thresholdHelper}>Triggers active alarm warnings and emergency coverage.</div>
          </div>

          <div style={thresholdGroup}>
            <div style={thresholdLabelRow}>
              <span>✅ Lower (Down) Alert Threshold:</span>
              <strong>{lowerThreshold}%</strong>
            </div>
            <input
              type="range"
              min="5"
              max="45"
              step="5"
              value={lowerThreshold}
              onChange={(e) => saveLowerThreshold(parseInt(e.target.value))}
              style={sliderStyle}
            />
            <div style={thresholdHelper}>Reverts system to safe operations when risk subsides.</div>
          </div>
        </div>

        {/* WEATHER SIMULATOR CARD */}
        <div style={simulationCard}>
          <div style={thresholdTitle}>
            <span>Test Alert Simulator</span>
          </div>
          
          <div style={thresholdGroup}>
            <div style={thresholdLabelRow}>
              <span>Rain Risk:</span>
              <strong style={{ color: simulatedRainRisk >= upperThreshold ? '#ef4444' : (simulatedRainRisk <= lowerThreshold ? '#10b981' : '#f5a623') }}>
                {simulatedRainRisk}%
              </strong>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={simulatedRainRisk}
              onChange={(e) => setSimulatedRainRisk(parseInt(e.target.value))}
              style={sliderStyle}
            />
          </div>

          <div style={thresholdGroup}>
            <div style={thresholdLabelRow}>
              <span>Humidity:</span>
              <strong>{simulatedHumidity}%</strong>
            </div>
            <input
              type="range"
              min="10"
              max="100"
              step="5"
              value={simulatedHumidity}
              onChange={(e) => setSimulatedHumidity(parseInt(e.target.value))}
              style={sliderStyle}
            />
          </div>

          <div style={thresholdGroup}>
            <div style={thresholdLabelRow}>
              <span>Wind Speed:</span>
              <strong>{simulatedWind} km/h</strong>
            </div>
            <input
              type="range"
              min="0"
              max="60"
              step="2"
              value={simulatedWind}
              onChange={(e) => setSimulatedWind(parseInt(e.target.value))}
              style={sliderStyle}
            />
          </div>

          <button onClick={handleResetSimulation} style={resetSimBtn}>
            🔄 Reset Simulator
          </button>
        </div>
      </div>

      {/* =========================================================
          YARD CARDS
      ========================================================= */}

      <div style={yardGrid}>
        {W.yards.map(
          (yard) => (
            <div
              key={
                yard.name
              }
              style={{
                ...yardCard,
                borderTop: `4px solid ${
                  yard.status ===
                  'safe'
                    ? '#16a34a'
                    : yard.status ===
                      'caution'
                    ? '#ea580c'
                    : '#dc2626'
                }`,
              }}
            >
              <div
                style={
                  yardTitle
                }
              >
                {yard.name}
              </div>

              <div
                style={{
                  ...yardStatus,
                  color:
                    yard.status ===
                    'safe'
                      ? '#16a34a'
                      : yard.status ===
                        'caution'
                      ? '#ea580c'
                      : '#dc2626',
                }}
              >
                {
                  yard.description
                }
              </div>

              <div
                style={
                  yardDetail
                }
              >
                {
                  yard.detail
                }
              </div>
            </div>
          )
        )}
      </div>

      {/* =========================================================
          FORECAST + CHECKLIST
      ========================================================= */}

      <div style={bottomGrid}>
        {/* FORECAST */}

        <div style={cardStyle}>
          <div
            style={
              cardTitle
            }
          >
            24-Hour Forecast
          </div>

          <div
            style={
              forecastRow
            }
          >
            {W.forecast.map(
              (
                item,
                index
              ) => (
                <div
                  key={
                    index
                  }
                  style={
                    forecastCard
                  }
                >
                  <div
                    style={
                      forecastTime
                    }
                  >
                    {
                      item.time
                    }
                  </div>

                  <div
                    style={
                      forecastIcon
                    }
                  >
                    {
                      item.icon
                    }
                  </div>

                  <div
                    style={
                      forecastTemp
                    }
                  >
                    {
                      item.temp
                    }
                  </div>

                  <div
                    style={
                      forecastRain
                    }
                  >
                    {
                      item.rain_pct
                    }
                  </div>
                </div>
              )
            )}
          </div>
        </div>

        {/* CHECKLIST */}

        <div style={cardStyle}>
          <div
            style={
              checklistHeader
            }
          >
            <span
              style={
                cardTitle
              }
            >
              Prevention
              Checklist
            </span>

            <span
              style={
                rainTag
              }
            >
              ⚠ Rainfall
              Alert
            </span>
          </div>

          <div
            style={
              checklistBox
            }
          >
            {W.checklist.map(
              (item) => (
                <div
                  key={
                    item.id
                  }
                  onClick={() =>
                    handleCheck(
                      item.id
                    )
                  }
                  style={
                    checklistRow
                  }
                >
                  {/* CHECKBOX */}

                  <div
                    style={{
                      ...checkbox,
                      border: `1.5px solid ${
                        item.done
                          ? '#16a34a'
                          : '#d1d5db'
                      }`,
                      background:
                        item.done
                          ? '#16a34a'
                          : 'transparent',
                    }}
                  >
                    {item.done
                      ? '✓'
                      : ''}
                  </div>

                  {/* TEXT */}

                  <span
                    style={{
                      ...checkText,
                      textDecoration:
                        item.done
                          ? 'line-through'
                          : 'none',
                      opacity:
                        item.done
                          ? 0.6
                          : 1,
                    }}
                  >
                    {
                      item.text
                    }
                  </span>

                  {/* PRIORITY */}

                  <span
                    style={{
                      ...priorityTag,
                      background:
                        item.priority ===
                        'high'
                          ? '#fee2e2'
                          : '#ffedd5',

                      color:
                        item.priority ===
                        'high'
                          ? '#dc2626'
                          : '#ea580c',
                    }}
                  >
                    {item.priority.toUpperCase()}
                  </span>
                </div>
              )
            )}
          </div>

          <button
            onClick={
              handleAlert
            }
            style={
              fullAlertBtn
            }
          >
            📱 Alert All
            Yard Operators
          </button>
        </div>
      </div>
    </div>
  )
}

/* =========================================================
   STYLES
========================================================= */

const pageStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
}

const topGridSection = {
  display: 'grid',
  gridTemplateColumns: '1.2fr 0.9fr 0.9fr',
  gap: 16,
  width: '100%',
}

const thresholdConfigCard = {
  background: '#ffffff',
  borderRadius: 14,
  padding: '20px',
  border: '1px solid #e5e7eb',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
}

const simulationCard = {
  background: '#ffffff',
  borderRadius: 14,
  padding: '20px',
  border: '1px solid #e5e7eb',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
}

const resetSimBtn = {
  background: '#f3f4f6',
  color: '#374151',
  border: '1px solid #d1d5db',
  padding: '6px 10px',
  borderRadius: 8,
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: 11,
  marginTop: 6,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  transition: 'background 0.2s',
}

const thresholdTitle = {
  fontSize: 14,
  fontWeight: 700,
  color: '#111827',
  marginBottom: 12,
  borderBottom: '1px solid #e5e7eb',
  paddingBottom: 8,
}

const thresholdGroup = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
}

const thresholdLabelRow = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: 12,
  fontWeight: 600,
  color: '#374151',
}

const thresholdHelper = {
  fontSize: 10,
  color: '#6b7280',
}

const sliderStyle = {
  width: '100%',
  cursor: 'pointer',
  accentColor: '#16a34a',
}

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
}

const downAlertBanner = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  padding: '16px 20px',
  borderRadius: 12,
  border: '1px solid #86efac',
  background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
  color: '#166534',
  boxShadow: '0 4px 6px -1px rgba(22, 101, 52, 0.05)',
}

const cautionAlertBanner = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  padding: '16px 20px',
  borderRadius: 12,
  border: '1px solid #fed7aa',
  background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
  color: '#9a3412',
  boxShadow: '0 4px 6px -1px rgba(154, 52, 18, 0.05)',
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

const weatherCard = {
  background:
    'linear-gradient(135deg,#1a3a5c 0%,#1e4d2b 100%)',
  borderRadius: 14,
  padding: '24px',
  display: 'flex',
  alignItems: 'center',
  gap: 20,
  flexWrap: 'wrap',
}

const weatherIcon = {
  fontSize: 58,
}

const tempText = {
  fontSize: 34,
  fontWeight: 800,
  color: '#ffffff',
  fontFamily:
    'monospace',
}

const weatherDesc = {
  fontSize: 14,
  color:
    'rgba(255,255,255,0.75)',
  marginTop: 4,
}

const weatherMeta = {
  fontSize: 11,
  color:
    'rgba(255,255,255,0.5)',
  marginTop: 8,
}

const riskSection = {
  minWidth: 160,
}

const riskLabel = {
  fontSize: 11,
  color:
    'rgba(255,255,255,0.55)',
  marginBottom: 6,
}

const progressBar = {
  width: '100%',
  height: 8,
  background:
    'rgba(255,255,255,0.15)',
  borderRadius: 999,
  overflow: 'hidden',
  marginBottom: 6,
}

const progressFill = {
  height: '100%',
}

const riskValue = {
  fontSize: 24,
  fontWeight: 800,
  fontFamily:
    'monospace',
}

const alertBtn = {
  background:
    'rgba(229,57,53,0.9)',
  color: '#ffffff',
  border: 'none',
  padding: '10px 18px',
  borderRadius: 8,
  cursor: 'pointer',
  fontWeight: 700,
}

const yardGrid = {
  display: 'grid',
  gridTemplateColumns:
    'repeat(4,1fr)',
  gap: 14,
}

const yardCard = {
  background: '#ffffff',
  padding: 16,
  borderRadius: 12,
  border:
    '1px solid #e5e7eb',
}

const yardTitle = {
  fontSize: 14,
  fontWeight: 700,
  marginBottom: 6,
}

const yardStatus = {
  fontSize: 12,
  fontWeight: 700,
  marginBottom: 8,
}

const yardDetail = {
  fontSize: 11,
  color: '#6b7280',
  lineHeight: 1.8,
  whiteSpace: 'pre-line',
}

const bottomGrid = {
  display: 'grid',
  gridTemplateColumns:
    '1fr 1fr',
  gap: 16,
}

const cardStyle = {
  background: '#ffffff',
  borderRadius: 12,
  padding: 16,
  border:
    '1px solid #e5e7eb',
}

const cardTitle = {
  fontSize: 14,
  fontWeight: 700,
  marginBottom: 14,
}

const forecastRow = {
  display: 'flex',
  gap: 10,
  overflowX: 'auto',
}

const forecastCard = {
  width: 68,
  flexShrink: 0,
  textAlign: 'center',
  background: '#f3f4f6',
  borderRadius: 10,
  padding: '10px 6px',
}

const forecastTime = {
  fontSize: 10,
  color: '#6b7280',
  marginBottom: 6,
}

const forecastIcon = {
  fontSize: 22,
  marginBottom: 6,
}

const forecastTemp = {
  fontSize: 12,
  fontWeight: 700,
  fontFamily:
    'monospace',
}

const forecastRain = {
  fontSize: 10,
  color: '#2563eb',
  marginTop: 4,
}

const checklistHeader = {
  display: 'flex',
  justifyContent:
    'space-between',
  alignItems: 'center',
  marginBottom: 14,
}

const rainTag = {
  padding: '4px 10px',
  borderRadius: 999,
  background: '#ffedd5',
  color: '#ea580c',
  fontSize: 11,
  fontWeight: 700,
}

const checklistBox = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  marginBottom: 14,
}

const checklistRow = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '9px 10px',
  borderRadius: 8,
  cursor: 'pointer',
}

const checkbox = {
  width: 18,
  height: 18,
  borderRadius: 4,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#ffffff',
  fontSize: 11,
  flexShrink: 0,
}

const checkText = {
  flex: 1,
  fontSize: 12,
  color: '#111827',
}

const priorityTag = {
  padding: '3px 8px',
  borderRadius: 999,
  fontSize: 10,
  fontWeight: 700,
}

const fullAlertBtn = {
  width: '100%',
  padding: '10px',
  border: 'none',
  borderRadius: 8,
  background: '#dc2626',
  color: '#ffffff',
  fontWeight: 700,
  cursor: 'pointer',
}

/* =========================================================
   DEMO DATA
========================================================= */

const DEMO_WEATHER = {
  temp_c: 29,

  description:
    'Partly Cloudy',

  humidity: 74,

  wind_kmh: 14,

  rain_risk_pct: 68,

  forecast: [
    {
      time: 'Now',
      icon: '⛅',
      temp: '29°C',
      rain_pct: '12%',
    },

    {
      time: '11AM',
      icon: '⛅',
      temp: '31°C',
      rain_pct: '20%',
    },

    {
      time: '12PM',
      icon: '🌥',
      temp: '32°C',
      rain_pct: '35%',
    },

    {
      time: '1PM',
      icon: '🌦',
      temp: '30°C',
      rain_pct: '55%',
    },

    {
      time: '2PM',
      icon: '🌧',
      temp: '27°C',
      rain_pct: '80%',
    },

    {
      time: '3PM',
      icon: '🌧',
      temp: '25°C',
      rain_pct: '85%',
    },

    {
      time: '4PM',
      icon: '🌦',
      temp: '26°C',
      rain_pct: '60%',
    },

    {
      time: '5PM',
      icon: '⛅',
      temp: '27°C',
      rain_pct: '30%',
    },
  ],

  yards: [
    {
      name: 'Yard A',
      status: 'safe',
      description:
        'Clear — Safe to unload',

      detail:
        'Wind: 10 km/h NW\nHumidity: 68%\nClear for 4 hrs',
    },

    {
      name: 'Yard B',
      status: 'caution',
      description:
        'Overcast — Monitor closely',

      detail:
        'Wind: 16 km/h N\nHumidity: 76%\nRain in 2-3 hrs',
    },

    {
      name: 'Yard C',
      status: 'danger',
      description:
        '⚠ Rain Alert — Cover NOW',

      detail:
        'Wind: 22 km/h NE\nHumidity: 86%\nRain in 60 min',
    },

    {
      name: 'Yard D',
      status: 'safe',
      description:
        'Clear — Normal operations',

      detail:
        'Wind: 8 km/h W\nHumidity: 65%\nClear all day',
    },
  ],

  checklist: [
    {
      id: 1,
      text:
        'Cover all open stock in Yard C immediately',

      priority:
        'high',

      done: false,
    },

    {
      id: 2,
      text:
        'Roll out tarpaulins — Bay 3 and Bay 9',

      priority:
        'high',

      done: false,
    },

    {
      id: 3,
      text:
        'Move 200 bags HMT to covered Zone C',

      priority:
        'high',

      done: false,
    },

    {
      id: 4,
      text:
        'Alert all vehicle drivers of weather delay',

      priority:
        'med',

      done: false,
    },

    {
      id: 5,
      text:
        'Check drainage around Warehouse A entrance',

      priority:
        'med',

      done: true,
    },

    {
      id: 6,
      text:
        'Confirm Zone D quarantine bags are covered',

      priority:
        'med',

      done: false,
    },

    {
      id: 7,
      text:
        'SMS waiting farmers about delay',

      priority:
        'med',

      done: false,
    },

    {
      id: 8,
      text:
        'Inspect Yard B tarpaulin seams',

      priority:
        'med',

      done: true,
    },
  ],
}
