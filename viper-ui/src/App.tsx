import { useCallback, useEffect, useRef, useState } from "react";
import { BoardMap, type Placement } from "./BoardMap";
import { CameraIcon, GearIcon, NozzleIcon } from "./Icons";
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

interface IoState {
  vac1: boolean | null;
  vac2: boolean | null;
  topLight: boolean | null;
  bottomLight: boolean | null;
}

interface Status {
  enabled: boolean;
  homed: boolean;
  busy: boolean;
  position: Position | null;
  io?: IoState;
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
  canEnable?: boolean;
  needs?: string[];
}

interface FeederLoc {
  x: number;
  y: number;
  z: number;
  rotation: number;
}

interface PhotonCfg {
  slotAddress: number | null;
  hardwareId: string | null;
  offset: FeederLoc | null;
  slotLocation: FeederLoc | null;
  commMaxRetry: number;
}

interface StripCfg {
  referenceHole: FeederLoc | null;
  lastHole: FeederLoc | null;
  partPitch: number;
  tapeWidth: number;
  tapeType: string;
  feedCount: number;
}

interface TrayCfg {
  firstLocation: FeederLoc | null;
  trayCountX: number;
  trayCountY: number;
  offsetX: number;
  offsetY: number;
  feedCount: number;
}

interface FeederConfig extends FeederInfo {
  editableLocation: boolean;
  location?: FeederLoc;
  photon?: PhotonCfg;
  strip?: StripCfg;
  tray?: TrayCfg;
  feedRetryCount?: number;
  pickRetryCount?: number;
}

interface SkippedPlacement {
  id: string;
  part: string | null;
  board: string;
}

const ZERO_LOC: FeederLoc = { x: 0, y: 0, z: 0, rotation: 0 };
const TAPE_TYPES = ["WhitePaper", "BlackPlastic", "ClearPlastic"];

type TeachTool = "camera" | "nozzle";
type TeachTarget = "location" | "slot" | "offset" | "refHole" | "lastHole";

type Tab = "machine" | "board" | "feeders";

const STEPS = [0.01, 0.1, 1, 10, 100];

const TABS: { id: Tab; label: string }[] = [
  { id: "machine", label: "Machine" },
  { id: "board", label: "Board" },
  { id: "feeders", label: "Feeders" },
];

const SOON = ["Vision", "Log"];

/** A 4-axis location editor with optional Go-to / Capture teach buttons. */
function TeachLoc({
  label,
  value,
  onChange,
  onGo,
  onCapture,
}: {
  label: string;
  value: FeederLoc | null;
  onChange?: (loc: FeederLoc) => void;
  onGo?: (tool: TeachTool) => void;
  onCapture?: (tool: TeachTool) => void;
}) {
  const v = value ?? ZERO_LOC;
  return (
    <div className="teach-block">
      <div className="teach-head">{label}</div>
      <div className="loc-grid">
        {(["x", "y", "z", "rotation"] as const).map((k) => (
          <label key={k} className="loc-field">
            <span>{k === "rotation" ? "Rot°" : k.toUpperCase()}</span>
            <input
              type="number"
              step="0.01"
              disabled={!onChange}
              value={v[k]}
              onChange={(e) =>
                onChange?.({
                  ...v,
                  [k]: parseFloat(e.currentTarget.value) || 0,
                })
              }
            />
          </label>
        ))}
      </div>
      {(onGo || onCapture) && (
        <div className="teach-actions">
          {onGo && (
            <button
              className="btn btn-sm"
              onClick={() => onGo("camera")}
              title="Move camera here"
            >
              <CameraIcon size={14} /> Go
            </button>
          )}
          {onCapture && (
            <button
              className="btn btn-sm"
              onClick={() => onCapture("camera")}
              title="Capture X/Y from camera"
            >
              <CameraIcon size={14} /> Grab
            </button>
          )}
          {onGo && (
            <button
              className="btn btn-sm"
              onClick={() => onGo("nozzle")}
              title="Move nozzle here"
            >
              <NozzleIcon size={14} /> Go
            </button>
          )}
          {onCapture && (
            <button
              className="btn btn-sm"
              onClick={() => onCapture("nozzle")}
              title="Capture X/Y/Z from nozzle"
            >
              <NozzleIcon size={14} /> Grab
            </button>
          )}
        </div>
      )}
    </div>
  );
}

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
  const [editFeeder, setEditFeeder] = useState<FeederConfig | null>(null);
  const [scanning, setScanning] = useState(false);
  const [jobRunning, setJobRunning] = useState(false);
  const [configDirty, setConfigDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [jobStatus, setJobStatus] = useState("");
  const [keepGoing, setKeepGoing] = useState(true);
  const [skipReport, setSkipReport] = useState<{
    skipped: SkippedPlacement[];
    aborted: boolean;
  } | null>(null);
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
        fetch("/api/config/state")
          .then((r) => r.json())
          .then((d) => setConfigDirty(!!d.dirty))
          .catch(() => {
            /* ignore */
          });
      });
      ws.addEventListener("message", (ev) => {
        const data = JSON.parse(ev.data as string);
        if (data && typeof data.enabled === "boolean") {
          setStatus(data as Status);
          setError(null);
        } else if (data && data.event === "feeders") {
          setFeeders(data.feeders ?? []);
          setScanning(false);
        } else if (data && data.event === "config") {
          setConfigDirty(!!data.dirty);
        } else if (data && data.event === "jobStarted") {
          setJobRunning(true);
          setJobStatus(String(data.text ?? ""));
          setSkipReport(null);
        } else if (data && data.event === "jobStatus") {
          setJobStatus(String(data.text ?? ""));
        } else if (data && data.event === "jobComplete") {
          setJobRunning(false);
          setJobStatus("");
          setSkipReport({
            skipped: data.skipped ?? [],
            aborted: !!data.aborted,
          });
        } else if (data && data.event === "error") {
          setError(String(data.message));
          setScanning(false);
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
  const toggleIo = (target: keyof IoState, on: boolean) =>
    post("/api/io", { target, on });
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
    patch: { partId?: string; enabled?: boolean; name?: string },
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

  const applyFeederConfig = (
    d: FeederConfig & { error?: string; event?: string; message?: string },
  ) => {
    if (d.error || d.event === "error") {
      setError(String(d.message ?? d.error));
      return;
    }
    setEditFeeder(d);
    setFeeders((fs) =>
      fs.map((f) =>
        f.id === d.id
          ? { ...f, name: d.name, part: d.part, enabled: d.enabled }
          : f,
      ),
    );
  };

  const openEditFeeder = async (id: string) => {
    try {
      const res = await fetch(`/api/feeder/${id}`);
      setEditFeeder(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const setEF = (patch: Partial<FeederConfig>) =>
    setEditFeeder((ef) => (ef ? { ...ef, ...patch } : ef));
  const setPhotonField = (patch: Partial<PhotonCfg>) =>
    setEditFeeder((ef) =>
      ef?.photon ? { ...ef, photon: { ...ef.photon, ...patch } } : ef,
    );
  const setStripField = (patch: Partial<StripCfg>) =>
    setEditFeeder((ef) =>
      ef?.strip ? { ...ef, strip: { ...ef.strip, ...patch } } : ef,
    );
  const setTrayField = (patch: Partial<TrayCfg>) =>
    setEditFeeder((ef) =>
      ef?.tray ? { ...ef, tray: { ...ef.tray, ...patch } } : ef,
    );

  const postFeeder = async (url: string, body: unknown) => {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      applyFeederConfig(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const saveFeederLocation = () => {
    if (!editFeeder) return;
    const l = editFeeder.location ?? ZERO_LOC;
    postFeeder("/api/feeder/location", { id: editFeeder.id, ...l });
  };

  const savePhoton = () => {
    if (!editFeeder?.photon) return;
    const p = editFeeder.photon;
    postFeeder("/api/feeder/photon", {
      id: editFeeder.id,
      slotAddress: p.slotAddress,
      offset: p.offset ?? undefined,
      slotLocation: p.slotLocation ?? undefined,
    });
  };

  const saveStrip = () => {
    if (!editFeeder?.strip) return;
    const s = editFeeder.strip;
    postFeeder("/api/feeder/strip", {
      id: editFeeder.id,
      referenceHole: s.referenceHole ?? undefined,
      lastHole: s.lastHole ?? undefined,
      partPitch: s.partPitch,
      tapeWidth: s.tapeWidth,
      tapeType: s.tapeType,
      feedCount: s.feedCount,
    });
  };

  const saveTray = () => {
    if (!editFeeder?.tray) return;
    const t = editFeeder.tray;
    postFeeder("/api/feeder/tray", {
      id: editFeeder.id,
      firstLocation: t.firstLocation ?? undefined,
      trayCountX: t.trayCountX,
      trayCountY: t.trayCountY,
      offsetX: t.offsetX,
      offsetY: t.offsetY,
      feedCount: t.feedCount,
    });
  };

  const saveRetry = () => {
    if (!editFeeder) return;
    postFeeder("/api/feeder/retry", {
      id: editFeeder.id,
      feedRetryCount: editFeeder.feedRetryCount,
      pickRetryCount: editFeeder.pickRetryCount,
      commMaxRetry: editFeeder.photon?.commMaxRetry,
    });
  };

  const runJob = () => {
    setSkipReport(null);
    fetch("/api/job/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ errorHandling: keepGoing ? "Defer" : "Alert" }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(String(d.message ?? d.error));
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  const abortJob = () => {
    fetch("/api/job/abort", { method: "POST" }).catch(() => {
      /* ignore */
    });
  };

  const saveConfig = () => {
    setSaving(true);
    fetch("/api/config/save", { method: "POST" })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(String(d.message ?? d.error));
        else setConfigDirty(!!d.dirty);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setSaving(false));
  };

  const scanBus = () => {
    setScanning(true);
    fetch("/api/feeders/scan", { method: "POST" })
      .then(() => setTimeout(() => setScanning(false), 8000))
      .catch(() => setScanning(false));
  };

  const photonAction = (id: string, action: "find" | "feed") => {
    fetch(`/api/feeder/photon/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    })
      .then(() => setTimeout(loadFeeders, 400))
      .catch(() => {
        /* errors surface over the WebSocket */
      });
  };

  const captureFeederLoc = (tool: TeachTool, target: TeachTarget) => {
    if (!editFeeder) return;
    postFeeder("/api/feeder/capture", { id: editFeeder.id, tool, target });
  };

  const moveToFeederLoc = (tool: TeachTool, target: TeachTarget) => {
    if (!editFeeder) return;
    fetch("/api/feeder/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editFeeder.id, tool, target }),
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

        <div className="io-panel">
          {(
            [
              { key: "vac1", label: "Vac 1" },
              { key: "vac2", label: "Vac 2" },
              { key: "topLight", label: "Top light" },
              { key: "bottomLight", label: "Bottom light" },
            ] as { key: keyof IoState; label: string }[]
          ).map(({ key, label }) => {
            const on = !!status?.io?.[key];
            return (
              <button
                key={key}
                className={`io-btn ${on ? "io-on" : ""}`}
                disabled={!enabled}
                onClick={() => toggleIo(key, !on)}
              >
                {label}
                <span className="io-state">{on ? "ON" : "OFF"}</span>
              </button>
            );
          })}
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
            <button
              className={`btn btn-sm save-btn ${configDirty ? "dirty" : ""}`}
              onClick={saveConfig}
              disabled={!configDirty || saving}
              title={
                configDirty
                  ? "Save all changes to the machine config"
                  : "No unsaved changes"
              }
            >
              {saving ? "Saving…" : configDirty ? "Save •" : "Saved"}
            </button>
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
              {job?.loaded && (
                <div className="run-bar">
                  {jobRunning ? (
                    <button className="btn btn-danger" onClick={abortJob}>
                      Abort
                    </button>
                  ) : (
                    <button className="btn btn-primary" onClick={runJob}>
                      Run job
                    </button>
                  )}
                  <label
                    className="run-toggle"
                    title="On: a feeder fault retries, then the placement is skipped and the job keeps going (Defer). Off: stop on the first error (Alert)."
                  >
                    <input
                      type="checkbox"
                      checked={keepGoing}
                      disabled={jobRunning}
                      onChange={(e) => setKeepGoing(e.currentTarget.checked)}
                    />
                    Keep going on feeder faults
                  </label>
                  {jobRunning && (
                    <span className="muted run-status">
                      {jobStatus || "Running…"}
                    </span>
                  )}
                </div>
              )}
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
                    <option value="tray">Tray</option>
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
                  <button
                    className="btn"
                    onClick={scanBus}
                    disabled={scanning}
                    title="Scan the RS-485 bus and map all Photon feeders"
                  >
                    {scanning ? "Scanning…" : "Scan bus"}
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
                        <th>Active</th>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Part</th>
                        <th></th>
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
                            {f.canEnable === false ? (
                              <button
                                className="needs-setup"
                                onClick={() => openEditFeeder(f.id)}
                                title={`Set up before enabling: ${(f.needs ?? []).join(", ")}`}
                              >
                                needs setup
                              </button>
                            ) : (
                              <input
                                type="checkbox"
                                checked={f.enabled}
                                onChange={(e) =>
                                  updateFeeder(f.id, {
                                    enabled: e.currentTarget.checked,
                                  })
                                }
                              />
                            )}
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
                          <td className="row-actions">
                            {f.type === "PhotonFeeder" && (
                              <>
                                <button
                                  className="btn btn-sm"
                                  onClick={() => photonAction(f.id, "find")}
                                  title="Locate this feeder's slot on the bus"
                                >
                                  Find
                                </button>
                                <button
                                  className="btn btn-sm"
                                  onClick={() => photonAction(f.id, "feed")}
                                  title="Advance the feeder by one part"
                                >
                                  Feed
                                </button>
                              </>
                            )}
                            <button
                              className="btn btn-sm btn-icon"
                              onClick={() => openEditFeeder(f.id)}
                              title="Edit feeder"
                              aria-label="Edit feeder"
                            >
                              <GearIcon size={15} />
                            </button>
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

      {editFeeder && (
        <div className="modal-backdrop" onClick={() => setEditFeeder(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>
                Edit feeder — <span className="mono">{editFeeder.name}</span>
              </h3>
              <button
                className="icon-btn"
                onClick={() => setEditFeeder(null)}
                title="Close"
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="field-row">
                <label>Name</label>
                <div className="name-field">
                  <input
                    className="import-input"
                    value={editFeeder.name}
                    onChange={(e) => setEF({ name: e.currentTarget.value })}
                    onBlur={() => {
                      if (editFeeder.name.trim()) {
                        updateFeeder(editFeeder.id, {
                          name: editFeeder.name.trim(),
                        });
                      }
                    }}
                    placeholder="feeder name"
                  />
                  {editFeeder.photon && (
                    <span className="hw-id">
                      Hardware ID: {editFeeder.photon.hardwareId ?? "— (not on bus)"}
                    </span>
                  )}
                </div>
              </div>
              <div className="field-row">
                <label>Type</label>
                <span className="muted">{editFeeder.type}</span>
              </div>
              <div className="field-row">
                <label>Part</label>
                <select
                  className="type-select"
                  value={editFeeder.part ?? ""}
                  onChange={async (e) => {
                    await updateFeeder(editFeeder.id, {
                      partId: e.currentTarget.value,
                    });
                    openEditFeeder(editFeeder.id);
                  }}
                >
                  <option value="">—</option>
                  {parts.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              <div className="teach-block">
                <div className="teach-head">
                  Reliability — retries before a hard stop. Each feed retry
                  re-locates and re-initializes the feeder first (a reconnect).
                </div>
                <div className="field-grid">
                  <label className="loc-field">
                    <span>Feed retries</span>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={editFeeder.feedRetryCount ?? 3}
                      onChange={(e) =>
                        setEF({
                          feedRetryCount: parseInt(e.currentTarget.value, 10) || 0,
                        })
                      }
                    />
                  </label>
                  <label className="loc-field">
                    <span>Pick retries</span>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={editFeeder.pickRetryCount ?? 3}
                      onChange={(e) =>
                        setEF({
                          pickRetryCount: parseInt(e.currentTarget.value, 10) || 0,
                        })
                      }
                    />
                  </label>
                  {editFeeder.photon && (
                    <label className="loc-field">
                      <span>Bus comm retries</span>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        value={editFeeder.photon.commMaxRetry ?? 3}
                        onChange={(e) =>
                          setPhotonField({
                            commMaxRetry:
                              parseInt(e.currentTarget.value, 10) || 0,
                          })
                        }
                        title="Machine-wide RS-485 retry count for all Photon feeders"
                      />
                    </label>
                  )}
                </div>
                <div className="teach-actions">
                  <button className="btn btn-sm" onClick={saveRetry}>
                    Save reliability
                  </button>
                </div>
              </div>

              {editFeeder.photon ? (
                <>
                  <div className="field-row">
                    <label>Slot</label>
                    <input
                      className="num-sm"
                      type="number"
                      step="1"
                      placeholder="addr"
                      value={editFeeder.photon.slotAddress ?? ""}
                      onChange={(e) =>
                        setPhotonField({
                          slotAddress:
                            e.currentTarget.value === ""
                              ? null
                              : parseInt(e.currentTarget.value, 10),
                        })
                      }
                    />
                  </div>
                  <TeachLoc
                    label="Slot location (shared by all feeders in this slot)"
                    value={editFeeder.photon.slotLocation}
                    onChange={(loc) => setPhotonField({ slotLocation: loc })}
                    onGo={(t) => moveToFeederLoc(t, "slot")}
                    onCapture={(t) => captureFeederLoc(t, "slot")}
                  />
                  <TeachLoc
                    label="Part offset (within the slot)"
                    value={editFeeder.photon.offset}
                    onChange={(loc) => setPhotonField({ offset: loc })}
                    onGo={(t) => moveToFeederLoc(t, "offset")}
                    onCapture={(t) => captureFeederLoc(t, "offset")}
                  />
                </>
              ) : editFeeder.tray ? (
                <>
                  <TeachLoc
                    label="First part — index (0, 0)"
                    value={editFeeder.tray.firstLocation}
                    onChange={(loc) => setTrayField({ firstLocation: loc })}
                    onGo={(t) => moveToFeederLoc(t, "location")}
                    onCapture={(t) => captureFeederLoc(t, "location")}
                  />
                  <div className="field-grid">
                    <label className="loc-field">
                      <span>Count X</span>
                      <input
                        type="number"
                        step="1"
                        min="1"
                        value={editFeeder.tray.trayCountX}
                        onChange={(e) =>
                          setTrayField({
                            trayCountX: parseInt(e.currentTarget.value, 10) || 1,
                          })
                        }
                      />
                    </label>
                    <label className="loc-field">
                      <span>Count Y</span>
                      <input
                        type="number"
                        step="1"
                        min="1"
                        value={editFeeder.tray.trayCountY}
                        onChange={(e) =>
                          setTrayField({
                            trayCountY: parseInt(e.currentTarget.value, 10) || 1,
                          })
                        }
                      />
                    </label>
                    <label className="loc-field">
                      <span>X pitch (mm)</span>
                      <input
                        type="number"
                        step="0.01"
                        value={editFeeder.tray.offsetX}
                        onChange={(e) =>
                          setTrayField({
                            offsetX: parseFloat(e.currentTarget.value) || 0,
                          })
                        }
                      />
                    </label>
                    <label className="loc-field">
                      <span>Y pitch (mm)</span>
                      <input
                        type="number"
                        step="0.01"
                        value={editFeeder.tray.offsetY}
                        onChange={(e) =>
                          setTrayField({
                            offsetY: parseFloat(e.currentTarget.value) || 0,
                          })
                        }
                      />
                    </label>
                  </div>
                  <div className="field-row">
                    <label>Feed count</label>
                    <input
                      className="num-sm"
                      type="number"
                      step="1"
                      value={editFeeder.tray.feedCount}
                      onChange={(e) =>
                        setTrayField({
                          feedCount: parseInt(e.currentTarget.value, 10) || 0,
                        })
                      }
                    />
                    <span className="muted">
                      of {editFeeder.tray.trayCountX * editFeeder.tray.trayCountY}{" "}
                      parts
                    </span>
                  </div>
                </>
              ) : editFeeder.strip ? (
                <>
                  <TeachLoc
                    label="Reference hole (first sprocket hole)"
                    value={editFeeder.strip.referenceHole}
                    onChange={(loc) => setStripField({ referenceHole: loc })}
                    onGo={(t) => moveToFeederLoc(t, "refHole")}
                    onCapture={(t) => captureFeederLoc(t, "refHole")}
                  />
                  <TeachLoc
                    label="Last hole (far end of the tape)"
                    value={editFeeder.strip.lastHole}
                    onChange={(loc) => setStripField({ lastHole: loc })}
                    onGo={(t) => moveToFeederLoc(t, "lastHole")}
                    onCapture={(t) => captureFeederLoc(t, "lastHole")}
                  />
                  <div className="field-grid">
                    <label className="loc-field">
                      <span>Part pitch (mm)</span>
                      <input
                        type="number"
                        step="0.1"
                        value={editFeeder.strip.partPitch}
                        onChange={(e) =>
                          setStripField({
                            partPitch: parseFloat(e.currentTarget.value) || 0,
                          })
                        }
                      />
                    </label>
                    <label className="loc-field">
                      <span>Tape width (mm)</span>
                      <input
                        type="number"
                        step="1"
                        value={editFeeder.strip.tapeWidth}
                        onChange={(e) =>
                          setStripField({
                            tapeWidth: parseFloat(e.currentTarget.value) || 0,
                          })
                        }
                      />
                    </label>
                    <label className="loc-field">
                      <span>Tape type</span>
                      <select
                        className="type-select"
                        value={editFeeder.strip.tapeType}
                        onChange={(e) =>
                          setStripField({ tapeType: e.currentTarget.value })
                        }
                      >
                        {TAPE_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="loc-field">
                      <span>Feed count</span>
                      <input
                        type="number"
                        step="1"
                        value={editFeeder.strip.feedCount}
                        onChange={(e) =>
                          setStripField({
                            feedCount: parseInt(e.currentTarget.value, 10) || 0,
                          })
                        }
                      />
                    </label>
                  </div>
                </>
              ) : editFeeder.editableLocation ? (
                <TeachLoc
                  label="Pick location"
                  value={editFeeder.location ?? null}
                  onChange={(loc) => setEF({ location: loc })}
                  onGo={(t) => moveToFeederLoc(t, "location")}
                  onCapture={(t) => captureFeederLoc(t, "location")}
                />
              ) : (
                <div className="muted">
                  This feeder type has no directly editable pick location.
                </div>
              )}
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setEditFeeder(null)}>
                Close
              </button>
              {editFeeder.photon && (
                <button className="btn btn-primary" onClick={savePhoton}>
                  Save
                </button>
              )}
              {editFeeder.strip && (
                <button className="btn btn-primary" onClick={saveStrip}>
                  Save
                </button>
              )}
              {editFeeder.tray && (
                <button className="btn btn-primary" onClick={saveTray}>
                  Save
                </button>
              )}
              {!editFeeder.photon &&
                !editFeeder.strip &&
                !editFeeder.tray &&
                editFeeder.editableLocation && (
                  <button
                    className="btn btn-primary"
                    onClick={saveFeederLocation}
                  >
                    Save location
                  </button>
                )}
            </div>
          </div>
        </div>
      )}

      {skipReport && (
        <div className="modal-backdrop" onClick={() => setSkipReport(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>
                {skipReport.aborted ? "Job aborted" : "Job complete"}
                {skipReport.skipped.length > 0 &&
                  ` — ${skipReport.skipped.length} skipped`}
              </h3>
              <button
                className="icon-btn"
                onClick={() => setSkipReport(null)}
                title="Close"
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              {skipReport.skipped.length === 0 ? (
                <div className="muted">
                  Every enabled placement was placed. Nothing skipped.
                </div>
              ) : (
                <>
                  <div className="teach-head">
                    These placements were skipped (feeder fault, alignment, or
                    out of parts). Re-run to retry them.
                  </div>
                  <div className="ptable-wrap">
                    <table className="ptable">
                      <thead>
                        <tr>
                          <th>Ref</th>
                          <th>Part</th>
                          <th>Board</th>
                        </tr>
                      </thead>
                      <tbody>
                        {skipReport.skipped.map((s) => (
                          <tr key={s.id}>
                            <td className="mono">{s.id}</td>
                            <td className="muted">{s.part ?? "—"}</td>
                            <td className="muted">{s.board}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
            <div className="modal-foot">
              <button
                className="btn btn-primary"
                onClick={() => setSkipReport(null)}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
