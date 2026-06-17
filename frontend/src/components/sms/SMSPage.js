'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import {
  getSMSLog,
  sendBulkSMS,
  sendRainAlert,
  sendSMS,
} from '@/lib/api'

/* =========================================================
   DEMO API FUNCTIONS
========================================================= */

const demoSendBulkSMS = async () => {
  return {
    sent: 25,
  }
}

const demoSendRainAlert = async () => {
  return {
    sent: 12,
  }
}

/* =========================================================
   MESSAGE TEMPLATES
========================================================= */

const TEMPLATES = {
  queue:
    'Dear [Farmer Name], your token [TK-XXX] is at position [X]. Est. wait: [XX] min. Report to Counter 2. - APMC',

  damage:
    'Dear [Farmer Name], AI detected [X] damaged bags in Batch [B-XXXX]. Deduction: ₹[AMT]. Visit Inspection Counter. - APMC',

  rain:
    'RAIN ALERT: Stock movement delayed at Pimpri APMC due to rainfall. Please wait for further updates. - Procurement Cell',

  complete:
    'Dear [Farmer Name], procurement complete! [XX] bags accepted. Payment ₹[AMT] processed. Collect receipt at Counter 1. - APMC',

  vehicle:
    'Driver [Name], proceed to [Location]. Load: [Description]. Report to Dock [X], Warehouse [Y]. - APMC Logistics',

  custom: '',
}

/* =========================================================
   TYPE CONFIG
========================================================= */

const TYPE_CFG = {
  queue: {
    color: '#1976d2',
    icon: '👤',
  },

  damage: {
    color: '#e53935',
    icon: '⚠️',
  },

  rain: {
    color: '#f5a623',
    icon: '🌧',
  },

  vehicle: {
    color: '#0f6e56',
    icon: '🚛',
  },

  complete: {
    color: '#2d7a3e',
    icon: '✅',
  },

  broadcast: {
    color: '#534ab7',
    icon: '📢',
  },
}

/* =========================================================
   MAIN PAGE
========================================================= */

export default function SMSPage() {
  const [log, setLog] = useState([])

  const [mobile, setMobile] =
    useState('')

  const [recType, setRecType] =
    useState('farmer')

  const [msgType, setMsgType] =
    useState('queue')

  const [message, setMessage] =
    useState(TEMPLATES.queue)

  const [sending, setSending] =
    useState(false)

  useEffect(() => {
    getSMSLog()
      .then(setLog)
      .catch(() =>
        setLog(DEMO_LOG)
      )
  }, [])

  const charCount =
    message.length

  /* =========================================================
     SEND SMS
  ========================================================= */

  const handleSend = async () => {
    if (!message.trim()) {
      toast.error(
        'Message cannot be empty'
      )

      return
    }

    setSending(true)

    try {
      const entry =
        await sendSMS({
          recipient_type: recType,
          mobile,
          message_type: msgType,
          message,
        })

      setLog((prev) => [
        entry,
        ...prev,
      ])

      toast.success(
        'SMS sent successfully!'
      )

      setMessage('')
    } catch {
      toast.error(
        'Failed to send SMS'
      )
    } finally {
      setSending(false)
    }
  }

  /* =========================================================
     BULK SMS
  ========================================================= */

  const handleBulk = async (
    type
  ) => {
    try {
      const result =
        await sendBulkSMS(type)

      toast.success(
        `Bulk SMS sent to ${result.sent} recipients`
      )
    } catch {
      toast.error(
        'Bulk SMS failed'
      )
    }
  }

  /* =========================================================
     RAIN ALERT
  ========================================================= */

  const handleRain =
    async () => {
      try {
        const result =
          await sendRainAlert()

        toast.success(
          `Rain alert sent to ${result.sent} operators!`
        )
      } catch {
        toast.error(
          'Failed to send rain alert'
        )
      }
    }

  const L = log.length
    ? log
    : DEMO_LOG

  return (
    <div style={pageStyle}>
      {/* =========================================================
          KPI SECTION
      ========================================================= */}

      <div style={kpiGrid}>
        {[
          {
            label:
              'SMS Sent Today',
            value: L.length,
            color: '#111827',
          },

          {
            label: 'Delivered',
            value: L.filter(
              (s) =>
                s.status ===
                'delivered'
            ).length,
            color: '#16a34a',
          },

          {
            label:
              'Farmers Notified',
            value: L.filter(
              (s) =>
                s.type ===
                  'queue' ||
                s.type ===
                  'complete'
            ).length,
            color: '#2563eb',
          },

          {
            label:
              'Operators Alerted',
            value: L.filter(
              (s) =>
                s.type ===
                'rain'
            ).length,
            color: '#ea580c',
          },
        ].map((item) => (
          <div
            key={item.label}
            style={kpiCard}
          >
            <div
              style={{
                fontSize: 28,
                fontWeight: 800,
                color: item.color,
              }}
            >
              {item.value}
            </div>

            <div style={kpiLabel}>
              {item.label}
            </div>
          </div>
        ))}
      </div>

      {/* =========================================================
          QUICK ACTION BUTTONS
      ========================================================= */}

      <div style={actionRow}>
        <button
          onClick={() =>
            handleBulk(
              'queue'
            )
          }
          style={blueButton}
        >
          📢 Bulk Queue Update
        </button>

        <button
          onClick={
            handleRain
          }
          style={redButton}
        >
          🌧 Rain Alert
        </button>

        <button
          onClick={() =>
            handleBulk(
              'complete'
            )
          }
          style={greenButton}
        >
          ✅ Notify Completed
        </button>
      </div>

      {/* =========================================================
          MAIN GRID
      ========================================================= */}

      <div style={mainGrid}>
        {/* =========================================================
            COMPOSE SMS
        ========================================================= */}

        <div style={cardStyle}>
          <div style={titleStyle}>
            Compose & Send SMS
          </div>

          <div style={formGrid}>
            {/* RECIPIENT */}

            <div>
              <label style={labelStyle}>
                Recipient Type
              </label>

              <select
                value={recType}
                onChange={(e) =>
                  setRecType(
                    e.target.value
                  )
                }
                style={inputStyle}
              >
                <option value="farmer">
                  Individual Farmer
                </option>

                <option value="all-farmers">
                  All Waiting
                  Farmers
                </option>

                <option value="operator">
                  Yard Operator
                </option>

                <option value="driver">
                  Vehicle Driver
                </option>

                <option value="broadcast">
                  Broadcast All
                </option>
              </select>
            </div>

            {/* MOBILE */}

            <div>
              <label style={labelStyle}>
                Mobile Number
              </label>

              <input
                type="text"
                value={mobile}
                onChange={(e) =>
                  setMobile(
                    e.target.value
                  )
                }
                placeholder="+91 98765 43210"
                style={inputStyle}
              />
            </div>

            {/* MESSAGE TYPE */}

            <div>
              <label style={labelStyle}>
                Message Type
              </label>

              <select
                value={msgType}
                onChange={(e) => {
                  setMsgType(
                    e.target.value
                  )

                  setMessage(
                    TEMPLATES[
                      e.target
                        .value
                    ] || ''
                  )
                }}
                style={inputStyle}
              >
                <option value="queue">
                  Queue Update
                </option>

                <option value="damage">
                  Damage Alert
                </option>

                <option value="rain">
                  Rain Warning
                </option>

                <option value="complete">
                  Complete
                </option>

                <option value="vehicle">
                  Vehicle Dispatch
                </option>

                <option value="custom">
                  Custom
                </option>
              </select>
            </div>

            {/* MESSAGE */}

            <div>
              <div
                style={{
                  display:
                    'flex',
                  justifyContent:
                    'space-between',
                  marginBottom: 6,
                }}
              >
                <label
                  style={
                    labelStyle
                  }
                >
                  Message
                </label>

                <span
                  style={{
                    fontSize: 11,
                    color:
                      charCount >
                      160
                        ? '#dc2626'
                        : '#6b7280',
                  }}
                >
                  {charCount}
                  /160
                </span>
              </div>

              <textarea
                rows={6}
                value={message}
                onChange={(e) =>
                  setMessage(
                    e.target.value
                  )
                }
                style={{
                  ...inputStyle,
                  resize:
                    'vertical',
                }}
              />
            </div>

            {/* SEND BUTTON */}

            <button
              onClick={
                handleSend
              }
              disabled={sending}
              style={
                sendButton
              }
            >
              {sending
                ? 'Sending...'
                : '📱 Send SMS'}
            </button>
          </div>
        </div>

        {/* =========================================================
            SMS LOG
        ========================================================= */}

        <div style={cardStyle}>
          <div style={titleStyle}>
            SMS Log
          </div>

          <div
            style={{
              overflowY:
                'auto',
              maxHeight:
                '700px',
            }}
          >
            {L.map(
              (sms, index) => {
                const cfg =
                  TYPE_CFG[
                    sms.type
                  ] || {
                    color:
                      '#888',
                    icon: '📱',
                  }

                return (
                  <div
                    key={
                      sms.id ||
                      index
                    }
                    style={
                      logRow
                    }
                  >
                    <div
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius:
                          '50%',
                        background:
                          cfg.color,
                        marginTop: 5,
                      }}
                    />

                    <div
                      style={{
                        flex: 1,
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: 13,
                        }}
                      >
                        {
                          sms.recipient
                        }

                        <span
                          style={
                            mobileText
                          }
                        >
                          {
                            sms.mobile
                          }
                        </span>
                      </div>

                      <div
                        style={
                          msgText
                        }
                      >
                        {
                          sms.message
                        }
                      </div>

                      <div
                        style={
                          timeText
                        }
                      >
                        {
                          sms.sent_at
                        }
                      </div>
                    </div>

                    <span
                      style={{
                        padding:
                          '4px 10px',
                        borderRadius:
                          999,
                        background:
                          sms.status ===
                          'delivered'
                            ? '#dcfce7'
                            : '#ffedd5',
                        color:
                          sms.status ===
                          'delivered'
                            ? '#16a34a'
                            : '#ea580c',
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      {sms.status ===
                      'delivered'
                        ? '✓ Sent'
                        : 'Pending'}
                    </span>
                  </div>
                )
              }
            )}
          </div>
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
  gap: 20,
  padding: 20,
  background: '#f8fafc',
  minHeight: '100vh',
}

const kpiGrid = {
  display: 'grid',
  gridTemplateColumns:
    'repeat(4,1fr)',
  gap: 14,
}

const kpiCard = {
  background: '#ffffff',
  borderRadius: 14,
  padding: 18,
  border:
    '1px solid #e5e7eb',
}

const kpiLabel = {
  fontSize: 12,
  color: '#6b7280',
  marginTop: 4,
}

const actionRow = {
  display: 'flex',
  gap: 10,
  flexWrap: 'wrap',
}

const blueButton = {
  padding: '10px 16px',
  border: 'none',
  borderRadius: 8,
  background: '#dbeafe',
  color: '#2563eb',
  fontWeight: 700,
  cursor: 'pointer',
}

const redButton = {
  padding: '10px 16px',
  border: 'none',
  borderRadius: 8,
  background: '#fee2e2',
  color: '#dc2626',
  fontWeight: 700,
  cursor: 'pointer',
}

const greenButton = {
  padding: '10px 16px',
  border: 'none',
  borderRadius: 8,
  background: '#dcfce7',
  color: '#16a34a',
  fontWeight: 700,
  cursor: 'pointer',
}

const mainGrid = {
  display: 'grid',
  gridTemplateColumns:
    '400px 1fr',
  gap: 20,
}

const cardStyle = {
  background: '#ffffff',
  borderRadius: 14,
  padding: 18,
  border:
    '1px solid #e5e7eb',
}

const titleStyle = {
  fontSize: 16,
  fontWeight: 700,
  marginBottom: 16,
}

const formGrid = {
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
}

const labelStyle = {
  display: 'block',
  marginBottom: 6,
  fontSize: 12,
  fontWeight: 700,
  color: '#374151',
}

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #d1d5db',
  outline: 'none',
  fontSize: 14,
}

const sendButton = {
  padding: '12px',
  border: 'none',
  borderRadius: 8,
  background: '#16a34a',
  color: '#ffffff',
  fontWeight: 700,
  cursor: 'pointer',
}

const logRow = {
  display: 'flex',
  gap: 12,
  padding: '14px 0',
  borderBottom:
    '1px solid #f3f4f6',
}

const mobileText = {
  marginLeft: 10,
  fontSize: 11,
  color: '#6b7280',
}

const msgText = {
  fontSize: 12,
  color: '#6b7280',
  marginTop: 4,
}

const timeText = {
  fontSize: 11,
  color: '#9ca3af',
  marginTop: 4,
}

/* =========================================================
   DEMO DATA
========================================================= */

const DEMO_LOG = [
  {
    id: 1,
    type: 'queue',
    recipient: 'Ravi Patil',
    mobile: '+91 98765 43210',
    message:
      'Token TK-001 processing. Please report to Counter 2.',
    sent_at: '08:44 AM',
    status: 'delivered',
  },

  {
    id: 2,
    type: 'damage',
    recipient:
      'Priya Kulkarni',
    mobile:
      '+91 95432 10987',
    message:
      '6 damaged bags in Batch B-0079. Deduction ₹840.',
    sent_at: '08:51 AM',
    status: 'delivered',
  },

  {
    id: 3,
    type: 'rain',
    recipient:
      'Yard C Operator',
    mobile:
      '+91 94532 19876',
    message:
      'RAIN ALERT — Yard C. Cover all open stock immediately.',
    sent_at: '09:02 AM',
    status: 'delivered',
  },

  {
    id: 4,
    type: 'vehicle',
    recipient:
      'Driver UP32AB1234',
    mobile:
      '+91 91234 11111',
    message:
      'Proceed to Lonikand. Load 180 bags.',
    sent_at: '09:15 AM',
    status: 'delivered',
  },
]
