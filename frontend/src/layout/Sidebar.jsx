import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { IconCamera, IconEvents, IconPeople, IconSettings, IconShield, IconLogout, IconChevron, IconManagement, IconSafety } from "./icons.jsx";
import { pageToPath, pathToPage } from "../nav.js";

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

export default function Sidebar({ user, onLogout }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const page = pathToPage(pathname);
  const setPage = (p) => navigate(pageToPath(p));

  const isFeaturesSubPage  = pathname === "/features/add" || pathname === "/features/manage";
  const isFeaturesActive   = pathname.startsWith("/features") && !isFeaturesSubPage;
  const isMgmtActive       = pathname.startsWith("/management");

  const [collapsed,      setCollapsed]      = useState(false);
  const [cameraOpen,     setCameraOpen]     = useState(page === "camera-add" || page === "camera-live");
  const [featuresOpen,   setFeaturesOpen]   = useState(isFeaturesActive);
  const [mgmtOpen,       setMgmtOpen]       = useState(isMgmtActive);

  function goCamera(sub) {
    setCameraOpen(true);
    setPage(sub);
  }

  function toggleCamera() {
    setCameraOpen(o => !o);
  }

  function goFeatures(sub) {
    setFeaturesOpen(true);
    navigate(sub);
  }

  function toggleFeatures() {
    setFeaturesOpen(o => !o);
  }

  const isCameraActive = page === "camera-add" || page === "camera-live";

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

        {/* People */}
        <button
          className={"sidebar-item" + (page === "people" ? " active" : "")}
          onClick={() => setPage("people")}
        >
          <IconPeople size={18} />
          <span className="nav-label">People</span>
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

        {/* Features */}
        <button
          className={"sidebar-item" + (isFeaturesActive ? " active" : "")}
          onClick={toggleFeatures}
        >
          <IconShield size={18} />
          <span className="nav-label">Features</span>
          <span className="sidebar-chevron">
            <IconChevron size={12} direction={featuresOpen ? "down" : "right"} />
          </span>
        </button>
        {featuresOpen && !collapsed && (
          <div className="sidebar-tree">
            <button
              className={"sidebar-subitem2" + (pathname === "/features/add" ? " active" : "")}
              onClick={() => goFeatures("/features/add")}
            >
              <span className="tree-bullet" />
              <span className="nav-label">Add Features</span>
            </button>
            <button
              className={"sidebar-subitem2" + (pathname === "/features/manage" ? " active" : "")}
              onClick={() => goFeatures("/features/manage")}
            >
              <span className="tree-bullet" />
              <span className="nav-label">Manage Features</span>
            </button>
          </div>
        )}

        {/* Management */}
        <button
          className={"sidebar-item" + (isMgmtActive ? " active" : "")}
          onClick={() => setMgmtOpen(o => !o)}
        >
          <IconManagement size={18} />
          <span className="nav-label">Management</span>
          <span className="sidebar-chevron">
            <IconChevron size={12} direction={mgmtOpen ? "down" : "right"} />
          </span>
        </button>
        {mgmtOpen && !collapsed && (
          <div className="sidebar-tree">
            <button
              className={"sidebar-subitem2" + (pathname === "/management/attendance" ? " active" : "")}
              onClick={() => navigate("/management/attendance")}
            >
              <span className="tree-bullet" />
              <span className="nav-label">Attendance</span>
            </button>
            <button
              className={"sidebar-subitem2" + (pathname === "/management/security" ? " active" : "")}
              onClick={() => navigate("/management/security")}
            >
              <span className="tree-bullet" />
              <span className="nav-label">Security</span>
            </button>
            <button
              className={"sidebar-subitem2" + (pathname === "/management/safety" ? " active" : "")}
              onClick={() => navigate("/management/safety")}
            >
              <span className="tree-bullet" />
              <span className="nav-label">Safety</span>
            </button>
          </div>
        )}

        {/* Events */}
        <button
          className={"sidebar-item" + (page === "events" ? " active" : "")}
          onClick={() => setPage("events")}
        >
          <IconEvents size={18} />
          <span className="nav-label">Events</span>
        </button>

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
