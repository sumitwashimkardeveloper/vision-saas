import { useState, useEffect, useCallback } from "react";
import { getJson, getBlob } from "../../api/client.js";
import { getEvents } from "../../api/events.js";

// ─── localStorage helpers ─────────────────────────────────────────────────────

const SHIFTS_KEY = "vfr_shifts";
const ASSIGN_KEY = "vfr_shift_assignments"; // { [personId]: shiftId }

function loadShifts() {
  try { return JSON.parse(localStorage.getItem(SHIFTS_KEY) || "[]"); } catch { return []; }
}
function saveShifts(s) { localStorage.setItem(SHIFTS_KEY, JSON.stringify(s)); }
function loadAssignments() {
  try { return JSON.parse(localStorage.getItem(ASSIGN_KEY) || "{}"); } catch { return {}; }
}
function saveAssignments(a) { localStorage.setItem(ASSIGN_KEY, JSON.stringify(a)); }

// ─── Date / time helpers ──────────────────────────────────────────────────────

function dayRange(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const end = new Date(d);
  end.setHours(23, 59, 59, 999);
  return { since: d.toISOString(), until: end.toISOString() };
}

function isoDateOnly(date) {
  return new Date(date).toISOString().split("T")[0];
}

function fmtShortDate(iso) {
  if (!iso) return "—";
  try { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(iso + "T12:00:00")); }
  catch { return iso; }
}

function fmtTime(iso) {
  if (!iso) return "—";
  try { return new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(new Date(iso)); }
  catch { return "—"; }
}

function fmtDuration(ms) {
  if (!ms || ms <= 0) return "—";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function computeStatus(checkInIso, shift) {
  if (!checkInIso) return "absent";
  if (!shift) return "present";
  const checkIn = new Date(checkInIso);
  const [h, m] = shift.startTime.split(":").map(Number);
  const deadline = new Date(checkIn);
  deadline.setHours(h, m + (parseInt(shift.graceMins) || 0), 0, 0);
  return checkIn <= deadline ? "on_time" : "late";
}

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

const STATUS_COLOR = { on_time: "var(--success)", late: "var(--warning)", absent: "var(--danger)", present: "var(--accent)" };
const STATUS_LABEL = { on_time: "On Time", late: "Late", absent: "Absent", present: "Present" };

function StatusBadge({ status }) {
  const c = STATUS_COLOR[status] || "var(--muted)";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 999, border: `1px solid ${c}`, color: c }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: c, flexShrink: 0 }} />
      {STATUS_LABEL[status] || status}
    </span>
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

// ─── Shift modal ──────────────────────────────────────────────────────────────

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function ShiftModal({ initial, onSave, onClose }) {
  const [name,       setName]       = useState(initial?.name || "");
  const [startTime,  setStartTime]  = useState(initial?.startTime || "09:00");
  const [endTime,    setEndTime]    = useState(initial?.endTime || "18:00");
  const [graceMins,  setGraceMins]  = useState(initial?.graceMins ?? 15);
  const [days,       setDays]       = useState(initial?.days || ["Mon", "Tue", "Wed", "Thu", "Fri"]);
  const [err,        setErr]        = useState("");

  function toggleDay(d) {
    setDays(p => p.includes(d) ? p.filter(x => x !== d) : [...p, d]);
  }

  function submit(e) {
    e.preventDefault();
    if (!name.trim()) { setErr("Shift name is required"); return; }
    if (!days.length) { setErr("Select at least one working day"); return; }
    onSave({ name: name.trim(), startTime, endTime, graceMins: parseInt(graceMins) || 0, days });
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <div className="modal-title">{initial ? "Edit Shift" : "Add Shift"}</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form className="modal-body" onSubmit={submit}>
          <div className="modal-field">
            <label>Shift Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Morning Shift" autoFocus />
          </div>
          <div className="modal-row-2">
            <div className="modal-field">
              <label>Start Time</label>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
            </div>
            <div className="modal-field">
              <label>End Time</label>
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
            </div>
          </div>
          <div className="modal-field">
            <label>Grace Period — minutes late still counted as on time</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="number" min={0} max={60} value={graceMins} onChange={e => setGraceMins(e.target.value)} style={{ width: 72 }} />
              <span style={{ fontSize: 13, color: "var(--muted)" }}>minutes</span>
            </div>
          </div>
          <div className="modal-field">
            <label>Working Days</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
              {DAYS.map(d => (
                <button key={d} type="button" onClick={() => toggleDay(d)} style={{
                  padding: "5px 11px", fontSize: 13, borderRadius: 6,
                  background: days.includes(d) ? "var(--accent)" : "transparent",
                  border: `1px solid ${days.includes(d) ? "var(--accent)" : "var(--line)"}`,
                  color: days.includes(d) ? "#fff" : "var(--muted)",
                }}>{d}</button>
              ))}
            </div>
          </div>
          {err && <div className="err">{err}</div>}
          <div className="modal-actions">
            <button type="submit">Save Shift</button>
            <button type="button" className="ghost" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Today tab ────────────────────────────────────────────────────────────────

function TodayTab({ people, events, shifts, assignments, loading }) {
  const [search,       setSearch]       = useState("");
  const [filterShift,  setFilterShift]  = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [viewDate,     setViewDate]     = useState(isoDateOnly(new Date()));

  const rows = people.map(p => {
    const pEvents = events
      .filter(e => e.person_id === p.id)
      .sort((a, b) => new Date(a.ts) - new Date(b.ts));
    const checkIn  = pEvents[0]?.ts || null;
    const lastSeen = pEvents[pEvents.length - 1]?.ts || null;
    const duration = checkIn && lastSeen ? new Date(lastSeen) - new Date(checkIn) : null;
    const shift    = shifts.find(s => s.id === assignments[p.id]) || null;
    return { ...p, checkIn, lastSeen, duration, shift, status: computeStatus(checkIn, shift) };
  });

  const present = rows.filter(r => r.status !== "absent").length;
  const late    = rows.filter(r => r.status === "late").length;
  const absent  = rows.filter(r => r.status === "absent").length;

  const shiftFilter = filterShift === "__none"
    ? rows.filter(r => !r.shift)
    : filterShift
      ? rows.filter(r => r.shift?.id === filterShift)
      : rows;

  const filtered = shiftFilter.filter(r => {
    if (search && !r.name?.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterStatus && r.status !== filterStatus) return false;
    return true;
  });

  function stepDate(n) {
    const d = new Date(viewDate + "T12:00:00");
    d.setDate(d.getDate() + n);
    setViewDate(isoDateOnly(d));
  }

  return (
    <div>
      {/* Date nav */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
        <button className="ghost" style={{ padding: "5px 12px" }} onClick={() => stepDate(-1)}>←</button>
        <span style={{ fontWeight: 600, fontSize: 15, minWidth: 140, textAlign: "center" }}>{fmtShortDate(viewDate)}</span>
        <button className="ghost" style={{ padding: "5px 12px" }} onClick={() => stepDate(1)}>→</button>
        <button className="ghost" style={{ padding: "5px 12px", fontSize: 12 }} onClick={() => setViewDate(isoDateOnly(new Date()))}>Today</button>
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))", gap: 12, marginBottom: 20 }}>
        <StatCard label="Present" value={present} color="var(--success)"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>} />
        <StatCard label="On Time" value={present - late} color="var(--accent)"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>} />
        <StatCard label="Late" value={late} color="var(--warning)"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v5l3 3"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/></svg>} />
        <StatCard label="Absent" value={absent} color="var(--danger)"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4"/><line x1="17" y1="11" x2="23" y2="17"/><line x1="23" y1="11" x2="17" y2="17"/></svg>} />
      </div>

      {/* Filter bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <input placeholder="Search by name…" value={search} onChange={e => setSearch(e.target.value)} style={{ width: 190 }} />
        <select value={filterShift} onChange={e => setFilterShift(e.target.value)}>
          <option value="">All Shifts</option>
          {shifts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          <option value="__none">No Shift</option>
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All Status</option>
          <option value="on_time">On Time</option>
          <option value="late">Late</option>
          <option value="absent">Absent</option>
          <option value="present">Present (no shift)</option>
        </select>
        <button className="ghost" style={{ marginLeft: "auto", padding: "5px 14px", fontSize: 13 }}>Export CSV</button>
      </div>

      {/* Table */}
      <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--muted)" }}>Loading attendance data…</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon="📋" title="No records" message="No people match the current filters, or no recognition events exist for this date." />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 52 }}>Photo</th>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Shift</th>
                  <th>Check In</th>
                  <th>Last Seen</th>
                  <th>Duration</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id}>
                    <td><PersonThumb personKey={r.external_key} /></td>
                    <td style={{ fontWeight: 500 }}>{r.name}</td>
                    <td><span className="tag" style={{ fontSize: 12 }}>{r.category || "general"}</span></td>
                    <td style={{ fontSize: 13, color: r.shift ? "var(--fg)" : "var(--muted)" }}>{r.shift?.name || "—"}</td>
                    <td style={{ fontSize: 13 }}>{fmtTime(r.checkIn)}</td>
                    <td style={{ fontSize: 13, color: "var(--muted)" }}>{fmtTime(r.lastSeen)}</td>
                    <td style={{ fontSize: 13, color: "var(--muted)" }}>{fmtDuration(r.duration)}</td>
                    <td><StatusBadge status={r.status} /></td>
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

// ─── History tab ──────────────────────────────────────────────────────────────

function HistoryTab({ people, shifts, assignments }) {
  const [from,    setFrom]    = useState(() => { const d = new Date(); d.setDate(d.getDate() - 7); return isoDateOnly(d); });
  const [to,      setTo]      = useState(isoDateOnly(new Date()));
  const [events,  setEvents]  = useState([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { since } = dayRange(from);
      const { until } = dayRange(to);
      setEvents(await getEvents({ event_type: "face_recognition", since, until, limit: 2000 }));
    } catch {}
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  // Group events by person+day
  const personDayMap = {};
  for (const e of events) {
    if (!e.person_id) continue;
    const key = `${isoDateOnly(e.ts)}_${e.person_id}`;
    if (!personDayMap[key]) personDayMap[key] = [];
    personDayMap[key].push(e);
  }

  const rows = Object.entries(personDayMap).map(([key, dayEvents]) => {
    const [date, personIdStr] = key.split("_");
    const person = people.find(p => p.id === parseInt(personIdStr));
    if (!person) return null;
    dayEvents.sort((a, b) => new Date(a.ts) - new Date(b.ts));
    const checkIn  = dayEvents[0]?.ts;
    const lastSeen = dayEvents[dayEvents.length - 1]?.ts;
    const duration = checkIn && lastSeen ? new Date(lastSeen) - new Date(checkIn) : null;
    const shift    = shifts.find(s => s.id === assignments[person.id]) || null;
    return { date, person, checkIn, lastSeen, duration, shift, status: computeStatus(checkIn, shift) };
  }).filter(Boolean).sort((a, b) => b.date.localeCompare(a.date) || a.person.name.localeCompare(b.person.name));

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div className="modal-field" style={{ marginBottom: 0 }}>
          <label>From</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div className="modal-field" style={{ marginBottom: 0 }}>
          <label>To</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} />
        </div>
        <button onClick={load} disabled={loading}>{loading ? "Loading…" : "Apply"}</button>
        <button className="ghost" style={{ marginLeft: "auto" }}>Export CSV</button>
      </div>

      <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--muted)" }}>Loading history…</div>
        ) : rows.length === 0 ? (
          <EmptyState icon="📅" title="No history found" message="No attendance records found in this date range. Recognition events derive check-in times." />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 52 }}>Photo</th>
                  <th>Name</th>
                  <th>Date</th>
                  <th>Shift</th>
                  <th>Check In</th>
                  <th>Last Seen</th>
                  <th>Duration</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td><PersonThumb personKey={r.person.external_key} /></td>
                    <td style={{ fontWeight: 500 }}>{r.person.name}</td>
                    <td style={{ fontSize: 13, color: "var(--muted)" }}>{fmtShortDate(r.date)}</td>
                    <td style={{ fontSize: 13 }}>{r.shift?.name || "—"}</td>
                    <td style={{ fontSize: 13 }}>{fmtTime(r.checkIn)}</td>
                    <td style={{ fontSize: 13, color: "var(--muted)" }}>{fmtTime(r.lastSeen)}</td>
                    <td style={{ fontSize: 13, color: "var(--muted)" }}>{fmtDuration(r.duration)}</td>
                    <td><StatusBadge status={r.status} /></td>
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

// ─── Shifts tab ───────────────────────────────────────────────────────────────

function ShiftsTab({ shifts, setShifts, people, assignments, setAssignments }) {
  const [modal, setModal] = useState(null); // null | "add" | shift-object

  function addShift(data) {
    const s = [...shifts, { ...data, id: `shift_${Date.now()}` }];
    setShifts(s); saveShifts(s); setModal(null);
  }

  function editShift(data) {
    const s = shifts.map(sh => sh.id === modal.id ? { ...sh, ...data } : sh);
    setShifts(s); saveShifts(s); setModal(null);
  }

  function deleteShift(id) {
    if (!confirm("Delete this shift? Assigned people will become unassigned.")) return;
    const s = shifts.filter(sh => sh.id !== id);
    setShifts(s); saveShifts(s);
    const a = { ...assignments };
    Object.keys(a).forEach(pid => { if (a[pid] === id) delete a[pid]; });
    setAssignments(a); saveAssignments(a);
  }

  function assignShift(personId, shiftId) {
    const a = { ...assignments };
    if (!shiftId) delete a[personId]; else a[personId] = shiftId;
    setAssignments(a); saveAssignments(a);
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "start" }}>
      {/* Shift definitions */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--fg)" }}>Shift Schedules</h3>
          <button onClick={() => setModal("add")} style={{ fontSize: 13, padding: "5px 12px" }}>+ Add Shift</button>
        </div>
        {shifts.length === 0 ? (
          <div className="panel">
            <EmptyState icon="🕐" title="No shifts defined" message="Add shift schedules to enable on-time / late status tracking." />
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {shifts.map(s => {
              const assigned = people.filter(p => assignments[p.id] === s.id).length;
              return (
                <div key={s.id} className="panel" style={{ margin: 0, padding: "14px 16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{s.name}</span>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="ghost" style={{ padding: "3px 8px", fontSize: 12 }} onClick={() => setModal(s)}>Edit</button>
                      <button className="danger" style={{ padding: "3px 8px", fontSize: 12 }} onClick={() => deleteShift(s.id)}>Delete</button>
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: "var(--muted)", display: "flex", gap: 16, marginBottom: 8 }}>
                    <span>⏰ {s.startTime} – {s.endTime}</span>
                    <span>⏱ {s.graceMins}m grace</span>
                  </div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
                    {DAYS.map(d => (
                      <span key={d} style={{ fontSize: 11, padding: "1px 7px", borderRadius: 4, background: s.days.includes(d) ? "var(--accent-soft)" : "transparent", color: s.days.includes(d) ? "var(--accent)" : "var(--muted)", border: `1px solid ${s.days.includes(d) ? "var(--accent)" : "var(--line)"}` }}>{d}</span>
                    ))}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>{assigned} {assigned === 1 ? "person" : "people"} assigned</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Person → shift assignments */}
      <div>
        <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "var(--fg)" }}>Assign People to Shifts</h3>
        <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
          {people.length === 0 ? (
            <EmptyState icon="👥" title="No people enrolled" message="Enroll people from the People section first." />
          ) : (
            <table>
              <thead>
                <tr>
                  <th style={{ width: 44 }}></th>
                  <th>Name</th>
                  <th>Shift</th>
                </tr>
              </thead>
              <tbody>
                {people.map(p => (
                  <tr key={p.id}>
                    <td><PersonThumb personKey={p.external_key} /></td>
                    <td style={{ fontWeight: 500, fontSize: 13 }}>{p.name}</td>
                    <td>
                      <select value={assignments[p.id] || ""} onChange={e => assignShift(p.id, e.target.value)} style={{ fontSize: 12, padding: "3px 6px" }}>
                        <option value="">No Shift</option>
                        {shifts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {modal && (
        <ShiftModal
          initial={modal === "add" ? null : modal}
          onSave={modal === "add" ? addShift : editShift}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

// ─── Reports tab ──────────────────────────────────────────────────────────────

function ReportsTab({ people, shifts, assignments }) {
  const [month,   setMonth]   = useState(() => new Date().toISOString().slice(0, 7));
  const [events,  setEvents]  = useState([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [y, m] = month.split("-").map(Number);
      const since = new Date(y, m - 1, 1).toISOString();
      const until = new Date(y, m, 0, 23, 59, 59).toISOString();
      setEvents(await getEvents({ event_type: "face_recognition", since, until, limit: 5000 }));
    } catch {}
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [month]);

  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();

  const personDayMap = {};
  for (const e of events) {
    if (!e.person_id) continue;
    const key = `${e.person_id}_${isoDateOnly(e.ts)}`;
    if (!personDayMap[key]) personDayMap[key] = [];
    personDayMap[key].push(e);
  }

  const summaries = people.map(p => {
    const shift = shifts.find(s => s.id === assignments[p.id]) || null;
    let present = 0, late = 0, totalMs = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const day = `${month}-${String(d).padStart(2, "0")}`;
      const entry = personDayMap[`${p.id}_${day}`];
      if (!entry) continue;
      present++;
      const sorted = [...entry].sort((a, b) => new Date(a.ts) - new Date(b.ts));
      const ci = sorted[0]?.ts, ls = sorted[sorted.length - 1]?.ts;
      if (ci && ls) totalMs += new Date(ls) - new Date(ci);
      if (computeStatus(ci, shift) === "late") late++;
    }

    const workingDays = shift
      ? Array.from({ length: daysInMonth }, (_, i) => {
          const d = new Date(y, m - 1, i + 1);
          return DAYS[d.getDay() === 0 ? 6 : d.getDay() - 1];
        }).filter(d => shift.days.includes(d)).length
      : daysInMonth;

    return { person: p, shift, present, absent: Math.max(0, workingDays - present), late, totalMs, workingDays };
  });

  const monthLabel = new Date(y, m - 1).toLocaleString("default", { month: "long", year: "numeric" });

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div className="modal-field" style={{ marginBottom: 0 }}>
          <label>Month</label>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)} />
        </div>
        <button onClick={load} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button>
        <button className="ghost" style={{ marginLeft: "auto" }}>Export CSV</button>
      </div>

      <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "13px 16px", borderBottom: "1px solid var(--line)", fontSize: 14, fontWeight: 700 }}>Monthly Summary — {monthLabel}</div>
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--muted)" }}>Calculating…</div>
        ) : summaries.length === 0 ? (
          <EmptyState icon="📊" title="No people enrolled" message="Enroll people to see monthly summaries." />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Shift</th>
                <th style={{ textAlign: "center" }}>Working Days</th>
                <th style={{ textAlign: "center" }}>Present</th>
                <th style={{ textAlign: "center" }}>Absent</th>
                <th style={{ textAlign: "center" }}>Late</th>
                <th>Total Hours</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map(s => (
                <tr key={s.person.id}>
                  <td style={{ fontWeight: 500 }}>{s.person.name}</td>
                  <td style={{ fontSize: 13, color: "var(--muted)" }}>{s.shift?.name || "—"}</td>
                  <td style={{ textAlign: "center", fontSize: 13 }}>{s.workingDays}</td>
                  <td style={{ textAlign: "center", fontWeight: 600, color: "var(--success)" }}>{s.present}</td>
                  <td style={{ textAlign: "center", color: s.absent > 0 ? "var(--danger)" : "var(--muted)" }}>{s.absent}</td>
                  <td style={{ textAlign: "center", color: s.late > 0 ? "var(--warning)" : "var(--muted)" }}>{s.late}</td>
                  <td style={{ fontSize: 13, color: "var(--muted)" }}>{fmtDuration(s.totalMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AttendancePage() {
  const [tab,         setTab]         = useState("today");
  const [people,      setPeople]      = useState([]);
  const [todayEvents, setTodayEvents] = useState([]);
  const [shifts,      setShifts]      = useState(loadShifts);
  const [assignments, setAssignments] = useState(loadAssignments);
  const [loading,     setLoading]     = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [ppl, evs] = await Promise.all([
        getJson("/people"),
        getEvents({ event_type: "face_recognition", ...dayRange(new Date()), limit: 1000 }),
      ]);
      setPeople(ppl);
      setTodayEvents(evs);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const TABS = [
    { key: "today",   label: "Today" },
    { key: "history", label: "History" },
    { key: "shifts",  label: "Shifts" },
    { key: "reports", label: "Reports" },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "clamp(17px,1.45vw,22px)", fontWeight: 700 }}>Attendance</h1>
          <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 3 }}>Track employee check-ins, shifts, and time compliance</div>
        </div>
        <button className="ghost" onClick={reload} disabled={loading} style={{ fontSize: 13, padding: "6px 14px" }}>↻ Refresh</button>
      </div>

      <PageTabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === "today"   && <TodayTab people={people} events={todayEvents} shifts={shifts} assignments={assignments} loading={loading} />}
      {tab === "history" && <HistoryTab people={people} shifts={shifts} assignments={assignments} />}
      {tab === "shifts"  && <ShiftsTab shifts={shifts} setShifts={setShifts} people={people} assignments={assignments} setAssignments={setAssignments} />}
      {tab === "reports" && <ReportsTab people={people} shifts={shifts} assignments={assignments} />}
    </div>
  );
}
