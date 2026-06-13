import { getJson, patchJson, putJson } from "./client.js";

export function getFeatures() {
  return getJson("/features");
}

export function toggleFeature(featureKey) {
  return patchJson(`/features/${featureKey}/toggle`);
}

export function setFeatureCameras(featureKey, cameraIds) {
  return putJson(`/features/${featureKey}/cameras`, { camera_ids: cameraIds });
}
