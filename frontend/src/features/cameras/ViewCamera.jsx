import { useEffect, useRef, useState, useCallback } from "react";
import { getCameras, toggleCamera } from "../../api/cameras.js";

function PowerIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
      <line x1="12" y1="2" x2="12" y2="12" />
    </svg>
  );
}

function CameraTile({ camera, onToggle }) {
  const token  = localStorage.getItem("vfr_token") || "";
  const src    = `/stream/cameras/${camera.id}?token=${encodeURIComponent(token)}`;
  const imgRef = useRef(null);

  function handleError() {
    setTimeout(() => {
      if (imgRef.current) imgRef.current.src = src + "&t=" + Date.now();
    }, 3000);
  }

  return (
    <div className="cam-tile">
      <img ref={imgRef} src={src} alt={camera.name} onError={handleError} className="cam-feed" />
      <div className="cam-label" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span>{camera.name}</span>
        <button
          onClick={() => onToggle(camera.id)}
          title="Stop camera"
          style={{
            background: "rgba(255,93,93,0.25)",
            border: "1px solid var(--danger)",
            color: "var(--danger)",
            padding: "2px 7px",
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            gap: 4,
            borderRadius: 4,
          }}
        >
          <PowerIcon /> Stop
        </button>
      </div>
    </div>
  );
}

const LAYOUTS = [
  { label: "1×1", cols: 1 },
  { label: "1×2", cols: 2 },
  { label: "2×2", cols: 2, max: 4 },
  { label: "2×4", cols: 4, max: 8 },
];

export default function ViewCamera() {
  const [cameras, setCameras] = useState([]);
  const [layout,  setLayout]  = useState(LAYOUTS[1]);
  const [err,     setErr]     = useState("");

  const load = useCallback(() =>
    getCameras()
      .then(data => setCameras(data.filter(c => c.enabled)))
      .catch(ex => setErr(ex.message)),
    []
  );

  useEffect(() => { load(); }, [load]);

  async function handleToggle(id) {
    await toggleCamera(id);
    load();
  }

  const visible = cameras.slice(0, layout.max ?? layout.cols);

  return (
    <div>
      {err && <p className="err">{err}</p>}
      <div className="cam-toolbar">
        <span style={{ color: "var(--muted)", fontSize: 15 }}>
          {cameras.length} camera(s) live
        </span>
        <div className="row" style={{ gap: 6 }}>
          {LAYOUTS.map(l => (
            <button
              key={l.label}
              className={layout.label === l.label ? "" : "ghost"}
              style={{ padding: "5px 10px", fontSize: 14 }}
              onClick={() => setLayout(l)}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {cameras.length === 0 && !err && (
        <div className="panel" style={{ textAlign: "center", color: "var(--muted)", fontSize: 15 }}>
          No cameras are running. Go to <strong>Add Camera</strong> and click <strong>Start</strong> to activate one.
        </div>
      )}

      <div className="cam-grid" style={{ gridTemplateColumns: `repeat(${layout.cols}, 1fr)` }}>
        {visible.map(c => <CameraTile key={c.id} camera={c} onToggle={handleToggle} />)}
      </div>

      {cameras.length > (layout.max ?? layout.cols) && (
        <p className="muted" style={{ marginTop: 10, fontSize: 14 }}>
          {cameras.length - (layout.max ?? layout.cols)} camera(s) not shown — switch to a larger grid.
        </p>
      )}
    </div>
  );
}
