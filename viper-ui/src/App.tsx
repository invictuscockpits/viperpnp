import { useCallback, useEffect, useRef, useState } from "react";
import { BoardMap, type Placement } from "./BoardMap";
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

interface Position {
  tool: string;
  x: number;
  y: number;
  z: number;
  c: number;
  units: string;
}

interface Status {
  enabled: boolean;
  homed: boolean;
  busy: boolean;
  position: Position | null;
}

interface JobBoard {
  name: string;
  side: string;
  placementCount: number;
  placements: Placement[];
}

interface JobInfo {
  loaded: boolean;
  boardCount?: number;
  placementCount?: number;
  partCount?: number;
  parts?: string[];
  boards?: JobBoard[];
}

const STEPS = [0.1, 1, 10];

function App() {
  const [online, setOnline] = useState(false);
  const [inventory, setInventory] = useState<MachineInfo | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [job, setJob] = useState<JobInfo | null>(null);
  const [importPath, setImportPath] = useState(
    "C:/dev/viperpnp/samples/kicad-example-F.Cu.pos",
  );
  const [importErr, setImportErr] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const loadInventory = useCallback(async () => {
    try {
      const res = await fetch("/api/machine");
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      setInventory((await res.json()) as MachineInfo);
    } catch {
      setInventory(null);
    }
  }, []);

  const loadJob = useCallback(async () => {
    try {
      const res = await fetch("/api/job");
      setJob((await res.json()) as JobInfo);
    } catch {
      setJob(null);
    }
  }, []);

  useEffect(() => {
    loadJob();
  }, [loadJob]);

  useEffect(() => {
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${proto}//${location.host}/ws/events`);
      wsRef.current = ws;

      ws.addEventListener("open", () => {
        setOnline(true);
        loadInventory();
      });
      ws.addEventListener("message", (ev) => {
        const data = JSON.parse(ev.data as string);
        if (data && typeof data.enabled === "boolean") {
          setStatus(data as Status);
          setError(null);
        } else if (data && data.event === "error") {
          setError(String(data.message));
        }
      });
      ws.addEventListener("close", () => {
        setOnline(false);
        if (!closed) {
          retry = setTimeout(connect, 1500);
        }
      });
      ws.addEventListener("error", () => ws.close());
    };

    connect();
    return () => {
      closed = true;
      if (retry) {
        clearTimeout(retry);
      }
      wsRef.current?.close();
    };
  }, [loadInventory]);

  const post = useCallback(async (path: string, body?: unknown) => {
    try {
      await fetch(path, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const enabled = status?.enabled ?? false;
  const toggleConnect = () =>
    post(enabled ? "/api/machine/disconnect" : "/api/machine/connect");
  const home = () => post("/api/machine/home");
  const jog = (ax: "x" | "y" | "z" | "c", dir: 1 | -1) => {
    const d = dir * step;
    post("/api/jog", {
      dx: ax === "x" ? d : 0,
      dy: ax === "y" ? d : 0,
      dz: ax === "z" ? d : 0,
      dc: ax === "c" ? d : 0,
      speed: 1.0,
    });
  };

  const doImport = async () => {
    setImporting(true);
    setImportErr(null);
    try {
      const res = await fetch("/api/import/kicad", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topFile: importPath }),
      });
      const data = await res.json();
      if (data && (data.event === "error" || data.error)) {
        setImportErr(String(data.message ?? data.error));
      } else {
        setJob(data as JobInfo);
      }
    } catch (e) {
      setImportErr(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  };

  const updatePlacement = async (
    id: string,
    patch: { type?: string; enabled?: boolean },
  ) => {
    try {
      const res = await fetch("/api/job/placement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      const data = await res.json();
      if (data && (data.event === "error" || data.error)) {
        setImportErr(String(data.message ?? data.error));
      } else {
        setJob(data as JobInfo);
      }
    } catch (e) {
      setImportErr(e instanceof Error ? e.message : String(e));
    }
  };

  const placements = (job?.boards ?? []).flatMap((b) => b.placements);

  const pos = status?.position;
  const shortImpl = inventory?.impl.split(".").pop() ?? "—";

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-viper">VIPER</span>
          <span className="brand-pnp">PNP</span>
        </div>
        <div className={`status status-${online ? "online" : "offline"}`}>
          <span className="dot" />
          {online ? "Backend online" : "Backend offline"}
        </div>
        {online && status && (
          <div className="badges">
            <span className={`badge ${enabled ? "on" : ""}`}>
              {enabled ? "Enabled" : "Disabled"}
            </span>
            <span className={`badge ${status.homed ? "on" : ""}`}>
              {status.homed ? "Homed" : "Not homed"}
            </span>
            {status.busy && <span className="badge busy">Busy</span>}
          </div>
        )}
      </header>

      {!online && (
        <div className="banner">
          Can't reach the ViperPNP backend on <code>localhost:8077</code>. Start the
          Java server and this dashboard reconnects automatically.
        </div>
      )}
      {error && <div className="banner banner-warn">{error}</div>}

      {online && status && (
        <div className="controls">
          <section className="card">
            <h2>Control</h2>
            <div className="btn-row">
              <button
                className={`btn ${enabled ? "btn-danger" : "btn-primary"}`}
                onClick={toggleConnect}
              >
                {enabled ? "Disconnect" : "Connect"}
              </button>
              <button className="btn" onClick={home} disabled={!enabled}>
                Home
              </button>
            </div>

            <div className="step-row">
              <span className="muted">Step</span>
              {STEPS.map((s) => (
                <button
                  key={s}
                  className={`chip-btn ${step === s ? "active" : ""}`}
                  onClick={() => setStep(s)}
                >
                  {s} mm
                </button>
              ))}
            </div>

            <div className="jog">
              {(["x", "y", "z", "c"] as const).map((ax) => (
                <div key={ax} className="jog-axis">
                  <button
                    className="btn jog-btn"
                    onClick={() => jog(ax, -1)}
                    disabled={!enabled}
                  >
                    {ax.toUpperCase()}−
                  </button>
                  <button
                    className="btn jog-btn"
                    onClick={() => jog(ax, 1)}
                    disabled={!enabled}
                  >
                    {ax.toUpperCase()}+
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="card">
            <h2>Position {pos ? `· ${pos.tool}` : ""}</h2>
            {pos ? (
              <div className="pos-grid">
                <div className="pos-cell">
                  <span className="muted">X</span>
                  <span className="pos-val">{pos.x.toFixed(3)}</span>
                </div>
                <div className="pos-cell">
                  <span className="muted">Y</span>
                  <span className="pos-val">{pos.y.toFixed(3)}</span>
                </div>
                <div className="pos-cell">
                  <span className="muted">Z</span>
                  <span className="pos-val">{pos.z.toFixed(3)}</span>
                </div>
                <div className="pos-cell">
                  <span className="muted">C°</span>
                  <span className="pos-val">{pos.c.toFixed(3)}</span>
                </div>
              </div>
            ) : (
              <div className="muted">no position</div>
            )}
          </section>
        </div>
      )}

      {online && (
        <section className="board card">
          <div className="board-head">
            <h2>Board</h2>
            <div className="import-row">
              <input
                className="import-input"
                value={importPath}
                onChange={(e) => setImportPath(e.currentTarget.value)}
                placeholder="path to a KiCad .pos on the server"
              />
              <button
                className="btn btn-primary"
                onClick={doImport}
                disabled={importing}
              >
                {importing ? "Importing…" : "Import KiCad"}
              </button>
            </div>
          </div>
          {importErr && <div className="banner banner-warn">{importErr}</div>}
          {job?.loaded ? (
            <>
              <div className="board-summary">
                <span className="tag">{job.boards?.[0]?.name}</span>
                <span className="muted">
                  {job.placementCount} placements · {job.partCount} parts ·{" "}
                  {placements.filter((p) => p.enabled).length} enabled ·{" "}
                  {placements.filter((p) => p.type === "Fiducial").length} fiducials
                </span>
                <span className="legend">
                  <span className="lg lg-top" /> Top
                  <span className="lg lg-fid" /> Fiducial
                </span>
              </div>
              <div className="board-body">
                <div className="ptable-wrap">
                  <table className="ptable">
                    <thead>
                      <tr>
                        <th>On</th>
                        <th>Ref</th>
                        <th>Part</th>
                        <th>Type</th>
                        <th>X</th>
                        <th>Y</th>
                        <th>Rot</th>
                      </tr>
                    </thead>
                    <tbody>
                      {placements.map((p) => (
                        <tr key={p.id} className={p.enabled ? "" : "row-off"}>
                          <td>
                            <input
                              type="checkbox"
                              checked={p.enabled}
                              onChange={(e) =>
                                updatePlacement(p.id, {
                                  enabled: e.currentTarget.checked,
                                })
                              }
                            />
                          </td>
                          <td className="mono">{p.id}</td>
                          <td className="muted ptable-part">{p.part ?? "—"}</td>
                          <td>
                            <select
                              className="type-select"
                              value={p.type}
                              onChange={(e) =>
                                updatePlacement(p.id, {
                                  type: e.currentTarget.value,
                                })
                              }
                            >
                              <option value="Placement">Placement</option>
                              <option value="Fiducial">Fiducial</option>
                            </select>
                          </td>
                          <td className="mono">{p.x.toFixed(2)}</td>
                          <td className="mono">{p.y.toFixed(2)}</td>
                          <td className="mono">{p.rot.toFixed(0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <BoardMap placements={placements} />
              </div>
            </>
          ) : (
            <div className="muted">
              No board loaded. Import a KiCad .pos to see its placement map.
            </div>
          )}
        </section>
      )}

      {inventory && (
        <main className="grid">
          <section className="card span-2">
            <h2>Machine</h2>
            <div className="big">{shortImpl}</div>
            <div className="muted">{inventory.impl}</div>
          </section>

          <section className="card">
            <h2>Feeders</h2>
            <div className="big">{inventory.feederCount}</div>
          </section>

          <section className="card">
            <h2>Actuators</h2>
            <div className="big">{inventory.actuatorCount}</div>
          </section>

          <section className="card span-2">
            <h2>Drivers</h2>
            <ul className="list">
              {inventory.drivers.map((d) => (
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
              {inventory.machineCameras.map((c) => (
                <span key={c} className="chip chip-cam">
                  ◉ {c}
                </span>
              ))}
            </div>
          </section>

          <section className="card span-4">
            <h2>Heads</h2>
            {inventory.heads.map((h) => (
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
