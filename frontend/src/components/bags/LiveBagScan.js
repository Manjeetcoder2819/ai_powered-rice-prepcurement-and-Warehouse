"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { scanBatchMedia } from "@/lib/api";

/* =========================================================
   LIVE AI BAG SCAN
   Real computer vision: upload an actual bag-stack image/video
   for OpenCV-based counting, plus optional close-up bag photos
   for heuristic damage classification (healthy/torn/wet/open).
   Sits alongside the scripted simulation elsewhere on this page.
========================================================= */

export default function LiveBagScan({ farmers = [], onScanComplete }) {
  const [farmerId, setFarmerId] = useState("");
  const [bagMedia, setBagMedia] = useState(null);
  const [bagPreview, setBagPreview] = useState("");
  const [damageFiles, setDamageFiles] = useState([]);
  const [expectedBags, setExpectedBags] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const [isVideoMedia, setIsVideoMedia] = useState(false);

  const handleBagMedia = (f) => {
    setBagMedia(f);
    setResult(null);
    if (f) {
      const url = URL.createObjectURL(f);
      setBagPreview(url);
      setIsVideoMedia(f.type.startsWith("video") || Boolean(f.name.match(/\.(mp4|mov|avi|mkv)$/i)));
    } else {
      setBagPreview("");
      setIsVideoMedia(false);
    }
  };

  const handleSubmit = async () => {
    if (!farmerId) {
      toast.error("Select a farmer/booking first.");
      return;
    }
    if (!bagMedia) {
      toast.error("Choose a bag-stack image or video first.");
      return;
    }
    setLoading(true);
    try {
      const res = await scanBatchMedia(farmerId, {
        bagMediaFile: bagMedia,
        damageImageFiles: damageFiles,
        expectedBags: expectedBags || undefined,
      });
      setResult(res);
      toast.success(`Detected ${res.detected_bags} bags (${res.cv_notes || "CV scan"})`);
      onScanComplete && onScanComplete(res);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Bag scan failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={card}>
      <div style={cardHeader}>📦 Live AI Bag Scan (real OpenCV counting + damage check)</div>
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={helpText}>
          Upload an actual unloading photo or short video. Counting and damage
          classification run for real on the backend — not simulated.
        </p>

        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={inputLabel}>Farmer / booking</label>
            <select style={inputStyle} value={farmerId} onChange={(e) => setFarmerId(e.target.value)}>
              <option value="">— Select —</option>
              {farmers.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.token} — {f.name}
                </option>
              ))}
            </select>
          </div>
          <div style={{ width: 140 }}>
            <label style={inputLabel}>Expected bags</label>
            <input
              type="number"
              style={inputStyle}
              value={expectedBags}
              onChange={(e) => setExpectedBags(e.target.value)}
              placeholder="e.g. 120"
            />
          </div>
        </div>

        <div>
          <label style={inputLabel}>Bag stack image or video</label>
          <label style={dropZone}>
            {bagPreview ? (
              isVideoMedia ? (
                <video src={bagPreview} controls style={{ width: "100%", maxHeight: 200 }} />
              ) : (
                <img src={bagPreview} alt="preview" style={previewImg} />
              )
            ) : (
              <span style={{ color: "#6b7280" }}>
                {bagMedia ? bagMedia.name : "Click to choose an image or video"}
              </span>
            )}
            <input
              type="file"
              accept="image/*,video/*"
              style={{ display: "none" }}
              onChange={(e) => handleBagMedia(e.target.files?.[0] || null)}
            />
          </label>
        </div>

        <div>
          <label style={inputLabel}>Close-up bag photos for damage check (optional, multiple)</label>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => setDamageFiles(Array.from(e.target.files || []))}
          />
        </div>

        <button style={submitBtn} onClick={handleSubmit} disabled={loading}>
          {loading ? "Analyzing…" : "Run AI Scan"}
        </button>

        {result && (
          <div style={resultBox}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
              <Stat label="Expected" value={result.expected_bags} />
              <Stat label="Detected" value={result.detected_bags} />
              <Stat label="Shortage/Excess" value={`${result.shortage}/${result.excess}`} />
              <Stat label="Good" value={result.good} />
              <Stat label="Damaged" value={result.damaged} />
              <Stat label="Wet" value={result.wet} />
            </div>
            {result.damage_class && (
              <div style={{ marginTop: 8, fontSize: 13 }}>
                Worst detected condition: <b>{result.damage_class}</b> (
                {result.damage_confidence}% confidence)
              </div>
            )}
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{result.cv_notes}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{ background: "#f9fafb", borderRadius: 8, padding: 8, textAlign: "center" }}>
      <div style={{ fontSize: 16, fontWeight: 800 }}>{value ?? "—"}</div>
      <div style={{ fontSize: 11, color: "#6b7280" }}>{label}</div>
    </div>
  );
}

const card = {
  background: "#ffffff",
  borderRadius: 12,
  border: "1px solid #e5e7eb",
  overflow: "hidden",
};

const cardHeader = {
  padding: "14px 16px",
  fontWeight: 700,
  borderBottom: "1px solid #e5e7eb",
};

const helpText = { fontSize: 12.5, color: "#6b7280", margin: 0 };

const dropZone = {
  border: "1.5px dashed #d1d5db",
  borderRadius: 10,
  minHeight: 120,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  overflow: "hidden",
  background: "#f9fafb",
};

const previewImg = { width: "100%", height: 160, objectFit: "cover" };

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

const submitBtn = {
  padding: "10px 16px",
  background: "#16a34a",
  color: "#ffffff",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 700,
};

const resultBox = {
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  padding: 12,
};
