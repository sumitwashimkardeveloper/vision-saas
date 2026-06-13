/**
 * CameraCountsModal — shows a camera's tracked features and their current
 * cumulative counts. Opens when the user clicks "View" on a camera card in the
 * Loading / Unloading Tracking config page. No live video — counts only.
 */

import { useState, useEffect, useRef } from "react";
import { getCameraLoadingCounts, loadingStreamUrl } from "../../api/loading.js";

export default function CameraCountsModal({ camera, trackedObjects, accentColor, running, onClose }) {
  const [loaded,    setLoaded]    = useState({});   // cumulative loaded_count
  const [visible,   setVisible]   = useState({});   // live visible_now
  const [lastEvent, setLastEvent] = useState(null);
  const [timestamp, setTimestamp] = useState(null);

  // Poll counts every 2 s
  useEffect(() => {
    let alive = true;
    function poll() {
      getCameraLoadingCounts(camera.id)
        .then(data => {
          if (!alive) return;
          setLoaded(data.loaded_count || {});
          setVisible(data.visible_now || {});
          setLastEvent(data.last_event || null);
          setTimestamp(data.timestamp || null);
        })
        .catch(() => {});
    }
    poll();
    const id = setInterval(poll, 2000);
    return () => { alive = false; clearInterval(id); };
  }, [camera.id]);

  // Live annotated feed (only meaningful while the camera is running).
  const imgRef    = useRef(null);
  const streamSrc = loadingStreamUrl(camera.id);
  function handleStreamError() {
    setTimeout(() => {
      if (imgRef.current) imgRef.current.src = streamSrc + "&t=" + Date.now();
    }, 3000);
  }

  const objects = trackedObjects.length > 0
    ? trackedObjects
    : Object.keys(loaded);
  const total        = objects.reduce((s, obj) => s + (loaded[obj.toLowerCase()]  ?? 0), 0);
  const visibleTotal = objects.reduce((s, obj) => s + (visible[obj.toLowerCase()] ?? 0), 0);

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "var(--overlay)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 2000, backdropFilter: "blur(4px)", padding: 16,
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: "var(--panel)", border: "1px solid var(--line)",
        borderRadius: 12, width: "100%", maxWidth: 560,
        maxHeight: "92vh", boxShadow: "var(--shadow-lg)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>

        {/* Header */}
        <div style={{
          padding: "14px 20px", borderBottom: "1px solid var(--line)",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 16 }}>{camera.name}</div>
            <div style={{ fontSize: 14, color: "var(--muted)", marginTop: 2 }}>
              Loading / Unloading · current counts
            </div>
          </div>
          <span style={{
            fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em",
            color: running ? "var(--success)" : "var(--muted)",
          }}>
            {running ? "● Counting" : "Stopped"}
          </span>
          <button
            onClick={onClose}
            style={{
              background: "transparent", border: "1px solid var(--line)",
              color: "var(--muted)", padding: "5px 12px", borderRadius: 6, fontSize: 14,
            }}
          >
            ✕ Close
          </button>
        </div>

        {/* Live annotated feed */}
        <div style={{
          background: "#000", borderBottom: "1px solid var(--line)",
          aspectRatio: "16 / 9", display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {running ? (
            <img
              ref={imgRef}
              src={streamSrc}
              alt={`${camera.name} live`}
              onError={handleStreamError}
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
          ) : (
            <span style={{ color: "var(--muted)", fontSize: 14 }}>
              Camera stopped — press Start to see the live feed.
            </span>
          )}
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY: "auto" }}>

        {/* Totals: Loaded (cumulative) + Visible now (live) */}
        <div style={{ display: "flex", borderBottom: "1px solid var(--line)" }}>
          <div style={{ flex: 1, padding: "18px 20px", textAlign: "center", borderRight: "1px solid var(--line)" }}>
            <div style={{ fontSize: 44, fontWeight: 700, color: accentColor, lineHeight: 1 }}>{total}</div>
            <div style={{ fontSize: 14, color: "var(--muted)", marginTop: 6 }}>Loaded count</div>
          </div>
          <div style={{ flex: 1, padding: "18px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 44, fontWeight: 700, color: "var(--fg)", lineHeight: 1 }}>
              {running ? visibleTotal : "—"}
            </div>
            <div style={{ fontSize: 14, color: "var(--muted)", marginTop: 6 }}>Visible now</div>
          </div>
        </div>

        {/* Per-object: visible now → loaded count */}
        <div>
          {objects.length > 0 ? (
            objects.map(obj => {
              const key = obj.toLowerCase();
              const n   = loaded[key]  ?? 0;
              const v   = visible[key] ?? 0;
              return (
                <div key={obj} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "12px 20px", borderBottom: "1px solid var(--line)",
                }}>
                  <span style={{ fontSize: 15, color: n > 0 ? "var(--fg)" : "var(--muted)", textTransform: "capitalize" }}>
                    {obj}
                  </span>
                  <span style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                    {running && (
                      <span style={{ fontSize: 13, color: "var(--muted)" }}>
                        {v} visible
                      </span>
                    )}
                    <span style={{
                      fontSize: 18, fontWeight: 700,
                      color: n > 0 ? accentColor : "var(--muted)",
                      minWidth: 28, textAlign: "right",
                    }}>
                      {n}
                    </span>
                  </span>
                </div>
              );
            })
          ) : (
            <div style={{ padding: "20px", fontSize: 14, color: "var(--muted)", textAlign: "center" }}>
              No features assigned to this camera.
            </div>
          )}
        </div>

        {/* Last event */}
        {lastEvent && lastEvent.label && (
          <div style={{ padding: "10px 20px", borderTop: "1px solid var(--line)", fontSize: 13, color: "var(--muted)" }}>
            Last count: <span style={{ color: "var(--fg)", textTransform: "capitalize" }}>{lastEvent.label}</span> loaded
            {lastEvent.timestamp && ` at ${new Date(lastEvent.timestamp).toLocaleTimeString()}`}
          </div>
        )}

        {/* Footer */}
        <div style={{ padding: "10px 20px", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, color: "var(--muted)", flex: 1 }}>
            {running
              ? "Counting live — an object is counted once it leaves the view."
              : "Stopped — showing the last cumulative total."}
          </span>
          {timestamp && (
            <span style={{ fontSize: 13, color: "var(--muted)" }}>
              {new Date(timestamp).toLocaleTimeString()}
            </span>
          )}
        </div>

        </div>{/* /Scrollable body */}
      </div>
    </div>
  );
}
