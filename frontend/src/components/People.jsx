import { useEffect, useRef, useState } from "react";
import { getJson, getBlob, postJson, postForm, putForm, del } from "../api.js";

const EMPTY = { first: "", last: "", role: "" };

// Thumbnail for an enrolled person. Images are behind auth, so we fetch them as
// a blob (sending the bearer token) and render an object URL. `version` bumps to
// force a refresh after a new image is uploaded.
function Thumb({ personKey, version }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let cancelled = false;
    let objUrl = "";
    getBlob(`/people/${personKey}/image`)
      .then((blob) => {
        if (cancelled) return;
        objUrl = URL.createObjectURL(blob);
        setUrl(objUrl);
      })
      .catch(() => {
        if (!cancelled) setUrl("");
      });
    return () => {
      cancelled = true;
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
  }, [personKey, version]);

  return url ? (
    <img className="thumb" src={url} alt={personKey} />
  ) : (
    <span className="thumb thumb-empty">—</span>
  );
}

// Turn a display name into a filesystem-safe folder key, e.g. "John Doe" -> "john_doe".
function slugify(s) {
  return (
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "person"
  );
}

export default function People() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  // Bumped whenever an image changes so <Thumb> re-fetches.
  const [imgVersion, setImgVersion] = useState(0);
  const fileRef = useRef(null);

  // Live preview of the picked file before it's uploaded.
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const objUrl = URL.createObjectURL(file);
    setPreview(objUrl);
    return () => URL.revokeObjectURL(objUrl);
  }, [file]);

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

  // Pick a key that doesn't collide with an existing person.
  function uniqueKey(base) {
    const taken = new Set(rows.map((r) => r.external_key));
    if (!taken.has(base)) return base;
    let i = 2;
    while (taken.has(`${base}_${i}`)) i++;
    return `${base}_${i}`;
  }

  function resetForm() {
    setForm(EMPTY);
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  // One action: create the person, upload their face image, and rebuild the
  // gallery so they're immediately usable for recognition.
  async function add() {
    setErr("");
    setMsg("");
    if (!form.first.trim()) return setErr("First name is required");
    if (!form.last.trim()) return setErr("Last name is required");
    if (!file) return setErr("Please choose a face image");

    const fullName = `${form.first.trim()} ${form.last.trim()}`;
    const key = uniqueKey(slugify(fullName));
    setBusy(true);
    try {
      setMsg("Saving person…");
      await postJson("/people", {
        external_key: key,
        name: fullName,
        role: form.role.trim() || null,
        details: null,
      });

      setMsg("Uploading image…");
      const fd = new FormData();
      fd.append("file", file);
      await postForm(`/people/${key}/images`, fd);

      setMsg("Enrolling for face recognition…");
      const r = await postJson("/people/gallery/rebuild");

      setMsg(`${fullName} saved and enrolled (${r.people_enrolled} in gallery).`);
      resetForm();
      setImgVersion((v) => v + 1);
      load();
    } catch (e) {
      setErr(e.message);
      setMsg("");
    } finally {
      setBusy(false);
    }
  }

  // Replace an existing person's face image and re-enroll them.
  async function replaceImage(key, f) {
    if (!f) return;
    setErr("");
    setMsg("");
    setBusy(true);
    try {
      setMsg("Updating image…");
      const fd = new FormData();
      fd.append("file", f);
      await putForm(`/people/${key}/image`, fd);

      setMsg("Re-enrolling for face recognition…");
      await postJson("/people/gallery/rebuild");

      setImgVersion((v) => v + 1);
      setMsg(`Updated image for ${key}.`);
    } catch (e) {
      setErr(e.message);
      setMsg("");
    } finally {
      setBusy(false);
    }
  }

  async function rebuild() {
    setErr("");
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
    setErr("");
    try {
      await del("/people/" + key);
      load();
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <section className="panel">
      <h2>Add person</h2>
      <div className="grid2">
        <input placeholder="First name" value={form.first} onChange={update("first")} />
        <input placeholder="Last name" value={form.last} onChange={update("last")} />
        <input placeholder="Role (optional)" value={form.role} onChange={update("role")} />
        <div className="filepick">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files[0] || null)}
          />
          {preview && <img className="thumb" src={preview} alt="preview" />}
        </div>
      </div>
      <div className="row toolbar">
        <button onClick={add} disabled={busy}>
          {busy ? "Saving…" : "Add person"}
        </button>
        <button className="ghost" onClick={rebuild} disabled={busy}>
          Rebuild gallery
        </button>
        <span className="muted">{msg}</span>
      </div>
      {err && <p className="err">{err}</p>}

      <table>
        <thead>
          <tr>
            <th>Photo</th>
            <th>Name</th>
            <th>Role</th>
            <th>Update image</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td>
                <Thumb personKey={p.external_key} version={imgVersion} />
              </td>
              <td>{p.name}</td>
              <td>{p.role || ""}</td>
              <td>
                <input
                  type="file"
                  accept="image/*"
                  disabled={busy}
                  onChange={(e) => {
                    replaceImage(p.external_key, e.target.files[0]);
                    e.target.value = ""; // allow re-selecting the same file later
                  }}
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
