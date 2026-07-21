'use client'

import toast from 'react-hot-toast'

export default function OfflineBar() {
  const handleCheckUpdates = () => {
    toast.success('AI models are up to date!')
  }

  return (
    <div style={offlineBarStyle}>
      {/* =========================================================
          LEFT SIDE
      ========================================================= */}

      <div style={leftSection}>
        <div style={pulseDot}></div>

        <span style={wifiIcon}>
          📶
        </span>

        <span style={messageText}>
          <strong style={titleText}>
            Offline AI System
          </strong>

          {' '}All AI models are running locally on this device.
          No internet connection required.
        </span>
      </div>

      {/* =========================================================
          RIGHT SIDE
      ========================================================= */}

      <div style={rightSection}>
        <span style={updateText}>
          Last AI Model Update:
          {' '}
          20 May 2025 09:30 AM
        </span>

        <button
          suppressHydrationWarning={true}
          onClick={handleCheckUpdates}
          style={updateButton}
        >
          ↻ Check for Updates
        </button>
      </div>
    </div>
  )
}

/* =========================================================
   STYLES
========================================================= */

const offlineBarStyle = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 20,
  padding: '10px 20px',
  background: '#111827',
  color: '#d1d5db',
  borderBottom: '1px solid #1f2937',
  flexWrap: 'wrap',
}

const leftSection = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  flex: 1,
  minWidth: 250,
}

const rightSection = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  flexWrap: 'wrap',
}

const pulseDot = {
  width: 10,
  height: 10,
  borderRadius: '50%',
  background: '#22c55e',
  boxShadow: '0 0 10px #22c55e',
  animation: 'pulse 1.5s infinite',
  flexShrink: 0,
}

const wifiIcon = {
  fontSize: 16,
}

const messageText = {
  fontSize: 13,
  lineHeight: 1.5,
}

const titleText = {
  color: '#ffffff',
  fontWeight: 700,
}

const updateText = {
  fontSize: 12,
  color: '#9ca3af',
}

const updateButton = {
  background: '#16a34a',
  color: '#ffffff',
  border: 'none',
  padding: '7px 16px',
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
}