import { useEffect, useRef, useState } from "react";
import { getCameras } from "../../api/cameras.js";

function CameraTile({ camera }) {
  const token = localStorage.getItem("vfr_token") || "";
  const src   = `/stream/cameras/${camera.id}?token=${encodeURIComponent(token)}`;
  const imgRef = useRef(null);

  function handleError() {
    setTimeout(() => {
      if (imgRef.current) imgRef.current.src = src + "&t=" + Date.now();
    }, 3000);
  }

  return (
    <div className="cam-tile">
      <img ref={imgRef} src={src} alt={camera.name} onError={handleError} className="cam-feed" />
      <div className="cam-label">{camera.name}</div>
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
  const [layout, setLayout]   = useState(LAYOUTS[1]);
  const [err, setErr]         = useState("");

  useEffect(() => {
    getCameras()
      .then(data => setCameras(data.filter(c => c.enabled)))
      .catch(ex => setErr(ex.message));
  }, []);

  const visible = cameras.slice(0, layout.max ?? layout.cols);

  return (
    <div>
      {err && <p className="err">{err}</p>}
      <div className="cam-toolbar">
        <span style={{ color: "var(--muted)", fontSize: 13 }}>{cameras.length} camera(s) enabled</span>
        <div className="row" style={{ gap: 6 }}>
          {LAYOUTS.map(l => (
            <button
              key={l.label}
              className={layout.label === l.label ? "" : "ghost"}
              style={{ padding: "5px 10px", fontSize: 12 }}
              onClick={() => setLayout(l)}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>
      {cameras.length === 0 && !err && (
        <p className="muted" style={{ marginTop: 16 }}>
          No enabled cameras. Add cameras from <strong>Add Camera</strong>.
        </p>
      )}
      <div className="cam-grid" style={{ gridTemplateColumns: `repeat(${layout.cols}, 1fr)` }}>
        {visible.map(c => <CameraTile key={c.id} camera={c} />)}
      </div>
      {cameras.length > (layout.max ?? layout.cols) && (
        <p className="muted" style={{ marginTop: 10, fontSize: 12 }}>
          {cameras.length - (layout.max ?? layout.cols)} camera(s) not shown — switch to a larger grid.
        </p>
      )}
    </div>
  );
}
