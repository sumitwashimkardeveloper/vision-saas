import { useState } from "react";
import Modal from "../../../components/ui/Modal.jsx";
import PasswordInput from "../../../components/ui/PasswordInput.jsx";
import { scanNVR, addCamera } from "../../../api/cameras.js";

const STEP_CONNECT = "connect";
const STEP_RESULTS = "results";

export default function SearchByNVRModal({ onClose, onAdded }) {
  const [step,     setStep]     = useState(STEP_CONNECT);
  const [ip,       setIp]       = useState("");
  const [port,     setPort]     = useState("80");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [channels, setChannels] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [scanning, setScanning] = useState(false);
  const [adding,   setAdding]   = useState(false);
  const [err,      setErr]      = useState("");

  async function handleScan(e) {
    e.preventDefault();
    if (!ip.trim())       { setErr("NVR IP address is required."); return; }
    if (!username.trim()) { setErr("Username is required."); return; }
    setErr("");
    setScanning(true);
    try {
      const result = await scanNVR(ip.trim(), port || "80", username.trim(), password);
      setChannels(result.channels);
      setSelected(new Set(result.channels.map(c => c.token)));
      setStep(STEP_RESULTS);
    } catch (ex) {
      setErr(ex.message || "Failed to connect to NVR.");
    } finally {
      setScanning(false);
    }
  }

  function toggleChannel(token) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(token) ? next.delete(token) : next.add(token);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === channels.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(channels.map(c => c.token)));
    }
  }

  async function handleAdd() {
    const toAdd = channels.filter(c => selected.has(c.token));
    if (!toAdd.length) { setErr("Select at least one camera to add."); return; }
    setErr("");
    setAdding(true);
    const errors = [];
    for (const ch of toAdd) {
      try {
        await addCamera(ch.name, ch.rtsp_url);
      } catch (ex) {
        errors.push(`${ch.name}: ${ex.message}`);
      }
    }
    setAdding(false);
    if (errors.length) {
      setErr(`Some cameras failed to add:\n${errors.join("\n")}`);
    } else {
      onAdded();
      onClose();
    }
  }

  const title = step === STEP_CONNECT ? "Search by NVR" : `Found ${channels.length} Camera${channels.length !== 1 ? "s" : ""}`;

  return (
    <Modal title={title} onClose={onClose}>
      {step === STEP_CONNECT && (
        <form className="modal-body" onSubmit={handleScan}>
          <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 12 }}>
            Enter your NVR details. All cameras connected to the NVR will be discovered automatically.
          </div>
          <div className="modal-row-2">
            <div className="modal-field" style={{ flex: 2 }}>
              <label>NVR IP Address</label>
              <input
                value={ip}
                onChange={e => setIp(e.target.value)}
                placeholder="192.168.1.100"
                autoFocus
                autoComplete="off"
              />
            </div>
            <div className="modal-field" style={{ flex: 1 }}>
              <label>Port</label>
              <input
                value={port}
                onChange={e => setPort(e.target.value)}
                placeholder="80"
                autoComplete="off"
              />
            </div>
          </div>
          <div className="modal-row-2">
            <div className="modal-field">
              <label>Username</label>
              <input
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="admin"
                autoComplete="off"
              />
            </div>
            <div className="modal-field">
              <label>Password</label>
              <PasswordInput
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          </div>
          {err && <div className="err">{err}</div>}
          <div className="modal-actions">
            <button type="submit" disabled={scanning}>
              {scanning ? "Scanning…" : "Scan NVR"}
            </button>
            <button type="button" className="ghost" onClick={onClose}>Cancel</button>
          </div>
        </form>
      )}

      {step === STEP_RESULTS && (
        <div className="modal-body">
          <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 12 }}>
            Select the cameras you want to add. All selected cameras will be connected automatically using the NVR credentials.
          </div>

          {/* Select All toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid var(--line)" }}>
            <input
              type="checkbox"
              id="nvr-all"
              checked={selected.size === channels.length && channels.length > 0}
              onChange={toggleAll}
              style={{ width: 15, height: 15, cursor: "pointer" }}
            />
            <label htmlFor="nvr-all" style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, color: "var(--fg)", userSelect: "none" }}>
              Select All ({channels.length})
            </label>
          </div>

          {/* Channel list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 280, overflowY: "auto", marginBottom: 12 }}>
            {channels.map(ch => (
              <label
                key={ch.token}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 10px",
                  border: "1px solid var(--line)",
                  borderRadius: 6,
                  cursor: "pointer",
                  background: selected.has(ch.token) ? "rgba(79,140,255,0.06)" : "transparent",
                  transition: "background 0.15s",
                }}
              >
                <input
                  type="checkbox"
                  checked={selected.has(ch.token)}
                  onChange={() => toggleChannel(ch.token)}
                  style={{ width: 15, height: 15, flexShrink: 0, cursor: "pointer" }}
                />
                <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                  <span style={{ fontWeight: 600, fontSize: 14, color: "var(--fg)" }}>{ch.name}</span>
                  <span style={{ fontFamily: "monospace", fontSize: 11, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {ch.rtsp_url.replace(/:\/\/[^@]+@/, "://●●●@")}
                  </span>
                </div>
              </label>
            ))}
          </div>

          {err && <div className="err" style={{ whiteSpace: "pre-line" }}>{err}</div>}

          <div className="modal-actions">
            <button onClick={handleAdd} disabled={adding || selected.size === 0}>
              {adding ? "Adding…" : `Add ${selected.size} Camera${selected.size !== 1 ? "s" : ""}`}
            </button>
            <button className="ghost" onClick={() => { setStep(STEP_CONNECT); setErr(""); }}>
              Back
            </button>
            <button className="ghost" onClick={onClose}>Cancel</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
