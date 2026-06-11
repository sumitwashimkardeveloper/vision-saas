import { useState, useEffect } from "react";
import { getFeatures, toggleFeature } from "../../api/features.js";

const PPE_EMOJI = {
  helmet:         "⛑️",
  safety_vest:    "🦺",
  face_mask:      "😷",
  gloves:         "🧤",
  safety_goggles: "🥽",
  safety_shoes:   "👢",
  full_body_suit: "🥼",
};

function Toggle({ enabled, onChange, disabled }) {
  return (
    <button
      className={"ppe-toggle" + (enabled ? " on" : "")}
      onClick={onChange}
      disabled={disabled}
      aria-label={enabled ? "Disable" : "Enable"}
    >
      <span className="ppe-toggle-thumb" />
    </button>
  );
}

function FeatureCard({ feature, onToggle }) {
  const [busy, setBusy] = useState(false);

  async function handleToggle() {
    setBusy(true);
    try {
      await onToggle(feature.key);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={"ppe-card" + (feature.enabled ? " enabled" : "")}>
      <div className="ppe-card-top">
        <span className="ppe-emoji">{PPE_EMOJI[feature.key] ?? "🔲"}</span>
        <Toggle enabled={feature.enabled} onChange={handleToggle} disabled={busy} />
      </div>
      <div className="ppe-card-label">{feature.label}</div>
      <div className="ppe-card-desc">{feature.description}</div>
      {feature.enabled && (
        <span className="tag" style={{
          marginTop: 10,
          background: "rgba(34,197,94,0.12)",
          color: "#22c55e",
          fontSize: 11,
        }}>
          Active
        </span>
      )}
    </div>
  );
}

export default function FeaturesPage() {
  const [features, setFeatures] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  useEffect(() => {
    getFeatures()
      .then(setFeatures)
      .catch(() => setError("Failed to load features."))
      .finally(() => setLoading(false));
  }, []);

  async function handleToggle(key) {
    const updated = await toggleFeature(key);
    setFeatures(prev => prev.map(f => (f.key === updated.key ? updated : f)));
  }

  if (loading) {
    return <div className="panel" style={{ color: "var(--muted)", fontSize: 13 }}>Loading…</div>;
  }
  if (error) {
    return <div className="panel" style={{ color: "var(--danger)", fontSize: 13 }}>{error}</div>;
  }

  const activeCount = features.filter(f => f.enabled).length;

  return (
    <div>
      <div className="panel" style={{ marginBottom: 20 }}>
        <h2 style={{ margin: "0 0 6px" }}>PPE Detection</h2>
        <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>
          Toggle which protective equipment the system monitors on camera feeds.
          {activeCount > 0
            ? ` ${activeCount} item${activeCount !== 1 ? "s" : ""} active — restart the worker to apply changes.`
            : " All items are currently off."}
        </p>
      </div>

      <div className="ppe-grid">
        {features.map(f => (
          <FeatureCard key={f.key} feature={f} onToggle={handleToggle} />
        ))}
      </div>
    </div>
  );
}
