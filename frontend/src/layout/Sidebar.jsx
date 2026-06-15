import { useState } from "react";
import { IconCamera, IconSettings, IconShield, IconLogout, IconChevron } from "./icons.jsx";
import { FEATURE_GROUPS } from "../features/ppe/featuresDef.jsx";

function IconHome({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function BrandLogo() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="var(--accent-soft)" />
      <circle cx="12" cy="11" r="3.2" />
      <circle cx="12" cy="11" r="0.6" fill="var(--accent)" stroke="none" />
    </svg>
  );
}

function parseFeaturePage(page) {
  const parts = page.startsWith("feat/") ? page.split("/") : [];
  return { groupKey: parts[1] || null, featureKey: parts[2] || null };
}

export default function Sidebar({ page, setPage, user, onLogout }) {
  const { groupKey: activeGroupKey } = parseFeaturePage(page);

  const [collapsed,    setCollapsed]    = useState(false);
  const [cameraOpen,   setCameraOpen]   = useState(page === "camera-add" || page === "camera-live");
  const [featuresOpen, setFeaturesOpen] = useState(page.startsWith("feat/"));
  const [groupsOpen,   setGroupsOpen]   = useState(() =>
    activeGroupKey ? { [activeGroupKey]: true } : {}
  );

  function goCamera(sub) {
    setCameraOpen(true);
    setPage(sub);
  }

  function toggleCamera() {
    setCameraOpen(o => !o);
  }

  function toggleGroup(key) {
    setGroupsOpen(prev => ({ ...prev, [key]: !prev[key] }));
  }

  const isCameraActive   = page === "camera-add" || page === "camera-live";
  const isFeaturesActive = page.startsWith("feat/");

  return (
    <aside className={"sidebar" + (collapsed ? " collapsed" : "")}>
      <div className="sidebar-brand">
        <img src={`${import.meta.env.BASE_URL}assets/logo.webp`} alt="GuardVision" className="brand-logo-img" />
        <button
          className="brand-collapse"
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <IconChevron size={16} direction={collapsed ? "right" : "left"} />
        </button>
      </div>

      <nav className="sidebar-nav">

        {/* Home */}
        <button
          className={"sidebar-item" + (page === "home" ? " active" : "")}
          onClick={() => setPage("home")}
        >
          <IconHome size={18} />
          <span className="nav-label">Home</span>
        </button>

        {/* Camera */}
        <button
          className={"sidebar-item" + (isCameraActive ? " active" : "")}
          onClick={toggleCamera}
        >
          <IconCamera size={18} />
          <span className="nav-label">Camera</span>
          <span className="sidebar-chevron">
            <IconChevron size={12} direction={cameraOpen ? "down" : "right"} />
          </span>
        </button>
        {cameraOpen && !collapsed && (
          <div className="sidebar-tree">
            <button
              className={"sidebar-subitem2" + (page === "camera-add" ? " active" : "")}
              onClick={() => goCamera("camera-add")}
            >
              <span className="tree-bullet" />
              <span className="nav-label">Add Camera</span>
            </button>
            <button
              className={"sidebar-subitem2" + (page === "camera-live" ? " active" : "")}
              onClick={() => goCamera("camera-live")}
            >
              <span className="tree-bullet" />
              <span className="nav-label">Live Camera</span>
            </button>
          </div>
        )}

        {/* Features — 3-level */}
        <button
          className={"sidebar-item" + (isFeaturesActive ? " active" : "")}
          onClick={() => setFeaturesOpen(o => !o)}
        >
          <IconShield size={18} />
          <span className="nav-label">Features</span>
          <span className="sidebar-chevron">
            <IconChevron size={12} direction={featuresOpen ? "down" : "right"} />
          </span>
        </button>

        {featuresOpen && !collapsed && FEATURE_GROUPS.map(group => {
          const isGroupActive = page.startsWith(`feat/${group.key}/`);
          const isGroupOpen   = !!groupsOpen[group.key];

          return (
            <div key={group.key}>
              {/* Group row */}
              <button
                className={"sidebar-group" + (isGroupOpen || isGroupActive ? " open" : "")}
                onClick={() => toggleGroup(group.key)}
              >
                <span className="sidebar-group-icon">{group.icon}</span>
                <span className="nav-label">{group.label}</span>
                <span className="sidebar-chevron">
                  <IconChevron size={11} direction={isGroupOpen ? "down" : "right"} />
                </span>
              </button>

              {/* Feature rows */}
              {isGroupOpen && (
                <div className="sidebar-tree">
                  {group.features.map(feat => (
                    <button
                      key={feat.key}
                      className={"sidebar-subitem2" + (page === `feat/${group.key}/${feat.key}` ? " active" : "")}
                      onClick={() => setPage(`feat/${group.key}/${feat.key}`)}
                    >
                      <span className="tree-bullet" />
                      <span className="nav-label">{feat.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Settings */}
        <button
          className={"sidebar-item" + (page === "settings" ? " active" : "")}
          onClick={() => setPage("settings")}
        >
          <IconSettings size={18} />
          <span className="nav-label">Settings</span>
        </button>

      </nav>

      <div className="sidebar-foot">
        {user && !collapsed && (
          <div className="sidebar-user">{user.username}</div>
        )}
        <button className="sidebar-item" onClick={onLogout}>
          <IconLogout size={18} />
          <span className="nav-label">Sign out</span>
        </button>
      </div>
    </aside>
  );
}
