import { useEffect, useState } from "react";
import { getJson, postJson, postForm, del } from "../api.js";

const EMPTY = { external_key: "", name: "", role: "", details: "" };

export default function People() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function load() {
    setErr("");
    try {
      setRows(await getJson("/people"));
    } catch (e) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function add() {
    if (!form.external_key.trim() || !form.name.trim()) return;
    try {
      await postJson("/people", {
        external_key: form.external_key.trim(),
        name: form.name.trim(),
        role: form.role.trim() || null,
        details: form.details.trim() || null,
      });
      setForm(EMPTY);
      load();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function upload(key, file) {
    if (!file) return;
    try {
      const fd = new FormData();
      fd.append("file", file);
      await postForm(`/people/${key}/images`, fd);
      setMsg(`Uploaded image for ${key}. Rebuild the gallery to apply.`);
    } catch (e) {
      setErr(e.message);
    }
  }

  async function rebuild() {
    setMsg("Rebuilding gallery…");
    try {
      const r = await postJson("/people/gallery/rebuild");
      setMsg(`Gallery rebuilt: ${r.people_enrolled} people enrolled.`);
    } catch (e) {
      setErr(e.message);
      setMsg("");
    }
  }

  async function remove(key) {
    try {
      await del("/people/" + key);
      load();
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <section className="panel">
      <h2>People</h2>
      <div className="grid2">
        <input
          placeholder="Key (folder slug, e.g. alice)"
          value={form.external_key}
          onChange={update("external_key")}
        />
        <input placeholder="Full name" value={form.name} onChange={update("name")} />
        <input placeholder="Role (optional)" value={form.role} onChange={update("role")} />
        <input placeholder="Details (optional)" value={form.details} onChange={update("details")} />
      </div>
      <div className="row toolbar">
        <button onClick={add}>Add person</button>
        <button className="ghost" onClick={rebuild}>
          Rebuild gallery
        </button>
        <span className="muted">{msg}</span>
      </div>
      {err && <p className="err">{err}</p>}
      <table>
        <thead>
          <tr>
            <th>Key</th>
            <th>Name</th>
            <th>Role</th>
            <th>Enroll image</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td>{p.external_key}</td>
              <td>{p.name}</td>
              <td>{p.role || ""}</td>
              <td>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => upload(p.external_key, e.target.files[0])}
                />
              </td>
              <td>
                <button className="danger" onClick={() => remove(p.external_key)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && !err && <p className="muted">No people enrolled yet.</p>}
    </section>
  );
}
