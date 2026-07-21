"use client";

import React from "react";

export default function StockPieChart({ stock = [], width = 150, height = 150, strokeWidth = 16 }) {
  const total = stock.reduce((sum, item) => sum + (item.qty_kg || item.qty_mt || 0), 0);
  const cx = width / 2;
  const cy = height / 2;
  // Radius of the circle containing the donut strokes
  const r = (width - strokeWidth) / 2 - 2; 
  const circ = 2 * Math.PI * r;
  
  let currentOffset = -circ * 0.25; // start from top (-90 degrees)
  const slices = [];

  if (total > 0) {
    stock.forEach(item => {
      const qty = item.qty_kg || item.qty_mt || 0;
      const pct = qty / total;
      if (pct > 0) {
        const dash = pct * circ;
        slices.push({
          variety: item.variety,
          color: item.color || "#cbd5e1",
          dash: dash,
          offset: currentOffset,
        });
        currentOffset -= dash;
      }
    });
  }

  const transitionStyle = {
    transition: "stroke-dasharray 0.6s cubic-bezier(0.4, 0, 0.2, 1), stroke-dashoffset 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
  };

  return (
    <div style={{ position: "relative", width, height, flexShrink: 0 }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* Gray background track if empty */}
        {total === 0 && (
          <circle 
            cx={cx} 
            cy={cy} 
            r={r} 
            fill="none" 
            stroke="#e5e7eb" 
            strokeWidth={strokeWidth} 
          />
        )}
        
        {slices.map((slice, idx) => (
          <circle
            key={slice.variety + idx}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={slice.color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${slice.dash} ${circ - slice.dash}`}
            strokeDashoffset={slice.offset}
            style={transitionStyle}
            strokeLinecap="round"
          />
        ))}
      </svg>
      
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 800, color: "#111827" }}>
          {total > 0 ? "Stock" : "Empty"}
        </div>
        <div style={{ fontSize: 10, color: "#6b7280", marginTop: 1, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          by Variety
        </div>
      </div>
    </div>
  );
}
