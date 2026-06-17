'use client'

import { useEffect, useState } from 'react'

export default function Topbar({ title }) {
  const [time, setTime] = useState('')
  const [date, setDate] = useState('')

  useEffect(() => {
    const updateTime = () => {
      const now = new Date()

      const hours = now.getHours()

      const minutes = String(
        now.getMinutes()
      ).padStart(2, '0')

      const ampm =
        hours >= 12 ? 'PM' : 'AM'

      const formattedTime = `${
        hours % 12 || 12
      }:${minutes} ${ampm}`

      const formattedDate =
        now.toLocaleDateString(
          'en-IN',
          {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          }
        )

      setTime(formattedTime)

      setDate(formattedDate)
    }

    updateTime()

    const timer = setInterval(
      updateTime,
      30000
    )

    return () =>
      clearInterval(timer)
  }, [])

  return (
    <header style={topbarStyle}>
      {/* =========================================================
          LEFT SIDE
      ========================================================= */}

      <div style={leftSection}>
        <div style={mainTitle}>
          Smart Rice Procurement & Warehouse Management System
        </div>

        <div style={subTitle}>
          AI-Powered • Offline First • Smart Operations •{' '}
          {title}
        </div>
      </div>

      {/* =========================================================
          OFFLINE MODE
      ========================================================= */}

      <div style={offlineChip}>
        <span>📶</span>

        <span>
          Offline AI Mode
        </span>
      </div>

      {/* DIVIDER */}

      <div style={divider}></div>

      {/* =========================================================
          SYSTEM STATUS
      ========================================================= */}

      <div style={statusSection}>
        <div style={statusLabel}>
          System Status
        </div>

        <div style={statusValue}>
          ● All Systems Operational
        </div>
      </div>

      {/* DIVIDER */}

      <div style={divider}></div>

      {/* =========================================================
          CLOCK
      ========================================================= */}

      <div style={clockSection}>
        <div style={timeText}>
          {time}
        </div>

        <div style={dateText}>
          {date}
        </div>
      </div>

      {/* DIVIDER */}

      <div style={divider}></div>

      {/* =========================================================
          USER PROFILE
      ========================================================= */}

      <div style={userSection}>
        <div style={avatar}>
          OP
        </div>

        <div>
          <div style={userName}>
            Operator
          </div>

          <div style={userRole}>
            Warehouse 1
          </div>
        </div>

        <span style={dropdownIcon}>
          ▾
        </span>
      </div>
    </header>
  )
}

/* =========================================================
   STYLES
========================================================= */

const topbarStyle = {
  width: '100%',
  height: 72,
  background: '#ffffff',
  borderBottom: '1px solid #e5e7eb',
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  padding: '0 20px',
  boxShadow:
    '0 2px 10px rgba(0,0,0,0.04)',
  flexShrink: 0,
}

const leftSection = {
  flex: 1,
  minWidth: 250,
}

const mainTitle = {
  fontSize: 16,
  fontWeight: 800,
  color: '#111827',
  whiteSpace: 'nowrap',
}

const subTitle = {
  fontSize: 11,
  color: '#6b7280',
  marginTop: 3,
}

const offlineChip = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  background: '#dcfce7',
  color: '#15803d',
  padding: '7px 14px',
  borderRadius: 999,
  border:
    '1px solid rgba(21,128,61,0.15)',
  fontSize: 12,
  fontWeight: 700,
  whiteSpace: 'nowrap',
}

const divider = {
  width: 1,
  height: 30,
  background: '#e5e7eb',
}

const statusSection = {
  textAlign: 'center',
  flexShrink: 0,
}

const statusLabel = {
  fontSize: 10,
  color: '#6b7280',
  fontWeight: 600,
}

const statusValue = {
  fontSize: 12,
  color: '#16a34a',
  fontWeight: 700,
  marginTop: 2,
  whiteSpace: 'nowrap',
}

const clockSection = {
  textAlign: 'right',
  flexShrink: 0,
}

const timeText = {
  fontSize: 16,
  fontWeight: 700,
  color: '#111827',
  fontFamily:
    'monospace',
}

const dateText = {
  fontSize: 11,
  color: '#6b7280',
  marginTop: 2,
}

const userSection = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  flexShrink: 0,
}

const avatar = {
  width: 38,
  height: 38,
  borderRadius: '50%',
  background: '#16a34a',
  color: '#ffffff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 13,
  fontWeight: 700,
}

const userName = {
  fontSize: 13,
  fontWeight: 700,
  color: '#111827',
}

const userRole = {
  fontSize: 11,
  color: '#6b7280',
  marginTop: 2,
}

const dropdownIcon = {
  fontSize: 12,
  color: '#6b7280',
}