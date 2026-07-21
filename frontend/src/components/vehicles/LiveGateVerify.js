"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { gateVerify } from "@/lib/api";

/* =========================================================
   LIVE AI GATE VERIFICATION
   Real ANPR: upload an actual gate photo, backend runs OpenCV
   plate localisation + Tesseract OCR and returns a decision.
   This sits alongside the scripted demo above -- use this card
   when you have a real vehicle/plate photo to test against.
========================================================= */

const DECISION_CFG = {
  allowed: { bg: "#dcfce7", color: "#16a34a", label: "Allowed" },
  denied: { bg: "#fff1f2", color: "#b91c1c", label: "Denied" },
  wrong_slot: { bg: "#fff8ee", color: "#c67a00", label: "Wrong Slot — Needs Approval" },
  manual_review: { bg: "#eef2ff", color: "#4338ca", label: "Manual Review Required" },
};

export default function LiveGateVerify({ farmers = [] }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [expectedVehicleId, setExpectedVehicleId] = useState("");
  const [bookingFarmerId, setBookingFarmerId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const [isVideoMedia, setIsVideoMedia] = useState(false);

  const handleFile = (f) => {
    setFile(f);
    setResult(null);
    if (f) {
      const url = URL.createObjectURL(f);
      setPreview(url);
      setIsVideoMedia(f.type.startsWith("video") || Boolean(f.name.match(/\.(mp4|mov|avi|mkv)$/i)));
    } else {
      setPreview("");
      setIsVideoMedia(false);
    }
  };

  const handleSubmit = async () => {
    if (!file) {
      toast.error("Choose a vehicle/plate photo or video first.");
      return;
    }
    setLoading(true);
    try {
      const res = await gateVerify(file, {
        expectedVehicleId: expectedVehicleId || undefined,
        bookingFarmerId: bookingFarmerId || undefined,
      });
      setResult(res);
      if (res.decision === "allowed") toast.success("Gate access allowed");
      else if (res.decision === "denied") toast.error("Gate access denied");
      else toast(DECISION_CFG[res.decision]?.label || res.decision);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Gate verification failed.");
    } finally {
      setLoading(false);
    }
  };

  const cfg = result ? DECISION_CFG[result.decision] || DECISION_CFG.manual_review : null;

  return (
    <div style={card}>
      <div style={cardHeader}>
        <span>📷 Live AI Gate Verification (real ANPR — image & video)</span>
      </div>
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={helpText}>
          Upload an actual vehicle/number-plate photo or arrival video clip.
          The backend ANPR engine performs multi-pass OCR and fuzzy matching.
        </p>

        <label style={dropZone}>
          {preview ? (
            isVideoMedia ? (
              <video src={preview} controls style={{ width: "100%", maxHeight: 200 }} />
            ) : (
              <img src={preview} alt="preview" style={previewImg} />
            )
          ) : (
            <span style={{ color: "#6b7280" }}>Click to choose an image or video</span>
          )}
          <input
            type="file"
            accept="image/*,video/*"
            style={{ display: "none" }}
            onChange={(e) => handleFile(e.target.files?.[0] || null)}
          />
        </label>

        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={inputLabel}>Expected vehicle ID (optional)</label>
            <input
              style={inputStyle}
              placeholder="e.g. MH12AB4521"
              value={expectedVehicleId}
              onChange={(e) => setExpectedVehicleId(e.target.value)}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={inputLabel}>Booking (optional)</label>
            <select
              style={inputStyle}
              value={bookingFarmerId}
              onChange={(e) => setBookingFarmerId(e.target.value)}
            >
              <option value="">— None —</option>
              {farmers.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.token} — {f.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button style={submitBtn} onClick={handleSubmit} disabled={loading}>
          {loading ? "Analyzing…" : "Run ANPR Check"}
        </button>

        {result && (
          <div style={{ ...resultBox, background: cfg.bg, color: cfg.color }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontWeight: 800, fontSize: 15 }}>{cfg.label}</span>
              <span
                style={{
                  padding: "3px 8px",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 800,
                  background: result.is_registered ? "#16a34a" : "#dc2626",
                  color: "#ffffff",
                }}
              >
                {result.registration_status || (result.is_registered ? "REGISTERED" : "UNREGISTERED")}
              </span>
            </div>

            <div style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 3 }}>
              <div>Detected Plate: <b>{result.detected_plate || "—"}</b> (Confidence: {result.confidence}%)</div>
              {result.matched_vehicle_id && <div>Matched Vehicle ID: <b>{result.matched_vehicle_id}</b></div>}
              {result.vehicle_capacity && <div>Vehicle Capacity: <b>{result.vehicle_capacity}</b></div>}
              {result.driver && <div>Driver: <b>{result.driver}</b></div>}
              {result.assigned_farmer && <div>Assigned Farmer: <b>{result.assigned_farmer}</b></div>}
            </div>

            <div style={{ fontSize: 12, opacity: 0.85, marginTop: 6, borderTop: "1px solid rgba(0,0,0,0.1)", paddingTop: 4 }}>
              {result.notes}
            </div>
          </div>
        )}
      </div>
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
  minHeight: 140,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  overflow: "hidden",
  background: "#f9fafb",
};

const previewImg = { width: "100%", height: 180, objectFit: "cover" };

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
  borderRadius: 10,
  padding: 12,
};
