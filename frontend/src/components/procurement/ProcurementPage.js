"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { getBatches, updateBatchStatus } from "@/lib/api";

export default function ProcurementPage() {
  const [procurements, setProcurements] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [status, setStatus] = useState("Approved");
  const [loading, setLoading] = useState(true);

  const loadProcurements = async () => {
    try {
      const data = await getBatches();
      setProcurements(data);
      if (data.length > 0) {
        // Find if selectedId is still in the new data, else select the first
        const stillExists = data.some(item => item.id === selectedId);
        if (!stillExists) {
          setSelectedId(data[0].id);
          setStatus(data[0].status || "Approved");
        }
      } else {
        setSelectedId(null);
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to load procurement orders");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProcurements();
  }, []);

  const selectedItem = procurements.find((item) => item.id === selectedId);

  // When selected item changes, update the status state to match
  const handleSelect = (id) => {
    setSelectedId(id);
    const item = procurements.find(x => x.id === id);
    if (item) {
      setStatus(item.status || "Approved");
    }
  };

  const handleUpdate = async () => {
    if (!selectedItem) {
      toast.error("Please choose a procurement item");
      return;
    }

    try {
      await updateBatchStatus(selectedItem.id, status);
      toast.success(
        `Procurement ${selectedItem.id} updated to ${status}`
      );
      await loadProcurements();
    } catch (error) {
      console.error(error);
      toast.error("Failed to update procurement status");
    }
  };

  // Convert good bags to Kilograms (1 bag = 50kg)
  const getWeightKg = (goodBags) => (goodBags * 50).toFixed(0);

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={sectionCard}>
        <h2 style={sectionTitle}>Procurement Dashboard</h2>
        <p style={sectionText}>
          Manage AI-scanned rice batches, review quality parameters, and approve inflows into warehouse stock.
        </p>
      </div>

      <div style={gridRow}>
        <div style={sectionCard}>
          <h3 style={cardTitle}>Current Procurement Orders</h3>
          <div style={tableWrapper}>
            {loading ? (
              <p style={sectionText}>Loading orders...</p>
            ) : procurements.length === 0 ? (
              <p style={sectionText}>No scanned batches found. Scan batches in the Gunny Bag AI page first.</p>
            ) : (
              procurements.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleSelect(item.id)}
                  style={{
                    ...tableRow,
                    ...(selectedId === item.id ? selectedRow : {}),
                  }}
                >
                  <div>
                    <strong>Batch {item.id}</strong>
                    <div style={rowText}>
                      {item.farmer_name} · {item.variety} · {item.total_bags} bags
                    </div>
                  </div>
                  <div style={{
                    ...badge,
                    background: item.status === "Approved" ? "#dcfce7" : item.status === "Rejected" ? "#fee2e2" : "#f3f4f6",
                    color: item.status === "Approved" ? "#15803d" : item.status === "Rejected" ? "#dc2626" : "#4b5563"
                  }}>{item.status || "Pending"}</div>
                </button>
              ))
            )}
          </div>
        </div>

        <div style={sectionCard}>
          <h3 style={cardTitle}>Update Procurement</h3>
          {!selectedItem ? (
            <p style={sectionText}>
              Select an order to update its procurement status.
            </p>
          ) : (
            <div>
              <div style={fieldGroup}>
                <label style={label}>Order ID</label>
                <div style={{ fontWeight: 600 }}>Batch {selectedItem.id}</div>
              </div>

              <div style={fieldGroup}>
                <label style={label}>Farmer</label>
                <div style={{ fontWeight: 600 }}>{selectedItem.farmer_name}</div>
              </div>

              <div style={fieldGroup}>
                <label style={label}>Variety</label>
                <div style={{ fontWeight: 600 }}>{selectedItem.variety || "Not specified"}</div>
              </div>

              <div style={fieldGroup}>
                <label style={label}>Bags Quality Breakdown</label>
                <div style={{ fontSize: 13, color: '#4b5563', lineHeight: 1.6 }}>
                  Total Bags: <strong>{selectedItem.total_bags}</strong><br />
                  Good Bags: <span style={{ color: '#16a34a', fontWeight: 600 }}>{selectedItem.total_bags - selectedItem.damaged - selectedItem.wet}</span><br />
                  Damaged: <span style={{ color: '#dc2626', fontWeight: 600 }}>{selectedItem.damaged}</span><br />
                  Wet: <span style={{ color: '#ea580c', fontWeight: 600 }}>{selectedItem.wet}</span>
                </div>
              </div>

              <div style={fieldGroup}>
                <label style={label}>Net Weight (Good Rice)</label>
                <div style={{ fontWeight: 600 }}>{getWeightKg(selectedItem.total_bags - selectedItem.damaged - selectedItem.wet)} Kg</div>
              </div>

              <div style={fieldGroup}>
                <label style={label}>Financials</label>
                <div style={{ fontSize: 13, color: '#4b5563', lineHeight: 1.6 }}>
                  Deduction: <span style={{ color: '#dc2626' }}>₹{selectedItem.deduction_amount?.toLocaleString() || '0'}</span>
                </div>
              </div>

              <div style={fieldGroup}>
                <label style={label}>Status</label>
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                  style={selectStyle}
                >
                  <option value="Approved">Approved</option>
                  <option value="Rejected">Rejected</option>
                  <option value="Pending">Pending</option>
                </select>
              </div>

              <button onClick={handleUpdate} style={buttonStyle}>
                Update Procurement
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const sectionCard = {
  padding: 20,
  borderRadius: 16,
  background: "#ffffff",
  boxShadow: "0 1px 3px rgba(15, 23, 42, 0.08)",
};

const sectionTitle = {
  margin: 0,
  fontSize: 20,
  fontWeight: 700,
};

const sectionText = {
  marginTop: 12,
  color: "#4b5563",
  lineHeight: 1.6,
};

const gridRow = {
  display: "grid",
  gridTemplateColumns: "1.3fr 0.9fr",
  gap: 20,
};

const cardTitle = {
  margin: 0,
  fontSize: 16,
  fontWeight: 700,
};

const tableWrapper = {
  display: "grid",
  gap: 10,
  marginTop: 16,
};

const tableRow = {
  width: "100%",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: 16,
  borderRadius: 12,
  border: "1px solid #e5e7eb",
  background: "#f9fafb",
  cursor: "pointer",
  textAlign: "left",
};

const selectedRow = {
  border: "1px solid #16a34a",
  background: "#ecfdf5",
};

const rowText = {
  marginTop: 6,
  color: "#6b7280",
  fontSize: 13,
};

const badge = {
  padding: "6px 12px",
  borderRadius: 999,
  background: "#e5e7eb",
  color: "#374151",
  fontSize: 12,
  fontWeight: 600,
};

const fieldGroup = {
  display: "grid",
  gap: 8,
  marginTop: 16,
};

const label = {
  fontSize: 13,
  color: "#374151",
};

const selectStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
  fontSize: 14,
};

const buttonStyle = {
  marginTop: 20,
  width: "100%",
  padding: "12px 16px",
  borderRadius: 12,
  background: "#16a34a",
  color: "#ffffff",
  border: "none",
  fontWeight: 700,
  cursor: "pointer",
};
