'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { getBatches, getFarmers, scanBatch, sendSMS, updateBatchStatus } from '@/lib/api'

// QualityDonutChart component removed as requested (present on Dashboard)

/* =========================================================
   PAGE COMPONENT
========================================================= */

export default function BagsPage() {
  const [batches, setBatches] = useState([])
  const [farmers, setFarmers] = useState([])
  const [selectedFarmerForView, setSelectedFarmerForView] = useState('')
  const [selectedBatchId, setSelectedBatchId] = useState('')
  const [scanning, setScanning] = useState(false)
  const [selectedFarmerId, setSelectedFarmerId] = useState('')
  const [simulationProgress, setSimulationProgress] = useState(null)
  const [simulationBatch, setSimulationBatch] = useState(null)

  // Custom configurations
  const [scanProfile, setScanProfile] = useState("healthy")
  const [damageThreshold, setDamageThreshold] = useState(5.0)

  useEffect(() => {
    const activeList = batches.length ? batches : DEMO_BATCHES;
    if (activeList.length > 0) {
      const names = activeList.map(b => b.farmer_name);
      if (!selectedFarmerForView || !names.includes(selectedFarmerForView)) {
        const firstFarmer = activeList[0].farmer_name;
        setSelectedFarmerForView(firstFarmer);
        const firstFarmerBatches = activeList.filter(b => b.farmer_name === firstFarmer);
        if (firstFarmerBatches.length > 0) {
          setSelectedBatchId(firstFarmerBatches[0].id);
        }
      }
    }
  }, [batches]);

  const handleFarmerChange = (farmerName) => {
    setSelectedFarmerForView(farmerName);
    const activeList = batches.length ? batches : DEMO_BATCHES;
    const farmerBatches = activeList.filter(b => b.farmer_name === farmerName);
    if (farmerBatches.length > 0) {
      setSelectedBatchId(farmerBatches[0].id);
    } else {
      setSelectedBatchId('');
    }
  };

  const loadFarmers = async () => {
    try {
      const data = await getFarmers()
      setFarmers(data)
      const candidates = data.filter((x) => x.status === 'waiting' || x.status === 'processing')
      if (candidates.length > 0) {
        setSelectedFarmerId(candidates[0].id)
      } else if (data.length > 0) {
        setSelectedFarmerId(data[0].id)
      } else {
        setSelectedFarmerId('')
      }
    } catch (error) {
      console.error(error)
    }
  }

  useEffect(() => {
    getBatches()
      .then(setBatches)
      .catch(() => setBatches(DEMO_BATCHES))

    loadFarmers()
  }, [])

  const isSimulating = simulationProgress !== null && simulationBatch !== null
  
  const activeBatchesList = batches.length ? batches : DEMO_BATCHES
  const uniqueFarmers = Array.from(new Set(activeBatchesList.map(b => b.farmer_name)))
  const farmerBatches = activeBatchesList.filter(b => b.farmer_name === selectedFarmerForView)
  
  const batch = isSimulating
    ? simulationBatch
    : (activeBatchesList.find(b => b.id === selectedBatchId) || farmerBatches[0] || activeBatchesList[0])

  let good = 0
  let damaged = 0
  let wet = 0

  if (isSimulating) {
    for (let i = 1; i <= simulationProgress; i++) {
      if (batch.damaged_indices?.includes(i)) {
        damaged++
      } else if (batch.wet_indices?.includes(i)) {
        wet++
      } else {
        good++
      }
    }
  } else if (batch) {
    damaged = batch.damaged
    wet = batch.wet
    good = batch.good !== undefined ? batch.good : (batch.total_bags - damaged - wet)
  }

  const goodPct =
    batch && batch.total_bags > 0
      ? ((good / batch.total_bags) * 100).toFixed(2)
      : '0.00'

  const deduction = batch
    ? (isSimulating ? (damaged * 140) : batch.deduction_amount)
    : 0

  const handleScan = async () => {
    if (!selectedFarmerId) {
      toast.error('No farmer selected or available to scan')
      return
    }

    const farmerObj = farmers.find(f => f.id === selectedFarmerId);
    if (!farmerObj) return;

    let payload = {
      expected_bags: farmerObj.bags,
      detected_bags: farmerObj.bags,
      damage_pct: null,
      open_leaking: 0
    };

    if (scanProfile === "torn") {
      payload.damage_pct = 8.0;
    } else if (scanProfile === "wet") {
      payload.damage_pct = 2.0;
    } else if (scanProfile === "leaking") {
      payload.detected_bags = Math.max(1, farmerObj.bags - 2);
      payload.damage_pct = 5.0;
      payload.open_leaking = 3;
    }

    setScanning(true)

    try {
      const nb = await scanBatch(selectedFarmerId, payload)
      
      // Start real-time simulation animation in frontend
      setSimulationBatch(nb)
      setSimulationProgress(0)

      const totalBags = nb.total_bags
      const step = Math.max(1, Math.ceil(totalBags / 60))
      let progress = 0

      const interval = setInterval(() => {
        progress += step
        if (progress >= totalBags) {
          clearInterval(interval)
          setSimulationProgress(totalBags)
          
          setTimeout(() => {
            getBatches().then((updatedBatches) => {
              setBatches(updatedBatches)
              setSelectedFarmerForView(nb.farmer_name)
              setSelectedBatchId(nb.id)
              setSimulationProgress(null)
              setSimulationBatch(null)
              setScanning(false)
              loadFarmers()
              
              if (nb.damage_pct >= damageThreshold) {
                toast.error(`⚠️ CRITICAL DAMAGE DETECTED: Batch ${nb.id} contains ${nb.damage_pct}% defects (Limit: ${damageThreshold}%)`);
              } else {
                toast.success(`Batch ${nb.id} scanned successfully — ${nb.damaged} damaged, ${nb.wet} wet`);
              }
            })
          }, 350)
        } else {
          setSimulationProgress(progress)
        }
      }, 25)

    } catch (error) {
      console.error(error)
      toast.error('AI scan failed')
      setScanning(false)
    }
  }

  const handleNotify = async () => {
    if (!batch) return;
    try {
      await sendSMS({
        recipient_type: 'farmer',
        mobile: batch.farmer_mobile,
        message_type: 'damage',
        message: `Dear ${batch.farmer_name}, AI scan of Batch ${batch.id}: ${batch.damaged} damaged, ${batch.wet} wet bags found. Deduction: ₹${deduction.toLocaleString()}. Visit Inspection Counter. - APMC`,
      })
      toast.success(`Damage notification sent to ${batch.farmer_name}`)
    } catch {
      toast.error('SMS failed')
    }
  }

  const handleApproveStatus = async (status) => {
    if (!batch) return;
    try {
      const updated = await updateBatchStatus(batch.id, status);
      setBatches((prev) => prev.map(b => b.id === batch.id ? updated : b));
      toast.success(`Batch ${batch.id} has been ${status}! Stocks routed.`);
      loadFarmers();
    } catch {
      toast.error(`Failed to update status to ${status}`);
    }
  }

  return (
    <div style={pageStyle}>
      {/* =========================================================
          KPI ROW
      ========================================================= */}

      <div style={kpiGrid}>
        {[
          {
            label: 'Total Scanned',
            value:
              batches.length === 0
                ? '4,820'
                : batches.reduce((a, b) => a + b.total_bags, 0).toLocaleString(),
            color: '#111827',
          },
          {
            label: 'Good Bags',
            value:
              batches.length === 0
                ? '4,691'
                : batches
                    .reduce(
                      (a, b) => a + (b.good || (b.total_bags - b.damaged - b.wet)),
                      0
                    )
                    .toLocaleString(),
            color: '#15803d',
          },
          {
            label: 'Damaged Bags',
            value:
              batches.length === 0
                ? '96'
                : batches.reduce((a, b) => a + b.damaged, 0).toLocaleString(),
            color: '#dc2626',
          },
          {
            label: 'Wet / Damp',
            value:
              batches.length === 0
                ? '33'
                : batches.reduce((a, b) => a + b.wet, 0).toLocaleString(),
            color: '#ea580c',
          },
        ].map((k) => (
          <div key={k.label} style={cardStyle}>
            <div
              style={{
                fontSize: 24,
                fontWeight: 800,
                color: k.color,
              }}
            >
              {k.value}
            </div>

            <div
              style={{
                fontSize: 11,
                color: '#6b7280',
                marginTop: 4,
              }}
            >
              {k.label}
            </div>
          </div>
        ))}
      </div>

      {/* =========================================================
          MAIN GRID
      ========================================================= */}

      <div style={mainGrid}>
        {/* =========================================================
            LEFT PANEL
        ========================================================= */}

        <div style={panelStyle}>
          <div style={headerStyle}>
            <span style={titleStyle}>AI Computer Vision Bag Scanner</span>

            <span style={{
              ...badgeStyle,
              background: scanning ? '#dbeafe' : '#fff7ed',
              color: scanning ? '#1e40af' : '#ea580c',
            }}>
              {scanning ? '⚡ Scanning Live...' : '🤖 AI Ready'}
            </span>
          </div>

          {/* SELECT FARMER & PROFILE TO SCAN */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 10, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Select Farmer to Scan</label>
              <select
                value={selectedFarmerId}
                onChange={(e) => setSelectedFarmerId(Number(e.target.value))}
                style={selectStyle}
              >
                {farmers.length === 0 ? (
                  <option value="">No farmers registered</option>
                ) : (
                  farmers.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.token} — {f.name} ({f.bags} bags, {f.variety}) [{f.status}]
                    </option>
                  ))
                )}
              </select>
            </div>
            <div>
              <label style={labelStyle}>AI Quality Defect Profile</label>
              <select
                value={scanProfile}
                onChange={(e) => setScanProfile(e.target.value)}
                style={selectStyle}
              >
                <option value="healthy">Healthy Batch (Normal yield)</option>
                <option value="torn">Torn Bags (8% defects)</option>
                <option value="wet">Wet & Damp Bags (Moisture risk)</option>
                <option value="leaking">Shortage & Open/Leaking (Shortage: 2, Leaking: 3)</option>
              </select>
            </div>
          </div>

          {/* SELECT FARMER & BATCH TO VIEW */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Select Farmer to View</label>
              <select
                value={selectedFarmerForView}
                onChange={(e) => handleFarmerChange(e.target.value)}
                style={selectStyle}
              >
                {uniqueFarmers.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Select Batch to View</label>
              <select
                value={selectedBatchId}
                onChange={(e) => setSelectedBatchId(e.target.value)}
                style={selectStyle}
              >
                {farmerBatches.map((b) => (
                  <option key={b.id} value={b.id}>
                    Batch {b.id} ({b.total_bags} bags)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Configurable threshold */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: 8, borderRadius: 8, marginBottom: 14, border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>Damage Alert Threshold:</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="number"
                step="0.5"
                min="0.5"
                max="50"
                value={damageThreshold}
                onChange={(e) => setDamageThreshold(parseFloat(e.target.value) || 5.0)}
                style={{ width: 60, padding: 4, borderRadius: 4, border: '1px solid #cbd5e1', fontSize: 12, textAlign: 'center' }}
              />
              <span style={{ fontSize: 12, fontWeight: 700 }}>%</span>
            </div>
          </div>

          {/* COMPUTER VISION DETECTIONS PREVIEW / CAMERA FEED */}
          {batch && (
            <div style={{
              background: '#0f172a',
              borderRadius: 10,
              padding: 12,
              marginBottom: 14,
              border: '1px solid #334155'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#94a3b8', fontSize: 11, marginBottom: 8, borderBottom: '1px solid #1e293b', paddingBottom: 6 }}>
                <span>📹 CV CAMERA BAY 2 FEED (Bounding Boxes)</span>
                <span>FPS: 24 · Resolution: 1080p</span>
              </div>
              <div style={{ ...bagGrid, maxHeight: '200px', overflowY: 'auto', paddingRight: '4px' }}>
                {Array.from(
                  { length: batch.total_bags },
                  (_, i) => {
                    const idx = i + 1
                    const isScanned = !isSimulating || idx <= simulationProgress
                    const isDmg = isScanned && batch.damaged_indices?.includes(idx)
                    const isWet = isScanned && batch.wet_indices?.includes(idx)
                    const isLeaking = isScanned && idx <= (batch.open_leaking || 0)

                    let bg = '#334155'
                    let border = '2px solid transparent'
                    let label = ''
                    let labelColor = '#ffffff'
                    
                    if (isScanned) {
                      if (isDmg) {
                        bg = 'rgba(239, 68, 68, 0.2)'
                        border = '2px solid #ef4444'
                        label = 'Torn'
                        labelColor = '#ef4444'
                      } else if (isWet) {
                        bg = 'rgba(245, 158, 11, 0.2)'
                        border = '2px solid #f59e0b'
                        label = 'Wet'
                        labelColor = '#f59e0b'
                      } else if (isLeaking) {
                        bg = 'rgba(234, 179, 8, 0.2)'
                        border = '2px solid #eab308'
                        label = 'Leak'
                        labelColor = '#eab308'
                      } else {
                        bg = 'rgba(16, 185, 129, 0.15)'
                        border = '2px solid #10b981'
                        label = 'OK'
                        labelColor = '#10b981'
                      }
                    }

                    return (
                      <div
                        key={idx}
                        title={`Bag #${idx}: ${label}`}
                        style={{
                          aspectRatio: '1',
                          borderRadius: 4,
                          fontSize: 8,
                          fontWeight: 800,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: bg,
                          border: border,
                          color: labelColor,
                          position: 'relative'
                        }}
                      >
                        <span style={{ fontSize: 7 }}>#{idx}</span>
                        {label && <span style={{ fontSize: 6, fontWeight: 900, textTransform: 'uppercase' }}>{label}</span>}
                      </div>
                    )
                  }
                )}
              </div>
            </div>
          )}

          {/* Stats boxes side-by-side grid */}
          <div style={statsGrid}>
            <div style={greenBox}>
              <div style={bigNumberGreen}>{good}</div>
              <div style={smallTextGreen}>Good</div>
            </div>
            <div style={redBox}>
              <div style={bigNumberRed}>{damaged}</div>
              <div style={smallTextRed}>Damaged</div>
            </div>
            <div style={orangeBox}>
              <div style={bigNumberOrange}>{wet}</div>
              <div style={smallTextOrange}>Wet</div>
            </div>
          </div>

          {isSimulating && (
            <div style={{
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: 8,
              padding: '10px 12px',
              marginBottom: 12,
              fontSize: 13,
              color: '#1d4ed8',
              fontWeight: 600,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <span>🔍 AI Scan in progress...</span>
              <span>Bag {simulationProgress} of {batch.total_bags} ({Math.round(simulationProgress/batch.total_bags*100)}%)</span>
            </div>
          )}

          {/* LEGEND */}

          <div style={legendStyle}>
            <span style={legendItem}>
              <span style={{ ...legendGreen, background: '#10b981', border: '1px solid #10b981' }}></span>
              Good
            </span>

            <span style={legendItem}>
              <span style={{ ...legendRed, background: '#ef4444', border: '1px solid #ef4444' }}></span>
              Damaged/Torn
            </span>

            <span style={legendItem}>
              <span style={{ ...legendOrange, background: '#f59e0b', border: '1px solid #f59e0b' }}></span>
              Wet/Damp
            </span>

            <span style={legendItem}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: '#eab308', border: '1px solid #eab308' }}></span>
              Open/Leaking
            </span>
          </div>

          {/* DEDUCTION & MEASUREMENT MATRIX */}

          <div style={deductionBox}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e5e7eb', paddingBottom: 6, marginBottom: 8 }}>
              <div style={{ fontWeight: 700 }}>AI Scan Measurement Matrix</div>
              {batch && batch.damage_pct >= damageThreshold && (
                <span style={{ fontSize: 10, background: '#fee2e2', color: '#b91c1c', padding: '2px 6px', borderRadius: 4, fontWeight: 800 }}>
                  🚨 EXCEEDS {damageThreshold}% DEFECT LIMIT
                </span>
              )}
            </div>

            {batch && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: 12, color: '#374151', marginBottom: 12 }}>
                <div style={rowBetween}>
                  <span>Expected Bags:</span>
                  <strong>{batch.expected_bags || batch.total_bags}</strong>
                </div>
                <div style={rowBetween}>
                  <span>Detected Bags:</span>
                  <strong>{batch.detected_bags || batch.total_bags}</strong>
                </div>
                <div style={rowBetween}>
                  <span>Shortage bags:</span>
                  <strong style={{ color: batch.shortage > 0 ? '#dc2626' : '#6b7280' }}>
                    {batch.shortage || 0}
                  </strong>
                </div>
                <div style={rowBetween}>
                  <span>Excess bags:</span>
                  <strong style={{ color: batch.excess > 0 ? '#2563eb' : '#6b7280' }}>
                    {batch.excess || 0}
                  </strong>
                </div>
                <div style={rowBetween}>
                  <span>Open/Leaking:</span>
                  <strong style={{ color: batch.open_leaking > 0 ? '#d97706' : '#6b7280' }}>
                    {batch.open_leaking || 0}
                  </strong>
                </div>
                <div style={rowBetween}>
                  <span>Damage Rate:</span>
                  <strong style={{ color: batch.damage_pct >= damageThreshold ? '#dc2626' : '#15803d' }}>
                    {batch.damage_pct || 0.0}%
                  </strong>
                </div>
              </div>
            )}

            <div style={totalDeduction}>
              <span>Estimated Deduction:</span>

              <strong>₹ {deduction.toLocaleString()}</strong>
            </div>
          </div>

          {/* ACTION BUTTONS */}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handleScan}
                disabled={scanning}
                style={{
                  ...greenButton,
                  background: scanning ? '#9ca3af' : '#2563eb'
                }}
              >
                {scanning ? '⚡ Running AI CV Scan...' : '📸 Scan Live Batch'}
              </button>

              <button onClick={handleNotify} style={orangeButton}>
                📱 Send Quality SMS Alert
              </button>
            </div>

            {batch && batch.status === "Pending" && (
              <div style={{ display: 'flex', gap: 10, borderTop: '1px solid #e5e7eb', paddingTop: 10 }}>
                <button
                  onClick={() => handleApproveStatus("Approved")}
                  style={{
                    flex: 1,
                    padding: 10,
                    background: '#16a34a',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: 12
                  }}
                >
                  ✓ Approve Batch & Unload
                </button>
                <button
                  onClick={() => handleApproveStatus("Rejected")}
                  style={{
                    flex: 1,
                    padding: 10,
                    background: '#dc2626',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: 12
                  }}
                >
                  ✕ Reject Batch (Denied)
                </button>
              </div>
            )}
            
            {batch && batch.status !== "Pending" && (
              <div style={{
                textAlign: 'center',
                padding: '8px',
                background: batch.status === "Approved" ? '#dcfce7' : '#fee2e2',
                color: batch.status === "Approved" ? '#15803d' : '#b91c1c',
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 12
              }}>
                Batch status: {batch.status} {batch.status === "Approved" ? "(Stocks segregated & ledger entries updated)" : ""}
              </div>
            )}
          </div>
        </div>

        {/* =========================================================
            RIGHT PANEL
        ========================================================= */}

        <div style={panelStyle}>
          <div style={titleStyle}>Damage Log — All Batches</div>

          <div style={{ overflowY: 'auto', maxHeight: '680px' }}>
            {(batches.length ? batches : DEMO_BATCHES).map((b) => (
              <div key={b.id} style={logRow}>
                <div style={batchId}>{b.id}</div>

                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>
                    {b.farmer_name} <span style={{ fontSize: 10, background: '#f3f4f6', color: '#6b7280', padding: '2px 6px', borderRadius: 4 }}>{b.variety}</span>
                  </div>

                  <div style={{ ...subText, fontSize: 11 }}>
                    {b.good} good · {b.damaged} damaged · {b.wet} wet ·{' '}
                    {b.total_bags} total
                    {b.shortage > 0 && <span style={{ color: '#dc2626', marginLeft: 4 }}>({b.shortage} shortage)</span>}
                  </div>
                </div>

                <span
                  style={{
                    padding: '5px 10px',
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 700,
                    background:
                      b.status === "Rejected"
                        ? '#fee2e2'
                        : b.damage_pct >= damageThreshold
                        ? '#fffbeb'
                        : '#dcfce7',
                    color:
                      b.status === "Rejected"
                        ? '#dc2626'
                        : b.damage_pct >= damageThreshold
                        ? '#b45309'
                        : '#15803d',
                  }}
                >
                  {b.status === "Rejected"
                    ? 'Rejected'
                    : b.damaged > 0
                    ? `₹${b.deduction_amount} deducted`
                    : b.wet > 0
                    ? `⚠️ ${b.wet} Wet Bags`
                    : '✓ All OK'}
                </span>
              </div>
            ))}
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
  gridTemplateColumns: 'repeat(4,1fr)',
  gap: 14,
}

const mainGrid = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 20,
}

const panelStyle = {
  background: '#ffffff',
  borderRadius: 14,
  padding: 18,
  border: '1px solid #e5e7eb',
}

const cardStyle = {
  background: '#ffffff',
  borderRadius: 12,
  padding: 18,
  border: '1px solid #e5e7eb',
}

const headerStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 16,
}

const titleStyle = {
  fontSize: 15,
  fontWeight: 700,
}

const badgeStyle = {
  padding: '4px 12px',
  borderRadius: 999,
  background: '#fff7ed',
  color: '#ea580c',
  fontSize: 11,
  fontWeight: 700,
}

const labelStyle = {
  display: 'block',
  marginBottom: 6,
  fontSize: 11,
  fontWeight: 700,
  color: '#6b7280',
}

const selectStyle = {
  width: '100%',
  padding: '10px',
  borderRadius: 8,
  border: '1px solid #d1d5db',
  fontSize: 14,
}

const statsGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3,1fr)',
  gap: 10,
  marginBottom: 16,
}

const greenBox = {
  background: '#dcfce7',
  padding: 14,
  borderRadius: 10,
  textAlign: 'center',
}

const redBox = {
  background: '#fee2e2',
  padding: 14,
  borderRadius: 10,
  textAlign: 'center',
}

const orangeBox = {
  background: '#ffedd5',
  padding: 14,
  borderRadius: 10,
  textAlign: 'center',
}

const bigNumberGreen = {
  fontSize: 24,
  fontWeight: 800,
  color: '#15803d',
}

const bigNumberRed = {
  fontSize: 24,
  fontWeight: 800,
  color: '#dc2626',
}

const bigNumberOrange = {
  fontSize: 24,
  fontWeight: 800,
  color: '#ea580c',
}

const smallTextGreen = {
  fontSize: 11,
  color: '#15803d',
}

const smallTextRed = {
  fontSize: 11,
  color: '#dc2626',
}

const smallTextOrange = {
  fontSize: 11,
  color: '#ea580c',
}

const bagGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(12,1fr)',
  gap: 4,
  marginBottom: 14,
}

const legendStyle = {
  display: 'flex',
  gap: 16,
  marginBottom: 16,
  fontSize: 12,
}

const legendItem = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
}

const legendGreen = {
  width: 12,
  height: 12,
  borderRadius: 3,
  background: '#bbf7d0',
}

const legendRed = {
  width: 12,
  height: 12,
  borderRadius: 3,
  background: '#fecaca',
}

const legendOrange = {
  width: 12,
  height: 12,
  borderRadius: 3,
  background: '#ffedd5',
}

const deductionBox = {
  background: '#f9fafb',
  border: '1px solid #e5e7eb',
  borderRadius: 10,
  padding: 16,
  marginBottom: 16,
}

const deductionTitle = {
  fontWeight: 700,
  marginBottom: 10,
}

const rowBetween = {
  display: 'flex',
  justifyContent: 'space-between',
  marginBottom: 8,
}

const totalDeduction = {
  display: 'flex',
  justifyContent: 'space-between',
  paddingTop: 10,
  marginTop: 10,
  borderTop: '1px solid #d1d5db',
  color: '#dc2626',
  fontWeight: 800,
}

const greenButton = {
  flex: 1,
  padding: '12px',
  background: '#16a34a',
  color: '#ffffff',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  fontWeight: 700,
}

const orangeButton = {
  flex: 1,
  padding: '12px',
  background: '#fff7ed',
  color: '#ea580c',
  border: '1px solid #fdba74',
  borderRadius: 8,
  cursor: 'pointer',
  fontWeight: 700,
}

const logRow = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '12px 0',
  borderBottom: '1px solid #f3f4f6',
}

const batchId = {
  width: 70,
  fontSize: 12,
  color: '#6b7280',
  fontFamily: 'monospace',
}

const subText = {
  fontSize: 12,
  color: '#6b7280',
}

/* =========================================================
   DEMO DATA
========================================================= */

const DEMO_BATCHES = [
  {
    id: 'B-0082',
    farmer_name: 'Ravi Patil',
    farmer_mobile: '+91 98765 43210',
    total_bags: 120,
    good: 111,
    damaged: 6,
    wet: 3,
    damaged_indices: [4, 13, 27, 54, 89, 103],
    wet_indices: [22, 67, 95],
    deduction_amount: 840,
    scanned_at: '10:30 AM',
  },
  {
    id: 'B-0081',
    farmer_name: 'Sunita Deshpande',
    farmer_mobile: '+91 97654 32109',
    total_bags: 85,
    good: 80,
    damaged: 3,
    wet: 2,
    damaged_indices: [8, 31, 60],
    wet_indices: [15, 45],
    deduction_amount: 420,
    scanned_at: '10:00 AM',
  },
  {
    id: 'B-0080',
    farmer_name: 'Manoj Shinde',
    farmer_mobile: '+91 96543 21098',
    total_bags: 120,
    good: 111,
    damaged: 5,
    wet: 4,
    damaged_indices: [12, 55, 88, 140, 178],
    wet_indices: [30, 90, 150, 190],
    deduction_amount: 700,
    scanned_at: '09:30 AM',
  },
  {
    id: 'B-0079',
    farmer_name: 'Priya Kulkarni',
    farmer_mobile: '+91 95432 10987',
    total_bags: 60,
    good: 60,
    damaged: 0,
    wet: 0,
    damaged_indices: [],
    wet_indices: [],
    deduction_amount: 0,
    scanned_at: '09:00 AM',
  },
]

const DEMO_FARMERS = [
  {
    id: 1,
    name: 'Ravi Patil',
    status: 'processing',
  },
]
