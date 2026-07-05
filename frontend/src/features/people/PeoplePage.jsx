import { useEffect, useRef, useState, useCallback } from "react";
import { getJson, getBlob, patchJson, postForm, putForm, del } from "../../api/client.js";
import { IconPeople, IconPlus } from "../../layout/icons.jsx";
import AddPersonModal from "./AddPersonModal.jsx";

const SLOTS = ["Front", "Right", "Left"];

const SLOT_LABELS = {
  Front: "Front",
  Right: "Right",
  Left: "Left",
};

const SLOT_HELP = {
  Front: "Look straight at the camera.",
  Right: "Move your head left.",
  Left: "Move your head right.",
};

function parseDetails(raw) {
  try { return JSON.parse(raw || "{}"); } catch { return {}; }
}

function Thumb({ personKey, version }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let cancelled = false, objUrl = "";
    setUrl("");
    getBlob(`/people/${personKey}/image?v=${encodeURIComponent(`${version}-${Date.now()}`)}`)
      .then(blob => { if (cancelled) return; objUrl = URL.createObjectURL(blob); setUrl(objUrl); })
      .catch(() => { if (!cancelled) setUrl(""); });
    return () => { cancelled = true; if (objUrl) URL.revokeObjectURL(objUrl); };
  }, [personKey, version]);

  return url
    ? <img className="thumb" src={url} alt={personKey} />
    : <span className="thumb thumb-empty" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>👤</span>;
}

function GenderIcon({ color }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 22c0-4 3.5-7 8-7s8 3 8 7" />
    </svg>
  );
}

function StatCard({ label, value, color, icon }) {
  return (
    <div className="panel" style={{
      margin: 0,
      minWidth: 150,
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "14px 16px",
    }}>
      <span style={{
        width: 40,
        height: 40,
        borderRadius: 10,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        background: "var(--accent-soft)",
        color: color || "var(--accent)",
      }}>
        {icon}
      </span>
      <span>
        <span style={{ display: "block", fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>{label}</span>
        <span style={{ display: "block", fontSize: 28, lineHeight: 1, fontWeight: 800, color: color || "var(--fg)" }}>{value}</span>
      </span>
    </div>
  );
}

const GENDER_LABEL = { male: "Male", female: "Female", other: "Other" };
const GENDER_COLOR = { male: "var(--accent)", female: "#f472b6", other: "var(--accent-2)" };
const CATEGORY_LABEL = {
  general: "General",
  staff: "Staff",
  vip: "VIP",
  blocked: "Blocked",
  security_staff: "Security Staff",
  management: "Management",
};
const CATEGORY_COLOR = {
  general: "var(--muted)",
  staff: "var(--accent)",
  vip: "var(--warning)",
  blocked: "var(--danger)",
  security_staff: "var(--accent-2)",
  management: "var(--success)",
};

const CATEGORY_OPTIONS = [
  { value: "general", label: "General" },
  { value: "staff", label: "Staff" },
  { value: "vip", label: "VIP" },
  { value: "blocked", label: "Blocked" },
  { value: "security_staff", label: "Security Staff" },
  { value: "management", label: "Management" },
];

function splitName(name) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] || "", lastName: "" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts.at(-1) };
}

function EditIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function EditPersonModal({ person, onClose, onSaved }) {
  const details = parseDetails(person.details);
  const initialName = splitName(person.name);
  const [firstName, setFirstName] = useState(initialName.firstName);
  const [lastName, setLastName] = useState(initialName.lastName);
  const [email, setEmail] = useState(details.email || "");
  const [gender, setGender] = useState(details.gender || "male");
  const [category, setCategory] = useState(person.category || "general");
  const [mode, setMode] = useState("upload");
  const [photos, setPhotos] = useState({});
  const [previews, setPreviews] = useState({});
  const [captureSlot, setCaptureSlot] = useState("Front");
  const [cameraOn, setCameraOn] = useState(false);
  const [step, setStep] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const modalBodyStyle = { maxHeight: "78vh", overflowY: "auto" };
  const captureVideoStyle = {
    width: "100%",
    height: "clamp(180px, 30vh, 250px)",
    borderRadius: 8,
    background: "#000",
    marginBottom: 10,
    objectFit: "cover",
    transform: "scaleX(-1)",
  };

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      streamRef.current = stream;
      setCameraOn(true);
    } catch (ex) {
      setErr("Camera access denied: " + ex.message);
    }
  }

  useEffect(() => {
    if (cameraOn && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [cameraOn]);

  function stopCamera() {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    setCameraOn(false);
  }

  useEffect(() => () => stopCamera(), []);

  function setSlotPhoto(slot, blob) {
    const file = new File([blob], `${slot.toLowerCase()}.jpg`, { type: "image/jpeg" });
    const url = URL.createObjectURL(blob);
    setPhotos(prev => ({ ...prev, [slot]: file }));
    setPreviews(prev => ({ ...prev, [slot]: url }));
    const next = SLOTS[SLOTS.indexOf(slot) + 1];
    if (next) setCaptureSlot(next);
  }

  function captureFrame() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => blob && setSlotPhoto(captureSlot, blob), "image/jpeg", 0.92);
  }

  function handleFileChange(slot, file) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPhotos(prev => ({ ...prev, [slot]: file }));
    setPreviews(prev => ({ ...prev, [slot]: url }));
  }

  async function saveImages() {
    const selectedSlots = SLOTS.filter(slot => photos[slot]);
    if (!selectedSlots.length) return;

    for (let index = 0; index < selectedSlots.length; index++) {
      const slot = selectedSlots[index];
      setStep(`${index === 0 ? "Replacing" : "Uploading"} ${slot} photo...`);
      const fd = new FormData();
      fd.append("file", photos[slot]);
      if (index === 0) {
        await putForm(`/people/${person.external_key}/image`, fd);
      } else {
        await postForm(`/people/${person.external_key}/images`, fd);
      }
    }
  }

  async function submit(e) {
    e.preventDefault();
    setErr("");
    if (!firstName.trim()) {
      setErr("First name is required");
      return;
    }
    if (!lastName.trim()) {
      setErr("Last name is required");
      return;
    }

    const nextDetails = JSON.stringify({ ...details, email: email.trim(), gender });
    setBusy(true);
    try {
      setStep("Saving person details...");
      await patchJson(`/people/${person.external_key}`, {
        name: `${firstName.trim()} ${lastName.trim()}`,
        category,
        role: person.role || null,
        details: nextDetails,
      });
      await saveImages();
      onSaved();
      onClose();
    } catch (ex) {
      setErr(ex.message || "Failed to update person");
      setStep("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <div className="modal-title">Edit Person</div>
          <button className="modal-close" onClick={onClose}>x</button>
        </div>
        <form className="modal-body" onSubmit={submit} style={modalBodyStyle}>
          <div className="modal-row-2">
            <div className="modal-field">
              <label>First Name</label>
              <input value={firstName} onChange={e => setFirstName(e.target.value)} autoFocus />
            </div>
            <div className="modal-field">
              <label>Last Name</label>
              <input value={lastName} onChange={e => setLastName(e.target.value)} />
            </div>
          </div>
          <div className="modal-row-2">
            <div className="modal-field">
              <label>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} />
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
          <div className="modal-field">
            <label>Category</label>
            <select value={category} onChange={e => setCategory(e.target.value)}>
              {CATEGORY_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div className="modal-field">
            <label>Update Photos</label>
            <div className="cam-add-toggle" style={{ marginTop: 6 }}>
              <button type="button" className={"cam-toggle-btn" + (mode === "upload" ? " active" : "")}
                onClick={() => { setMode("upload"); stopCamera(); }}>
                Upload Photos
              </button>
              <button type="button" className={"cam-toggle-btn" + (mode === "capture" ? " active" : "")}
                onClick={() => { setMode("capture"); startCamera(); }}>
                Capture Photo
              </button>
            </div>
          </div>

          {mode === "upload" && (
            <div style={{ display: "flex", gap: 12 }}>
              {SLOTS.map(slot => (
                <div key={slot} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  <div style={{
                    width: "100%", aspectRatio: "1", background: "var(--bg-2)",
                    border: previews[slot] ? "2px solid var(--accent)" : "2px dashed var(--line)",
                    borderRadius: 8, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {previews[slot]
                      ? <img src={previews[slot]} alt={slot} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <span style={{ fontSize: 13, color: "var(--muted)" }}>{slot}</span>
                    }
                  </div>
                  <label style={{
                    fontSize: 13, color: "var(--accent)", cursor: "pointer",
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

          {mode === "capture" && (
            <div>
              {!cameraOn ? (
                <button type="button" onClick={startCamera}>Enable Camera</button>
              ) : (
                <>
                  <video ref={videoRef} autoPlay playsInline muted style={captureVideoStyle} />
                  <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                    {SLOTS.map(slot => (
                      <button key={slot} type="button"
                        style={{
                          flex: 1, fontSize: 14, padding: "6px 0",
                          background: captureSlot === slot ? "var(--accent)" : "transparent",
                          border: `1px solid ${captureSlot === slot ? "var(--accent)" : "var(--line)"}`,
                          color: captureSlot === slot ? "#fff" : "var(--muted)",
                        }}
                        onClick={() => setCaptureSlot(slot)}>
                        {previews[slot] ? "✓ " : ""}{SLOT_LABELS[slot]}
                      </button>
                    ))}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8, textAlign: "center" }}>
                    {SLOT_HELP[captureSlot]}
                  </div>
                  <button type="button" style={{ width: "100%", marginBottom: 12, fontSize: 15 }}
                    onClick={captureFrame}>
                    Capture {SLOT_LABELS[captureSlot]} Photo
                  </button>
                  <div style={{ display: "flex", gap: 8 }}>
                    {SLOTS.map(slot => (
                      <div key={slot} style={{ flex: 1 }}>
                        <div style={{
                          width: "100%", aspectRatio: "1", background: "var(--bg-2)",
                          border: previews[slot] ? "2px solid var(--accent)" : "1px dashed var(--line)",
                          borderRadius: 6, overflow: "hidden",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {previews[slot]
                            ? <img src={previews[slot]} alt={slot} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            : <span style={{ fontSize: 12, color: "var(--muted)" }}>{slot}</span>
                          }
                        </div>
                        <div style={{ textAlign: "center", fontSize: 13, color: previews[slot] ? "var(--accent)" : "var(--muted)", marginTop: 4 }}>
                          {previews[slot] ? "✓ " : ""}{slot}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          {step && <div style={{ fontSize: 14, color: "var(--muted)" }}>{step}</div>}
          {err && <div className="err">{err}</div>}
          <div className="modal-actions">
            <button type="submit" disabled={busy}>{busy ? "Saving..." : "Save Changes"}</button>
            <button type="button" className="ghost" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}


export default function PeoplePage() {
  const [people,     setPeople]     = useState([]);
  const [showModal,  setShowModal]  = useState(false);
  const [editing,    setEditing]    = useState(null);
  const [imgVersion, setImgVersion] = useState(0);
  const [err,        setErr]        = useState("");

  const load = useCallback(async () => {
    setErr("");
    try { setPeople(await getJson("/people")); }
    catch (ex) { setErr(ex.message); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function remove(key, name) {
    if (!confirm(`Delete ${name}? This cannot be undone.`)) return;
    try {
      await del("/people/" + key);
      load();
    } catch (ex) { setErr(ex.message); }
  }

  function onAdded() {
    setImgVersion(v => v + 1);
    load();
  }

  const total  = people.length;
  const counts = { male: 0, female: 0, other: 0 };
  for (const p of people) {
    const g = parseDetails(p.details).gender || "other";
    counts[g in counts ? g : "other"]++;
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 14, flex: 1, minWidth: 280 }}>
          <StatCard label="Total People" value={total} icon={<IconPeople size={22} />} />
          <StatCard label="Male"   value={counts.male}   color={GENDER_COLOR.male}   icon={<GenderIcon color={GENDER_COLOR.male} />} />
          <StatCard label="Female" value={counts.female} color={GENDER_COLOR.female} icon={<GenderIcon color={GENDER_COLOR.female} />} />
          <StatCard label="Other"  value={counts.other}  color={GENDER_COLOR.other}  icon={<GenderIcon color={GENDER_COLOR.other} />} />
        </div>
        <button onClick={() => setShowModal(true)} style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "10px 14px",
          fontWeight: 700,
          flexShrink: 0,
        }}>
          <IconPlus size={15} />
          <span>Add Person</span>
        </button>
      </div>

{err && <p className="err">{err}</p>}

      {/* People table */}
      <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "13px 16px", borderBottom: "1px solid var(--line)", fontSize: 15, fontWeight: 700 }}>
          Enrolled People
        </div>
        {people.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--muted)", fontSize: 15 }}>
            No people enrolled yet. Click <strong>Add Person</strong> to get started.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Photo</th>
                <th>Name</th>
                <th>Category</th>
                <th>Gender</th>
                <th>Email</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {people.map(p => {
                const d = parseDetails(p.details);
                const g = d.gender || "other";
                const category = p.category || "general";
                return (
                  <tr key={p.id}>
                    <td><Thumb personKey={p.external_key} version={imgVersion} /></td>
                    <td style={{ fontWeight: 500 }}>{p.name}</td>
                    <td>
                      <span className="tag" style={{
                        color: CATEGORY_COLOR[category] || "var(--muted)",
                        background: "transparent",
                        border: `1px solid ${CATEGORY_COLOR[category] || "var(--muted)"}`,
                      }}>
                        {CATEGORY_LABEL[category] || category}
                      </span>
                    </td>
                    <td>
                      <span className="tag" style={{ color: GENDER_COLOR[g], background: "transparent", border: `1px solid ${GENDER_COLOR[g]}` }}>
                        {GENDER_LABEL[g] || g}
                      </span>
                    </td>
                    <td style={{ color: "var(--muted)", fontSize: 14 }}>{d.email || "—"}</td>
                    <td style={{ display: "flex", gap: 8 }}>
                      <button className="ghost" style={{ padding: "4px 8px", display: "inline-flex", alignItems: "center", gap: 5 }} onClick={() => setEditing(p)}>
                        <EditIcon />
                        Edit
                      </button>
                      <button className="danger" style={{ padding: "4px 10px", fontSize: 14 }} onClick={() => remove(p.external_key, p.name)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <AddPersonModal
          onClose={() => setShowModal(false)}
          onAdded={onAdded}
          existingKeys={people.map(p => p.external_key)}
        />
      )}

      {editing && (
        <EditPersonModal
          person={editing}
          onClose={() => setEditing(null)}
          onSaved={onAdded}
        />
      )}
    </div>
  );
}
