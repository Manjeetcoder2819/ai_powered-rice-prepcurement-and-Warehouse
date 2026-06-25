"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  getVehicles,
  createVehicle,
  updateVehicle,
  cancelVehicleBooking,
  autoScheduleVehicles,
  sendSMS,
  gateVerify,
  resetSimulatorDB,
} from "@/lib/api";

/* =========================================================
   STATUS CONFIG
========================================================= */

const STATUS_CFG = {
  enroute: {
    bg: "#e8f0fe",
    color: "#1976d2",
    label: "En Route",
    icon: "🚛",
  },

  standby: {
    bg: "#fff8ee",
    color: "#c67a00",
    label: "Standby",
    icon: "🅿",
  },

  offline: {
    bg: "#fff0f0",
    color: "#e53935",
    label: "Offline",
    icon: "🔧",
  },

  arrived: {
    bg: "#e8f5ec",
    color: "#2d7a3e",
    label: "Arrived",
    icon: "✅",
  },
};

/* =========================================================
   MAIN COMPONENT
========================================================= */

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState([]);
  const [showAdd, setShowAdd] = useState(false);

  const [form, setForm] = useState({
    id: "",
    driver: "",
    driver_mobile: "",
    route: "",
    load: "",
    schedule_time: "",
    status: "standby",
  });

  // ANPR Simulator states
  const [selectedPlate, setSelectedPlate] = useState("MH14CD9087");
  const [ocrConfidence, setOcrConfidence] = useState(0.95);
  const [verifyResult, setVerifyResult] = useState(null);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [simulatedTime, setSimulatedTime] = useState("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const yyyy = now.getFullYear();
      const mm = pad(now.getMonth() + 1);
      const dd = pad(now.getDate());
      const hh = pad(now.getHours());
      const min = pad(now.getMinutes());
      const ss = pad(now.getSeconds());
      setSimulatedTime(`${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    getVehicles()
      .then(setVehicles)
      .catch(() => setVehicles(DEMO_VEHICLES));
  }, []);

  const V = vehicles.length ? vehicles : DEMO_VEHICLES;

  const active = V.filter((v) => v.status === "enroute" || v.status === "arrived").length;
  const standby = V.filter((v) => v.status === "standby").length;
  const offline = V.filter((v) => v.status === "offline").length;

  const handleAutoSchedule = async () => {
    try {
      const result = await autoScheduleVehicles();
      const refreshed = await getVehicles();
      setVehicles(refreshed);
      toast.success(result.message || "AI auto-scheduling complete!");
    } catch {
      toast.error("Auto-schedule failed");
    }
  };

  const handleSMSDriver = async (vehicle) => {
    try {
      await sendSMS({
        recipient_type: "driver",
        mobile: vehicle.driver_mobile,
        message_type: "vehicle",
        message: `Driver ${vehicle.driver}, Route: ${vehicle.route}. Load: ${vehicle.load}`,
      });
      toast.success(`SMS sent to ${vehicle.driver}`);
    } catch {
      toast.error("SMS failed");
    }
  };

  const handleStatusUpdate = async (id, status) => {
    try {
      const updated = await updateVehicle(id, { status });
      setVehicles((prev) =>
        prev.map((v) =>
          v.id === id ? { ...v, ...updated } : v
        )
      );
      toast.success(`Vehicle ${id} updated`);
    } catch {
      toast.error("Update failed");
    }
  };

  const handleCancelBooking = async (id) => {
    try {
      const updated = await cancelVehicleBooking(id);
      setVehicles((prev) =>
        prev.map((v) =>
          v.id === id ? { ...v, ...updated } : v
        )
      );
      toast.success(`Booking cancelled for ${id}`);
    } catch {
      setVehicles((prev) =>
        prev.map((v) =>
          v.id === id
            ? {
                ...v,
                route: "",
                load: "",
                progress_pct: 0,
                schedule_time: "",
                status: "standby",
              }
            : v
        )
      );
      toast.success(`Booking cancelled locally for ${id}`);
    }
  };

  const handleAdd = async () => {
    if (!form.id || !form.driver) {
      toast.error("Fill required fields");
      return;
    }
    try {
      const vehicle = await createVehicle(form);
      setVehicles((prev) => [...prev, vehicle]);
      setShowAdd(false);
      toast.success(`Vehicle ${vehicle.id} added`);
    } catch {
      toast.error("Failed to add vehicle");
    }
  };

  const handlePlateChange = (plate) => {
    if (plate === "Blurry Plate") {
      setSelectedPlate("MH14CD9087"); // Use Ramesh Yadav's plate to scan but with low conf
      setOcrConfidence(0.55);
    } else {
      setSelectedPlate(plate);
      setOcrConfidence(0.95);
    }
    setVerifyResult(null);
  };

  const [resetLoading, setResetLoading] = useState(false);

  const handleResetSimulator = async () => {
    setResetLoading(true);
    try {
      const res = await resetSimulatorDB();
      toast.success(res.message || "Simulator database successfully reset!");
      setVerifyResult(null);
      getVehicles().then(setVehicles).catch(() => {});
    } catch (err) {
      toast.error("Failed to reset simulator database.");
    } finally {
      setResetLoading(false);
    }
  };

  const handleVerify = async (override = false) => {
    setVerifyLoading(true);
    try {
      const res = await gateVerify({
        vehicle_id: selectedPlate,
        override: override,
        confidence: ocrConfidence,
      });
      setVerifyResult(res);
      if (res.status === "allowed") {
        toast.success(res.reason || "Gate access allowed!");
        getVehicles().then(setVehicles).catch(() => {});
      } else if (res.status === "denied") {
        toast.error(res.reason || "Gate access denied.");
      } else {
        toast.warn(res.reason || "Warning / Low confidence plate read.");
      }
    } catch (err) {
      toast.error("Failed to run ANPR gate verification.");
    } finally {
      setVerifyLoading(false);
    }
  };

  return (
    <div style={pageStyle}>
      <style>{`
        @keyframes scanline {
          0% { top: 0%; }
          50% { top: 100%; }
          100% { top: 0%; }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes pulse-allowed {
          0%, 100% { box-shadow: inset 0 0 15px rgba(16, 185, 129, 0.3), 0 0 8px rgba(16, 185, 129, 0.2); border-color: rgba(16, 185, 129, 0.5); }
          50% { box-shadow: inset 0 0 30px rgba(16, 185, 129, 0.6), 0 0 15px rgba(16, 185, 129, 0.4); border-color: rgba(16, 185, 129, 1); }
        }
        @keyframes pulse-denied {
          0%, 100% { box-shadow: inset 0 0 15px rgba(239, 68, 68, 0.3), 0 0 8px rgba(239, 68, 68, 0.2); border-color: rgba(239, 68, 68, 0.5); }
          50% { box-shadow: inset 0 0 30px rgba(239, 68, 68, 0.6), 0 0 15px rgba(239, 68, 68, 0.4); border-color: rgba(239, 68, 68, 1); }
        }
        @keyframes pulse-warning {
          0%, 100% { box-shadow: inset 0 0 15px rgba(245, 158, 11, 0.3), 0 0 8px rgba(245, 158, 11, 0.2); border-color: rgba(245, 158, 11, 0.5); }
          50% { box-shadow: inset 0 0 30px rgba(245, 158, 11, 0.6), 0 0 15px rgba(245, 158, 11, 0.4); border-color: rgba(245, 158, 11, 1); }
        }
      `}</style>
      {/* =========================================================
          KPI SECTION
      ========================================================= */}

      <div style={kpiGrid}>
        {[
          {
            label: "Total Vehicles",
            value: V.length,
            color: "#111827",
          },

          {
            label: "Active / En Route",
            value: active,
            color: "#16a34a",
          },

          {
            label: "Standby",
            value: standby,
            color: "#ea580c",
          },

          {
            label: "Maintenance",
            value: offline,
            color: "#dc2626",
          },
        ].map((kpi) => (
          <div key={kpi.label} style={kpiCard}>
            <div
              style={{
                fontSize: 28,
                fontWeight: 800,
                color: kpi.color,
              }}
            >
              {kpi.value}
            </div>

            <div style={kpiLabel}>{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* =========================================================
          ANPR GATE VERIFICATION SIMULATOR
      ========================================================= */}

      <div style={{
        background: "#1e293b",
        color: "#ffffff",
        padding: 20,
        borderRadius: 14,
        border: "1px solid #334155",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        marginTop: 4
      }}>
        <div style={{ fontSize: 15, fontWeight: 700, borderBottom: "1px solid #334155", paddingBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
          📷 ANPR Gate Verification Simulator (Camera Feed)
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 20 }}>
          <div>
            <label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700, color: "#cbd5e1" }}>
              Simulate Arrival at Entry Gate (Plate OCR)
            </label>
            <select
              value={ocrConfidence === 0.55 && selectedPlate === "MH14CD9087" ? "Blurry Plate" : selectedPlate}
              onChange={(e) => handlePlateChange(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #475569",
                borderRadius: 8,
                background: "#0f172a",
                color: "#ffffff",
                outline: "none",
                fontSize: 13
              }}
            >
              <option value="MH14CD9087">MH14CD9087 (Registered, Ramesh Yadav - Slot 09:00 AM)</option>
              <option value="MH12AB4521">MH12AB4521 (Registered, Sita Devi - Slot 11:30 AM)</option>
              <option value="MH12EF3344">MH12EF3344 (Offline/Maintenance Truck)</option>
              <option value="MH99ZZ9999">MH99ZZ9999 (Unregistered Vehicle - Denied)</option>
              <option value="Blurry Plate">Blurry Plate Scanned (Low confidence warning)</option>
            </select>

            <div style={{ marginTop: 12 }}>
              <label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700, color: "#cbd5e1" }}>
                OCR Camera Read Confidence: {Math.round(ocrConfidence * 100)}%
              </label>
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.05"
                value={ocrConfidence}
                onChange={(e) => {
                  setOcrConfidence(parseFloat(e.target.value));
                  setVerifyResult(null);
                }}
                style={{ width: "100%", accentColor: "#3b82f6", cursor: "pointer" }}
              />
            </div>

            <button
              onClick={() => handleVerify(false)}
              disabled={verifyLoading}
              style={{
                width: "100%",
                padding: "10px",
                marginTop: 14,
                borderRadius: 8,
                border: "none",
                background: "#3b82f6",
                color: "#ffffff",
                fontWeight: 700,
                cursor: "pointer",
                fontSize: 13
              }}
            >
              {verifyLoading ? "Scanning plate..." : "📸 Trigger Camera Plate OCR Check"}
            </button>

            <button
              onClick={handleResetSimulator}
              disabled={resetLoading}
              style={{
                width: "100%",
                padding: "10px",
                marginTop: 10,
                borderRadius: 8,
                border: "1px dashed #475569",
                background: "transparent",
                color: "#94a3b8",
                fontWeight: 700,
                cursor: "pointer",
                fontSize: 13,
                transition: "all 0.2s"
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = "rgba(71, 85, 105, 0.2)";
                e.currentTarget.style.color = "#ffffff";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "#94a3b8";
              }}
            >
              {resetLoading ? "Resetting DB..." : "🔄 Reset Simulator Database State"}
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Camera Viewport Container */}
            <div style={{
              position: "relative",
              width: "100%",
              height: 180,
              background: "#020617",
              borderRadius: 12,
              overflow: "hidden",
              border: verifyResult ? (
                verifyResult.status === "allowed" ? "2px solid #10b981" :
                verifyResult.status === "denied" ? "2px solid #ef4444" :
                "2px solid #f59e0b"
              ) : "2px solid #334155",
              boxShadow: "inset 0 0 20px rgba(0,0,0,0.8)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              animation: verifyResult ? (
                verifyResult.status === "allowed" ? "pulse-allowed 2s infinite" :
                verifyResult.status === "denied" ? "pulse-denied 2s infinite" :
                "pulse-warning 2s infinite"
              ) : "none"
            }}>
              {/* Scanline Animation Effect */}
              <div style={{
                position: "absolute",
                left: 0,
                right: 0,
                height: "3px",
                background: verifyResult ? (
                  verifyResult.status === "allowed" ? "#10b981" :
                  verifyResult.status === "denied" ? "#ef4444" :
                  "#f59e0b"
                ) : "#22c55e",
                boxShadow: verifyResult ? (
                  verifyResult.status === "allowed" ? "0 0 8px #10b981, 0 0 16px #10b981" :
                  verifyResult.status === "denied" ? "0 0 8px #ef4444, 0 0 16px #ef4444" :
                  "0 0 8px #f59e0b, 0 0 16px #f59e0b"
                ) : "0 0 8px #22c55e, 0 0 16px #22c55e",
                zIndex: 10,
                pointerEvents: "none",
                animation: verifyLoading ? "scanline 0.8s infinite linear" : "scanline 4.0s infinite ease-in-out"
              }} />

              {/* Viewfinder Corner Brackets */}
              <div style={{ position: "absolute", top: 12, left: 12, width: 14, height: 14, borderLeft: "2px solid #475569", borderTop: "2px solid #475569" }} />
              <div style={{ position: "absolute", top: 12, right: 12, width: 14, height: 14, borderRight: "2px solid #475569", borderTop: "2px solid #475569" }} />
              <div style={{ position: "absolute", bottom: 12, left: 12, width: 14, height: 14, borderLeft: "2px solid #475569", borderBottom: "2px solid #475569" }} />
              <div style={{ position: "absolute", bottom: 12, right: 12, width: 14, height: 14, borderRight: "2px solid #475569", borderBottom: "2px solid #475569" }} />

              {/* Camera Overlays */}
              <div style={{
                position: "absolute",
                top: 8,
                left: 12,
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 9,
                fontFamily: "monospace",
                color: "#ef4444",
                fontWeight: "bold"
              }}>
                <div style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#ef4444",
                  animation: "blink 1.5s infinite"
                }} />
                LIVE REC
              </div>
              <div style={{ position: "absolute", top: 8, right: 12, fontSize: 9, fontFamily: "monospace", color: "#64748b" }}>
                CAM-01 / APMC ENTRY
              </div>
              <div style={{ position: "absolute", bottom: 8, left: 12, fontSize: 9, fontFamily: "monospace", color: "#64748b" }}>
                {simulatedTime || "2026-06-25 15:42:00"}
              </div>
              <div style={{ position: "absolute", bottom: 8, right: 12, fontSize: 9, fontFamily: "monospace", color: "#64748b" }}>
                1080P 30FPS
              </div>

              {/* Indian License Plate in Center */}
              <div style={{
                position: "relative",
                width: 190,
                height: 44,
                background: "#f8fafc",
                borderRadius: 5,
                border: "2px solid #0f172a",
                boxShadow: "0 10px 15px -3px rgba(0,0,0,0.5), 0 4px 6px -2px rgba(0,0,0,0.3)",
                display: "flex",
                alignItems: "center",
                overflow: "hidden",
                transform: verifyLoading ? "scale(0.96)" : "scale(1)",
                transition: "transform 0.2s ease"
              }}>
                {/* IND blue strip on left */}
                <div style={{
                  width: 18,
                  height: "100%",
                  background: "#0038a8",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "4px 0",
                  color: "#ffffff"
                }}>
                  {/* Ashoka chakra representation (yellow star/circle) */}
                  <div style={{
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    background: "#facc15",
                    boxShadow: "0 0 2px #eab308"
                  }} />
                  <span style={{ fontSize: 5, fontWeight: 800, letterSpacing: 0.5, fontFamily: "sans-serif" }}>IND</span>
                </div>
                {/* Plate text */}
                <div style={{
                  flex: 1,
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  color: "#0f172a",
                  fontSize: 15,
                  fontWeight: 800,
                  fontFamily: "'Courier New', Courier, monospace",
                  letterSpacing: 2,
                  paddingRight: 4
                }}>
                  {selectedPlate.replace(/([A-Z]{2})(\d{2})([A-Z]{2})(\d{4})/, "$1 $2 $3 $4")}
                </div>
              </div>

              {/* Scanning Laser HUD overlay */}
              {verifyLoading && (
                <div style={{
                  position: "absolute",
                  inset: 0,
                  background: "rgba(34, 197, 94, 0.05)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#22c55e",
                  fontSize: 11,
                  fontWeight: 800,
                  fontFamily: "monospace",
                  letterSpacing: 1,
                  pointerEvents: "none"
                }}>
                  SCANNING PLATE...
                </div>
              )}

              {/* Gate Access Result Banner Overlay */}
              {verifyResult && !verifyLoading && (
                <div style={{
                  position: "absolute",
                  inset: 0,
                  background: verifyResult.status === "allowed" ? "rgba(16, 185, 129, 0.1)" : (verifyResult.status === "denied" ? "rgba(239, 68, 68, 0.1)" : "rgba(245, 158, 11, 0.1)"),
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: "column",
                  pointerEvents: "none",
                  zIndex: 20
                }}>
                  <div style={{
                    padding: "4px 10px",
                    background: verifyResult.status === "allowed" ? "#10b981" : (verifyResult.status === "denied" ? "#ef4444" : "#f59e0b"),
                    color: "#ffffff",
                    borderRadius: 4,
                    fontSize: 10,
                    fontWeight: 900,
                    fontFamily: "monospace",
                    letterSpacing: 1.5,
                    boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
                    textTransform: "uppercase"
                  }}>
                    {verifyResult.status === "allowed" ? "ACCESS GRANTED" : (verifyResult.status === "denied" ? "ACCESS DENIED" : "VERIFICATION PENDING")}
                  </div>
                </div>
              )}
            </div>

            {/* Results Feedback Details Pane */}
            <div style={{
              background: "#0f172a",
              borderRadius: 10,
              padding: 14,
              border: "1px solid #334155",
              minHeight: 80
            }}>
              {!verifyResult ? (
                <div style={{ textAlign: "center", color: "#64748b", fontSize: 13, padding: "10px 0" }}>
                  Awaiting vehicle arrival at APMC Pimpri entry gate.<br />Select a vehicle and trigger OCR to scan.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: verifyResult.status === "allowed" ? "#10b981" : (verifyResult.status === "denied" ? "#ef4444" : "#f59e0b")
                    }} />
                    <strong style={{
                      textTransform: "uppercase",
                      color: verifyResult.status === "allowed" ? "#10b981" : (verifyResult.status === "denied" ? "#ef4444" : "#f59e0b"),
                      fontSize: 13,
                      letterSpacing: 0.5
                    }}>
                      {verifyResult.status.replace("_", " ")}
                    </strong>
                  </div>
                  <div style={{ fontSize: 13, color: "#cbd5e1", lineHeight: "1.4" }}>{verifyResult.reason}</div>
                  
                  {verifyResult.farmer && (
                    <div style={{
                      fontSize: 11,
                      background: "#1e293b",
                      padding: 10,
                      borderRadius: 8,
                      color: "#94a3b8",
                      border: "1px solid #334155",
                      lineHeight: "1.5"
                    }}>
                      <div style={{ fontWeight: 700, color: "#cbd5e1", borderBottom: "1px solid #334155", paddingBottom: 4, marginBottom: 6 }}>
                        🌾 Associated Farmer Booking
                      </div>
                      <strong>Farmer Name:</strong> {verifyResult.farmer.name} | <strong>Mobile:</strong> {verifyResult.farmer.mobile}<br />
                      <strong>Variety:</strong> {verifyResult.farmer.variety} | <strong>Est. Bags:</strong> {verifyResult.farmer.bags}<br />
                      <strong>Scheduled Slot:</strong> {verifyResult.farmer.slot_date} at {verifyResult.farmer.slot_time}
                    </div>
                  )}

                  {(verifyResult.status === "wrong_slot" || verifyResult.status === "manual_verification") && (
                    <button
                      onClick={() => handleVerify(true)}
                      style={{
                        padding: "10px",
                        borderRadius: 8,
                        border: "1px solid #f59e0b",
                        background: "rgba(245, 158, 11, 0.15)",
                        color: "#f59e0b",
                        fontWeight: 700,
                        cursor: "pointer",
                        fontSize: 12,
                        marginTop: 6,
                        transition: "background 0.2s",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6
                      }}
                      onMouseOver={(e) => e.currentTarget.style.background = "rgba(245, 158, 11, 0.25)"}
                      onMouseOut={(e) => e.currentTarget.style.background = "rgba(245, 158, 11, 0.15)"}
                    >
                      ⚠️ Authorize Manual Gate Override (Allow Entry)
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================
          ACTIONS
      ========================================================= */}

      <div style={actionRow}>
        <button onClick={handleAutoSchedule} style={blueButton}>
          ⚡ Auto-Schedule AI
        </button>

        <button onClick={() => setShowAdd(true)} style={greenButton}>
          + Assign Vehicle
        </button>
      </div>

      {/* =========================================================
          VEHICLE TABLE
      ========================================================= */}

      <div style={tableCard}>
        <div style={tableHeader}>Fleet Status & Route Progress</div>

        <div
          style={{
            overflowX: "auto",
          }}
        >
          <table style={tableStyle}>
            <thead>
              <tr>
                <th>Vehicle</th>

                <th>Status</th>

                <th>Driver</th>

                <th>Mobile</th>

                <th>Route</th>

                <th>Load</th>

                <th>Progress</th>

                <th>Schedule</th>

                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {V.map((vehicle) => {
                const cfg = STATUS_CFG[vehicle.status] || {
                  bg: "#f3f4f6",
                  color: "#374151",
                  label: vehicle.status || "Unknown",
                  icon: "🚚",
                };

                return (
                  <tr key={vehicle.id}>
                    <td style={vehicleId}>{vehicle.id}</td>

                    <td>
                      <span
                        style={{
                          padding: "5px 10px",
                          borderRadius: 999,
                          background: cfg.bg,
                          color: cfg.color,
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        {cfg.icon} {cfg.label}
                      </span>
                    </td>

                    <td style={boldText}>{vehicle.driver}</td>

                    <td style={smallMono}>{vehicle.driver_mobile}</td>

                    <td>{vehicle.route}</td>

                    <td>{vehicle.load}</td>

                    <td
                      style={{
                        minWidth: 100,
                      }}
                    >
                      <div style={progressBar}>
                        <div
                          style={{
                            ...progressFill,
                            width: `${vehicle.progress_pct}%`,
                            background:
                              vehicle.status === "offline"
                                ? "#dc2626"
                                : vehicle.status === "standby"
                                  ? "#d1d5db"
                                  : "#16a34a",
                          }}
                        />
                      </div>

                      <div style={smallMono}>{vehicle.progress_pct}%</div>
                    </td>

                    <td style={smallMono}>{vehicle.schedule_time}</td>

                    <td>
                      <div
                        style={{
                          display: "flex",
                          gap: 6,
                        }}
                      >
                        <button
                          onClick={() => handleSMSDriver(vehicle)}
                          style={actionBtn}
                        >
                          📱
                        </button>

                        {vehicle.status === "enroute" && (
                          <button
                            onClick={() => handleCancelBooking(vehicle.id)}
                            style={cancelActionBtn}
                          >
                            Cancel Booking
                          </button>
                        )}

                        {vehicle.status === "standby" && (
                          <button
                            onClick={() =>
                              handleStatusUpdate(vehicle.id, "enroute")
                            }
                            style={dispatchBtn}
                          >
                            Dispatch
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* =========================================================
          ADD VEHICLE MODAL
      ========================================================= */}

      {showAdd && (
        <div onClick={() => setShowAdd(false)} style={modalOverlay}>
          <div onClick={(e) => e.stopPropagation()} style={modalBox}>
            <div style={modalTitle}>Assign Vehicle</div>

            {[
              {
                label: "Vehicle No.",
                key: "id",
                placeholder: "UP32AB1234",
              },

              {
                label: "Driver Name",
                key: "driver",
                placeholder: "Full Name",
              },

              {
                label: "Mobile",
                key: "driver_mobile",
                placeholder: "+91 XXXXX XXXXX",
              },

              {
                label: "Route",
                key: "route",
                placeholder: "From → To",
              },

              {
                label: "Load",
                key: "load",
                placeholder: "120 bags",
              },

              {
                label: "Schedule Time",
                key: "schedule_time",
                placeholder: "02:00 PM",
              },
            ].map((field) => (
              <div
                key={field.key}
                style={{
                  marginBottom: 12,
                }}
              >
                <label style={inputLabel}>{field.label}</label>

                <input
                  value={form[field.key]}
                  placeholder={field.placeholder}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      [field.key]: e.target.value,
                    })
                  }
                  style={inputStyle}
                />
              </div>
            ))}

            <div style={modalActions}>
              <button onClick={() => setShowAdd(false)} style={cancelBtn}>
                Cancel
              </button>

              <button onClick={handleAdd} style={saveBtn}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================
   STYLES
========================================================= */

const pageStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const kpiGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(4,1fr)",
  gap: 12,
};

const kpiCard = {
  background: "#ffffff",
  padding: 18,
  borderRadius: 12,
  border: "1px solid #e5e7eb",
};

const kpiLabel = {
  fontSize: 12,
  color: "#6b7280",
  marginTop: 4,
};

const actionRow = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 10,
};

const blueButton = {
  padding: "10px 16px",
  background: "#dbeafe",
  color: "#2563eb",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 700,
};

const greenButton = {
  padding: "10px 16px",
  background: "#16a34a",
  color: "#ffffff",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 700,
};

const tableCard = {
  background: "#ffffff",
  borderRadius: 12,
  overflow: "hidden",
  border: "1px solid #e5e7eb",
};

const tableHeader = {
  padding: 16,
  fontSize: 14,
  fontWeight: 700,
  borderBottom: "1px solid #e5e7eb",
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
};

const vehicleId = {
  fontWeight: 700,
  fontFamily: "monospace",
};

const boldText = {
  fontWeight: 700,
};

const smallMono = {
  fontSize: 11,
  color: "#6b7280",
  fontFamily: "monospace",
};

const progressBar = {
  width: "100%",
  height: 6,
  background: "#e5e7eb",
  borderRadius: 999,
  overflow: "hidden",
  marginBottom: 4,
};

const progressFill = {
  height: "100%",
};

const actionBtn = {
  padding: "5px 10px",
  borderRadius: 6,
  border: "1px solid #d1d5db",
  background: "#f9fafb",
  cursor: "pointer",
};

const dispatchBtn = {
  padding: "5px 10px",
  borderRadius: 6,
  border: "none",
  background: "#dcfce7",
  color: "#16a34a",
  cursor: "pointer",
  fontWeight: 700,
};

const modalOverlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const modalBox = {
  width: 450,
  background: "#ffffff",
  borderRadius: 14,
  padding: 24,
};

const modalTitle = {
  fontSize: 16,
  fontWeight: 700,
  marginBottom: 18,
};

const inputLabel = {
  display: "block",
  marginBottom: 6,
  fontSize: 12,
  fontWeight: 700,
  color: "#374151",
};

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #d1d5db",
  borderRadius: 8,
  outline: "none",
};

const modalActions = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 10,
  marginTop: 18,
};

const cancelBtn = {
  padding: "10px 16px",
  border: "1px solid #d1d5db",
  borderRadius: 8,
  background: "#ffffff",
  cursor: "pointer",
};

const saveBtn = {
  padding: "10px 16px",
  border: "none",
  borderRadius: 8,
  background: "#16a34a",
  color: "#ffffff",
  cursor: "pointer",
  fontWeight: 700,
};

const cancelActionBtn = {
  padding: "8px 10px",
  border: "1px solid #fca5a5",
  borderRadius: 8,
  background: "#fff1f2",
  color: "#b91c1c",
  cursor: "pointer",
  fontWeight: 700,
};

/* =========================================================
   DEMO DATA
========================================================= */

const DEMO_VEHICLES = [
  {
    id: "UP32AB1234",
    route: "Hadapsar → Warehouse B",
    load: "120 bags SM",
    driver: "Rajesh Kumar",
    driver_mobile: "+91 91234 11111",
    progress_pct: 75,
    status: "enroute",
    schedule_time: "02:00 PM",
  },

  {
    id: "UP32CD5678",
    route: "Wagholi → Warehouse A",
    load: "85 bags IR-64",
    driver: "Amit Singh",
    driver_mobile: "+91 91234 22222",
    progress_pct: 40,
    status: "enroute",
    schedule_time: "04:00 PM",
  },

  {
    id: "UP32EF9012",
    route: "Lonikand → Warehouse A",
    load: "Pending",
    driver: "Vijay Yadav",
    driver_mobile: "+91 91234 33333",
    progress_pct: 0,
    status: "standby",
    schedule_time: "06:00 PM",
  },

  {
    id: "UP32GH3456",
    route: "Warehouse B → Kharadi",
    load: "200 bags out",
    driver: "Suresh Nair",
    driver_mobile: "+91 91234 44444",
    progress_pct: 55,
    status: "enroute",
    schedule_time: "11:00 AM",
  },

  {
    id: "UP32IJ7890",
    route: "Engine maintenance",
    load: "—",
    driver: "Arun More",
    driver_mobile: "+91 91234 55555",
    progress_pct: 0,
    status: "offline",
    schedule_time: "—",
  },
];
