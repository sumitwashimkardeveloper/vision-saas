import { FEATURE_GROUPS } from "../features/ppe/featuresDef.jsx";

const PAGE_TITLE = {
  home:          "Home",
  "camera-add":  "Add Camera",
  "camera-live": "Live Camera",
  people:        "People",
  settings:      "Settings",
};

function getTitle(page) {
  if (page.startsWith("feat/")) {
    const [, groupKey, featureKey] = page.split("/");
    const group   = FEATURE_GROUPS.find(g => g.key === groupKey);
    const feature = group?.features.find(f => f.key === featureKey);
    // Show only the current page (the feature), not the full breadcrumb.
    if (feature) return feature.label;
    if (group)   return group.label;
    return "Features";
  }
  return PAGE_TITLE[page] ?? page;
}

export default function Topbar({ page, user }) {
  const initial = (user?.username || "?").trim().charAt(0).toUpperCase();
  return (
    <div
      className="topbar"
      style={{
        borderBottom: "1px solid var(--line)", background: "var(--panel)",
        display: "flex", alignItems: "center", gap: 16,
      }}
    >
      <h1 style={{ fontSize: 27, color: "var(--fg)", fontWeight: 700, flex: 1 }}>{getTitle(page)}</h1>

      {/* Notification bell */}
      <button
        title="Notifications"
        style={{
          background: "transparent", border: "1px solid var(--line)", color: "var(--fg-2)",
          width: 38, height: 38, borderRadius: 999, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      </button>

      {/* Avatar */}
      <div
        title={user?.username || ""}
        style={{
          width: 38, height: 38, borderRadius: 999, flexShrink: 0,
          background: "var(--accent-soft)", color: "var(--accent)",
          border: "1px solid var(--line)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 700, fontSize: 16,
        }}
      >
        {initial}
      </div>
    </div>
  );
}
