import { getJson, patchJson } from "./client.js";

export function getFeatures() {
  return getJson("/features");
}

export function toggleFeature(featureKey) {
  return patchJson(`/features/${featureKey}/toggle`);
}
