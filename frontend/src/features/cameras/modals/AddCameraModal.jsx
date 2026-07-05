import { useState } from "react";
import Modal from "../../../components/ui/Modal.jsx";
import PasswordInput from "../../../components/ui/PasswordInput.jsx";
import { addCamera, updateCamera, scanNVR } from "../../../api/cameras.js";

/* Build / parse the rtsp:// URL we persist for a single camera. */
function buildRtsp(ip, port, user, pass) {
  if (!ip) return "";
  const auth = user
    ? `${encodeURIComponent(user)}${pass ? ":" + encodeURIComponent(pass) : ""}@`
    : "";
  return `rtsp://${auth}${ip}:${port || 554}/`;
}

function parseRtsp(url) {
  try {
    const u = new URL(url);
    return {
      ip:   u.hostname,
      port: u.port || "554",
      user: decodeURIComponent(u.username),
      pass: decodeURIComponent(u.password),
    };
  } catch {
    return { ip: "", port: "554", user: "", pass: "" };
  }
}

function maskRtsp(url) {
  return url.replace(/:\/\/[^@]+@/, "://***@");
}

/* Steps: choose → single | nvr-connect → nvr-results */
const STEP_CHOOSE   = "choose";
const STEP_SINGLE   = "single";
const STEP_NVR      = "nvr-connect";
const STEP_RESULTS  = "nvr-results";

function CameraGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 7l-7 5 7 5V7z" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  );
}

function NVRGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <circle cx="7" cy="10" r="1.4" fill="currentColor" stroke="none" />
      <line x1="10" y1="10" x2="18" y2="10" />
      <line x1="10" y1="7" x2="18" y2="7" />
    </svg>
  );
}

export default function AddCameraModal({ onClose, onAdded, camera = null }) {
  const editing = camera !== null;
  const parsed  = editing ? parseRtsp(camera.rtsp_url) : { ip: "", port: "554", user: "", pass: "" };

  // When editing, jump straight to the single-camera form.
  const [step, setStep]   = useState(editing ? STEP_SINGLE : STEP_CHOOSE);
  const [mode, setMode]   = useState("single");          // choice on the first step

  // Single-camera form
  const [name, setName] = useState(editing ? camera.name : "");
  const [ip,   setIp]   = useState(parsed.ip);
  const [port, setPort] = useState(editing ? parsed.port : "554");
  const [user, setUser] = useState(parsed.user);
  const [pass, setPass] = useState(parsed.pass);

  // NVR scan results
  const [channels, setChannels] = useState([]);
  const [selected, setSelected] = useState(new Set());

  const [busy, setBusy] = useState(false);   // generic in-flight (add / save / scan)
  const [err,  setErr]  = useState("");

  const singlePreview = buildRtsp(ip, port, user, pass);

  /* ── Step 1: choose ── */
  function next() {
    setErr("");
    if (mode === "single") { setPort("554"); setStep(STEP_SINGLE); }
    else                   { setPort("80");  setStep(STEP_NVR); }
  }

  /* ── Single camera: add or save ── */
  async function submitSingle(e) {
    e.preventDefault();
    if (!name.trim()) { setErr("Camera name is required."); return; }
    if (!ip.trim())   { setErr("IP address is required.");  return; }
    setErr("");
    setBusy(true);
    try {
      if (editing) await updateCamera(camera.id, { name: name.trim(), rtsp_url: singlePreview });
      else         await addCamera(name.trim(), singlePreview);
      onAdded();
      onClose();
    } catch (ex) {
      setErr(ex.message || "Failed to save camera.");
    } finally {
      setBusy(false);
    }
  }

  /* ── NVR: search & connect → list channels ── */
  async function searchNVR(e) {
    e.preventDefault();
    if (!ip.trim())   { setErr("NVR IP address is required."); return; }
    if (!user.trim()) { setErr("Username is required."); return; }
    setErr("");
    setBusy(true);
    try {
      const result = await scanNVR(ip.trim(), port || "80", user.trim(), pass);
      const found = result.channels || [];
      setChannels(found);
      setSelected(new Set(found.map(c => c.token)));
      setStep(STEP_RESULTS);
    } catch (ex) {
      setErr(ex.message || "Failed to connect to the NVR.");
    } finally {
      setBusy(false);
    }
  }

  function toggleChannel(token) {
    setSelected(prev => {
      const nextSet = new Set(prev);
      nextSet.has(token) ? nextSet.delete(token) : nextSet.add(token);
      return nextSet;
    });
  }

  function toggleAll() {
    setSelected(prev => (prev.size === channels.length ? new Set() : new Set(channels.map(c => c.token))));
  }

  async function addSelected() {
    const toAdd = channels.filter(c => selected.has(c.token));
    if (!toAdd.length) { setErr("Select at least one camera to add."); return; }
    setErr("");
    setBusy(true);
    const errors = [];
    for (const ch of toAdd) {
      try { await addCamera(ch.name, ch.rtsp_url); }
      catch (ex) { errors.push(`${ch.name}: ${ex.message}`); }
    }
    setBusy(false);
    if (errors.length) setErr(`Some cameras failed to add:\n${errors.join("\n")}`);
    else { onAdded(); onClose(); }
  }

  const title =
    step === STEP_CHOOSE  ? "Add Camera" :
    step === STEP_SINGLE  ? (editing ? "Edit Camera" : "Add Single Camera") :
    step === STEP_NVR     ? "Connect to NVR" :
    `Found ${channels.length} Camera${channels.length !== 1 ? "s" : ""}`;

  const compactBodyStyle = { maxHeight: "78vh", overflowY: "auto" };

  return (
    <Modal title={title} onClose={onClose} maxWidth={560}>
      {/* ── Step 1: pick source ── */}
      {step === STEP_CHOOSE && (
        <div className="modal-body">
          <div style={{ color: "var(--muted)", fontSize: 13 }}>
            Choose how you want to add cameras, then click Next.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { key: "single", glyph: <CameraGlyph />, label: "Single Camera", desc: "Add one camera by its IP address." },
              { key: "nvr",    glyph: <NVRGlyph />,    label: "NVR",           desc: "Connect to an NVR and list all its cameras." },
            ].map(opt => (
              <label
                key={opt.key}
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
                  border: `1px solid ${mode === opt.key ? "var(--accent)" : "var(--line)"}`,
                  borderRadius: 8, cursor: "pointer",
                  background: mode === opt.key ? "var(--accent-soft)" : "transparent",
                }}
              >
                <input type="radio" name="cam-mode" checked={mode === opt.key} onChange={() => setMode(opt.key)} style={{ cursor: "pointer" }} />
                <span style={{ color: mode === opt.key ? "var(--accent)" : "var(--fg-2)" }}>{opt.glyph}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: 700, color: "var(--fg)" }}>{opt.label}</span>
                  <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>{opt.desc}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="modal-actions">
            <button type="button" onClick={next}>Next</button>
            <button type="button" className="ghost" onClick={onClose}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── Single camera form ── */}
      {step === STEP_SINGLE && (
        <form className="modal-body" onSubmit={submitSingle} style={compactBodyStyle}>
          <div className="modal-field">
            <label>Camera Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Front Door" autoFocus />
          </div>
          <div className="modal-row-2">
            <div className="modal-field">
              <label>IP Address</label>
              <input value={ip} onChange={e => setIp(e.target.value)} placeholder="192.168.1.245" />
            </div>
            <div className="modal-field">
              <label>Port</label>
              <input value={port} onChange={e => setPort(e.target.value)} placeholder="554" />
            </div>
          </div>
          <div className="modal-row-2">
            <div className="modal-field">
              <label>Username</label>
              <input value={user} onChange={e => setUser(e.target.value)} placeholder="admin" autoComplete="off" />
            </div>
            <div className="modal-field">
              <label>Password</label>
              <PasswordInput value={pass} onChange={e => setPass(e.target.value)} autoComplete="new-password" />
            </div>
          </div>
          {singlePreview && (
            <div className="modal-preview camera-rtsp-preview">
              <span className="modal-preview-label">RTSP URL Preview</span>
              <code title={singlePreview}>{singlePreview}</code>
            </div>
          )}
          {err && <div className="err">{err}</div>}
          <div className="modal-actions">
            <button type="submit" disabled={busy}>{busy ? "Saving…" : editing ? "Save Changes" : "Add Camera"}</button>
            {!editing && <button type="button" className="ghost" onClick={() => { setErr(""); setStep(STEP_CHOOSE); }}>Back</button>}
            <button type="button" className="ghost" onClick={onClose}>Cancel</button>
          </div>
        </form>
      )}

      {/* ── NVR connect form ── */}
      {step === STEP_NVR && (
        <form className="modal-body" onSubmit={searchNVR} style={compactBodyStyle}>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>
            Enter the NVR address and login. All cameras connected to it will be listed.
          </div>
          <div className="modal-row-2">
            <div className="modal-field" style={{ flex: 2 }}>
              <label>NVR IP Address</label>
              <input value={ip} onChange={e => setIp(e.target.value)} placeholder="192.168.1.100" autoFocus autoComplete="off" />
            </div>
            <div className="modal-field" style={{ flex: 1 }}>
              <label>Port</label>
              <input value={port} onChange={e => setPort(e.target.value)} placeholder="80" autoComplete="off" />
            </div>
          </div>
          <div className="modal-row-2">
            <div className="modal-field">
              <label>Username</label>
              <input value={user} onChange={e => setUser(e.target.value)} placeholder="admin" autoComplete="off" />
            </div>
            <div className="modal-field">
              <label>Password</label>
              <PasswordInput value={pass} onChange={e => setPass(e.target.value)} autoComplete="new-password" />
            </div>
          </div>

          {busy && (
            <div className="nvr-search-state">
              <div className="nvr-search-spinner" aria-hidden="true" />
              <div className="nvr-search-copy">
                <div className="nvr-search-title">Connecting to NVR</div>
                <div className="nvr-search-subtitle">Discovering the cameras on this NVR…</div>
              </div>
              <div className="nvr-search-bar" aria-hidden="true"><span /></div>
            </div>
          )}

          {err && <div className="err">{err}</div>}
          <div className="modal-actions">
            <button type="submit" disabled={busy}>{busy ? "Searching…" : "Search & Connect"}</button>
            <button type="button" className="ghost" onClick={() => { setErr(""); setStep(STEP_CHOOSE); }}>Back</button>
            <button type="button" className="ghost" onClick={onClose}>Cancel</button>
          </div>
        </form>
      )}

      {/* ── NVR results ── */}
      {step === STEP_RESULTS && (
        <div className="modal-body" style={compactBodyStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid var(--line)" }}>
            <input
              type="checkbox" id="nvr-all"
              checked={selected.size === channels.length && channels.length > 0}
              onChange={toggleAll}
              style={{ width: 15, height: 15, cursor: "pointer" }}
            />
            <label htmlFor="nvr-all" style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, color: "var(--fg)", userSelect: "none" }}>
              Select All ({channels.length})
            </label>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 300, overflowY: "auto", marginBottom: 12 }}>
            {channels.map(ch => (
              <label
                key={ch.token}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                  border: "1px solid var(--line)", borderRadius: 6, cursor: "pointer",
                  background: selected.has(ch.token) ? "rgba(79,140,255,0.06)" : "transparent",
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
                    {maskRtsp(ch.rtsp_url)}
                  </span>
                </div>
              </label>
            ))}
          </div>

          {err && <div className="err" style={{ whiteSpace: "pre-line" }}>{err}</div>}
          <div className="modal-actions">
            <button onClick={addSelected} disabled={busy || selected.size === 0}>
              {busy ? "Adding…" : `Add ${selected.size} Camera${selected.size !== 1 ? "s" : ""}`}
            </button>
            <button className="ghost" onClick={() => { setErr(""); setStep(STEP_NVR); }}>Back</button>
            <button className="ghost" onClick={onClose}>Cancel</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
