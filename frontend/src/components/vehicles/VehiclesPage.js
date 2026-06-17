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

  useEffect(() => {
    getVehicles()
      .then(setVehicles)
      .catch(() => setVehicles(DEMO_VEHICLES));
  }, []);

  const V = vehicles.length ? vehicles : DEMO_VEHICLES;

  const active = V.filter((v) => v.status === "enroute").length;

  const standby = V.filter((v) => v.status === "standby").length;

  const offline = V.filter((v) => v.status === "offline").length;

  /* =========================================================
     AUTO SCHEDULE
  ========================================================= */

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

  /* =========================================================
     SEND DRIVER SMS
  ========================================================= */

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

  /* =========================================================
     UPDATE STATUS
  ========================================================= */

  const handleStatusUpdate = async (id, status) => {
    try {
      const updated = await updateVehicle(id, { status });

      setVehicles((prev) =>
        prev.map((v) =>
          v.id === id
            ? {
                ...v,
                ...updated,
              }
            : v,
        ),
      );

      toast.success(`Vehicle ${id} updated`);
    } catch {
      toast.error("Update failed");
    }
  };

  /* =========================================================
     CANCEL BOOKING
  ========================================================= */

  const handleCancelBooking = async (id) => {
    try {
      const updated = await cancelVehicleBooking(id);

      setVehicles((prev) =>
        prev.map((v) =>
          v.id === id
            ? {
                ...v,
                ...updated,
              }
            : v,
        ),
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
            : v,
        ),
      );

      toast.success(`Booking cancelled locally for ${id}`);
    }
  };

  /* =========================================================
     ADD VEHICLE
  ========================================================= */

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

  return (
    <div style={pageStyle}>
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
                const cfg = STATUS_CFG[vehicle.status];

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
