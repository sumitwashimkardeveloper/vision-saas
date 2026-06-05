import { useState } from "react";
import Events from "./Events.jsx";
import Cameras from "./Cameras.jsx";
import People from "./People.jsx";

const TABS = [
  ["events", "Events"],
  ["cameras", "Cameras"],
  ["people", "People"],
];

export default function Dashboard({ identity, onLogout }) {
  const [tab, setTab] = useState("events");

  return (
    <>
      <header>
        <h1>Face Recognition — Admin</h1>
        <div className="row">
          <span className="who">
            {identity.tenant_id} · {identity.role}
          </span>
          <button className="ghost" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </header>
      <main>
        <nav className="nav">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              className={tab === key ? "active" : ""}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </nav>
        {tab === "events" && <Events />}
        {tab === "cameras" && <Cameras />}
        {tab === "people" && <People />}
      </main>
    </>
  );
}
