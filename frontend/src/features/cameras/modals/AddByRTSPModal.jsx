import { useState } from "react";
import Modal from "../../../components/ui/Modal.jsx";
import { addCamera, updateCamera } from "../../../api/cameras.js";

const HINT = "rtsp://username:password@192.168.1.245:554/cam/realmonitor?channel=1&subtype=0";

export default function AddByRTSPModal({ onClose, onAdded, camera = null }) {
  const editing = camera !== null;

  const [name, setName] = useState(editing ? camera.name : "");
  const [url,  setUrl]  = useState(editing ? camera.rtsp_url : "");
  const [err,  setErr]  = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim())               { setErr("Camera name is required."); return; }
    if (!url.startsWith("rtsp://")) { setErr("URL must start with rtsp://"); return; }
    setErr("");
    setBusy(true);
    try {
      if (editing) {
        await updateCamera(camera.id, { name: name.trim(), rtsp_url: url.trim() });
      } else {
        await addCamera(name.trim(), url.trim());
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
    <Modal title={editing ? "Edit Camera (RTSP URL)" : "Add Camera by RTSP URL"} onClose={onClose}>
      <form className="modal-body" onSubmit={submit}>
        <div className="modal-field">
          <label>Camera Name</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Parking Lot" autoFocus />
        </div>
        <div className="modal-field">
          <label>RTSP URL</label>
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder={HINT}
            style={{ fontFamily: "monospace", fontSize: 14 }}
          />
          <span className="modal-hint">{HINT}</span>
        </div>
        {err && <div className="err">{err}</div>}
        <div className="modal-actions">
          <button type="submit" disabled={busy}>{busy ? "Saving…" : editing ? "Save Changes" : "Add Camera"}</button>
          <button type="button" className="ghost" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
