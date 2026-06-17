'use client'

import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import {
  createFarmer,
  deleteFarmer,
  getFarmers,
  sendBulkSMS,
  sendSMS,
  updateFarmerStatus,
} from '@/lib/api'

/* =========================================================
   STATUS STYLE
========================================================= */

const STATUS_STYLE = {
  waiting: {
    bg: '#fff3e0',
    color: '#e65100',
    label: 'In Queue',
  },

  processing: {
    bg: '#e8f0fe',
    color: '#1976d2',
    label: 'Processing',
  },

  done: {
    bg: '#e8f5ec',
    color: '#2d7a3e',
    label: 'Done',
  },

  alert: {
    bg: '#fff0f0',
    color: '#e53935',
    label: 'Damage Alert',
  },
}

/* =========================================================
   VARIETIES
========================================================= */

const VARIETIES = [
  'Sona Masoori',
  'IR-64',
  'Basmati',
  'HMT',
  'IR-36',
  'Pusa Basmati',
  'Swarna',
  'PR 106',
]

/* =========================================================
   MAIN PAGE
========================================================= */

export default function QueuePage() {
  const [farmers, setFarmers] = useState([])
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] =
    useState(false)

  const [form, setForm] = useState({})

  const [loading, setLoading] =
    useState(false)

  const load = useCallback(async () => {
    try {
      const data = await getFarmers()

      setFarmers(data)
    } catch (error) {
      console.log(error)
      setFarmers(DEMO_FARMERS)
    }
  }, [])

  useEffect(() => {
    const initialLoad = setTimeout(load, 0)

    const timer = setInterval(load, 20000)

    return () => {
      clearTimeout(initialLoad)
      clearInterval(timer)
    }
  }, [load])

  const filtered = farmers.filter(
    (f) =>
      f.name
        .toLowerCase()
        .includes(search.toLowerCase()) ||
      f.token
        .toLowerCase()
        .includes(search.toLowerCase()) ||
      f.variety
        .toLowerCase()
        .includes(search.toLowerCase())
  )

  const waiting = farmers.filter(
    (f) => f.status === 'waiting'
  ).length

  const processing = farmers.filter(
    (f) => f.status === 'processing'
  ).length

  const done = farmers.filter(
    (f) => f.status === 'done'
  ).length

  /* =========================================================
     CREATE FARMER
  ========================================================= */

  const handleCreate = async () => {
    if (
      !form.name ||
      !form.mobile ||
      !form.bags ||
      !form.variety
    ) {
      toast.error(
        'Please fill all required fields'
      )

      return
    }

    setLoading(true)

    try {
      const farmer = await createFarmer(form)

      setFarmers((prev) => [
        farmer,
        ...prev,
      ])

      setShowModal(false)

      setForm({})

      toast.success(
        `Token ${farmer.token} assigned`
      )

      await sendSMS({
        recipient_type: 'farmer',
        mobile: farmer.mobile,
        message_type: 'queue',
        message: `Welcome ${farmer.name}!`,
      })
    } catch {
      toast.error(
        'Failed to register farmer'
      )
    } finally {
      setLoading(false)
    }
  }

  /* =========================================================
     UPDATE STATUS
  ========================================================= */

  const handleStatus = async (
    id,
    status
  ) => {
    try {
      const updated =
        await updateFarmerStatus(
          id,
          status
        )

      setFarmers((prev) =>
        prev.map((f) =>
          f.id === id ? updated : f
        )
      )

      toast.success(
        `Status updated to ${status}`
      )
    } catch {
      toast.error(
        'Failed to update status'
      )
    }
  }

  /* =========================================================
     BULK SMS
  ========================================================= */

  const handleBulkSMS = async () => {
    try {
      const result =
        await sendBulkSMS('queue')

      toast.success(
        `SMS sent to ${result.sent} farmers`
      )
    } catch {
      toast.error(
        'Failed to send bulk SMS'
      )
    }
  }

  return (
    <div style={pageStyle}>
      {/* =========================================================
          TOP KPI SECTION
      ========================================================= */}

      <div style={topBar}>
        <div style={kpiRow}>
          <KPISmall
            label="In Queue"
            value={waiting}
            color="#e65100"
          />

          <KPISmall
            label="Processing"
            value={processing}
            color="#1976d2"
          />

          <KPISmall
            label="Done Today"
            value={done}
            color="#16a34a"
          />

          <KPISmall
            label="Est. Clear"
            value={`${Math.ceil(
              waiting * 0.25
            )}hr`}
            color="#374151"
          />
        </div>

        <div style={buttonRow}>
          <button
            onClick={handleBulkSMS}
            style={secondaryButton}
          >
            📱 Bulk SMS
          </button>

          <button
            onClick={() =>
              setShowModal(true)
            }
            style={primaryButton}
          >
            + Register Farmer
          </button>
        </div>
      </div>

      {/* =========================================================
          TABLE SECTION
      ========================================================= */}

      <div style={tableCard}>
        <div style={tableHeader}>
          <div style={titleStyle}>
            Farmer Queue — Today
          </div>

          <div style={searchBox}>
            <span>🔍</span>

            <input
              value={search}
              onChange={(e) =>
                setSearch(
                  e.target.value
                )
              }
              placeholder="Search farmer..."
              style={searchInput}
            />
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th>#</th>
                <th>Token</th>
                <th>Name</th>
                <th>Mobile</th>
                <th>Village</th>
                <th>Variety</th>
                <th>Bags</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((f, index) => {
                const s =
                  STATUS_STYLE[f.status]

                return (
                  <tr key={f.id}>
                    <td>{index + 1}</td>

                    <td>{f.token}</td>

                    <td>{f.name}</td>

                    <td>{f.mobile}</td>

                    <td>{f.village}</td>

                    <td>{f.variety}</td>

                    <td>{f.bags}</td>

                    <td>
                      <span
                        style={{
                          padding:
                            '5px 10px',
                          borderRadius: 999,
                          background:
                            s.bg,
                          color: s.color,
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        {s.label}
                      </span>
                    </td>

                    <td>
                      <div
                        style={{
                          display: 'flex',
                          gap: 6,
                        }}
                      >
                        {f.status ===
                          'waiting' && (
                          <button
                            onClick={() =>
                              handleStatus(
                                f.id,
                                'processing'
                              )
                            }
                            style={
                              processButton
                            }
                          >
                            ▶ Process
                          </button>
                        )}

                        {f.status ===
                          'processing' && (
                          <button
                            onClick={() =>
                              handleStatus(
                                f.id,
                                'done'
                              )
                            }
                            style={
                              doneButton
                            }
                          >
                            ✓ Done
                          </button>
                        )}

                        <button
                          onClick={async () => {
                            try {
                              await sendSMS({
                                recipient_type: 'farmer',
                                mobile: f.mobile,
                                message_type: 'queue',
                                message: `Dear ${f.name}, your token ${f.token} is ${STATUS_STYLE[f.status]?.label || f.status}. Estimated wait: ${f.wait_minutes || 0} min. - APMC`,
                              })

                              toast.success(
                                `SMS sent to ${f.name}`
                              )
                            } catch {
                              toast.error(
                                'SMS failed'
                              )
                            }
                          }}
                          style={
                            smsButton
                          }
                        >
                          📱
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* =========================================================
          MODAL
      ========================================================= */}

      {showModal && (
        <div
          onClick={() =>
            setShowModal(false)
          }
          style={modalOverlay}
        >
          <div
            onClick={(e) =>
              e.stopPropagation()
            }
            style={modalBox}
          >
            <div style={modalHeader}>
              <div style={titleStyle}>
                Register Farmer
              </div>

              <button
                onClick={() =>
                  setShowModal(false)
                }
                style={closeBtn}
              >
                ✕
              </button>
            </div>

            <div style={modalContent}>
              {/* NAME */}

              <InputField
                label="Farmer Name"
                value={form.name || ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    name:
                      e.target.value,
                  })
                }
              />

              {/* MOBILE */}

              <InputField
                label="Mobile"
                value={form.mobile || ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    mobile:
                      e.target.value,
                  })
                }
              />

              {/* VILLAGE */}

              <InputField
                label="Village"
                value={form.village || ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    village:
                      e.target.value,
                  })
                }
              />

              {/* AADHAAR */}

              <InputField
                label="Aadhaar Last 4"
                value={
                  form.aadhaar_last4 ||
                  ''
                }
                onChange={(e) =>
                  setForm({
                    ...form,
                    aadhaar_last4:
                      e.target.value,
                  })
                }
              />

              {/* VARIETY */}

              <div>
                <label style={labelStyle}>
                  Variety
                </label>

                <select
                  value={
                    form.variety ||
                    ''
                  }
                  onChange={(e) =>
                    setForm({
                      ...form,
                      variety:
                        e.target
                          .value,
                    })
                  }
                  style={inputStyle}
                >
                  <option value="">
                    Select Variety
                  </option>

                  {VARIETIES.map(
                    (v) => (
                      <option
                        key={v}
                      >
                        {v}
                      </option>
                    )
                  )}
                </select>
              </div>

              {/* BAGS */}

              <InputField
                label="Bags"
                type="number"
                value={form.bags || ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    bags:
                      parseInt(
                        e.target
                          .value
                      ) || 0,
                  })
                }
              />
            </div>

            <div style={modalFooter}>
              <button
                onClick={() =>
                  setShowModal(false)
                }
                style={
                  secondaryButton
                }
              >
                Cancel
              </button>

              <button
                onClick={
                  handleCreate
                }
                disabled={loading}
                style={
                  primaryButton
                }
              >
                {loading
                  ? 'Registering...'
                  : '🎫 Register'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* =========================================================
   SMALL KPI CARD
========================================================= */

function KPISmall({
  label,
  value,
  color,
}) {
  return (
    <div style={smallKpiCard}>
      <div
        style={{
          fontSize: 22,
          fontWeight: 800,
          color,
        }}
      >
        {value}
      </div>

      <div style={smallKpiLabel}>
        {label}
      </div>
    </div>
  )
}

/* =========================================================
   INPUT FIELD
========================================================= */

function InputField({
  label,
  value,
  onChange,
  type = 'text',
}) {
  return (
    <div>
      <label style={labelStyle}>
        {label}
      </label>

      <input
        type={type}
        value={value}
        onChange={onChange}
        style={inputStyle}
      />
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

const topBar = {
  display: 'flex',
  justifyContent:
    'space-between',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 14,
}

const kpiRow = {
  display: 'flex',
  gap: 12,
  flexWrap: 'wrap',
}

const buttonRow = {
  display: 'flex',
  gap: 10,
}

const smallKpiCard = {
  background: '#ffffff',
  borderRadius: 12,
  padding: '14px 18px',
  border: '1px solid #e5e7eb',
  minWidth: 120,
}

const smallKpiLabel = {
  fontSize: 11,
  color: '#6b7280',
  marginTop: 4,
}

const primaryButton = {
  padding: '10px 18px',
  borderRadius: 8,
  border: 'none',
  background: '#16a34a',
  color: '#ffffff',
  fontWeight: 700,
  cursor: 'pointer',
}

const secondaryButton = {
  padding: '10px 18px',
  borderRadius: 8,
  border:
    '1px solid #d1d5db',
  background: '#ffffff',
  color: '#111827',
  fontWeight: 700,
  cursor: 'pointer',
}

const tableCard = {
  background: '#ffffff',
  borderRadius: 14,
  border: '1px solid #e5e7eb',
  overflow: 'hidden',
}

const tableHeader = {
  padding: 16,
  display: 'flex',
  justifyContent:
    'space-between',
  alignItems: 'center',
  borderBottom:
    '1px solid #e5e7eb',
}

const titleStyle = {
  fontSize: 16,
  fontWeight: 700,
}

const searchBox = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  background: '#f3f4f6',
  padding: '8px 12px',
  borderRadius: 8,
}

const searchInput = {
  border: 'none',
  background: 'transparent',
  outline: 'none',
  width: 220,
}

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
}

const processButton = {
  padding: '5px 10px',
  borderRadius: 6,
  border: 'none',
  background: '#dbeafe',
  color: '#2563eb',
  fontWeight: 700,
  cursor: 'pointer',
  fontSize: 11,
}

const doneButton = {
  padding: '5px 10px',
  borderRadius: 6,
  border: 'none',
  background: '#dcfce7',
  color: '#16a34a',
  fontWeight: 700,
  cursor: 'pointer',
  fontSize: 11,
}

const smsButton = {
  padding: '5px 10px',
  borderRadius: 6,
  border: 'none',
  background: '#ffedd5',
  color: '#ea580c',
  fontWeight: 700,
  cursor: 'pointer',
  fontSize: 11,
}

const modalOverlay = {
  position: 'fixed',
  inset: 0,
  background:
    'rgba(0,0,0,0.5)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 1000,
}

const modalBox = {
  width: 500,
  background: '#ffffff',
  borderRadius: 14,
  overflow: 'hidden',
}

const modalHeader = {
  padding: 18,
  borderBottom:
    '1px solid #e5e7eb',
  display: 'flex',
  justifyContent:
    'space-between',
  alignItems: 'center',
}

const modalContent = {
  padding: 18,
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
}

const modalFooter = {
  padding: 18,
  borderTop:
    '1px solid #e5e7eb',
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 10,
}

const closeBtn = {
  border: 'none',
  background: 'none',
  fontSize: 18,
  cursor: 'pointer',
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
}

/* =========================================================
   DEMO DATA
========================================================= */

const DEMO_FARMERS = [
  {
    id: 1,
    token: 'F024',
    name: 'Ramesh Yadav',
    mobile: '+91 98765 43210',
    village: 'Hadapsar',
    aadhaar_last4: '4321',
    variety: 'Sona Masoori',
    bags: 120,
    arrived_at: '10:15 AM',
    status: 'waiting',
    wait_minutes: 12,
  },

  {
    id: 2,
    token: 'F025',
    name: 'Sita Devi',
    mobile: '+91 97654 32109',
    village: 'Wagholi',
    aadhaar_last4: '8765',
    variety: 'IR-64',
    bags: 85,
    arrived_at: '10:18 AM',
    status: 'processing',
    wait_minutes: 25,
  },

  {
    id: 3,
    token: 'F026',
    name: 'Mahesh Kumar',
    mobile: '+91 96543 21098',
    village: 'Kharadi',
    aadhaar_last4: '2341',
    variety: 'Basmati',
    bags: 200,
    arrived_at: '10:20 AM',
    status: 'done',
    wait_minutes: 0,
  },
]
