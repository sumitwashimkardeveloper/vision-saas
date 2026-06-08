import { useEffect, useState, useCallback } from "react";
import { getJson, getBlob, del, postJson } from "../../api/client.js";
import AddPersonModal from "./AddPersonModal.jsx";

function parseDetails(raw) {
  try { return JSON.parse(raw || "{}"); } catch { return {}; }
}

function Thumb({ personKey, version }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let cancelled = false;
    let objUrl = "";
    getBlob(`/people/${personKey}/image`)
      .then(blob => { if (cancelled) return; objUrl = URL.createObjectURL(blob); setUrl(objUrl); })
      .catch(() => { if (!cancelled) setUrl(""); });
    return () => { cancelled = true; if (objUrl) URL.revokeObjectURL(objUrl); };
  }, [personKey, version]);

  return url
    ? <img className="thumb" src={url} alt={personKey} />
    : <span className="thumb thumb-empty" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>👤</span>;
}

function StatCard({ label, value, color }) {
  return (
    <div className="panel" style={{ margin: 0, textAlign: "center", minWidth: 120 }}>
      <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 700, color: color || "var(--fg)" }}>{value}</div>
    </div>
  );
}

const GENDER_LABEL = { male: "Male", female: "Female", other: "Other" };
const GENDER_COLOR = { male: "#4f8cff", female: "#f472b6", other: "#a78bfa" };

export default function PeoplePage() {
  const [people,     setPeople]     = useState([]);
  const [showModal,  setShowModal]  = useState(false);
  const [imgVersion, setImgVersion] = useState(0);
  const [err,        setErr]        = useState("");

  const load = useCallback(async () => {
    setErr("");
    try { setPeople(await getJson("/people")); }
    catch (ex) { setErr(ex.message); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function remove(key) {
    if (!confirm("Delete this person? This cannot be undone.")) return;
    try {
      await del("/people/" + key);
      await postJson("/people/gallery/rebuild");
      load();
    } catch (ex) { setErr(ex.message); }
  }

  function onAdded() {
    setImgVersion(v => v + 1);
    load();
  }

  // Compute stats
  const total  = people.length;
  const counts = { male: 0, female: 0, other: 0 };
  for (const p of people) {
    const g = parseDetails(p.details).gender || "other";
    counts[g in counts ? g : "other"]++;
  }

  const existingKeys = people.map(p => p.external_key);

  return (
    <div>
      {/* Stat cards */}
      <div style={{ display: "flex", gap: 14, marginBottom: 20, flexWrap: "wrap" }}>
        <StatCard label="Total People" value={total} />
        <StatCard label="Male"   value={counts.male}   color={GENDER_COLOR.male} />
        <StatCard label="Female" value={counts.female} color={GENDER_COLOR.female} />
        <StatCard label="Other"  value={counts.other}  color={GENDER_COLOR.other} />
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>Enrolled People</span>
        <button onClick={() => setShowModal(true)} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          + Add Person
        </button>
      </div>

      {err && <p className="err">{err}</p>}

      {/* People table */}
      <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
        {people.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
            No people enrolled yet. Click <strong>Add Person</strong> to enroll someone.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Photo</th>
                <th>Name</th>
                <th>Gender</th>
                <th>Email</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {people.map(p => {
                const d = parseDetails(p.details);
                const g = d.gender || "other";
                return (
                  <tr key={p.id}>
                    <td><Thumb personKey={p.external_key} version={imgVersion} /></td>
                    <td style={{ fontWeight: 500 }}>{p.name}</td>
                    <td>
                      <span className="tag" style={{ color: GENDER_COLOR[g] || "var(--muted)", background: "transparent", border: `1px solid ${GENDER_COLOR[g] || "var(--line)"}` }}>
                        {GENDER_LABEL[g] || g}
                      </span>
                    </td>
                    <td style={{ color: "var(--muted)", fontSize: 12 }}>{d.email || "—"}</td>
                    <td>
                      <button className="danger" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => remove(p.external_key)}>
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
          existingKeys={existingKeys}
        />
      )}
    </div>
  );
}
