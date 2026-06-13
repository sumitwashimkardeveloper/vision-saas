export const FEATURE_GROUPS = [
  {
    key: "safety",
    label: "Safety",
    color: "var(--accent)",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    features: [
      { key: "helmet_detection",      label: "Helmet Detection" },
      { key: "vest_detection",        label: "Vest Detection" },
      { key: "gloves_detection",      label: "Gloves Detection" },
      { key: "goggles_detection",     label: "Goggles Detection" },
      { key: "mask_detection",        label: "Mask Detection" },
      { key: "fire_detection",        label: "Fire Detection" },
      { key: "smoke_detection",       label: "Smoke Detection" },
      { key: "fall_detection",        label: "Fall Detection" },
    ],
  },
  {
    key: "security",
    label: "Security",
    color: "var(--accent)",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
    features: [
      { key: "face_recognition",  label: "Face Recognition", configType: "face_recognition" },
      { key: "intrusion",         label: "Intrusion Detection" },
      { key: "restricted_area",   label: "Restricted Area Detection" },
      { key: "weapon_detection",  label: "Weapon Detection" },
      { key: "loitering",         label: "Loitering Detection" },
    ],
  },
  {
    key: "operations",
    label: "Operations",
    color: "var(--accent)",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
    features: [
      { key: "worker_counting",   label: "Worker Counting" },
      { key: "machine_idle",      label: "Machine Idle Detection" },
      { key: "queue_detection",   label: "Queue Detection" },
      { key: "loading_unloading", label: "Loading / Unloading Tracking", configType: "loading_unloading" },
    ],
  },
  {
    key: "compliance",
    label: "Compliance",
    color: "var(--accent)",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
    features: [
      { key: "ppe_compliance",          label: "PPE Compliance" },
      { key: "zone_compliance",         label: "Zone Compliance" },
      { key: "attendance_compliance",   label: "Attendance Compliance" },
      { key: "incident_reports",        label: "Incident Reports" },
    ],
  },
];

// Non-PPE feature key persisted via the same /features API (gates face recognition).
export const FACE_RECOGNITION_KEY = "face_recognition";

// Keys that are backed by the real-time YOLO model and persisted via API.
export const PPE_BACKED_KEYS = new Set([
  "helmet_detection",
  "vest_detection",
  "gloves_detection",
  "goggles_detection",
  "mask_detection",
]);
