import { useState, useEffect, useCallback } from "react";
import { IconPlus } from "../../layout/icons.jsx";
import AddCameraModal from "./modals/AddCameraModal.jsx";
import { getCameras, deleteCamera, toggleCamera } from "../../api/cameras.js";

function CameraStatIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 7l-7 5 7 5V7z" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  );
}

function ActiveStatIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
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

// Pull host/port/auth out of the stored rtsp:// URL for display.
function parseCamera(rtsp_url) {
  try {
    const u = new URL(rtsp_url);
    return { host: u.hostname, port: u.port || "554", username: decodeURIComponent(u.username), hasPass: !!u.password };
  } catch {
    return { host: rtsp_url, port: "", username: "", hasPass: false };
  }
}

function CameraInfo({ rtsp_url }) {
  const info = parseCamera(rtsp_url);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ fontSize: "clamp(11px,0.88vw,13.5px)", fontFamily: "monospace", color: "var(--fg)" }}>
        {info.host} {info.port && <span style={{ color: "var(--muted)" }}>:{info.port}</span>}
      </div>
      {info.username && (
        <div style={{ fontSize: "clamp(10px,0.78vw,11.5px)", color: "var(--muted)" }}>
          User: {info.username} {info.hasPass ? "· Password: ••••••" : ""}
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, accent }) {
  return (
    <div className="panel" style={{ margin: 0, display: "flex", alignItems: "center", gap: 12, padding: "14px 18px" }}>
      <span style={{
        width: 38, height: 38, borderRadius: 10, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "var(--accent-soft)", color: accent || "var(--accent)",
      }}>
        {icon}
      </span>
      <span>
        <span style={{ display: "block", fontSize: 13, color: "var(--muted)" }}>{label}</span>
        <span style={{ display: "block", fontSize: 26, fontWeight: 700, lineHeight: 1.1 }}>{value}</span>
      </span>
    </div>
  );
}

export default function AddCamera() {
  const [cameras, setCameras] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);   // camera being edited, or null for add

  const load = useCallback(() => getCameras().then(setCameras).catch(console.error), []);
  useEffect(() => { load(); }, [load]);

  const total  = cameras.length;
  const active = cameras.filter(c => c.enabled).length;

  async function toggle(id) {
    await toggleCamera(id);
    load();
  }

  async function remove(id) {
    if (!confirm("Delete this camera?")) return;
    await deleteCamera(id);
    load();
  }

  function openAdd() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(cam) {
    setEditing(cam);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
  }

  return (
    <div>
      {/* ── Top: stats + add button ── */}
      <div style={{ display: "flex", alignItems: "stretch", gap: 14, marginBottom: 18, flexWrap: "wrap" }}>
        <StatCard icon={<CameraStatIcon />} label="Total Cameras"  value={total} />
        <StatCard icon={<ActiveStatIcon />} label="Active Cameras" value={active} accent="var(--success)" />
        <div style={{ flex: 1 }} />
        <button className="cam-add-btn" onClick={openAdd} style={{ alignSelf: "center" }}>
          <IconPlus /> Add Camera
        </button>
      </div>

      {/* ── All cameras list ── */}
      <div className="panel">
        <h2>All Cameras</h2>
        {cameras.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: 15, margin: 0 }}>No cameras added yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Connection</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cameras.map(cam => (
                <tr key={cam.id}>
                  <td style={{ fontWeight: 600 }}>{cam.name}</td>
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
                          padding: "clamp(3px,0.3vw,5px) clamp(6px,0.6vw,9px)", fontSize: "clamp(10.5px,0.82vw,12px)",
                          display: "flex", alignItems: "center", gap: 5,
                          background: "transparent", border: "1px solid var(--line)", color: "var(--fg)",
                        }}
                      >
                        <EditIcon /> Edit
                      </button>
                      {/* Start / Stop */}
                      <button
                        onClick={() => toggle(cam.id)}
                        style={{
                          padding: "clamp(3px,0.3vw,5px) clamp(6px,0.6vw,9px)", fontSize: "clamp(10.5px,0.82vw,12px)",
                          display: "flex", alignItems: "center", gap: 5,
                          background: cam.enabled ? "rgba(255,93,93,0.15)" : "rgba(34,197,94,0.15)",
                          border: `1px solid ${cam.enabled ? "var(--danger)" : "var(--success)"}`,
                          color: cam.enabled ? "var(--danger)" : "var(--success)",
                        }}
                      >
                        <PowerIcon /> {cam.enabled ? "Stop" : "Start"}
                      </button>
                      {/* Delete */}
                      <button className="danger" style={{ padding: "4px 10px", fontSize: 14 }} onClick={() => remove(cam.id)}>
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

      {modalOpen && <AddCameraModal onClose={closeModal} onAdded={load} camera={editing} />}
    </div>
  );
}
