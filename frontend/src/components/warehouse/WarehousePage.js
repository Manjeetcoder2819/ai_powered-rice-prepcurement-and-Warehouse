"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { addStockEntry, getLedger, getStock, getZones, deleteStockEntry } from "@/lib/api";
import StockPieChart from "@/components/dashboard/StockPieChart";

const DEFAULT_STOCK_FORM = {
  variety: "",
  qty_kg: "",
  zone: "A",
  type: "Inflow",
  operator: "",
};

/* =========================================================
   VARIETIES
========================================================= */

const VARIETIES = [
  "Sona Masoori",
  "IR-64",
  "Basmati",
  "HMT",
  "IR-36",
  "Pusa Basmati",
  "Swarna",
  "PR 106",
];

/* =========================================================
   MAIN PAGE
========================================================= */

export default function WarehousePage() {
  const formatCompact = (val) => {
    if (val >= 1000000) {
      return (val / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
    }
    if (val >= 1000) {
      return (val / 1000).toFixed(1).replace(/\.0$/, "") + "k";
    }
    return val.toLocaleString();
  };

  const [stock, setStock] = useState([]);

  const [zones, setZones] = useState([]);

  const [ledger, setLedger] = useState([]);

  const [showAdd, setShowAdd] = useState(false);

  const [form, setForm] = useState(DEFAULT_STOCK_FORM);

  useEffect(() => {
    getStock()
      .then(setStock)
      .catch(() => setStock(DEMO_STOCK));

    getZones()
      .then(setZones)
      .catch(() => setZones(DEMO_ZONES));

    getLedger()
      .then(setLedger)
      .catch(() => setLedger(DEMO_LEDGER));
  }, []);

  const S = stock.length ? stock : DEMO_STOCK;

  const Z = zones.length ? zones : DEMO_ZONES;

  const L = ledger.length ? ledger : DEMO_LEDGER;

  const totalQty = S.reduce((a, s) => a + (s.qty_kg || s.qty_mt || 0), 0);

  const totalCap = S.reduce((a, s) => a + (s.capacity_kg || s.capacity_mt || 0), 0);

  const usedPct = totalCap > 0 ? Math.round((totalQty / totalCap) * 100) : 0;

  const previewQty = parseFloat(form.qty_kg || form.qty_mt || "") || 0;
  const selectedStock = S.find((item) => item.variety === form.variety);
  const varietyPrice = selectedStock ? (selectedStock.price_per_kg || selectedStock.price_per_mt || 0) : 0;
  const estimatedValue = varietyPrice * previewQty;
  const projectedQty =
    selectedStock && form.type === "Outflow"
      ? Math.max(0, (selectedStock.qty_kg || selectedStock.qty_mt || 0) - previewQty)
      : selectedStock
        ? (selectedStock.qty_kg || selectedStock.qty_mt || 0) + previewQty
        : previewQty;
  const projectedPct =
    selectedStock && (selectedStock.capacity_kg || selectedStock.capacity_mt || 0) > 0
      ? Math.round((projectedQty / (selectedStock.capacity_kg || selectedStock.capacity_mt || 0)) * 100)
      : 0;

  const closeAddModal = () => {
    setShowAdd(false);
    setForm(DEFAULT_STOCK_FORM);
  };

  /* =========================================================
     ADD ENTRY
  ========================================================= */

  const handleAdd = async () => {
    if (!form.variety || !(form.qty_kg || form.qty_mt)) {
      toast.error("Fill all fields");

      return;
    }

    try {
      const entry = await addStockEntry({
        ...form,
        qty_kg: parseFloat(form.qty_kg || form.qty_mt || ""),
      });

      setLedger((prev) => [entry, ...prev]);

      // Re-fetch stock and zones to dynamically update KPIs and chart meters
      try {
        const [updatedStock, updatedZones] = await Promise.all([
          getStock(),
          getZones(),
        ]);
        setStock(updatedStock);
        setZones(updatedZones);
      } catch (fetchErr) {
        console.error("Failed to refresh stock lists:", fetchErr);
      }

      closeAddModal();

      toast.success("Stock entry added");
    } catch {
      toast.error("Failed to add entry");
    }
  };

  const handleDelete = async (entryId) => {
    if (!confirm("Are you sure you want to delete this stock ledger entry? This will revert the stock amount.")) {
      return;
    }

    try {
      await deleteStockEntry(entryId);

      // Remove deleted entry from ledger state
      setLedger((prev) => prev.filter((item) => item.id !== entryId));

      // Re-fetch stock and zones to dynamically update KPIs and chart meters
      const [updatedStock, updatedZones] = await Promise.all([
        getStock(),
        getZones(),
      ]);
      setStock(updatedStock);
      setZones(updatedZones);

      toast.success("Stock entry deleted and stock reverted");
    } catch {
      toast.error("Failed to delete stock entry");
    }
  };

  const zoneColors = {
    safe: "#2e7d45",
    warn: "#f5a623",
    danger: "#e53935",
  };

  return (
    <div style={pageStyle}>
      {/* =========================================================
          KPI SECTION
      ========================================================= */}

      <div style={kpiGrid}>
        {[
          {
            label: "Total Capacity",
            value: `${totalCap.toLocaleString()} Kg`,
            color: "#111827",
          },

          {
            label: "Current Stock",
            value: `${totalQty.toLocaleString()} Kg`,
            color: "#16a34a",
          },

          {
            label: "Available",
            value: `${(totalCap - totalQty).toLocaleString()} Kg`,
            color: "#2563eb",
          },

          {
            label: "Utilisation",
            value: `${usedPct}%`,
            color:
              usedPct > 85 ? "#dc2626" : usedPct > 70 ? "#ea580c" : "#16a34a",
          },
        ].map((kpi) => (
          <div key={kpi.label} style={kpiCard}>
            <div
              style={{
                fontSize: 24,
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
          CAPACITY + ZONES
      ========================================================= */}

      <div style={topGrid}>
        {/* RING */}

        <div style={ringCard}>
          <div style={cardTitle}>Total Warehouse</div>

          <svg width="130" height="130" viewBox="0 0 130 130">
            <circle
              cx="65"
              cy="65"
              r="50"
              fill="none"
              stroke="#eef0f2"
              strokeWidth="12"
            />

            <circle
              cx="65"
              cy="65"
              r="50"
              fill="none"
              stroke="#16a34a"
              strokeWidth="12"
              strokeDasharray={`${(Math.min(100, Math.max(0, usedPct)) / 100) * 314} 314`}
              strokeDashoffset="0"
              strokeLinecap="round"
              style={{
                transform: "rotate(-90deg)",
                transformOrigin: "65px 65px",
                transition: "stroke-dasharray 0.6s cubic-bezier(0.4, 0, 0.2, 1)"
              }}
            />

            <text
              x="65"
              y="60"
              textAnchor="middle"
              fontSize="20"
              fontWeight="800"
              fill="#111827"
            >
              {usedPct}%
            </text>

            <text x="65" y="76" textAnchor="middle" fontSize="9" fill="#9ca3af">
              {formatCompact(totalQty)}/{formatCompact(totalCap)} Kg
            </text>
          </svg>

          <div style={smallText}>Capacity Used</div>
        </div>

        {/* WAREHOUSE IMAGE CARD */}
        <div style={{
          background: "#ffffff",
          padding: 16,
          borderRadius: 12,
          border: "1px solid #e5e7eb",
          width: 260,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          flexShrink: 0
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1f2937" }}>
            Warehouse Layout Overview
          </div>
          <div style={{
            height: 120,
            borderRadius: 8,
            overflow: "hidden",
            border: "1px solid #e2e8f0"
          }}>
            <img
              src="/images/test_data/warehouse.png"
              alt="Warehouse Layout Map"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
          <div style={{ fontSize: 10, color: "#4b5563", lineHeight: "1.4" }}>
            Real-time digital mapping of storage silos and quarantine bays. Dynamic routing active.
          </div>
        </div>

        {/* ZONES */}

        <div style={zoneGrid}>
          {Z.map((zone) => (
            <div
              key={zone.id}
              style={{
                ...zoneCard,
                borderTop: `4px solid ${zoneColors[zone.status]}`,
              }}
            >
              <div style={zoneTitle}>{zone.name}</div>

              <div style={zoneInfo}>
                {zone.variety}
                <br />
                Temp: {zone.temp_c}
                °C · {zone.pct}% full
              </div>

              <div style={progressBar}>
                <div
                  style={{
                    ...progressFill,
                    width: `${zone.pct}%`,
                    background: zoneColors[zone.status],
                  }}
                />
              </div>

              <span
                style={{
                  ...zoneBadge,
                  background:
                    zone.status === "safe"
                      ? "#dcfce7"
                      : zone.status === "warn"
                        ? "#ffedd5"
                        : "#fee2e2",

                  color:
                    zone.status === "safe"
                      ? "#16a34a"
                      : zone.status === "warn"
                        ? "#ea580c"
                        : "#dc2626",
                }}
              >
                {zone.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* =========================================================
          STOCK + LEDGER
      ========================================================= */}

      <div style={bottomGrid}>
        {/* STOCK */}

        <div style={cardStyle}>
          <div style={cardTitle}>Stock by Variety (Kg)</div>

          <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              {S.map((item) => (
                <div key={item.variety}>
                  <div style={stockRow}>
                    <span style={stockName}>{item.variety}</span>

                    <span style={stockQty}>
                      {(item.qty_kg ?? item.qty_mt)?.toLocaleString()} / {(item.capacity_kg ?? item.capacity_mt)?.toLocaleString()} Kg
                    </span>
                  </div>

                  <div style={stockInfoRow}>
                    <span>
                      Price: ₹ {(item.price_per_kg ?? item.price_per_mt)?.toLocaleString() || "0"} / Kg
                    </span>
                    <span>
                      Value: ₹ {item.stock_value?.toLocaleString() || "0"}
                    </span>
                  </div>

                  <div style={progressBar}>
                    <div
                      style={{
                        ...progressFill,
                        width: `${Math.min(100, Math.max(0, (((item.qty_kg ?? item.qty_mt ?? 0) / (item.capacity_kg || item.capacity_mt || 1)) * 100)))}%`,
                        background: item.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <StockPieChart stock={S} />
          </div>
        </div>

        {/* LEDGER */}

        <div style={cardStyle}>
          <div style={ledgerHeader}>
            <span style={cardTitle}>Stock Ledger</span>

            <button onClick={() => setShowAdd(true)} style={addBtn}>
              + Add Entry
            </button>
          </div>

          <div
            style={{
              overflowY: "auto",
              maxHeight: 320,
            }}
          >
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th>Time</th>

                  <th>Variety</th>

                  <th>Qty</th>

                  <th>Zone</th>

                  <th>Type</th>

                  <th>Operator</th>
                  <th>Price</th>
                  <th>Est. Value</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>

              <tbody>
                {L.map((entry) => (
                  <tr key={entry.id}>
                    <td style={monoText}>{entry.time}</td>

                    <td>{entry.variety}</td>

                    <td style={boldText}>{(entry.qty_kg ?? entry.qty_mt)?.toLocaleString()}</td>

                    <td>Zone {entry.zone}</td>

                    <td>
                      <span
                        style={{
                          ...ledgerTag,
                          background:
                            entry.type === "Inflow" ? "#dcfce7" : "#ffedd5",

                          color:
                            entry.type === "Inflow" ? "#16a34a" : "#ea580c",
                        }}
                      >
                        {entry.type}
                      </span>
                    </td>

                    <td>{entry.operator}</td>
                    <td>₹ {(entry.price_per_kg ?? entry.price_per_mt)?.toLocaleString() || "0"}</td>
                    <td>₹ {entry.estimated_value?.toLocaleString() || "0"}</td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        onClick={() => handleDelete(entry.id)}
                        style={deleteBtn}
                      >
                        🗑️ Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* =========================================================
          MODAL
      ========================================================= */}

      {showAdd && (
        <div onClick={closeAddModal} style={modalOverlay}>
          <div onClick={(e) => e.stopPropagation()} style={modalBox}>
            <div style={modalTitle}>Add Stock Entry</div>

            {/* VARIETY */}

            <div style={fieldBox}>
              <label style={labelStyle}>Variety</label>

              <select
                value={form.variety}
                onChange={(e) =>
                  setForm({
                    ...form,
                    variety: e.target.value,
                  })
                }
                style={inputStyle}
              >
                <option value="">Select...</option>

                {VARIETIES.map((variety) => (
                  <option key={variety}>{variety}</option>
                ))}
              </select>
            </div>

            {/* QTY */}

            <div style={fieldBox}>
              <label style={labelStyle}>Qty (Kg)</label>

              <input
                type="number"
                value={form.qty_kg || form.qty_mt || ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    qty_kg: e.target.value,
                  })
                }
                style={inputStyle}
              />
            </div>

            {/* ZONE */}

            <div style={fieldBox}>
              <label style={labelStyle}>Zone</label>

              <input
                value={form.zone}
                onChange={(e) =>
                  setForm({
                    ...form,
                    zone: e.target.value,
                  })
                }
                style={inputStyle}
              />
            </div>

            {/* TYPE */}

            <div style={fieldBox}>
              <label style={labelStyle}>Type</label>

              <select
                value={form.type}
                onChange={(e) =>
                  setForm({
                    ...form,
                    type: e.target.value,
                  })
                }
                style={inputStyle}
              >
                <option>Inflow</option>

                <option>Outflow</option>
              </select>
            </div>

            {/* OPERATOR */}

            <div style={fieldBox}>
              <label style={labelStyle}>Operator Name</label>

              <input
                value={form.operator}
                onChange={(e) =>
                  setForm({
                    ...form,
                    operator: e.target.value,
                  })
                }
                style={inputStyle}
                placeholder="e.g. Warehouse Manager"
              />
            </div>

            {/* ACTIONS */}

            {form.variety && (
              <div style={stockPreviewCard}>
                <div style={stockPreviewTitle}>Financial & Stock Preview</div>
                <div style={stockPreviewRow}>
                  <span>Price per Kg:</span>
                  <strong>₹ {varietyPrice.toLocaleString()}</strong>
                </div>
                <div style={stockPreviewRow}>
                  <span>Est. Value:</span>
                  <strong>₹ {estimatedValue.toLocaleString()}</strong>
                </div>
                {previewQty > 0 && (
                  <>
                    <div style={stockPreviewRow}>
                      <span>Projected Qty:</span>
                      <strong>{projectedQty.toLocaleString()} Kg</strong>
                    </div>
                    <div style={stockPreviewRow}>
                      <span>Projected Capacity:</span>
                      <strong>{projectedPct}%</strong>
                    </div>
                    <div style={stockPreviewRow}>
                      <span>Risk:</span>
                      <strong>
                        {projectedPct >= 90
                          ? "High"
                          : projectedPct >= 75
                            ? "Medium"
                            : "Normal"}
                      </strong>
                    </div>
                  </>
                )}
              </div>
            )}

            <div style={modalActions}>
              <button onClick={closeAddModal} style={cancelBtn}>
                Cancel
              </button>

              <button onClick={handleAdd} style={saveBtn}>
                Save Entry
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
  marginTop: 4,
  fontSize: 12,
  color: "#6b7280",
};

const topGrid = {
  display: "flex",
  gap: 16,
  alignItems: "flex-start",
};

const ringCard = {
  background: "#ffffff",
  padding: 18,
  borderRadius: 12,
  border: "1px solid #e5e7eb",
  minWidth: 190,
  textAlign: "center",
};

const cardStyle = {
  background: "#ffffff",
  padding: 18,
  borderRadius: 12,
  border: "1px solid #e5e7eb",
};

const cardTitle = {
  fontSize: 14,
  fontWeight: 700,
  marginBottom: 14,
};

const smallText = {
  fontSize: 11,
  color: "#6b7280",
  marginTop: 6,
};

const zoneGrid = {
  flex: 1,
  display: "grid",
  gridTemplateColumns: "repeat(4,1fr)",
  gap: 12,
};

const zoneCard = {
  background: "#ffffff",
  borderRadius: 12,
  padding: 14,
  border: "1px solid #e5e7eb",
};

const zoneTitle = {
  fontSize: 13,
  fontWeight: 700,
  marginBottom: 6,
};

const zoneInfo = {
  fontSize: 11,
  color: "#6b7280",
  lineHeight: 1.6,
  marginBottom: 8,
};

const progressBar = {
  width: "100%",
  height: 8,
  background: "#e5e7eb",
  borderRadius: 999,
  overflow: "hidden",
  marginBottom: 6,
};

const progressFill = {
  height: "100%",
  transition: "width 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
};

const zoneBadge = {
  padding: "3px 8px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 700,
};

const bottomGrid = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 16,
};

const stockRow = {
  display: "flex",
  justifyContent: "space-between",
  marginBottom: 4,
  fontSize: 12,
};

const stockName = {
  fontWeight: 700,
};

const stockQty = {
  color: "#6b7280",
  fontFamily: "monospace",
};

const stockInfoRow = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: 11,
  color: "#4b5563",
  marginTop: 6,
};

const ledgerHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 12,
};

const addBtn = {
  padding: "6px 12px",
  background: "#16a34a",
  color: "#ffffff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 12,
};

const deleteBtn = {
  padding: "4px 8px",
  background: "#fee2e2",
  color: "#dc2626",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 11,
  transition: "background 0.2s",
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
};

const monoText = {
  fontFamily: "monospace",
  fontSize: 11,
};

const boldText = {
  fontWeight: 700,
};

const ledgerTag = {
  padding: "3px 8px",
  borderRadius: 999,
  fontSize: 11,
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
  width: 420,
  background: "#ffffff",
  borderRadius: 14,
  padding: 24,
};

const modalTitle = {
  fontSize: 16,
  fontWeight: 700,
  marginBottom: 18,
};

const fieldBox = {
  marginBottom: 14,
};

const labelStyle = {
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

const stockPreviewCard = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  padding: 12,
};

const stockPreviewTitle = {
  fontSize: 12,
  fontWeight: 800,
  marginBottom: 8,
};

const stockPreviewRow = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: 12,
  marginTop: 6,
};

/* =========================================================
   DEMO DATA
========================================================= */

const DEMO_STOCK = [
  {
    variety: "Sona Masoori",
    qty_kg: 2200000,
    capacity_kg: 2500000,
    zone: "A",
    color: "#2e7d45",
    price_per_kg: 33.0,
    stock_value: 72600000,
  },

  {
    variety: "IR-64",
    qty_kg: 1800000,
    capacity_kg: 2500000,
    zone: "B",
    color: "#1976d2",
    price_per_kg: 28.5,
    stock_value: 51300000,
  },

  {
    variety: "Basmati",
    qty_kg: 1500000,
    capacity_kg: 2500000,
    zone: "B",
    color: "#f5a623",
    price_per_kg: 39.0,
    stock_value: 58500000,
  },

  {
    variety: "HMT",
    qty_kg: 450000,
    capacity_kg: 1000000,
    zone: "C",
    color: "#0f6e56",
  },

  {
    variety: "IR-36",
    qty_kg: 200000,
    capacity_kg: 1000000,
    zone: "C",
    color: "#993c1d",
  },
];

const DEMO_ZONES = [
  {
    id: "A",
    name: "Zone A — Bay 1-4",
    variety: "Sona Masoori",
    pct: 88,
    temp_c: 28,
    status: "warn",
    label: "High Load",
  },

  {
    id: "B",
    name: "Zone B — Bay 5-8",
    variety: "IR-64 + Basmati",
    pct: 71,
    temp_c: 26,
    status: "safe",
    label: "Normal",
  },

  {
    id: "C",
    name: "Zone C — Bay 9-12",
    variety: "HMT + IR-36",
    pct: 38,
    temp_c: 27,
    status: "safe",
    label: "Normal",
  },

  {
    id: "D",
    name: "Zone D — Damaged",
    variety: "Quarantine",
    pct: 12,
    temp_c: 27,
    status: "danger",
    label: "Review",
  },
];

const DEMO_LEDGER = [
  {
    id: 1,
    time: "07:30",
    variety: "Sona Masoori",
    qty_kg: 5400,
    zone: "A",
    type: "Inflow",
    operator: "Bhosale R.",
  },

  {
    id: 2,
    time: "08:10",
    variety: "IR-64",
    qty_kg: 3830,
    zone: "B",
    type: "Inflow",
    operator: "Kadam S.",
  },

  {
    id: 3,
    time: "08:45",
    variety: "Basmati",
    qty_kg: 9000,
    zone: "B",
    type: "Inflow",
    operator: "Patil A.",
  },

  {
    id: 4,
    time: "09:00",
    variety: "Sona Masoori",
    qty_kg: 8500,
    zone: "A",
    type: "Outflow",
    operator: "Mane D.",
  },

  {
    id: 5,
    time: "09:30",
    variety: "HMT",
    qty_kg: 2250,
    zone: "C",
    type: "Inflow",
    operator: "Shinde V.",
  },
];
