import { useState, useEffect, useCallback, useRef } from "react";
import { getJson } from "../../api/client.js";
import { getEvents } from "../../api/events.js";
import { getCameras } from "../../api/cameras.js";

// ─── constants ────────────────────────────────────────────────────────────────

const PPE_TYPES = [
  { key: "hard_hat",       label: "Hard Hat",       emoji: "⛑️" },
  { key: "safety_vest",    label: "Safety Vest",    emoji: "🦺" },
  { key: "safety_gloves",  label: "Safety Gloves",  emoji: "🧤" },
  { key: "safety_goggles", label: "Safety Goggles", emoji: "🥽" },
  { key: "safety_boots",   label: "Safety Boots",   emoji: "🥾" },
];

const SEVERITY_COLOR = {
  low:      "var(--success)",
  medium:   "var(--warning)",
  high:     "var(--danger)",
  critical: "#7c3aed",
};

const STATUS_COLOR = {
  open:         "var(--danger)",
  under_review: "var(--warning)",
  closed:       "var(--success)",
};

const INCIDENT_TYPES = [
  { key: "near_miss",       label: "Near Miss" },
  { key: "injury",          label: "Injury / First Aid" },
  { key: "ppe_escalation",  label: "PPE Escalation" },
  { key: "property_damage", label: "Property Damage" },
  { key: "fire_safety",     label: "Fire Safety" },
];

// ─── localStorage ─────────────────────────────────────────────────────────────

const ZONES_KEY     = "vfr_zones";
const INCIDENTS_KEY = "vfr_incidents";

function loadZones()      { try { return JSON.parse(localStorage.getItem(ZONES_KEY)     || "[]"); } catch { return []; } }
function saveZones(v)     { localStorage.setItem(ZONES_KEY, JSON.stringify(v)); }
function loadIncidents()  { try { return JSON.parse(localStorage.getItem(INCIDENTS_KEY) || "[]"); } catch { return []; } }
function saveIncidents(v) { localStorage.setItem(INCIDENTS_KEY, JSON.stringify(v)); }

// ─── helpers ─────────────────────────────────────────────────────────────────

function todaySince() { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); }
function weekSince()  { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString(); }
function dayKey(iso)  { return new Date(iso).toISOString().slice(0, 10); }

function fmtDateTime(iso) {
  if (!iso) return "—";
  try { return new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" }).format(new Date(iso)); }
  catch { return "—"; }
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso);
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function last7Days() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i)); d.setHours(0, 0, 0, 0); return d;
  });
}

// ─── shared UI ───────────────────────────────────────────────────────────────

function StatCard({ label, value, color, icon, sub }) {
  return (
    <div className="panel" style={{ margin: 0, display: "flex", alignItems: "center", gap: 14, padding: "16px 20px" }}>
      <span style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: color ? `${color}1a` : "var(--accent-soft)", color: color || "var(--accent)", fontSize: 22 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1, color: color || "var(--fg)" }}>{value}</div>
        {sub && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

function PageTabs({ tabs, active, onChange }) {
  return (
    <div style={{ display: "flex", borderBottom: "2px solid var(--line)", marginBottom: 22 }}>
      {tabs.map(t => (
        <button key={t.key} onClick={() => onChange(t.key)} style={{
          background: "transparent", border: 0,
          borderBottom: active === t.key ? "2px solid var(--accent)" : "2px solid transparent",
          marginBottom: -2, padding: "10px 20px",
          fontSize: 14, fontWeight: active === t.key ? 600 : 400,
          color: active === t.key ? "var(--accent)" : "var(--muted)",
          cursor: "pointer", transition: "color 0.15s", whiteSpace: "nowrap",
        }}>{t.label}</button>
      ))}
    </div>
  );
}

function EmptyState({ icon, title, message }) {
  return (
    <div style={{ padding: "52px 24px", textAlign: "center" }}>
      <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.35 }}>{icon}</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: "var(--fg)", marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 14, color: "var(--muted)", maxWidth: 380, margin: "0 auto" }}>{message}</div>
    </div>
  );
}

function Badge({ label, color }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 999, border: `1px solid ${color}`, color, textTransform: "capitalize", whiteSpace: "nowrap" }}>
      {label.replace(/_/g, " ")}
    </span>
  );
}

// ─── ComplianceTab ────────────────────────────────────────────────────────────

function TrendChart({ events }) {
  const days = last7Days();
  const countsByDay = {};
  for (const e of events) countsByDay[dayKey(e.ts)] = (countsByDay[dayKey(e.ts)] || 0) + 1;
  const max     = Math.max(...days.map(d => countsByDay[dayKey(d.toISOString())] || 0), 1);
  const todayDk = dayKey(new Date().toISOString());

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 80, padding: "0 2px" }}>
      {days.map(d => {
        const k   = dayKey(d.toISOString());
        const val = countsByDay[k] || 0;
        const h   = Math.max(4, (val / max) * 62);
        const isToday = k === todayDk;
        return (
          <div key={k} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <span style={{ fontSize: 9, color: isToday ? "var(--danger)" : "var(--muted)", minHeight: 11 }}>{val > 0 ? val : ""}</span>
            <div style={{ width: "100%", height: h, background: isToday ? "var(--danger)" : "var(--accent-soft)", borderRadius: "3px 3px 0 0", minHeight: 4 }} />
            <span style={{ fontSize: 9, color: "var(--muted)" }}>{d.toLocaleDateString(undefined, { weekday: "short" })}</span>
          </div>
        );
      })}
    </div>
  );
}

function ComplianceTab({ weekEvents, todayEvents, checksToday }) {
  const ppeToday = todayEvents.filter(e => e.event_type === "ppe_violation");
  const ppeWeek  = weekEvents.filter(e => e.event_type === "ppe_violation");

  const compRate = checksToday > 0
    ? Math.max(0, Math.round((1 - ppeToday.length / checksToday) * 100))
    : null;

  const todayByType = {}, weekByType = {};
  for (const e of ppeToday) todayByType[e.feature_type] = (todayByType[e.feature_type] || 0) + 1;
  for (const e of ppeWeek)  weekByType[e.feature_type]  = (weekByType[e.feature_type]  || 0) + 1;

  const cameraMap = {};
  for (const e of todayEvents.filter(e => e.event_type === "face_recognition")) {
    if (!cameraMap[e.camera_id]) cameraMap[e.camera_id] = { name: e.camera_name || e.camera_id, checks: 0, violations: 0 };
    cameraMap[e.camera_id].checks++;
  }
  for (const e of ppeToday) {
    if (!cameraMap[e.camera_id]) cameraMap[e.camera_id] = { name: e.camera_name || e.camera_id, checks: 0, violations: 0 };
    cameraMap[e.camera_id].violations++;
  }
  const cameraRows      = Object.values(cameraMap).sort((a, b) => b.violations - a.violations);
  const camerasAffected = cameraRows.filter(c => c.violations > 0).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))", gap: 12 }}>
        <StatCard label="Violations Today"  value={ppeToday.length}  color="var(--danger)"  icon="⚠️" />
        <StatCard label="This Week"         value={ppeWeek.length}   color="var(--warning)" icon="📅" />
        <StatCard
          label="Compliance Rate"
          value={compRate != null ? `${compRate}%` : "—"}
          color={compRate == null ? "var(--muted)" : compRate >= 90 ? "var(--success)" : compRate >= 75 ? "var(--warning)" : "var(--danger)"}
          icon="✅"
          sub={compRate != null ? `${checksToday} worker checks today` : "No check data yet"}
        />
        <StatCard label="Cameras Affected" value={camerasAffected}  color="var(--muted)"   icon="📷" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div className="panel" style={{ margin: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>PPE Breakdown</div>
          <table>
            <thead><tr><th>Type</th><th>Today</th><th>This Week</th></tr></thead>
            <tbody>
              {PPE_TYPES.map(p => (
                <tr key={p.key}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 16 }}>{p.emoji}</span>
                      <span style={{ fontSize: 13 }}>{p.label}</span>
                    </div>
                  </td>
                  <td style={{ fontWeight: todayByType[p.key] ? 700 : 400, color: todayByType[p.key] ? "var(--danger)" : "var(--muted)", fontSize: 14 }}>
                    {todayByType[p.key] || 0}
                  </td>
                  <td style={{ color: weekByType[p.key] ? "var(--fg)" : "var(--muted)", fontSize: 14 }}>
                    {weekByType[p.key] || 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel" style={{ margin: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>7-Day Violation Trend</div>
          {ppeWeek.length === 0 ? (
            <div style={{ color: "var(--muted)", fontSize: 13, paddingTop: 8 }}>No violations recorded in the last 7 days.</div>
          ) : (
            <TrendChart events={ppeWeek} />
          )}
        </div>
      </div>

      {cameraRows.length > 0 && (
        <div className="panel" style={{ margin: 0, padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "14px 16px 10px", fontSize: 14, fontWeight: 700 }}>Camera Compliance — Today</div>
          <table>
            <thead><tr><th>Camera</th><th>Checks</th><th>Violations</th><th>Compliance</th></tr></thead>
            <tbody>
              {cameraRows.map((c, i) => {
                const rate = c.checks > 0 ? Math.round((1 - c.violations / c.checks) * 100) : null;
                const rc   = rate == null ? "var(--muted)" : rate >= 90 ? "var(--success)" : rate >= 75 ? "var(--warning)" : "var(--danger)";
                return (
                  <tr key={i}>
                    <td style={{ fontWeight: 500, fontSize: 13 }}>{c.name}</td>
                    <td style={{ fontSize: 13, color: "var(--muted)" }}>{c.checks}</td>
                    <td style={{ fontSize: 13, fontWeight: c.violations ? 700 : 400, color: c.violations ? "var(--danger)" : "var(--muted)" }}>{c.violations}</td>
                    <td><span style={{ fontSize: 13, fontWeight: 700, color: rc }}>{rate != null ? `${rate}%` : "—"}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {ppeToday.length === 0 && ppeWeek.length === 0 && (
        <div className="panel">
          <EmptyState icon="✅" title="No PPE violations recorded" message="Violations appear here once cameras detect missing protective equipment. Enable PPE detection features on your cameras to start monitoring." />
        </div>
      )}
    </div>
  );
}

// ─── ZonesTab ─────────────────────────────────────────────────────────────────

const ALL_PERSON_CATS = ["general", "staff", "vip", "security_staff", "management"];

function ZoneModal({ cameras, existing, onSave, onClose }) {
  const [name,        setName]        = useState(existing?.name || "");
  const [cameraId,    setCameraId]    = useState(existing?.cameraId || cameras[0]?.id || "");
  const [ppeRequired, setPpeRequired] = useState(new Set(existing?.ppeRequired || []));
  const [accessCats,  setAccessCats]  = useState(new Set(existing?.accessCategories || ["staff"]));
  const [err,         setErr]         = useState("");

  function toggleSet(setter, k) {
    setter(prev => { const s = new Set(prev); s.has(k) ? s.delete(k) : s.add(k); return s; });
  }

  function submit(e) {
    e.preventDefault();
    if (!name.trim()) { setErr("Zone name is required"); return; }
    const cam = cameras.find(c => c.id === cameraId);
    onSave({
      id:                existing?.id || `z_${Date.now()}`,
      name:              name.trim(),
      cameraId,
      cameraName:        cam?.name || cameraId,
      ppeRequired:       [...ppeRequired],
      accessCategories:  [...accessCats],
      createdAt:         existing?.createdAt || new Date().toISOString(),
    });
  }

  const checkStyle = (active) => ({
    display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13,
    padding: "5px 10px", borderRadius: 8,
    border: `1px solid ${active ? "var(--accent)" : "var(--line)"}`,
    background: active ? "var(--accent-soft)" : "transparent",
  });

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <div className="modal-title">{existing ? "Edit Zone" : "Add Zone"}</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form className="modal-body" onSubmit={submit}>
          <div className="modal-row-2">
            <div className="modal-field">
              <label>Zone Name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Welding Bay" autoFocus />
            </div>
            <div className="modal-field">
              <label>Camera</label>
              <select value={cameraId} onChange={e => setCameraId(e.target.value)}>
                {cameras.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                {cameras.length === 0 && <option value="">No cameras added yet</option>}
              </select>
            </div>
          </div>

          <div className="modal-field">
            <label>Required PPE in this zone</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
              {PPE_TYPES.map(p => (
                <label key={p.key} style={checkStyle(ppeRequired.has(p.key))}>
                  <input type="checkbox" checked={ppeRequired.has(p.key)} onChange={() => toggleSet(setPpeRequired, p.key)} style={{ accentColor: "var(--accent)" }} />
                  {p.emoji} {p.label}
                </label>
              ))}
            </div>
          </div>

          <div className="modal-field">
            <label>Authorised person categories</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
              {ALL_PERSON_CATS.map(c => (
                <label key={c} style={checkStyle(accessCats.has(c))}>
                  <input type="checkbox" checked={accessCats.has(c)} onChange={() => toggleSet(setAccessCats, c)} style={{ accentColor: "var(--accent)" }} />
                  {c.replace(/_/g, " ")}
                </label>
              ))}
            </div>
          </div>

          {err && <div className="err">{err}</div>}
          <div className="modal-actions">
            <button type="submit">{existing ? "Save Changes" : "Add Zone"}</button>
            <button type="button" className="ghost" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ZonesTab({ cameras }) {
  const [zones,     setZones]     = useState(loadZones);
  const [showModal, setShowModal] = useState(false);
  const [editing,   setEditing]   = useState(null);

  function upsertZone(zone) {
    const list = editing ? zones.map(z => z.id === zone.id ? zone : z) : [zone, ...zones];
    setZones(list); saveZones(list); setShowModal(false); setEditing(null);
  }

  function deleteZone(id) {
    if (!confirm("Delete this zone?")) return;
    const list = zones.filter(z => z.id !== id);
    setZones(list); saveZones(list);
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: "var(--muted)" }}>Define camera zones with PPE requirements and access rules per area.</div>
        <button onClick={() => { setEditing(null); setShowModal(true); }} style={{ fontSize: 13, padding: "6px 14px" }}>+ Add Zone</button>
      </div>

      {zones.length === 0 ? (
        <div className="panel">
          <EmptyState icon="📍" title="No zones defined" message="Create zones to assign PPE requirements and access rules to camera views — e.g. Welding Bay, Chemical Store, Loading Dock." />
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
          {zones.map(z => (
            <div key={z.id} className="panel" style={{ margin: 0, borderLeft: "3px solid var(--accent)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{z.name}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>📷 {z.cameraName}</div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="ghost" style={{ fontSize: 12, padding: "3px 9px" }} onClick={() => { setEditing(z); setShowModal(true); }}>Edit</button>
                  <button className="ghost" style={{ fontSize: 12, padding: "3px 9px", color: "var(--danger)" }} onClick={() => deleteZone(z.id)}>Delete</button>
                </div>
              </div>

              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Required PPE</div>
                {z.ppeRequired.length === 0 ? (
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>None specified</span>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {z.ppeRequired.map(k => {
                      const ppe = PPE_TYPES.find(p => p.key === k);
                      return <span key={k} style={{ fontSize: 12, padding: "2px 9px", borderRadius: 999, background: "var(--accent-soft)", color: "var(--accent)" }}>{ppe?.emoji} {ppe?.label}</span>;
                    })}
                  </div>
                )}
              </div>

              <div>
                <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Authorised Access</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {z.accessCategories.map(c => (
                    <span key={c} style={{ fontSize: 12, padding: "2px 8px", borderRadius: 999, background: "rgba(128,128,128,0.1)", color: "var(--fg)" }}>{c.replace(/_/g, " ")}</span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <ZoneModal cameras={cameras} existing={editing} onSave={upsertZone} onClose={() => { setShowModal(false); setEditing(null); }} />
      )}
    </div>
  );
}

// ─── IncidentsTab ─────────────────────────────────────────────────────────────

function IncidentModal({ existing, onSave, onClose }) {
  const [type,       setType]       = useState(existing?.type || "near_miss");
  const [title,      setTitle]      = useState(existing?.title || "");
  const [desc,       setDesc]       = useState(existing?.description || "");
  const [zone,       setZone]       = useState(existing?.zone || "");
  const [severity,   setSeverity]   = useState(existing?.severity || "medium");
  const [status,     setStatus]     = useState(existing?.status || "open");
  const [involved,   setInvolved]   = useState(existing?.involvedNames || "");
  const [corrective, setCorrective] = useState(existing?.correctiveAction || "");
  const [err,        setErr]        = useState("");

  function submit(e) {
    e.preventDefault();
    if (!title.trim()) { setErr("Title is required"); return; }
    onSave({
      id:               existing?.id || `i_${Date.now()}`,
      type,             title: title.trim(),
      description:      desc.trim(),
      zone:             zone.trim(),
      severity,         status,
      involvedNames:    involved.trim(),
      correctiveAction: corrective.trim(),
      reportedAt:       existing?.reportedAt || new Date().toISOString(),
      updatedAt:        new Date().toISOString(),
    });
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <div className="modal-title">{existing ? "Edit Incident" : "Log Incident"}</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form className="modal-body" onSubmit={submit}>
          <div className="modal-row-2">
            <div className="modal-field">
              <label>Type</label>
              <select value={type} onChange={e => setType(e.target.value)}>
                {INCIDENT_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>
            <div className="modal-field">
              <label>Severity</label>
              <select value={severity} onChange={e => setSeverity(e.target.value)}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>
          <div className="modal-field">
            <label>Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Brief description of the incident" autoFocus />
          </div>
          <div className="modal-row-2">
            <div className="modal-field">
              <label>Location / Zone</label>
              <input value={zone} onChange={e => setZone(e.target.value)} placeholder="e.g. Welding Bay" />
            </div>
            <div className="modal-field">
              <label>Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)}>
                <option value="open">Open</option>
                <option value="under_review">Under Review</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          </div>
          <div className="modal-field">
            <label>Persons Involved</label>
            <input value={involved} onChange={e => setInvolved(e.target.value)} placeholder="Names, comma-separated" />
          </div>
          <div className="modal-field">
            <label>Description</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3} placeholder="What happened?" style={{ resize: "vertical" }} />
          </div>
          <div className="modal-field">
            <label>Corrective Action</label>
            <textarea value={corrective} onChange={e => setCorrective(e.target.value)} rows={2} placeholder="What was done or needs to be done?" style={{ resize: "vertical" }} />
          </div>
          {err && <div className="err">{err}</div>}
          <div className="modal-actions">
            <button type="submit">{existing ? "Save Changes" : "Log Incident"}</button>
            <button type="button" className="ghost" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function IncidentsTab() {
  const [incidents,  setIncidents]  = useState(loadIncidents);
  const [showModal,  setShowModal]  = useState(false);
  const [editing,    setEditing]    = useState(null);
  const [filter,     setFilter]     = useState("all");

  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const open        = incidents.filter(i => i.status === "open");
  const underReview = incidents.filter(i => i.status === "under_review");
  const closedMonth = incidents.filter(i => i.status === "closed" && new Date(i.reportedAt) >= monthStart);
  const display     = filter === "all" ? incidents : incidents.filter(i => i.status === filter);

  function upsertIncident(inc) {
    const list = editing ? incidents.map(i => i.id === inc.id ? inc : i) : [inc, ...incidents];
    setIncidents(list); saveIncidents(list); setShowModal(false); setEditing(null);
  }

  function deleteIncident(id) {
    if (!confirm("Delete this incident record?")) return;
    const list = incidents.filter(i => i.id !== id);
    setIncidents(list); saveIncidents(list);
  }

  const FILTER_PILLS = [["all","All"],["open","Open"],["under_review","Under Review"],["closed","Closed"]];

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))", gap: 12, marginBottom: 20 }}>
        <StatCard label="Open"              value={open.length}        color="var(--danger)"  icon="🚨" />
        <StatCard label="Under Review"      value={underReview.length} color="var(--warning)" icon="🔎" />
        <StatCard label="Closed This Month" value={closedMonth.length} color="var(--success)" icon="✅" />
        <StatCard label="Total Logged"      value={incidents.length}   color="var(--muted)"   icon="📋" />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {FILTER_PILLS.map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} style={{ padding: "4px 13px", fontSize: 13, borderRadius: 999, background: filter === k ? "var(--accent)" : "transparent", border: `1px solid ${filter === k ? "var(--accent)" : "var(--line)"}`, color: filter === k ? "#fff" : "var(--muted)", cursor: "pointer" }}>{l}</button>
          ))}
        </div>
        <button onClick={() => { setEditing(null); setShowModal(true); }} style={{ fontSize: 13, padding: "6px 14px", flexShrink: 0 }}>+ Log Incident</button>
      </div>

      {display.length === 0 ? (
        <div className="panel">
          <EmptyState icon="📋" title={filter === "all" ? "No incidents logged" : `No ${filter.replace(/_/g, " ")} incidents`} message="Log near-misses, injuries, PPE escalations, and other safety events here for audit and corrective action tracking." />
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {display.map(inc => {
            const sc   = SEVERITY_COLOR[inc.severity] || "var(--muted)";
            const stc  = STATUS_COLOR[inc.status]     || "var(--muted)";
            const itype = INCIDENT_TYPES.find(t => t.key === inc.type);
            return (
              <div key={inc.id} className="panel" style={{ margin: 0, borderLeft: `3px solid ${sc}`, padding: "14px 16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{inc.title}</span>
                      <Badge label={inc.severity} color={sc} />
                      <Badge label={inc.status}   color={stc} />
                    </div>
                    <div style={{ fontSize: 13, color: "var(--muted)", display: "flex", gap: 14, flexWrap: "wrap" }}>
                      <span>📁 {itype?.label || inc.type}</span>
                      {inc.zone && <span>📍 {inc.zone}</span>}
                      {inc.involvedNames && <span>👤 {inc.involvedNames}</span>}
                      <span>🕐 {timeAgo(inc.reportedAt)}</span>
                    </div>
                    {inc.description && (
                      <div style={{ marginTop: 6, fontSize: 13, color: "var(--fg)", opacity: 0.8 }}>{inc.description}</div>
                    )}
                    {inc.correctiveAction && (
                      <div style={{ marginTop: 6, fontSize: 12, color: "var(--success)", background: "rgba(34,197,94,0.06)", padding: "4px 10px", borderRadius: 6 }}>
                        <strong>Corrective action:</strong> {inc.correctiveAction}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button className="ghost" style={{ fontSize: 12, padding: "3px 9px" }} onClick={() => { setEditing(inc); setShowModal(true); }}>Edit</button>
                    <button className="ghost" style={{ fontSize: 12, padding: "3px 9px", color: "var(--danger)" }} onClick={() => deleteIncident(inc.id)}>Delete</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <IncidentModal existing={editing} onSave={upsertIncident} onClose={() => { setShowModal(false); setEditing(null); }} />
      )}
    </div>
  );
}

// ─── HeadcountTab ─────────────────────────────────────────────────────────────

function HeadcountTab({ people }) {
  const [windowMins,  setWindowMins]  = useState(30);
  const [events,      setEvents]      = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const timerRef = useRef(null);

  const doRefresh = useCallback(async () => {
    setLoading(true);
    const cutoff = new Date(Date.now() - windowMins * 60000).toISOString();
    try {
      const data = await getEvents({ since: cutoff, limit: 500 });
      setEvents(data);
      setLastRefresh(new Date());
    } catch {} finally { setLoading(false); }
  }, [windowMins]);

  useEffect(() => { doRefresh(); }, [doRefresh]);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (autoRefresh) timerRef.current = setInterval(doRefresh, 30000);
    return () => clearInterval(timerRef.current);
  }, [autoRefresh, doRefresh]);

  const confirmedMap = {};
  for (const e of events) {
    if (e.event_type !== "face_recognition" || !e.person_id) continue;
    if (!confirmedMap[e.person_id] || e.ts > confirmedMap[e.person_id].ts) confirmedMap[e.person_id] = e;
  }
  const confirmed     = Object.values(confirmedMap).sort((a, b) => new Date(b.ts) - new Date(a.ts));
  const unknownCount  = events.filter(e => e.event_type === "unknown_face").length;

  return (
    <div>
      <div className="panel" style={{ margin: "0 0 20px", padding: "28px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 20 }}>
          <div style={{ display: "flex", gap: 48 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 6 }}>
                <span style={{ width: 14, height: 14, borderRadius: "50%", background: "var(--success)", animation: "pulse-dot 2s ease-in-out infinite", flexShrink: 0 }} />
                <span style={{ fontSize: 52, fontWeight: 900, lineHeight: 1, color: "var(--success)" }}>{confirmed.length}</span>
              </div>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>Confirmed on premises</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 6 }}>
                <span style={{ width: 14, height: 14, borderRadius: "50%", background: unknownCount > 0 ? "var(--warning)" : "var(--muted)", flexShrink: 0 }} />
                <span style={{ fontSize: 52, fontWeight: 900, lineHeight: 1, color: unknownCount > 0 ? "var(--warning)" : "var(--muted)" }}>{unknownCount}</span>
              </div>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>Unidentified faces</div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-end" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "var(--muted)" }}>Window:</span>
              <select value={windowMins} onChange={e => setWindowMins(Number(e.target.value))} style={{ fontSize: 13 }}>
                <option value={15}>15 min</option>
                <option value={30}>30 min</option>
                <option value={60}>1 hour</option>
                <option value={120}>2 hours</option>
              </select>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={doRefresh} disabled={loading} style={{ fontSize: 13, padding: "5px 14px" }}>
                {loading ? "…" : "↻ Refresh"}
              </button>
              <button onClick={() => setAutoRefresh(a => !a)} className={autoRefresh ? "" : "ghost"} style={{ fontSize: 13, padding: "5px 14px" }}>
                {autoRefresh ? "⏸ Auto On" : "▶ Auto Off"}
              </button>
            </div>
            {lastRefresh && (
              <div style={{ fontSize: 11, color: "var(--muted)" }}>Updated {timeAgo(lastRefresh.toISOString())}</div>
            )}
          </div>
        </div>
      </div>

      {confirmed.length === 0 ? (
        <div className="panel">
          <EmptyState icon="👥" title="No one confirmed on premises" message={`No face recognitions in the last ${windowMins} minutes. Expand the window or trigger a manual refresh.`} />
        </div>
      ) : (
        <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Last Seen</th>
                <th>Camera</th>
              </tr>
            </thead>
            <tbody>
              {confirmed.map(e => {
                const person = people.find(p => p.id === e.person_id);
                return (
                  <tr key={e.person_id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--success)", flexShrink: 0, animation: "pulse-dot 2s ease-in-out infinite" }} />
                        <span style={{ fontWeight: 500 }}>{person?.name || e.person_name || `ID #${e.person_id}`}</span>
                      </div>
                    </td>
                    <td><span className="tag" style={{ fontSize: 12 }}>{person?.category || "general"}</span></td>
                    <td style={{ fontSize: 13, color: "var(--muted)" }}>{timeAgo(e.ts)}</td>
                    <td style={{ fontSize: 13, color: "var(--muted)" }}>{e.camera_name || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── ReportsTab ───────────────────────────────────────────────────────────────

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function ReportsTab() {
  const now    = new Date();
  const [year,    setYear]    = useState(now.getFullYear());
  const [month,   setMonth]   = useState(now.getMonth() + 1);
  const [events,  setEvents]  = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const since = new Date(year, month - 1, 1).toISOString();
    const until = new Date(year, month, 0, 23, 59, 59).toISOString();
    getEvents({ since, until, limit: 5000 })
      .then(setEvents)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [year, month]);

  const ppeEvents     = events.filter(e => e.event_type === "ppe_violation");
  const faceEvents    = events.filter(e => e.event_type === "face_recognition");
  const unknownEvents = events.filter(e => e.event_type === "unknown_face");
  const totalChecks     = faceEvents.length;
  const totalViolations = ppeEvents.length;
  const compRate = totalChecks > 0 ? Math.max(0, Math.round((1 - totalViolations / totalChecks) * 100)) : null;

  const cameraData = {};
  for (const e of faceEvents) {
    if (!cameraData[e.camera_id]) cameraData[e.camera_id] = { name: e.camera_name || e.camera_id, checks: 0, violations: 0 };
    cameraData[e.camera_id].checks++;
  }
  for (const e of ppeEvents) {
    if (!cameraData[e.camera_id]) cameraData[e.camera_id] = { name: e.camera_name || e.camera_id, checks: 0, violations: 0 };
    cameraData[e.camera_id].violations++;
  }

  const ppeByType = {};
  for (const e of ppeEvents) ppeByType[e.feature_type] = (ppeByType[e.feature_type] || 0) + 1;

  const rcColor = r => r == null ? "var(--muted)" : r >= 90 ? "var(--success)" : r >= 75 ? "var(--warning)" : "var(--danger)";

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <select value={month} onChange={e => setMonth(Number(e.target.value))} style={{ fontSize: 13 }}>
          {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <select value={year} onChange={e => setYear(Number(e.target.value))} style={{ fontSize: 13 }}>
          {[now.getFullYear(), now.getFullYear() - 1].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <button className="ghost" style={{ fontSize: 13, padding: "5px 14px" }} onClick={() => window.print()}>
          🖨️ Print Report
        </button>
        {loading && <span style={{ fontSize: 13, color: "var(--muted)" }}>Loading…</span>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))", gap: 12, marginBottom: 20 }}>
        <StatCard label="Worker Checks"    value={totalChecks}      color="var(--accent)"  icon="👁️" />
        <StatCard label="PPE Violations"   value={totalViolations}  color="var(--danger)"  icon="⚠️" />
        <StatCard
          label="Compliance Rate"
          value={compRate != null ? `${compRate}%` : "—"}
          color={rcColor(compRate)}
          icon="✅"
        />
        <StatCard label="Unknown Entries"  value={unknownEvents.length} color="var(--warning)" icon="❓" />
      </div>

      {events.length === 0 && !loading ? (
        <div className="panel">
          <EmptyState icon="📊" title={`No data for ${MONTH_NAMES[month - 1]} ${year}`} message="No safety events recorded in this period." />
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div className="panel" style={{ margin: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Violations by PPE Type</div>
            {ppeEvents.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--muted)" }}>No violations for {MONTH_NAMES[month - 1]} {year}.</div>
            ) : (
              <table>
                <thead><tr><th>PPE Type</th><th>Violations</th><th>Share</th></tr></thead>
                <tbody>
                  {PPE_TYPES.filter(p => ppeByType[p.key]).sort((a, b) => (ppeByType[b.key] || 0) - (ppeByType[a.key] || 0)).map(p => (
                    <tr key={p.key}>
                      <td>{p.emoji} {p.label}</td>
                      <td style={{ fontWeight: 700, color: "var(--danger)" }}>{ppeByType[p.key]}</td>
                      <td style={{ color: "var(--muted)" }}>{Math.round((ppeByType[p.key] / totalViolations) * 100)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="panel" style={{ margin: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Camera Compliance</div>
            {Object.keys(cameraData).length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--muted)" }}>No camera data for {MONTH_NAMES[month - 1]} {year}.</div>
            ) : (
              <table>
                <thead><tr><th>Camera</th><th>Checks</th><th>Violations</th><th>Rate</th></tr></thead>
                <tbody>
                  {Object.values(cameraData).sort((a, b) => b.violations - a.violations).map((c, i) => {
                    const rate = c.checks > 0 ? Math.round((1 - c.violations / c.checks) * 100) : null;
                    return (
                      <tr key={i}>
                        <td style={{ fontSize: 13 }}>{c.name}</td>
                        <td style={{ fontSize: 13, color: "var(--muted)" }}>{c.checks}</td>
                        <td style={{ fontSize: 13, color: c.violations ? "var(--danger)" : "var(--muted)" }}>{c.violations}</td>
                        <td style={{ fontWeight: 700, color: rcColor(rate) }}>{rate != null ? `${rate}%` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SafetyPage() {
  const [tab,          setTab]         = useState("compliance");
  const [people,       setPeople]      = useState([]);
  const [cameras,      setCameras]     = useState([]);
  const [todayEvents,  setTodayEvents] = useState([]);
  const [weekEvents,   setWeekEvents]  = useState([]);
  const [checksToday,  setChecksToday] = useState(0);
  const [loading,      setLoading]     = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [ppl, cams, today, week] = await Promise.all([
        getJson("/people"),
        getCameras(),
        getEvents({ since: todaySince(), limit: 1000 }),
        getEvents({ since: weekSince(),  limit: 3000 }),
      ]);
      setPeople(ppl);
      setCameras(cams);
      setTodayEvents(today);
      setWeekEvents(week);
      setChecksToday(today.filter(e => e.event_type === "face_recognition").length);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const TABS = [
    { key: "compliance", label: "Compliance"  },
    { key: "zones",      label: "Zones"        },
    { key: "incidents",  label: "Incidents"    },
    { key: "headcount",  label: "Headcount"    },
    { key: "reports",    label: "Reports"      },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "clamp(17px,1.45vw,22px)", fontWeight: 700 }}>Safety</h1>
          <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 3 }}>PPE compliance, zone rules, incident management, and emergency headcount</div>
        </div>
        <button className="ghost" onClick={reload} disabled={loading} style={{ fontSize: 13, padding: "6px 14px" }}>↻ Refresh</button>
      </div>

      <PageTabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === "compliance" && <ComplianceTab weekEvents={weekEvents} todayEvents={todayEvents} checksToday={checksToday} />}
      {tab === "zones"      && <ZonesTab cameras={cameras} />}
      {tab === "incidents"  && <IncidentsTab />}
      {tab === "headcount"  && <HeadcountTab people={people} />}
      {tab === "reports"    && <ReportsTab />}
    </div>
  );
}
