import { useCallback, useEffect, useRef, useState } from "react";
import { BoardMap, type Placement } from "./BoardMap";
import { CameraIcon, NozzleIcon } from "./Icons";
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

interface FeederInfo {
  id: string;
  name: string;
  type: string;
  part: string | null;
  enabled: boolean;
}

type Tab = "machine" | "board" | "feeders";

const STEPS = [0.01, 0.1, 1, 10, 100];

const TABS: { id: Tab; label: string }[] = [
  { id: "machine", label: "Machine" },
  { id: "board", label: "Board" },
  { id: "feeders", label: "Feeders" },
];

const SOON = ["Vision", "Log"];

function App() {
  const [online, setOnline] = useState(false);
  const [inventory, setInventory] = useState<MachineInfo | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [speed, setSpeed] = useState(1);
  const [job, setJob] = useState<JobInfo | null>(null);
  const [importPath, setImportPath] = useState(
    "C:/dev/viperpnp/samples/kicad-example-F.Cu.pos",
  );
  const [importErr, setImportErr] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [reference, setReference] = useState("camera");
  const [tab, setTab] = useState<Tab>("board");
  const [feeders, setFeeders] = useState<FeederInfo[]>([]);
  const [parts, setParts] = useState<string[]>([]);
  const [feederType, setFeederType] = useState("photon");
  const [feederName, setFeederName] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const dragIndex = useRef<number | null>(null);

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

  const loadFeeders = useCallback(async () => {
    try {
      const [fr, pr] = await Promise.all([
        fetch("/api/feeders"),
        fetch("/api/parts"),
      ]);
      const fd = await fr.json();
      const pd = await pr.json();
      setFeeders(fd.feeders ?? []);
      setParts(pd.parts ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (tab === "feeders") {
      loadFeeders();
    }
  }, [tab, loadFeeders]);

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
  const park = () => post("/api/machine/park");
  const cameraToNozzle = () => post("/api/machine/camera-to-nozzle");
  const nozzleToCamera = () => post("/api/machine/nozzle-to-camera");
  const jog = (ax: "x" | "y" | "z" | "c", dir: 1 | -1) => {
    const d = dir * step;
    post("/api/jog", {
      dx: ax === "x" ? d : 0,
      dy: ax === "y" ? d : 0,
      dz: ax === "z" ? d : 0,
      dc: ax === "c" ? d : 0,
      speed,
      tool: reference,
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

  const addFeeder = async () => {
    try {
      const res = await fetch("/api/feeders/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: feederType, name: feederName || undefined }),
      });
      const d = await res.json();
      if (d.feeders) {
        setFeeders(d.feeders);
      } else if (d.error || d.event === "error") {
        setError(String(d.message ?? d.error));
      }
      setFeederName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const updateFeeder = async (
    id: string,
    patch: { partId?: string; enabled?: boolean },
  ) => {
    try {
      const res = await fetch("/api/feeder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      const d = await res.json();
      if (d.feeders) {
        setFeeders(d.feeders);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onFeederDrop = (targetIdx: number) => {
    const from = dragIndex.current;
    dragIndex.current = null;
    if (from === null || from === targetIdx) {
      return;
    }
    const next = [...feeders];
    const [moved] = next.splice(from, 1);
    next.splice(targetIdx, 0, moved);
    setFeeders(next);
    fetch("/api/feeders/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: next.map((f) => f.id) }),
    }).catch(() => {
      /* ignore */
    });
  };

  const placements = (job?.boards ?? []).flatMap((b) => b.placements);
  const pos = status?.position;
  const shortImpl = inventory?.impl.split(".").pop() ?? "—";
  const cameraName = inventory?.heads?.[0]?.cameras?.[0] ?? "Top";
  const bottomCamera = inventory?.machineCameras?.[0] ?? "Bottom";
  const headName = inventory?.heads?.[0]?.name ?? "H1";
  const isCamera = reference === "camera";
  const zcEnabled = enabled && !isCamera;
  const camToNozEnabled = enabled && isCamera;
  const nozToCamEnabled = enabled && !isCamera;
  const refOptions = [
    { id: "camera", label: `Camera: ${cameraName}` },
    ...(inventory?.heads?.[0]?.nozzles ?? []).map((n, i) => ({
      id: n,
      label: `Nozzle ${i + 1}`,
    })),
  ];

  return (
    <div className="app">
      <aside className="control-panel">
        <div className="brand">
          <span className="brand-viper">VIPER</span>
          <span className="brand-pnp">PNP</span>
        </div>

        <div className="camera-panel">
          <div className="panel-label">
            <CameraIcon size={13} /> Cameras · {headName}
          </div>
          <div className="camera-row">
            {[
              { key: "top", name: cameraName },
              { key: "bottom", name: bottomCamera },
            ].map((c) => (
              <div key={c.key} className="camera-cell">
                <div className="camera-sublabel">{c.name}</div>
                <div className="camera-view">
                  <svg
                    className="reticle"
                    viewBox="0 0 200 150"
                    preserveAspectRatio="xMidYMid meet"
                  >
                    <line x1="100" y1="6" x2="100" y2="144" />
                    <line x1="6" y1="75" x2="194" y2="75" />
                    <circle cx="100" cy="75" r="26" />
                  </svg>
                  <span className="camera-hint">no stream</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="jog-panel">
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

          <div className="ref-select">
            {refOptions.map((o) => (
              <button
                key={o.id}
                className={`ref-opt ${reference === o.id ? "active" : ""}`}
                onClick={() => setReference(o.id)}
              >
                {o.label}
              </button>
            ))}
          </div>

          <div className="jog-main">
            <div className="dpad">
              <button
                className="jbtn jy-plus"
                onClick={() => jog("y", 1)}
                disabled={!enabled}
              >
                Y+
              </button>
              <button
                className="jbtn jx-minus"
                onClick={() => jog("x", -1)}
                disabled={!enabled}
              >
                X−
              </button>
              <button className="jbtn jpark" onClick={park} disabled={!enabled}>
                Park
              </button>
              <button
                className="jbtn jx-plus"
                onClick={() => jog("x", 1)}
                disabled={!enabled}
              >
                X+
              </button>
              <button
                className="jbtn jy-minus"
                onClick={() => jog("y", -1)}
                disabled={!enabled}
              >
                Y−
              </button>
            </div>
            <div className="zpad">
              <button
                className="jbtn"
                onClick={() => jog("z", 1)}
                disabled={!zcEnabled}
              >
                Z+
              </button>
              <button className="jbtn jpark" onClick={park} disabled={!enabled}>
                Park
              </button>
              <button
                className="jbtn"
                onClick={() => jog("z", -1)}
                disabled={!zcEnabled}
              >
                Z−
              </button>
            </div>
            <div className="stepcol">
              <div className="col-label">Dist·mm</div>
              <div className="stepbtns">
                {[...STEPS].reverse().map((s) => (
                  <button
                    key={s}
                    className={`chip-btn stepbtn ${step === s ? "active" : ""}`}
                    onClick={() => setStep(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div className="speedcol">
              <div className="col-label">Speed</div>
              <input
                type="range"
                className="speed-vert"
                min={5}
                max={100}
                value={Math.round(speed * 100)}
                onChange={(e) => setSpeed(Number(e.currentTarget.value) / 100)}
              />
              <span className="speed-val">{Math.round(speed * 100)}%</span>
            </div>
            <div className="cnpad">
              <button
                className="jbtn cn-btn cn-noz"
                onClick={nozzleToCamera}
                disabled={!nozToCamEnabled}
                title="Move nozzle to camera"
                aria-label="Move nozzle to camera"
              >
                <NozzleIcon size={22} />
              </button>
              <button
                className="jbtn cn-btn cn-cam"
                onClick={cameraToNozzle}
                disabled={!camToNozEnabled}
                title="Move camera to nozzle"
                aria-label="Move camera to nozzle"
              >
                <CameraIcon size={22} />
              </button>
            </div>
          </div>

          <div className="cpad">
            <button
              className="jbtn jrot"
              onClick={() => jog("c", 1)}
              disabled={!zcEnabled}
              aria-label="Rotate counter-clockwise"
            >
              ↺
            </button>
            <button className="jbtn jpark" onClick={park} disabled={!enabled}>
              Park
            </button>
            <button
              className="jbtn jrot"
              onClick={() => jog("c", -1)}
              disabled={!zcEnabled}
              aria-label="Rotate clockwise"
            >
              ↻
            </button>
          </div>

        </div>

        <div className="dro">
          {(["x", "y", "z", "c"] as const).map((ax) => (
            <div key={ax} className="dro-cell">
              <span className="dro-ax">{ax.toUpperCase()}</span>
              <span className="dro-val">{pos ? pos[ax].toFixed(2) : "—"}</span>
            </div>
          ))}
        </div>
      </aside>

      <main className="content">
        <header className="content-header">
          <nav className="tabs">
            {TABS.map((t) => (
              <button
                key={t.id}
                className={`tab ${tab === t.id ? "active" : ""}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
            {SOON.map((s) => (
              <button key={s} className="tab" disabled>
                {s}
              </button>
            ))}
          </nav>
          <div className="head-right">
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
            <div className={`status status-${online ? "online" : "offline"}`}>
              <span className="dot" />
              {online ? "Online" : "Offline"}
            </div>
          </div>
        </header>

        <div className="view">
          {!online && (
            <div className="banner">
              Can't reach the ViperPNP backend on <code>localhost:8077</code>. Start
              the Java server and this reconnects automatically.
            </div>
          )}
          {error && <div className="banner banner-warn">{error}</div>}

          {tab === "machine" &&
            (inventory ? (
              <div className="grid">
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
                        <CameraIcon size={12} /> {c}
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
                            <NozzleIcon size={12} /> {n}
                          </span>
                        ))}
                        {h.cameras.map((c) => (
                          <span key={c} className="chip chip-cam">
                            <CameraIcon size={12} /> {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </section>
              </div>
            ) : (
              <div className="muted">
                {online
                  ? "Loading machine…"
                  : "Machine details appear once the backend is online."}
              </div>
            ))}

          {tab === "board" && (
            <section className="board card">
              <div className="board-head">
                <h2>Board input</h2>
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
                      {placements.filter((p) => p.type === "Fiducial").length}{" "}
                      fiducials
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
                              <td className="muted ptable-part">
                                {p.part ?? "—"}
                              </td>
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

          {tab === "feeders" && (
            <section className="card">
              <div className="board-head">
                <h2>Feeders</h2>
                <div className="import-row">
                  <select
                    className="type-select"
                    value={feederType}
                    onChange={(e) => setFeederType(e.currentTarget.value)}
                  >
                    <option value="photon">Photon</option>
                    <option value="strip">Strip</option>
                  </select>
                  <input
                    className="import-input"
                    value={feederName}
                    onChange={(e) => setFeederName(e.currentTarget.value)}
                    placeholder="feeder name (optional)"
                  />
                  <button className="btn btn-primary" onClick={addFeeder}>
                    Add feeder
                  </button>
                </div>
              </div>
              {feeders.length === 0 ? (
                <div className="muted">
                  No feeders yet. Add one above — on a real LumenPnP, Photon
                  feeders also appear automatically when the machine scans the bus.
                </div>
              ) : (
                <div className="ptable-wrap">
                  <table className="ptable">
                    <thead>
                      <tr>
                        <th></th>
                        <th>On</th>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Part</th>
                      </tr>
                    </thead>
                    <tbody>
                      {feeders.map((f, i) => (
                        <tr
                          key={f.id}
                          className={f.enabled ? "" : "row-off"}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => onFeederDrop(i)}
                        >
                          <td
                            className="drag-handle"
                            draggable
                            onDragStart={() => {
                              dragIndex.current = i;
                            }}
                            title="Drag to reorder"
                          >
                            ⠿
                          </td>
                          <td>
                            <input
                              type="checkbox"
                              checked={f.enabled}
                              onChange={(e) =>
                                updateFeeder(f.id, {
                                  enabled: e.currentTarget.checked,
                                })
                              }
                            />
                          </td>
                          <td className="mono">{f.name}</td>
                          <td className="muted">{f.type}</td>
                          <td>
                            <select
                              className="type-select"
                              value={f.part ?? ""}
                              onChange={(e) =>
                                updateFeeder(f.id, {
                                  partId: e.currentTarget.value,
                                })
                              }
                            >
                              <option value="">—</option>
                              {parts.map((p) => (
                                <option key={p} value={p}>
                                  {p}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
