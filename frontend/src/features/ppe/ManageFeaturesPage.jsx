import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { FEATURE_GROUPS } from "./featuresDef.jsx";
import { flatFeatures, loadEnabledMap } from "./featureState.js";

function Stat({ icon, label, value }) {
  return (
    <div style={{
      flex: 1, minWidth: 140,
      display: "flex", alignItems: "center", gap: 16,
      padding: "20px 24px",
      background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 14,
      boxShadow: "var(--shadow)",
    }}>
      <span style={{
        width: 48, height: 48, borderRadius: 12, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "var(--accent-soft)", color: "var(--accent)",
      }}>{icon}</span>
      <span>
        <span style={{ display: "block", fontSize: 14, color: "var(--fg-2)", fontWeight: 500, marginBottom: 2 }}>{label}</span>
        <span style={{ display: "block", fontSize: 32, fontWeight: 800, lineHeight: 1, color: "#0F2740" }}>{value}</span>
      </span>
    </div>
  );
}

function ManageCard({ feature, group, onManage }) {
  return (
    <div style={{
      background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12,
      padding: "18px 18px 16px", display: "flex", flexDirection: "column", gap: 10,
      boxShadow: "var(--shadow)", position: "relative",
    }}>
      <span style={{
        position: "absolute", top: 14, right: 14,
        padding: "3px 11px", borderRadius: 999, fontSize: 12, fontWeight: 700,
        background: group.badgeBg, color: group.badgeColor,
        border: "1px solid color-mix(in srgb, var(--accent) 25%, transparent)",
        letterSpacing: "0.01em",
      }}>
        {group.label}
      </span>

      <div style={{
        width: 58, height: 58, borderRadius: 16, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: group.badgeBg, color: group.color,
      }}>
        {feature.icon}
      </div>

      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: "#0F2740", marginBottom: 6, paddingRight: 60, lineHeight: 1.3 }}>
          {feature.label}
        </div>
        <div style={{ fontSize: 13, color: "#5F7183", lineHeight: 1.6 }}>
          {feature.desc}
        </div>
      </div>

      <button
        onClick={onManage}
        style={{
          marginTop: 6, padding: "10px 0", width: "100%", fontSize: 14, fontWeight: 700,
          borderRadius: 8, cursor: "pointer",
          background: "var(--accent-soft)",
          border: "1.5px solid var(--accent)",
          color: "var(--accent)",
          letterSpacing: "0.01em",
        }}
      >
        Manage
      </button>
    </div>
  );
}

function GridIcon()   { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>; }
function LayersIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>; }
function SearchIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>; }
function ChevronIcon(){ return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>; }

export default function ManageFeaturesPage() {
  const navigate = useNavigate();
  const [enabledMap, setEnabledMap] = useState({});
  const [loaded, setLoaded]         = useState(false);
  const [search, setSearch]         = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const all = flatFeatures();

  const load = useCallback(() => {
    loadEnabledMap().then(map => { setEnabledMap(map); setLoaded(true); });
  }, []);
  useEffect(() => { load(); }, [load]);

  const active = all.filter(f => enabledMap[f.key]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return active.filter(f => {
      const group = FEATURE_GROUPS.find(g => g.key === f.group);
      if (categoryFilter !== "all" && f.group !== categoryFilter) return false;
      if (q && !f.label.toLowerCase().includes(q) && !group?.label.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [active, categoryFilter, search]);

  return (
    <div>
      {/* Stats */}
      <div style={{ display: "flex", gap: 14, marginBottom: 24 }}>
        <Stat icon={<GridIcon />}   label="Active Features" value={active.length} />
        <Stat icon={<LayersIcon />} label="Categories"      value={FEATURE_GROUPS.length} />
      </div>

      {/* Filter row */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 0 18px" }}>
        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            style={{
              paddingLeft: 14, paddingRight: 36, paddingTop: 9, paddingBottom: 9,
              fontSize: 14, fontWeight: 500, borderRadius: 8, border: "1px solid var(--line)",
              background: "var(--panel)", color: "#0F2740", cursor: "pointer",
              appearance: "none", minWidth: 160,
            }}
          >
            <option value="all">All Categories</option>
            {FEATURE_GROUPS.map(g => <option key={g.key} value={g.key}>{g.label}</option>)}
          </select>
          <span style={{ position: "absolute", right: 10, color: "var(--muted)", pointerEvents: "none", display: "flex" }}>
            <ChevronIcon />
          </span>
        </div>

        <div style={{ position: "relative", minWidth: 220 }}>
          <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", display: "flex" }}>
            <SearchIcon />
          </span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search features..."
            style={{
              paddingLeft: 34, paddingRight: 12, paddingTop: 9, paddingBottom: 9,
              fontSize: 14, borderRadius: 8, border: "1px solid var(--line)",
              background: "var(--panel)", color: "#0F2740", outline: "none", width: "100%",
            }}
          />
        </div>
      </div>

      {/* Card grid */}
      {!loaded ? (
        <p style={{ color: "var(--muted)" }}>Loading features…</p>
      ) : active.length === 0 ? (
        <div className="panel" style={{ textAlign: "center", color: "var(--muted)", padding: "40px 20px" }}>
          No active features yet. Enable features from <strong>Add Features</strong>.
        </div>
      ) : filtered.length === 0 ? (
        <div className="panel" style={{ textAlign: "center", color: "var(--muted)", padding: "40px 20px" }}>
          No features match your filters.
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: 14,
        }}>
          {filtered.map(f => {
            const group = FEATURE_GROUPS.find(g => g.key === f.group);
            return (
              <ManageCard
                key={f.key}
                feature={f}
                group={group}
                onManage={() => navigate(`/features/${f.group}/${f.key}`)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
