import { useEffect, useState } from "react";
import { getJson, getBlob } from "../api.js";

const EMPTY = { label: "", camera_id: "", since: "", until: "" };

function buildQuery(filters, extra = {}) {
  const p = new URLSearchParams();
  if (filters.label) p.set("label", filters.label);
  if (filters.camera_id) p.set("camera_id", filters.camera_id);
  if (filters.since) p.set("since", filters.since);
  if (filters.until) p.set("until", filters.until);
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  return p;
}

export default function Events() {
  const [filters, setFilters] = useState(EMPTY);
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState("");

  async function load(active = filters) {
    setErr("");
    try {
      setRows(await getJson("/events?" + buildQuery(active, { limit: 200 }).toString()));
    } catch (e) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clear() {
    setFilters(EMPTY);
    load(EMPTY);
  }

  async function exportCsv() {
    try {
      const blob = await getBlob("/events/export.csv?" + buildQuery(filters).toString());
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "events.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr(e.message);
    }
  }

  const update = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }));

  return (
    <section className="panel">
      <h2>Event timeline</h2>
      <div className="row toolbar">
        <input placeholder="Search name/label" value={filters.label} onChange={update("label")} />
        <input
          type="number"
          placeholder="Camera ID"
          value={filters.camera_id}
          onChange={update("camera_id")}
          style={{ width: 120 }}
        />
        <input type="datetime-local" value={filters.since} onChange={update("since")} />
        <input type="datetime-local" value={filters.until} onChange={update("until")} />
        <button onClick={() => load()}>Search</button>
        <button className="ghost" onClick={clear}>
          Clear
        </button>
        <button className="ghost" onClick={exportCsv}>
          Export CSV
        </button>
      </div>
      {err && <p className="err">{err}</p>}
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Label</th>
            <th>Score</th>
            <th>Camera</th>
            <th>Snapshot</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id}>
              <td>{new Date(e.ts).toLocaleString()}</td>
              <td>
                <span className="tag">{e.label}</span>
              </td>
              <td>{e.score.toFixed(3)}</td>
              <td>{e.camera_id ?? ""}</td>
              <td className="muted">{e.snapshot_path || ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && !err && <p className="muted">No events.</p>}
    </section>
  );
}
