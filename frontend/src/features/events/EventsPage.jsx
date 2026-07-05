import { useEffect, useMemo, useState } from "react";
import { getEvent, getEvents, getEventSnapshot } from "../../api/events.js";

const EVENT_LABELS = {
  face_recognition: "Face recognition",
  unknown_face: "Unknown face",
  ppe_violation: "PPE violation",
  loading_count: "Loading count",
  alert: "Alert",
};

function pretty(value) {
  if (!value) return "—";
  return EVENT_LABELS[value] || String(value).replaceAll("_", " ");
}

function fmtTime(value) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "medium",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function fmtScore(value) {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${Math.round(n * 100)}%`;
}

function SnapshotThumb({ event }) {
  const [url, setUrl] = useState("");

  useEffect(() => {
    let alive = true;
    let objectUrl = "";
    setUrl("");
    if (!event?.has_snapshot) return undefined;

    getEventSnapshot(event.id)
      .then((blob) => {
        if (!alive) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {});

    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [event?.id, event?.has_snapshot]);

  if (!event?.has_snapshot) return <span className="event-thumb empty">—</span>;
  if (!url) return <span className="event-thumb empty">...</span>;
  return <img className="event-thumb" src={url} alt="" />;
}

function DetailsModal({ event, onClose }) {
  const [snapshotUrl, setSnapshotUrl] = useState("");

  useEffect(() => {
    let alive = true;
    let objectUrl = "";
    setSnapshotUrl("");
    if (!event?.has_snapshot) return undefined;

    getEventSnapshot(event.id)
      .then((blob) => {
        if (!alive) return;
        objectUrl = URL.createObjectURL(blob);
        setSnapshotUrl(objectUrl);
      })
      .catch(() => {});

    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [event?.id, event?.has_snapshot]);

  if (!event) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="event-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Event #{event.id}</div>
          <button className="modal-close" onClick={onClose} title="Close">x</button>
        </div>
        <div className="event-modal-body">
          <div className="event-snapshot-large">
            {snapshotUrl ? <img src={snapshotUrl} alt="" /> : <span>No snapshot</span>}
          </div>
          <div className="event-detail-grid">
            <Detail label="Type" value={pretty(event.event_type)} />
            <Detail label="Feature" value={pretty(event.feature_type)} />
            <Detail label="Camera" value={event.camera_name || event.camera_id} />
            <Detail label="Person" value={event.person_name || event.person_id} />
            <Detail label="Object" value={event.object_label} />
            <Detail label="Label" value={event.label} />
            <Detail label="Confidence" value={fmtScore(event.confidence ?? event.score)} />
            <Detail label="Time" value={fmtTime(event.ts)} />
          </div>
          {event.details && (
            <pre className="event-json">{JSON.stringify(event.details, null, 2)}</pre>
          )}
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <div className="event-detail-label">{label}</div>
      <div className="event-detail-value">{value || "—"}</div>
    </div>
  );
}

export default function EventsPage() {
  const [events, setEvents] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const latest = useMemo(() => events.slice(0, 100), [events]);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      setEvents(await getEvents({ limit: 100 }));
    } catch (e) {
      setErr(e.message || "Failed to load events");
    } finally {
      setLoading(false);
    }
  }

  async function openEvent(event) {
    try {
      setSelected(await getEvent(event.id));
    } catch {
      setSelected(event);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="events-page">
      <div className="cam-toolbar">
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>Events</h2>
          <div className="muted">Latest tenant-scoped backend events</div>
        </div>
        <button className="ghost" onClick={load} disabled={loading}>
          Refresh
        </button>
      </div>

      {err && <div className="err">{err}</div>}

      <div className="panel event-table-panel">
        {loading ? (
          <div className="muted">Loading events...</div>
        ) : latest.length === 0 ? (
          <div className="muted">No events recorded yet.</div>
        ) : (
          <table className="event-table">
            <thead>
              <tr>
                <th>Snapshot</th>
                <th>Type</th>
                <th>Feature</th>
                <th>Camera</th>
                <th>Person/Object</th>
                <th>Confidence</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {latest.map((event) => (
                <tr key={event.id} onClick={() => openEvent(event)}>
                  <td><SnapshotThumb event={event} /></td>
                  <td>{pretty(event.event_type)}</td>
                  <td>{pretty(event.feature_type)}</td>
                  <td>{event.camera_name || event.camera_id || "—"}</td>
                  <td>{event.person_name || event.object_label || event.label || "—"}</td>
                  <td>{fmtScore(event.confidence ?? event.score)}</td>
                  <td>{fmtTime(event.ts)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <DetailsModal event={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
