// Shared helpers for reading/writing the "enabled" state of every feature,
// so the Add-Features and Manage-Features pages stay consistent with the
// detection pipeline.
//
// Persistence is split three ways (kept identical to the original behavior):
//   • backend-backed features (PPE + face recognition) → /features API
//   • loading_unloading                                → /loading/config API
//   • everything else                                  → localStorage["vfr_features"]

import { getFeatures, toggleFeature } from "../../api/features.js";
import { getLoadingConfig, saveLoadingConfig } from "../../api/loading.js";
import { FEATURE_GROUPS, PPE_BACKED_KEYS, FACE_RECOGNITION_KEY } from "./featuresDef.jsx";

export const isBackendFeature = (key) => PPE_BACKED_KEYS.has(key) || key === FACE_RECOGNITION_KEY;
export const isLoadingFeature = (key) => key === "loading_unloading";

// Flatten the grouped definition into a single list, carrying the group label.
export function flatFeatures() {
  return FEATURE_GROUPS.flatMap(group =>
    group.features.map(f => ({
      ...f,
      group: group.key,
      groupLabel: group.label,
      groupIcon: group.icon,
    }))
  );
}

function readLocal() {
  try { return JSON.parse(localStorage.getItem("vfr_features") || "{}"); }
  catch { return {}; }
}

function writeLocal(key, value) {
  const saved = readLocal();
  localStorage.setItem("vfr_features", JSON.stringify({ ...saved, [key]: value }));
}

// Build a { [featureKey]: boolean } map: localStorage base + backend overlay.
export async function loadEnabledMap() {
  const map = { ...readLocal() };
  try {
    const list = await getFeatures();
    for (const f of list) map[f.key] = !!f.enabled;
  } catch { /* offline / not backend-backed */ }
  try {
    const lc = await getLoadingConfig();
    map.loading_unloading = !!lc.enabled;
  } catch { /* loading config unavailable */ }
  return map;
}

// Persist a feature's enabled state through the right backend/local channel.
export async function setFeatureEnabled(key, next) {
  if (isLoadingFeature(key)) {
    const current = await getLoadingConfig();
    const saved = await saveLoadingConfig({ ...current, enabled: next });
    return !!saved.enabled;
  }
  if (isBackendFeature(key)) {
    // The backend endpoint flips; callers pass next = !current, so it lands right.
    const updated = await toggleFeature(key);
    return !!updated.enabled;
  }
  writeLocal(key, next);
  return next;
}
