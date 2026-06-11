import { useState } from "react";
import { IconCamera, IconPeople, IconSettings, IconShield, IconLogout, IconChevron } from "./icons.jsx";

function IconHome({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

export default function Sidebar({ page, setPage, user, onLogout }) {
  const [cameraOpen, setCameraOpen] = useState(
    page === "camera-add" || page === "camera-live"
  );

  function goCamera(sub) {
    setCameraOpen(true);
    setPage(sub);
  }

  function toggleCamera() {
    const next = !cameraOpen;
    setCameraOpen(next);
    if (next) setPage("camera-add");
  }

  const isCameraActive = page === "camera-add" || page === "camera-live";

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">VisionFR</div>
      <nav className="sidebar-nav">

        {/* Home */}
        <button
          className={"sidebar-item" + (page === "home" ? " active" : "")}
          onClick={() => setPage("home")}
        >
          <IconHome size={16} />
          Home
        </button>

        {/* Camera — expandable */}
        <button
          className={"sidebar-item" + (isCameraActive ? " active" : "")}
          onClick={toggleCamera}
        >
          <IconCamera size={16} />
          Camera
          <span className="sidebar-chevron">
            <IconChevron size={12} direction={cameraOpen ? "down" : "right"} />
          </span>
        </button>
        {cameraOpen && (
          <>
            <button
              className={"sidebar-subitem" + (page === "camera-add" ? " active" : "")}
              onClick={() => goCamera("camera-add")}
            >
              Add Camera
            </button>
            <button
              className={"sidebar-subitem" + (page === "camera-live" ? " active" : "")}
              onClick={() => goCamera("camera-live")}
            >
              Live Camera
            </button>
          </>
        )}

        {/* People */}
        <button
          className={"sidebar-item" + (page === "people" ? " active" : "")}
          onClick={() => setPage("people")}
        >
          <IconPeople size={16} />
          People
        </button>

        {/* Features (PPE Detection) */}
        <button
          className={"sidebar-item" + (page === "features" ? " active" : "")}
          onClick={() => setPage("features")}
        >
          <IconShield size={16} />
          Features
        </button>

        {/* Settings */}
        <button
          className={"sidebar-item" + (page === "settings" ? " active" : "")}
          onClick={() => setPage("settings")}
        >
          <IconSettings size={16} />
          Settings
        </button>

      </nav>

      <div style={{ padding: "12px 0", borderTop: "1px solid var(--line)" }}>
        {user && (
          <div style={{ padding: "6px 20px 10px", fontSize: 12, color: "var(--muted)" }}>
            {user.username}
          </div>
        )}
        <button className="sidebar-item" onClick={onLogout}>
          <IconLogout size={16} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
