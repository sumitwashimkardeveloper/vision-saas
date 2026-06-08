import { useState } from "react";
import Modal from "../../../components/ui/Modal.jsx";
import PasswordInput from "../../../components/ui/PasswordInput.jsx";
import { addCamera } from "../../../api/cameras.js";

function buildRtsp(ip, port, user, pass) {
  if (!ip) return "";
  const auth = user ? `${encodeURIComponent(user)}${pass ? ":" + encodeURIComponent(pass) : ""}@` : "";
  return `rtsp://${auth}${ip}:${port || 554}/`;
}

export default function AddByIPModal({ onClose, onAdded }) {
  const [name, setName]   = useState("");
  const [ip, setIp]       = useState("");
  const [port, setPort]   = useState("554");
  const [user, setUser]   = useState("");
  const [pass, setPass]   = useState("");
  const [err, setErr]     = useState("");
  const [busy, setBusy]   = useState(false);

  const preview = buildRtsp(ip, port, user, pass);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) { setErr("Camera name is required."); return; }
    if (!ip.trim())   { setErr("IP address is required."); return; }
    setErr("");
    setBusy(true);
    try {
      await addCamera(name.trim(), preview);
      onAdded();
      onClose();
    } catch (ex) {
      setErr(ex.message || "Failed to add camera.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Add Camera by IP" onClose={onClose}>
      <form className="modal-body" onSubmit={submit}>
        <div className="modal-field">
          <label>Camera Name</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Front Door" />
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
          <button type="submit" disabled={busy}>{busy ? "Adding…" : "Add Camera"}</button>
          <button type="button" className="ghost" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
