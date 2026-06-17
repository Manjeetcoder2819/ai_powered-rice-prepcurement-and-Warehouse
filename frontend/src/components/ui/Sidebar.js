"use client";

/* =========================================================
   NAV ITEMS
========================================================= */

const NAV_ITEMS = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: "⊞",
  },

  {
    id: "queue",
    label: "Farmer Queue",
    icon: "👥",
    badge: null,
  },

  {
    id: "procurement",
    label: "Procurement",
    icon: "📋",
  },

  {
    id: "bags",
    label: "Gunny Bag AI",
    icon: "📦",
    badge: "AI",
  },

  {
    id: "warehouse",
    label: "Warehouse Stock",
    icon: "🏛",
  },

  {
    id: "weather",
    label: "Rainfall Protection",
    icon: "🌧",
  },

  {
    id: "vehicles",
    label: "Vehicle Scheduling",
    icon: "🚛",
  },

  {
    id: "sms",
    label: "SMS Alerts",
    icon: "📱",
  },

  {
    id: "reports",
    label: "Reports",
    icon: "📄",
  },

  {
    id: "settings",
    label: "Settings",
    icon: "⚙",
  },
];

/* =========================================================
   NAVIGABLE PAGES
========================================================= */

const PAGES_WITH_ROUTE = [
  "dashboard",
  "queue",
  "procurement",
  "bags",
  "warehouse",
  "weather",
  "vehicles",
  "sms",
  "reports",
  "settings",
];

/* =========================================================
   MAIN SIDEBAR
========================================================= */

export default function Sidebar({ activePage, onNavigate }) {
  return (
    <aside style={sidebarStyle}>
      {/* =========================================================
          LOGO SECTION
      ========================================================= */}

      <div style={logoWrapper}>
        <div style={logoIcon}>🌾</div>

        <div>
          <div style={logoTitle}>Smart Rice</div>

          <div style={logoSubTitle}>Management System</div>
        </div>
      </div>

      {/* =========================================================
          NAVIGATION
      ========================================================= */}

      <nav style={navStyle}>
        {NAV_ITEMS.map((item) => {
          const isActive = activePage === item.id;

          const isNavigable = PAGES_WITH_ROUTE.includes(item.id);

          return (
            <div
              key={item.id}
              onClick={() => isNavigable && onNavigate(item.id)}
              style={{
                ...navItem,
                ...(isActive ? activeNavItem : {}),
                cursor: isNavigable ? "pointer" : "default",
              }}
            >
              {/* ICON */}

              <span style={iconStyle}>{item.icon}</span>

              {/* LABEL */}

              <span style={labelStyle}>{item.label}</span>

              {/* BADGE */}

              {item.badge && (
                <span
                  style={{
                    ...badgeStyle,
                    background: item.badge === "AI" ? "#16a34a" : "#ea580c",
                  }}
                >
                  {item.badge}
                </span>
              )}
            </div>
          );
        })}
      </nav>

      {/* =========================================================
          OFFLINE FOOTER
      ========================================================= */}

      <div style={footerWrapper}>
        <div style={offlineCard}>
          <span style={offlineIcon}>📶</span>

          <div>
            <div style={offlineTitle}>You are offline</div>

            <div style={offlineText}>All AI features available locally</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

/* =========================================================
   STYLES
========================================================= */

const sidebarStyle = {
  width: 220,
  height: "100vh",
  background: "#14532d",
  display: "flex",
  flexDirection: "column",
  overflowY: "auto",
  flexShrink: 0,
};

const logoWrapper = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "20px 16px",
  borderBottom: "1px solid rgba(255,255,255,0.1)",
};

const logoIcon = {
  width: 42,
  height: 42,
  borderRadius: 10,
  background: "rgba(255,255,255,0.12)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 22,
};

const logoTitle = {
  color: "#ffffff",
  fontSize: 16,
  fontWeight: 700,
};

const logoSubTitle = {
  color: "rgba(255,255,255,0.6)",
  fontSize: 11,
  marginTop: 2,
};

const navStyle = {
  flex: 1,
  padding: "12px 0",
};

const navItem = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "12px 16px",
  color: "rgba(255,255,255,0.85)",
  transition: "0.2s",
  userSelect: "none",
};

const activeNavItem = {
  background: "rgba(255,255,255,0.12)",
  borderLeft: "4px solid #22c55e",
  color: "#ffffff",
};

const iconStyle = {
  width: 20,
  textAlign: "center",
  fontSize: 16,
  flexShrink: 0,
};

const labelStyle = {
  flex: 1,
  fontSize: 13,
  fontWeight: 500,
};

const badgeStyle = {
  padding: "2px 8px",
  borderRadius: 999,
  color: "#ffffff",
  fontSize: 10,
  fontWeight: 700,
};

const footerWrapper = {
  padding: 14,
  borderTop: "1px solid rgba(255,255,255,0.08)",
};

const offlineCard = {
  background: "rgba(0,0,0,0.25)",
  borderRadius: 10,
  padding: 12,
  display: "flex",
  gap: 10,
  alignItems: "flex-start",
};

const offlineIcon = {
  fontSize: 18,
  marginTop: 2,
};

const offlineTitle = {
  color: "#ffffff",
  fontSize: 12,
  fontWeight: 700,
  marginBottom: 3,
};

const offlineText = {
  color: "rgba(255,255,255,0.65)",
  fontSize: 11,
  lineHeight: 1.5,
};
