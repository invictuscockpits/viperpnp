import { useCallback, useEffect, useState } from "react";
import "./App.css";

interface DriverInfo {
  name: string;
  type: string;
}

interface HeadInfo {
  name: string;
  nozzles: string[];
  cameras: string[];
}

interface MachineInfo {
  impl: string;
  drivers: DriverInfo[];
  heads: HeadInfo[];
  machineCameras: string[];
  feederCount: number;
  actuatorCount: number;
}

type Status = "connecting" | "online" | "offline";

function App() {
  const [status, setStatus] = useState<Status>("connecting");
  const [machine, setMachine] = useState<MachineInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setStatus((s) => (s === "online" ? s : "connecting"));
    setError(null);
    try {
      const res = await fetch("/api/machine");
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as MachineInfo;
      setMachine(data);
      setStatus("online");
    } catch (e) {
      setMachine(null);
      setStatus("offline");
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  const shortImpl = machine?.impl.split(".").pop() ?? "—";

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-viper">VIPER</span>
          <span className="brand-pnp">PNP</span>
        </div>
        <div className={`status status-${status}`}>
          <span className="dot" />
          {status === "online" && "Backend online"}
          {status === "connecting" && "Connecting…"}
          {status === "offline" && "Backend offline"}
        </div>
        <button className="refresh" onClick={refresh}>
          Refresh
        </button>
      </header>

      {status === "offline" && (
        <div className="banner">
          Can't reach the ViperPNP backend on <code>localhost:8077</code>. Start the
          Java server and this dashboard reconnects automatically.
          {error && <span className="banner-err"> ({error})</span>}
        </div>
      )}

      {machine && (
        <main className="grid">
          <section className="card span-2">
            <h2>Machine</h2>
            <div className="big">{shortImpl}</div>
            <div className="muted">{machine.impl}</div>
          </section>

          <section className="card">
            <h2>Feeders</h2>
            <div className="big">{machine.feederCount}</div>
          </section>

          <section className="card">
            <h2>Actuators</h2>
            <div className="big">{machine.actuatorCount}</div>
          </section>

          <section className="card span-2">
            <h2>Drivers</h2>
            {machine.drivers.length === 0 && <div className="muted">none</div>}
            <ul className="list">
              {machine.drivers.map((d) => (
                <li key={d.name}>
                  <span className="tag">{d.name}</span>
                  <span className="muted">{d.type}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="card span-2">
            <h2>Machine cameras</h2>
            <div className="chips">
              {machine.machineCameras.length === 0 && (
                <span className="muted">none</span>
              )}
              {machine.machineCameras.map((c) => (
                <span key={c} className="chip chip-cam">
                  ◉ {c}
                </span>
              ))}
            </div>
          </section>

          <section className="card span-4">
            <h2>Heads</h2>
            {machine.heads.map((h) => (
              <div key={h.name} className="head">
                <div className="head-name">{h.name}</div>
                <div className="chips">
                  {h.nozzles.map((n) => (
                    <span key={n} className="chip chip-nozzle">
                      ⬡ {n}
                    </span>
                  ))}
                  {h.cameras.map((c) => (
                    <span key={c} className="chip chip-cam">
                      ◉ {c}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </section>
        </main>
      )}

      <footer className="foot">
        ViperPNP · a modern front-end for LumenPnP · wrapping the OpenPnP core
      </footer>
    </div>
  );
}

export default App;
