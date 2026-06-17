"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { getVarietyPrices, saveVarietyPrice } from "@/lib/priceApi";

const PRICE_FORM_DEFAULT = {
  variety: "",
  price_per_mt: "",
};

export default function PriceSettings() {
  const [prices, setPrices] = useState([]);
  const [form, setForm] = useState(PRICE_FORM_DEFAULT);

  useEffect(() => {
    getVarietyPrices()
      .then(setPrices)
      .catch(() => setPrices([]));
  }, []);

  const handleSave = async () => {
    if (!form.variety || !form.price_per_mt) {
      toast.error("Please select a variety and enter a price");
      return;
    }

    try {
      const saved = await saveVarietyPrice({
        variety: form.variety,
        price_per_mt: Number(form.price_per_mt),
      });
      setPrices((prev) => {
        const existing = prev.find((item) => item.variety === saved.variety);
        if (existing) {
          return prev.map((item) =>
            item.variety === saved.variety ? saved : item,
          );
        }
        return [...prev, saved];
      });
      setForm(PRICE_FORM_DEFAULT);
      toast.success("Price saved");
    } catch (error) {
      console.error(error);
      toast.error("Unable to save price");
    }
  };

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={sectionCard}>
        <h2 style={sectionTitle}>Variety Price List</h2>
        <p style={sectionText}>
          Set rice prices per MT by variety, then save them for stock value
          estimates and procurement planning.
        </p>
      </div>

      <div style={gridRow}>
        <div style={sectionCard}>
          <h3 style={cardTitle}>Price Management</h3>
          <div style={formGrid}>
            <div style={fieldGroup}>
              <label style={label}>Variety</label>
              <input
                value={form.variety}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, variety: event.target.value }))
                }
                style={inputStyle}
                placeholder="e.g. Sona Masoori"
              />
            </div>

            <div style={fieldGroup}>
              <label style={label}>Price per MT (₹)</label>
              <input
                type="number"
                value={form.price_per_mt}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    price_per_mt: event.target.value,
                  }))
                }
                style={inputStyle}
                placeholder="e.g. 33000"
              />
            </div>

            <button onClick={handleSave} style={buttonStyle}>
              Save Price
            </button>
          </div>
        </div>

        <div style={sectionCard}>
          <h3 style={cardTitle}>Current Price List</h3>
          <div style={priceTable}>
            {prices.length === 0 ? (
              <div style={emptyText}>No price entries yet.</div>
            ) : (
              prices.map((price) => (
                <div key={price.variety} style={priceRow}>
                  <span>{price.variety}</span>
                  <span>₹ {price.price_per_mt.toLocaleString()}</span>
                </div>
              ))
            )}
          </div>
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

const buttonStyle = {
  marginTop: 10,
  padding: "14px 18px",
  borderRadius: 12,
  background: "#16a34a",
  color: "#ffffff",
  border: "none",
  fontWeight: 700,
  cursor: "pointer",
};

const priceTable = {
  display: "grid",
  gap: 10,
  marginTop: 16,
};

const priceRow = {
  display: "flex",
  justifyContent: "space-between",
  padding: "12px 14px",
  background: "#f8fafc",
  borderRadius: 10,
  border: "1px solid #e2e8f0",
};

const emptyText = {
  color: "#6b7280",
  fontSize: 13,
};
