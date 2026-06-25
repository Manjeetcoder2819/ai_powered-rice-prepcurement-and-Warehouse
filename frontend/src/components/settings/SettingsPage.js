"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import PriceSettings from "./PriceSettings";
import {
  getModelTraining,
  retrainAIModels,
  getDataset,
  addDatasetRecord,
  uploadDatasetCsv
} from "@/lib/api";

const INITIAL_SETTINGS = {
  warehouseName: "Pimpri APMC",
  capacityKg: 2500000,
  smsSender: "APMC",
  environment: "development",
};

export default function SettingsPage() {
  const [settings, setSettings] = useState(INITIAL_SETTINGS);
  const [form, setForm] = useState(INITIAL_SETTINGS);
  const [trainingSummary, setTrainingSummary] = useState(null);
  const [retraining, setRetraining] = useState(false);

  // Dataset management states
  const [dataset, setDataset] = useState([]);
  const [loadingDataset, setLoadingDataset] = useState(false);
  const [manualRecord, setManualRecord] = useState({
    variety: "Sona Masoori",
    totalBags: 100,
    damaged: 0,
    wet: 0,
  });
  const [addingRecord, setAddingRecord] = useState(false);
  const [fileToUpload, setFileToUpload] = useState(null);
  const [uploadingCsv, setUploadingCsv] = useState(false);

  const loadTraining = async () => {
    try {
      const data = await getModelTraining();
      setTrainingSummary(data);
    } catch (error) {
      console.error(error);
    }
  };

  const loadDataset = async () => {
    setLoadingDataset(true);
    try {
      const data = await getDataset();
      setDataset(data || []);
    } catch (error) {
      console.error("Failed to load dataset", error);
    } finally {
      setLoadingDataset(false);
    }
  };

  useEffect(() => {
    loadTraining();
    loadDataset();
  }, []);

  const handleAddManualRecord = async (e) => {
    e.preventDefault();
    if (manualRecord.totalBags <= 0) {
      toast.error("Total bags must be greater than 0");
      return;
    }
    if (manualRecord.damaged + manualRecord.wet > manualRecord.totalBags) {
      toast.error("Sum of damaged and wet bags cannot exceed total bags");
      return;
    }
    setAddingRecord(true);
    const loadingToast = toast.loading("Adding training record...");
    try {
      await addDatasetRecord({
        variety: manualRecord.variety,
        total_bags: Number(manualRecord.totalBags),
        damaged: Number(manualRecord.damaged),
        wet: Number(manualRecord.wet),
      });
      toast.success("Training record added successfully", { id: loadingToast });
      setManualRecord({ variety: "Sona Masoori", totalBags: 100, damaged: 0, wet: 0 });
      loadTraining();
      loadDataset();
    } catch (error) {
      console.error(error);
      toast.error("Failed to add training record", { id: loadingToast });
    } finally {
      setAddingRecord(false);
    }
  };

  const handleCsvUpload = async (e) => {
    e.preventDefault();
    if (!fileToUpload) {
      toast.error("Please select a CSV file first");
      return;
    }
    setUploadingCsv(true);
    const loadingToast = toast.loading("Uploading dataset CSV...");
    try {
      await uploadDatasetCsv(fileToUpload);
      toast.success("Dataset updated successfully", { id: loadingToast });
      setFileToUpload(null);
      const fileInput = document.getElementById("dataset-file-input");
      if (fileInput) fileInput.value = "";
      loadTraining();
      loadDataset();
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.detail || "Failed to upload dataset", { id: loadingToast });
    } finally {
      setUploadingCsv(false);
    }
  };

  const handleSave = () => {
    setSettings(form);
    toast.success("Settings updated successfully");
  };

  const handleRetrain = async () => {
    setRetraining(true);
    const loadingToast = toast.loading("Retraining AI models on updated datasets...");
    try {
      const data = await retrainAIModels();
      setTrainingSummary(data);
      toast.success("AI models retrained successfully! Weights updated.", { id: loadingToast });
    } catch (error) {
      console.error(error);
      toast.error("Failed to retrain models", { id: loadingToast });
    } finally {
      setRetraining(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={sectionCard}>
        <h2 style={sectionTitle}>System Settings</h2>
        <p style={sectionText}>
          Update warehouse configuration, SMS sender settings, environment
          values, and rice variety pricing.
        </p>
      </div>

      <div style={sectionCard}>
        <h3 style={cardTitle}>Settings</h3>

        <div style={formGrid}>
          <div style={fieldGroup}>
            <label style={label}>Warehouse Name</label>
            <input
              suppressHydrationWarning={true}
              value={form.warehouseName}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  warehouseName: event.target.value,
                }))
              }
              style={inputStyle}
            />
          </div>

          <div style={fieldGroup}>
            <label style={label}>Capacity (Kg)</label>
            <input
              suppressHydrationWarning={true}
              type="number"
              value={form.capacityKg || form.capacityMt || ""}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  capacityKg: Number(event.target.value),
                }))
              }
              style={inputStyle}
            />
          </div>

          <div style={fieldGroup}>
            <label style={label}>SMS Sender ID</label>
            <input
              suppressHydrationWarning={true}
              value={form.smsSender}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  smsSender: event.target.value,
                }))
              }
              style={inputStyle}
            />
          </div>

          <div style={fieldGroup}>
            <label style={label}>Environment</label>
            <select
              suppressHydrationWarning={true}
              value={form.environment}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  environment: event.target.value,
                }))
              }
              style={selectStyle}
            >
              <option value="development">Development</option>
              <option value="production">Production</option>
            </select>
          </div>
        </div>

        <button onClick={handleSave} style={buttonStyle}>
          Save Settings
        </button>

        <div style={summaryCard}>
          <div style={summaryTitle}>Current Values</div>
          <div>Warehouse: {settings.warehouseName}</div>
          <div>Capacity: {(settings.capacityKg ?? settings.capacityMt)?.toLocaleString()} Kg</div>
          <div>SMS Sender: {settings.smsSender}</div>
          <div>Environment: {settings.environment}</div>
        </div>
      </div>

      <div style={sectionCard}>
        <h3 style={cardTitle}>🤖 AI Model Management</h3>
        <p style={sectionText}>
          Monitor offline regression models, defect risk metrics, and trigger model retraining.
        </p>

        {trainingSummary && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div style={summaryCard}>
                <div style={summaryTitle}>Active Model</div>
                <div style={{ fontSize: 13, fontFamily: 'monospace', color: '#4b5563' }}>
                  {trainingSummary.model}
                </div>
              </div>
              <div style={summaryCard}>
                <div style={summaryTitle}>Dataset Summary</div>
                <div style={{ fontSize: 13, color: '#4b5563' }}>
                  Training Records: <strong>{trainingSummary.dataset_records}</strong><br />
                  Seeded Batches: <strong>{trainingSummary.database_batches}</strong>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <div style={summaryTitle}>AI Quality Profile per Rice Variety</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8, fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                    <th style={{ padding: '6px 0' }}>Variety</th>
                    <th>Est. Damaged</th>
                    <th>Est. Wet</th>
                    <th>Risk Level</th>
                    <th>Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {trainingSummary.profiles?.map((p) => (
                    <tr key={p.variety} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 0', fontWeight: 600 }}>{p.variety}</td>
                      <td>{p.damaged_rate_pct}%</td>
                      <td>{p.wet_rate_pct}%</td>
                      <td>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 700,
                          background: p.risk_level === 'high' ? '#fee2e2' : p.risk_level === 'medium' ? '#ffedd5' : '#dcfce7',
                          color: p.risk_level === 'high' ? '#dc2626' : p.risk_level === 'medium' ? '#ea580c' : '#15803d'
                        }}>
                          {p.risk_level}
                        </span>
                      </td>
                      <td>{(p.confidence * 100).toFixed(0)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <button
          onClick={handleRetrain}
          disabled={retraining}
          style={{
            ...buttonStyle,
            background: retraining ? '#93c5fd' : '#2563eb',
            marginTop: 16
          }}
        >
          {retraining ? "Retraining AI..." : "🔄 Retrain AI Models"}
        </button>
      </div>

      {/* AI QUALITY DATASET MANAGER */}
      <div style={sectionCard}>
        <h3 style={cardTitle}>📂 AI Quality Dataset Manager</h3>
        <p style={sectionText}>
          Manage the active dataset for the Gunny Bag AI model. Add manual training records, import a CSV dataset file, and inspect recent records.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 18 }}>
          {/* Manual Entry Form */}
          <div style={{ background: "#f8fafc", padding: 16, borderRadius: 12, border: "1px solid #e2e8f0" }}>
            <h4 style={{ margin: "0 0 12px 0", fontSize: 14, fontWeight: 700 }}>Add Manual Training Sample</h4>
            <form onSubmit={handleAddManualRecord} style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div style={fieldGroup}>
                  <label style={label}>Rice Variety</label>
                  <select
                    suppressHydrationWarning={true}
                    value={manualRecord.variety}
                    onChange={(e) => setManualRecord(prev => ({ ...prev, variety: e.target.value }))}
                    style={selectStyle}
                  >
                    <option value="Sona Masoori">Sona Masoori</option>
                    <option value="IR-64">IR-64</option>
                    <option value="Basmati">Basmati</option>
                  </select>
                </div>
                <div style={fieldGroup}>
                  <label style={label}>Total Bags</label>
                  <input
                    suppressHydrationWarning={true}
                    type="number"
                    value={manualRecord.totalBags}
                    onChange={(e) => setManualRecord(prev => ({ ...prev, totalBags: Number(e.target.value) }))}
                    style={inputStyle}
                  />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div style={fieldGroup}>
                  <label style={label}>Damaged Bags</label>
                  <input
                    suppressHydrationWarning={true}
                    type="number"
                    value={manualRecord.damaged}
                    onChange={(e) => setManualRecord(prev => ({ ...prev, damaged: Number(e.target.value) }))}
                    style={inputStyle}
                  />
                </div>
                <div style={fieldGroup}>
                  <label style={label}>Wet Bags</label>
                  <input
                    suppressHydrationWarning={true}
                    type="number"
                    value={manualRecord.wet}
                    onChange={(e) => setManualRecord(prev => ({ ...prev, wet: Number(e.target.value) }))}
                    style={inputStyle}
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={addingRecord}
                style={{ ...buttonStyle, marginTop: 10, padding: "10px 14px" }}
              >
                {addingRecord ? "Adding..." : "➕ Add Training Record"}
              </button>
            </form>
          </div>

          {/* CSV File Import */}
          <div style={{ background: "#f8fafc", padding: 16, borderRadius: 12, border: "1px solid #e2e8f0", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div>
              <h4 style={{ margin: "0 0 12px 0", fontSize: 14, fontWeight: 700 }}>Import Dataset CSV</h4>
              <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 14px 0", lineHeight: 1.5 }}>
                Upload a CSV file to overwrite/initialize <strong>rice_quality_training.csv</strong>.<br />
                Required headers: <code>variety, total_bags, damaged, wet</code>
              </p>
              <input
                id="dataset-file-input"
                type="file"
                accept=".csv"
                onChange={(e) => setFileToUpload(e.target.files?.[0] || null)}
                style={{ fontSize: 13 }}
              />
            </div>
            <button
              onClick={handleCsvUpload}
              disabled={uploadingCsv || !fileToUpload}
              style={{
                ...buttonStyle,
                marginTop: 14,
                padding: "10px 14px",
                background: !fileToUpload ? "#cbd5e1" : "#2563eb",
                cursor: !fileToUpload ? "not-allowed" : "pointer"
              }}
            >
              {uploadingCsv ? "Uploading..." : "📤 Upload & Overwrite Dataset"}
            </button>
          </div>
        </div>

        {/* Dataset Records Preview */}
        <div style={{ marginTop: 18 }}>
          <h4 style={{ margin: "0 0 8px 0", fontSize: 14, fontWeight: 700 }}>Recent Dataset Training Records</h4>
          {loadingDataset ? (
            <div style={{ fontSize: 13, color: "#6b7280", padding: "10px 0" }}>Loading dataset records...</div>
          ) : dataset.length === 0 ? (
            <div style={{ fontSize: 13, color: "#6b7280", padding: "10px 0" }}>No records found in quality dataset.</div>
          ) : (
            <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 10, background: "#ffffff" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ position: "sticky", top: 0, background: "#f1f5f9", textAlign: "left", borderBottom: "1px solid #cbd5e1" }}>
                    <th style={{ padding: "8px 12px" }}>Variety</th>
                    <th style={{ padding: "8px 12px" }}>Total Bags</th>
                    <th style={{ padding: "8px 12px" }}>Damaged</th>
                    <th style={{ padding: "8px 12px" }}>Wet</th>
                    <th style={{ padding: "8px 12px" }}>Moisture</th>
                    <th style={{ padding: "8px 12px" }}>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {dataset.map((row, idx) => (
                    <tr key={idx} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "6px 12px", fontWeight: 600 }}>{row.variety}</td>
                      <td style={{ padding: "6px 12px" }}>{row.total_bags}</td>
                      <td style={{ padding: "6px 12px", color: row.damaged > 0 ? "#dc2626" : "inherit" }}>{row.damaged}</td>
                      <td style={{ padding: "6px 12px", color: row.wet > 0 ? "#ea580c" : "inherit" }}>{row.wet}</td>
                      <td style={{ padding: "6px 12px" }}>{row.moisture_pct}%</td>
                      <td style={{ padding: "6px 12px" }}>
                        <span style={{
                          fontSize: 10,
                          padding: "2px 6px",
                          borderRadius: 4,
                          background: row.source === "live_scan" ? "#dcfce7" : row.source === "manual_entry" ? "#eff6ff" : "#f1f5f9",
                          color: row.source === "live_scan" ? "#15803d" : row.source === "manual_entry" ? "#1d4ed8" : "#475569"
                        }}>
                          {row.source}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <PriceSettings />
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

const cardTitle = {
  margin: 0,
  fontSize: 16,
  fontWeight: 700,
};

const formGrid = {
  display: "grid",
  gap: 16,
  marginTop: 20,
};

const fieldGroup = {
  display: "grid",
  gap: 8,
};

const label = {
  fontSize: 13,
  color: "#374151",
};

const inputStyle = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
  fontSize: 14,
};

const selectStyle = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
  fontSize: 14,
};

const buttonStyle = {
  marginTop: 20,
  padding: "14px 18px",
  borderRadius: 12,
  background: "#2563eb",
  color: "#ffffff",
  border: "none",
  fontWeight: 700,
  cursor: "pointer",
};

const summaryCard = {
  marginTop: 24,
  padding: 16,
  borderRadius: 14,
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
};

const summaryTitle = {
  marginBottom: 12,
  fontWeight: 700,
};
