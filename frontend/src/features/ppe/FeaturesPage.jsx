import { useState, useEffect, useCallback, useRef } from "react";
import { getFeatures, toggleFeature, setFeatureCameras } from "../../api/features.js";
import { getCameras } from "../../api/cameras.js";
import {
  getLoadingConfig, saveLoadingConfig,
  startLoadingCamera, stopLoadingCamera, resetLoadingCamera,
} from "../../api/loading.js";
import { FEATURE_GROUPS, PPE_BACKED_KEYS, FACE_RECOGNITION_KEY } from "./featuresDef.jsx";
import CameraCountsModal from "./CameraCountsModal.jsx";
import PeoplePage from "../people/PeoplePage.jsx";

// Features whose enabled state is persisted via the backend /features API.
const isBackendFeature = (key) => PPE_BACKED_KEYS.has(key) || key === FACE_RECOGNITION_KEY;

// ─── Shared toggle ──────────────────────────────────────────────────────────

function Toggle({ enabled, onChange, loading }) {
  return (
    <button
      className={"feature-toggle" + (enabled ? " on" : "")}
      onClick={onChange}
      disabled={loading}
    >
      <span className="feature-toggle-thumb" />
    </button>
  );
}

// ─── Confirm delete modal ────────────────────────────────────────────────────

function ConfirmDeleteModal({ title, message, onConfirm, onClose }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "var(--overlay)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 4000, backdropFilter: "blur(4px)", padding: 20,
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: "var(--panel)", border: "1px solid color-mix(in srgb, var(--danger) 27%, transparent)",
        borderRadius: 12, width: "100%", maxWidth: 400,
        boxShadow: "var(--shadow-lg)",
      }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--line)" }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{title}</div>
          <div style={{ fontSize: 15, color: "var(--muted)" }}>{message}</div>
        </div>
        <div style={{ padding: "12px 20px", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              padding: "7px 16px", fontSize: 14, fontWeight: 500, borderRadius: 6, cursor: "pointer",
              background: "transparent", border: "1px solid var(--line)", color: "var(--muted)",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: "7px 16px", fontSize: 14, fontWeight: 500, borderRadius: 6, cursor: "pointer",
              background: "color-mix(in srgb, var(--danger) 13%, transparent)", border: "1px solid color-mix(in srgb, var(--danger) 33%, transparent)", color: "var(--danger)",
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const S = {
  card: {
    background: "var(--panel)", border: "1px solid var(--line)",
    borderRadius: 10, overflow: "hidden", marginBottom: 12,
  },
  cardHead: {
    padding: "11px 16px", borderBottom: "1px solid var(--line)",
    fontSize: 13, fontWeight: 600, color: "var(--muted)",
    textTransform: "uppercase", letterSpacing: "0.06em",
    display: "flex", alignItems: "center",
  },
  input: {
    flex: 1, padding: "7px 10px", fontSize: 15,
    background: "var(--input-bg)", border: "1px solid var(--line)",
    borderRadius: 6, color: "var(--fg)", outline: "none",
  },
  select: {
    width: "100%", padding: "8px 10px", fontSize: 15,
    background: "var(--input-bg)", border: "1px solid var(--line)",
    borderRadius: 6, color: "var(--fg)", cursor: "pointer",
  },
  btn: (color, ghost) => ({
    padding: "7px 14px", fontSize: 14, fontWeight: 500, borderRadius: 6, cursor: "pointer",
    background: ghost ? "transparent" : `color-mix(in srgb, ${color} 14%, transparent)`,
    border: `1px solid color-mix(in srgb, ${color} ${ghost ? 35 : 50}%, transparent)`,
    color,
  }),
  pill: (color) => ({
    background: `color-mix(in srgb, ${color} 15%, transparent)`,
    border: `1px solid color-mix(in srgb, ${color} 32%, transparent)`,
    borderRadius: 999, padding: "3px 10px", fontSize: 14,
    color: color, fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 5,
  }),
  overlay: {
    position: "fixed", inset: 0, background: "var(--overlay)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 3000, backdropFilter: "blur(4px)", padding: 20,
  },
  modal: {
    background: "var(--panel)", border: "1px solid var(--line)",
    borderRadius: 12, width: "100%", maxWidth: 460,
    boxShadow: "var(--shadow-lg)",
  },
  modalHead: {
    padding: "14px 20px", borderBottom: "1px solid var(--line)",
    fontSize: 16, fontWeight: 700,
  },
  modalBody: { padding: 20 },
  modalFoot: {
    padding: "12px 20px", borderTop: "1px solid var(--line)",
    display: "flex", justifyContent: "flex-end", gap: 8,
  },
  label: {
    display: "block", fontSize: 13, fontWeight: 600,
    color: "var(--muted)", textTransform: "uppercase",
    letterSpacing: "0.06em", marginBottom: 6,
  },
};

// ─── Add-Camera modal ───────────────────────────────────────────────────────

function AddCameraModal({ availableCams, objectPool, accentColor, onAdd, onClose }) {
  const [camSel,    setCamSel]    = useState("");
  const [checked,   setChecked]   = useState(() => new Set());
  const [extraInput, setExtraInput] = useState("");
  const [localPool, setLocalPool] = useState(objectPool);

  function toggleObj(name) {
    setChecked(prev => {
      const s = new Set(prev);
      s.has(name) ? s.delete(name) : s.add(name);
      return s;
    });
  }

  function addExtra() {
    const val = extraInput.trim().toLowerCase();
    if (!val) return;
    if (!localPool.includes(val)) setLocalPool(p => [...p, val]);
    setChecked(p => new Set([...p, val]));
    setExtraInput("");
  }

  const canAssign = camSel && checked.size > 0;

  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.modal}>
        <div style={S.modalHead}>Assign Camera</div>
        <div style={S.modalBody}>

          {/* Camera picker */}
          <label style={S.label}>Camera</label>
          <select style={{ ...S.select, marginBottom: 18 }} value={camSel} onChange={e => setCamSel(e.target.value)}>
            <option value="">Select a camera…</option>
            {availableCams.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          {/* Object checklist */}
          <label style={S.label}>Objects to track</label>
          {localPool.length === 0 ? (
            <p style={{ fontSize: 14, color: "var(--muted)", margin: "0 0 12px" }}>
              No objects in pool yet — add some below.
            </p>
          ) : (
            <div style={{
              display: "flex", flexDirection: "column", gap: 6,
              marginBottom: 14, maxHeight: 200, overflowY: "auto",
            }}>
              {localPool.map(name => (
                <label key={name} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "7px 10px", borderRadius: 6, cursor: "pointer",
                  background: checked.has(name) ? `color-mix(in srgb, ${accentColor} 7%, transparent)` : "transparent",
                  border: "1px solid " + (checked.has(name) ? `color-mix(in srgb, ${accentColor} 25%, transparent)` : "var(--line)"),
                  transition: "all 0.1s",
                }}>
                  <input
                    type="checkbox"
                    checked={checked.has(name)}
                    onChange={() => toggleObj(name)}
                    style={{ accentColor, width: 14, height: 14, cursor: "pointer" }}
                  />
                  <span style={{ fontSize: 15, textTransform: "capitalize" }}>{name}</span>
                </label>
              ))}
            </div>
          )}

          {/* Add extra object */}
          <label style={S.label}>Add more objects</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              style={S.input}
              value={extraInput}
              placeholder="e.g. carton, drum…"
              onChange={e => setExtraInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addExtra()}
            />
            <button onClick={addExtra} style={S.btn(accentColor)}>+ Add</button>
          </div>

        </div>
        <div style={S.modalFoot}>
          <button onClick={onClose} style={S.btn("var(--muted)", true)}>Cancel</button>
          <button
            onClick={() => canAssign && onAdd(Number(camSel), [...checked], localPool)}
            disabled={!canAssign}
            style={{ ...S.btn(accentColor), opacity: canAssign ? 1 : 0.4, cursor: canAssign ? "pointer" : "not-allowed" }}
          >
            Assign Camera
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Camera card ─────────────────────────────────────────────────────────────

function CameraCard({
  camera, classes, accentColor, running, busy,
  onRemove, onEdit, onViewLive, onStart, onStop, onReset,
}) {
  return (
    <div style={{
      background: "var(--bg)", border: "1px solid var(--line)",
      borderRadius: 8, overflow: "hidden",
    }}>
      {/* Row 1: name + actions */}
      <div style={{
        padding: "11px 14px", display: "flex", alignItems: "center", gap: 10,
        borderBottom: "1px solid var(--line)",
      }}>
        <div style={{
          width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
          background: running ? "var(--success)" : "var(--muted)",
        }} />
        <span style={{ fontSize: 15, fontWeight: 600 }}>{camera.name}</span>
        <span style={{
          fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em",
          color: running ? "var(--success)" : "var(--muted)",
        }}>
          {running ? "● Counting" : "Stopped"}
        </span>
        <span style={{ flex: 1 }} />
        <button onClick={() => onViewLive(camera)} style={S.btn(accentColor)}>View</button>
        <button
          onClick={() => onEdit(camera.id)}
          style={{
            background: "var(--card)", border: "1px solid var(--line)", color: "var(--fg)",
            padding: "5px 7px", borderRadius: 5, cursor: "pointer", display: "flex",
            alignItems: "center", justifyContent: "center",
          }}
          title="Edit tracked objects"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
        <button
          onClick={() => onRemove(camera.id)}
          style={{
            background: "color-mix(in srgb, var(--danger) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--danger) 20%, transparent)", color: "var(--danger)",
            padding: "4px 10px", borderRadius: 5, fontSize: 13, fontWeight: 500, cursor: "pointer",
          }}
          title="Remove camera from tracking"
        >
          Remove
        </button>
      </div>

      {/* Row 2: start/stop + reset + cumulative counts */}
      <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {running ? (
          <button
            onClick={() => onStop(camera.id)}
            disabled={busy}
            style={{
              background: "color-mix(in srgb, var(--danger) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--danger) 33%, transparent)", color: "var(--danger)",
              padding: "5px 14px", borderRadius: 5, fontSize: 14, fontWeight: 600,
              cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1,
            }}
          >
            ■ Stop
          </button>
        ) : (
          <button
            onClick={() => onStart(camera.id)}
            disabled={busy}
            style={{
              background: "color-mix(in srgb, var(--success) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--success) 40%, transparent)", color: "var(--success)",
              padding: "5px 14px", borderRadius: 5, fontSize: 14, fontWeight: 600,
              cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1,
            }}
          >
            ▶ Start
          </button>
        )}
        <button
          onClick={() => onReset(camera.id)}
          disabled={busy}
          style={{ ...S.btn("var(--muted)", true), fontSize: 14 }}
          title="Reset cumulative count to zero"
        >
          ↺ Reset
        </button>
      </div>
    </div>
  );
}

// ─── Edit-Camera modal ────────────────────────────────────────────────────────

function EditCameraModal({ camera, currentClasses, objectPool, accentColor, onSave, onClose }) {
  const [checked,    setChecked]    = useState(() => new Set(currentClasses));
  const [extraInput, setExtraInput] = useState("");
  const [localPool,  setLocalPool]  = useState(() => {
    const poolSet = new Set(objectPool);
    currentClasses.forEach(c => poolSet.add(c));
    return [...poolSet];
  });

  function toggleObj(name) {
    setChecked(prev => {
      const s = new Set(prev);
      s.has(name) ? s.delete(name) : s.add(name);
      return s;
    });
  }

  function addExtra() {
    const val = extraInput.trim().toLowerCase();
    if (!val) return;
    if (!localPool.includes(val)) setLocalPool(p => [...p, val]);
    setChecked(p => new Set([...p, val]));
    setExtraInput("");
  }

  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.modal}>
        <div style={S.modalHead}>Edit — {camera.name}</div>
        <div style={S.modalBody}>
          <label style={S.label}>Objects to track</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14, maxHeight: 220, overflowY: "auto" }}>
            {localPool.map(name => (
              <label key={name} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "7px 10px", borderRadius: 6, cursor: "pointer",
                background: checked.has(name) ? `color-mix(in srgb, ${accentColor} 7%, transparent)` : "transparent",
                border: "1px solid " + (checked.has(name) ? `color-mix(in srgb, ${accentColor} 25%, transparent)` : "var(--line)"),
              }}>
                <input type="checkbox" checked={checked.has(name)} onChange={() => toggleObj(name)}
                  style={{ accentColor, width: 14, height: 14, cursor: "pointer" }} />
                <span style={{ fontSize: 15, textTransform: "capitalize" }}>{name}</span>
              </label>
            ))}
          </div>
          <label style={S.label}>Add more objects</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input style={S.input} value={extraInput} placeholder="e.g. carton, drum…"
              onChange={e => setExtraInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addExtra()} />
            <button onClick={addExtra} style={S.btn(accentColor)}>+ Add</button>
          </div>
        </div>
        <div style={S.modalFoot}>
          <button onClick={onClose} style={S.btn("var(--muted)", true)}>Cancel</button>
          <button
            onClick={() => onSave(camera.id, [...checked], localPool)}
            disabled={checked.size === 0}
            style={{ ...S.btn(accentColor), opacity: checked.size ? 1 : 0.4 }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Loading / Unloading config panel ────────────────────────────────────────

const DEFAULT_CFG = {
  enabled: false, source: "custom", presets: [], customs: [],
  camera_ids: [], camera_classes: {},
  running_camera_ids: [],
};

function LoadingUnloadingConfig({ accentColor }) {
  const [cfg,          setCfg]          = useState(DEFAULT_CFG);
  const [allCameras,   setAllCameras]   = useState([]);
  const [poolInput,    setPoolInput]    = useState("");
  const [showAdd,      setShowAdd]      = useState(false);
  const [editingCamId, setEditingCamId] = useState(null);
  const [liveCamera,   setLiveCamera]   = useState(null);
  const [saving,       setSaving]       = useState(false);
  const [saveErr,      setSaveErr]      = useState("");
  const [confirmDel,   setConfirmDel]   = useState(null); // {type:"pool"|"camera", id, label}
  const [tab,          setTab]          = useState("cameras"); // "features" | "cameras"
  const [busyCam,      setBusyCam]      = useState(null);       // camera id being toggled
  const persistTimer = useRef(null);

  useEffect(() => {
    getLoadingConfig().then(setCfg).catch(() => {});
    getCameras().then(setAllCameras).catch(() => {});
  }, []);

  const persist = useCallback(async (next) => {
    setSaving(true); setSaveErr("");
    try {
      const saved = await saveLoadingConfig(next);
      setCfg(saved);
    } catch (e) {
      setSaveErr(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }, []);

  function patch(update) {
    const next = { ...cfg, ...update };
    setCfg(next);
    clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => persist(next), 600);
  }

  // Object pool: unified flat list from customs (new UI always writes to customs)
  const objectPool = [...new Set([
    ...(cfg.source !== "custom" ? (cfg.presets || []).map(s => s.toLowerCase()) : []),
    ...(cfg.customs || []).map(s => s.toLowerCase()),
  ])];

  // Consolidates presets + customs into a single flat list for saving.
  // Ensures old preset-based configs are migrated cleanly on first new-UI write.
  function mergedPool(...extra) {
    return [...new Set([...objectPool, ...extra])];
  }

  function addToPool() {
    const val = poolInput.trim().toLowerCase();
    if (!val || objectPool.includes(val)) { setPoolInput(""); return; }
    patch({ customs: mergedPool(val), presets: [], source: "custom" });
    setPoolInput("");
  }

  function removeFromPool(name) {
    const newPool    = objectPool.filter(x => x !== name);
    const newClasses = {};
    for (const [camId, classes] of Object.entries(cfg.camera_classes || {})) {
      const filtered = classes.filter(c => c !== name);
      if (filtered.length) newClasses[camId] = filtered;
    }
    patch({ customs: newPool, presets: [], source: "custom", camera_classes: newClasses });
  }

  // Camera assignment
  const assignedIds   = cfg.camera_ids || [];
  const assignedCams  = allCameras.filter(c => assignedIds.includes(c.id));
  const availableCams = allCameras.filter(c => !assignedIds.includes(c.id));
  const cameraClasses = cfg.camera_classes || {};

  function handleAddCamera(cameraId, selectedClasses, newPoolItems) {
    patch({
      customs:        mergedPool(...newPoolItems),
      presets:        [],
      source:         "custom",
      camera_ids:     [...assignedIds, cameraId],
      camera_classes: { ...cameraClasses, [String(cameraId)]: selectedClasses },
    });
    setShowAdd(false);
  }

  function handleEditCamera(cameraId, selectedClasses, newPoolItems) {
    patch({
      customs:        mergedPool(...newPoolItems),
      presets:        [],
      source:         "custom",
      camera_classes: { ...cameraClasses, [String(cameraId)]: selectedClasses },
    });
    setEditingCamId(null);
  }

  function removeCamera(id) {
    const newClasses = { ...cameraClasses };
    delete newClasses[String(id)];
    patch({ camera_ids: assignedIds.filter(x => x !== id), camera_classes: newClasses });
  }

  const runningIds = cfg.running_camera_ids || [];

  async function startCam(id) {
    setBusyCam(id); setSaveErr("");
    try { setCfg(await startLoadingCamera(id)); }
    catch (e) { setSaveErr(e.message || "Failed to start"); }
    finally { setBusyCam(null); }
  }

  async function stopCam(id) {
    setBusyCam(id); setSaveErr("");
    try { setCfg(await stopLoadingCamera(id)); }
    catch (e) { setSaveErr(e.message || "Failed to stop"); }
    finally { setBusyCam(null); }
  }

  async function resetCam(id) {
    setBusyCam(id); setSaveErr("");
    try { await resetLoadingCamera(id); }
    catch (e) { setSaveErr(e.message || "Failed to reset"); }
    finally { setBusyCam(null); }
  }

  const editingCamera = editingCamId ? allCameras.find(c => c.id === editingCamId) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

      {saveErr && <p style={{ color: "var(--danger)", fontSize: 14, margin: "0 0 10px" }}>{saveErr}</p>}
      {saving  && <p style={{ color: "var(--muted)", fontSize: 13, margin: "0 0 8px" }}>Saving…</p>}

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {[
          { key: "features", label: `Features${objectPool.length ? ` (${objectPool.length})` : ""}` },
          { key: "cameras",  label: `Cameras${assignedCams.length ? ` (${assignedCams.length})` : ""}` },
        ].map(t => {
          const on = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: "8px 18px", borderRadius: 7, fontSize: 15, fontWeight: 600, cursor: "pointer",
                border: `1px solid ${on ? `color-mix(in srgb, ${accentColor} 53%, transparent)` : "var(--line)"}`,
                background: on ? `color-mix(in srgb, ${accentColor} 10%, transparent)` : "var(--card)",
                color: on ? accentColor : "var(--fg)",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── Features tab: object pool ────────────────────────────────────── */}
      {tab === "features" && (
        <div style={S.card}>
          <div style={S.cardHead}>
            <span style={{ flex: 1 }}>Features to track</span>
            <span style={{ fontSize: 12, fontWeight: 400, color: "var(--muted)", textTransform: "none" }}>
              Objects you can assign to cameras
            </span>
          </div>
          <div style={{ padding: 16 }}>
            {objectPool.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                {objectPool.map(name => (
                  <span key={name} style={{ ...S.pill(accentColor), cursor: "default" }}>
                    <span style={{ textTransform: "capitalize" }}>{name}</span>
                    <button
                      onClick={() => setConfirmDel({ type: "pool", id: name, label: name })}
                      style={{ background: "none", border: "none", color: accentColor, cursor: "pointer", padding: 0, lineHeight: 1, fontSize: 15 }}
                      title="Remove feature"
                    >×</button>
                  </span>
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <input
                style={S.input}
                value={poolInput}
                placeholder="Add a feature to track (e.g. carton, pallet…)"
                onChange={e => setPoolInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addToPool()}
              />
              <button onClick={addToPool} style={S.btn(accentColor)}>+ Add</button>
            </div>

            {objectPool.length === 0 && (
              <p style={{ margin: "10px 0 0", fontSize: 14, color: "var(--muted)" }}>
                Add features here first, then assign them to cameras.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Cameras tab: assignment + start/stop/reset ───────────────────── */}
      {tab === "cameras" && (
        <div style={S.card}>
          <div style={S.cardHead}>
            <span style={{ flex: 1 }}>Tracking cameras</span>
            <span style={{ fontSize: 12, fontWeight: 400, color: "var(--muted)", marginRight: 12 }}>
              {runningIds.length} running / {assignedCams.length} assigned
            </span>
            <button
              onClick={() => setShowAdd(true)}
              disabled={availableCams.length === 0}
              title={
                availableCams.length === 0
                  ? (allCameras.length === 0
                      ? "No cameras exist yet — add one in the Camera section first."
                      : "All your cameras are already assigned. Add a new camera in the Camera section to assign more.")
                  : "Assign a camera to this feature"
              }
              style={{
                ...S.btn(accentColor), fontSize: 13, padding: "4px 10px",
                opacity: availableCams.length ? 1 : 0.4,
                cursor: availableCams.length ? "pointer" : "not-allowed",
              }}
            >
              + Add Camera
            </button>
          </div>

          <div style={{ padding: assignedCams.length ? 12 : 16, display: "flex", flexDirection: "column", gap: 8 }}>
            {assignedCams.length === 0 ? (
              <p style={{ margin: 0, fontSize: 14, color: "var(--muted)" }}>
                {allCameras.length === 0
                  ? "No cameras found. Add cameras from the Camera section first."
                  : objectPool.length === 0
                    ? "Add at least one feature in the Features tab, then assign a camera here."
                    : "No cameras assigned yet. Click \"+ Add Camera\" to begin."}
              </p>
            ) : (
              assignedCams.map(cam => (
                <CameraCard
                  key={cam.id}
                  camera={cam}
                  classes={cameraClasses[String(cam.id)] || objectPool}
                  accentColor={accentColor}
                  running={runningIds.includes(cam.id)}
                  busy={busyCam === cam.id}
                  onRemove={id => setConfirmDel({ type: "camera", id, label: cam.name })}
                  onEdit={setEditingCamId}
                  onViewLive={setLiveCamera}
                  onStart={startCam}
                  onStop={stopCam}
                  onReset={resetCam}
                />
              ))
            )}
          </div>
        </div>
      )}

      {/* Add Camera modal */}
      {showAdd && (
        <AddCameraModal
          availableCams={availableCams}
          objectPool={objectPool}
          accentColor={accentColor}
          onAdd={handleAddCamera}
          onClose={() => setShowAdd(false)}
        />
      )}

      {/* Edit Camera modal */}
      {editingCamera && (
        <EditCameraModal
          camera={editingCamera}
          currentClasses={cameraClasses[String(editingCamera.id)] || objectPool}
          objectPool={objectPool}
          accentColor={accentColor}
          onSave={handleEditCamera}
          onClose={() => setEditingCamId(null)}
        />
      )}

      {/* Counts view modal */}
      {liveCamera && (
        <CameraCountsModal
          camera={liveCamera}
          trackedObjects={cameraClasses[String(liveCamera.id)] || objectPool}
          accentColor={accentColor}
          running={runningIds.includes(liveCamera.id)}
          onClose={() => setLiveCamera(null)}
        />
      )}

      {/* Confirm delete modal */}
      {confirmDel && (
        <ConfirmDeleteModal
          title={confirmDel.type === "camera" ? "Remove camera from tracking?" : "Remove object from pool?"}
          message={
            confirmDel.type === "camera"
              ? `"${confirmDel.label}" will be removed from Loading / Unloading Tracking. This is saved to the database immediately.`
              : `"${confirmDel.label}" will be removed from the object pool and from all camera assignments. This is saved to the database immediately.`
          }
          onConfirm={() => {
            if (confirmDel.type === "camera") removeCamera(confirmDel.id);
            else removeFromPool(confirmDel.id);
            setConfirmDel(null);
          }}
          onClose={() => setConfirmDel(null)}
        />
      )}
    </div>
  );
}

// ─── Camera selector (per-feature) ───────────────────────────────────────────

function FeatureCameraSelector({ cameras, selected, accentColor, saving, onChange }) {
  const selectedSet = new Set(selected);

  function toggle(id) {
    const next = selectedSet.has(id)
      ? selected.filter(x => x !== id)
      : [...selected, id];
    onChange(next);
  }

  const allSelected = cameras.length > 0 && selected.length === cameras.length;

  return (
    <div className="feature-section">
      <div style={{
        padding: "12px 16px", borderBottom: "1px solid var(--line)",
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <span style={{
          flex: 1, fontSize: 13, fontWeight: 700, textTransform: "uppercase",
          letterSpacing: "0.06em", color: accentColor,
        }}>
          Cameras
        </span>
        {saving && <span style={{ fontSize: 13, color: "var(--muted)" }}>Saving…</span>}
        {cameras.length > 0 && (
          <button
            onClick={() => onChange(allSelected ? [] : cameras.map(c => c.id))}
            style={{ ...S.btn("var(--muted)", true), fontSize: 13 }}
          >
            {allSelected ? "Clear all" : "Select all"}
          </button>
        )}
      </div>
      <div style={{ padding: 12 }}>
        {cameras.length === 0 ? (
          <p style={{ margin: 0, fontSize: 14, color: "var(--muted)" }}>
            No cameras found. Add cameras from the Camera section first.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {cameras.map(cam => {
              const on = selectedSet.has(cam.id);
              return (
                <label key={cam.id} style={{
                  display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
                  padding: "9px 12px", borderRadius: 6,
                  border: `1px solid ${on ? `color-mix(in srgb, ${accentColor} 40%, transparent)` : "var(--line)"}`,
                  background: on ? `color-mix(in srgb, ${accentColor} 7%, transparent)` : "var(--bg)",
                }}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(cam.id)}
                    style={{ accentColor, width: 15, height: 15 }}
                  />
                  <span style={{ fontSize: 15, fontWeight: 500 }}>{cam.name}</span>
                </label>
              );
            })}
          </div>
        )}
        {cameras.length > 0 && selected.length === 0 && (
          <p style={{ margin: "10px 0 0", fontSize: 14, color: "var(--warning)" }}>
            No cameras selected — the feature is enabled but inactive until you pick at least one.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Feature page ─────────────────────────────────────────────────────────────

export default function FeaturePage({ group: groupKey, featureKey }) {
  const [enabled,    setEnabled]    = useState(false);
  const [toggling,   setToggling]   = useState(false);
  const [error,      setError]      = useState(null);
  const [allCameras, setAllCameras] = useState([]);
  const [cameraIds,  setCameraIds]  = useState([]);
  const [savingCams, setSavingCams] = useState(false);

  const group   = FEATURE_GROUPS.find(g => g.key === groupKey);
  const feature = group?.features.find(f => f.key === featureKey);

  const isLoadingFeature = feature?.configType === "loading_unloading";
  // PPE + Face Recognition get the per-camera selector (loading has its own).
  const showCameraSelector = isBackendFeature(featureKey);

  useEffect(() => {
    if (!featureKey) return;
    setEnabled(false); setError(null); setCameraIds([]);
    if (showCameraSelector) {
      getCameras().then(setAllCameras).catch(() => {});
    }
    if (isLoadingFeature) {
      getLoadingConfig().then(data => setEnabled(data.enabled)).catch(() => {});
    } else if (isBackendFeature(featureKey)) {
      getFeatures().then(list => {
        const f = list.find(x => x.key === featureKey);
        setEnabled(f ? f.enabled : false);
        setCameraIds(f && f.camera_ids ? f.camera_ids : []);
      }).catch(() => {});
    } else {
      try {
        const saved = JSON.parse(localStorage.getItem("vfr_features") || "{}");
        setEnabled(!!saved[featureKey]);
      } catch {}
    }
  }, [featureKey]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleToggle() {
    if (toggling) return;
    setToggling(true); setError(null);
    const next = !enabled;
    setEnabled(next);
    try {
      if (isLoadingFeature) {
        const current = await getLoadingConfig();
        const saved   = await saveLoadingConfig({ ...current, enabled: next });
        setEnabled(saved.enabled);
      } else if (isBackendFeature(featureKey)) {
        const updated = await toggleFeature(featureKey);
        setEnabled(updated.enabled);
      } else {
        const saved = (() => { try { return JSON.parse(localStorage.getItem("vfr_features") || "{}"); } catch { return {}; } })();
        localStorage.setItem("vfr_features", JSON.stringify({ ...saved, [featureKey]: next }));
      }
    } catch (err) {
      setEnabled(!next);
      setError(err.message || "Failed to toggle");
    } finally {
      setToggling(false);
    }
  }

  async function saveCameras(nextIds) {
    const prev = cameraIds;
    setCameraIds(nextIds);       // optimistic
    setSavingCams(true); setError(null);
    try {
      const updated = await setFeatureCameras(featureKey, nextIds);
      setCameraIds(updated.camera_ids || []);
    } catch (err) {
      setCameraIds(prev);        // rollback
      setError(err.message || "Failed to save cameras");
    } finally {
      setSavingCams(false);
    }
  }

  if (!group || !feature) {
    return <div className="panel" style={{ color: "var(--muted)" }}>Feature not found.</div>;
  }

  return (
    <div style={{ maxWidth: 680 }}>

      {/* Feature status */}
      <div className="feature-section" style={{ marginBottom: 12 }}>
        <div className="feature-section-body">
          <div className="feature-item" style={{ padding: "14px 0" }}>
            {(() => {
              const noCams = enabled && showCameraSelector && cameraIds.length === 0;
              const active = enabled && (!showCameraSelector || cameraIds.length > 0);
              return (
                <>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 3 }}>Feature status</div>
                    <div style={{ fontSize: 14, color: noCams ? "var(--warning)" : "var(--muted)" }}>
                      {!enabled
                        ? "Inactive — enable to start tracking."
                        : noCams
                          ? "Enabled, but no cameras selected — inactive."
                          : showCameraSelector
                            ? `Active — running on ${cameraIds.length} camera${cameraIds.length !== 1 ? "s" : ""}.`
                            : "Active — detection is running on assigned cameras."}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 500, color: active ? "var(--success)" : noCams ? "var(--warning)" : "var(--muted)" }}>
                      {active ? "Active" : "Inactive"}
                    </span>
                    <Toggle enabled={enabled} onChange={handleToggle} loading={toggling} />
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </div>

      {error && <p style={{ color: "var(--danger)", fontSize: 14, margin: "0 0 12px" }}>{error}</p>}

      {feature.configType === "loading_unloading" && (
        <LoadingUnloadingConfig accentColor={group.color} />
      )}

      {showCameraSelector && enabled && (
        <FeatureCameraSelector
          cameras={allCameras}
          selected={cameraIds}
          accentColor={group.color}
          saving={savingCams}
          onChange={saveCameras}
        />
      )}

      {feature.configType === "face_recognition" && enabled && (
        <div className="feature-section">
          <div style={{
            padding: "12px 16px", borderBottom: "1px solid var(--line)",
            fontSize: 13, fontWeight: 700, textTransform: "uppercase",
            letterSpacing: "0.06em", color: group.color,
          }}>
            People
          </div>
          <div style={{ padding: 16 }}>
            <PeoplePage />
          </div>
        </div>
      )}

    </div>
  );
}
