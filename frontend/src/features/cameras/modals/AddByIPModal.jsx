import { useState } from "react";
import Modal from "../../../components/ui/Modal.jsx";
import PasswordInput from "../../../components/ui/PasswordInput.jsx";
import { addCamera, updateCamera } from "../../../api/cameras.js";

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

export default function AddByIPModal({ onClose, onAdded, camera = null }) {
  const editing  = camera !== null;
  const parsed   = editing ? parseRtsp(camera.rtsp_url) : { ip: "", port: "554", user: "", pass: "" };

  const [name, setName] = useState(editing ? camera.name : "");
  const [ip,   setIp]   = useState(parsed.ip);
  const [port, setPort] = useState(parsed.port);
  const [user, setUser] = useState(parsed.user);
  const [pass, setPass] = useState(parsed.pass);
  const [err,  setErr]  = useState("");
  const [busy, setBusy] = useState(false);

  const preview = buildRtsp(ip, port, user, pass);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) { setErr("Camera name is required."); return; }
    if (!ip.trim())   { setErr("IP address is required.");  return; }
    setErr("");
    setBusy(true);
    try {
      if (editing) {
        await updateCamera(camera.id, { name: name.trim(), rtsp_url: preview });
      } else {
        await addCamera(name.trim(), preview);
      }
      onAdded();
      onClose();
    } catch (ex) {
      setErr(ex.message || "Failed to save camera.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={editing ? "Edit Camera (IP)" : "Add Camera by IP"} onClose={onClose}>
      <form className="modal-body" onSubmit={submit}>
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
            <input value={user} onChange={e => setUser(e.target.value)} placeholder="admin" />
          </div>
          <div className="modal-field">
            <label>Password</label>
            <PasswordInput value={pass} onChange={e => setPass(e.target.value)} />
          </div>
        </div>
        {preview && (
          <div className="modal-preview">
            <span className="modal-preview-label">RTSP URL Preview</span>
            <code>{preview}</code>
          </div>
        )}
        {err && <div className="err">{err}</div>}
        <div className="modal-actions">
          <button type="submit" disabled={busy}>{busy ? "Saving…" : editing ? "Save Changes" : "Add Camera"}</button>
          <button type="button" className="ghost" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
