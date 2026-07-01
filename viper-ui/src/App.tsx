import { useCallback, useEffect, useRef, useState } from "react";
import { BoardMap, type Placement } from "./BoardMap";
import {
  CameraIcon,
  CrosshairIcon,
  EyeIcon,
  FolderIcon,
  GearIcon,
  NozzleIcon,
  SearchIcon,
  TrashIcon,
  UndoIcon,
  WarnIcon,
} from "./Icons";
import viperLogo from "./assets/viperpnp-logo.png";
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
  axisCount: number;
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

interface FeederInfo {
  id: string;
  name: string;
  type: string;
  part: string | null;
  enabled: boolean;
  canEnable?: boolean;
  needs?: string[];
  capacity?: number;
  remaining?: number;
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
  maxFeedCount: number;
}

interface TrayCfg {
  firstLocation: FeederLoc | null;
  trayCountX: number;
  trayCountY: number;
  offsetX: number;
  offsetY: number;
  feedCount: number;
}

interface RotatedTrayCfg {
  firstLocation: FeederLoc | null;
  firstRowLastLocation: FeederLoc | null;
  lastLocation: FeederLoc | null;
  trayCountCols: number;
  trayCountRows: number;
  componentRotation: number;
  feedCount: number;
  colPitch: number;
  rowPitch: number;
  trayRotation: number;
}

interface FeederConfig extends FeederInfo {
  editableLocation: boolean;
  location?: FeederLoc;
  photon?: PhotonCfg;
  strip?: StripCfg;
  tray?: TrayCfg;
  rotatedTray?: RotatedTrayCfg;
  feedRetryCount?: number;
  pickRetryCount?: number;
}

interface BoardInfo {
  file: string | null;
  name: string;
  placements: number;
  fiducials: number;
  dirty: boolean;
}

interface JobLibInfo {
  file: string | null;
  name: string;
  boardCount: number;
  placementCount: number;
  active: boolean;
  dirty: boolean;
}

interface JobBoardLoc {
  uid: string;
  boardFile: string | null;
  boardName: string;
  side: string;
  enabled: boolean;
  checkFids: boolean;
  x: number;
  y: number;
  z: number;
  rotation: number;
  placements: number;
}

interface PartInfo {
  id: string;
  name: string;
  height: number;
  hasHeight: boolean;
  fiducial?: boolean;
  package: string | null;
  speed: number;
}

interface PackageInfo {
  id: string;
  description: string | null;
  nozzleTips: string[];
  hasNozzle: boolean;
}

interface NtInfo {
  id: string;
  name: string;
}

interface DriverInfo {
  id: string;
  name: string;
  type: string;
  commType?: string;
  port?: string;
  baud?: number;
  ip?: string;
  tcpPort?: number;
}

interface ActuatorInfo {
  id: string;
  name: string;
  mount: string;
  type: string;
  driver: string | null;
  role?: string;
  state?: boolean | null;
}

interface CameraInfo {
  id: string;
  name: string;
  mount: string;
  looking: string;
  width: number;
  height: number;
  uppX: number;
  uppY: number;
  rotation: number;
  light: string | null;
}

interface NozzleInfo {
  id: string;
  name: string;
  mount: string;
  vacuum: string;
  blowOff: string;
  vacuumSense: string;
  tip: string | null;
}
interface NozzleTipInfo {
  id: string;
  name: string;
  methodPartOn?: string;
  methodPartOff?: string;
  establishPartOnLevel?: boolean;
  partOnCheckAfterPick?: boolean;
  partOnCheckAlign?: boolean;
  partOnCheckBeforePlace?: boolean;
  partOffCheckAfterPlace?: boolean;
  partOffCheckBeforePick?: boolean;
  vacuumLevelPartOnLow?: number;
  vacuumLevelPartOnHigh?: number;
  vacuumDifferencePartOnLow?: number;
  vacuumDifferencePartOnHigh?: number;
  vacuumLevelPartOffLow?: number;
  vacuumLevelPartOffHigh?: number;
  vacuumDifferencePartOffLow?: number;
  vacuumDifferencePartOffHigh?: number;
}
const VAC_METHODS = ["None", "Absolute", "Difference"];
interface ActuatorOpt {
  id: string;
  name: string;
}
interface AxisInfo {
  id: string;
  name: string;
  type: string | null;
  letter: string | null;
  driver: string | null;
  feedrate: number;
  accel: number;
  jerk: number;
  limitLow: number;
  limitLowOn: boolean;
  limitHigh: number;
  limitHighOn: boolean;
}
interface GeneralInfo {
  homeAfterEnabled: boolean;
  autoToolSelect: boolean;
  safeZPark: boolean;
  parkAfterHomed: boolean;
  discard: { x: number; y: number; z: number };
  park?: { x: number; y: number; z: number };
  headName?: string;
}

const ZERO_LOC: FeederLoc = { x: 0, y: 0, z: 0, rotation: 0 };
const TAPE_TYPES = ["WhitePaper", "BlackPlastic", "ClearPlastic"];
const IMPORT_FORMATS = [
  { id: "kicad", label: "KiCad" },
  { id: "csv", label: "CSV (centroid)" },
  { id: "eagle", label: "Eagle .mnt" },
];
const ERROR_HANDLING = ["Default", "Alert", "Defer"];
const BAUDS = [9600, 19200, 38400, 57600, 115200, 230400, 250000, 460800, 921600];
const NEW_PART: PartInfo = {
  id: "",
  name: "",
  height: 0,
  hasHeight: false,
  package: null,
  speed: 1,
};
const NEW_PACKAGE: PackageInfo = {
  id: "",
  description: "",
  nozzleTips: [],
  hasNozzle: false,
};

type TeachTool = "camera" | "nozzle";
type TeachTarget =
  | "location"
  | "slot"
  | "offset"
  | "refHole"
  | "lastHole"
  | "firstRowLast"
  | "lastComponent";

type Tab = "machine" | "board" | "jobs" | "feeders" | "parts" | "packages";

const STEPS = [0.01, 0.1, 1, 10, 100];

const TABS: { id: Tab; label: string }[] = [
  { id: "machine", label: "Machine" },
  { id: "board", label: "Board" },
  { id: "jobs", label: "Jobs" },
  { id: "feeders", label: "Feeders" },
  { id: "parts", label: "Parts" },
  { id: "packages", label: "Packages" },
];

const SOON = ["Vision", "Log"];

const MACHINE_CARDS: {
  id: string;
  title: string;
  desc: string;
  ready: boolean;
}[] = [
  {
    id: "connection",
    title: "Connection",
    desc: "Driver & serial port",
    ready: true,
  },
  {
    id: "motion",
    title: "Motion & Axes",
    desc: "Limits, feedrates, homing",
    ready: true,
  },
  {
    id: "nozzles",
    title: "Nozzles & Tips",
    desc: "Nozzles, vacuum, tips",
    ready: true,
  },
  {
    id: "cameras",
    title: "Cameras",
    desc: "Top & bottom cameras",
    ready: true,
  },
  {
    id: "actuators",
    title: "Actuators & I/O",
    desc: "Vacuum, lights, valves",
    ready: true,
  },
  {
    id: "general",
    title: "General",
    desc: "Homing, parking, tool select",
    ready: true,
  },
];

/** Number input with custom gray up/down triangle steppers (native spinners hidden). */
function NumberInput({
  value,
  onChange,
  step = 1,
  min,
  className,
  disabled = false,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  className?: string;
  disabled?: boolean;
}) {
  const decimals = (String(step).split(".")[1] || "").length;
  const bump = (dir: 1 | -1) => {
    if (disabled) return;
    let v = parseFloat((value + dir * step).toFixed(decimals + 3));
    if (min !== undefined && v < min) v = min;
    onChange(v);
  };
  return (
    <span className={`num-input ${disabled ? "is-disabled" : ""} ${className ?? ""}`}>
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.currentTarget.value) || 0)}
      />
      <span className="num-spin">
        <button type="button" tabIndex={-1} aria-label="Increase" disabled={disabled} onClick={() => bump(1)}>
          <svg viewBox="0 0 12 8">
            <path d="M6 2 L10 6.4 L2 6.4 Z" />
          </svg>
        </button>
        <button type="button" tabIndex={-1} aria-label="Decrease" disabled={disabled} onClick={() => bump(-1)}>
          <svg viewBox="0 0 12 8">
            <path d="M6 6 L2 1.6 L10 1.6 Z" />
          </svg>
        </button>
      </span>
    </span>
  );
}

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
            {onChange ? (
              <NumberInput
                step={0.01}
                value={v[k]}
                onChange={(nv) => onChange({ ...v, [k]: nv })}
              />
            ) : (
              <input type="number" step="0.01" disabled value={v[k]} />
            )}
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
  const [importPath, setImportPath] = useState(
    "C:/dev/viperpnp/samples/kicad-example-F.Cu.pos",
  );
  const [importErr, setImportErr] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importFormat, setImportFormat] = useState("kicad");
  const [formatMenuOpen, setFormatMenuOpen] = useState(false);
  const [savePath, setSavePath] = useState("");
  const [createParts, setCreateParts] = useState(true);
  const [importConflict, setImportConflict] = useState<{
    name: string;
    file: string;
  } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [boards, setBoards] = useState<BoardInfo[]>([]);
  const [activeBoard, setActiveBoard] = useState<string | null>(null);
  const [boardPlacements, setBoardPlacements] = useState<Placement[]>([]);
  const [boardDims, setBoardDims] = useState({ width: 0, height: 0 });
  const [placementsOpen, setPlacementsOpen] = useState(false);
  const [removeBoardTarget, setRemoveBoardTarget] = useState<BoardInfo | null>(
    null,
  );
  const [selPlacements, setSelPlacements] = useState<Set<string>>(new Set());
  const [plcFilter, setPlcFilter] = useState("");
  const [plcTypeFilter, setPlcTypeFilter] = useState("all");
  const [sortCol, setSortCol] = useState("id");
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [newBoardOpen, setNewBoardOpen] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const [jobs, setJobs] = useState<JobLibInfo[]>([]);
  const [newJobOpen, setNewJobOpen] = useState(false);
  const [newJobName, setNewJobName] = useState("");
  const [renameJobTarget, setRenameJobTarget] = useState<JobLibInfo | null>(
    null,
  );
  const [renameJobName, setRenameJobName] = useState("");
  const [removeJobTarget, setRemoveJobTarget] = useState<JobLibInfo | null>(
    null,
  );
  const [jobErr, setJobErr] = useState("");
  const [jobEditFile, setJobEditFile] = useState<string | null>(null);
  const [jobEditName, setJobEditName] = useState("");
  const [jobBoards, setJobBoards] = useState<JobBoardLoc[]>([]);
  const [jobBoardLib, setJobBoardLib] = useState<{ file: string; name: string }[]>(
    [],
  );
  const [addBoardSel, setAddBoardSel] = useState("");
  const [jobRunning, setJobRunning] = useState(false);
  const [jobStatus, setJobStatus] = useState("");
  const [keepGoing, setKeepGoing] = useState(true);
  const [jobSkipped, setJobSkipped] = useState<
    { id: string; part: string | null; board: string }[] | null
  >(null);
  const [jobAborted, setJobAborted] = useState(false);
  const [editPlacement, setEditPlacement] = useState<Placement | null>(null);
  const [partsDetail, setPartsDetail] = useState<PartInfo[]>([]);
  const [packages, setPackages] = useState<PackageInfo[]>([]);
  const [nozzleTips, setNozzleTips] = useState<NtInfo[]>([]);
  const [editPart, setEditPart] = useState<PartInfo | null>(null);
  const [partIsNew, setPartIsNew] = useState(false);
  const [mergeTarget, setMergeTarget] = useState("");
  const [aliases, setAliases] = useState<{ from: string; to: string }[]>([]);
  const [pendingRemaps, setPendingRemaps] = useState<
    { from: string; to: string; count: number }[]
  >([]);
  const [remapBoard, setRemapBoard] = useState<string | null>(null);
  const [remapSel, setRemapSel] = useState<Set<string>>(new Set());
  const [editPackage, setEditPackage] = useState<PackageInfo | null>(null);
  const [pkgIsNew, setPkgIsNew] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [machineCard, setMachineCard] = useState<string | null>(null);
  const [drivers, setDrivers] = useState<DriverInfo[]>([]);
  const [driverPorts, setDriverPorts] = useState<string[]>([]);
  const [actuators, setActuators] = useState<ActuatorInfo[]>([]);
  const [cameras, setCameras] = useState<CameraInfo[]>([]);
  const [nozzles, setNozzles] = useState<NozzleInfo[]>([]);
  const [nzTips, setNzTips] = useState<NozzleTipInfo[]>([]);
  const [nozzleActs, setNozzleActs] = useState<ActuatorOpt[]>([]);
  const [axes, setAxes] = useState<AxisInfo[]>([]);
  const [general, setGeneral] = useState<GeneralInfo | null>(null);
  const [reference, setReference] = useState("camera");
  const [tab, setTab] = useState<Tab>("board");
  const [feeders, setFeeders] = useState<FeederInfo[]>([]);
  const [parts, setParts] = useState<string[]>([]);
  const [feederType, setFeederType] = useState("photon");
  const [feederName, setFeederName] = useState("");
  const [editFeeder, setEditFeeder] = useState<FeederConfig | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FeederInfo | null>(null);
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(
    null,
  );
  const [scanning, setScanning] = useState(false);
  const [configDirty, setConfigDirty] = useState(false);
  const [saving, setSaving] = useState(false);
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

  const loadBoards = useCallback(async () => {
    try {
      const res = await fetch("/api/boards");
      const d = await res.json();
      setBoards(d.boards ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  const loadJobs = useCallback(async () => {
    try {
      const d = await (await fetch("/api/jobs")).json();
      setJobs(d.jobs ?? []);
      const st = await (await fetch("/api/job/state")).json();
      setJobRunning(!!st.running);
    } catch {
      /* ignore */
    }
  }, []);

  const postJob = async (url: string, body: object): Promise<boolean> => {
    setJobErr("");
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (res.status === 409 && d.conflict) {
        setJobErr(`A job named "${d.name}" already exists.`);
        return false;
      }
      if (!res.ok) {
        setJobErr(d.error ?? "Request failed.");
        return false;
      }
      if (d.jobs) setJobs(d.jobs);
      return true;
    } catch (e) {
      setJobErr(e instanceof Error ? e.message : String(e));
      return false;
    }
  };

  const createJob = async () => {
    const name = newJobName.trim();
    if (!name) return;
    if (await postJob("/api/jobs/new", { name })) {
      setNewJobOpen(false);
      setNewJobName("");
    }
  };

  const selectJob = (file: string | null) => {
    postJob("/api/job/select", { file: file ?? "" });
  };

  const doRenameJob = async () => {
    if (!renameJobTarget?.file) return;
    if (
      await postJob("/api/jobs/rename", {
        file: renameJobTarget.file,
        name: renameJobName.trim(),
      })
    ) {
      setRenameJobTarget(null);
    }
  };

  const doRemoveJob = async () => {
    if (!removeJobTarget?.file) return;
    if (await postJob("/api/jobs/remove", { file: removeJobTarget.file })) {
      setRemoveJobTarget(null);
    }
  };

  const applyJobBoards = (d: {
    boards?: JobBoardLoc[];
    library?: { file: string; name: string }[];
    name?: string;
  }) => {
    if (d.boards) setJobBoards(d.boards);
    if (d.library) setJobBoardLib(d.library);
    if (d.name) setJobEditName(d.name);
  };

  const openJobEditor = async (file: string | null) => {
    if (!file) return;
    setJobErr("");
    try {
      const d = await (
        await fetch("/api/job/boards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file }),
        })
      ).json();
      applyJobBoards(d);
      setAddBoardSel(d.library?.[0]?.file ?? "");
      setJobEditFile(file);
    } catch (e) {
      setJobErr(e instanceof Error ? e.message : String(e));
    }
  };

  const postJobBoard = async (url: string, body: object) => {
    setJobErr("");
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) {
        setJobErr(d.error ?? "Request failed.");
        return;
      }
      applyJobBoards(d);
      loadJobs();
    } catch (e) {
      setJobErr(e instanceof Error ? e.message : String(e));
    }
  };

  const addBoardToJob = () => {
    if (!jobEditFile || !addBoardSel) return;
    postJobBoard("/api/job/board/add", {
      file: jobEditFile,
      boardFile: addBoardSel,
    });
  };

  const updateJobBoard = (uid: string, patch: object) => {
    if (!jobEditFile) return;
    postJobBoard("/api/job/board", { file: jobEditFile, uid, ...patch });
  };

  const removeBoardFromJob = (uid: string) => {
    if (!jobEditFile) return;
    postJobBoard("/api/job/board/remove", { file: jobEditFile, uid });
  };

  const teachJobBoard = (uid: string, capture: boolean) => {
    if (!jobEditFile) return;
    const url = capture ? "/api/job/board/capture" : "/api/job/board/move";
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file: jobEditFile, uid, tool: "camera" }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.boards) applyJobBoards(d);
      })
      .catch((e) => setJobErr(e instanceof Error ? e.message : String(e)));
  };

  const runJob = async () => {
    setJobErr("");
    setJobSkipped(null);
    try {
      const res = await fetch("/api/job/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          errorHandling: keepGoing ? "Defer" : "Alert",
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setJobErr(d.error ?? "Could not start the job.");
      }
    } catch (e) {
      setJobErr(e instanceof Error ? e.message : String(e));
    }
  };

  const abortJob = () => {
    fetch("/api/job/abort", { method: "POST" }).catch((e) =>
      setError(e instanceof Error ? e.message : String(e)),
    );
  };

  const loadParts = useCallback(async () => {
    try {
      const d = await (await fetch("/api/parts/detail")).json();
      setPartsDetail(d.parts ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  const loadDrivers = useCallback(async () => {
    try {
      const d = await (await fetch("/api/drivers/detail")).json();
      setDrivers(d.drivers ?? []);
      setDriverPorts(d.ports ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  const loadActuators = useCallback(async () => {
    try {
      const d = await (await fetch("/api/actuators/detail")).json();
      setActuators(d.actuators ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  const actuate = (id: string, on: boolean) => {
    fetch("/api/actuator", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: id, on }),
    })
      .then(() => setTimeout(loadActuators, 400))
      .catch(() => {});
  };

  const loadCameras = useCallback(async () => {
    try {
      const d = await (await fetch("/api/cameras/detail")).json();
      setCameras(d.cameras ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  const updateCamera = (id: string, patch: object) => {
    fetch("/api/camera", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.cameras) setCameras(d.cameras);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  const loadNozzles = useCallback(async () => {
    try {
      const d = await (await fetch("/api/nozzles/detail")).json();
      setNozzles(d.nozzles ?? []);
      setNzTips(d.nozzleTips ?? []);
      setNozzleActs(d.actuators ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  const applyNozzleResp = (d: {
    nozzles?: NozzleInfo[];
    nozzleTips?: NozzleTipInfo[];
    actuators?: ActuatorOpt[];
  }) => {
    if (d.nozzles) setNozzles(d.nozzles);
    if (d.nozzleTips) setNzTips(d.nozzleTips);
    if (d.actuators) setNozzleActs(d.actuators);
  };

  const updateNozzle = (id: string, patch: object) => {
    fetch("/api/nozzle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    })
      .then((r) => r.json())
      .then(applyNozzleResp)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  const updateTip = (id: string, patch: object) => {
    fetch("/api/nozzletip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    })
      .then((r) => r.json())
      .then(applyNozzleResp)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  const loadAxes = useCallback(async () => {
    try {
      const d = await (await fetch("/api/axes/detail")).json();
      setAxes(d.axes ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  const updateAxis = (id: string, patch: object) => {
    fetch("/api/axis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.axes) setAxes(d.axes);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  const loadGeneral = useCallback(async () => {
    try {
      const d = await (await fetch("/api/general")).json();
      setGeneral(d);
    } catch {
      /* ignore */
    }
  }, []);

  const updateGeneral = (patch: object) => {
    fetch("/api/general", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
      .then((r) => r.json())
      .then((d) => setGeneral(d))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  const openCard = (id: string) => {
    if (id === "connection") loadDrivers();
    if (id === "actuators") loadActuators();
    if (id === "cameras") loadCameras();
    if (id === "nozzles") loadNozzles();
    if (id === "motion") loadAxes();
    if (id === "general") loadGeneral();
    setMachineCard(id);
  };

  const updateDriver = (id: string, patch: object) => {
    fetch("/api/driver", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.drivers) {
          setDrivers(d.drivers);
          setDriverPorts(d.ports ?? []);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  const setMachineEnabled = (on: boolean) => {
    fetch(on ? "/api/machine/connect" : "/api/machine/disconnect", {
      method: "POST",
    })
      .then(() => setTimeout(loadDrivers, 600))
      .catch(() => {});
  };

  const loadPackages = useCallback(async () => {
    try {
      const d = await (await fetch("/api/packages")).json();
      setPackages(d.packages ?? []);
      setNozzleTips(d.nozzleTips ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (tab === "feeders") {
      loadFeeders();
    }
    if (tab === "board") {
      loadBoards();
    }
    if (tab === "jobs") {
      loadJobs();
      loadBoards();
    }
    if (tab === "parts") {
      loadParts();
      loadPackages();
    }
    if (tab === "packages") {
      loadPackages();
    }
  }, [tab, loadFeeders, loadBoards, loadJobs, loadParts, loadPackages]);

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
          setJobSkipped(null);
          setJobStatus(String(data.text ?? "Job started"));
        } else if (data && data.event === "jobStatus") {
          setJobStatus(String(data.text ?? ""));
        } else if (data && data.event === "jobComplete") {
          setJobRunning(false);
          setJobStatus(data.aborted ? "Job aborted" : "Job complete");
          setJobSkipped(data.skipped ?? []);
          setJobAborted(!!data.aborted);
          loadJobs();
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
  }, [loadInventory, loadJobs]);

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

  const pickBoardFile = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const sel = await open({
        multiple: false,
        directory: false,
        title: "Select a board file",
        filters: [
          {
            name: "Board files",
            extensions: ["pos", "csv", "mnt", "xml", "brd"],
          },
          { name: "All files", extensions: ["*"] },
        ],
      });
      if (typeof sel === "string") setImportPath(sel);
    } catch {
      setImportErr("The file picker is only available in the desktop app.");
    }
  };

  const pickSaveFolder = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const sel = await open({
        directory: true,
        multiple: false,
        title: "Choose where to save the board file",
      });
      if (typeof sel === "string") setSavePath(sel);
    } catch {
      setImportErr("The folder picker is only available in the desktop app.");
    }
  };

  const runImport = async (overrides: {
    boardName?: string;
    replace?: boolean;
  }) => {
    setImporting(true);
    setImportErr(null);
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format: importFormat,
          topFile: importPath,
          savePath: savePath || undefined,
          createMissingParts: createParts,
          ...overrides,
        }),
      });
      const data = await res.json();
      if (res.status === 409 && data.conflict) {
        setImportConflict({ name: data.name, file: data.file });
        setRenameValue(`${data.name}-copy`);
        return;
      }
      if (data && (data.event === "error" || data.error)) {
        setImportErr(String(data.message ?? data.error));
      } else {
        setBoards(data.boards ?? []);
        setImportConflict(null);
        const pr = data.pendingRemaps ?? [];
        if (pr.length > 0) {
          setPendingRemaps(pr);
          setRemapBoard(data.importedBoard ?? null);
          setRemapSel(
            new Set(pr.map((r: { from: string }) => r.from)),
          );
        }
      }
    } catch (e) {
      setImportErr(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  };

  const doImport = () => runImport({});

  const loadAliases = useCallback(async () => {
    try {
      const d = await (await fetch("/api/aliases")).json();
      setAliases(d.aliases ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  const doMerge = () => {
    if (!editPart || !mergeTarget) return;
    postParts("/api/parts/merge", { from: editPart.id, to: mergeTarget });
    setEditPart(null);
    setMergeTarget("");
    loadAliases();
  };

  const applyRemaps = async () => {
    if (!remapBoard) return;
    const remaps = pendingRemaps
      .filter((r) => remapSel.has(r.from))
      .map((r) => ({ from: r.from, to: r.to }));
    try {
      if (remaps.length > 0) {
        const d = await (
          await fetch("/api/parts/apply-remaps", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ board: remapBoard, remaps }),
          })
        ).json();
        if (d.boards) setBoards(d.boards);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPendingRemaps([]);
      setRemapBoard(null);
    }
  };

  const removeAlias = (from: string) => {
    fetch("/api/aliases/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from }),
    })
      .then((r) => r.json())
      .then((d) => setAliases(d.aliases ?? []))
      .catch(() => {});
  };

  const openBoard = async (file: string | null) => {
    if (!file) return;
    setActiveBoard(file);
    setSelPlacements(new Set());
    setPlcFilter("");
    setPlacementsOpen(true);
    try {
      const res = await fetch("/api/board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ board: file }),
      });
      const d = await res.json();
      setBoardPlacements(d.placements ?? []);
      setBoardDims({ width: d.width ?? 0, height: d.height ?? 0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const confirmRemoveBoard = async () => {
    if (!removeBoardTarget) return;
    try {
      const res = await fetch("/api/boards/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ board: removeBoardTarget.file }),
      });
      const d = await res.json();
      if (d.boards) setBoards(d.boards);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRemoveBoardTarget(null);
    }
  };

  // Board-scoped placement op: response is the board's refreshed placements.
  const postPlacement = async (url: string, body: object) => {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ board: activeBoard, ...body }),
      });
      const data = await res.json();
      if (data && (data.event === "error" || data.error)) {
        setError(String(data.message ?? data.error));
      } else {
        setBoardPlacements(data.placements ?? []);
        if (data.width !== undefined)
          setBoardDims({ width: data.width, height: data.height });
        loadBoards();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const addPlacement = () => postPlacement("/api/job/placement/add", {});
  const setBoardOrigin = (id: string) =>
    postPlacement("/api/job/board-origin", { id });

  const selIds = () => Array.from(selPlacements);
  const deleteSelPlacements = () => {
    if (selPlacements.size === 0) return;
    postPlacement("/api/job/placement/delete", { ids: selIds() });
    setSelPlacements(new Set());
  };
  const batchSet = (patch: {
    type?: string;
    side?: string;
    enabled?: boolean;
    errorHandling?: string;
  }) => {
    if (selPlacements.size === 0) return;
    postPlacement("/api/job/placement/batch", { ids: selIds(), ...patch });
  };
  const toggleSel = (id: string) =>
    setSelPlacements((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const setBoardSize = (width: number, height: number) =>
    postPlacement("/api/board/dimensions", { width, height });

  const postParts = async (url: string, body: object) => {
    try {
      const d = await (
        await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      ).json();
      if (d.error || d.event === "error")
        setError(String(d.message ?? d.error));
      else setPartsDetail(d.parts ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const updatePart = (id: string, patch: object) =>
    postParts("/api/part", { id, ...patch });
  const deletePart = (id: string) => postParts("/api/part/delete", { id });

  const postPackages = async (url: string, body: object) => {
    try {
      const d = await (
        await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      ).json();
      if (d.error || d.event === "error")
        setError(String(d.message ?? d.error));
      else {
        setPackages(d.packages ?? []);
        setNozzleTips(d.nozzleTips ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const updatePackage = (id: string, patch: object) =>
    postPackages("/api/package", { id, ...patch });
  const deletePackage = (id: string) =>
    postPackages("/api/package/delete", { id });

  const savePart = () => {
    if (!editPart) return;
    const id = editPart.id.trim();
    if (!id) return;
    if (partIsNew)
      postParts("/api/part/add", {
        id,
        name: editPart.name,
        height: editPart.height,
        packageId: editPart.package ?? "",
      });
    else
      updatePart(id, {
        name: editPart.name,
        height: editPart.height,
        packageId: editPart.package ?? "",
        speed: editPart.speed,
      });
    setEditPart(null);
  };

  const savePackage = async () => {
    if (!editPackage) return;
    const id = editPackage.id.trim();
    if (!id) return;
    if (pkgIsNew) {
      await postPackages("/api/package/add", {
        id,
        description: editPackage.description,
      });
      if (editPackage.nozzleTips.length)
        await postPackages("/api/package", {
          id,
          nozzleTips: editPackage.nozzleTips,
        });
    } else {
      await postPackages("/api/package", {
        id,
        description: editPackage.description,
        nozzleTips: editPackage.nozzleTips,
      });
    }
    setEditPackage(null);
  };

  const openWizard = () => {
    loadParts();
    loadPackages();
    loadAliases();
    setWizardOpen(true);
  };

  const createNewBoard = async () => {
    if (!newBoardName.trim()) return;
    try {
      const res = await fetch("/api/boards/new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newBoardName.trim(),
          savePath: savePath || undefined,
        }),
      });
      const d = await res.json();
      if (res.status === 409 && d.conflict) {
        setError(`A board named "${d.name}" already exists.`);
        return;
      }
      if (d.boards) setBoards(d.boards);
      setNewBoardOpen(false);
      setNewBoardName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const updatePlacement = async (
    id: string,
    patch: {
      type?: string;
      enabled?: boolean;
      side?: string;
      errorHandling?: string;
      partId?: string;
      x?: number;
      y?: number;
      rot?: number;
    },
  ) => {
    try {
      const res = await fetch("/api/job/placement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ board: activeBoard, id, ...patch }),
      });
      const data = await res.json();
      if (data && (data.event === "error" || data.error)) {
        setError(String(data.message ?? data.error));
      } else {
        setBoardPlacements(data.placements ?? []);
        loadBoards();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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

  const confirmDeleteFeeder = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch("/api/feeders/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deleteTarget.id }),
      });
      const d = await res.json();
      if (d.feeders) setFeeders(d.feeders);
      else if (d.error) setError(String(d.message ?? d.error));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleteTarget(null);
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
  const setRotTrayField = (patch: Partial<RotatedTrayCfg>) =>
    setEditFeeder((ef) =>
      ef?.rotatedTray
        ? { ...ef, rotatedTray: { ...ef.rotatedTray, ...patch } }
        : ef,
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
      maxFeedCount: s.maxFeedCount,
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

  const postRotTray = (recalculate: boolean) => {
    if (!editFeeder?.rotatedTray) return;
    const t = editFeeder.rotatedTray;
    postFeeder("/api/feeder/rotatedtray", {
      id: editFeeder.id,
      firstLocation: t.firstLocation ?? undefined,
      firstRowLastLocation: t.firstRowLastLocation ?? undefined,
      lastLocation: t.lastLocation ?? undefined,
      trayCountCols: t.trayCountCols,
      trayCountRows: t.trayCountRows,
      componentRotation: t.componentRotation,
      feedCount: t.feedCount,
      recalculate,
    });
  };

  const feederCountOp = (id: string, op: "reset" | "advance") => {
    fetch("/api/feeder/count", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, op }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.feeders) setFeeders(d.feeders);
      })
      .catch(() => {
        /* ignore */
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

  const placements = boardPlacements;
  const visiblePlacements = (() => {
    const f = plcFilter.trim().toLowerCase();
    let ps = placements.filter((p) => {
      if (plcTypeFilter !== "all" && p.type !== plcTypeFilter) return false;
      if (!f) return true;
      return (
        p.id.toLowerCase().includes(f) ||
        (p.part ?? "").toLowerCase().includes(f)
      );
    });
    ps = [...ps].sort((a, b) => {
      const pick = (p: Placement): string | number => {
        switch (sortCol) {
          case "part":
            return p.part ?? "";
          case "side":
            return p.side ?? "";
          case "type":
            return p.type;
          case "enabled":
            return p.enabled ? 1 : 0;
          default:
            return p.id;
        }
      };
      const av = pick(a);
      const bv = pick(b);
      if (typeof av === "string" && typeof bv === "string")
        return av.localeCompare(bv) * sortDir;
      return ((av as number) - (bv as number)) * sortDir;
    });
    return ps;
  })();
  const allVisibleSelected =
    visiblePlacements.length > 0 &&
    visiblePlacements.every((p) => selPlacements.has(p.id));
  const toggleSortCol = (col: string) => {
    if (sortCol === col) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortCol(col);
      setSortDir(1);
    }
  };
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
          <img
            className="brand-logo"
            src={viperLogo}
            alt="ViperPNP"
            draggable={false}
          />
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
              <>
                <section className="card machine-summary">
                  <div>
                    <div className="big">{shortImpl}</div>
                    <div className="muted">{inventory.impl}</div>
                  </div>
                  <span className={`badge ${enabled ? "on" : ""}`}>
                    {enabled ? "Connected" : "Disconnected"}
                  </span>
                </section>
                <div className="machine-cards">
                  {MACHINE_CARDS.map((c) => {
                    const summary =
                      c.id === "connection"
                        ? `${inventory.drivers[0]?.type ?? "no driver"} · ${
                            enabled ? "connected" : "offline"
                          }`
                        : c.id === "motion"
                          ? `${inventory.axisCount} axes`
                        : c.id === "nozzles"
                          ? `${inventory.heads.flatMap((h) => h.nozzles).length} nozzles`
                          : c.id === "cameras"
                            ? `${
                                inventory.machineCameras.length +
                                inventory.heads.flatMap((h) => h.cameras).length
                              } cameras`
                            : c.id === "actuators"
                              ? `${inventory.actuatorCount} actuators`
                              : c.desc;
                    return (
                      <button
                        key={c.id}
                        className="mcard"
                        onClick={() => openCard(c.id)}
                      >
                        <div className="mcard-title">
                          {c.title}
                          {!c.ready && (
                            <span className="mcard-soon">soon</span>
                          )}
                        </div>
                        <div className="muted mcard-sum">{summary}</div>
                      </button>
                    );
                  })}
                  <button
                    className="mcard"
                    onClick={() => setTab("feeders")}
                  >
                    <div className="mcard-title">Feeders</div>
                    <div className="muted mcard-sum">
                      {inventory.feederCount} feeders →
                    </div>
                  </button>
                </div>
              </>
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
                <h2>Boards</h2>
                <div className="import-row">
                  <div className="path-field">
                    <input
                      className="import-input"
                      value={importPath}
                      onChange={(e) => setImportPath(e.currentTarget.value)}
                      placeholder="path to a board file on the server"
                    />
                    <button
                      className="path-browse"
                      onClick={pickBoardFile}
                      title="Browse for a board file"
                      aria-label="Browse for a board file"
                    >
                      <FolderIcon size={15} />
                    </button>
                  </div>
                  <div className="split-btn">
                    <button
                      className="btn btn-primary split-main"
                      onClick={doImport}
                      disabled={importing}
                    >
                      {importing
                        ? "Importing…"
                        : `Import ${
                            IMPORT_FORMATS.find((f) => f.id === importFormat)
                              ?.label ?? "KiCad"
                          }`}
                    </button>
                    <button
                      className="btn btn-primary split-arrow"
                      onClick={() => setFormatMenuOpen((o) => !o)}
                      aria-label="Choose import format"
                    >
                      ▾
                    </button>
                    {formatMenuOpen && (
                      <div className="split-menu">
                        {IMPORT_FORMATS.map((f) => (
                          <button
                            key={f.id}
                            className={`split-item ${
                              f.id === importFormat ? "active" : ""
                            }`}
                            onClick={() => {
                              setImportFormat(f.id);
                              setFormatMenuOpen(false);
                            }}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="import-row save-row">
                <div className="path-field">
                  <input
                    className="import-input"
                    value={savePath}
                    onChange={(e) => setSavePath(e.currentTarget.value)}
                    placeholder="save to (default: config/boards) — folder or .board.xml path"
                  />
                  <button
                    className="path-browse"
                    onClick={pickSaveFolder}
                    title="Browse for a save folder"
                    aria-label="Browse for a save folder"
                  >
                    <FolderIcon size={15} />
                  </button>
                </div>
                <label
                  className="run-toggle"
                  title="On import, create Part entries for any part not already in the library."
                >
                  <input
                    type="checkbox"
                    checked={createParts}
                    onChange={(e) => setCreateParts(e.currentTarget.checked)}
                  />
                  Create missing parts
                </label>
              </div>
              {importErr && <div className="banner banner-warn">{importErr}</div>}
              <div className="boards-toolbar">
                <button
                  className="btn btn-sm"
                  onClick={() => {
                    setNewBoardName("");
                    setNewBoardOpen(true);
                  }}
                >
                  + New board
                </button>
              </div>
              {boards.length === 0 ? (
                <div className="muted">
                  No boards yet. Import a board file (KiCad, CSV, Eagle) or make a
                  new one.
                </div>
              ) : (
                <div className="ptable-wrap">
                  <table className="ptable">
                    <thead>
                      <tr>
                        <th>Board</th>
                        <th>Placements</th>
                        <th>Fiducials</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {boards.map((b) => (
                        <tr key={b.file ?? b.name}>
                          <td className="mono">
                            {b.name}
                            {b.dirty && (
                              <span className="dirty-dot" title="Unsaved edits">
                                {" "}
                                •
                              </span>
                            )}
                          </td>
                          <td className="mono">{b.placements}</td>
                          <td className="mono">{b.fiducials}</td>
                          <td className="row-actions">
                            <button
                              className="btn btn-sm btn-icon"
                              onClick={() => openBoard(b.file)}
                              title="Open placements"
                              aria-label="Open placements"
                            >
                              <EyeIcon size={15} />
                            </button>
                            <button
                              className="btn btn-sm btn-icon btn-trash"
                              onClick={() => setRemoveBoardTarget(b)}
                              title="Remove board from library"
                              aria-label="Remove board"
                            >
                              <TrashIcon size={15} />
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

          {tab === "jobs" && (
            <section className="board card">
              <div className="board-head">
                <h2>Jobs</h2>
                <button
                  className="btn btn-sm"
                  onClick={() => {
                    setNewJobName("");
                    setJobErr("");
                    setNewJobOpen(true);
                  }}
                >
                  + New job
                </button>
              </div>
              <p className="muted job-hint">
                A job is a <span className="mono">.job.xml</span> file that
                places one or more boards on the machine. Set one active to edit
                or run it. Cross-compatible with OpenPnP.
              </p>
              {jobErr && <div className="banner banner-warn">{jobErr}</div>}
              {jobs.length === 0 ? (
                <div className="muted">
                  No jobs yet. Create one, then add boards to it.
                </div>
              ) : (
                <div className="ptable-wrap">
                  <table className="ptable">
                    <thead>
                      <tr>
                        <th></th>
                        <th>Job</th>
                        <th>Boards</th>
                        <th>Placements</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {jobs.map((j) => (
                        <tr
                          key={j.file ?? j.name}
                          className={j.active ? "job-active-row" : ""}
                        >
                          <td>
                            <input
                              type="radio"
                              name="active-job"
                              checked={j.active}
                              onChange={() => selectJob(j.file)}
                              title="Set as the active job"
                            />
                          </td>
                          <td className="mono">
                            {j.name}
                            {j.active && (
                              <span className="job-active-tag">active</span>
                            )}
                            {j.dirty && (
                              <span className="dirty-dot" title="Unsaved edits">
                                {" "}
                                •
                              </span>
                            )}
                          </td>
                          <td className="mono">{j.boardCount}</td>
                          <td className="mono">{j.placementCount}</td>
                          <td className="row-actions">
                            <button
                              className="btn btn-sm btn-icon"
                              onClick={() => openJobEditor(j.file)}
                              title="Edit boards & positions"
                              aria-label="Edit job boards"
                            >
                              <EyeIcon size={15} />
                            </button>
                            <button
                              className="btn btn-sm btn-icon"
                              onClick={() => {
                                setRenameJobName(j.name);
                                setJobErr("");
                                setRenameJobTarget(j);
                              }}
                              title="Rename job"
                              aria-label="Rename job"
                            >
                              <GearIcon size={15} />
                            </button>
                            <button
                              className="btn btn-sm btn-icon btn-trash"
                              onClick={() => setRemoveJobTarget(j)}
                              title="Delete job"
                              aria-label="Delete job"
                            >
                              <TrashIcon size={15} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {(() => {
                const active = jobs.find((j) => j.active);
                if (!active) return null;
                return (
                  <div className="run-panel">
                    <div className="run-panel-head">
                      <span>
                        Run <span className="mono">{active.name}</span> ·{" "}
                        {active.boardCount} board
                        {active.boardCount === 1 ? "" : "s"} ·{" "}
                        {active.placementCount} placements
                      </span>
                      {!enabled && (
                        <span className="muted">
                          — machine offline; connect to run
                        </span>
                      )}
                    </div>
                    <div className="run-controls">
                      {!jobRunning ? (
                        <button
                          className="btn btn-primary"
                          onClick={runJob}
                          disabled={
                            !enabled || active.placementCount === 0
                          }
                        >
                          ▶ Run job
                        </button>
                      ) : (
                        <button className="btn btn-danger" onClick={abortJob}>
                          ■ Abort
                        </button>
                      )}
                      <label
                        className="run-toggle"
                        title="On a feeder fault, retry then skip the placement and keep going, instead of pausing the job."
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
                        <span className="run-live">
                          <span className="run-dot" /> {jobStatus}
                        </span>
                      )}
                    </div>
                    {!jobRunning && jobStatus && jobSkipped !== null && (
                      <div
                        className={`banner ${
                          jobAborted || jobSkipped.length > 0
                            ? "banner-warn"
                            : "banner-ok"
                        }`}
                      >
                        {jobAborted
                          ? "Job aborted. "
                          : jobSkipped.length === 0
                            ? "Job complete — all placements placed."
                            : `Job complete — ${jobSkipped.length} placement${
                                jobSkipped.length === 1 ? "" : "s"
                              } skipped:`}
                        {jobSkipped.length > 0 && (
                          <ul className="skip-list">
                            {jobSkipped.map((s) => (
                              <li key={`${s.board}-${s.id}`}>
                                <span className="mono">{s.id}</span>
                                {s.part ? ` · ${s.part}` : ""} ·{" "}
                                <span className="muted">{s.board}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
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
                    <option value="rotatedtray">Rotated Tray</option>
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
                        <th>Left</th>
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
                            <span className="active-cell">
                              <input
                                type="checkbox"
                                checked={f.enabled}
                                onChange={(e) =>
                                  updateFeeder(f.id, {
                                    enabled: e.currentTarget.checked,
                                  })
                                }
                              />
                              {f.canEnable === false && (
                                <span
                                  className="warn-tri"
                                  aria-label="Setup required"
                                  onMouseEnter={(e) => {
                                    const r =
                                      e.currentTarget.getBoundingClientRect();
                                    setTip({
                                      text: `Set up before enabling: ${(f.needs ?? []).join(", ")}`,
                                      x: r.left,
                                      y: r.top,
                                    });
                                  }}
                                  onMouseLeave={() => setTip(null)}
                                >
                                  <WarnIcon size={14} />
                                </span>
                              )}
                            </span>
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
                          <td className="mono left-cell">
                            {f.remaining !== undefined ? (
                              <span
                                className={f.remaining === 0 ? "left-empty" : ""}
                              >
                                {f.remaining}/{f.capacity}
                              </span>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                          <td className="row-actions">
                            {(f.remaining !== undefined ||
                              f.type === "PhotonFeeder") && (
                              <button
                                className="btn btn-sm"
                                onClick={() =>
                                  f.type === "PhotonFeeder"
                                    ? photonAction(f.id, "feed")
                                    : feederCountOp(f.id, "advance")
                                }
                                title={
                                  f.type === "PhotonFeeder"
                                    ? "Feed one part"
                                    : "Advance to the next part"
                                }
                              >
                                +1
                              </button>
                            )}
                            {f.type === "PhotonFeeder" && (
                              <button
                                className="btn btn-sm btn-icon"
                                onClick={() => photonAction(f.id, "find")}
                                title="Locate this feeder's slot on the bus"
                                aria-label="Find on the bus"
                              >
                                <SearchIcon size={15} />
                              </button>
                            )}
                            {f.remaining !== undefined && (
                              <button
                                className="btn btn-sm btn-icon"
                                onClick={() => feederCountOp(f.id, "reset")}
                                title="Reset to the first part"
                                aria-label="Reset count"
                              >
                                <UndoIcon size={15} />
                              </button>
                            )}
                            <button
                              className="btn btn-sm btn-icon"
                              onClick={() => openEditFeeder(f.id)}
                              title="Edit feeder"
                              aria-label="Edit feeder"
                            >
                              <GearIcon size={15} />
                            </button>
                            <button
                              className="btn btn-sm btn-icon btn-trash"
                              onClick={() => setDeleteTarget(f)}
                              title="Delete feeder"
                              aria-label="Delete feeder"
                            >
                              <TrashIcon size={15} />
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

          {tab === "parts" && (
            <section className="card">
              <div className="board-head">
                <h2>Parts</h2>
                <div className="import-row">
                  {partsDetail.some((p) => !p.hasHeight) && (
                    <button
                      className="btn btn-sm warn-btn"
                      onClick={openWizard}
                    >
                      <WarnIcon size={14} />{" "}
                      {partsDetail.filter((p) => !p.hasHeight).length} issues
                    </button>
                  )}
                  <button
                    className="btn btn-sm"
                    onClick={() => {
                      setEditPart({ ...NEW_PART });
                      setPartIsNew(true);
                    }}
                  >
                    + Add part
                  </button>
                </div>
              </div>
              {partsDetail.length === 0 ? (
                <div className="muted">
                  No parts yet. Import a board with “Create missing parts”, or
                  add one.
                </div>
              ) : (
                <div className="ptable-wrap">
                  <table className="ptable">
                    <thead>
                      <tr>
                        <th className="chk-col"></th>
                        <th>ID</th>
                        <th>Name</th>
                        <th>Package</th>
                        <th>Height mm</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {partsDetail.map((p) => (
                        <tr key={p.id}>
                          <td className="chk-col">
                            {!p.hasHeight && (
                              <span
                                className="warn-tri"
                                onClick={openWizard}
                                onMouseEnter={(e) => {
                                  const r =
                                    e.currentTarget.getBoundingClientRect();
                                  setTip({
                                    text: "No part height set — needed to pick/place. Click to resolve.",
                                    x: r.left,
                                    y: r.top,
                                  });
                                }}
                                onMouseLeave={() => setTip(null)}
                              >
                                <WarnIcon size={14} />
                              </span>
                            )}
                          </td>
                          <td className="mono">{p.id}</td>
                          <td className="muted">{p.name}</td>
                          <td className="muted">{p.package ?? "—"}</td>
                          <td
                            className={
                              p.fiducial
                                ? "muted"
                                : p.hasHeight
                                  ? "mono"
                                  : "mono left-empty"
                            }
                          >
                            {p.fiducial ? "n/a" : p.height}
                          </td>
                          <td className="row-actions">
                            <button
                              className="btn btn-sm btn-icon"
                              onClick={() => {
                                setEditPart(p);
                                setPartIsNew(false);
                              }}
                              title="Edit part"
                              aria-label="Edit part"
                            >
                              <GearIcon size={15} />
                            </button>
                            <button
                              className="btn btn-sm btn-icon btn-trash"
                              onClick={() => deletePart(p.id)}
                              title="Delete part"
                              aria-label="Delete part"
                            >
                              <TrashIcon size={15} />
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

          {tab === "packages" && (
            <section className="card">
              <div className="board-head">
                <h2>Packages</h2>
                <div className="import-row">
                  {packages.some((p) => !p.hasNozzle) && (
                    <button
                      className="btn btn-sm warn-btn"
                      onClick={openWizard}
                    >
                      <WarnIcon size={14} />{" "}
                      {packages.filter((p) => !p.hasNozzle).length} issues
                    </button>
                  )}
                  <button
                    className="btn btn-sm"
                    onClick={() => {
                      setEditPackage({ ...NEW_PACKAGE });
                      setPkgIsNew(true);
                    }}
                  >
                    + Add package
                  </button>
                </div>
              </div>
              {packages.length === 0 ? (
                <div className="muted">No packages yet.</div>
              ) : (
                <div className="ptable-wrap">
                  <table className="ptable">
                    <thead>
                      <tr>
                        <th className="chk-col"></th>
                        <th>ID</th>
                        <th>Description</th>
                        <th>Nozzle tips</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {packages.map((p) => (
                        <tr key={p.id}>
                          <td className="chk-col">
                            {!p.hasNozzle && (
                              <span
                                className="warn-tri"
                                onClick={openWizard}
                                onMouseEnter={(e) => {
                                  const r =
                                    e.currentTarget.getBoundingClientRect();
                                  setTip({
                                    text: "No approved nozzle tip — can't be picked. Click to resolve.",
                                    x: r.left,
                                    y: r.top,
                                  });
                                }}
                                onMouseLeave={() => setTip(null)}
                              >
                                <WarnIcon size={14} />
                              </span>
                            )}
                          </td>
                          <td className="mono">{p.id}</td>
                          <td className="muted">{p.description ?? "—"}</td>
                          <td className="muted">
                            {p.nozzleTips.length > 0
                              ? p.nozzleTips
                                  .map(
                                    (id) =>
                                      nozzleTips.find((nt) => nt.id === id)
                                        ?.name ?? id,
                                  )
                                  .join(", ")
                              : "—"}
                          </td>
                          <td className="row-actions">
                            <button
                              className="btn btn-sm btn-icon"
                              onClick={() => {
                                setEditPackage(p);
                                setPkgIsNew(false);
                              }}
                              title="Edit package"
                              aria-label="Edit package"
                            >
                              <GearIcon size={15} />
                            </button>
                            <button
                              className="btn btn-sm btn-icon btn-trash"
                              onClick={() => deletePackage(p.id)}
                              title="Delete package"
                              aria-label="Delete package"
                            >
                              <TrashIcon size={15} />
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
                    <NumberInput
                      min={0}
                      value={editFeeder.feedRetryCount ?? 3}
                      onChange={(v) => setEF({ feedRetryCount: v })}
                    />
                  </label>
                  <label className="loc-field">
                    <span>Pick retries</span>
                    <NumberInput
                      min={0}
                      value={editFeeder.pickRetryCount ?? 3}
                      onChange={(v) => setEF({ pickRetryCount: v })}
                    />
                  </label>
                  {editFeeder.photon && (
                    <label className="loc-field">
                      <span>Bus comm retries</span>
                      <NumberInput
                        min={0}
                        value={editFeeder.photon.commMaxRetry ?? 3}
                        onChange={(v) => setPhotonField({ commMaxRetry: v })}
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
                      <NumberInput
                        min={1}
                        value={editFeeder.tray.trayCountX}
                        onChange={(v) => setTrayField({ trayCountX: v })}
                      />
                    </label>
                    <label className="loc-field">
                      <span>Count Y</span>
                      <NumberInput
                        min={1}
                        value={editFeeder.tray.trayCountY}
                        onChange={(v) => setTrayField({ trayCountY: v })}
                      />
                    </label>
                    <label className="loc-field">
                      <span>X pitch (mm)</span>
                      <NumberInput
                        step={0.01}
                        value={editFeeder.tray.offsetX}
                        onChange={(v) => setTrayField({ offsetX: v })}
                      />
                    </label>
                    <label className="loc-field">
                      <span>Y pitch (mm)</span>
                      <NumberInput
                        step={0.01}
                        value={editFeeder.tray.offsetY}
                        onChange={(v) => setTrayField({ offsetY: v })}
                      />
                    </label>
                  </div>
                  <div className="field-row">
                    <label>Feed count</label>
                    <NumberInput
                      className="num-sm"
                      min={0}
                      value={editFeeder.tray.feedCount}
                      onChange={(v) => setTrayField({ feedCount: v })}
                    />
                    <span className="muted">
                      of {editFeeder.tray.trayCountX * editFeeder.tray.trayCountY}{" "}
                      parts
                    </span>
                  </div>
                </>
              ) : editFeeder.rotatedTray ? (
                <>
                  <TeachLoc
                    label="First part — row 1, column 1"
                    value={editFeeder.rotatedTray.firstLocation}
                    onChange={(loc) => setRotTrayField({ firstLocation: loc })}
                    onGo={(t) => moveToFeederLoc(t, "location")}
                    onCapture={(t) => captureFeederLoc(t, "location")}
                  />
                  <TeachLoc
                    label="Last part in row 1 (end of first row)"
                    value={editFeeder.rotatedTray.firstRowLastLocation}
                    onChange={(loc) =>
                      setRotTrayField({ firstRowLastLocation: loc })
                    }
                    onGo={(t) => moveToFeederLoc(t, "firstRowLast")}
                    onCapture={(t) => captureFeederLoc(t, "firstRowLast")}
                  />
                  <TeachLoc
                    label="Last part (opposite corner)"
                    value={editFeeder.rotatedTray.lastLocation}
                    onChange={(loc) => setRotTrayField({ lastLocation: loc })}
                    onGo={(t) => moveToFeederLoc(t, "lastComponent")}
                    onCapture={(t) => captureFeederLoc(t, "lastComponent")}
                  />
                  <div className="field-grid">
                    <label className="loc-field">
                      <span>Columns</span>
                      <NumberInput
                        min={1}
                        value={editFeeder.rotatedTray.trayCountCols}
                        onChange={(v) => setRotTrayField({ trayCountCols: v })}
                      />
                    </label>
                    <label className="loc-field">
                      <span>Rows</span>
                      <NumberInput
                        min={1}
                        value={editFeeder.rotatedTray.trayCountRows}
                        onChange={(v) => setRotTrayField({ trayCountRows: v })}
                      />
                    </label>
                    <label className="loc-field">
                      <span>Part rotation°</span>
                      <NumberInput
                        value={editFeeder.rotatedTray.componentRotation}
                        onChange={(v) =>
                          setRotTrayField({ componentRotation: v })
                        }
                      />
                    </label>
                    <label className="loc-field">
                      <span>Feed count</span>
                      <NumberInput
                        min={0}
                        value={editFeeder.rotatedTray.feedCount}
                        onChange={(v) => setRotTrayField({ feedCount: v })}
                      />
                    </label>
                  </div>
                  <div className="teach-block">
                    <div className="teach-head">
                      Computed grid — col pitch{" "}
                      {editFeeder.rotatedTray.colPitch} mm, row pitch{" "}
                      {editFeeder.rotatedTray.rowPitch} mm, tray{" "}
                      {editFeeder.rotatedTray.trayRotation}°
                    </div>
                    <div className="teach-actions">
                      <button
                        className="btn btn-sm"
                        onClick={() => postRotTray(true)}
                        title="Recompute pitch and tray angle from the three taught corners"
                      >
                        Recalculate grid
                      </button>
                    </div>
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
                      <NumberInput
                        step={0.1}
                        value={editFeeder.strip.partPitch}
                        onChange={(v) => setStripField({ partPitch: v })}
                      />
                    </label>
                    <label className="loc-field">
                      <span>Tape width (mm)</span>
                      <NumberInput
                        value={editFeeder.strip.tapeWidth}
                        onChange={(v) => setStripField({ tapeWidth: v })}
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
                      <NumberInput
                        min={0}
                        value={editFeeder.strip.feedCount}
                        onChange={(v) => setStripField({ feedCount: v })}
                      />
                    </label>
                    <label className="loc-field">
                      <span>Total parts (0=∞)</span>
                      <NumberInput
                        min={0}
                        value={editFeeder.strip.maxFeedCount}
                        onChange={(v) => setStripField({ maxFeedCount: v })}
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
              {editFeeder.rotatedTray && (
                <button
                  className="btn btn-primary"
                  onClick={() => postRotTray(false)}
                >
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

      {tip && (
        <div className="warn-tip-fixed" style={{ left: tip.x, top: tip.y }}>
          {tip.text}
        </div>
      )}

      {placementsOpen && (
        <div className="modal-backdrop" onClick={() => setPlacementsOpen(false)}>
          <div
            className="modal modal-wide"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h3>
                Placements —{" "}
                {boards.find((b) => b.file === activeBoard)?.name ?? "board"}
              </h3>
              <button
                className="icon-btn"
                onClick={() => setPlacementsOpen(false)}
                title="Close"
              >
                ✕
              </button>
            </div>
            <div className="placements-toolbar">
              <button className="btn btn-sm" onClick={addPlacement}>
                + Add
              </button>
              <input
                className="import-input plc-filter"
                value={plcFilter}
                onChange={(e) => setPlcFilter(e.currentTarget.value)}
                placeholder="filter by ref or part…"
              />
              <select
                className="type-select"
                value={plcTypeFilter}
                onChange={(e) => setPlcTypeFilter(e.currentTarget.value)}
              >
                <option value="all">All types</option>
                <option value="Placement">Placements</option>
                <option value="Fiducial">Fiducials</option>
              </select>
              <label className="run-toggle plc-size">
                Board mm
                <NumberInput
                  className="num-sm"
                  min={0}
                  value={boardDims.width}
                  onChange={(v) => setBoardSize(v, boardDims.height)}
                />
                ×
                <NumberInput
                  className="num-sm"
                  min={0}
                  value={boardDims.height}
                  onChange={(v) => setBoardSize(boardDims.width, v)}
                />
              </label>
              <span className="muted plc-count">
                {visiblePlacements.length}/{placements.length}
              </span>
            </div>
            {selPlacements.size > 0 && (
              <div className="batch-bar">
                <span className="batch-count">{selPlacements.size} selected</span>
                <select
                  className="type-select"
                  value=""
                  onChange={(e) => {
                    if (e.currentTarget.value)
                      batchSet({ type: e.currentTarget.value });
                    e.currentTarget.value = "";
                  }}
                >
                  <option value="">Type…</option>
                  <option value="Placement">Placement</option>
                  <option value="Fiducial">Fiducial</option>
                </select>
                <select
                  className="type-select"
                  value=""
                  onChange={(e) => {
                    if (e.currentTarget.value)
                      batchSet({ side: e.currentTarget.value });
                    e.currentTarget.value = "";
                  }}
                >
                  <option value="">Side…</option>
                  <option value="Top">Top</option>
                  <option value="Bottom">Bottom</option>
                </select>
                <button
                  className="btn btn-sm"
                  onClick={() => batchSet({ enabled: true })}
                >
                  Enable
                </button>
                <button
                  className="btn btn-sm"
                  onClick={() => batchSet({ enabled: false })}
                >
                  Disable
                </button>
                <select
                  className="type-select"
                  value=""
                  onChange={(e) => {
                    if (e.currentTarget.value)
                      batchSet({ errorHandling: e.currentTarget.value });
                    e.currentTarget.value = "";
                  }}
                >
                  <option value="">Error…</option>
                  {ERROR_HANDLING.map((eh) => (
                    <option key={eh} value={eh}>
                      {eh}
                    </option>
                  ))}
                </select>
                <button
                  className="btn btn-sm btn-trash"
                  onClick={deleteSelPlacements}
                >
                  <TrashIcon size={14} /> Delete
                </button>
              </div>
            )}
            <div className="modal-body plc-body">
              <table className="ptable">
                <thead>
                  <tr>
                    <th className="chk-col">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={(e) =>
                          setSelPlacements(
                            e.currentTarget.checked
                              ? new Set(visiblePlacements.map((p) => p.id))
                              : new Set(),
                          )
                        }
                      />
                    </th>
                    <th>On</th>
                    {[
                      ["id", "ID"],
                      ["part", "Part"],
                      ["side", "Side"],
                      ["type", "Type"],
                    ].map(([col, label]) => (
                      <th
                        key={col}
                        className="sort-th"
                        onClick={() => toggleSortCol(col)}
                      >
                        {label}
                        {sortCol === col ? (sortDir === 1 ? " ▲" : " ▼") : ""}
                      </th>
                    ))}
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {visiblePlacements.map((p) => (
                    <tr
                      key={p.id}
                      className={`${p.enabled ? "" : "row-off"} ${
                        selPlacements.has(p.id) ? "row-sel" : ""
                      }`}
                    >
                      <td className="chk-col">
                        <input
                          type="checkbox"
                          checked={selPlacements.has(p.id)}
                          onChange={() => toggleSel(p.id)}
                        />
                      </td>
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
                      <td>
                        <select
                          className="type-select"
                          value={p.part ?? ""}
                          onChange={(e) =>
                            updatePlacement(p.id, {
                              partId: e.currentTarget.value,
                            })
                          }
                        >
                          <option value="">—</option>
                          {parts.map((pt) => (
                            <option key={pt} value={pt}>
                              {pt}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          className="type-select"
                          value={p.side ?? "Top"}
                          onChange={(e) =>
                            updatePlacement(p.id, {
                              side: e.currentTarget.value,
                            })
                          }
                        >
                          <option value="Top">Top</option>
                          <option value="Bottom">Bottom</option>
                        </select>
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
                      <td>
                        <button
                          className="btn btn-sm btn-icon"
                          onClick={() => setEditPlacement(p)}
                          title="Edit placement"
                          aria-label="Edit placement"
                        >
                          <GearIcon size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {placements.length > 0 && (
                <div className="plc-map">
                  <BoardMap
                    placements={placements}
                    width={boardDims.width}
                    height={boardDims.height}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {editPart && (
        <div className="modal-backdrop" onClick={() => setEditPart(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>
                {partIsNew ? "New part" : "Edit part"}
                {!partIsNew && <span className="mono"> — {editPart.id}</span>}
              </h3>
              <button
                className="icon-btn"
                onClick={() => setEditPart(null)}
                title="Close"
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              {partIsNew && (
                <div className="field-row">
                  <label>ID</label>
                  <input
                    className="import-input"
                    autoFocus
                    value={editPart.id}
                    onChange={(e) =>
                      setEditPart({ ...editPart, id: e.currentTarget.value })
                    }
                    placeholder="e.g. R-0402-10K"
                  />
                </div>
              )}
              <div className="field-row">
                <label>Name</label>
                <input
                  className="import-input"
                  value={editPart.name}
                  onChange={(e) =>
                    setEditPart({ ...editPart, name: e.currentTarget.value })
                  }
                />
              </div>
              <div className="field-grid">
                <label className="loc-field">
                  <span>Height mm</span>
                  <NumberInput
                    step={0.01}
                    min={0}
                    value={editPart.height}
                    onChange={(v) => setEditPart({ ...editPart, height: v })}
                  />
                </label>
                <label className="loc-field">
                  <span>Speed</span>
                  <NumberInput
                    step={0.05}
                    min={0}
                    value={editPart.speed}
                    onChange={(v) => setEditPart({ ...editPart, speed: v })}
                  />
                </label>
                <label className="loc-field">
                  <span>Package</span>
                  <select
                    className="type-select"
                    value={editPart.package ?? ""}
                    onChange={(e) =>
                      setEditPart({
                        ...editPart,
                        package: e.currentTarget.value || null,
                      })
                    }
                  >
                    <option value="">—</option>
                    {packages.map((pk) => (
                      <option key={pk.id} value={pk.id}>
                        {pk.id}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {editPart.height === 0 && (
                <div className="teach-head warn-text">
                  <WarnIcon size={13} /> Height is 0 — set it so this part can be
                  picked and placed.
                </div>
              )}
              {!partIsNew && (
                <div className="teach-block">
                  <div className="teach-head">
                    Merge into another part — reassigns placements &amp; feeders,
                    deletes this one, and remembers the rename for future imports.
                  </div>
                  <div className="teach-row">
                    <select
                      className="type-select"
                      value={mergeTarget}
                      onChange={(e) => setMergeTarget(e.currentTarget.value)}
                    >
                      <option value="">merge into…</option>
                      {partsDetail
                        .filter((x) => x.id !== editPart.id)
                        .map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.id}
                          </option>
                        ))}
                    </select>
                    <button
                      className="btn btn-sm btn-danger"
                      disabled={!mergeTarget}
                      onClick={doMerge}
                    >
                      Merge
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setEditPart(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={!editPart.id.trim()}
                onClick={savePart}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {editPackage && (
        <div className="modal-backdrop" onClick={() => setEditPackage(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>
                {pkgIsNew ? "New package" : "Edit package"}
                {!pkgIsNew && <span className="mono"> — {editPackage.id}</span>}
              </h3>
              <button
                className="icon-btn"
                onClick={() => setEditPackage(null)}
                title="Close"
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              {pkgIsNew && (
                <div className="field-row">
                  <label>ID</label>
                  <input
                    className="import-input"
                    autoFocus
                    value={editPackage.id}
                    onChange={(e) =>
                      setEditPackage({
                        ...editPackage,
                        id: e.currentTarget.value,
                      })
                    }
                    placeholder="e.g. 0402"
                  />
                </div>
              )}
              <div className="field-row">
                <label>Description</label>
                <input
                  className="import-input"
                  value={editPackage.description ?? ""}
                  onChange={(e) =>
                    setEditPackage({
                      ...editPackage,
                      description: e.currentTarget.value,
                    })
                  }
                />
              </div>
              <div className="teach-block">
                <div className="teach-head">
                  Approved nozzle tips (at least one is needed to pick this
                  package)
                </div>
                {nozzleTips.length === 0 ? (
                  <div className="muted">
                    No nozzle tips defined on the machine.
                  </div>
                ) : (
                  <div className="nt-list">
                    {nozzleTips.map((nt) => (
                      <label key={nt.id} className="run-toggle">
                        <input
                          type="checkbox"
                          checked={editPackage.nozzleTips.includes(nt.id)}
                          onChange={(e) =>
                            setEditPackage({
                              ...editPackage,
                              nozzleTips: e.currentTarget.checked
                                ? [...editPackage.nozzleTips, nt.id]
                                : editPackage.nozzleTips.filter(
                                    (x) => x !== nt.id,
                                  ),
                            })
                          }
                        />
                        {nt.name}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setEditPackage(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={!editPackage.id.trim()}
                onClick={savePackage}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {wizardOpen && (
        <div className="modal-backdrop" onClick={() => setWizardOpen(false)}>
          <div
            className="modal modal-wide"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h3>Resolve issues</h3>
              <button
                className="icon-btn"
                onClick={() => setWizardOpen(false)}
                title="Close"
              >
                ✕
              </button>
            </div>
            <div className="modal-body plc-body">
              {partsDetail.filter((p) => !p.hasHeight).length === 0 &&
              packages.filter((p) => !p.hasNozzle).length === 0 ? (
                <div className="muted">
                  All good — every part has a height and every package has an
                  approved nozzle tip.
                </div>
              ) : (
                <>
                  {partsDetail.filter((p) => !p.hasHeight).length > 0 && (
                    <>
                      <div className="teach-head">
                        Parts missing a height (needed to pick/place)
                      </div>
                      <table className="ptable wizard-table">
                        <tbody>
                          {partsDetail
                            .filter((p) => !p.hasHeight)
                            .map((p) => (
                              <tr key={p.id}>
                                <td className="mono">{p.id}</td>
                                <td className="muted">{p.package ?? "—"}</td>
                                <td className="wizard-fix">
                                  <span className="muted">Height mm</span>
                                  <NumberInput
                                    step={0.01}
                                    min={0}
                                    value={p.height}
                                    onChange={(v) =>
                                      updatePart(p.id, { height: v })
                                    }
                                  />
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </>
                  )}
                  {packages.filter((p) => !p.hasNozzle).length > 0 && (
                    <>
                      <div className="teach-head">
                        Packages with no approved nozzle tip
                      </div>
                      <table className="ptable wizard-table">
                        <tbody>
                          {packages
                            .filter((p) => !p.hasNozzle)
                            .map((p) => (
                              <tr key={p.id}>
                                <td className="mono">{p.id}</td>
                                <td className="wizard-fix">
                                  {nozzleTips.length === 0 ? (
                                    <span className="muted">
                                      no nozzle tips on machine
                                    </span>
                                  ) : (
                                    nozzleTips.map((nt) => (
                                      <label key={nt.id} className="run-toggle">
                                        <input
                                          type="checkbox"
                                          checked={p.nozzleTips.includes(nt.id)}
                                          onChange={(e) =>
                                            updatePackage(p.id, {
                                              nozzleTips: e.currentTarget.checked
                                                ? [...p.nozzleTips, nt.id]
                                                : p.nozzleTips.filter(
                                                    (x) => x !== nt.id,
                                                  ),
                                            })
                                          }
                                        />
                                        {nt.name}
                                      </label>
                                    ))
                                  )}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </>
                  )}
                </>
              )}
              {aliases.length > 0 && (
                <>
                  <div className="teach-head">
                    Part rename rules (applied — with confirmation — on future
                    imports)
                  </div>
                  <table className="ptable wizard-table">
                    <tbody>
                      {aliases.map((a) => (
                        <tr key={a.from}>
                          <td className="mono">{a.from}</td>
                          <td>→</td>
                          <td className="mono">{a.to}</td>
                          <td>
                            <button
                              className="btn btn-sm btn-icon btn-trash"
                              onClick={() => removeAlias(a.from)}
                              title="Remove rule"
                              aria-label="Remove rule"
                            >
                              <TrashIcon size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
            <div className="modal-foot">
              <button
                className="btn btn-primary"
                onClick={() => setWizardOpen(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {machineCard === "connection" && (
        <div className="modal-backdrop" onClick={() => setMachineCard(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Connection</h3>
              <button
                className="icon-btn"
                onClick={() => setMachineCard(null)}
                title="Close"
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="field-row">
                <label>Status</label>
                <span className={`badge ${enabled ? "on" : ""}`}>
                  {enabled ? "Connected" : "Disconnected"}
                </span>
                <button
                  className={`btn btn-sm ${enabled ? "btn-danger" : "btn-primary"}`}
                  onClick={() => setMachineEnabled(!enabled)}
                >
                  {enabled ? "Disconnect" : "Connect"}
                </button>
                <button
                  className="btn btn-sm"
                  onClick={loadDrivers}
                  title="Rescan serial ports"
                >
                  Rescan
                </button>
              </div>
              {drivers.map((d) => (
                <div key={d.id} className="teach-block">
                  <div className="teach-head">
                    {d.name} — {d.type}
                  </div>
                  <div className="field-grid">
                    <label className="loc-field">
                      <span>Connection</span>
                      <select
                        className="type-select"
                        value={d.commType ?? "serial"}
                        onChange={(e) =>
                          updateDriver(d.id, { commType: e.currentTarget.value })
                        }
                      >
                        <option value="serial">Serial</option>
                        <option value="tcp">TCP</option>
                      </select>
                    </label>
                    {d.commType === "tcp" ? (
                      <>
                        <label className="loc-field">
                          <span>Host</span>
                          <input
                            className="import-input"
                            value={d.ip ?? ""}
                            onChange={(e) =>
                              updateDriver(d.id, { ip: e.currentTarget.value })
                            }
                          />
                        </label>
                        <label className="loc-field">
                          <span>TCP port</span>
                          <NumberInput
                            min={1}
                            value={d.tcpPort ?? 23}
                            onChange={(v) => updateDriver(d.id, { tcpPort: v })}
                          />
                        </label>
                      </>
                    ) : (
                      <>
                        <label className="loc-field">
                          <span>Serial port</span>
                          <select
                            className="type-select"
                            value={d.port ?? ""}
                            onChange={(e) =>
                              updateDriver(d.id, { port: e.currentTarget.value })
                            }
                          >
                            <option value="">— none —</option>
                            {driverPorts.length === 0 && d.port && (
                              <option value={d.port}>{d.port}</option>
                            )}
                            {driverPorts.map((p) => (
                              <option key={p} value={p}>
                                {p}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="loc-field">
                          <span>Baud</span>
                          <select
                            className="type-select"
                            value={d.baud ?? 115200}
                            onChange={(e) =>
                              updateDriver(d.id, {
                                baud: parseInt(e.currentTarget.value, 10),
                              })
                            }
                          >
                            {BAUDS.map((b) => (
                              <option key={b} value={b}>
                                {b}
                              </option>
                            ))}
                          </select>
                        </label>
                      </>
                    )}
                  </div>
                </div>
              ))}
              <p className="confirm-text muted">
                Connecting needs the controller on this computer's USB. Changes
                save with the machine config.
              </p>
            </div>
            <div className="modal-foot">
              <button
                className="btn btn-primary"
                onClick={() => setMachineCard(null)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {machineCard === "actuators" && (
        <div className="modal-backdrop" onClick={() => setMachineCard(null)}>
          <div
            className="modal modal-wide"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h3>Actuators &amp; I/O</h3>
              <button
                className="icon-btn"
                onClick={() => setMachineCard(null)}
                title="Close"
              >
                ✕
              </button>
            </div>
            <div className="modal-body plc-body">
              <table className="ptable">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Wired to</th>
                    <th>Mount</th>
                    <th>Type</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {actuators.map((a) => (
                    <tr key={a.id}>
                      <td className="mono">{a.name}</td>
                      <td className={a.role ? "" : "muted"}>{a.role ?? "—"}</td>
                      <td className="muted">{a.mount}</td>
                      <td className="muted">{a.type}</td>
                      <td>
                        {a.type === "Boolean" ? (
                          <button
                            className={`io-btn ${a.state ? "io-on" : ""}`}
                            disabled={!enabled}
                            onClick={() => actuate(a.id, !a.state)}
                          >
                            <span className="io-state">
                              {a.state ? "ON" : "OFF"}
                            </span>
                          </button>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!enabled && (
                <p className="confirm-text muted">
                  Connect the machine to toggle actuators.
                </p>
              )}
            </div>
            <div className="modal-foot">
              <button
                className="btn btn-primary"
                onClick={() => setMachineCard(null)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {machineCard === "cameras" && (
        <div className="modal-backdrop" onClick={() => setMachineCard(null)}>
          <div
            className="modal modal-wide"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h3>Cameras</h3>
              <button
                className="icon-btn"
                onClick={() => setMachineCard(null)}
                title="Close"
              >
                ✕
              </button>
            </div>
            <div className="modal-body plc-body">
              {cameras.map((c) => (
                <div key={c.id} className="teach-block">
                  <div className="teach-head">
                    <span className="mono">{c.name}</span> ·{" "}
                    {c.looking === "Up" ? "Bottom (up)" : "Top (down)"} ·{" "}
                    {c.mount} · {c.width}×{c.height} · light: {c.light ?? "—"}
                  </div>
                  <div className="field-grid">
                    <label className="loc-field">
                      <span>mm/px X</span>
                      <NumberInput
                        step={0.001}
                        min={0}
                        value={c.uppX}
                        onChange={(v) => updateCamera(c.id, { uppX: v })}
                      />
                    </label>
                    <label className="loc-field">
                      <span>mm/px Y</span>
                      <NumberInput
                        step={0.001}
                        min={0}
                        value={c.uppY}
                        onChange={(v) => updateCamera(c.id, { uppY: v })}
                      />
                    </label>
                    <label className="loc-field">
                      <span>Rotation°</span>
                      <NumberInput
                        value={c.rotation}
                        onChange={(v) => updateCamera(c.id, { rotation: v })}
                      />
                    </label>
                    <label className="loc-field">
                      <span>Looking</span>
                      <select
                        className="type-select"
                        value={c.looking}
                        onChange={(e) =>
                          updateCamera(c.id, { looking: e.currentTarget.value })
                        }
                      >
                        <option value="Down">Down (top)</option>
                        <option value="Up">Up (bottom)</option>
                      </select>
                    </label>
                  </div>
                </div>
              ))}
            </div>
            <div className="modal-foot">
              <button
                className="btn btn-primary"
                onClick={() => setMachineCard(null)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {machineCard === "nozzles" && (
        <div className="modal-backdrop" onClick={() => setMachineCard(null)}>
          <div
            className="modal modal-wide"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h3>Nozzles &amp; Tips</h3>
              <button
                className="icon-btn"
                onClick={() => setMachineCard(null)}
                title="Close"
              >
                ✕
              </button>
            </div>
            <div className="modal-body plc-body">
              <div className="sub-head">Nozzles</div>
              {nozzles.length === 0 && (
                <div className="muted">no nozzles on this machine</div>
              )}
              {nozzles.map((n) => (
                <div key={n.id} className="teach-block">
                  <div className="teach-head">
                    <span className="mono">{n.name}</span> · {n.mount} · tip:{" "}
                    {n.tip ?? "none loaded"}
                  </div>
                  <div className="field-grid">
                    <label className="loc-field">
                      <span>Vacuum actuator</span>
                      <select
                        className="type-select"
                        value={n.vacuum}
                        onChange={(e) =>
                          updateNozzle(n.id, { vacuum: e.currentTarget.value })
                        }
                      >
                        <option value="">— none —</option>
                        {nozzleActs.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="loc-field">
                      <span>Blow-off actuator</span>
                      <select
                        className="type-select"
                        value={n.blowOff}
                        onChange={(e) =>
                          updateNozzle(n.id, { blowOff: e.currentTarget.value })
                        }
                      >
                        <option value="">— none —</option>
                        {nozzleActs.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="loc-field">
                      <span>Vacuum sense actuator</span>
                      <select
                        className="type-select"
                        value={n.vacuumSense}
                        onChange={(e) =>
                          updateNozzle(n.id, {
                            vacuumSense: e.currentTarget.value,
                          })
                        }
                      >
                        <option value="">— none —</option>
                        {nozzleActs.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
              ))}
              <div className="sub-head" style={{ marginTop: 14 }}>
                Nozzle tips — part detection
              </div>
              {nzTips.length === 0 && (
                <div className="muted">no nozzle tips defined</div>
              )}
              {nzTips.map((t) => {
                const onMethod = t.methodPartOn ?? "None";
                const offMethod = t.methodPartOff ?? "None";
                return (
                  <div key={t.id} className="teach-block">
                    <div className="field-grid nt-row">
                      <label className="loc-field" style={{ flex: 1 }}>
                        <span>Tip name</span>
                        <input
                          className="import-input"
                          defaultValue={t.name}
                          onBlur={(e) => {
                            const v = e.currentTarget.value.trim();
                            if (v && v !== t.name) updateTip(t.id, { name: v });
                          }}
                        />
                      </label>
                      <span className="muted mono nt-id">{t.id}</span>
                    </div>

                    <div className="detect-grp">
                      <div className="detect-title">
                        Part-ON check (after pick — did it grab the part?)
                      </div>
                      <div className="field-grid">
                        <label className="loc-field">
                          <span>Method</span>
                          <select
                            className="type-select"
                            value={onMethod}
                            onChange={(e) =>
                              updateTip(t.id, {
                                methodPartOn: e.currentTarget.value,
                              })
                            }
                          >
                            {VAC_METHODS.map((m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                          </select>
                        </label>
                        {onMethod !== "None" && (
                          <>
                            <label className="loc-field">
                              <span>Level low (kPa)</span>
                              <NumberInput
                                step={0.1}
                                value={t.vacuumLevelPartOnLow ?? 0}
                                onChange={(v) =>
                                  updateTip(t.id, { vacuumLevelPartOnLow: v })
                                }
                              />
                            </label>
                            <label className="loc-field">
                              <span>Level high (kPa)</span>
                              <NumberInput
                                step={0.1}
                                value={t.vacuumLevelPartOnHigh ?? 0}
                                onChange={(v) =>
                                  updateTip(t.id, { vacuumLevelPartOnHigh: v })
                                }
                              />
                            </label>
                          </>
                        )}
                        {onMethod === "Difference" && (
                          <>
                            <label className="loc-field">
                              <span>Diff low (kPa)</span>
                              <NumberInput
                                step={0.1}
                                value={t.vacuumDifferencePartOnLow ?? 0}
                                onChange={(v) =>
                                  updateTip(t.id, {
                                    vacuumDifferencePartOnLow: v,
                                  })
                                }
                              />
                            </label>
                            <label className="loc-field">
                              <span>Diff high (kPa)</span>
                              <NumberInput
                                step={0.1}
                                value={t.vacuumDifferencePartOnHigh ?? 0}
                                onChange={(v) =>
                                  updateTip(t.id, {
                                    vacuumDifferencePartOnHigh: v,
                                  })
                                }
                              />
                            </label>
                          </>
                        )}
                      </div>
                      {onMethod !== "None" && (
                        <div className="detect-checks">
                          <label className="check-row">
                            <input
                              type="checkbox"
                              checked={t.partOnCheckAfterPick ?? false}
                              onChange={(e) =>
                                updateTip(t.id, {
                                  partOnCheckAfterPick: e.currentTarget.checked,
                                })
                              }
                            />
                            <span>after pick</span>
                          </label>
                          <label className="check-row">
                            <input
                              type="checkbox"
                              checked={t.partOnCheckAlign ?? false}
                              onChange={(e) =>
                                updateTip(t.id, {
                                  partOnCheckAlign: e.currentTarget.checked,
                                })
                              }
                            />
                            <span>at align</span>
                          </label>
                          <label className="check-row">
                            <input
                              type="checkbox"
                              checked={t.partOnCheckBeforePlace ?? false}
                              onChange={(e) =>
                                updateTip(t.id, {
                                  partOnCheckBeforePlace:
                                    e.currentTarget.checked,
                                })
                              }
                            />
                            <span>before place</span>
                          </label>
                          <label className="check-row">
                            <input
                              type="checkbox"
                              checked={t.establishPartOnLevel ?? false}
                              onChange={(e) =>
                                updateTip(t.id, {
                                  establishPartOnLevel: e.currentTarget.checked,
                                })
                              }
                            />
                            <span>auto-baseline level</span>
                          </label>
                        </div>
                      )}
                    </div>

                    <div className="detect-grp">
                      <div className="detect-title">
                        Part-OFF check (after place — did it let go?)
                      </div>
                      <div className="field-grid">
                        <label className="loc-field">
                          <span>Method</span>
                          <select
                            className="type-select"
                            value={offMethod}
                            onChange={(e) =>
                              updateTip(t.id, {
                                methodPartOff: e.currentTarget.value,
                              })
                            }
                          >
                            {VAC_METHODS.map((m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                          </select>
                        </label>
                        {offMethod !== "None" && (
                          <>
                            <label className="loc-field">
                              <span>Level low (kPa)</span>
                              <NumberInput
                                step={0.1}
                                value={t.vacuumLevelPartOffLow ?? 0}
                                onChange={(v) =>
                                  updateTip(t.id, { vacuumLevelPartOffLow: v })
                                }
                              />
                            </label>
                            <label className="loc-field">
                              <span>Level high (kPa)</span>
                              <NumberInput
                                step={0.1}
                                value={t.vacuumLevelPartOffHigh ?? 0}
                                onChange={(v) =>
                                  updateTip(t.id, { vacuumLevelPartOffHigh: v })
                                }
                              />
                            </label>
                          </>
                        )}
                        {offMethod === "Difference" && (
                          <>
                            <label className="loc-field">
                              <span>Diff low (kPa)</span>
                              <NumberInput
                                step={0.1}
                                value={t.vacuumDifferencePartOffLow ?? 0}
                                onChange={(v) =>
                                  updateTip(t.id, {
                                    vacuumDifferencePartOffLow: v,
                                  })
                                }
                              />
                            </label>
                            <label className="loc-field">
                              <span>Diff high (kPa)</span>
                              <NumberInput
                                step={0.1}
                                value={t.vacuumDifferencePartOffHigh ?? 0}
                                onChange={(v) =>
                                  updateTip(t.id, {
                                    vacuumDifferencePartOffHigh: v,
                                  })
                                }
                              />
                            </label>
                          </>
                        )}
                      </div>
                      {offMethod !== "None" && (
                        <div className="detect-checks">
                          <label className="check-row">
                            <input
                              type="checkbox"
                              checked={t.partOffCheckAfterPlace ?? false}
                              onChange={(e) =>
                                updateTip(t.id, {
                                  partOffCheckAfterPlace:
                                    e.currentTarget.checked,
                                })
                              }
                            />
                            <span>after place</span>
                          </label>
                          <label className="check-row">
                            <input
                              type="checkbox"
                              checked={t.partOffCheckBeforePick ?? false}
                              onChange={(e) =>
                                updateTip(t.id, {
                                  partOffCheckBeforePick:
                                    e.currentTarget.checked,
                                })
                              }
                            />
                            <span>before pick</span>
                          </label>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="modal-foot">
              <button
                className="btn btn-primary"
                onClick={() => setMachineCard(null)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {machineCard === "motion" && (
        <div className="modal-backdrop" onClick={() => setMachineCard(null)}>
          <div
            className="modal modal-wide"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h3>Motion &amp; Axes</h3>
              <button
                className="icon-btn"
                onClick={() => setMachineCard(null)}
                title="Close"
              >
                ✕
              </button>
            </div>
            <div className="modal-body plc-body">
              {axes.length === 0 && (
                <div className="muted">no controller axes defined</div>
              )}
              {axes.map((a) => (
                <div key={a.id} className="teach-block">
                  <div className="teach-head">
                    <span className="mono">{a.name}</span> · {a.type ?? "?"} ·
                    letter {a.letter ?? "—"} · {a.driver ?? "no driver"}
                  </div>
                  <div className="field-grid">
                    <label className="loc-field">
                      <span>Feedrate mm/s</span>
                      <NumberInput
                        step={1}
                        min={0}
                        value={a.feedrate}
                        onChange={(v) => updateAxis(a.id, { feedrate: v })}
                      />
                    </label>
                    <label className="loc-field">
                      <span>Accel mm/s²</span>
                      <NumberInput
                        step={1}
                        min={0}
                        value={a.accel}
                        onChange={(v) => updateAxis(a.id, { accel: v })}
                      />
                    </label>
                    <label className="loc-field">
                      <span>Jerk mm/s³</span>
                      <NumberInput
                        step={1}
                        min={0}
                        value={a.jerk}
                        onChange={(v) => updateAxis(a.id, { jerk: v })}
                      />
                    </label>
                  </div>
                  <div className="field-grid">
                    <label className="loc-field">
                      <span>
                        <input
                          type="checkbox"
                          checked={a.limitLowOn}
                          onChange={(e) =>
                            updateAxis(a.id, {
                              limitLowOn: e.currentTarget.checked,
                            })
                          }
                        />{" "}
                        Soft limit low
                      </span>
                      <NumberInput
                        step={1}
                        value={a.limitLow}
                        disabled={!a.limitLowOn}
                        onChange={(v) => updateAxis(a.id, { limitLow: v })}
                      />
                    </label>
                    <label className="loc-field">
                      <span>
                        <input
                          type="checkbox"
                          checked={a.limitHighOn}
                          onChange={(e) =>
                            updateAxis(a.id, {
                              limitHighOn: e.currentTarget.checked,
                            })
                          }
                        />{" "}
                        Soft limit high
                      </span>
                      <NumberInput
                        step={1}
                        value={a.limitHigh}
                        disabled={!a.limitHighOn}
                        onChange={(v) => updateAxis(a.id, { limitHigh: v })}
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
            <div className="modal-foot">
              <button
                className="btn btn-primary"
                onClick={() => setMachineCard(null)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {machineCard === "general" && (
        <div className="modal-backdrop" onClick={() => setMachineCard(null)}>
          <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>General</h3>
              <button
                className="icon-btn"
                onClick={() => setMachineCard(null)}
                title="Close"
              >
                ✕
              </button>
            </div>
            <div className="modal-body plc-body">
              {!general && <div className="muted">loading…</div>}
              {general && (
                <>
                  <div className="sub-head">Startup &amp; homing</div>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={general.homeAfterEnabled}
                      onChange={(e) =>
                        updateGeneral({
                          homeAfterEnabled: e.currentTarget.checked,
                        })
                      }
                    />
                    <span>Home automatically when the machine is enabled</span>
                  </label>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={general.parkAfterHomed}
                      onChange={(e) =>
                        updateGeneral({ parkAfterHomed: e.currentTarget.checked })
                      }
                    />
                    <span>Park the head after homing</span>
                  </label>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={general.safeZPark}
                      onChange={(e) =>
                        updateGeneral({ safeZPark: e.currentTarget.checked })
                      }
                    />
                    <span>Park at safe Z (raise nozzles before parking)</span>
                  </label>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={general.autoToolSelect}
                      onChange={(e) =>
                        updateGeneral({ autoToolSelect: e.currentTarget.checked })
                      }
                    />
                    <span>Auto-select the tool when clicking in the UI</span>
                  </label>

                  <div className="sub-head" style={{ marginTop: 14 }}>
                    Discard location (rejected parts, mm)
                  </div>
                  <div className="field-grid">
                    <label className="loc-field">
                      <span>X</span>
                      <NumberInput
                        step={1}
                        value={general.discard.x}
                        onChange={(v) => updateGeneral({ discardX: v })}
                      />
                    </label>
                    <label className="loc-field">
                      <span>Y</span>
                      <NumberInput
                        step={1}
                        value={general.discard.y}
                        onChange={(v) => updateGeneral({ discardY: v })}
                      />
                    </label>
                    <label className="loc-field">
                      <span>Z</span>
                      <NumberInput
                        step={1}
                        value={general.discard.z}
                        onChange={(v) => updateGeneral({ discardZ: v })}
                      />
                    </label>
                  </div>

                  {general.park && (
                    <>
                      <div className="sub-head" style={{ marginTop: 14 }}>
                        Park location{" "}
                        {general.headName ? `(${general.headName}, mm)` : "(mm)"}
                      </div>
                      <div className="field-grid">
                        <label className="loc-field">
                          <span>X</span>
                          <NumberInput
                            step={1}
                            value={general.park.x}
                            onChange={(v) => updateGeneral({ parkX: v })}
                          />
                        </label>
                        <label className="loc-field">
                          <span>Y</span>
                          <NumberInput
                            step={1}
                            value={general.park.y}
                            onChange={(v) => updateGeneral({ parkY: v })}
                          />
                        </label>
                        <label className="loc-field">
                          <span>Z</span>
                          <NumberInput
                            step={1}
                            value={general.park.z}
                            onChange={(v) => updateGeneral({ parkZ: v })}
                          />
                        </label>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
            <div className="modal-foot">
              <button
                className="btn btn-primary"
                onClick={() => setMachineCard(null)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {newBoardOpen && (
        <div className="modal-backdrop" onClick={() => setNewBoardOpen(false)}>
          <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>New board</h3>
              <button
                className="icon-btn"
                onClick={() => setNewBoardOpen(false)}
                title="Close"
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="field-row">
                <label>Name</label>
                <input
                  className="import-input"
                  autoFocus
                  value={newBoardName}
                  onChange={(e) => setNewBoardName(e.currentTarget.value)}
                  onKeyDown={(e) => e.key === "Enter" && createNewBoard()}
                  placeholder="board name"
                />
              </div>
              <p className="confirm-text muted">
                Creates an empty <span className="mono">.board.xml</span> in{" "}
                {savePath || "config/boards"}. Add placements from the
                placements window.
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setNewBoardOpen(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={!newBoardName.trim()}
                onClick={createNewBoard}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingRemaps.length > 0 && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setPendingRemaps([]);
            setRemapBoard(null);
          }}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Known part renames</h3>
            </div>
            <div className="modal-body">
              <p className="confirm-text">
                This board uses parts you previously merged. Remap them to the
                established parts?
              </p>
              <table className="ptable wizard-table">
                <tbody>
                  {pendingRemaps.map((r) => (
                    <tr key={r.from}>
                      <td className="chk-col">
                        <input
                          type="checkbox"
                          checked={remapSel.has(r.from)}
                          onChange={() =>
                            setRemapSel((prev) => {
                              const n = new Set(prev);
                              if (n.has(r.from)) n.delete(r.from);
                              else n.add(r.from);
                              return n;
                            })
                          }
                        />
                      </td>
                      <td className="mono">{r.from}</td>
                      <td>→</td>
                      <td className="mono">{r.to}</td>
                      <td className="muted">{r.count}×</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="modal-foot">
              <button
                className="btn"
                onClick={() => {
                  setPendingRemaps([]);
                  setRemapBoard(null);
                }}
              >
                Skip
              </button>
              <button className="btn btn-primary" onClick={applyRemaps}>
                Apply selected
              </button>
            </div>
          </div>
        </div>
      )}

      {importConflict && (
        <div
          className="modal-backdrop"
          onClick={() => setImportConflict(null)}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Board already exists</h3>
              <button
                className="icon-btn"
                onClick={() => setImportConflict(null)}
                title="Close"
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p className="confirm-text">
                A board named{" "}
                <span className="mono">{importConflict.name}</span> is already in
                the library. Rename this import, replace the existing board, or
                cancel.
              </p>
              <div className="field-row">
                <label>New name</label>
                <input
                  className="import-input"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.currentTarget.value)}
                />
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setImportConflict(null)}>
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={() => {
                  setImportConflict(null);
                  runImport({ replace: true });
                }}
              >
                Replace
              </button>
              <button
                className="btn btn-primary"
                disabled={!renameValue.trim()}
                onClick={() => {
                  setImportConflict(null);
                  runImport({ boardName: renameValue.trim() });
                }}
              >
                Rename &amp; import
              </button>
            </div>
          </div>
        </div>
      )}

      {removeBoardTarget && (
        <div
          className="modal-backdrop"
          onClick={() => setRemoveBoardTarget(null)}
        >
          <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Remove board?</h3>
              <button
                className="icon-btn"
                onClick={() => setRemoveBoardTarget(null)}
                title="Close"
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p className="confirm-text">
                Remove <span className="mono">{removeBoardTarget.name}</span>{" "}
                from the library? The <span className="mono">.board.xml</span>{" "}
                file stays on disk — you can re-import it later.
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setRemoveBoardTarget(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={confirmRemoveBoard}>
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {newJobOpen && (
        <div className="modal-backdrop" onClick={() => setNewJobOpen(false)}>
          <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>New job</h3>
              <button
                className="icon-btn"
                onClick={() => setNewJobOpen(false)}
                title="Close"
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="field-row">
                <label>Name</label>
                <input
                  className="import-input"
                  autoFocus
                  value={newJobName}
                  onChange={(e) => setNewJobName(e.currentTarget.value)}
                  onKeyDown={(e) => e.key === "Enter" && createJob()}
                  placeholder="e.g. Panel1"
                />
              </div>
              <p className="muted">
                Saved to <span className="mono">config/jobs/</span> as a{" "}
                <span className="mono">.job.xml</span> file.
              </p>
              {jobErr && <div className="banner banner-warn">{jobErr}</div>}
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setNewJobOpen(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={createJob}
                disabled={!newJobName.trim()}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {renameJobTarget && (
        <div
          className="modal-backdrop"
          onClick={() => setRenameJobTarget(null)}
        >
          <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Rename job</h3>
              <button
                className="icon-btn"
                onClick={() => setRenameJobTarget(null)}
                title="Close"
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="field-row">
                <label>Name</label>
                <input
                  className="import-input"
                  autoFocus
                  value={renameJobName}
                  onChange={(e) => setRenameJobName(e.currentTarget.value)}
                  onKeyDown={(e) => e.key === "Enter" && doRenameJob()}
                />
              </div>
              {jobErr && <div className="banner banner-warn">{jobErr}</div>}
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setRenameJobTarget(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={doRenameJob}
                disabled={
                  !renameJobName.trim() ||
                  renameJobName.trim() === renameJobTarget.name
                }
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}

      {removeJobTarget && (
        <div className="modal-backdrop" onClick={() => setRemoveJobTarget(null)}>
          <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Delete job?</h3>
              <button
                className="icon-btn"
                onClick={() => setRemoveJobTarget(null)}
                title="Close"
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p className="confirm-text">
                Delete <span className="mono">{removeJobTarget.name}</span>? This
                removes the <span className="mono">.job.xml</span> file from
                disk. The boards it referenced are not affected.
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setRemoveJobTarget(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={doRemoveJob}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {jobEditFile && (
        <div className="modal-backdrop" onClick={() => setJobEditFile(null)}>
          <div
            className="modal modal-wide"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h3>
                Job — <span className="mono">{jobEditName}</span>
              </h3>
              <button
                className="icon-btn"
                onClick={() => setJobEditFile(null)}
                title="Close"
              >
                ✕
              </button>
            </div>
            <div className="modal-body plc-body">
              <div className="import-row">
                <select
                  className="type-select"
                  value={addBoardSel}
                  onChange={(e) => setAddBoardSel(e.currentTarget.value)}
                >
                  {jobBoardLib.length === 0 && (
                    <option value="">no boards in library</option>
                  )}
                  {jobBoardLib.map((b) => (
                    <option key={b.file} value={b.file}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <button
                  className="btn btn-primary"
                  onClick={addBoardToJob}
                  disabled={!addBoardSel}
                >
                  + Add board
                </button>
              </div>
              {jobErr && <div className="banner banner-warn">{jobErr}</div>}
              {jobBoards.length === 0 ? (
                <div className="muted">
                  No boards in this job yet. Add one above, then position it on
                  the machine bed.
                </div>
              ) : (
                jobBoards.map((b) => (
                  <div key={b.uid} className="teach-block">
                    <div className="teach-head">
                      <span className="mono">{b.boardName}</span> ·{" "}
                      {b.placements} placements
                      <button
                        className="btn btn-sm btn-icon btn-trash jb-remove"
                        onClick={() => removeBoardFromJob(b.uid)}
                        title="Remove from job"
                        aria-label="Remove board from job"
                      >
                        <TrashIcon size={14} />
                      </button>
                    </div>
                    <div className="field-grid">
                      <label className="loc-field">
                        <span>X (mm)</span>
                        <NumberInput
                          step={1}
                          value={b.x}
                          onChange={(v) => updateJobBoard(b.uid, { x: v })}
                        />
                      </label>
                      <label className="loc-field">
                        <span>Y (mm)</span>
                        <NumberInput
                          step={1}
                          value={b.y}
                          onChange={(v) => updateJobBoard(b.uid, { y: v })}
                        />
                      </label>
                      <label className="loc-field">
                        <span>Z (mm)</span>
                        <NumberInput
                          step={0.1}
                          value={b.z}
                          onChange={(v) => updateJobBoard(b.uid, { z: v })}
                        />
                      </label>
                      <label className="loc-field">
                        <span>Rotation°</span>
                        <NumberInput
                          step={1}
                          value={b.rotation}
                          onChange={(v) =>
                            updateJobBoard(b.uid, { rotation: v })
                          }
                        />
                      </label>
                      <label className="loc-field">
                        <span>Side</span>
                        <select
                          className="type-select"
                          value={b.side}
                          onChange={(e) =>
                            updateJobBoard(b.uid, { side: e.currentTarget.value })
                          }
                        >
                          <option value="Top">Top</option>
                          <option value="Bottom">Bottom</option>
                        </select>
                      </label>
                    </div>
                    <div className="teach-actions">
                      <button
                        className="btn btn-sm"
                        onClick={() => teachJobBoard(b.uid, false)}
                        title="Jog the camera to this board origin"
                      >
                        <CrosshairIcon size={13} /> Go
                      </button>
                      <button
                        className="btn btn-sm"
                        onClick={() => teachJobBoard(b.uid, true)}
                        title="Set origin from the current camera position"
                      >
                        <CameraIcon size={13} /> Grab
                      </button>
                      <label className="run-toggle">
                        <input
                          type="checkbox"
                          checked={b.enabled}
                          onChange={(e) =>
                            updateJobBoard(b.uid, {
                              enabled: e.currentTarget.checked,
                            })
                          }
                        />
                        Enabled
                      </label>
                      <label
                        className="run-toggle"
                        title="Locate this board by its fiducials before placing."
                      >
                        <input
                          type="checkbox"
                          checked={b.checkFids}
                          onChange={(e) =>
                            updateJobBoard(b.uid, {
                              checkFids: e.currentTarget.checked,
                            })
                          }
                        />
                        Check fiducials
                      </label>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="modal-foot">
              <span className="muted job-save-note">
                Edits mark the job unsaved — use Save in the header to write the
                .job.xml.
              </span>
              <button
                className="btn btn-primary"
                onClick={() => setJobEditFile(null)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {editPlacement && (
        <div className="modal-backdrop" onClick={() => setEditPlacement(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>
                Placement — <span className="mono">{editPlacement.id}</span>
              </h3>
              <button
                className="icon-btn"
                onClick={() => setEditPlacement(null)}
                title="Close"
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="field-row">
                <label>Part</label>
                <select
                  className="type-select"
                  value={editPlacement.part ?? ""}
                  onChange={(e) =>
                    setEditPlacement({
                      ...editPlacement,
                      part: e.currentTarget.value || null,
                    })
                  }
                >
                  <option value="">—</option>
                  {parts.map((pt) => (
                    <option key={pt} value={pt}>
                      {pt}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field-grid">
                <label className="loc-field">
                  <span>Side</span>
                  <select
                    className="type-select"
                    value={editPlacement.side ?? "Top"}
                    onChange={(e) =>
                      setEditPlacement({
                        ...editPlacement,
                        side: e.currentTarget.value,
                      })
                    }
                  >
                    <option value="Top">Top</option>
                    <option value="Bottom">Bottom</option>
                  </select>
                </label>
                <label className="loc-field">
                  <span>Type</span>
                  <select
                    className="type-select"
                    value={editPlacement.type}
                    onChange={(e) =>
                      setEditPlacement({
                        ...editPlacement,
                        type: e.currentTarget.value,
                      })
                    }
                  >
                    <option value="Placement">Placement</option>
                    <option value="Fiducial">Fiducial</option>
                  </select>
                </label>
                <label className="loc-field">
                  <span>Error handling</span>
                  <select
                    className="type-select"
                    value={editPlacement.errorHandling ?? "Default"}
                    onChange={(e) =>
                      setEditPlacement({
                        ...editPlacement,
                        errorHandling: e.currentTarget.value,
                      })
                    }
                  >
                    {ERROR_HANDLING.map((eh) => (
                      <option key={eh} value={eh}>
                        {eh}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="field-grid">
                <label className="loc-field">
                  <span>X (mm)</span>
                  <NumberInput
                    step={0.01}
                    value={editPlacement.x}
                    onChange={(v) =>
                      setEditPlacement({ ...editPlacement, x: v })
                    }
                  />
                </label>
                <label className="loc-field">
                  <span>Y (mm)</span>
                  <NumberInput
                    step={0.01}
                    value={editPlacement.y}
                    onChange={(v) =>
                      setEditPlacement({ ...editPlacement, y: v })
                    }
                  />
                </label>
                <label className="loc-field">
                  <span>Rotation°</span>
                  <NumberInput
                    value={editPlacement.rot}
                    onChange={(v) =>
                      setEditPlacement({ ...editPlacement, rot: v })
                    }
                  />
                </label>
              </div>
              <div className="teach-block">
                <div className="teach-head">
                  Jog the camera over this part on the board, then set the board
                  origin from it (fixes translation; rotation still needs
                  fiducials).
                </div>
                <div className="teach-actions">
                  <button
                    className="btn btn-sm"
                    onClick={() => setBoardOrigin(editPlacement.id)}
                  >
                    <CrosshairIcon size={14} /> Set board origin from camera
                  </button>
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button
                className="btn"
                onClick={() => setEditPlacement(null)}
              >
                Close
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  updatePlacement(editPlacement.id, {
                    partId: editPlacement.part ?? "",
                    side: editPlacement.side ?? "Top",
                    type: editPlacement.type,
                    errorHandling: editPlacement.errorHandling ?? "Default",
                    x: editPlacement.x,
                    y: editPlacement.y,
                    rot: editPlacement.rot,
                  });
                  setEditPlacement(null);
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="modal-backdrop" onClick={() => setDeleteTarget(null)}>
          <div
            className="modal modal-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h3>Delete feeder?</h3>
              <button
                className="icon-btn"
                onClick={() => setDeleteTarget(null)}
                title="Close"
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p className="confirm-text">
                Delete <span className="mono">{deleteTarget.name}</span>? This
                removes the feeder and its setup. This can't be undone.
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={confirmDeleteFeeder}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
