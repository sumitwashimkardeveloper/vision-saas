import { useState, useEffect, useCallback } from "react";
import { getJson, getBlob } from "../../api/client.js";
import { getEvents, getEventSnapshot } from "../../api/events.js";

// ─── localStorage helpers ─────────────────────────────────────────────────────

const RULES_KEY    = "vfr_alert_rules";
const VISITORS_KEY = "vfr_visitors";

const DEFAULT_RULES = [
  { id: "blocked",     label: "Blocked Person Detected",  desc: "Fires when a person categorised as Blocked is recognised by any camera.",       severity: "critical" },
  { id: "unknown",     label: "Unknown Face Detected",    desc: "Fires when an unrecognised person appears on camera.",                            severity: "warning"  },
  { id: "ppe",         label: "PPE Violation",            desc: "Fires when a PPE violation is detected — missing helmet, vest, gloves, etc.",    severity: "warning"  },
  { id: "after_hours", label: "After-Hours Activity",     desc: "Fires when face recognition occurs outside business hours (8 pm – 7 am).",       severity: "warning"  },
];

function loadRules() {
  try {
    const stored = JSON.parse(localStorage.getItem(RULES_KEY) || "null");
    return DEFAULT_RULES.map(r => ({ ...r, enabled: stored ? (stored[r.id] ?? (r.severity === "critical")) : (r.severity === "critical") }));
  } catch { return DEFAULT_RULES.map(r => ({ ...r, enabled: r.severity === "critical" })); }
}
function saveRules(rules) {
  localStorage.setItem(RULES_KEY, JSON.stringify(Object.fromEntries(rules.map(r => [r.id, r.enabled]))));
}

function loadVisitors() {
  try { return JSON.parse(localStorage.getItem(VISITORS_KEY) || "[]"); } catch { return []; }
}
function saveVisitors(v) { localStorage.setItem(VISITORS_KEY, JSON.stringify(v)); }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDateTime(iso) {
  if (!iso) return "—";
  try { return new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" }).format(new Date(iso)); }
  catch { return "—"; }
}

function fmtTimeOnly(iso) {
  if (!iso) return "—";
  try { return new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(new Date(iso)); }
  catch { return "—"; }
}

function timeAgo(iso) {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso);
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function isAfterHours(iso) {
  const h = new Date(iso).getHours();
  return h >= 20 || h < 7;
}

function todaySince() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

const SEVERITY_COLOR = { critical: "var(--danger)", warning: "var(--warning)", info: "var(--accent)" };

const CATEGORY_COLOR = {
  blocked:       "var(--danger)",
  vip:           "var(--warning)",
  security_staff:"var(--accent-2)",
  management:    "var(--success)",
  staff:         "var(--accent)",
  general:       "var(--muted)",
};

// ─── Shared UI ────────────────────────────────────────────────────────────────

function PersonThumb({ personKey }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let dead = false, obj = "";
    getBlob(`/people/${personKey}/image`)
      .then(b => { if (!dead) { obj = URL.createObjectURL(b); setUrl(obj); } })
      .catch(() => {});
    return () => { dead = true; if (obj) URL.revokeObjectURL(obj); };
  }, [personKey]);
  return url
    ? <img className="thumb" src={url} alt="" />
    : <span className="thumb thumb-empty" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>👤</span>;
}

function SnapThumb({ eventId, hasSnapshot }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!hasSnapshot) return;
    let dead = false, obj = "";
    getEventSnapshot(eventId)
      .then(b => { if (!dead) { obj = URL.createObjectURL(b); setUrl(obj); } })
      .catch(() => {});
    return () => { dead = true; if (obj) URL.revokeObjectURL(obj); };
  }, [eventId, hasSnapshot]);
  if (!hasSnapshot) return <span className="event-thumb empty">—</span>;
  if (!url)         return <span className="event-thumb empty">…</span>;
  return <img className="event-thumb" src={url} alt="" />;
}

function StatCard({ label, value, color, icon }) {
  return (
    <div className="panel" style={{ margin: 0, display: "flex", alignItems: "center", gap: 14, padding: "16px 20px" }}>
      <span style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: color ? `${color}1a` : "var(--accent-soft)", color: color || "var(--accent)" }}>{icon}</span>
      <div>
        <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1, color: color || "var(--fg)" }}>{value}</div>
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

function FilterPills({ options, value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {options.map(([k, l]) => (
        <button key={k} onClick={() => onChange(k)} style={{
          padding: "4px 13px", fontSize: 13, borderRadius: 999,
          background: value === k ? "var(--accent)" : "transparent",
          border: `1px solid ${value === k ? "var(--accent)" : "var(--line)"}`,
          color: value === k ? "#fff" : "var(--muted)", cursor: "pointer",
        }}>{l}</button>
      ))}
    </div>
  );
}

// ─── Watchlist tab ────────────────────────────────────────────────────────────

function WatchlistTab({ people, recentEvents }) {
  const [filter, setFilter] = useState("all");

  const lastSeenMap = {};
  const lastCamMap  = {};
  for (const e of recentEvents) {
    if (!e.person_id) continue;
    if (!lastSeenMap[e.person_id] || e.ts > lastSeenMap[e.person_id]) {
      lastSeenMap[e.person_id] = e.ts;
      lastCamMap[e.person_id]  = e.camera_name;
    }
  }

  const monitored    = people.filter(p => ["blocked", "vip", "security_staff"].includes(p.category));
  const blocked      = monitored.filter(p => p.category === "blocked");
  const vip          = monitored.filter(p => p.category === "vip");
  const secStaff     = monitored.filter(p => p.category === "security_staff");
  const unknownToday = recentEvents.filter(e => e.event_type === "unknown_face" && e.ts >= todaySince()).length;

  const display = filter === "all" ? monitored : monitored.filter(p => p.category === filter);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))", gap: 12, marginBottom: 20 }}>
        <StatCard label="Blocked" value={blocked.length} color="var(--danger)"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>} />
        <StatCard label="VIP" value={vip.length} color="var(--warning)"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>} />
        <StatCard label="Security Staff" value={secStaff.length} color="var(--accent-2)"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>} />
        <StatCard label="Unknown Today" value={unknownToday} color="var(--muted)"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9 9a3 3 0 0 1 5.12-2.11A3 3 0 0 1 12 12"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>} />
      </div>

      <div style={{ marginBottom: 14 }}>
        <FilterPills
          options={[["all","All Monitored"],["blocked","Blocked"],["vip","VIP"],["security_staff","Security Staff"]]}
          value={filter} onChange={setFilter}
        />
      </div>

      {display.length === 0 ? (
        <div className="panel">
          <EmptyState icon="🛡️" title="No monitored persons" message="People assigned Blocked, VIP, or Security Staff categories appear here automatically." />
        </div>
      ) : (
        <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 52 }}>Photo</th>
                <th>Name</th>
                <th>Category</th>
                <th>Last Seen</th>
                <th>Camera</th>
              </tr>
            </thead>
            <tbody>
              {display.map(p => {
                const ls        = lastSeenMap[p.id];
                const cam       = lastCamMap[p.id];
                const isBlocked = p.category === "blocked";
                const color     = CATEGORY_COLOR[p.category] || "var(--muted)";
                return (
                  <tr key={p.id} style={isBlocked ? { borderLeft: "3px solid var(--danger)", background: "rgba(220,38,38,0.03)" } : {}}>
                    <td><PersonThumb personKey={p.external_key} /></td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{p.name}</div>
                      {isBlocked && <div style={{ fontSize: 11, color: "var(--danger)", fontWeight: 700, marginTop: 1 }}>⚠ WATCHLIST</div>}
                    </td>
                    <td>
                      <span style={{ fontSize: 12, fontWeight: 600, padding: "2px 10px", borderRadius: 999, border: `1px solid ${color}`, color }}>{p.category}</span>
                    </td>
                    <td style={{ fontSize: 13, color: ls ? "var(--fg)" : "var(--muted)" }}>{ls ? timeAgo(ls) : "Never seen"}</td>
                    <td style={{ fontSize: 13, color: "var(--muted)" }}>{cam || "—"}</td>
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

// ─── Live Presence tab ────────────────────────────────────────────────────────

function LivePresenceTab({ people, todayEvents }) {
  const [windowHours, setWindowHours] = useState(4);

  const cutoff = new Date(Date.now() - windowHours * 3600000).toISOString();

  const presenceMap = {};
  for (const e of todayEvents) {
    if (!e.person_id || e.ts < cutoff) continue;
    if (!presenceMap[e.person_id] || e.ts > presenceMap[e.person_id].ts) {
      presenceMap[e.person_id] = e;
    }
  }

  const present = Object.values(presenceMap).sort((a, b) => new Date(b.ts) - new Date(a.ts));

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20, flexWrap: "wrap" }}>
        <div className="panel" style={{ margin: 0, padding: "14px 22px", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: "var(--success)", boxShadow: "0 0 8px var(--success)", animation: "pulse-dot 2s ease-in-out infinite", flexShrink: 0 }} />
          <span style={{ fontSize: 28, fontWeight: 800, color: "var(--fg)", lineHeight: 1 }}>{present.length}</span>
          <span style={{ fontSize: 14, color: "var(--muted)" }}>people on premises</span>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>Seen within:</span>
          <select value={windowHours} onChange={e => setWindowHours(Number(e.target.value))} style={{ fontSize: 13 }}>
            <option value={1}>1 hour</option>
            <option value={2}>2 hours</option>
            <option value={4}>4 hours</option>
            <option value={8}>8 hours</option>
          </select>
        </div>
      </div>

      {present.length === 0 ? (
        <div className="panel">
          <EmptyState icon="📍" title="No recent activity" message={`No face recognitions in the last ${windowHours} hour${windowHours !== 1 ? "s" : ""}. Try a wider window or check camera status.`} />
        </div>
      ) : (
        <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 52 }}>Photo</th>
                <th>Name</th>
                <th>Category</th>
                <th>Last Seen</th>
                <th>Camera</th>
                <th>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {present.map(e => {
                const person = people.find(p => p.id === e.person_id);
                if (!person) return null;
                return (
                  <tr key={e.person_id}>
                    <td><PersonThumb personKey={person.external_key} /></td>
                    <td style={{ fontWeight: 500 }}>{person.name}</td>
                    <td><span className="tag" style={{ fontSize: 12 }}>{person.category || "general"}</span></td>
                    <td>
                      <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--success)", flexShrink: 0, animation: "pulse-dot 2s ease-in-out infinite" }} />
                        {timeAgo(e.ts)}
                      </span>
                    </td>
                    <td style={{ fontSize: 13, color: "var(--muted)" }}>{e.camera_name || "—"}</td>
                    <td style={{ fontSize: 13 }}>{e.score ? `${Math.round(e.score * 100)}%` : "—"}</td>
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

// ─── Visitors tab ─────────────────────────────────────────────────────────────

function VisitorModal({ onSave, onClose }) {
  const [name,       setName]       = useState("");
  const [host,       setHost]       = useState("");
  const [company,    setCompany]    = useState("");
  const [validFrom,  setValidFrom]  = useState(() => new Date().toISOString().slice(0, 16));
  const [validUntil, setValidUntil] = useState(() => { const d = new Date(); d.setHours(d.getHours() + 8); return d.toISOString().slice(0, 16); });
  const [err,        setErr]        = useState("");

  function submit(e) {
    e.preventDefault();
    if (!name.trim()) { setErr("Visitor name is required"); return; }
    if (!host.trim()) { setErr("Host name is required"); return; }
    onSave({ name: name.trim(), host: host.trim(), company: company.trim(), validFrom, validUntil, id: `v_${Date.now()}`, createdAt: new Date().toISOString() });
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 450 }}>
        <div className="modal-header">
          <div className="modal-title">Register Visitor</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form className="modal-body" onSubmit={submit}>
          <div className="modal-row-2">
            <div className="modal-field">
              <label>Visitor Name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="John Smith" autoFocus />
            </div>
            <div className="modal-field">
              <label>Company (optional)</label>
              <input value={company} onChange={e => setCompany(e.target.value)} placeholder="Acme Ltd." />
            </div>
          </div>
          <div className="modal-field">
            <label>Host — who they are visiting</label>
            <input value={host} onChange={e => setHost(e.target.value)} placeholder="Sara Ali" />
          </div>
          <div className="modal-row-2">
            <div className="modal-field">
              <label>Valid From</label>
              <input type="datetime-local" value={validFrom} onChange={e => setValidFrom(e.target.value)} />
            </div>
            <div className="modal-field">
              <label>Valid Until</label>
              <input type="datetime-local" value={validUntil} onChange={e => setValidUntil(e.target.value)} />
            </div>
          </div>
          {err && <div className="err">{err}</div>}
          <div className="modal-actions">
            <button type="submit">Register Visitor</button>
            <button type="button" className="ghost" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function VisitorsTab() {
  const [visitors,   setVisitors]   = useState(loadVisitors);
  const [showModal,  setShowModal]  = useState(false);
  const [filterTab,  setFilterTab]  = useState("active");

  function addVisitor(v) {
    const list = [v, ...visitors];
    setVisitors(list); saveVisitors(list); setShowModal(false);
  }

  function removeVisitor(id) {
    if (!confirm("Remove this visitor record?")) return;
    const list = visitors.filter(v => v.id !== id);
    setVisitors(list); saveVisitors(list);
  }

  const now      = new Date();
  const active   = visitors.filter(v => new Date(v.validFrom) <= now && new Date(v.validUntil) >= now);
  const upcoming = visitors.filter(v => new Date(v.validFrom) > now);
  const expired  = visitors.filter(v => new Date(v.validUntil) < now);

  const display = filterTab === "active" ? active : filterTab === "upcoming" ? upcoming : expired;
  const statusColor = { active: "var(--success)", upcoming: "var(--accent)", expired: "var(--muted)" };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
        <FilterPills
          options={[["active",`Active (${active.length})`],["upcoming",`Upcoming (${upcoming.length})`],["expired",`Expired (${expired.length})`]]}
          value={filterTab} onChange={setFilterTab}
        />
        <button onClick={() => setShowModal(true)} style={{ fontSize: 13, padding: "6px 14px", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          + Register Visitor
        </button>
      </div>

      {display.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon="🪪"
            title={filterTab === "active" ? "No active visitors" : filterTab === "upcoming" ? "No upcoming visitors" : "No expired records"}
            message={filterTab === "active" ? "Pre-register visitors to track their entry window and host." : "Registered visitors will appear here."}
          />
        </div>
      ) : (
        <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
          <table>
            <thead>
              <tr>
                <th>Visitor</th>
                <th>Host</th>
                <th>Valid From</th>
                <th>Valid Until</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {display.map(v => {
                const status = new Date(v.validFrom) > now ? "upcoming" : new Date(v.validUntil) < now ? "expired" : "active";
                const c = statusColor[status];
                return (
                  <tr key={v.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{v.name}</div>
                      {v.company && <div style={{ fontSize: 12, color: "var(--muted)" }}>{v.company}</div>}
                    </td>
                    <td style={{ fontSize: 13, color: "var(--muted)" }}>{v.host}</td>
                    <td style={{ fontSize: 13 }}>{fmtDateTime(v.validFrom)}</td>
                    <td style={{ fontSize: 13 }}>{fmtDateTime(v.validUntil)}</td>
                    <td>
                      <span style={{ fontSize: 12, fontWeight: 600, padding: "2px 10px", borderRadius: 999, border: `1px solid ${c}`, color: c }}>
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </span>
                    </td>
                    <td>
                      <button className="ghost" style={{ padding: "3px 8px", fontSize: 12 }} onClick={() => removeVisitor(v.id)}>Remove</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && <VisitorModal onSave={addVisitor} onClose={() => setShowModal(false)} />}
    </div>
  );
}

// ─── Access Log tab ───────────────────────────────────────────────────────────

function AccessLogTab() {
  const [events,  setEvents]  = useState([]);
  const [filter,  setFilter]  = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const query = filter === "unknown" ? { event_type: "unknown_face", limit: 200 }
                : filter === "known"   ? { event_type: "face_recognition", limit: 200 }
                : { limit: 200 };
    getEvents(query)
      .then(data => setEvents(data.filter(e => ["face_recognition", "unknown_face"].includes(e.event_type))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filter]);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
        <FilterPills
          options={[["all","All"],["known","Recognised"],["unknown","Unknown"]]}
          value={filter} onChange={setFilter}
        />
        <button className="ghost" style={{ marginLeft: "auto", fontSize: 13, padding: "4px 14px" }}>Export CSV</button>
      </div>

      <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--muted)" }}>Loading…</div>
        ) : events.length === 0 ? (
          <EmptyState icon="🔍" title="No access events" message="Face recognition and unknown face events will appear here once cameras are active." />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="event-table">
              <thead>
                <tr>
                  <th>Snapshot</th>
                  <th>Person</th>
                  <th>Camera</th>
                  <th>Time</th>
                  <th>Confidence</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {events.map(e => (
                  <tr key={e.id}>
                    <td><SnapThumb eventId={e.id} hasSnapshot={e.has_snapshot} /></td>
                    <td style={{ fontWeight: e.person_name ? 500 : 400, color: e.person_name ? "var(--fg)" : "var(--muted)", fontSize: 13 }}>
                      {e.person_name || <em>Unknown</em>}
                    </td>
                    <td style={{ fontSize: 13, color: "var(--muted)" }}>{e.camera_name || "—"}</td>
                    <td style={{ fontSize: 13, color: "var(--muted)" }}>{fmtDateTime(e.ts)}</td>
                    <td style={{ fontSize: 13 }}>{e.score ? `${Math.round(e.score * 100)}%` : "—"}</td>
                    <td>
                      <span style={{ fontSize: 12, fontWeight: 600, padding: "2px 9px", borderRadius: 999, background: e.event_type === "unknown_face" ? "rgba(220,38,38,0.08)" : "var(--accent-soft)", color: e.event_type === "unknown_face" ? "var(--danger)" : "var(--accent)" }}>
                        {e.event_type === "unknown_face" ? "Unknown" : "Recognised"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Alerts tab ───────────────────────────────────────────────────────────────

function AlertsTab({ recentEvents, blockedPersonIds }) {
  const [rules, setRules] = useState(loadRules);

  function toggle(id) {
    const updated = rules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r);
    setRules(updated); saveRules(updated);
  }

  function matchesRule(e) {
    if (rules.find(r => r.id === "blocked"     && r.enabled) && e.event_type === "face_recognition" && blockedPersonIds.has(e.person_id)) return { ruleLabel: "Blocked Person", color: "var(--danger)" };
    if (rules.find(r => r.id === "unknown"     && r.enabled) && e.event_type === "unknown_face")    return { ruleLabel: "Unknown Face",   color: "var(--warning)" };
    if (rules.find(r => r.id === "ppe"         && r.enabled) && e.event_type === "ppe_violation")   return { ruleLabel: "PPE Violation",  color: "var(--warning)" };
    if (rules.find(r => r.id === "after_hours" && r.enabled) && e.event_type === "face_recognition" && isAfterHours(e.ts)) return { ruleLabel: "After-Hours",  color: "var(--warning)" };
    return null;
  }

  const alertHistory = recentEvents.reduce((acc, e) => {
    const match = matchesRule(e);
    if (match) acc.push({ ...e, ...match });
    return acc;
  }, []).slice(0, 50);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "start" }}>
      {/* Rules */}
      <div>
        <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "var(--fg)" }}>Alert Rules</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rules.map(r => (
            <div key={r.id} className="panel" style={{ margin: 0, padding: "14px 16px", borderLeft: `3px solid ${r.enabled ? SEVERITY_COLOR[r.severity] : "var(--line)"}`, opacity: r.enabled ? 1 : 0.65, transition: "opacity 0.2s, border-color 0.2s" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{r.label}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 999, background: `${SEVERITY_COLOR[r.severity]}18`, color: SEVERITY_COLOR[r.severity], textTransform: "uppercase", letterSpacing: "0.05em" }}>{r.severity}</span>
                </div>
                <button onClick={() => toggle(r.id)} className={`feature-toggle ${r.enabled ? "on" : ""}`} style={{ flexShrink: 0 }}>
                  <span className="feature-toggle-thumb" />
                </button>
              </div>
              <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>{r.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Alert history */}
      <div>
        <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "var(--fg)" }}>
          Recent Alerts
          {alertHistory.length > 0 && (
            <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 700, padding: "1px 7px", borderRadius: 999, background: "var(--danger)", color: "#fff" }}>{alertHistory.length}</span>
          )}
        </h3>
        {alertHistory.length === 0 ? (
          <div className="panel">
            <EmptyState
              icon="✅"
              title="No alerts"
              message={rules.some(r => r.enabled) ? "No events matching your enabled rules in recent history." : "Enable alert rules on the left to start monitoring."}
            />
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {alertHistory.map(e => (
              <div key={e.id} className="panel" style={{ margin: 0, padding: "11px 14px", display: "flex", gap: 12, alignItems: "center", borderLeft: `3px solid ${e.color}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: e.color }}>{e.ruleLabel}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                    {e.person_name || e.label || "Unknown"} · {e.camera_name || "Camera"} · {timeAgo(e.ts)}
                  </div>
                </div>
                <span style={{ fontSize: 12, color: "var(--muted)", flexShrink: 0 }}>{fmtTimeOnly(e.ts)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SecurityPage() {
  const [tab,          setTab]         = useState("watchlist");
  const [people,       setPeople]      = useState([]);
  const [todayEvents,  setTodayEvents] = useState([]);
  const [recentEvents, setRecentEvents]= useState([]);
  const [loading,      setLoading]     = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const [ppl, today, recent] = await Promise.all([
        getJson("/people"),
        getEvents({ since: todaySince(), limit: 1000 }),
        getEvents({ since: weekAgo.toISOString(), limit: 500 }),
      ]);
      setPeople(ppl);
      setTodayEvents(today);
      setRecentEvents(recent);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const blockedPersonIds = new Set(people.filter(p => p.category === "blocked").map(p => p.id));

  const TABS = [
    { key: "watchlist",  label: "Watchlist"     },
    { key: "live",       label: "Live Presence" },
    { key: "visitors",   label: "Visitors"      },
    { key: "access_log", label: "Access Log"    },
    { key: "alerts",     label: "Alerts"        },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "clamp(17px,1.45vw,22px)", fontWeight: 700 }}>Security</h1>
          <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 3 }}>Monitor access, manage watchlists, and review security events</div>
        </div>
        <button className="ghost" onClick={reload} disabled={loading} style={{ fontSize: 13, padding: "6px 14px" }}>↻ Refresh</button>
      </div>

      <PageTabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === "watchlist"  && <WatchlistTab people={people} recentEvents={recentEvents} />}
      {tab === "live"       && <LivePresenceTab people={people} todayEvents={todayEvents} />}
      {tab === "visitors"   && <VisitorsTab />}
      {tab === "access_log" && <AccessLogTab />}
      {tab === "alerts"     && <AlertsTab recentEvents={recentEvents} blockedPersonIds={blockedPersonIds} />}
    </div>
  );
}
