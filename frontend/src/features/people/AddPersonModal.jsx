import { useState, useRef, useEffect } from "react";
import Modal from "../../components/ui/Modal.jsx";
import { postJson, postForm } from "../../api/client.js";

const SLOTS = ["Front", "Right", "Left"];

function slugify(s) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "person";
}

function SlotBox({ label, preview, active, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <div style={{
        width: "100%",
        aspectRatio: "1",
        background: "#0c0e14",
        border: `2px ${active ? "solid var(--accent)" : "dashed var(--line)"}`,
        borderRadius: 8,
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        {preview
          ? <img src={preview} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <span style={{ fontSize: 11, color: "var(--muted)" }}>{label}</span>
        }
      </div>
      <span style={{ fontSize: 11, color: active ? "var(--accent)" : "var(--muted)", fontWeight: active ? 600 : 400 }}>
        {preview ? "✓ " : ""}{label}
      </span>
    </div>
  );
}

export default function AddPersonModal({ onClose, onAdded, existingKeys = [] }) {
  const [firstName, setFirstName] = useState("");
  const [lastName,  setLastName]  = useState("");
  const [email,     setEmail]     = useState("");
  const [gender,    setGender]    = useState("male");
  const [mode,      setMode]      = useState("upload");   // "upload" | "capture"
  const [photos,    setPhotos]    = useState({});         // slot → File
  const [previews,  setPreviews]  = useState({});         // slot → objectURL
  const [captureSlot, setCaptureSlot] = useState("Front");
  const [cameraOn,  setCameraOn]  = useState(false);
  const [busy,      setBusy]      = useState(false);
  const [step,      setStep]      = useState("");
  const [err,       setErr]       = useState("");

  const videoRef  = useRef(null);
  const streamRef = useRef(null);

  async function startCamera() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      streamRef.current = s;
      if (videoRef.current) videoRef.current.srcObject = s;
      setCameraOn(true);
    } catch (ex) {
      setErr("Camera access denied: " + ex.message);
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }

  function setSlotPhoto(slot, blob) {
    const file = new File([blob], `${slot.toLowerCase()}.jpg`, { type: "image/jpeg" });
    const url  = URL.createObjectURL(blob);
    setPhotos(p  => ({ ...p, [slot]: file }));
    setPreviews(p => ({ ...p, [slot]: url }));
    const next = SLOTS[SLOTS.indexOf(slot) + 1];
    if (next) setCaptureSlot(next);
  }

  function captureFrame() {
    const v = videoRef.current;
    if (!v) return;
    const c = document.createElement("canvas");
    c.width  = v.videoWidth  || 640;
    c.height = v.videoHeight || 480;
    c.getContext("2d").drawImage(v, 0, 0);
    c.toBlob(blob => blob && setSlotPhoto(captureSlot, blob), "image/jpeg", 0.92);
  }

  function handleFileChange(slot, file) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPhotos(p  => ({ ...p, [slot]: file }));
    setPreviews(p => ({ ...p, [slot]: url }));
  }

  useEffect(() => () => stopCamera(), []);

  function uniqueKey(base) {
    const taken = new Set(existingKeys);
    if (!taken.has(base)) return base;
    let i = 2;
    while (taken.has(`${base}_${i}`)) i++;
    return `${base}_${i}`;
  }

  async function submit(e) {
    e.preventDefault();
    setErr("");
    if (!firstName.trim()) { setErr("First name is required"); return; }
    if (!lastName.trim())  { setErr("Last name is required");  return; }
    if (!photos["Front"])  { setErr("Front photo is required"); return; }

    const fullName = `${firstName.trim()} ${lastName.trim()}`;
    const key      = uniqueKey(slugify(fullName));
    const details  = JSON.stringify({ email: email.trim(), gender });

    setBusy(true);
    try {
      setStep("Creating person…");
      await postJson("/people", { external_key: key, name: fullName, role: null, details });

      for (const slot of SLOTS) {
        if (!photos[slot]) continue;
        setStep(`Uploading ${slot} photo…`);
        const fd = new FormData();
        fd.append("file", photos[slot]);
        await postForm(`/people/${key}/images`, fd);
      }

      setStep("Enrolling for recognition…");
      await postJson("/people/gallery/rebuild");
      onAdded();
      onClose();
    } catch (ex) {
      setErr(ex.message || "Failed to add person");
      setStep("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Add Person" onClose={onClose} maxWidth={560}>
      <form className="modal-body" onSubmit={submit} style={{ maxHeight: "78vh", overflowY: "auto" }}>

        {/* Name */}
        <div className="modal-row-2">
          <div className="modal-field">
            <label>First Name</label>
            <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="John" autoFocus />
          </div>
          <div className="modal-field">
            <label>Last Name</label>
            <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Doe" />
          </div>
        </div>

        {/* Email + Gender */}
        <div className="modal-row-2">
          <div className="modal-field">
            <label>Email (optional)</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="john@example.com" />
          </div>
          <div className="modal-field">
            <label>Gender</label>
            <select value={gender} onChange={e => setGender(e.target.value)}>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        {/* Photo mode toggle */}
        <div className="modal-field">
          <label>Photos (Front required, Right + Left improve accuracy)</label>
          <div className="cam-add-toggle" style={{ marginTop: 6 }}>
            <button type="button" className={"cam-toggle-btn" + (mode === "upload"  ? " active" : "")}
              onClick={() => { setMode("upload"); stopCamera(); }}>
              Upload Photos
            </button>
            <button type="button" className={"cam-toggle-btn" + (mode === "capture" ? " active" : "")}
              onClick={() => { setMode("capture"); startCamera(); }}>
              Capture Photo
            </button>
          </div>
        </div>

        {/* Upload mode */}
        {mode === "upload" && (
          <div style={{ display: "flex", gap: 12 }}>
            {SLOTS.map(slot => (
              <div key={slot} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <div style={{
                  width: "100%", aspectRatio: "1", background: "#0c0e14",
                  border: "2px dashed var(--line)", borderRadius: 8,
                  overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {previews[slot]
                    ? <img src={previews[slot]} alt={slot} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <span style={{ fontSize: 11, color: "var(--muted)" }}>{slot}</span>
                  }
                </div>
                <label style={{
                  fontSize: 11, color: "var(--accent)", cursor: "pointer",
                  padding: "4px 10px", border: "1px solid var(--accent)", borderRadius: 4,
                }}>
                  {previews[slot] ? "Replace" : "Choose"} {slot}
                  <input type="file" accept="image/*" style={{ display: "none" }}
                    onChange={e => handleFileChange(slot, e.target.files[0])} />
                </label>
              </div>
            ))}
          </div>
        )}

        {/* Capture mode */}
        {mode === "capture" && (
          <div>
            {!cameraOn ? (
              <button type="button" onClick={startCamera}>Enable Camera</button>
            ) : (
              <>
                <video ref={videoRef} autoPlay playsInline muted
                  style={{ width: "100%", borderRadius: 8, background: "#000", marginBottom: 10 }} />

                {/* Slot selector */}
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  {SLOTS.map(slot => (
                    <button key={slot} type="button"
                      style={{
                        flex: 1, fontSize: 12, padding: "6px 0",
                        background: captureSlot === slot ? "var(--accent)" : "transparent",
                        border: `1px solid ${captureSlot === slot ? "var(--accent)" : "var(--line)"}`,
                        color: captureSlot === slot ? "#fff" : "var(--muted)",
                      }}
                      onClick={() => setCaptureSlot(slot)}>
                      {previews[slot] ? "✓ " : ""}{slot}
                    </button>
                  ))}
                </div>

                <button type="button" style={{ width: "100%", marginBottom: 12, fontSize: 13 }}
                  onClick={captureFrame}>
                  Capture {captureSlot} Photo
                </button>

                {/* Captured previews */}
                <div style={{ display: "flex", gap: 8 }}>
                  {SLOTS.map(slot => (
                    <div key={slot} style={{ flex: 1 }}>
                      <div style={{
                        width: "100%", aspectRatio: "1", background: "#0c0e14",
                        border: previews[slot] ? "2px solid var(--accent)" : "1px dashed var(--line)",
                        borderRadius: 6, overflow: "hidden",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {previews[slot]
                          ? <img src={previews[slot]} alt={slot} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          : <span style={{ fontSize: 10, color: "var(--muted)" }}>{slot}</span>
                        }
                      </div>
                      <div style={{ textAlign: "center", fontSize: 11, color: previews[slot] ? "var(--accent)" : "var(--muted)", marginTop: 4 }}>
                        {previews[slot] ? "✓ " : ""}{slot}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {step && <div style={{ fontSize: 12, color: "var(--muted)" }}>{step}</div>}
        {err  && <div className="err">{err}</div>}

        <div className="modal-actions">
          <button type="submit" disabled={busy}>{busy ? "Saving…" : "Add Person"}</button>
          <button type="button" className="ghost" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
