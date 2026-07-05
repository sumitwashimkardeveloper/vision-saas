// Per-feature SVG icons
const I = {
  helmet: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2C8 2 4 5.5 4 10v1h16v-1c0-4.5-4-8-8-8z" fill="currentColor" fillOpacity=".15"/><path d="M12 2C8 2 4 5.5 4 10v1h16v-1c0-4.5-4-8-8-8z"/><path d="M2 11h20"/><path d="M5 11v2a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2"/></svg>,
  vest:   <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7l-4-4H8L4 7l3 2v10h10V9l3-2z" fill="currentColor" fillOpacity=".15"/><path d="M20 7l-4-4H8L4 7l3 2v10h10V9l3-2z"/><line x1="12" y1="3" x2="12" y2="19"/></svg>,
  gloves: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M18 11V8a2 2 0 0 0-4 0v3" fill="currentColor" fillOpacity=".15"/><path d="M14 8V6a2 2 0 0 0-4 0v2m-2 5V8a2 2 0 0 0-4 0v8a6 6 0 0 0 12 0v-5a2 2 0 0 0-4 0"/><path d="M18 11V8a2 2 0 0 0-4 0v3"/></svg>,
  goggles:<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="8" width="8" height="8" rx="3" fill="currentColor" fillOpacity=".15"/><rect x="14" y="8" width="8" height="8" rx="3" fill="currentColor" fillOpacity=".15"/><rect x="2" y="8" width="8" height="8" rx="3"/><rect x="14" y="8" width="8" height="8" rx="3"/><line x1="10" y1="12" x2="14" y2="12"/></svg>,
  mask:   <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8s2-2 8-2 8 2 8 2v6s-2 3-8 3-8-3-8-3V8z" fill="currentColor" fillOpacity=".15"/><path d="M4 8s2-2 8-2 8 2 8 2v6s-2 3-8 3-8-3-8-3V8z"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="9" y1="14.5" x2="15" y2="14.5"/></svg>,
  fire:   <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 14c0 2 1.5 3.5 3.5 3.5s3.5-1.5 3.5-3.5c0-2-1.5-4-3.5-6-1 1.5-3.5 4-3.5 6z" fill="currentColor" fillOpacity=".25"/><path d="M12 22c4 0 7-3 7-7 0-3.5-2-6-4-8.5C14 8 12 9.5 12 11c0-3-2-6-4-8C6 6 5 8.5 5 11c0 4 2.5 7 5.5 8.5" /><path d="M12 22c1.5 0 3-1.5 3-3s-1.5-3-3-3-3 1.5-3 3 1.5 3 3 3z"/></svg>,
  smoke:  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14c0-2 2-4 4-3 0-3 3-5 6-3 3-2 6 0 6 3"/><path d="M4 18c0-1 2-2 4-1 0-2 2-3 4-2 2-1 4 0 4 2 2 0 4 1 4 2"/><path d="M6 21c0-.5 1-1 2-.7 0-1 1-1.5 2-1.2 1-.4 2 0 2 1 1 0 2 .5 2 1"/></svg>,
  fall:   <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="4" r="2"/><path d="M10 14l-3 6" /><path d="M14 14l3 6"/><path d="M8 9l4 5 4-3" fill="none"/><line x1="5" y1="21" x2="19" y2="21"/></svg>,
  face:   <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="5" height="5" rx="1"/><rect x="16" y="3" width="5" height="5" rx="1"/><rect x="3" y="16" width="5" height="5" rx="1"/><rect x="16" y="16" width="5" height="5" rx="1"/><circle cx="12" cy="10" r="3"/><path d="M9 16c0-1.7 1.3-3 3-3s3 1.3 3 3"/></svg>,
  intrusion:<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="6" r="2.5"/><path d="M5 20v-3a4 4 0 0 1 4-4h0"/><path d="M19 8l-5 5"/><path d="M19 13l-5-5"/><circle cx="17" cy="10" r="4" fill="currentColor" fillOpacity=".1"/></svg>,
  restricted:<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" fill="currentColor" fillOpacity=".1"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><line x1="12" y1="14" x2="12" y2="17"/><circle cx="12" cy="13" r="0.8" fill="currentColor"/></svg>,
  weapon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12h13l2-3h3l1 3-1 3h-3l-2-3" fill="currentColor" fillOpacity=".1"/><path d="M2 12h13l2-3h3l1 3-1 3h-3l-2-3H2z"/><line x1="6" y1="12" x2="6" y2="16"/></svg>,
  loitering:<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="5" r="2"/><path d="M6 20v-6H4l2-6h4l2 6H10v6"/><circle cx="17" cy="5" r="2"/><path d="M17 10v10"/><path d="M14 13h6"/></svg>,
  workers:<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="6" r="2"/><circle cx="16" cy="6" r="2"/><path d="M6 20v-5H4l2-5h4l2 5H10v5"/><path d="M14 20v-5h-1l1.5-5h3L19 15h-1v5"/></svg>,
  machine:<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" fill="currentColor" fillOpacity=".1"/><circle cx="12" cy="12" r="4"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M4.9 4.9l2.1 2.1m9.9 9.9 2.1 2.1M4.9 19.1l2.1-2.1m9.9-9.9 2.1-2.1"/><line x1="10" y1="10" x2="14" y2="14" strokeDasharray="1 1.5"/></svg>,
  queue:  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="5" cy="6" r="1.8"/><circle cx="12" cy="6" r="1.8"/><circle cx="19" cy="6" r="1.8"/><path d="M5 9v8m7-8v8m7-8v8"/><line x1="3" y1="20" x2="21" y2="20"/></svg>,
  loading:<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="14" height="10" rx="1" fill="currentColor" fillOpacity=".1"/><rect x="2" y="7" width="14" height="10" rx="1"/><path d="M16 10h4l2 3v4h-6V10z" fill="currentColor" fillOpacity=".1"/><path d="M16 10h4l2 3v4h-6V10z"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="19" r="2"/></svg>,
  ppe:    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" fill="currentColor" fillOpacity=".08"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
  zone:   <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" fill="currentColor" fillOpacity=".1"/><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>,
  attend: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" fill="currentColor" fillOpacity=".08"/><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M9 16l2 2 4-4"/></svg>,
  incident:<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="currentColor" fillOpacity=".08"/><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="11" x2="12" y2="15"/><circle cx="12" cy="17.5" r=".8" fill="currentColor" stroke="none"/></svg>,
};

export const FEATURE_GROUPS = [
  {
    key: "safety", label: "Safety",
    color: "var(--accent)", badgeBg: "var(--accent-soft)", badgeColor: "var(--accent)",
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
    features: [
      { key: "helmet_detection",  label: "Helmet Detection",  icon: I.helmet,  desc: "Detects individuals not wearing helmets in monitored areas" },
      { key: "vest_detection",    label: "Vest Detection",    icon: I.vest,    desc: "Detects individuals not wearing safety vests" },
      { key: "gloves_detection",  label: "Gloves Detection",  icon: I.gloves,  desc: "Detects individuals not wearing protective gloves" },
      { key: "goggles_detection", label: "Goggles Detection", icon: I.goggles, desc: "Detects individuals not wearing safety goggles" },
      { key: "mask_detection",    label: "Mask Detection",    icon: I.mask,    desc: "Detects individuals not wearing face masks" },
      { key: "fire_detection",    label: "Fire Detection",    icon: I.fire,    desc: "Detects fire and smoke in monitored areas" },
      { key: "smoke_detection",   label: "Smoke Detection",   icon: I.smoke,   desc: "Detects smoke and potential fire hazards" },
      { key: "fall_detection",    label: "Fall Detection",    icon: I.fall,    desc: "Detects falls and unusual body positions" },
    ],
  },
  {
    key: "security", label: "Security",
    color: "var(--accent)", badgeBg: "var(--accent-soft)", badgeColor: "var(--accent)",
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
    features: [
      { key: "face_recognition",  label: "Face Recognition",           icon: I.face,       desc: "Identifies and verifies individuals using facial recognition", configType: "face_recognition" },
      { key: "intrusion",         label: "Intrusion Detection",        icon: I.intrusion,  desc: "Detects unauthorized access in restricted areas" },
      { key: "restricted_area",   label: "Restricted Area Detection",  icon: I.restricted, desc: "Monitors and alerts for restricted area violations" },
      { key: "weapon_detection",  label: "Weapon Detection",           icon: I.weapon,     desc: "Detects weapons and dangerous objects" },
      { key: "loitering",         label: "Loitering Detection",        icon: I.loitering,  desc: "Detects suspicious loitering behavior" },
    ],
  },
  {
    key: "operations", label: "Operations",
    color: "var(--accent)", badgeBg: "var(--accent-soft)", badgeColor: "var(--accent)",
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
    features: [
      { key: "worker_counting",   label: "Worker Counting",             icon: I.workers, desc: "Counts workers in designated areas" },
      { key: "machine_idle",      label: "Machine Idle Detection",      icon: I.machine, desc: "Monitors and detects idle machines" },
      { key: "queue_detection",   label: "Queue Detection",             icon: I.queue,   desc: "Detects and analyzes queues" },
      { key: "loading_unloading", label: "Loading / Unloading Tracking",icon: I.loading, desc: "Tracks loading and unloading operations", configType: "loading_unloading" },
    ],
  },
  {
    key: "compliance", label: "Compliance",
    color: "var(--accent)", badgeBg: "var(--accent-soft)", badgeColor: "var(--accent)",
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
    features: [
      { key: "ppe_compliance",        label: "PPE Compliance",        icon: I.ppe,      desc: "Monitors and enforces PPE usage across all zones" },
      { key: "zone_compliance",       label: "Zone Compliance",       icon: I.zone,     desc: "Ensures personnel stay within designated zones" },
      { key: "attendance_compliance", label: "Attendance Compliance", icon: I.attend,   desc: "Tracks and verifies worker attendance automatically" },
      { key: "incident_reports",      label: "Incident Reports",      icon: I.incident, desc: "Generates detailed reports for detected incidents" },
    ],
  },
];

export const FACE_RECOGNITION_KEY = "face_recognition";

export const PPE_BACKED_KEYS = new Set([
  "helmet_detection",
  "vest_detection",
  "gloves_detection",
  "goggles_detection",
  "mask_detection",
]);
