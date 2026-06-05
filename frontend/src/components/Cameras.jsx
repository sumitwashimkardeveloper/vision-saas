import { useEffect, useState } from "react";
import { getJson, postJson, del } from "../api.js";

export default function Cameras() {
  const [rows, setRows] = useState([]);
  const [name, setName] = useState("");
  const [rtsp, setRtsp] = useState("");
  const [err, setErr] = useState("");

  async function load() {
    setErr("");
    try {
      setRows(await getJson("/cameras"));
    } catch (e) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function add() {
    if (!name.trim() || !rtsp.trim()) return;
    try {
      await postJson("/cameras", { name: name.trim(), rtsp_url: rtsp.trim(), enabled: true });
      setName("");
      setRtsp("");
      load();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function remove(id) {
    try {
      await del("/cameras/" + id);
      load();
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <section className="panel">
      <h2>Cameras</h2>
      <div className="row toolbar">
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input
          placeholder="rtsp://..."
          value={rtsp}
          onChange={(e) => setRtsp(e.target.value)}
          style={{ flex: 1, minWidth: 240 }}
        />
        <button onClick={add}>Add / update</button>
      </div>
      {err && <p className="err">{err}</p>}
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>RTSP URL</th>
            <th>Enabled</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id}>
              <td>{c.id}</td>
              <td>{c.name}</td>
              <td className="muted">{c.rtsp_url}</td>
              <td>{String(c.enabled)}</td>
              <td>
                <button className="danger" onClick={() => remove(c.id)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && !err && <p className="muted">No cameras yet.</p>}
    </section>
  );
}
