import { useState, useEffect, useCallback } from "react";
import { IconPlus } from "../../layout/icons.jsx";
import AddByIPModal from "./modals/AddByIPModal.jsx";
import AddByRTSPModal from "./modals/AddByRTSPModal.jsx";
import { getCameras, deleteCamera } from "../../api/cameras.js";

export default function AddCamera() {
  const [tab, setTab]       = useState("manual");
  const [modal, setModal]   = useState(null);
  const [cameras, setCameras] = useState([]);

  const load = useCallback(() => getCameras().then(setCameras).catch(console.error), []);
  useEffect(() => { load(); }, [load]);

  async function remove(id) {
    if (!confirm("Delete this camera?")) return;
    await deleteCamera(id);
    load();
  }

  return (
    <div>
      {/* ── Add form ── */}
      <div className="panel">
        <div className="cam-add-toggle">
          <button
            className={"cam-toggle-btn" + (tab === "manual" ? " active" : "")}
            onClick={() => setTab("manual")}
          >
            Add Manually
          </button>
          <button
            className={"cam-toggle-btn" + (tab === "scan" ? " active" : "")}
            onClick={() => setTab("scan")}
          >
            Search by IP
          </button>
        </div>

        {tab === "manual" && (
          <div className="cam-manual-btns">
            <button className="cam-add-btn" onClick={() => setModal("ip")}>
              <IconPlus /> Add by IP Address
            </button>
            <button className="cam-add-btn ghost" onClick={() => setModal("rtsp")}>
              <IconPlus /> Add by RTSP URL
            </button>
          </div>
        )}

        {tab === "scan" && (
          <div style={{ color: "var(--muted)", fontSize: 13 }}>
            Network scan coming soon — use manual entry above.
          </div>
        )}
      </div>

      {/* ── Camera list ── */}
      <div className="panel">
        <h2>Existing Cameras</h2>
        {cameras.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: 13, margin: 0 }}>No cameras added yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>RTSP URL</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cameras.map(cam => (
                <tr key={cam.id}>
                  <td style={{ color: "var(--muted)", fontSize: 12 }}>{cam.id}</td>
                  <td style={{ fontWeight: 500 }}>{cam.name}</td>
                  <td style={{ fontFamily: "monospace", fontSize: 11, color: "var(--muted)", maxWidth: 360, wordBreak: "break-all" }}>
                    {cam.rtsp_url}
                  </td>
                  <td>
                    <span className="tag" style={{
                      background: cam.enabled ? "rgba(34,197,94,0.1)" : undefined,
                      color: cam.enabled ? "#22c55e" : undefined
                    }}>
                      {cam.enabled ? "enabled" : "disabled"}
                    </span>
                  </td>
                  <td>
                    <button
                      className="danger"
                      style={{ padding: "4px 10px", fontSize: 12 }}
                      onClick={() => remove(cam.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal === "ip"   && <AddByIPModal   onClose={() => setModal(null)} onAdded={load} />}
      {modal === "rtsp" && <AddByRTSPModal onClose={() => setModal(null)} onAdded={load} />}
    </div>
  );
}
