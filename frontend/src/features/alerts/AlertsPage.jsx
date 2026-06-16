import { useState, useEffect, useCallback } from "react";
import { getFeatures } from "../../api/features.js";

/* ─── Static data ────────────────────────────────────────────────────────────*/

const SAFETY_FEATURES = [
  { key: "helmet_detection", label: "Helmet Detection", defaultSeverity: "high",     defaultDuration: 3 },
  { key: "vest_detection",   label: "Vest Detection",   defaultSeverity: "high",     defaultDuration: 3 },
  { key: "gloves_detection", label: "Gloves Detection", defaultSeverity: "medium",   defaultDuration: 3 },
  { key: "fire_detection",   label: "Fire Detection",   defaultSeverity: "critical", defaultDuration: 1 },
  { key: "smoke_detection",  label: "Smoke Detection",  defaultSeverity: "high",     defaultDuration: 2 },
  { key: "fall_detection",   label: "Fall Detection",   defaultSeverity: "critical", defaultDuration: 2 },
];

const SEV = {
  low:      { label: "Low",      color: "#22C55E" },
  medium:   { label: "Medium",   color: "#D97706" },
  high:     { label: "High",     color: "#F97316" },
  critical: { label: "Critical", color: "#DC2626" },
};

const STATUS_CFG = {
  open:         { label: "Open",         color: "var(--danger)"  },
  acknowledged: { label: "Acknowledged", color: "var(--warning)" },
  resolved:     { label: "Resolved",     color: "var(--success)" },
  false_alert:  { label: "False Alert",  color: "var(--muted)"   },
};

const MOCK_LIVE = [];

const MOCK_HISTORY = [
  { id: 101, time: "Today 10:42",     featureLabel: "Fire Detection",   camera: "Loading Bay 1",   zone: "Truck Area", severity: "critical", status: "resolved"     },
  { id: 102, time: "Today 10:38",     featureLabel: "Helmet Detection", camera: "Entry Gate",      zone: null,         severity: "high",     status: "resolved"     },
  { id: 103, time: "Today 09:55",     featureLabel: "Vest Detection",   camera: "Warehouse Floor", zone: "Zone B",     severity: "medium",   status: "false_alert"  },
  { id: 104, time: "Today 09:30",     featureLabel: "Fall Detection",   camera: "Assembly Line",   zone: null,         severity: "critical", status: "resolved"     },
  { id: 105, time: "Yesterday 16:22", featureLabel: "Smoke Detection",  camera: "Storage Room",    zone: null,         severity: "high",     status: "resolved"     },
  { id: 106, time: "Yesterday 14:05", featureLabel: "Helmet Detection", camera: "Entry Gate",      zone: null,         severity: "high",     status: "acknowledged" },
];

/* ─── LocalStorage helpers ───────────────────────────────────────────────────*/

function loadRules() {
  try { return JSON.parse(localStorage.getItem("vfr_alert_rules") || "{}"); }
  catch { return {}; }
}

function persistRules(r) {
  localStorage.setItem("vfr_alert_rules", JSON.stringify(r));
}

function loadLocalFeatures() {
  try { return JSON.parse(localStorage.getItem("vfr_features") || "{}"); }
  catch { return {}; }
}

function defaultRule(feat) {
  return {
    alertEnabled:    false,
    severity:        feat.defaultSeverity,
    triggerDuration: feat.defaultDuration,
    cooldown:        60,
    channels:        ["inapp"],
    snapshotFullFrame: true,
    snapshotCrop:      false,
    drawBbox:          true,
  };
}

/* ─── Shared inline-style tokens ─────────────────────────────────────────────*/

const S = {
  card: {
    background: "var(--panel)", border: "1px solid var(--line)",
    borderRadius: "clamp(5px, 0.5vw, 8px)", overflow: "hidden",
    boxShadow: "var(--shadow)",
  },
  overlay: {
    position: "fixed", inset: 0, background: "var(--overlay)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 3000, backdropFilter: "blur(4px)", padding: "clamp(12px, 1.1vw, 20px)",
  },
  modal: {
    background: "var(--panel)", border: "1px solid var(--line)",
    borderRadius: "clamp(8px, 0.8vw, 12px)", width: "100%",
    maxWidth: "clamp(360px, 38vw, 500px)",
    boxShadow: "var(--shadow-lg)", maxHeight: "92vh",
    display: "flex", flexDirection: "column",
  },
  modalHead: {
    padding: "clamp(9px, 0.85vw, 13px) clamp(13px, 1.2vw, 18px)",
    borderBottom: "1px solid var(--line)",
    fontSize: "clamp(12px, 1vw, 14.5px)", fontWeight: 700, flexShrink: 0,
    display: "flex", alignItems: "center", justifyContent: "space-between",
  },
  modalBody: {
    padding: "clamp(12px, 1.1vw, 17px)", overflowY: "auto",
    display: "flex", flexDirection: "column",
    gap: "clamp(10px, 1vw, 15px)", flex: 1,
  },
  modalFoot: {
    padding: "clamp(8px, 0.78vw, 11px) clamp(13px, 1.2vw, 18px)",
    borderTop: "1px solid var(--line)",
    display: "flex", justifyContent: "flex-end",
    gap: "clamp(5px, 0.5vw, 8px)", flexShrink: 0,
  },
  label: {
    display: "block", fontSize: "clamp(9px, 0.72vw, 10.5px)", fontWeight: 700,
    color: "var(--muted)", textTransform: "uppercase",
    letterSpacing: "0.08em", marginBottom: "clamp(4px, 0.42vw, 6px)",
  },
  input: {
    padding: "clamp(5px, 0.48vw, 7px) clamp(7px, 0.65vw, 10px)",
    fontSize: "clamp(11px, 0.85vw, 13px)",
    background: "var(--input-bg)", border: "1px solid var(--line)",
    borderRadius: "clamp(4px, 0.38vw, 6px)", color: "var(--fg)", outline: "none",
  },
  select: {
    padding: "clamp(5px, 0.48vw, 7px) clamp(7px, 0.65vw, 10px)",
    fontSize: "clamp(11px, 0.85vw, 13px)",
    background: "var(--input-bg)", border: "1px solid var(--line)",
    borderRadius: "clamp(4px, 0.38vw, 6px)", color: "var(--fg)", cursor: "pointer",
  },
  btn: (color, ghost) => ({
    padding: "clamp(4px, 0.4vw, 6px) clamp(8px, 0.78vw, 12px)",
    fontSize: "clamp(10.5px, 0.82vw, 12px)", fontWeight: 600,
    borderRadius: "clamp(4px, 0.38vw, 6px)", cursor: "pointer", whiteSpace: "nowrap",
    background: ghost ? "transparent" : `color-mix(in srgb, ${color} 13%, transparent)`,
    border: `1px solid color-mix(in srgb, ${color} ${ghost ? 33 : 45}%, transparent)`,
    color,
  }),
};

/* ─── Toggle (matches existing feature-toggle CSS) ───────────────────────────*/

function Toggle({ enabled, onChange, loading, disabled }) {
  return (
    <button
      className={"feature-toggle" + (enabled ? " on" : "")}
      onClick={onChange}
      disabled={loading || disabled}
      title={disabled ? "Enable this feature first to activate alerts" : undefined}
    >
      <span className="feature-toggle-thumb" />
    </button>
  );
}

/* ─── Badges ─────────────────────────────────────────────────────────────────*/

function SeverityBadge({ severity }) {
  const cfg = SEV[severity] || SEV.medium;
  return (
    <span style={{
      background: `color-mix(in srgb, ${cfg.color} 13%, transparent)`,
      border: `1px solid color-mix(in srgb, ${cfg.color} 35%, transparent)`,
      color: cfg.color, borderRadius: 999,
      padding: "2px 9px", fontSize: 11, fontWeight: 700,
      textTransform: "uppercase", letterSpacing: "0.06em",
      display: "inline-block", whiteSpace: "nowrap",
    }}>
      {cfg.label}
    </span>
  );
}

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || { label: status, color: "var(--muted)" };
  return (
    <span style={{
      background: `color-mix(in srgb, ${cfg.color} 11%, transparent)`,
      border: `1px solid color-mix(in srgb, ${cfg.color} 28%, transparent)`,
      color: cfg.color, borderRadius: 999,
      padding: "2px 9px", fontSize: 11, fontWeight: 700,
      textTransform: "uppercase", letterSpacing: "0.05em",
      display: "inline-block", whiteSpace: "nowrap",
    }}>
      {cfg.label}
    </span>
  );
}

function FeatureOnOffBadge({ on }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 12, fontWeight: 700,
      color: on ? "var(--success)" : "var(--muted)",
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: "50%",
        background: on ? "var(--success)" : "var(--muted)",
        flexShrink: 0,
      }} />
      {on ? "ON" : "OFF"}
    </span>
  );
}

/* ─── Shared tab bar ─────────────────────────────────────────────────────────*/

function TabBar({ tabs, active, onChange, secondary }) {
  return (
    <div style={{
      display: "flex", gap: secondary ? 4 : 6,
      marginBottom: secondary ? 16 : 20,
      ...(secondary ? {
        borderBottom: "1px solid var(--line)", paddingBottom: 0,
      } : {}),
    }}>
      {tabs.map(t => {
        const on = active === t.key;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            style={{
              padding: secondary ? "clamp(4px,0.4vw,7px) clamp(9px,0.9vw,14px)" : "clamp(5px,0.48vw,8px) clamp(12px,1.1vw,18px)",
              borderRadius: secondary ? "clamp(4px,0.4vw,7px) clamp(4px,0.4vw,7px) 0 0" : "clamp(5px,0.5vw,8px)",
              fontSize: secondary ? "clamp(10.5px,0.82vw,12px)" : "clamp(11px,0.85vw,13px)", fontWeight: 600, cursor: "pointer",
              border: `1px solid ${on
                ? "color-mix(in srgb, var(--accent) 50%, transparent)"
                : "var(--line)"}`,
              borderBottom: secondary && !on ? "1px solid var(--line)" : secondary && on ? "1px solid var(--panel)" : undefined,
              background: on
                ? "color-mix(in srgb, var(--accent) 9%, transparent)"
                : secondary ? "transparent" : "var(--panel)",
              color: on ? "var(--accent)" : "var(--muted)",
              display: "flex", alignItems: "center", gap: 6,
              marginBottom: secondary ? -1 : 0,
              position: secondary ? "relative" : undefined,
              zIndex: secondary && on ? 1 : undefined,
            }}
          >
            {t.label}
            {t.badge != null && t.badge > 0 && (
              <span style={{
                background: "var(--danger)", color: "#fff",
                borderRadius: 999, fontSize: 10, fontWeight: 800,
                padding: "1px 5px", minWidth: 16, textAlign: "center",
              }}>
                {t.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ─── Toast notification ─────────────────────────────────────────────────────*/

function Toast({ toasts }) {
  if (!toasts.length) return null;
  return (
    <div style={{
      position: "fixed", bottom: 20, right: 20,
      display: "flex", flexDirection: "column", gap: 8,
      zIndex: 9000,
    }}>
      {toasts.map(t => {
        const sevColor = t.severity ? SEV[t.severity]?.color : "var(--accent)";
        return (
          <div key={t.id} style={{
            background: "var(--panel)",
            border: `1px solid color-mix(in srgb, ${sevColor} 40%, transparent)`,
            borderLeft: `4px solid ${sevColor}`,
            borderRadius: 10, padding: "12px 16px",
            boxShadow: "var(--shadow-lg)",
            maxWidth: 340, minWidth: 260,
            animation: "slideInToast 0.25s ease",
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 3, color: "var(--fg)" }}>
              {t.title}
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>{t.body}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Configure Alert Modal ──────────────────────────────────────────────────*/

const CHANNELS = [
  { key: "inapp",    label: "In-app Notification", available: true  },
  { key: "email",    label: "Email",               available: false },
  { key: "whatsapp", label: "WhatsApp",             available: false },
  { key: "webhook",  label: "Webhook / Siren",      available: false },
];

function ConfigureModal({ feature, rule, featureEnabled, onSave, onClose }) {
  const [alertEnabled,    setAlertEnabled]    = useState(rule.alertEnabled);
  const [severity,        setSeverity]        = useState(rule.severity);
  const [triggerDuration, setTriggerDuration] = useState(rule.triggerDuration);
  const [cooldown,        setCooldown]        = useState(rule.cooldown);
  const [snapshotFull,    setSnapshotFull]    = useState(rule.snapshotFullFrame);
  const [snapshotCrop,    setSnapshotCrop]    = useState(rule.snapshotCrop);
  const [drawBbox,        setDrawBbox]        = useState(rule.drawBbox);

  const isEnvironmental = ["fire_detection", "smoke_detection", "fall_detection"].includes(feature.key);

  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.modal}>

        {/* Header */}
        <div style={S.modalHead}>
          <span>Configure Alert — {feature.label}</span>
          <button onClick={onClose} style={{
            background: "transparent", border: 0, color: "var(--muted)",
            fontSize: 20, padding: "0 4px", cursor: "pointer", lineHeight: 1, borderRadius: 4,
          }}>
            ×
          </button>
        </div>

        <div style={S.modalBody}>

          {/* Feature status banner */}
          <div style={{
            padding: "10px 14px", borderRadius: 8, fontSize: 13,
            background: featureEnabled
              ? "color-mix(in srgb, var(--success) 8%, transparent)"
              : "color-mix(in srgb, var(--warning) 8%, transparent)",
            border: `1px solid ${featureEnabled
              ? "color-mix(in srgb, var(--success) 25%, transparent)"
              : "color-mix(in srgb, var(--warning) 28%, transparent)"}`,
            color: featureEnabled ? "var(--success)" : "var(--warning)",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: "50%",
              background: featureEnabled ? "var(--success)" : "var(--warning)",
              flexShrink: 0,
            }} />
            {featureEnabled
              ? "Feature is ON — alerts can be enabled."
              : "Feature is currently OFF. Enable it from the Features page to activate alerts."}
          </div>

          {/* Alert toggle */}
          <div>
            <label style={S.label}>Alert Status</label>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Toggle
                enabled={alertEnabled && featureEnabled}
                onChange={() => featureEnabled && setAlertEnabled(v => !v)}
                disabled={!featureEnabled}
              />
              <span style={{
                fontSize: 14, fontWeight: 600,
                color: !featureEnabled ? "var(--muted)" : alertEnabled ? "var(--accent)" : "var(--muted)",
              }}>
                {!featureEnabled ? "Disabled — feature is OFF" : alertEnabled ? "Alert ON" : "Alert OFF"}
              </span>
            </div>
          </div>

          {/* Severity */}
          <div>
            <label style={S.label}>Severity</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {Object.entries(SEV).map(([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => setSeverity(key)}
                  style={{
                    padding: "6px 16px", borderRadius: 6,
                    fontSize: 13, fontWeight: 600, cursor: "pointer",
                    background: severity === key
                      ? `color-mix(in srgb, ${cfg.color} 14%, transparent)`
                      : "transparent",
                    border: `1.5px solid ${severity === key
                      ? `color-mix(in srgb, ${cfg.color} 55%, transparent)`
                      : "var(--line)"}`,
                    color: severity === key ? cfg.color : "var(--muted)",
                  }}
                >
                  {cfg.label}
                </button>
              ))}
            </div>
          </div>

          {/* Trigger condition */}
          <div>
            <label style={S.label}>Trigger Condition</label>
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              fontSize: 14, color: "var(--muted)", flexWrap: "wrap",
            }}>
              <span>
                {isEnvironmental
                  ? `${feature.label} detected for more than`
                  : "Missing PPE detected for more than"}
              </span>
              <input
                type="number" min={1} max={120}
                value={triggerDuration}
                onChange={e => setTriggerDuration(e.target.value)}
                style={{ ...S.input, width: 70, textAlign: "center" }}
              />
              <span>second{Number(triggerDuration) !== 1 ? "s" : ""}</span>
            </div>
          </div>

          {/* Cooldown */}
          <div>
            <label style={S.label}>Cooldown</label>
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              fontSize: 14, color: "var(--muted)", flexWrap: "wrap",
            }}>
              <span>Do not repeat the same alert for</span>
              <input
                type="number" min={10} max={3600}
                value={cooldown}
                onChange={e => setCooldown(e.target.value)}
                style={{ ...S.input, width: 80, textAlign: "center" }}
              />
              <span>seconds</span>
            </div>
          </div>

          {/* Notification channels */}
          <div>
            <label style={S.label}>Notification Channels</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {CHANNELS.map(ch => (
                <label key={ch.key} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "9px 12px", borderRadius: 7,
                  cursor: ch.available ? "pointer" : "default",
                  background: ch.available
                    ? "color-mix(in srgb, var(--accent) 5%, transparent)"
                    : "var(--bg-2)",
                  border: `1px solid ${ch.key === "inapp"
                    ? "color-mix(in srgb, var(--accent) 35%, transparent)"
                    : "var(--line)"}`,
                  opacity: ch.available ? 1 : 0.65,
                }}>
                  <input
                    type="checkbox"
                    checked={ch.key === "inapp"}
                    disabled={!ch.available}
                    onChange={() => {}}
                    style={{ accentColor: "var(--accent)", width: 14, height: 14 }}
                  />
                  <span style={{ fontSize: 14, flex: 1 }}>{ch.label}</span>
                  {!ch.available && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, color: "var(--muted)",
                      background: "var(--bg-2)", border: "1px solid var(--line)",
                      borderRadius: 999, padding: "2px 8px",
                      textTransform: "uppercase", letterSpacing: "0.05em",
                    }}>
                      Coming Soon
                    </span>
                  )}
                </label>
              ))}
            </div>
          </div>

          {/* Snapshot options */}
          <div>
            <label style={S.label}>Snapshot Options</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {[
                { key: "full", label: "Save full frame snapshot",     val: snapshotFull, set: setSnapshotFull },
                { key: "crop", label: "Save cropped object snapshot",  val: snapshotCrop, set: setSnapshotCrop },
                { key: "bbox", label: "Draw bounding box on snapshot", val: drawBbox,     set: setDrawBbox     },
              ].map(opt => (
                <label key={opt.key} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  fontSize: 14, cursor: "pointer",
                  padding: "8px 12px", borderRadius: 6,
                  background: opt.val
                    ? "color-mix(in srgb, var(--accent) 5%, transparent)"
                    : "transparent",
                  border: `1px solid ${opt.val
                    ? "color-mix(in srgb, var(--accent) 25%, transparent)"
                    : "var(--line)"}`,
                }}>
                  <input
                    type="checkbox"
                    checked={opt.val}
                    onChange={() => opt.set(v => !v)}
                    style={{ accentColor: "var(--accent)", width: 14, height: 14 }}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div style={S.modalFoot}>
          <button onClick={onClose} style={S.btn("var(--muted)", true)}>Cancel</button>
          <button
            onClick={() => onSave({
              alertEnabled: alertEnabled && featureEnabled,
              severity, cooldown: Number(cooldown),
              triggerDuration: Number(triggerDuration),
              channels: ["inapp"],
              snapshotFullFrame: snapshotFull,
              snapshotCrop, drawBbox,
            })}
            style={S.btn("var(--accent)")}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Alert Detail Modal ─────────────────────────────────────────────────────*/

function AlertDetailModal({ alert, onClose, onAction }) {
  const sevColor = SEV[alert.severity]?.color || "var(--muted)";

  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ ...S.modal, maxWidth: 580 }}>

        <div style={S.modalHead}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{
              width: 10, height: 10, borderRadius: "50%",
              background: sevColor, flexShrink: 0, display: "inline-block",
            }} />
            <span>{alert.title}</span>
          </div>
          <button onClick={onClose} style={{
            background: "transparent", border: 0, color: "var(--muted)",
            fontSize: 20, padding: "0 4px", cursor: "pointer", lineHeight: 1, borderRadius: 4,
          }}>
            ×
          </button>
        </div>

        <div style={S.modalBody}>

          {/* Snapshot placeholder */}
          <div style={{
            background: "var(--bg-2)", border: "1px solid var(--line)",
            borderRadius: 8, height: 170,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            color: "var(--muted)", gap: 6,
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <span style={{ fontSize: 13 }}>Snapshot not available in demo</span>
          </div>

          {/* Details grid */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10,
          }}>
            {[
              { label: "Feature",   value: alert.featureLabel },
              { label: "Severity",  value: <SeverityBadge severity={alert.severity} /> },
              { label: "Camera",    value: alert.camera },
              { label: "Status",    value: <StatusBadge status={alert.status} /> },
              { label: "Zone",      value: alert.zone || "—" },
              { label: "Time",      value: alert.time },
              ...(alert.personId ? [{ label: "Person ID", value: alert.personId }] : []),
            ].map((row, i) => (
              <div key={i} style={{
                padding: "10px 14px", borderRadius: 7,
                background: "var(--bg-2)", border: "1px solid var(--line)",
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>
                  {row.label}
                </div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{row.value}</div>
              </div>
            ))}
          </div>

          {/* Description */}
          <div style={{
            padding: "12px 14px", borderRadius: 7,
            background: "var(--bg-2)", border: "1px solid var(--line)",
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
              Description
            </div>
            <div style={{ fontSize: 14 }}>{alert.desc}</div>
          </div>

        </div>

        <div style={{ ...S.modalFoot, justifyContent: "space-between" }}>
          <button
            onClick={() => onAction("false_alert")}
            style={S.btn("var(--muted)", true)}
          >
            Mark as False Alert
          </button>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={onClose} style={S.btn("var(--muted)", true)}>Close</button>
            {alert.status === "open" && (
              <button onClick={() => onAction("acknowledged")} style={S.btn("var(--warning)")}>
                Acknowledge
              </button>
            )}
            {alert.status !== "resolved" && (
              <button onClick={() => onAction("resolved")} style={S.btn("var(--success)")}>
                Mark Resolved
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Coming Soon placeholder ────────────────────────────────────────────────*/

function ComingSoon({ label }) {
  return (
    <div style={{
      ...S.card, padding: "64px 20px", textAlign: "center",
    }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>🚧</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: "var(--fg)", marginBottom: 6 }}>
        Coming Soon
      </div>
      <div style={{ fontSize: 14, color: "var(--muted)" }}>
        {label} alert rules will be available in a future update.
      </div>
    </div>
  );
}

/* ─── Safety rules table ─────────────────────────────────────────────────────*/

const COL = "1fr 80px 130px 90px 110px 100px";

function SafetyRulesSection({ featureStates, rules, onRuleUpdate, onToast, setPage }) {
  const [configuring, setConfiguring] = useState(null);

  function getRule(feat) {
    return rules[feat.key] || defaultRule(feat);
  }

  function handleSave(rule) {
    onRuleUpdate(configuring.key, rule);
    onToast({
      id: Date.now(),
      title: `Alert rule saved — ${configuring.label}`,
      body: `Alert is now ${rule.alertEnabled ? "ON" : "OFF"} · Severity: ${SEV[rule.severity]?.label}`,
      severity: rule.severity,
    });
    setConfiguring(null);
  }

  return (
    <>
      <div style={S.card}>

        {/* Column headers */}
        <div style={{
          display: "grid", gridTemplateColumns: COL,
          padding: "clamp(6px,0.6vw,10px) clamp(10px,0.95vw,14px)",
          borderBottom: "1px solid var(--line)",
          fontSize: "clamp(9px,0.72vw,10.5px)", fontWeight: 700, color: "var(--muted)",
          textTransform: "uppercase", letterSpacing: "0.07em",
        }}>
          <span>Detection Feature</span>
          <span>Feature</span>
          <span>Alert</span>
          <span>Severity</span>
          <span>Last Alert</span>
          <span></span>
        </div>

        {SAFETY_FEATURES.map((feat, idx) => {
          const featureOn = !!featureStates[feat.key];
          const rule      = getRule(feat);
          const alertOn   = featureOn && rule.alertEnabled;
          const isLast    = idx === SAFETY_FEATURES.length - 1;

          return (
            <div key={feat.key} style={{
              display: "grid", gridTemplateColumns: COL,
              padding: "clamp(8px,0.75vw,12px) clamp(10px,0.95vw,14px)",
              borderBottom: isLast ? "none" : "1px solid var(--line)",
              alignItems: "center",
              background: !featureOn
                ? "color-mix(in srgb, var(--muted) 3%, transparent)"
                : "transparent",
              transition: "background 0.15s",
            }}>

              {/* Feature name + hint */}
              <div>
                <div style={{ fontSize: "clamp(11px,0.88vw,13px)", fontWeight: 600, marginBottom: !featureOn ? 3 : 0 }}>
                  {feat.label}
                </div>
                {!featureOn && (
                  <div style={{ fontSize: "clamp(10px,0.78vw,11.5px)", color: "var(--muted)", lineHeight: 1.4 }}>
                    Turn on this feature from Features to enable alerts.
                  </div>
                )}
              </div>

              {/* Feature ON/OFF */}
              <div><FeatureOnOffBadge on={featureOn} /></div>

              {/* Alert toggle + label */}
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <Toggle
                  enabled={alertOn}
                  onChange={() => {
                    if (!featureOn) return;
                    onRuleUpdate(feat.key, { ...rule, alertEnabled: !rule.alertEnabled });
                  }}
                  disabled={!featureOn}
                />
                <span style={{
                  fontSize: 12, fontWeight: 700,
                  color: !featureOn ? "var(--muted)" : alertOn ? "var(--accent)" : "var(--muted)",
                }}>
                  {!featureOn ? "Disabled" : alertOn ? "ON" : "OFF"}
                </span>
              </div>

              {/* Severity */}
              <div>
                {featureOn
                  ? <SeverityBadge severity={rule.severity} />
                  : <span style={{ fontSize: 12, color: "var(--muted)" }}>—</span>}
              </div>

              {/* Last alert */}
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                {alertOn ? "2 min ago" : "—"}
              </div>

              {/* Action */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                {!featureOn ? (
                  <button
                    onClick={() => setPage(`feat/safety/${feat.key}`)}
                    style={{
                      ...S.btn("var(--accent)", true),
                      fontSize: 12, padding: "5px 11px",
                    }}
                  >
                    Manage Feature
                  </button>
                ) : (
                  <button
                    onClick={() => setConfiguring(feat)}
                    style={{ ...S.btn("var(--accent)"), fontSize: 12, padding: "5px 11px" }}
                  >
                    Configure
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary bar */}
      <div style={{
        display: "flex", gap: 16, flexWrap: "wrap",
        padding: "10px 4px", fontSize: 13, color: "var(--muted)",
      }}>
        <span>
          <b style={{ color: "var(--fg)" }}>
            {SAFETY_FEATURES.filter(f => featureStates[f.key]).length}
          </b> features ON
        </span>
        <span>
          <b style={{ color: "var(--accent)" }}>
            {SAFETY_FEATURES.filter(f => featureStates[f.key] && (rules[f.key]?.alertEnabled)).length}
          </b> alerts active
        </span>
        <span>
          <b style={{ color: "var(--muted)" }}>
            {SAFETY_FEATURES.filter(f => !featureStates[f.key]).length}
          </b> features OFF (alerts disabled)
        </span>
      </div>

      {configuring && (
        <ConfigureModal
          feature={configuring}
          rule={getRule(configuring)}
          featureEnabled={!!featureStates[configuring.key]}
          onSave={handleSave}
          onClose={() => setConfiguring(null)}
        />
      )}
    </>
  );
}

/* ─── Alert Rules Tab ────────────────────────────────────────────────────────*/

function AlertRulesTab({ featureStates, rules, onRuleUpdate, onToast, setPage }) {
  const [cat, setCat] = useState("safety");

  return (
    <div>
      <TabBar
        secondary
        tabs={[
          { key: "safety",     label: "Safety" },
          { key: "operations", label: "Operations" },
          { key: "security",   label: "Security" },
        ]}
        active={cat}
        onChange={setCat}
      />
      {cat === "safety" && (
        <SafetyRulesSection
          featureStates={featureStates}
          rules={rules}
          onRuleUpdate={onRuleUpdate}
          onToast={onToast}
          setPage={setPage}
        />
      )}
      {cat === "operations" && <ComingSoon label="Operations" />}
      {cat === "security"   && <ComingSoon label="Security" />}
    </div>
  );
}

/* ─── Live Alerts Tab ────────────────────────────────────────────────────────*/

function LiveAlertsTab({ onToast }) {
  const [alerts, setAlerts] = useState(MOCK_LIVE);
  const [detail, setDetail] = useState(null);

  function handleAction(id, action) {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, status: action } : a));
    setDetail(null);
  }

  const openCount = alerts.filter(a => a.status === "open").length;

  return (
    <div>
      {/* Header row */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 14,
      }}>
        <div style={{ fontSize: 14 }}>
          {openCount > 0
            ? <span style={{ color: "var(--danger)", fontWeight: 700 }}>
                {openCount} open alert{openCount !== 1 ? "s" : ""}
              </span>
            : <span style={{ color: "var(--success)", fontWeight: 600 }}>All clear — no open alerts</span>}
        </div>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>Updates when alerts are triggered</span>
      </div>

      {/* Alert cards */}
      {alerts.length === 0 ? (
        <div style={{
          ...S.card, padding: "60px 20px", textAlign: "center",
          color: "var(--muted)", fontSize: 14,
        }}>
          No live alerts. All clear.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {alerts.map(alert => {
            const sevColor = SEV[alert.severity]?.color || "var(--muted)";
            return (
              <div key={alert.id} style={{
                ...S.card, marginBottom: 0,
                borderLeft: `3px solid ${sevColor}`,
              }}>
                <div style={{ padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>

                    {/* Snapshot placeholder */}
                    <div style={{
                      width: 88, height: 60, borderRadius: 7, flexShrink: 0,
                      background: "var(--bg-2)", border: "1px solid var(--line)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                      </svg>
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        display: "flex", alignItems: "center",
                        gap: 8, flexWrap: "wrap", marginBottom: 5,
                      }}>
                        <SeverityBadge severity={alert.severity} />
                        <span style={{ fontSize: 15, fontWeight: 700 }}>{alert.title}</span>
                        <StatusBadge status={alert.status} />
                      </div>

                      <div style={{
                        display: "flex", gap: 14, flexWrap: "wrap",
                        fontSize: 13, color: "var(--muted)", marginBottom: 4,
                      }}>
                        <span>Camera: {alert.camera}</span>
                        {alert.zone     && <span>Zone: {alert.zone}</span>}
                        {alert.personId && <span>Person: {alert.personId}</span>}
                        <span>Time: {alert.time}</span>
                      </div>

                      <div style={{ fontSize: 13, color: "var(--fg-2)" }}>{alert.desc}</div>
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                      <button
                        onClick={() => setDetail(alert)}
                        style={{ ...S.btn("var(--accent)", true), fontSize: 12, padding: "5px 12px" }}
                      >
                        View
                      </button>
                      {alert.status === "open" && (
                        <button
                          onClick={() => handleAction(alert.id, "acknowledged")}
                          style={{ ...S.btn("var(--warning)", true), fontSize: 12, padding: "5px 12px" }}
                        >
                          Acknowledge
                        </button>
                      )}
                      {alert.status !== "resolved" && (
                        <button
                          onClick={() => handleAction(alert.id, "resolved")}
                          style={{ ...S.btn("var(--success)", true), fontSize: 12, padding: "5px 12px" }}
                        >
                          Resolve
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {detail && (
        <AlertDetailModal
          alert={detail}
          onClose={() => setDetail(null)}
          onAction={action => handleAction(detail.id, action)}
        />
      )}
    </div>
  );
}

/* ─── Alert History Tab ──────────────────────────────────────────────────────*/

function AlertHistoryTab() {
  const [detail,  setDetail]  = useState(null);
  const [filters, setFilters] = useState({ severity: "", status: "", feature: "" });

  const filtered = MOCK_HISTORY.filter(r => {
    if (filters.severity && r.severity !== filters.severity) return false;
    if (filters.status   && r.status   !== filters.status)   return false;
    if (filters.feature  && !r.featureLabel.toLowerCase().includes(filters.feature.toLowerCase())) return false;
    return true;
  });

  const hasFilter = filters.severity || filters.status || filters.feature;

  return (
    <div>
      {/* Filters */}
      <div style={{
        display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center",
      }}>
        <input
          style={{ ...S.input, width: 190, fontSize: 13 }}
          placeholder="Search by feature…"
          value={filters.feature}
          onChange={e => setFilters(f => ({ ...f, feature: e.target.value }))}
        />
        <select
          style={{ ...S.select, width: 140 }}
          value={filters.severity}
          onChange={e => setFilters(f => ({ ...f, severity: e.target.value }))}
        >
          <option value="">All Severities</option>
          {Object.entries(SEV).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select
          style={{ ...S.select, width: 155 }}
          value={filters.status}
          onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
        >
          <option value="">All Statuses</option>
          <option value="resolved">Resolved</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="false_alert">False Alert</option>
        </select>
        {hasFilter && (
          <button
            onClick={() => setFilters({ severity: "", status: "", feature: "" })}
            style={{ ...S.btn("var(--muted)", true), fontSize: 12 }}
          >
            Clear filters
          </button>
        )}
        <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--muted)" }}>
          {filtered.length} result{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div style={S.card}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--line)" }}>
              {["Time", "Feature", "Camera", "Zone", "Severity", "Status", "Actions"].map(col => (
                <th key={col} style={{
                  padding: "clamp(6px,0.58vw,10px) clamp(9px,0.85vw,13px)", textAlign: "left",
                  fontSize: "clamp(9px,0.72vw,10.5px)", fontWeight: 700, color: "var(--muted)",
                  textTransform: "uppercase", letterSpacing: "0.07em",
                }}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} style={{
                  padding: "48px 14px", textAlign: "center",
                  color: "var(--muted)", fontSize: 14,
                }}>
                  No history matching the current filters.
                </td>
              </tr>
            ) : filtered.map((row, idx) => (
              <tr key={row.id} style={{
                borderBottom: idx < filtered.length - 1
                  ? "1px solid var(--line)"
                  : "none",
              }}>
                <td style={{ padding: "clamp(7px,0.68vw,11px) clamp(9px,0.85vw,13px)", fontSize: "clamp(10px,0.78vw,11.5px)", color: "var(--muted)", whiteSpace: "nowrap" }}>
                  {row.time}
                </td>
                <td style={{ padding: "clamp(7px,0.68vw,11px) clamp(9px,0.85vw,13px)", fontSize: "clamp(11px,0.85vw,13px)", fontWeight: 500 }}>
                  {row.featureLabel}
                </td>
                <td style={{ padding: "clamp(7px,0.68vw,11px) clamp(9px,0.85vw,13px)", fontSize: "clamp(10.5px,0.82vw,12px)" }}>{row.camera}</td>
                <td style={{ padding: "clamp(7px,0.68vw,11px) clamp(9px,0.85vw,13px)", fontSize: "clamp(10.5px,0.82vw,12px)", color: "var(--muted)" }}>
                  {row.zone || "—"}
                </td>
                <td style={{ padding: "clamp(7px,0.68vw,11px) clamp(9px,0.85vw,13px)" }}>
                  <SeverityBadge severity={row.severity} />
                </td>
                <td style={{ padding: "clamp(7px,0.68vw,11px) clamp(9px,0.85vw,13px)" }}>
                  <StatusBadge status={row.status} />
                </td>
                <td style={{ padding: "clamp(7px,0.68vw,11px) clamp(9px,0.85vw,13px)" }}>
                  <button
                    onClick={() => setDetail({
                      ...row,
                      title: row.featureLabel,
                      desc:  `${row.featureLabel} alert triggered at ${row.camera}.`,
                      personId: null,
                    })}
                    style={{ ...S.btn("var(--accent)", true), fontSize: 12, padding: "5px 11px" }}
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detail && (
        <AlertDetailModal
          alert={detail}
          onClose={() => setDetail(null)}
          onAction={() => setDetail(null)}
        />
      )}
    </div>
  );
}

/* ─── Main AlertsPage export ─────────────────────────────────────────────────*/

export default function AlertsPage({ setPage }) {
  const [tab,           setTab]           = useState("rules");
  const [rules,         setRules]         = useState(loadRules);
  const [featureStates, setFeatureStates] = useState({});
  const [toasts,        setToasts]        = useState([]);

  // Load feature states: localStorage first, then API overlay
  useEffect(() => {
    setFeatureStates(loadLocalFeatures());
    getFeatures()
      .then(list => {
        setFeatureStates(prev => {
          const next = { ...prev };
          list.forEach(f => { next[f.key] = f.enabled; });
          return next;
        });
      })
      .catch(() => {});
  }, []);

  const addToast = useCallback((toast) => {
    setToasts(prev => [...prev, toast]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== toast.id)), 4000);
  }, []);

  function handleRuleUpdate(key, rule) {
    const next = { ...rules, [key]: rule };
    setRules(next);
    persistRules(next);
  }

  const liveOpenCount = MOCK_LIVE.filter(a => a.status === "open").length;

  return (
    <>
      <style>{`
        @keyframes slideInToast {
          from { opacity: 0; transform: translateX(24px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>

      <div style={{ maxWidth: 920 }}>
        <TabBar
          tabs={[
            { key: "rules",   label: "Alert Rules" },
            { key: "live",    label: "Live Alerts", badge: liveOpenCount },
            { key: "history", label: "Alert History" },
          ]}
          active={tab}
          onChange={setTab}
        />

        {tab === "rules" && (
          <AlertRulesTab
            featureStates={featureStates}
            rules={rules}
            onRuleUpdate={handleRuleUpdate}
            onToast={addToast}
            setPage={setPage}
          />
        )}
        {tab === "live"    && <LiveAlertsTab onToast={addToast} />}
        {tab === "history" && <AlertHistoryTab />}
      </div>

      <Toast toasts={toasts} />
    </>
  );
}
