import { useState, useEffect, useCallback } from "react";
import { IconPlus } from "../../layout/icons.jsx";
import AddByIPModal from "./modals/AddByIPModal.jsx";
import AddByRTSPModal from "./modals/AddByRTSPModal.jsx";
import SearchByNVRModal from "./modals/SearchByNVRModal.jsx";
import { getCameras, deleteCamera, toggleCamera } from "../../api/cameras.js";

function NVRIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <circle cx="7" cy="10" r="1.5" fill="currentColor" stroke="none" />
      <line x1="10" y1="10" x2="18" y2="10" />
      <line x1="10" y1="7" x2="18" y2="7" />
    </svg>
  );
}

function WifiIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M5 12.55a11 11 0 0 1 14.08 0" />
      <path d="M1.42 9a16 16 0 0 1 21.16 0" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <circle cx="12" cy="20" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function PowerIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M18.36 6.64a9 9 0 1 1-12.73 0" /><line x1="12" y1="2" x2="12" y2="12" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

// Detect if the RTSP URL has embedded IP/auth structure and return display info.
function parseCamera(rtsp_url) {
  try {
    const u = new URL(rtsp_url);
    const host = u.hostname;
    const port = u.port || "554";
    const username = decodeURIComponent(u.username);
    const hasPass  = !!u.password;
    return { isIP: true, host, port, username, hasPass };
  } catch {
    return { isIP: false };
  }
}

function CameraInfo({ rtsp_url }) {
  const info = parseCamera(rtsp_url);
  if (info.isIP) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <div style={{ fontSize: 15, fontFamily: "monospace", color: "var(--fg)" }}>
          {info.host} <span style={{ color: "var(--muted)" }}>:{info.port}</span>
        </div>
        {info.username && (
          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            User: {info.username} {info.hasPass ? "· Password: ••••••" : ""}
          </div>
        )}
      </div>
    );
  }
  return (
    <span style={{ fontFamily: "monospace", fontSize: 13, color: "var(--muted)", wordBreak: "break-all" }}>
      {rtsp_url}
    </span>
  );
}

function CameraType({ rtsp_url }) {
  const info = parseCamera(rtsp_url);
  return (
    <span className="tag" style={{
      background: info.isIP ? "rgba(79,140,255,0.1)" : "rgba(167,139,250,0.1)",
      color: info.isIP ? "var(--accent)" : "var(--accent-2)",
      fontSize: 13,
    }}>
      {info.isIP ? "IP Camera" : "RTSP URL"}
    </span>
  );
}

export default function AddCamera() {
  const [tab,     setTab]    = useState("scan");
  const [modal,   setModal]  = useState(null);   // null | "ip" | "rtsp" | "nvr"
  const [editing, setEditing] = useState(null);  // camera object being edited
  const [cameras, setCameras] = useState([]);

  const load = useCallback(() => getCameras().then(setCameras).catch(console.error), []);
  useEffect(() => { load(); }, [load]);

  async function toggle(id) {
    await toggleCamera(id);
    load();
  }

  async function remove(id) {
    if (!confirm("Delete this camera?")) return;
    await deleteCamera(id);
    load();
  }

  function openEdit(cam) {
    const info = parseCamera(cam.rtsp_url);
    setEditing(cam);
    setModal(info.isIP ? "ip" : "rtsp");
  }

  function closeModal() {
    setModal(null);
    setEditing(null);
  }

  return (
    <div>
      {/* ── Add form ── */}
      <div className="panel">
        <div className="cam-add-toggle">
          <button className={"cam-toggle-btn" + (tab === "scan" ? " active" : "")} onClick={() => setTab("scan")}>
            Search And Connect
          </button>
          <button className={"cam-toggle-btn" + (tab === "manual" ? " active" : "")} onClick={() => setTab("manual")}>
            Add Manually
          </button>
        </div>

        {tab === "manual" && (
          <div className="cam-manual-btns">
            <button className="cam-add-btn" onClick={() => { setEditing(null); setModal("ip"); }}>
              <IconPlus /> Add by IP Address
            </button>
            <button className="cam-add-btn ghost" onClick={() => { setEditing(null); setModal("rtsp"); }}>
              <IconPlus /> Add by RTSP URL
            </button>
          </div>
        )}

        {tab === "scan" && (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {/* Search by NVR */}
            <button
              className="cam-add-btn"
              onClick={() => { setEditing(null); setModal("nvr"); }}
              style={{ flex: 1, minWidth: 200 }}
            >
              <NVRIcon /> Search by NVR
            </button>

            {/* Search by WiFi — Coming Soon */}
            <div style={{ flex: 1, minWidth: 200, position: "relative" }}>
              <button
                className="cam-add-btn ghost"
                disabled
                style={{ width: "100%", opacity: 0.5, cursor: "not-allowed" }}
              >
                <WifiIcon /> Search by WiFi
              </button>
              <span style={{
                position: "absolute", top: -8, right: 8,
                background: "var(--accent)", color: "#fff",
                fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
                padding: "2px 7px", borderRadius: 20,
              }}>
                Coming Soon
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── Camera list ── */}
      <div className="panel">
        <h2>Cameras</h2>
        {cameras.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: 15, margin: 0 }}>No cameras added yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Connection</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cameras.map(cam => (
                <tr key={cam.id}>
                  <td style={{ fontWeight: 600 }}>{cam.name}</td>
                  <td><CameraType rtsp_url={cam.rtsp_url} /></td>
                  <td><CameraInfo rtsp_url={cam.rtsp_url} /></td>
                  <td>
                    <span className="tag" style={{
                      background: cam.enabled ? "rgba(34,197,94,0.12)" : "rgba(255,93,93,0.1)",
                      color: cam.enabled ? "var(--success)" : "var(--danger)",
                    }}>
                      {cam.enabled ? "● Live" : "○ Stopped"}
                    </span>
                  </td>
                  <td>
                    <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                      {/* Edit */}
                      <button
                        onClick={() => openEdit(cam)}
                        style={{
                          padding: "4px 10px", fontSize: 14,
                          display: "flex", alignItems: "center", gap: 5,
                          background: "transparent",
                          border: "1px solid var(--line)",
                          color: "var(--fg)",
                        }}
                      >
                        <EditIcon /> Edit
                      </button>
                      {/* Start / Stop */}
                      <button
                        onClick={() => toggle(cam.id)}
                        style={{
                          padding: "4px 10px", fontSize: 14,
                          display: "flex", alignItems: "center", gap: 5,
                          background: cam.enabled ? "rgba(255,93,93,0.15)" : "rgba(34,197,94,0.15)",
                          border: `1px solid ${cam.enabled ? "var(--danger)" : "var(--success)"}`,
                          color: cam.enabled ? "var(--danger)" : "var(--success)",
                        }}
                      >
                        <PowerIcon /> {cam.enabled ? "Stop" : "Start"}
                      </button>
                      {/* Delete */}
                      <button
                        className="danger"
                        style={{ padding: "4px 10px", fontSize: 14 }}
                        onClick={() => remove(cam.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal === "ip"   && <AddByIPModal      onClose={closeModal} onAdded={load} camera={editing} />}
      {modal === "rtsp" && <AddByRTSPModal    onClose={closeModal} onAdded={load} camera={editing} />}
      {modal === "nvr"  && <SearchByNVRModal  onClose={closeModal} onAdded={load} />}
    </div>
  );
}
