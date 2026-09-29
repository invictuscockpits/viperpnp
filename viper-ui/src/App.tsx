import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  tools?: { id: string; name: string; x: number; y: number; z: number; c: number }[];
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
  slot?: number | null;
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
  pickZ?: number;
  visionRef?: boolean;
  feedOption?: string;
  peelTimeMsPerTenth?: number;
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

interface JobPlacement extends Placement {
  placed?: boolean;
  status?: string;
  comments?: string;
}

interface JobBoardLoc {
  uid: string;
  boardFile: string | null;
  boardName: string;
  width: number;
  length: number;
  side: string;
  enabled: boolean;
  checkFids: boolean;
  x: number;
  y: number;
  z: number;
  rotation: number;
  placements: number;
  fiducialCount: number;
  aligned: boolean;
  alignAngle?: number;
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
  bodyWidth?: number;
  bodyHeight?: number;
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
  lightId?: string | null;
  bound?: boolean;
  deviceName?: string | null;
  deviceUniqueId?: string | null;
  formatName?: string | null;
  location?: { x: number; y: number; z: number; rotation: number } | null;
}

interface CaptureDeviceInfo {
  name: string;
  uniqueId: string;
  formats: { formatId: number; width: number; height: number; fps: number; desc: string }[];
}

interface NozzleInfo {
  id: string;
  name: string;
  mount: string;
  vacuum: string;
  blowOff: string;
  vacuumSense: string;
  tip: string | null;
  headOffsets?: { x: number; y: number; z: number };
  isDefault?: boolean;
}
interface NozzleTipInfo {
  id: string;
  name: string;
  pickDwellMs?: number;
  placeDwellMs?: number;
  maxPickToleranceMm?: number;
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
  // nozzle-tip runout calibration
  calEnabled?: boolean;
  calFailHoming?: boolean;
  calRecalTrigger?: string;
  calAngleSubdivisions?: number;
  calAllowMisdetections?: number;
  calZOffset?: number;
  calibrated?: boolean;
  loaded?: boolean;
  // automatic tool-changer motion path (passive)
  changer?: {
    start: FeederLoc | null;
    mid: FeederLoc | null;
    mid2: FeederLoc | null;
    end: FeederLoc | null;
    startToMidSpeed: number;
    midToMid2Speed: number;
    mid2ToEndSpeed: number;
    configured: boolean;
  };
}
interface BottomVisionInfo {
  preRotate: boolean;
  maxVisionPasses: number;
  maxLinearOffset: number;
  maxAngularOffset: number;
  calExposure?: number | null;
  calExposureEnabled?: boolean;
}
const VAC_METHODS = ["None", "Absolute", "Difference"];
const CHANGER_STEPS = [
  {
    which: "start",
    label: "Start",
    hint: "Safe approach point above the tip's slot, at travel Z.",
  },
  {
    which: "mid",
    label: "Mid",
    hint: "First descent point, lined up over the slot.",
  },
  {
    which: "mid2",
    label: "Mid 2",
    hint: "Engage point where the nozzle seats onto the tip.",
  },
  {
    which: "end",
    label: "End",
    hint: "Final seated point, clear to lift the loaded tip away.",
  },
] as const;
const RECAL_TRIGGERS = [
  "NozzleTipChange",
  "NozzleTipChangeInJob",
  "MachineHome",
  "Manual",
];
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
  homingFiducial?: { x: number; y: number; z: number };
  primaryFiducial?: { x: number; y: number; z: number };
  primaryFiducialDiameter?: number;
  secondaryFiducial?: { x: number; y: number; z: number };
  secondaryFiducialDiameter?: number;
  verifyFidAfterHome?: boolean;
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

type Tab =
  | "machine"
  | "board"
  | "jobs"
  | "feeders"
  | "parts"
  | "packages"
  | "vision"
  | "log"
  | "panels";

const STEPS = [0.01, 0.1, 1, 10, 100];

const TABS: { id: Tab; label: string }[] = [
  { id: "jobs", label: "Job" },
  { id: "panels", label: "Panels" },
  { id: "board", label: "Boards" },
  { id: "feeders", label: "Feeders" },
  { id: "parts", label: "Parts" },
  { id: "packages", label: "Packages" },
  { id: "vision", label: "Vision" },
  { id: "machine", label: "Machine" },
  { id: "log", label: "Log" },
];

const SOON: string[] = [];

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
    id: "toolchanger",
    title: "Tool Changer",
    desc: "Automatic nozzle-tip change",
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

/**
 * Polled camera view. Chained single-frame requests (each frame's onLoad
 * schedules the next) instead of an MJPEG stream: infinite multipart streams
 * bloat and eventually freeze the embedded webview, and their held-open
 * connections can exhaust Chromium's per-host pool, starving every other
 * request. Polling is slightly lower fps but self-healing by construction.
 */
function CameraFeed({
  id,
  w,
  className,
  zoomable = true,
}: {
  id: string;
  w: number;
  className: string;
  zoomable?: boolean;
}) {
  const [src, setSrc] = useState(`/api/camera/frame?id=${id}&w=${w}&t=0`);
  const [zoom, setZoom] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const next = (delay: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(
      () => setSrc(`/api/camera/frame?id=${id}&w=${w}&t=${Date.now()}`),
      delay,
    );
  };
  useEffect(() => {
    setSrc(`/api/camera/frame?id=${id}&w=${w}&t=${Date.now()}`);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, w]);
  return (
    <>
      <img
        className={`${className}${zoomable ? " cam-zoomable" : ""}`}
        src={src}
        alt=""
        draggable={false}
        title={zoomable ? "Click to enlarge" : undefined}
        onClick={zoomable ? () => setZoom(true) : undefined}
        onLoad={() => next(180)}
        onError={() => next(1200)}
      />
      {zoom && (
        <div
          className="cam-lightbox"
          title="Click to close"
          onClick={() => setZoom(false)}
        >
          <CameraFeed
            id={id}
            w={1280}
            className="cam-lightbox-img"
            zoomable={false}
          />
        </div>
      )}
    </>
  );
}

interface CamProp {
  name: string;
  value: number;
  min: number;
  max: number;
  default: number;
  autoSupported: boolean;
  auto: boolean;
}

/** Driver image controls (exposure, brightness, …) for one camera, self-loading. */
function CamPropSliders({ id }: { id: string }) {
  const [props, setProps] = useState<CamProp[]>([]);
  const load = useCallback(async () => {
    try {
      const d = await (await fetch(`/api/camera/props?id=${id}`)).json();
      setProps(d.props ?? []);
    } catch {
      /* ignore */
    }
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  const post = (property: string, patch: { auto?: boolean; value?: number }) =>
    fetch("/api/camera/property", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, property, ...patch }),
    });

  const setValue = (p: CamProp, value: number) => {
    // Dragging a slider implies manual control.
    setProps((ps) =>
      ps.map((x) => (x.name === p.name ? { ...x, value, auto: false } : x)),
    );
    post(p.name, p.autoSupported ? { auto: false, value } : { value });
  };

  const setAuto = (p: CamProp, auto: boolean) => {
    setProps((ps) => ps.map((x) => (x.name === p.name ? { ...x, auto } : x)));
    post(p.name, { auto }).then(() => setTimeout(load, 800));
  };

  if (props.length === 0) {
    return null;
  }
  return (
    <div className="cam-props">
      {props.map((p) => (
        <div key={p.name} className="cam-prop-row">
          <span className="cam-prop-name">{p.name}</span>
          <input
            type="range"
            min={p.min}
            max={p.max}
            value={p.value}
            disabled={p.auto}
            onChange={(e) => setValue(p, Number(e.currentTarget.value))}
          />
          <span className="cam-prop-val mono">{p.value}</span>
          {p.autoSupported && (
            <label className="cam-prop-auto">
              <input
                type="checkbox"
                checked={p.auto}
                onChange={(e) => setAuto(p, e.currentTarget.checked)}
              />
              auto
            </label>
          )}
          <button
            className="btn btn-sm btn-icon cam-prop-reset"
            title={`Reset to default (${p.default})`}
            onClick={() => setValue(p, p.default)}
          >
            ↺
          </button>
        </div>
      ))}
    </div>
  );
}

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

/** Substring filter box for a list tab (Parts / Feeders / Packages). */
function ListSearch({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="list-search">
      <SearchIcon size={13} />
      <input
        className="plc-search-input"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
      />
      {value && (
        <button
          className="list-search-clear"
          onClick={() => onChange("")}
          title="Clear search"
          aria-label="Clear search"
        >
          ×
        </button>
      )}
    </div>
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
  // Jog mode: false = discrete step (one move per keypress), true = continuous
  // (repeated moves while a direction key is held). heldKeyRef tracks the
  // active continuous key so the paced loop knows when to stop (on keyup).
  const [continuous, setContinuous] = useState(false);
  // Continuous-jog feel knobs (sent to the backend streamer). Bigger segment /
  // shorter pace = faster, at the cost of a longer coast when the key is let go.
  const [jogSeg, setJogSeg] = useState(0.3);
  const [jogPace, setJogPace] = useState(0);
  const heldKeyRef = useRef<string | null>(null);
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
  const [jobBoards, setJobBoards] = useState<JobBoardLoc[]>([]);
  const [jobBoardLib, setJobBoardLib] = useState<{ file: string; name: string }[]>(
    [],
  );
  const [addBoardSel, setAddBoardSel] = useState("");
  const [alignUid, setAlignUid] = useState<string | null>(null);
  const [alignFids, setAlignFids] = useState<
    { id: string; x: number; y: number; part: string | null }[]
  >([]);
  const [alignMeasured, setAlignMeasured] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const [alignResult, setAlignResult] = useState<{
    angle: number;
    residual?: number;
    points?: number;
  } | null>(null);
  // Multi-placement board location (OpenPnP's MultiPlacementBoardLocationProcess):
  // pick 3+ ordinary placements, visit each, jog the camera to its true center and
  // capture, then compute the board transform from the design->measured points.
  const [mpbActive, setMpbActive] = useState(false);
  const [mpbPhase, setMpbPhase] = useState<"select" | "walk" | "done">("select");
  const [mpbSel, setMpbSel] = useState<string[]>([]);
  const [mpbStep, setMpbStep] = useState(0);
  const [mpbMeasured, setMpbMeasured] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const [mpbResult, setMpbResult] = useState<{
    angle: number;
    residual?: number;
    points?: number;
  } | null>(null);
  const [jobBoardsRefresh, setJobBoardsRefresh] = useState(0);
  const [selectedBoardUid, setSelectedBoardUid] = useState<string | null>(null);
  const [jobBoardPlc, setJobBoardPlc] = useState<JobPlacement[]>([]);
  const [plcSearch, setPlcSearch] = useState("");
  const [plcRefresh, setPlcRefresh] = useState(0);
  const [plcMenu, setPlcMenu] = useState<{
    x: number;
    y: number;
    id: string;
  } | null>(null);
  const [jobRunning, setJobRunning] = useState(false);
  const [jobStepping, setJobStepping] = useState(false);
  const [jobStatus, setJobStatus] = useState("");
  const [keepGoing, setKeepGoing] = useState(true);
  const [jobSkipped, setJobSkipped] = useState<
    { id: string; part: string | null; board: string; reason?: string }[] | null
  >(null);
  const [jobAborted, setJobAborted] = useState(false);
  const [editPlacement, setEditPlacement] = useState<Placement | null>(null);
  const [partsDetail, setPartsDetail] = useState<PartInfo[]>([]);
  const [packages, setPackages] = useState<PackageInfo[]>([]);
  const [pkgMsg, setPkgMsg] = useState<string>("");
  // Substring search on the Parts / Feeders / Packages tabs. Matches any run
  // of characters anywhere in the name (parts are named inconsistently).
  const [partSearch, setPartSearch] = useState("");
  const [feederSearch, setFeederSearch] = useState("");
  const [pkgSearch, setPkgSearch] = useState("");
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
  const [captureDevices, setCaptureDevices] = useState<CaptureDeviceInfo[]>([]);
  const [camLights, setCamLights] = useState<Record<string, boolean>>({});
  const [visionFrames, setVisionFrames] = useState<
    Record<string, { seq: number; text: string; timestamp: number }>
  >({});
  // Camera panes briefly show the vision working image when one arrives,
  // like OpenPnP's CameraView.showFilteredImage (masks, detections).
  const [visionFlash, setVisionFlash] = useState<Record<string, boolean>>({});
  const visionFlashTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>(
    {},
  );
  const [visionTest, setVisionTest] = useState<string | null>(null);
  const [visionSettings, setVisionSettings] = useState<
    { id: string; name: string; type: string; enabled: boolean; stages: number }[]
  >([]);
  const [nozzles, setNozzles] = useState<NozzleInfo[]>([]);
  const [nzTips, setNzTips] = useState<NozzleTipInfo[]>([]);
  // Tool-changer setup wizard: which tip is being taught, and the current step.
  const [tcTip, setTcTip] = useState<string | null>(null);
  const [tcStep, setTcStep] = useState(0);
  const [tcMsg, setTcMsg] = useState("");
  const [nozzleActs, setNozzleActs] = useState<ActuatorOpt[]>([]);
  const [bottomVision, setBottomVision] = useState<BottomVisionInfo | null>(null);
  const [calibrating, setCalibrating] = useState<string | null>(null);
  const [calResult, setCalResult] = useState<{
    tip: string;
    calibrated: boolean;
    info: string;
  } | null>(null);
  const [fidBusy, setFidBusy] = useState(false);
  const [fidPx, setFidPx] = useState(50);
  const [fidMsg, setFidMsg] = useState<string | null>(null);
  const [nozOffMsg, setNozOffMsg] = useState<string | null>(null);
  const [pickFeederId, setPickFeederId] = useState("");
  const [pickNozzleId, setPickNozzleId] = useState("");
  const [pickMsg, setPickMsg] = useState<string | null>(null);
  // Keep the part parked over the bottom camera after Align (skip the safe-Z
  // retreat) so the pipeline can be tuned with the real part in view.
  const [pickHold, setPickHold] = useState(true);
  // Sidebar camera pane enlarged view (keeps the crosshair overlay) — cam id.
  const [zoomPane, setZoomPane] = useState<string | null>(null);
  // Single-placement test: Z height for "Place @ camera" (part lands at the top
  // camera's crosshair, corrected by the last bench Align).
  const [placeZInput, setPlaceZInput] = useState<number>(() => {
    const v = parseFloat(localStorage.getItem("viper.placeZ") ?? "");
    return Number.isFinite(v) ? v : 1.6;
  });
  // Vacuum part-detect calibration: live reading + captured part-on/off levels.
  const [vacReading, setVacReading] = useState<number | null>(null);
  const [vacOn, setVacOn] = useState<number | null>(null);
  const [vacOff, setVacOff] = useState<number | null>(null);
  const [axes, setAxes] = useState<AxisInfo[]>([]);
  const [general, setGeneral] = useState<GeneralInfo | null>(null);
  const [backups, setBackups] = useState<
    { name: string; label: string; whenMs: number; sizeBytes: number }[]
  >([]);
  const [backupMsg, setBackupMsg] = useState<string>("");
  const [logLines, setLogLines] = useState<{ level: string; text: string }[]>(
    [],
  );
  const [logLevel, setLogLevel] = useState<string>("INFO");
  const [logPaused, setLogPaused] = useState<boolean>(false);
  const [logSearch, setLogSearch] = useState<string>("");
  const logViewRef = useRef<HTMLDivElement | null>(null);
  const downloadLog = () => {
    const text = logLines.map((l) => l.text).join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "viperpnp-log.txt";
    a.click();
    URL.revokeObjectURL(url);
  };
  // Panels tab (PCB panelization: array a board across the job)
  const [panelBoard, setPanelBoard] = useState<string>("");
  const [panelJob, setPanelJob] = useState<string>("");
  const [panelRows, setPanelRows] = useState<number>(2);
  const [panelCols, setPanelCols] = useState<number>(2);
  const [panelXPitch, setPanelXPitch] = useState<number>(50);
  const [panelYPitch, setPanelYPitch] = useState<number>(50);
  const [panelX0, setPanelX0] = useState<number>(0);
  const [panelY0, setPanelY0] = useState<number>(0);
  const [panelSide, setPanelSide] = useState<string>("Top");
  const [panelMsg, setPanelMsg] = useState<string>("");
  const [reference, setReference] = useState("camera");
  const [tab, setTab] = useState<Tab>("board");
  const [feeders, setFeeders] = useState<FeederInfo[]>([]);
  const [parts, setParts] = useState<string[]>([]);
  const [feederType, setFeederType] = useState("photon");
  const [feederName, setFeederName] = useState("");
  const [editFeeder, setEditFeeder] = useState<FeederConfig | null>(null);
  // Uniform pick depth shared by every Photon feeder (same nose plate).
  const [pickZInput, setPickZInput] = useState<number>(() => {
    const v = parseFloat(localStorage.getItem("viper.pickZ") ?? "");
    return Number.isFinite(v) ? v : 15.9;
  });
  const [feederTeachMsg, setFeederTeachMsg] = useState<string>("");
  const [feederTeachBusy, setFeederTeachBusy] = useState<boolean>(false);
  const [deleteTarget, setDeleteTarget] = useState<FeederInfo | null>(null);
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(
    null,
  );
  const [scanning, setScanning] = useState(false);
  const [railScanBusy, setRailScanBusy] = useState(false);
  const [railScanMsg, setRailScanMsg] = useState<string | null>(null);
  const [configDirty, setConfigDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const dragIndex = useRef<number | null>(null);
  // Live id of the feeder in the edit modal, for async WS handlers to refresh.
  const editFeederIdRef = useRef<string | null>(null);

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
  };

  const activeJobFile = useMemo(
    () => jobs.find((j) => j.active)?.file ?? null,
    [jobs],
  );

  const syncJobState = useCallback(async () => {
    try {
      const st = await (await fetch("/api/job/state")).json();
      setJobRunning(!!st.running);
      setJobStepping(!!st.stepping);
    } catch {
      /* ignore */
    }
  }, []);

  const loadJobBoards = useCallback(async (file: string | null) => {
    if (!file) {
      setJobBoards([]);
      setJobBoardLib([]);
      return;
    }
    try {
      const d = await (
        await fetch("/api/job/boards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file }),
        })
      ).json();
      setJobBoards(d.boards ?? []);
      setJobBoardLib(d.library ?? []);
      setAddBoardSel((s) => s || d.library?.[0]?.file || "");
    } catch {
      /* ignore */
    }
  }, []);

  const loadJobPlacements = useCallback(
    async (file: string | null, uid: string | null) => {
      if (!file || !uid) {
        setJobBoardPlc([]);
        return;
      }
      try {
        const d = await (
          await fetch("/api/job/board/placements", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ file, uid }),
          })
        ).json();
        setJobBoardPlc(d.placements ?? []);
      } catch {
        /* ignore */
      }
    },
    [],
  );

  // Load the active job's board-locations whenever the active job changes
  // (or something external — e.g. a finished vision align — bumps the counter).
  useEffect(() => {
    setJobEditFile(activeJobFile);
    loadJobBoards(activeJobFile);
  }, [activeJobFile, jobBoardsRefresh, loadJobBoards]);

  // Only reset the board selection when the job itself changes.
  useEffect(() => {
    setSelectedBoardUid(null);
  }, [activeJobFile]);

  // Auto-select the first board once boards load (if nothing selected).
  useEffect(() => {
    if (jobBoards.length > 0) {
      setSelectedBoardUid((cur) =>
        cur && jobBoards.some((b) => b.uid === cur) ? cur : jobBoards[0].uid,
      );
    } else {
      setSelectedBoardUid(null);
    }
  }, [jobBoards]);

  // Load placements for the selected board (re-runs after a run bumps plcRefresh).
  useEffect(() => {
    loadJobPlacements(activeJobFile, selectedBoardUid);
  }, [activeJobFile, selectedBoardUid, plcRefresh, loadJobPlacements]);

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

  const openAlign = async (uid: string) => {
    if (!jobEditFile) return;
    setJobErr("");
    setAlignMeasured({});
    setAlignResult(null);
    try {
      const d = await (
        await fetch("/api/job/board/fiducials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file: jobEditFile, uid }),
        })
      ).json();
      setAlignFids(d.fiducials ?? []);
      setAlignUid(uid);
    } catch (e) {
      setJobErr(e instanceof Error ? e.message : String(e));
    }
  };

  const alignGo = (placementId: string) => {
    if (!jobEditFile || !alignUid) return;
    fetch("/api/job/board/align/go", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file: jobEditFile, uid: alignUid, placementId }),
    }).catch((e) => setJobErr(e instanceof Error ? e.message : String(e)));
  };

  const alignCapture = async (placementId: string) => {
    if (!jobEditFile || !alignUid) return;
    try {
      const d = await (
        await fetch("/api/job/board/align/capture", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file: jobEditFile, uid: alignUid, placementId }),
        })
      ).json();
      setAlignMeasured((m) => ({ ...m, [placementId]: { x: d.x, y: d.y } }));
    } catch (e) {
      setJobErr(e instanceof Error ? e.message : String(e));
    }
  };

  const computeAlign = async () => {
    if (!jobEditFile || !alignUid) return;
    const points = Object.entries(alignMeasured).map(([placementId, p]) => ({
      placementId,
      x: p.x,
      y: p.y,
    }));
    if (points.length < 2) {
      setJobErr("Capture at least 2 fiducials first.");
      return;
    }
    try {
      const res = await fetch("/api/job/board/align", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: jobEditFile, uid: alignUid, points }),
      });
      const d = await res.json();
      if (!res.ok) {
        setJobErr(d.error ?? "Alignment failed.");
        return;
      }
      applyJobBoards(d);
      loadJobs();
      if (d.align) setAlignResult(d.align);
    } catch (e) {
      setJobErr(e instanceof Error ? e.message : String(e));
    }
  };

  const autoAlign = (uid: string) => {
    if (!jobEditFile) return;
    postJobBoard("/api/job/board/align/auto", { file: jobEditFile, uid });
  };

  const clearAlign = (uid: string) => {
    if (!jobEditFile) return;
    postJobBoard("/api/job/board/align/clear", { file: jobEditFile, uid });
    if (alignUid === uid) {
      setAlignMeasured({});
      setAlignResult(null);
    }
  };

  const openMpb = () => {
    setMpbActive(true);
    setMpbPhase("select");
    setMpbSel([]);
    setMpbMeasured({});
    setMpbResult(null);
    setMpbStep(0);
  };
  const closeMpb = () => setMpbActive(false);
  const toggleMpbSel = (id: string) =>
    setMpbSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  // Move the camera to a selected placement's expected (design) location.
  const mpbGo = (step: number) => {
    const id = mpbSel[step];
    if (!id || !jobEditFile || !selectedBoardUid) return;
    post("/api/job/board/align/go", {
      file: jobEditFile,
      uid: selectedBoardUid,
      placementId: id,
    });
  };
  const startMpbWalk = () => {
    if (mpbSel.length < 2) {
      setError("Pick at least 2 placements (3+ recommended).");
      return;
    }
    setMpbMeasured({});
    setMpbStep(0);
    setMpbPhase("walk");
    mpbGo(0);
  };
  const mpbCompute = async (measured: Record<string, { x: number; y: number }>) => {
    if (!jobEditFile || !selectedBoardUid) return;
    const points = Object.entries(measured).map(([placementId, p]) => ({
      placementId,
      x: p.x,
      y: p.y,
    }));
    if (points.length < 2) {
      setError("Capture at least 2 placements first.");
      return;
    }
    try {
      const res = await fetch("/api/job/board/align", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: jobEditFile, uid: selectedBoardUid, points }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? "Board location failed.");
        return;
      }
      applyJobBoards(d);
      loadJobs();
      if (d.align) setMpbResult(d.align);
      setMpbPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  // Capture the current camera position as this placement's true center, then
  // advance to the next (auto-moving the camera there); compute after the last.
  const mpbCapture = async () => {
    const id = mpbSel[mpbStep];
    if (!id || !jobEditFile || !selectedBoardUid) return;
    try {
      const d = await (
        await fetch("/api/job/board/align/capture", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            file: jobEditFile,
            uid: selectedBoardUid,
            placementId: id,
          }),
        })
      ).json();
      const measured = { ...mpbMeasured, [id]: { x: d.x, y: d.y } };
      setMpbMeasured(measured);
      if (mpbStep < mpbSel.length - 1) {
        const next = mpbStep + 1;
        setMpbStep(next);
        mpbGo(next);
      } else {
        mpbCompute(measured);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const selectedBoard = jobBoards.find((b) => b.uid === selectedBoardUid) ?? null;

  const editJobPlacement = (id: string, patch: object) => {
    const bf = selectedBoard?.boardFile;
    if (!bf) return;
    fetch("/api/job/placement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ board: bf, id, ...patch }),
    })
      .then(() => loadJobPlacements(activeJobFile, selectedBoardUid))
      .catch((e) => setJobErr(e instanceof Error ? e.message : String(e)));
  };

  // The Job-tab placements list after the search filter (shared by the table
  // body and the enable-all header checkbox).
  const filteredJobPlc = jobBoardPlc.filter((p) => {
    const q = plcSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      p.id.toLowerCase().includes(q) ||
      (p.part ?? "").toLowerCase().includes(q)
    );
  });

  // Header checkbox: enable/disable every placement currently shown (respects
  // the search filter, so a filtered search + toggle = bulk edit of the match).
  const setAllJobPlacements = (ids: string[], enabled: boolean) => {
    const bf = selectedBoard?.boardFile;
    if (!bf || ids.length === 0) return;
    fetch("/api/job/placement/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ board: bf, ids, enabled }),
    })
      .then(() => loadJobPlacements(activeJobFile, selectedBoardUid))
      .catch((e) => setJobErr(e instanceof Error ? e.message : String(e)));
  };

  const addJobPlacement = () => {
    const bf = selectedBoard?.boardFile;
    if (!bf) return;
    fetch("/api/job/placement/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ board: bf }),
    })
      .then(() => loadJobPlacements(activeJobFile, selectedBoardUid))
      .catch((e) => setJobErr(e instanceof Error ? e.message : String(e)));
  };

  const deleteJobPlacement = (id: string) => {
    const bf = selectedBoard?.boardFile;
    if (!bf) return;
    fetch("/api/job/placement/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ board: bf, ids: [id] }),
    })
      .then(() => loadJobPlacements(activeJobFile, selectedBoardUid))
      .catch((e) => setJobErr(e instanceof Error ? e.message : String(e)));
  };

  const setOriginFromPlacement = async (placementId: string) => {
    setPlcMenu(null);
    if (!jobEditFile || !selectedBoardUid) return;
    setJobErr("");
    try {
      const res = await fetch("/api/job/board/origin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file: jobEditFile,
          uid: selectedBoardUid,
          placementId,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        setJobErr(d.error ?? "Could not set the origin.");
        return;
      }
      applyJobBoards(d);
      loadJobs();
    } catch (e) {
      setJobErr(e instanceof Error ? e.message : String(e));
    }
  };

  const cameraToPlacement = (placementId: string) => {
    setPlcMenu(null);
    if (!jobEditFile || !selectedBoardUid) return;
    fetch("/api/job/board/align/go", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file: jobEditFile,
        uid: selectedBoardUid,
        placementId,
      }),
    }).catch((e) => setJobErr(e instanceof Error ? e.message : String(e)));
  };

  const capturePlacementFromCamera = async (placementId: string) => {
    setPlcMenu(null);
    if (!jobEditFile || !selectedBoardUid) return;
    setJobErr("");
    try {
      const res = await fetch("/api/job/placement/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file: jobEditFile,
          uid: selectedBoardUid,
          placementId,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        setJobErr(d.error ?? "Could not capture the placement location.");
        return;
      }
      setPlcRefresh((n) => n + 1);
    } catch (e) {
      setJobErr(e instanceof Error ? e.message : String(e));
    }
  };

  const stepJob = () => {
    setJobErr("");
    fetch("/api/job/step", { method: "POST" })
      .then(async (r) => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          setJobErr(d.error ?? "Could not step the job.");
        }
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

  const loadCaptureDevices = useCallback(async () => {
    try {
      const d = await (await fetch("/api/cameras/devices")).json();
      setCaptureDevices(d.devices ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleCamLight = (lightId: string) => {
    const on = !camLights[lightId];
    fetch("/api/actuator", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: lightId, on }),
    })
      .then(() => setCamLights((m) => ({ ...m, [lightId]: on })))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  const [camReconnecting, setCamReconnecting] = useState(false);
  const reconnectCameras = async () => {
    setCamReconnecting(true);
    try {
      const d = await (
        await fetch("/api/cameras/reconnect", { method: "POST" })
      ).json();
      if (d.cameras) setCameras(d.cameras);
      await loadCaptureDevices();
      const report = (d.reconnect ?? []) as {
        camera: string;
        bound: boolean;
        note: string;
      }[];
      const failed = report.filter((r) => !r.bound);
      if (failed.length) {
        setError(
          `Camera reconnect: ${failed
            .map((r) => `${r.camera} — ${r.note}`)
            .join("; ")}`,
        );
      } else {
        setError(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCamReconnecting(false);
    }
  };

  const reenumerateDevices = async () => {
    setCamReconnecting(true);
    try {
      const res = await fetch("/api/devices/reenumerate", { method: "POST" });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? `re-enumerate failed (HTTP ${res.status})`);
        return;
      }
      await loadCameras();
      await loadCaptureDevices();
      if (d.failed?.length) {
        setError(
          `Re-enumerate: ${d.failed.join("; ")} · machine ${d.machine}`,
        );
      } else {
        setError(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCamReconnecting(false);
    }
  };

  const swapCameras = async () => {
    setCamReconnecting(true);
    try {
      const res = await fetch("/api/cameras/swap", { method: "POST" });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? `swap failed (HTTP ${res.status})`);
        return;
      }
      if (d.cameras) setCameras(d.cameras);
      await loadCaptureDevices();
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCamReconnecting(false);
    }
  };

  const bindCamera = (id: string, uniqueId: string) => {
    fetch("/api/camera/bind", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, uniqueId }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.cameras) setCameras(d.cameras);
        else if (d.error) setError(String(d.error));
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  // Bottom-camera position teach: Go (top camera or selected nozzle), Grab
  // (top camera X/Y -> camera position), and direct field edits.
  const bottomCamGo = (tool: "camera" | "nozzle") => {
    post("/api/camera/bottom/go", {
      tool: tool === "camera" ? "camera" : reference === "camera" ? "nozzle" : reference,
    });
  };
  const bottomCamGrab = (tool: "camera" | "nozzle") => {
    fetch("/api/camera/bottom/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tool:
          tool === "camera"
            ? "camera"
            : reference === "camera"
              ? "nozzle"
              : reference,
      }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.cameras) setCameras(d.cameras);
        else if (d.error) setError(String(d.error));
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };
  const bottomCamSetLoc = (patch: { x?: number; y?: number; z?: number }) => {
    fetch("/api/camera/bottom/location", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.cameras) setCameras(d.cameras);
        else if (d.error) setError(String(d.error));
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  // Live camera panes need ids on mount (not just when the Cameras card opens).
  useEffect(() => {
    loadCameras();
  }, [loadCameras]);

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
      setBottomVision(d.bottomVision ?? null);
    } catch {
      /* ignore */
    }
  }, []);

  const applyNozzleResp = (d: {
    nozzles?: NozzleInfo[];
    nozzleTips?: NozzleTipInfo[];
    actuators?: ActuatorOpt[];
    bottomVision?: BottomVisionInfo;
  }) => {
    if (d.nozzles) setNozzles(d.nozzles);
    if (d.nozzleTips) setNzTips(d.nozzleTips);
    if (d.actuators) setNozzleActs(d.actuators);
    if (d.bottomVision) setBottomVision(d.bottomVision);
  };

  // Tool-changer teach/test. Uses the sidebar-selected nozzle (reference).
  const changerMove = (id: string, which: string) =>
    post("/api/nozzletip/changer/move", { id, which, tool: reference });
  const changerCapture = async (id: string, which: string) => {
    try {
      const res = await fetch("/api/nozzletip/changer/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, which, tool: reference }),
      });
      const d = await res.json();
      if (!res.ok) {
        setTcMsg(d.error ?? `capture failed (HTTP ${res.status})`);
        return;
      }
      applyNozzleResp(d);
      setTcMsg(`✓ captured ${which}. Save to keep.`);
    } catch (e) {
      setTcMsg(e instanceof Error ? e.message : String(e));
    }
  };
  const changerSpeeds = (id: string, patch: object) => {
    fetch("/api/nozzletip/changer/speeds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    })
      .then((r) => r.json())
      .then(applyNozzleResp)
      .catch(() => {});
  };
  const loadTip = (id: string) => {
    setTcMsg("Loading tip (running the changer path)…");
    post("/api/nozzletip/load", {
      id,
      nozzleId: reference !== "camera" ? reference : undefined,
    });
  };
  const unloadTip = (id: string) => {
    setTcMsg("Unloading tip (running the changer path)…");
    post("/api/nozzletip/unload", { id });
  };

  const updateBottomVision = (patch: Partial<BottomVisionInfo>) => {
    fetch("/api/bottomvision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
      .then((r) => r.json())
      .then(applyNozzleResp)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  const pickTest = (path: "pick" | "align" | "discard" | "hold") => {
    setPickMsg(
      path === "pick"
        ? "picking…"
        : path === "align"
          ? "aligning…"
          : path === "hold"
            ? "holding over camera…"
            : "discarding…",
    );
    fetch(`/api/test/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        feederId: pickFeederId,
        nozzleId: pickNozzleId,
        hold: path === "align" ? pickHold : undefined,
      }),
    })
      .then(async (r) => {
        if (!r.ok) {
          const e = await r.json().catch(() => ({}));
          throw new Error(e.error ?? `${path} failed (${r.status})`);
        }
      })
      .catch((e) => {
        setPickMsg(null);
        setError(e instanceof Error ? e.message : String(e));
      });
  };

  const resetBottomVisionPipeline = async () => {
    setPickMsg("resetting bottom-vision pipeline…");
    try {
      const r = await fetch("/api/vision/bottom/reset-pipeline", {
        method: "POST",
      });
      const d = await r.json();
      if (!r.ok) {
        setPickMsg(null);
        setError(d.error ?? "reset failed");
        return;
      }
      setPickMsg(
        `✓ bottom vision reset to the footprint-masked pipeline (${d.stages} stages)` +
          (d.roamingRadiusMm
            ? ` — set bottom-camera roaming radius ${d.roamingRadiusMm}mm so the footprint mask can build`
            : "") +
          ". Every part now masks to its own footprint.",
      );
      fetch("/api/vision/settings")
        .then((res) => res.json())
        .then((d2) => setVisionSettings(d2.settings ?? []))
        .catch(() => {});
    } catch (e) {
      setPickMsg(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  // Set which nozzle tip is physically loaded on a nozzle (manual swap).
  const setLoadedTip = (nozzleId: string, tipId: string) => {
    if (!nozzleId) return;
    fetch("/api/nozzle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: nozzleId, tipId }),
    })
      .then((r) => r.json())
      .then(applyNozzleResp)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };
  // Read the live vacuum sensor for a nozzle; optionally capture it as the
  // part-on or part-off reference for threshold calibration.
  const readVacuum = async (nozzleId: string, store?: "on" | "off") => {
    if (!nozzleId) return;
    try {
      const r = await fetch("/api/vacuum/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Part-off = bare nozzle, so pulse the valve to get the "vacuum on, no
        // part" level. Part-on reads the part already held (valve already on).
        body: JSON.stringify({ id: nozzleId, pulse: store === "off" }),
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.error ?? "vacuum read failed");
        return;
      }
      setVacReading(d.level);
      if (store === "on") setVacOn(d.level);
      if (store === "off") setVacOff(d.level);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  // Set the Absolute part-on window from the captured part-on/off levels. The
  // sensor direction isn't fixed (a good seal can read higher OR lower than the
  // bare-nozzle level), so build a window that contains part-on and excludes
  // part-off, split at the midpoint.
  const applyVacThresholds = (tipId: string) => {
    if (vacOn == null || vacOff == null) {
      setError(
        "Capture both readings first: pick a part → Read → part on, then bare nozzle → Read → part off.",
      );
      return;
    }
    const mid = (vacOn + vacOff) / 2;
    const margin = 8;
    const low = Math.round(vacOn < vacOff ? vacOn - margin : mid);
    const high = Math.round(vacOn < vacOff ? mid : vacOn + margin);
    updateTip(tipId, {
      methodPartOn: "Absolute",
      vacuumLevelPartOnLow: low,
      vacuumLevelPartOnHigh: high,
    });
  };

  // Step through the feeders that have a part loaded, to run every part in turn.
  const stepPart = (dir: 1 | -1) => {
    const list = feeders.filter((f) => f.part);
    if (list.length === 0) return;
    const i = list.findIndex((f) => f.id === pickFeederId);
    const next =
      i < 0
        ? dir === 1
          ? 0
          : list.length - 1
        : (i + dir + list.length) % list.length;
    setPickFeederId(list[next].id);
  };

  const nozzleOverFid = (nozzleId: string, which: "primary" | "secondary") => {
    fetch("/api/head/fiducial/go", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ which, tool: "nozzle", nozzleId }),
    })
      .then(async (r) => {
        if (!r.ok) {
          const e = await r.json().catch(() => ({}));
          throw new Error(e.error ?? `move failed (${r.status})`);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  const captureNozzleOffsets = (id: string, which: "primary" | "secondary") => {
    // Core's red-letter warning: re-capturing the primary with a default
    // nozzle that has a non-zero Z head offset resets it to zero and
    // REDEFINES the Z reference — every previously taught Z shifts, which
    // can cause machine collisions.
    const noz = nozzles.find((x) => x.id === id);
    if (
      which === "primary" &&
      noz?.isDefault &&
      Math.abs(noz.headOffsets?.z ?? 0) > 0.1 &&
      !window.confirm(
        `CAUTION: ${noz.name} currently has a non-zero Z head offset ` +
          `(${noz.headOffsets?.z} mm). Capturing will reset it to zero and ` +
          `redefine the Z reference — ALL previously taught Z coordinates ` +
          `(feeders, park, fiducials) will shift by that amount, which can ` +
          `cause collisions. Only proceed as part of a deliberate full ` +
          `recalibration. Continue?`,
      )
    ) {
      return;
    }
    setNozOffMsg(null);
    fetch("/api/nozzle/offsets/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, which }),
    })
      .then(async (r) => {
        if (!r.ok) {
          const e = await r.json().catch(() => ({}));
          throw new Error(e.error ?? `capture failed (${r.status})`);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  const calibrateTip = (id: string) => {
    setCalibrating(id);
    fetch("/api/nozzletip/calibrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    })
      .then(async (r) => {
        if (!r.ok) {
          const e = await r.json().catch(() => ({}));
          throw new Error(e.error ?? `calibrate failed (${r.status})`);
        }
      })
      .catch((e) => {
        setCalibrating(null);
        setError(e instanceof Error ? e.message : String(e));
      });
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

  const loadBackups = useCallback(async () => {
    try {
      const d = await (await fetch("/api/config/backups")).json();
      setBackups(d.backups ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  const snapshotConfig = () => {
    setBackupMsg("Saving snapshot…");
    fetch("/api/config/backup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "manual" }),
    })
      .then((r) => r.json())
      .then((d) => {
        setBackups(d.backups ?? []);
        setBackupMsg(d.created ? `✓ snapshot saved: ${d.created}` : "");
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  const restoreConfig = (name: string) => {
    if (
      !window.confirm(
        `Restore ${name}? This overwrites the live machine config. ` +
          `Your current config is snapshotted first, and the restart is required ` +
          `for it to take effect.`,
      )
    ) {
      return;
    }
    fetch("/api/config/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setError(d.error);
          return;
        }
        loadBackups();
        setBackupMsg(
          `✓ restored ${d.restored} — restart the backend for it to take effect`,
        );
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

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

  const fidAction = (
    action: "go" | "nozzleGo" | "capture" | "locate" | "zFromNozzle",
  ) => {
    if (action === "locate") {
      setFidBusy(true);
      setFidMsg(null);
    }
    const path =
      action === "nozzleGo"
        ? "go"
        : action === "zFromNozzle"
          ? "z-from-nozzle"
          : action;
    const body: Record<string, unknown> = { which: "secondary" };
    if (action === "locate") body.featureDiameterPx = fidPx;
    if (action === "nozzleGo") body.tool = "nozzle";
    // Nozzle actions honor the sidebar-selected nozzle (N1/N2), not the default.
    if (
      (action === "nozzleGo" || action === "zFromNozzle") &&
      reference !== "camera"
    ) {
      body.nozzleId = reference;
    }
    fetch(`/api/head/fiducial/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(async (r) => {
        if (!r.ok) {
          const e = await r.json().catch(() => ({}));
          throw new Error(e.error ?? `${path} failed (${r.status})`);
        }
        if (action === "capture" || action === "zFromNozzle") {
          const d = await r.json();
          setGeneral(d);
          setFidMsg(
            action === "capture"
              ? "✓ captured camera position"
              : `✓ Z set from nozzle tip (${d.secondaryFiducial?.z} mm)`,
          );
        }
      })
      .catch((e) => {
        setFidBusy(false);
        setError(e instanceof Error ? e.message : String(e));
      });
  };

  const openCard = (id: string) => {
    if (id === "connection") loadDrivers();
    if (id === "actuators") loadActuators();
    if (id === "cameras") {
      loadCameras();
      loadCaptureDevices();
    }
    if (id === "nozzles" || id === "toolchanger") loadNozzles();
    if (id === "motion") loadAxes();
    if (id === "general") {
      loadGeneral();
      loadBackups();
    }
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
      loadParts();
    }
    if (tab === "board") {
      loadBoards();
      loadParts();
    }
    if (tab === "jobs") {
      loadJobs();
      loadParts();
      // Recompute placement status (backend recomputes per fetch), so "No
      // feeder" clears as soon as you return to the Job tab after adding or
      // enabling a feeder — matching OpenPnP's on-focus refresh.
      setPlcRefresh((n) => n + 1);
    }
    if (tab === "parts") {
      loadParts();
      loadPackages();
    }
    if (tab === "packages") {
      loadPackages();
    }
    if (tab === "vision") {
      loadCameras();
      loadFeeders();
      loadNozzles();
      fetch("/api/vision/settings")
        .then((r) => r.json())
        .then((d) => setVisionSettings(d.settings ?? []))
        .catch(() => {
          /* ignore */
        });
    }
  }, [tab, loadFeeders, loadBoards, loadJobs, loadParts, loadPackages, loadCameras, loadNozzles]);

  useEffect(() => {
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let offlineDebounce: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${proto}//${location.host}/ws/events`);
      wsRef.current = ws;

      ws.addEventListener("open", () => {
        if (offlineDebounce) {
          clearTimeout(offlineDebounce);
          offlineDebounce = undefined;
        }
        setOnline(true);
        loadCameras();
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
          // Do NOT clear the error banner here: status frames stream in
          // constantly, so clearing on status made every error vanish within
          // milliseconds. Errors stay until explicitly dismissed.
          setStatus(data as Status);
        } else if (data && data.event === "feeders") {
          setFeeders(data.feeders ?? []);
          setScanning(false);
        } else if (data && data.event === "config") {
          setConfigDirty(!!data.dirty);
        } else if (data && data.event === "jobStarted") {
          setJobSkipped(null);
          setJobStatus(String(data.text ?? "Job started"));
          syncJobState();
        } else if (data && data.event === "jobStatus") {
          setJobStatus(String(data.text ?? ""));
        } else if (data && data.event === "visionImage") {
          const camId = String(data.camera);
          setVisionFrames((m) => ({
            ...m,
            [camId]: {
              seq: Number(data.seq),
              text: String(data.text ?? ""),
              timestamp: Number(data.timestamp ?? Date.now()),
            },
          }));
          // Flash the working image into the camera pane (OpenPnP shows it
          // for ~1s per vision op; consecutive frames keep it visible).
          setVisionFlash((m) => (m[camId] ? m : { ...m, [camId]: true }));
          if (visionFlashTimers.current[camId]) {
            clearTimeout(visionFlashTimers.current[camId]);
          }
          visionFlashTimers.current[camId] = setTimeout(() => {
            setVisionFlash((m) => ({ ...m, [camId]: false }));
          }, 1500);
        } else if (data && data.event === "visionTest") {
          setVisionTest(
            data.found
              ? `✓ ${data.part}: found at (${data.x}, ${data.y}) — Δ ${data.dist} mm from view center, ${data.matches} match${data.matches === 1 ? "" : "es"}`
              : `✗ ${data.part}: ${data.error ?? "not found"}`,
          );
        } else if (data && data.event === "alignDone") {
          setJobBoardsRefresh((n) => n + 1);
          setAlignResult({ angle: Number(data.angle) });
          loadJobs();
        } else if (data && data.event === "calibrateDone") {
          setCalibrating(null);
          setCalResult({
            tip: String(data.tip),
            calibrated: !!data.calibrated,
            info: String(data.info ?? ""),
          });
          loadNozzles();
        } else if (data && data.event === "fidLocateDone") {
          setFidBusy(false);
          setFidMsg(
            `✓ ${data.which} fiducial located at (${data.x}, ${data.y}) — Ø ${data.diameter} mm`,
          );
          loadGeneral();
        } else if (data && data.event === "testPick") {
          setPickMsg(`✓ picked ${data.part} with ${data.nozzle} — now run Align`);
        } else if (data && data.event === "alignTest") {
          setPickMsg(
            `✓ ${data.part}: offset X ${data.x} · Y ${data.y} · rotation ${data.rotation}°` +
              (data.preRotated ? " (pre-rotated)" : ""),
          );
        } else if (data && data.event === "testPlace") {
          setPickMsg(
            `✓ ${data.nozzle} placed at (${data.x}, ${data.y}, Z ${data.z})` +
              (data.aligned
                ? " with the Align correction applied"
                : " — NO align correction (run Align between Pick and Place)") +
              ". Jog the camera over it and measure the landing against the crosshair.",
          );
        } else if (data && data.event === "testDiscard") {
          setPickMsg(`✓ ${data.nozzle} discarded the part`);
        } else if (data && data.event === "railScan") {
          setRailScanMsg(
            data.ok
              ? `slot ${data.address} ${data.inferred ? "≈ inferred" : "✓"}` +
                  (data.driftMm !== undefined
                    ? ` drift ${data.driftMm} mm`
                    : "") +
                  ` (${data.done}/${data.total})`
              : `slot ${data.address} — ` +
                  (data.rejectedOffMm !== undefined
                    ? `found but ${data.rejectedOffMm} mm off-model, rejected`
                    : "no fiducial") +
                  ` (${data.done}/${data.total})`,
          );
        } else if (data && data.event === "feederVisionRecord") {
          setFeederTeachBusy(false);
          setFeederTeachMsg(
            data.ok
              ? `✓ vision reference recorded — aim (${data.aimX}, ${data.aimY}), hole→pocket (${data.vx}, ${data.vy})`
              : `✗ record failed: ${data.error ?? "no sprocket hole found"}`,
          );
          if (data.ok && editFeederIdRef.current) {
            openEditFeeder(editFeederIdRef.current);
          }
        } else if (data && data.event === "feederRelock") {
          setFeederTeachBusy(false);
          setFeederTeachMsg(
            data.ok
              ? `✓ re-locked — pick (${data.pickX}, ${data.pickY}, Z ${data.pickZ}), aim err ${data.aimErr} mm`
              : `✗ re-lock failed: ${data.error ?? "no sprocket hole found"}`,
          );
          if (data.ok && editFeederIdRef.current) {
            openEditFeeder(editFeederIdRef.current);
          }
        } else if (data && data.event === "busScanDone") {
          setRailScanMsg(
            `✓ bus scan: ${data.found} feeders answered` +
              (data.created ? `, ${data.created} new` : "") +
              (data.recovered?.length
                ? `, recovered by UUID: ${data.recovered.join(", ")}`
                : "") +
              (data.conflicts?.length
                ? `, STALE ADDRESS CLAIMS rejected: ${data.conflicts.join(", ")}`
                : "") +
              (data.unresponsive?.length
                ? ` — NOT RESPONDING (kept, check seating): slots ${data.unresponsive.join(", ")}`
                : ""),
          );
        } else if (data && data.event === "railScanDone") {
          setRailScanBusy(false);
          setRailScanMsg(
            `✓ rail scan: ${data.found}/${data.total} measured` +
              (data.inferred?.length
                ? `, ${data.inferred.length} inferred (${data.inferred.join(", ")})`
                : "") +
              (data.missed?.length
                ? `, UNRESOLVED: ${data.missed.join(", ")}`
                : "") +
              ` — max drift ${data.maxDriftMm} mm. Save to keep.`,
          );
          loadFeeders();
        } else if (data && data.event === "nozzleOffsetsDone") {
          setNozOffMsg(
            `✓ ${data.name} @ ${data.which} fiducial — head offsets X ${data.x} · Y ${data.y} · Z ${data.z}`,
          );
          loadNozzles();
          loadGeneral();
        } else if (data && data.event === "fidVerify") {
          if (data.error) {
            setError(`Fiducial drift check failed: ${data.error}`);
          } else if (data.ok) {
            setFidMsg(
              `✓ drift check: ${data.dist} mm, ${data.angleDeg}° — within ±${data.tol} mm`,
            );
          } else {
            setError(
              `Fiducial drift detected: ${data.dist} mm (Δx ${data.dx}, Δy ${data.dy})` +
                `, plate rotation ${data.angleDeg}° — exceeds ±${data.tol} mm. ` +
                `The staging plate or camera calibration may have shifted; ` +
                `re-run Auto-locate or recalibrate.`,
            );
          }
        } else if (data && data.event === "jobComplete") {
          setJobStatus(data.aborted ? "Job aborted" : "Job complete");
          setJobSkipped(data.skipped ?? []);
          setJobAborted(!!data.aborted);
          syncJobState();
          loadJobs();
          setPlcRefresh((n) => n + 1);
        } else if (data && data.event === "error") {
          setError(String(data.message));
          setScanning(false);
          // A failed machine task must also stop any spinner waiting on it.
          setCalibrating(null);
          setFidBusy(false);
          setPickMsg(null);
          setRailScanBusy(false);
        }
      });
      ws.addEventListener("close", () => {
        // Only react to UNEXPECTED closes. An intentional teardown
        // (React StrictMode remount, unmount) sets closed=true first; without
        // this guard its close event scheduled a setOnline(false) in the old
        // effect scope that the remount couldn't cancel — leaving the offline
        // banner stuck on while the backend was fine.
        if (closed) {
          return;
        }
        // Debounce the offline banner: a blip that reconnects within 2 s
        // (idle-timeout cycles, backend restarts mid-reconnect) never shows.
        if (!offlineDebounce) {
          offlineDebounce = setTimeout(() => setOnline(false), 2000);
        }
        retry = setTimeout(connect, 1500);
      });
      ws.addEventListener("error", () => ws.close());
    };

    connect();
    return () => {
      closed = true;
      if (retry) {
        clearTimeout(retry);
      }
      if (offlineDebounce) {
        clearTimeout(offlineDebounce);
      }
      wsRef.current?.close();
    };
  }, [loadInventory, loadJobs, syncJobState, loadCameras]);

  const post = useCallback(async (path: string, body?: unknown) => {
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      // A failed machine action (e.g. connect when the COM port is wedged)
      // returns a non-OK status; surface it instead of failing silently.
      if (!res.ok) {
        let msg = `${path} failed (HTTP ${res.status})`;
        try {
          const j = await res.json();
          if (j && j.error) msg = String(j.error);
        } catch {
          /* empty/non-JSON body — keep the generic message */
        }
        setError(msg);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    if (tab !== "log" || logPaused) return;
    let active = true;
    const fetchLog = async () => {
      try {
        const d = await (
          await fetch(`/api/log?lines=800&level=${logLevel}`)
        ).json();
        if (active && Array.isArray(d.lines)) setLogLines(d.lines);
      } catch {
        /* ignore */
      }
    };
    fetchLog();
    const iv = setInterval(fetchLog, 2000);
    return () => {
      active = false;
      clearInterval(iv);
    };
  }, [tab, logLevel, logPaused]);

  useEffect(() => {
    const el = logViewRef.current;
    if (el && tab === "log" && !logPaused) el.scrollTop = el.scrollHeight;
  }, [logLines, tab, logPaused]);

  const applyPanelize = async () => {
    const jobFile = panelJob || activeJobFile;
    if (!jobFile) {
      setPanelMsg("Select or activate a job first.");
      return;
    }
    if (!panelBoard) {
      setPanelMsg("Pick a board to array.");
      return;
    }
    setPanelMsg("Adding array…");
    try {
      const res = await fetch("/api/job/panelize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file: jobFile,
          boardFile: panelBoard,
          rows: panelRows,
          cols: panelCols,
          xPitch: panelXPitch,
          yPitch: panelYPitch,
          x0: panelX0,
          y0: panelY0,
          side: panelSide,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        setPanelMsg(d.error ?? `panelize failed (HTTP ${res.status})`);
        return;
      }
      const n = panelRows * panelCols;
      setPanelMsg(
        `✓ added ${n} board${n === 1 ? "" : "s"} (${panelRows} × ${panelCols}) to the job. Save to keep.`,
      );
      loadJobs();
    } catch (e) {
      setPanelMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const enabled = status?.enabled ?? false;
  const homed = status?.homed ?? false;
  // Teach actions read or drive real coordinates — meaningless until homed.
  const teachReady = enabled && homed;
  const teachHint = !enabled
    ? "Connect the machine first"
    : !homed
      ? "Home the machine first"
      : "";
  const toggleConnect = () =>
    post(enabled ? "/api/machine/disconnect" : "/api/machine/connect");
  const home = () => post("/api/machine/home");
  const park = (axes: "all" | "z" | "c" = "all") =>
    post("/api/machine/park", { axes, tool: reference });
  const cameraToNozzle = () =>
    post("/api/machine/camera-to-nozzle", { tool: reference });
  const nozzleToCamera = () =>
    post("/api/machine/nozzle-to-camera", { tool: reference });
  const toggleIo = (target: keyof IoState, on: boolean) =>
    post("/api/io", { target, on });
  const jog = (ax: "x" | "y" | "z" | "c", dir: 1 | -1, wait = false) => {
    const d = dir * step;
    return post("/api/jog", {
      dx: ax === "x" ? d : 0,
      dy: ax === "y" ? d : 0,
      dz: ax === "z" ? d : 0,
      dc: ax === "c" ? d : 0,
      speed,
      tool: reference,
      wait,
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
        // Parts/packages may have just been created — refresh those views.
        loadParts();
        loadPackages();
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
  const fillBodyPads = async () => {
    setPkgMsg("Filling masks…");
    try {
      const res = await fetch("/api/packages/bodypads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const d = await res.json();
      if (!res.ok) {
        setPkgMsg("");
        setError(d.error ?? `body-pad fill failed (HTTP ${res.status})`);
        return;
      }
      loadPackages();
      setPkgMsg(
        `✓ filled ${d.filled} empty mask${d.filled === 1 ? "" : "s"} with a body pad` +
          (d.skippedNoBody
            ? ` · ${d.skippedNoBody} skipped (no body dimensions)`
            : "") +
          ". Save to keep.",
      );
    } catch (e) {
      setPkgMsg("");
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
      if (
        editPackage.nozzleTips.length ||
        editPackage.bodyWidth ||
        editPackage.bodyHeight
      )
        await postPackages("/api/package", {
          id,
          nozzleTips: editPackage.nozzleTips,
          bodyWidth: editPackage.bodyWidth,
          bodyHeight: editPackage.bodyHeight,
        });
    } else {
      await postPackages("/api/package", {
        id,
        description: editPackage.description,
        nozzleTips: editPackage.nozzleTips,
        bodyWidth: editPackage.bodyWidth,
        bodyHeight: editPackage.bodyHeight,
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

  useEffect(() => {
    editFeederIdRef.current = editFeeder?.id ?? null;
  }, [editFeeder?.id]);

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
      peelTimeMsPerTenth: p.peelTimeMsPerTenth ?? 0,
    });
  };

  // Feed mode: Normal / SkipNext / Disable (Disable = pick-test without feeding).
  const setFeedOption = (feedOption: string) => {
    if (!editFeeder?.photon) return;
    postFeeder("/api/feeder/feedoption", { id: editFeeder.id, feedOption });
  };

  // Set uniform pick Z: writes offset.z = pickZ - slotZ (X/Y untouched).
  const setUniformPickZ = () => {
    if (!editFeeder?.photon) return;
    localStorage.setItem("viper.pickZ", String(pickZInput));
    postFeeder("/api/feeder/pickz", { id: editFeeder.id, pickZmm: pickZInput });
  };

  // Record this feeder's per-tape vision reference (camera must be centered on
  // the taught pocket). Result arrives via the feederVisionRecord WS event.
  const recordVisionRef = () => {
    if (!editFeeder?.photon) return;
    setFeederTeachBusy(true);
    setFeederTeachMsg("Recording vision reference…");
    fetch("/api/feeder/vision/record", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editFeeder.id }),
    }).catch((e) => {
      setFeederTeachBusy(false);
      setError(e instanceof Error ? e.message : String(e));
    });
  };

  // Re-derive pick offset from the stored vision reference (swap recovery).
  const relockVision = () => {
    if (!editFeeder?.photon) return;
    localStorage.setItem("viper.pickZ", String(pickZInput));
    setFeederTeachBusy(true);
    setFeederTeachMsg("Re-locking from vision reference…");
    fetch("/api/feeder/vision/relock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editFeeder.id, pickZmm: pickZInput }),
    }).catch((e) => {
      setFeederTeachBusy(false);
      setError(e instanceof Error ? e.message : String(e));
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

  const railScan = (onlyAddress?: number) => {
    setRailScanBusy(true);
    setRailScanMsg("starting…");
    fetch("/api/feeders/railscan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(onlyAddress ? { onlyAddress } : {}),
    })
      .then(async (r) => {
        if (!r.ok) {
          const e = await r.json().catch(() => ({}));
          throw new Error(e.error ?? `rail scan failed (${r.status})`);
        }
      })
      .catch((e) => {
        setRailScanBusy(false);
        setRailScanMsg(null);
        setError(e instanceof Error ? e.message : String(e));
      });
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

  // Resolve a teach "nozzle" action to the SELECTED nozzle so go/grab honors the
  // sidebar tool choice (N1 vs N2) instead of always using the default nozzle.
  const teachTool = (t: TeachTool): string =>
    t === "nozzle" && reference !== "camera" ? reference : t;

  const captureFeederLoc = (tool: TeachTool, target: TeachTarget) => {
    if (!editFeeder) return;
    postFeeder("/api/feeder/capture", {
      id: editFeeder.id,
      tool: teachTool(tool),
      target,
    });
  };

  const moveToFeederLoc = (tool: TeachTool, target: TeachTarget) => {
    if (!editFeeder) return;
    fetch("/api/feeder/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editFeeder.id, tool: teachTool(tool), target }),
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

  // Ordered tool cycle for the Numpad-9 hotkey: camera, then each nozzle.
  const toolIds = useMemo(
    () => ["camera", ...(inventory?.heads?.[0]?.nozzles ?? [])],
    [inventory],
  );

  // Keyboard jog and hotkeys. Keyed off e.code (physical key) so the numpad
  // works regardless of NumLock and never collides with the arrow cluster:
  //   Arrows      -> X/Y,  PageUp/PageDown -> Z
  //   Numpad 5    -> cycle step size
  //   Numpad 8    -> toggle step / continuous jog
  //   Numpad 9    -> cycle tool (camera -> N1 -> N2 -> ...)
  // Ignored while typing in a field or when a modifier is held, and gated on
  // the same enable state as the on-screen jog buttons. In continuous mode a
  // held X/Y key streams a velocity-blended jog from the backend (stop on
  // key-up); Z stays a discrete step.
  useEffect(() => {
    const MOVES: Record<string, { ax: "x" | "y" | "z"; dir: 1 | -1 }> = {
      ArrowUp: { ax: "y", dir: 1 },
      ArrowDown: { ax: "y", dir: -1 },
      ArrowRight: { ax: "x", dir: 1 },
      ArrowLeft: { ax: "x", dir: -1 },
      PageUp: { ax: "z", dir: 1 },
      PageDown: { ax: "z", dir: -1 },
    };
    const typing = (t: HTMLElement | null) => {
      const tag = t?.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        !!t?.isContentEditable
      );
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }
      if (typing(e.target as HTMLElement | null)) {
        return;
      }
      // Single-press hotkeys: ignore OS auto-repeat so a held key fires once.
      if (e.code === "Numpad5") {
        e.preventDefault();
        if (!e.repeat) {
          setStep((prev) => STEPS[(STEPS.indexOf(prev) + 1) % STEPS.length]);
        }
        return;
      }
      if (e.code === "Numpad8") {
        e.preventDefault();
        if (!e.repeat) {
          setContinuous((c) => !c);
        }
        return;
      }
      if (e.code === "Numpad9") {
        e.preventDefault();
        if (!e.repeat) {
          setReference((prev) => {
            const i = toolIds.indexOf(prev);
            return toolIds[(i + 1) % toolIds.length] ?? "camera";
          });
        }
        return;
      }
      const mv = MOVES[e.code];
      if (!mv) {
        return;
      }
      const allowed = mv.ax === "z" ? zcEnabled : enabled;
      if (!allowed) {
        return;
      }
      e.preventDefault();
      // OS auto-repeat never drives motion: step mode is one move per press,
      // and continuous mode streams from the backend once the key is down.
      if (e.repeat) {
        return;
      }
      // Continuous mode streams X/Y from the backend (smooth, velocity-blended)
      // while the key is held. Z is always a discrete step (its travel is too
      // short to stream), as is everything in step mode.
      if (continuous && mv.ax !== "z") {
        heldKeyRef.current = e.code;
        void post("/api/jog/stream/start", {
          dx: mv.ax === "x" ? mv.dir : 0,
          dy: mv.ax === "y" ? mv.dir : 0,
          speed,
          tool: reference,
          segmentMm: jogSeg,
          paceMs: jogPace,
        });
      } else {
        jog(mv.ax, mv.dir);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (heldKeyRef.current === e.code) {
        heldKeyRef.current = null;
        void post("/api/jog/stream/stop");
      }
    };
    const stopHold = () => {
      if (heldKeyRef.current) {
        heldKeyRef.current = null;
        void post("/api/jog/stream/stop");
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    // Losing focus (alt-tab) never delivers keyup, so stop any hold.
    window.addEventListener("blur", stopHold);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", stopHold);
      heldKeyRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, zcEnabled, step, speed, reference, continuous, toolIds, jogSeg, jogPace]);

  // Both moves operate on the SELECTED nozzle, so both need a nozzle selected
  // (not the camera). Pick N1 or N2, then move the camera to it or it to the camera.
  const camToNozEnabled = enabled && !isCamera;
  const nozToCamEnabled = enabled && !isCamera;
  const refOptions = [
    { id: "camera", label: `Camera: ${cameraName}` },
    ...(inventory?.heads?.[0]?.nozzles ?? []).map((n, i) => ({
      id: n,
      label: `Nozzle ${i + 1}`,
    })),
  ];
  // Feeder part dropdown: canonical (merged) parts only, no fiducials,
  // sorted for scanning by eye. Falls back to the plain id list until the
  // detailed list has loaded.
  const feederPartOptions =
    partsDetail.length > 0
      ? partsDetail
          .filter((p) => !p.fiducial)
          .map((p) => p.id)
          .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
      : parts;
  // Substring filters for the list tabs. A single run of characters is matched
  // anywhere across the row's text fields (ids are named inconsistently, so we
  // search the whole thing, not a prefix).
  const partQuery = partSearch.trim().toLowerCase();
  const filteredParts = partQuery
    ? partsDetail.filter((p) =>
        `${p.id} ${p.name ?? ""} ${p.package ?? ""}`
          .toLowerCase()
          .includes(partQuery),
      )
    : partsDetail;
  const feederQuery = feederSearch.trim().toLowerCase();
  const filteredFeeders = feederQuery
    ? feeders.filter((f) =>
        `${f.id} ${f.name} ${f.part ?? ""} ${f.type}`
          .toLowerCase()
          .includes(feederQuery),
      )
    : feeders;
  const pkgQuery = pkgSearch.trim().toLowerCase();
  const filteredPackages = pkgQuery
    ? packages.filter((p) =>
        `${p.id} ${p.description ?? ""}`.toLowerCase().includes(pkgQuery),
      )
    : packages;
  // The selected tool's own coordinates: on a seesaw-Z machine the nozzles'
  // Z axes are mapped/inverted, so the DRO must show the SELECTED nozzle,
  // not the default one.
  const droTool = isCamera
    ? null
    : (pos?.tools?.find((t) => t.name === reference || t.id === reference) ??
      null);
  // Reticle rotation follows the selected tool, like OpenPnP's CameraView
  // (camera selected → 0°; nozzles have independent rotation axes).
  const toolC = isCamera ? 0 : (droTool?.c ?? pos?.c ?? 0);

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
            ].map((c) => {
              const cam = cameras.find((x) => x.name === c.name);
              const live = cam?.bound;
              return (
                <div key={c.key} className="camera-cell">
                  <div className="camera-sublabel">
                    {c.name}
                    {cam?.lightId && (
                      <button
                        className={`cam-light-btn ${
                          camLights[cam.lightId] ? "on" : ""
                        }`}
                        disabled={!enabled}
                        onClick={() => toggleCamLight(cam.lightId!)}
                        title={
                          enabled
                            ? "Toggle the camera light"
                            : "Connect the machine to switch the light"
                        }
                      >
                        LED
                      </button>
                    )}
                  </div>
                  <div
                    className={`camera-view${live ? " cam-zoomable" : ""}`}
                    title={live ? "Click to enlarge (with crosshair)" : undefined}
                    onClick={() => live && cam && setZoomPane(cam.id)}
                  >
                    {live && cam && (
                      <CameraFeed
                        key={cam.id}
                        id={cam.id}
                        w={480}
                        className="camera-live"
                        zoomable={false}
                      />
                    )}
                    {live && cam && visionFlash[cam.id] && visionFrames[cam.id] && (
                      <>
                        <img
                          className="camera-live vision-overlay"
                          src={`/api/vision/image?camera=${cam.id}&seq=${visionFrames[cam.id].seq}`}
                          alt=""
                          draggable={false}
                        />
                        <span className="vision-tag">vision</span>
                      </>
                    )}
                    <svg
                      className="reticle"
                      viewBox="0 0 200 150"
                      preserveAspectRatio="xMidYMid meet"
                    >
                      {/* Crosshair rotates with the selected tool (screen
                          coords are Y-down, so negate like OpenPnP does).
                          The north arm is drawn in a contrasting color so
                          rotation is readable at a glance. */}
                      <g transform={`rotate(${-toolC} 100 75)`}>
                        <line x1="100" y1="75" x2="194" y2="75" />
                        <line x1="100" y1="75" x2="6" y2="75" />
                        <line x1="100" y1="75" x2="100" y2="144" />
                        <line
                          className="reticle-n"
                          x1="100"
                          y1="75"
                          x2="100"
                          y2="6"
                        />
                        <circle cx="100" cy="75" r="26" />
                      </g>
                    </svg>
                    {!live && <span className="camera-hint">no camera bound</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {zoomPane &&
          (() => {
            const cam = cameras.find((x) => x.id === zoomPane);
            if (!cam) return null;
            return (
              <div
                className="cam-lightbox"
                title="Click to close"
                onClick={() => setZoomPane(null)}
              >
                <div className="camera-view camera-view-zoom">
                  <CameraFeed
                    id={cam.id}
                    w={1280}
                    className="camera-live"
                    zoomable={false}
                  />
                  {visionFlash[cam.id] && visionFrames[cam.id] && (
                    <img
                      className="camera-live vision-overlay"
                      src={`/api/vision/image?camera=${cam.id}&seq=${visionFrames[cam.id].seq}`}
                      alt=""
                      draggable={false}
                    />
                  )}
                  <svg
                    className="reticle"
                    viewBox="0 0 200 150"
                    preserveAspectRatio="xMidYMid meet"
                  >
                    <g transform={`rotate(${-toolC} 100 75)`}>
                      <line x1="100" y1="75" x2="194" y2="75" />
                      <line x1="100" y1="75" x2="6" y2="75" />
                      <line x1="100" y1="75" x2="100" y2="144" />
                      <line
                        className="reticle-n"
                        x1="100"
                        y1="75"
                        x2="100"
                        y2="6"
                      />
                      <circle cx="100" cy="75" r="26" />
                    </g>
                  </svg>
                </div>
              </div>
            );
          })()}

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
              <button
                className="jbtn jpark"
                onClick={() => park("all")}
                disabled={!teachReady}
                title={
                  teachReady
                    ? "Park the head (raises to safe Z first, then X/Y)"
                    : "enable + home the machine first"
                }
              >
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
              <button
                className="jbtn jpark"
                onClick={() => park("z")}
                disabled={!enabled}
                title="Raise all nozzles to safe Z (works before homing — crash recovery)"
              >
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
              <button
                className={`chip-btn jog-mode ${continuous ? "cont" : ""}`}
                onClick={() => setContinuous((c) => !c)}
                title="Toggle step / continuous jog (Numpad 8). Continuous jogs while a direction key is held."
              >
                {continuous ? "Cont." : "Step"}
              </button>
              {continuous && (
                <div className="jog-tune">
                  <label title="Distance per streamed segment (mm). Bigger = faster, longer coast on release.">
                    <span>Seg</span>
                    <NumberInput
                      min={0.1}
                      step={0.1}
                      value={jogSeg}
                      onChange={(v) => setJogSeg(Math.max(0.1, v))}
                    />
                  </label>
                  <label title="Pause between segments (ms). 0 = smoothest (keeps the controller buffer full); higher trims the release coast but can bring back the accel/decel pulsing.">
                    <span>Pace</span>
                    <NumberInput
                      min={0}
                      step={1}
                      value={jogPace}
                      onChange={(v) => setJogPace(Math.max(0, v))}
                    />
                  </label>
                </div>
              )}
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
                title="Move the selected nozzle to the camera location"
                aria-label="Move the selected nozzle to the camera location"
              >
                <NozzleIcon size={22} />
              </button>
              <button
                className="jbtn cn-btn cn-cam"
                onClick={cameraToNozzle}
                disabled={!camToNozEnabled}
                title="Move the camera to the selected nozzle location"
                aria-label="Move the camera to the selected nozzle location"
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
            <button
              className="jbtn jpark"
              onClick={() => park("c")}
              disabled={!enabled}
              title="Rotate the selected nozzle to 0°"
            >
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
              <span className="dro-val">
                {droTool ? droTool[ax].toFixed(2) : pos ? pos[ax].toFixed(2) : "—"}
              </span>
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
          {error && (
            <div className="banner banner-warn">
              <span style={{ flex: 1 }}>{error}</span>
              <button
                className="icon-btn"
                onClick={() => setError(null)}
                title="Dismiss"
                style={{ marginLeft: 8 }}
              >
                ✕
              </button>
            </div>
          )}
          {online && enabled && !homed && (
            <div className="banner">
              <span style={{ flex: 1 }}>
                Machine not homed — jog and Z-park work, but teach, calibrate
                and capture controls are disabled until you home.
              </span>
              <button
                className="btn btn-primary"
                onClick={home}
                style={{ marginLeft: 8 }}
              >
                Home now
              </button>
            </div>
          )}

          {tab === "log" && (
            <section className="card log-card">
              <div className="log-controls">
                <label className="loc-field">
                  <span>Level</span>
                  <select
                    className="type-select"
                    value={logLevel}
                    onChange={(e) => setLogLevel(e.currentTarget.value)}
                  >
                    <option value="TRACE">Trace</option>
                    <option value="DEBUG">Debug</option>
                    <option value="INFO">Info</option>
                    <option value="WARNING">Warning</option>
                    <option value="ERROR">Error</option>
                  </select>
                </label>
                <button
                  className="btn btn-sm"
                  onClick={() => setLogPaused((p) => !p)}
                >
                  {logPaused ? "▶ Resume" : "⏸ Pause"}
                </button>
                <button
                  className="btn btn-sm"
                  onClick={() => setLogLines([])}
                >
                  Clear view
                </button>
                <button
                  className="btn btn-sm"
                  onClick={downloadLog}
                  disabled={logLines.length === 0}
                >
                  ⭳ Download
                </button>
                <input
                  className="import-input"
                  style={{ flex: "1 1 160px", minWidth: 120 }}
                  placeholder="Search…"
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.currentTarget.value)}
                />
                <span className="muted">
                  {(() => {
                    const shown = logSearch
                      ? logLines.filter((l) =>
                          l.text.toLowerCase().includes(logSearch.toLowerCase()),
                        ).length
                      : logLines.length;
                    return `${shown}${logSearch ? `/${logLines.length}` : ""} lines${logPaused ? " · paused" : " · live"}`;
                  })()}
                </span>
              </div>
              <div className="log-view" ref={logViewRef}>
                {(() => {
                  const shown = logSearch
                    ? logLines.filter((l) =>
                        l.text.toLowerCase().includes(logSearch.toLowerCase()),
                      )
                    : logLines;
                  if (shown.length === 0) {
                    return (
                      <div className="muted">
                        {logSearch
                          ? "No lines match the search."
                          : "No log lines at this level yet."}
                      </div>
                    );
                  }
                  return shown.map((l, i) => (
                    <div
                      key={i}
                      className={`log-line log-${l.level.toLowerCase()}`}
                    >
                      {l.text}
                    </div>
                  ));
                })()}
              </div>
            </section>
          )}

          {tab === "panels" && (
            <section className="card">
              <h2>Panelize</h2>
              <p className="muted" style={{ marginBottom: 12 }}>
                Add an array of one board across a job on a grid. Each copy is a
                real board the job places. (Shared panel-fiducial alignment is a
                follow-on; for now each board aligns from its own fiducials.)
              </p>
              <div className="field-grid">
                <label className="loc-field" style={{ gridColumn: "span 2" }}>
                  <span>Board to array</span>
                  <select
                    className="type-select"
                    value={panelBoard}
                    onChange={(e) => setPanelBoard(e.currentTarget.value)}
                  >
                    <option value="">— pick a board —</option>
                    {boards
                      .filter((b) => b.file)
                      .map((b) => (
                        <option key={b.file} value={b.file ?? ""}>
                          {b.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="loc-field" style={{ gridColumn: "span 2" }}>
                  <span>Into job</span>
                  <select
                    className="type-select"
                    value={panelJob || activeJobFile || ""}
                    onChange={(e) => setPanelJob(e.currentTarget.value)}
                  >
                    <option value="">
                      {activeJobFile ? "Active job" : "— pick a job —"}
                    </option>
                    {jobs
                      .filter((jb) => jb.file)
                      .map((jb) => (
                        <option key={jb.file} value={jb.file ?? ""}>
                          {jb.name}
                          {jb.active ? " (active)" : ""}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="loc-field">
                  <span>Columns</span>
                  <NumberInput
                    min={1}
                    value={panelCols}
                    onChange={(v) => setPanelCols(v)}
                  />
                </label>
                <label className="loc-field">
                  <span>Rows</span>
                  <NumberInput
                    min={1}
                    value={panelRows}
                    onChange={(v) => setPanelRows(v)}
                  />
                </label>
                <label className="loc-field">
                  <span>X pitch (mm)</span>
                  <NumberInput
                    step={0.1}
                    value={panelXPitch}
                    onChange={(v) => setPanelXPitch(v)}
                  />
                </label>
                <label className="loc-field">
                  <span>Y pitch (mm)</span>
                  <NumberInput
                    step={0.1}
                    value={panelYPitch}
                    onChange={(v) => setPanelYPitch(v)}
                  />
                </label>
                <label className="loc-field">
                  <span>Origin X (mm)</span>
                  <NumberInput
                    step={0.1}
                    value={panelX0}
                    onChange={(v) => setPanelX0(v)}
                  />
                </label>
                <label className="loc-field">
                  <span>Origin Y (mm)</span>
                  <NumberInput
                    step={0.1}
                    value={panelY0}
                    onChange={(v) => setPanelY0(v)}
                  />
                </label>
                <label className="loc-field">
                  <span>Side</span>
                  <select
                    className="type-select"
                    value={panelSide}
                    onChange={(e) => setPanelSide(e.currentTarget.value)}
                  >
                    <option value="Top">Top</option>
                    <option value="Bottom">Bottom</option>
                  </select>
                </label>
              </div>
              <div className="teach-actions" style={{ marginTop: 12 }}>
                <button className="btn btn-primary" onClick={applyPanelize}>
                  Add {panelRows * panelCols} boards to job
                </button>
              </div>
              {panelMsg && (
                <div className="teach-head" style={{ marginTop: 8 }}>
                  {panelMsg}
                </div>
              )}
            </section>
          )}

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
            <section className="card jobs-page">
              <div className="jobs-toolbar">
                <div className="run-group">
                  {jobRunning ? (
                    <button className="btn btn-danger" onClick={abortJob}>
                      ■ Stop
                    </button>
                  ) : (
                    <>
                      <button
                        className="btn btn-primary"
                        onClick={runJob}
                        disabled={!enabled || !activeJobFile}
                        title={!enabled ? "Connect the machine to run" : "Run the job"}
                      >
                        ▶ Run
                      </button>
                      <button
                        className="btn"
                        onClick={stepJob}
                        disabled={!enabled || !activeJobFile}
                        title="Advance one step"
                      >
                        ⏭ Step
                      </button>
                      {jobStepping && (
                        <button className="btn btn-danger" onClick={abortJob}>
                          ■ Stop
                        </button>
                      )}
                    </>
                  )}
                  <label
                    className="run-toggle"
                    title="On a feeder fault, retry then skip and keep going, instead of pausing."
                  >
                    <input
                      type="checkbox"
                      checked={keepGoing}
                      disabled={jobRunning}
                      onChange={(e) => setKeepGoing(e.currentTarget.checked)}
                    />
                    Keep going
                  </label>
                  {(jobRunning || jobStepping) && (
                    <span className="run-live">
                      <span className="run-dot" /> {jobStatus}
                    </span>
                  )}
                </div>
                <div className="job-picker">
                  <select
                    className="type-select"
                    value={activeJobFile ?? ""}
                    onChange={(e) => selectJob(e.currentTarget.value || null)}
                  >
                    <option value="">— no active job —</option>
                    {jobs.map((j) => (
                      <option key={j.file ?? j.name} value={j.file ?? ""}>
                        {j.name}
                        {j.dirty ? " •" : ""}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn btn-sm"
                    onClick={() => {
                      setNewJobName("");
                      setJobErr("");
                      setNewJobOpen(true);
                    }}
                  >
                    + New
                  </button>
                  <button
                    className="btn btn-sm"
                    disabled={!activeJobFile}
                    onClick={() => {
                      const a = jobs.find((j) => j.active);
                      if (a) {
                        setRenameJobName(a.name);
                        setJobErr("");
                        setRenameJobTarget(a);
                      }
                    }}
                  >
                    Rename
                  </button>
                  <button
                    className="btn btn-sm btn-trash"
                    disabled={!activeJobFile}
                    onClick={() => {
                      const a = jobs.find((j) => j.active);
                      if (a) setRemoveJobTarget(a);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>

              {jobErr && <div className="banner banner-warn">{jobErr}</div>}
              {!jobRunning &&
                !jobStepping &&
                jobStatus &&
                jobSkipped !== null && (
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
                            {s.reason && (
                              <div className="skip-reason">{s.reason}</div>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

              {!activeJobFile ? (
                <div className="muted jobs-empty">
                  {jobs.length === 0
                    ? "No jobs yet. Create one, then add boards to it."
                    : "Pick an active job above (or create one)."}
                </div>
              ) : (
                <>
                  <div className="pane-head">
                    <span className="pane-title">Boards</span>
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
                      className="btn btn-sm btn-primary"
                      onClick={addBoardToJob}
                      disabled={!addBoardSel}
                    >
                      + Add board
                    </button>
                  </div>
                  <div className="ptable-wrap">
                    <table className="ptable jobs-boards">
                      <thead>
                        <tr>
                          <th>Id</th>
                          <th>Name</th>
                          <th>Side</th>
                          <th>X</th>
                          <th>Y</th>
                          <th>Z</th>
                          <th>Rot</th>
                          <th>En</th>
                          <th>Fid</th>
                          <th>Align</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {jobBoards.length === 0 && (
                          <tr>
                            <td colSpan={11} className="muted">
                              No boards in this job — add one above.
                            </td>
                          </tr>
                        )}
                        {jobBoards.map((b) => (
                          <tr
                            key={b.uid}
                            className={
                              selectedBoardUid === b.uid ? "sel-row" : ""
                            }
                            onClick={() => setSelectedBoardUid(b.uid)}
                          >
                            <td className="mono">{b.uid}</td>
                            <td className="mono">{b.boardName}</td>
                            <td onClick={(e) => e.stopPropagation()}>
                              <select
                                className="cell-select"
                                value={b.side}
                                onChange={(e) =>
                                  updateJobBoard(b.uid, {
                                    side: e.currentTarget.value,
                                  })
                                }
                              >
                                <option value="Top">Top</option>
                                <option value="Bottom">Bottom</option>
                              </select>
                            </td>
                            {(["x", "y", "z", "rotation"] as const).map((k) => (
                              <td key={k} onClick={(e) => e.stopPropagation()}>
                                <input
                                  key={`${b.uid}-${k}-${b[k]}`}
                                  type="number"
                                  className="cell-num"
                                  defaultValue={b[k]}
                                  onBlur={(e) => {
                                    const v = parseFloat(e.currentTarget.value);
                                    if (!Number.isNaN(v) && v !== b[k])
                                      updateJobBoard(b.uid, { [k]: v });
                                  }}
                                />
                              </td>
                            ))}
                            <td onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={b.enabled}
                                onChange={(e) =>
                                  updateJobBoard(b.uid, {
                                    enabled: e.currentTarget.checked,
                                  })
                                }
                              />
                            </td>
                            <td onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={b.checkFids}
                                onChange={(e) =>
                                  updateJobBoard(b.uid, {
                                    checkFids: e.currentTarget.checked,
                                  })
                                }
                              />
                            </td>
                            <td onClick={(e) => e.stopPropagation()}>
                              <button
                                className="btn btn-sm"
                                onClick={() =>
                                  alignUid === b.uid
                                    ? setAlignUid(null)
                                    : openAlign(b.uid)
                                }
                                title="Fiducial-align this board"
                              >
                                {b.aligned ? `${b.alignAngle}°` : "align"}
                              </button>
                            </td>
                            <td
                              className="row-actions"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                className="btn btn-sm btn-icon"
                                onClick={() => teachJobBoard(b.uid, false)}
                                disabled={!teachReady}
                                title={
                                  teachReady
                                    ? "Jog camera to board origin"
                                    : teachHint
                                }
                              >
                                <CrosshairIcon size={14} />
                              </button>
                              <button
                                className="btn btn-sm btn-icon"
                                onClick={() => teachJobBoard(b.uid, true)}
                                disabled={!teachReady}
                                title={
                                  teachReady
                                    ? "Set origin from camera"
                                    : teachHint
                                }
                              >
                                <CameraIcon size={14} />
                              </button>
                              <button
                                className="btn btn-sm btn-icon btn-trash"
                                onClick={() => removeBoardFromJob(b.uid)}
                                title="Remove board from job"
                              >
                                <TrashIcon size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {alignUid && jobBoards.some((b) => b.uid === alignUid) && (
                    <div className="detect-grp align-panel">
                      <div className="detect-title">
                        Fiducial alignment —{" "}
                        {jobBoards.find((b) => b.uid === alignUid)?.boardName} —
                        capture ≥2 fiducials, then compute
                        {!teachReady && (
                          <span className="cam-unbound-tag">
                            {" "}
                            · {!enabled
                              ? "machine offline — connect to move"
                              : "not homed — home first"}
                          </span>
                        )}
                      </div>
                      {alignFids.length === 0 ? (
                        <div className="muted">
                          No fiducials on this board. Mark placements as type
                          Fiducial below (IDs starting FID auto-label).
                        </div>
                      ) : (
                        <>
                          {alignFids.map((f) => {
                            const cap = alignMeasured[f.id];
                            return (
                              <div key={f.id} className="align-fid-row">
                                <span className="mono align-fid-id">{f.id}</span>
                                <span className="muted align-fid-xy">
                                  design ({f.x}, {f.y})
                                </span>
                                <button
                                  className="btn btn-sm"
                                  onClick={() => alignGo(f.id)}
                                  disabled={!teachReady}
                                  title={
                                    teachReady
                                      ? "Jog the camera to this fiducial's expected location"
                                      : teachHint
                                  }
                                >
                                  <CrosshairIcon size={12} /> Go
                                </button>
                                <button
                                  className="btn btn-sm"
                                  onClick={() => alignCapture(f.id)}
                                  disabled={!teachReady}
                                  title={
                                    teachReady
                                      ? "Capture the current camera position for this fiducial"
                                      : teachHint
                                  }
                                >
                                  <CameraIcon size={12} /> Capture
                                </button>
                                <span
                                  className={`align-fid-cap ${cap ? "ok" : ""}`}
                                >
                                  {cap
                                    ? `✓ (${cap.x}, ${cap.y})`
                                    : "not captured"}
                                </span>
                              </div>
                            );
                          })}
                          <div className="teach-actions align-actions">
                            <button
                              className="btn btn-sm btn-primary"
                              onClick={computeAlign}
                              disabled={Object.keys(alignMeasured).length < 2}
                            >
                              Compute alignment (
                              {Object.keys(alignMeasured).length})
                            </button>
                            <button
                              className="btn btn-sm"
                              onClick={() => autoAlign(alignUid)}
                              disabled={!teachReady}
                              title={
                                teachReady
                                  ? "Auto-locate fiducials by camera vision"
                                  : teachHint
                              }
                            >
                              Auto (vision)
                            </button>
                            <button
                              className="btn btn-sm"
                              onClick={() => clearAlign(alignUid)}
                            >
                              Clear
                            </button>
                          </div>
                          {alignResult && (
                            <div
                              className={`banner ${
                                (alignResult.residual ?? 0) > 0.5
                                  ? "banner-warn"
                                  : "banner-ok"
                              }`}
                            >
                              {alignResult.residual != null
                                ? `Aligned from ${alignResult.points} fiducials — rotation ${alignResult.angle}°, residual ${alignResult.residual} mm`
                                : `Vision alignment applied — board rotation ${alignResult.angle}°`}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {selectedBoard && !mpbActive && (
                    <div className="mpb-launch">
                      <button
                        className="btn btn-sm"
                        onClick={openMpb}
                        title="Set the board location from 3+ ordinary placements: visit each, jog the camera to its true center, capture. No dedicated fiducials needed."
                      >
                        <CrosshairIcon size={12} /> Set location by placements
                      </button>
                    </div>
                  )}

                  {mpbActive && selectedBoard && (
                    <div className="detect-grp align-panel">
                      <div className="detect-title">
                        Set board location by placements —{" "}
                        {selectedBoard.boardName}
                        {!teachReady && (
                          <span className="cam-unbound-tag">
                            {" "}
                            · {!enabled
                              ? "machine offline — connect to move"
                              : "not homed — home first"}
                          </span>
                        )}
                      </div>
                      {mpbPhase === "select" && (
                        <>
                          <div className="muted mpb-hint">
                            Pick 3+ placements spread across the board (corners
                            work best). The camera visits each; jog to its true
                            center and capture.
                          </div>
                          <div className="mpb-picklist">
                            {jobBoardPlc.map((p) => (
                              <label key={p.id} className="mpb-pick">
                                <input
                                  type="checkbox"
                                  checked={mpbSel.includes(p.id)}
                                  onChange={() => toggleMpbSel(p.id)}
                                />
                                <span className="mono mpb-pick-id">{p.id}</span>
                                <span className="muted mpb-pick-xy">
                                  {p.part ?? ""} ({p.x}, {p.y})
                                </span>
                              </label>
                            ))}
                          </div>
                          <div className="teach-actions align-actions">
                            <button
                              className="btn btn-sm btn-primary"
                              onClick={startMpbWalk}
                              disabled={mpbSel.length < 2 || !teachReady}
                            >
                              Start ({mpbSel.length})
                            </button>
                            {mpbSel.length > 0 && mpbSel.length < 3 && (
                              <span className="muted">3+ recommended</span>
                            )}
                            <button className="btn btn-sm" onClick={closeMpb}>
                              Cancel
                            </button>
                          </div>
                        </>
                      )}
                      {mpbPhase === "walk" && (
                        <>
                          <div className="mpb-step">
                            Point {mpbStep + 1} of {mpbSel.length}:{" "}
                            <span className="mono">{mpbSel[mpbStep]}</span>
                            {mpbMeasured[mpbSel[mpbStep]] && (
                              <span className="align-fid-cap ok"> ✓ captured</span>
                            )}
                          </div>
                          <div className="muted mpb-hint">
                            Jog the camera to the true center of this footprint,
                            then Capture.
                          </div>
                          <div className="teach-actions align-actions">
                            <button
                              className="btn btn-sm"
                              onClick={() => mpbGo(mpbStep)}
                              disabled={!teachReady}
                            >
                              <CrosshairIcon size={12} /> Go here
                            </button>
                            <button
                              className="btn btn-sm btn-primary"
                              onClick={mpbCapture}
                              disabled={!teachReady}
                            >
                              <CameraIcon size={12} /> Capture center
                            </button>
                            <button className="btn btn-sm" onClick={closeMpb}>
                              Cancel
                            </button>
                          </div>
                          <div className="muted mpb-progress">
                            {Object.keys(mpbMeasured).length}/{mpbSel.length}{" "}
                            captured
                          </div>
                        </>
                      )}
                      {mpbPhase === "done" && (
                        <>
                          {mpbResult && (
                            <div
                              className={`banner ${
                                (mpbResult.residual ?? 0) > 0.5
                                  ? "banner-warn"
                                  : "banner-ok"
                              }`}
                            >
                              {mpbResult.residual != null
                                ? `Board located from ${mpbResult.points} placements — rotation ${mpbResult.angle}°, residual ${mpbResult.residual} mm`
                                : `Board located — rotation ${mpbResult.angle}°`}
                            </div>
                          )}
                          <div className="teach-actions align-actions">
                            <button className="btn btn-sm" onClick={closeMpb}>
                              Done
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  <div className="pane-head pane-head-plc">
                    <span className="pane-title">
                      Placements
                      {selectedBoard ? ` — ${selectedBoard.boardName}` : ""}
                    </span>
                    <button
                      className="btn btn-sm"
                      onClick={addJobPlacement}
                      disabled={!selectedBoard}
                    >
                      + Add
                    </button>
                    <button
                      className="btn btn-sm"
                      disabled={!selectedBoard || jobRunning}
                      title="Clear the placed checkmarks on this board — use when loading a fresh blank board so the job places everything again"
                      onClick={async () => {
                        if (!jobEditFile || !selectedBoardUid) return;
                        if (
                          !window.confirm(
                            "Reset placed status for this board? The next run will place ALL placements again.",
                          )
                        )
                          return;
                        try {
                          const r = await fetch("/api/job/board/placed/reset", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              file: jobEditFile,
                              uid: selectedBoardUid,
                            }),
                          });
                          const d = await r.json();
                          if (!r.ok) {
                            setJobErr(d.error ?? "reset failed");
                            return;
                          }
                          setPlcRefresh((n) => n + 1);
                          loadJobs();
                        } catch (e) {
                          setJobErr(e instanceof Error ? e.message : String(e));
                        }
                      }}
                    >
                      ↺ Reset placed
                    </button>
                    <div className="plc-search">
                      <SearchIcon size={13} />
                      <input
                        className="plc-search-input"
                        placeholder="search id / part"
                        value={plcSearch}
                        onChange={(e) => setPlcSearch(e.currentTarget.value)}
                      />
                    </div>
                  </div>
                  <div className="ptable-wrap plc-scroll">
                    <table className="ptable jobs-plc">
                      <thead>
                        <tr>
                          <th>
                            <input
                              type="checkbox"
                              title="Enable/disable ALL placements shown below (respects the search filter)"
                              checked={
                                filteredJobPlc.length > 0 &&
                                filteredJobPlc.every((p) => p.enabled)
                              }
                              onChange={(e) =>
                                setAllJobPlacements(
                                  filteredJobPlc.map((p) => p.id),
                                  e.currentTarget.checked,
                                )
                              }
                            />{" "}
                            En
                          </th>
                          <th>ID</th>
                          <th>Part</th>
                          <th>Side</th>
                          <th>X</th>
                          <th>Y</th>
                          <th>Rot</th>
                          <th>Type</th>
                          <th>Placed</th>
                          <th>Status</th>
                          <th>Err</th>
                          <th>Comments</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {!selectedBoard && (
                          <tr>
                            <td colSpan={13} className="muted">
                              Select a board above to see its placements.
                            </td>
                          </tr>
                        )}
                        {filteredJobPlc.map((p) => (
                            <tr
                              key={p.id}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                setPlcMenu({
                                  x: e.clientX,
                                  y: e.clientY,
                                  id: p.id,
                                });
                              }}
                            >
                              <td>
                                <input
                                  type="checkbox"
                                  checked={p.enabled}
                                  onChange={(e) =>
                                    editJobPlacement(p.id, {
                                      enabled: e.currentTarget.checked,
                                    })
                                  }
                                />
                              </td>
                              <td className="mono">{p.id}</td>
                              <td>
                                <select
                                  className="cell-select"
                                  value={p.part ?? ""}
                                  onChange={(e) =>
                                    editJobPlacement(p.id, {
                                      partId: e.currentTarget.value,
                                    })
                                  }
                                >
                                  <option value="">— none —</option>
                                  {partsDetail.map((pt) => (
                                    <option key={pt.id} value={pt.id}>
                                      {pt.id}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                <select
                                  className="cell-select"
                                  value={p.side ?? "Top"}
                                  onChange={(e) =>
                                    editJobPlacement(p.id, {
                                      side: e.currentTarget.value,
                                    })
                                  }
                                >
                                  <option value="Top">Top</option>
                                  <option value="Bottom">Bottom</option>
                                </select>
                              </td>
                              {(["x", "y", "rot"] as const).map((k) => (
                                <td key={k}>
                                  <input
                                    key={`${p.id}-${k}-${p[k]}`}
                                    type="number"
                                    className="cell-num"
                                    defaultValue={p[k]}
                                    onBlur={(e) => {
                                      const v = parseFloat(
                                        e.currentTarget.value,
                                      );
                                      if (!Number.isNaN(v) && v !== p[k])
                                        editJobPlacement(p.id, { [k]: v });
                                    }}
                                  />
                                </td>
                              ))}
                              <td>
                                <select
                                  className="cell-select"
                                  value={p.type}
                                  onChange={(e) =>
                                    editJobPlacement(p.id, {
                                      type: e.currentTarget.value,
                                    })
                                  }
                                >
                                  <option value="Placement">Placement</option>
                                  <option value="Fiducial">Fiducial</option>
                                </select>
                              </td>
                              <td className="cell-center">
                                {p.placed ? "✓" : ""}
                              </td>
                              <td>
                                <span
                                  className={`plc-status status-${(
                                    p.status ?? "ready"
                                  )
                                    .toLowerCase()
                                    .replace(/ /g, "-")}`}
                                >
                                  {p.status}
                                </span>
                              </td>
                              <td>
                                <select
                                  className="cell-select"
                                  value={p.errorHandling ?? "Default"}
                                  onChange={(e) =>
                                    editJobPlacement(p.id, {
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
                              </td>
                              <td>
                                <input
                                  key={`${p.id}-cmt-${p.comments ?? ""}`}
                                  className="cell-text"
                                  defaultValue={p.comments ?? ""}
                                  onBlur={(e) => {
                                    if (
                                      e.currentTarget.value !==
                                      (p.comments ?? "")
                                    )
                                      editJobPlacement(p.id, {
                                        comments: e.currentTarget.value,
                                      });
                                  }}
                                />
                              </td>
                              <td className="row-actions">
                                <button
                                  className="btn btn-sm btn-icon btn-trash"
                                  onClick={() => deleteJobPlacement(p.id)}
                                  title="Delete placement"
                                >
                                  <TrashIcon size={13} />
                                </button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>
          )}

          {tab === "vision" && (
            <section className="card">
              <div className="board-head">
                <h2>Vision</h2>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    setVisionTest("running…");
                    fetch("/api/vision/test/fiducial", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: "{}",
                    }).catch((e) =>
                      setVisionTest(e instanceof Error ? e.message : String(e)),
                    );
                  }}
                  disabled={!enabled}
                  title={
                    enabled
                      ? "Run the fiducial pipeline on the top camera's current view (no motion)"
                      : "Connect the machine first"
                  }
                >
                  Test fiducial pipeline on current view
                </button>
              </div>
              <p className="muted job-hint">
                Every vision operation (visual homing, fiducial align, bottom
                vision) publishes its processed working image here — masks and
                detections included. The test runs the fiducial pipeline against
                whatever the top camera sees right now, without moving.
              </p>
              {visionTest && (
                <div
                  className={`banner ${
                    visionTest.startsWith("✗") ? "banner-warn" : "banner-ok"
                  }`}
                >
                  {visionTest}
                </div>
              )}
              <div className="vision-frames">
                {cameras.map((c) => {
                  const f = visionFrames[c.id];
                  return (
                    <div key={c.id} className="vision-frame">
                      <div className="pane-head">
                        <span className="pane-title">{c.name}</span>
                        {f && (
                          <span className="muted vision-caption">{f.text}</span>
                        )}
                      </div>
                      {f ? (
                        <img
                          className="vision-img"
                          src={`/api/vision/image?camera=${c.id}&seq=${f.seq}`}
                          alt={c.name}
                          draggable={false}
                        />
                      ) : (
                        <div className="muted vision-empty">
                          No vision image yet — run a vision operation or the
                          pipeline test.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="pane-head pane-head-plc">
                <span className="pane-title">Pick &amp; align test</span>
              </div>
              <p className="muted job-hint">
                Run every part in turn: step to a feeder, Pick, Hold over camera,
                then tune its bottom-vision pipeline with the real part in view.
                With “keep over camera” on, Align leaves the part parked so you
                can adjust and re-Align without it retreating. Discard drops it,
                then step to the next part.
              </p>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <button
                  className="btn btn-sm"
                  onClick={() => stepPart(-1)}
                  disabled={feeders.filter((f) => f.part).length === 0}
                  title="Previous part (feeder)"
                  aria-label="Previous part"
                >
                  ◀
                </button>
                <select
                  className="type-select"
                  value={pickFeederId}
                  onChange={(e) => setPickFeederId(e.currentTarget.value)}
                >
                  <option value="">— feeder —</option>
                  {feeders
                    .filter((f) => f.part)
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} — {f.part}
                      </option>
                    ))}
                </select>
                <button
                  className="btn btn-sm"
                  onClick={() => stepPart(1)}
                  disabled={feeders.filter((f) => f.part).length === 0}
                  title="Next part (feeder)"
                  aria-label="Next part"
                >
                  ▶
                </button>
                <select
                  className="type-select"
                  value={pickNozzleId}
                  onChange={(e) => setPickNozzleId(e.currentTarget.value)}
                >
                  <option value="">— nozzle —</option>
                  {nozzles.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.name} ({n.tip ?? "no tip"})
                    </option>
                  ))}
                </select>
                <button
                  className="btn btn-primary"
                  disabled={!teachReady || !pickFeederId || !pickNozzleId}
                  title={
                    teachReady
                      ? "Feed the feeder and pick a part (with vacuum checks)"
                      : "enable + home the machine first"
                  }
                  onClick={() => pickTest("pick")}
                >
                  Pick
                </button>
                <button
                  className="btn"
                  disabled={!teachReady || !pickNozzleId}
                  title={
                    teachReady
                      ? "Park the picked part over the bottom camera and hold it there for tuning"
                      : "enable + home the machine first"
                  }
                  onClick={() => pickTest("hold")}
                >
                  Hold over camera
                </button>
                <button
                  className="btn btn-primary"
                  disabled={!teachReady || !pickNozzleId}
                  title={
                    teachReady
                      ? "Bottom-vision align the part on the nozzle (watch the frames above)"
                      : "enable + home the machine first"
                  }
                  onClick={() => pickTest("align")}
                >
                  Align
                </button>
                <label
                  className="pick-hold-chk"
                  title="Leave the part over the camera after Align (skip the safe-Z retreat) so you can tune and re-Align"
                >
                  <input
                    type="checkbox"
                    checked={pickHold}
                    onChange={(e) => setPickHold(e.currentTarget.checked)}
                  />
                  keep over camera
                </label>
                <button
                  className="btn"
                  disabled={!teachReady || !pickNozzleId}
                  title={
                    teachReady
                      ? "Drop the part at the discard location"
                      : "enable + home the machine first"
                  }
                  onClick={() => pickTest("discard")}
                >
                  Discard
                </button>
                <label
                  className="pick-hold-chk"
                  title="Z height (mm) the single-placement test places at — the surface you're placing onto (tape/board top)"
                >
                  place Z
                  <NumberInput
                    className="num-sm"
                    step={0.1}
                    value={placeZInput}
                    onChange={(v) => setPlaceZInput(v)}
                  />
                </label>
                <button
                  className="btn btn-primary"
                  disabled={!teachReady || !pickNozzleId}
                  title={
                    teachReady
                      ? "Single-placement test: places the part at the TOP camera's current crosshair position (jog the camera to a mark first), applying the last Align's correction exactly like a job would. Then measure the landing against the crosshair."
                      : "enable + home the machine first"
                  }
                  onClick={() => {
                    localStorage.setItem("viper.placeZ", String(placeZInput));
                    setPickMsg("placing at camera position…");
                    fetch("/api/test/place", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        nozzleId: pickNozzleId,
                        z: placeZInput,
                      }),
                    })
                      .then(async (r) => {
                        if (!r.ok) {
                          const e = await r.json().catch(() => ({}));
                          throw new Error(e.error ?? `place failed (${r.status})`);
                        }
                      })
                      .catch((e) => {
                        setPickMsg(null);
                        setError(e instanceof Error ? e.message : String(e));
                      });
                  }}
                >
                  Place @ camera
                </button>
              </div>
              {pickMsg && (
                <div className="muted" style={{ marginTop: 6 }}>
                  {pickMsg}
                </div>
              )}

              <div className="pane-head pane-head-plc">
                <span className="pane-title">Vision settings (pipelines)</span>
                <button
                  className="btn btn-sm"
                  onClick={resetBottomVisionPipeline}
                  title="Reset the default bottom-vision pipeline to OpenPnP's stock footprint-masked pipeline, so every part is masked to its own footprint (fixes detection latching onto stray bright features)."
                >
                  Reset bottom vision to footprint-masked
                </button>
              </div>
              <div className="ptable-wrap">
                <table className="ptable">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Enabled</th>
                      <th>Stages</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visionSettings.length === 0 && (
                      <tr>
                        <td colSpan={4} className="muted">
                          No vision settings in this configuration.
                        </td>
                      </tr>
                    )}
                    {visionSettings.map((v) => (
                      <tr key={v.id}>
                        <td className="mono">{v.name || v.id}</td>
                        <td>{v.type}</td>
                        <td className="cell-center">{v.enabled ? "✓" : ""}</td>
                        <td className="mono">{v.stages}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="muted job-hint">
                Pipeline editing stays in OpenPnP for now — these run unchanged
                from your config. Bottom-vision part alignment and nozzle-tip
                calibration are next on the Vision roadmap.
              </p>
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
                  <button
                    className="btn"
                    onClick={() => {
                      const a = window.prompt(
                        "Test the rail scan on ONE slot first. Slot address:",
                        "3",
                      );
                      if (a) railScan(parseInt(a, 10));
                    }}
                    disabled={!teachReady || railScanBusy}
                    title={
                      teachReady
                        ? "Scan a single slot and check the vision frame in the camera pane before trusting the full walk"
                        : "enable + home the machine first"
                    }
                  >
                    Rail scan: test one slot
                  </button>
                  <button
                    className="btn"
                    onClick={() => railScan()}
                    disabled={!teachReady || railScanBusy}
                    title={
                      teachReady
                        ? "Walk the anchor grid from slots 1–2: X by their pitch, Y on their fiducial line, Z from slot 1. Finds >4 mm off-model are rejected; unreadable fiducials get the exact grid position."
                        : "enable + home the machine first"
                    }
                  >
                    {railScanBusy ? railScanMsg || "Rail scan…" : "Rail scan (vision)"}
                  </button>
                </div>
                {!railScanBusy && railScanMsg && (
                  <div className="muted" style={{ marginTop: 4 }}>
                    {railScanMsg}
                  </div>
                )}
              </div>
              {feeders.length === 0 ? (
                <div className="muted">
                  No feeders yet. Add one above — on a real LumenPnP, Photon
                  feeders also appear automatically when the machine scans the bus.
                </div>
              ) : (
                <>
                  <ListSearch
                    value={feederSearch}
                    onChange={setFeederSearch}
                    placeholder="search feeders by name, part, or type"
                  />
                  <div className="ptable-wrap">
                    <table className="ptable">
                      <thead>
                        <tr>
                          <th></th>
                          <th>Active</th>
                          <th>Name</th>
                          <th>Type</th>
                          <th>Slot</th>
                          <th>Part</th>
                          <th>Left</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                      {filteredFeeders.length === 0 && (
                        <tr>
                          <td colSpan={8} className="muted list-nomatch">
                            No feeders match “{feederSearch}”.
                          </td>
                        </tr>
                      )}
                      {filteredFeeders.map((f) => {
                        // Drag-reorder operates on the full list, so resolve the
                        // row's real index even when the view is filtered.
                        const i = feeders.indexOf(f);
                        return (
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
                          <td
                            className="mono feeder-click"
                            onClick={() => openEditFeeder(f.id)}
                            title="Edit feeder settings"
                          >
                            {f.name}
                          </td>
                          <td
                            className="muted feeder-click"
                            onClick={() => openEditFeeder(f.id)}
                            title="Edit feeder settings"
                          >
                            {f.type}
                          </td>
                          <td className="mono cell-center">
                            {f.type === "PhotonFeeder" ? (
                              f.slot != null ? (
                                f.slot
                              ) : (
                                <span
                                  className="muted"
                                  title="Not addressed on the bus — run Find/Scan"
                                >
                                  —
                                </span>
                              )
                            ) : (
                              ""
                            )}
                          </td>
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
                              <option value="">— empty —</option>
                              {f.part && !feederPartOptions.includes(f.part) && (
                                <option value={f.part}>{f.part}</option>
                              )}
                              {feederPartOptions.map((p) => (
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
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
                </>
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
                <>
                  <ListSearch
                    value={partSearch}
                    onChange={setPartSearch}
                    placeholder="search parts by id, name, or package"
                  />
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
                      {filteredParts.length === 0 && (
                        <tr>
                          <td colSpan={6} className="muted list-nomatch">
                            No parts match “{partSearch}”.
                          </td>
                        </tr>
                      )}
                      {filteredParts.map((p) => (
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
                </>
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
                    onClick={fillBodyPads}
                    title="For packages with no pads but real body dimensions, add a body-sized pad so bottom vision has a mask (stops alignment locking onto the holder)"
                  >
                    Fill empty masks
                  </button>
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
              {pkgMsg && (
                <div className="muted" style={{ marginBottom: 8 }}>
                  {pkgMsg}
                </div>
              )}
              {packages.length === 0 ? (
                <div className="muted">No packages yet.</div>
              ) : (
                <>
                  <ListSearch
                    value={pkgSearch}
                    onChange={setPkgSearch}
                    placeholder="search packages by id or description"
                  />
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
                      {filteredPackages.length === 0 && (
                        <tr>
                          <td colSpan={5} className="muted list-nomatch">
                            No packages match “{pkgSearch}”.
                          </td>
                        </tr>
                      )}
                      {filteredPackages.map((p) => (
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
                </>
              )}
            </section>
          )}
        </div>
      </main>

      {editFeeder && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setEditFeeder(null);
            setFeederTeachMsg("");
          }}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>
                Edit feeder — <span className="mono">{editFeeder.name}</span>
              </h3>
              <button
                className="icon-btn"
                onClick={() => {
                  setEditFeeder(null);
                  setFeederTeachMsg("");
                }}
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
                  <option value="">— empty —</option>
                  {editFeeder.part &&
                    !feederPartOptions.includes(editFeeder.part) && (
                      <option value={editFeeder.part}>{editFeeder.part}</option>
                    )}
                  {feederPartOptions.map((p) => (
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
                  <div className="field-row">
                    <label>Feed mode</label>
                    <select
                      className="type-select"
                      value={editFeeder.photon.feedOption ?? "Normal"}
                      onChange={(e) => setFeedOption(e.currentTarget.value)}
                      title="Disable = pick-test the presented part repeatedly without advancing the tape; Skip next = skip one feed"
                    >
                      <option value="Normal">Normal (production)</option>
                      <option value="SkipNext">Skip next feed</option>
                      <option value="Disable">Disabled (test — no feed)</option>
                    </select>
                  </div>
                  {editFeeder.photon.feedOption === "Disable" && (
                    <div className="teach-head muted">
                      Test mode: picks the presented part without advancing the
                      tape. Set back to Normal before a real job.
                    </div>
                  )}
                  <div
                    className="field-row"
                    title="Peel-motor run time in ms per 0.1mm of feed, sent to this feeder's firmware on every init. Firmware default is 22; raise it (e.g. 26-30) on a feeder whose cover film goes slack. 0 = leave firmware default. Requires the peel-configurable firmware; older firmware ignores it. No extra tape motion involved."
                  >
                    <label>Peel time (ms/0.1mm)</label>
                    <NumberInput
                      className="num-sm"
                      step={1}
                      min={0}
                      value={editFeeder.photon.peelTimeMsPerTenth ?? 0}
                      onChange={(v) => setPhotonField({ peelTimeMsPerTenth: v })}
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

                  <div className="teach-block">
                    <div className="teach-head">
                      Pick depth &amp; vision — teach X/Y above by jogging the
                      camera to the pocket center and Capture. Pick Z is uniform
                      across feeders (shared nose plate); set it here so Capture
                      only touches X/Y.
                    </div>
                    <div className="field-grid">
                      <label className="loc-field">
                        <span>
                          Uniform pick Z
                          {editFeeder.photon.pickZ !== undefined && (
                            <span className="muted">
                              {" "}
                              (now {editFeeder.photon.pickZ})
                            </span>
                          )}
                        </span>
                        <NumberInput
                          step={0.1}
                          value={pickZInput}
                          onChange={(v) => setPickZInput(v)}
                        />
                      </label>
                    </div>
                    <div className="teach-actions">
                      <button
                        className="btn btn-sm"
                        onClick={setUniformPickZ}
                        disabled={!editFeeder.photon.slotLocation}
                        title="Write offset.z = pickZ − slotZ (X/Y untouched)"
                      >
                        Set pick Z
                      </button>
                      <button
                        className="btn btn-sm"
                        onClick={recordVisionRef}
                        disabled={
                          feederTeachBusy || !editFeeder.photon.slotLocation
                        }
                        title="With the camera centered on the pocket, store this feeder's sprocket-hole→pocket vector"
                      >
                        Record vision ref
                      </button>
                      <button
                        className="btn btn-sm"
                        onClick={relockVision}
                        disabled={feederTeachBusy || !editFeeder.photon.visionRef}
                        title="Re-find the pocket from the stored vision reference (after a swap) — no manual jog"
                      >
                        Vision re-lock
                      </button>
                    </div>
                    {feederTeachMsg && (
                      <div className="teach-head" style={{ marginTop: 6 }}>
                        {feederTeachMsg}
                      </div>
                    )}
                    {!editFeeder.photon.visionRef && (
                      <div className="teach-head muted" style={{ marginTop: 4 }}>
                        No vision reference yet — teach X/Y, then Record so future
                        swaps re-lock automatically.
                      </div>
                    )}
                  </div>
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
                          {p.part &&
                            !partsDetail.some((pt) => pt.id === p.part) && (
                              <option value={p.part}>{p.part}</option>
                            )}
                          {partsDetail.map((pt) => (
                            <option key={pt.id} value={pt.id}>
                              {pt.id}
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
                  Body size (mm) — bottom vision masks and searches by these;
                  0×0 makes part alignment fail
                </div>
                <div className="field-grid">
                  <label className="loc-field">
                    <span>Width (X)</span>
                    <NumberInput
                      step={0.1}
                      min={0}
                      value={editPackage.bodyWidth ?? 0}
                      onChange={(v) =>
                        setEditPackage({ ...editPackage, bodyWidth: v })
                      }
                    />
                  </label>
                  <label className="loc-field">
                    <span>Length (Y)</span>
                    <NumberInput
                      step={0.1}
                      min={0}
                      value={editPackage.bodyHeight ?? 0}
                      onChange={(v) =>
                        setEditPackage({ ...editPackage, bodyHeight: v })
                      }
                    />
                  </label>
                </div>
                <div className="muted" style={{ marginTop: 4 }}>
                  e.g. 0603 = 1.6 × 0.8 · 0805 = 2.0 × 1.25 · SOT-23 = 2.9 × 1.3
                </div>
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
              <div className="modal-head-actions">
                <button
                  className="btn btn-sm"
                  onClick={reenumerateDevices}
                  disabled={camReconnecting}
                  title="Force a fresh USB scan in-process (cameras + machine serial). Use after a USB unplug/replug instead of restarting the backend."
                >
                  {camReconnecting ? "Working…" : "⟳ Re-enumerate USB"}
                </button>
                <button
                  className="icon-btn"
                  onClick={() => setMachineCard(null)}
                  title="Close"
                >
                  ✕
                </button>
              </div>
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
              <div className="modal-head-actions">
                <button
                  className="btn btn-sm btn-primary"
                  onClick={reenumerateDevices}
                  disabled={camReconnecting}
                  title="Force a fresh USB scan in-process: rebuilds each camera's capture context AND reconnects the machine serial. Use after a USB unplug/replug — this is the in-app equivalent of restarting the backend, and the only thing that recovers devices reconnected after startup."
                >
                  {camReconnecting ? "Working…" : "⟳ Re-enumerate USB"}
                </button>
                <button
                  className="btn btn-sm"
                  onClick={reconnectCameras}
                  disabled={camReconnecting}
                  title="Re-bind the cameras from the current device list (does NOT re-scan USB — use Re-enumerate for a reconnected device)"
                >
                  {camReconnecting ? "…" : "↻ Rebind cameras"}
                </button>
                <button
                  className="btn btn-sm"
                  onClick={swapCameras}
                  disabled={camReconnecting}
                  title="Swap the top and bottom camera bindings (fixes them being crossed after a USB re-plug onto different ports)"
                >
                  ⇄ Swap top/bottom
                </button>
                <button
                  className="icon-btn"
                  onClick={() => setMachineCard(null)}
                  title="Close"
                >
                  ✕
                </button>
              </div>
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
                    <label className="loc-field cam-device-field">
                      <span>
                        Device{" "}
                        {c.bound ? (
                          <span className="cam-bound-tag">
                            ● live {c.formatName ? `· ${c.formatName}` : ""}
                          </span>
                        ) : (
                          <span className="cam-unbound-tag">not bound</span>
                        )}
                      </span>
                      <select
                        className="type-select"
                        value={c.bound ? (c.deviceUniqueId ?? "") : ""}
                        onChange={(e) => bindCamera(c.id, e.currentTarget.value)}
                      >
                        <option value="">— none —</option>
                        {!c.bound &&
                          c.deviceUniqueId &&
                          !captureDevices.some(
                            (d) => d.uniqueId === c.deviceUniqueId,
                          ) && (
                            <option value={c.deviceUniqueId} disabled>
                              (stored, absent) {c.deviceUniqueId}
                            </option>
                          )}
                        {captureDevices.map((d) => (
                          <option key={d.uniqueId} value={d.uniqueId}>
                            {d.name} — {d.uniqueId.slice(-24)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {c.bound && (
                    <>
                      <div className="cam-preview-wrap">
                        <CameraFeed
                          key={c.id}
                          id={c.id}
                          w={640}
                          className="cam-preview"
                        />
                      </div>
                      <CamPropSliders key={`props-${c.id}`} id={c.id} />
                    </>
                  )}
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
                  {c.location && (
                    <div className="detect-grp">
                      <div className="detect-title">
                        Camera position — teach X/Y with the top camera; Z is the
                        focal plane (set by the Z frame, not taught here)
                      </div>
                      <div className="field-grid">
                        {(["x", "y", "z"] as const).map((k) => (
                          <label key={k} className="loc-field">
                            <span>{k.toUpperCase()}</span>
                            <NumberInput
                              step={0.01}
                              value={c.location?.[k] ?? 0}
                              onChange={(v) => bottomCamSetLoc({ [k]: v })}
                            />
                          </label>
                        ))}
                      </div>
                      <div className="teach-actions">
                        <button
                          className="btn btn-sm"
                          onClick={() => bottomCamGo("camera")}
                          disabled={!teachReady}
                          title={
                            teachReady
                              ? "Fly the top camera over the bottom camera's stored position"
                              : teachHint
                          }
                        >
                          <CameraIcon size={14} /> Go
                        </button>
                        <button
                          className="btn btn-sm"
                          onClick={() => bottomCamGrab("camera")}
                          disabled={!teachReady}
                          title={
                            teachReady
                              ? "Rough teach: capture the top camera's current X/Y as this camera's position (jog the crosshair onto the bottom lens first). Z is preserved."
                              : teachHint
                          }
                        >
                          <CameraIcon size={14} /> Grab
                        </button>
                        <button
                          className="btn btn-sm"
                          onClick={() => bottomCamGo("nozzle")}
                          disabled={!teachReady}
                          title={
                            teachReady
                              ? "Move the SELECTED nozzle over the bottom camera — X/Y only, Z stays exactly where it is"
                              : teachHint
                          }
                        >
                          <NozzleIcon size={14} /> Go
                        </button>
                        <button
                          className="btn btn-sm"
                          onClick={() => bottomCamGrab("nozzle")}
                          disabled={!teachReady}
                          title={
                            teachReady
                              ? "Precise teach: jog the SELECTED nozzle tip until this camera sees it dead-center, then capture the nozzle's X/Y as the camera position. Anchors to the camera's own optical axis — re-run runout cal afterward."
                              : teachHint
                          }
                        >
                          <NozzleIcon size={14} /> Grab
                        </button>
                      </div>
                    </div>
                  )}
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

      {machineCard === "toolchanger" && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setMachineCard(null);
            setTcTip(null);
            setTcMsg("");
          }}
        >
          <div
            className="modal modal-wide"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h3>
                Tool Changer
                {tcTip
                  ? ` — ${nzTips.find((t) => t.id === tcTip)?.name ?? ""}`
                  : ""}
              </h3>
              <button
                className="icon-btn"
                onClick={() => {
                  setMachineCard(null);
                  setTcTip(null);
                  setTcMsg("");
                }}
                title="Close"
              >
                ✕
              </button>
            </div>
            <div className="modal-body plc-body">
              {(!enabled || !homed) && (
                <div className="banner" style={{ marginBottom: 10 }}>
                  Enable and home the machine to teach or test the changer.
                </div>
              )}
              {tcTip === null ? (
                <>
                  <p className="muted" style={{ marginBottom: 10 }}>
                    Automatic nozzle-tip changer. Teach each tip's four-point
                    load/unload path, then test. Moves use the{" "}
                    {reference === "camera"
                      ? "selected nozzle (pick N1/N2 in the sidebar first)"
                      : "selected nozzle"}
                    .
                  </p>
                  {nzTips.length === 0 ? (
                    <div className="muted">No nozzle tips defined.</div>
                  ) : (
                    <div className="tc-list">
                      {nzTips.map((t) => (
                        <div key={t.id} className="tc-row">
                          <span className="tc-name mono">{t.name}</span>
                          <span
                            className={`badge ${t.changer?.configured ? "on" : ""}`}
                          >
                            {t.changer?.configured ? "Configured" : "Not set up"}
                          </span>
                          {t.loaded && <span className="badge on">Loaded</span>}
                          <div className="tc-actions">
                            <button
                              className="btn btn-sm"
                              onClick={() => {
                                setTcTip(t.id);
                                setTcStep(0);
                                setTcMsg("");
                              }}
                            >
                              {t.changer?.configured ? "Edit" : "Set up"}
                            </button>
                            <button
                              className="btn btn-sm"
                              disabled={!teachReady || !t.changer?.configured}
                              onClick={() => loadTip(t.id)}
                              title="Run the changer to load this tip"
                            >
                              Load
                            </button>
                            <button
                              className="btn btn-sm"
                              disabled={!teachReady}
                              onClick={() => unloadTip(t.id)}
                              title="Run the changer to unload"
                            >
                              Unload
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {tcMsg && (
                    <div className="teach-head" style={{ marginTop: 8 }}>
                      {tcMsg}
                    </div>
                  )}
                </>
              ) : (
                (() => {
                  const tip = nzTips.find((t) => t.id === tcTip);
                  if (!tip) return <div className="muted">Tip not found.</div>;
                  const onSpeeds = tcStep >= CHANGER_STEPS.length;
                  const step = CHANGER_STEPS[tcStep];
                  const loc = step
                    ? (tip.changer?.[step.which] ?? null)
                    : null;
                  const set = (l: FeederLoc | null | undefined) =>
                    !!l && (l.x !== 0 || l.y !== 0 || l.z !== 0);
                  return (
                    <>
                      <div className="tc-steps">
                        {CHANGER_STEPS.map((s, i) => (
                          <span
                            key={s.which}
                            className={`tc-pill ${i === tcStep ? "active" : ""} ${
                              set(tip.changer?.[s.which]) ? "done" : ""
                            }`}
                          >
                            {i + 1}. {s.label}
                          </span>
                        ))}
                        <span className={`tc-pill ${onSpeeds ? "active" : ""}`}>
                          Speeds & test
                        </span>
                      </div>
                      {!onSpeeds ? (
                        <>
                          <div className="teach-head">
                            Step {tcStep + 1} of 4 — {step.label}
                          </div>
                          <p className="muted">{step.hint}</p>
                          <p className="muted">
                            Jog the selected nozzle to this point, then Grab. Go
                            re-drives to the stored point.
                          </p>
                          <div className="teach-block">
                            <div className="loc-grid">
                              {(["x", "y", "z", "rotation"] as const).map((k) => (
                                <label key={k} className="loc-field">
                                  <span>
                                    {k === "rotation" ? "Rot°" : k.toUpperCase()}
                                  </span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    disabled
                                    value={loc ? loc[k] : 0}
                                  />
                                </label>
                              ))}
                            </div>
                            <div className="teach-actions">
                              <button
                                className="btn btn-sm"
                                disabled={!teachReady}
                                onClick={() => changerMove(tip.id, step.which)}
                              >
                                <NozzleIcon size={14} /> Go
                              </button>
                              <button
                                className="btn btn-sm"
                                disabled={!teachReady}
                                onClick={() => changerCapture(tip.id, step.which)}
                              >
                                <NozzleIcon size={14} /> Grab
                              </button>
                            </div>
                          </div>
                          <div className="teach-actions">
                            <button
                              className="btn btn-sm"
                              disabled={tcStep === 0}
                              onClick={() => setTcStep((s) => s - 1)}
                            >
                              ← Back
                            </button>
                            <button
                              className="btn btn-sm btn-primary"
                              onClick={() => setTcStep((s) => s + 1)}
                            >
                              Next →
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="teach-head">
                            Segment speeds (0.01–1.0)
                          </div>
                          <div className="field-grid">
                            <label className="loc-field">
                              <span>Start → Mid</span>
                              <NumberInput
                                step={0.05}
                                min={0.01}
                                value={tip.changer?.startToMidSpeed ?? 1}
                                onChange={(v) =>
                                  changerSpeeds(tip.id, { startToMidSpeed: v })
                                }
                              />
                            </label>
                            <label className="loc-field">
                              <span>Mid → Mid 2</span>
                              <NumberInput
                                step={0.05}
                                min={0.01}
                                value={tip.changer?.midToMid2Speed ?? 1}
                                onChange={(v) =>
                                  changerSpeeds(tip.id, { midToMid2Speed: v })
                                }
                              />
                            </label>
                            <label className="loc-field">
                              <span>Mid 2 → End</span>
                              <NumberInput
                                step={0.05}
                                min={0.01}
                                value={tip.changer?.mid2ToEndSpeed ?? 1}
                                onChange={(v) =>
                                  changerSpeeds(tip.id, { mid2ToEndSpeed: v })
                                }
                              />
                            </label>
                          </div>
                          <div
                            className="teach-head"
                            style={{ marginTop: 10 }}
                          >
                            Test the changer
                          </div>
                          <div className="teach-actions">
                            <button
                              className="btn btn-sm"
                              disabled={!teachReady}
                              onClick={() => loadTip(tip.id)}
                            >
                              Test Load
                            </button>
                            <button
                              className="btn btn-sm"
                              disabled={!teachReady}
                              onClick={() => unloadTip(tip.id)}
                            >
                              Test Unload
                            </button>
                          </div>
                          <div
                            className="teach-actions"
                            style={{ marginTop: 10 }}
                          >
                            <button
                              className="btn btn-sm"
                              onClick={() => setTcStep((s) => s - 1)}
                            >
                              ← Back
                            </button>
                            <button
                              className="btn btn-sm btn-primary"
                              onClick={() => {
                                setTcTip(null);
                                setTcMsg(
                                  "Setup done. Use Save in the header to keep it.",
                                );
                              }}
                            >
                              Done
                            </button>
                          </div>
                        </>
                      )}
                      {tcMsg && (
                        <div className="teach-head" style={{ marginTop: 8 }}>
                          {tcMsg}
                        </div>
                      )}
                    </>
                  );
                })()
              )}
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

                  <div className="detect-grp">
                    <div className="detect-title">
                      Loaded tip &amp; vacuum calibration
                    </div>
                    <div className="field-grid">
                      <label className="loc-field">
                        <span>Loaded tip (manual swap)</span>
                        <select
                          className="type-select"
                          value={nzTips.find((t) => t.name === n.tip)?.id ?? ""}
                          onChange={(e) => setLoadedTip(n.id, e.currentTarget.value)}
                        >
                          <option value="">— none —</option>
                          {nzTips.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <p className="muted job-hint">
                      Pick a part (Vision tab), then Read → part on. Bare nozzle
                      with vacuum on, Read → part off. Apply sets the loaded tip’s
                      part-on window between them (edit exact thresholds under Tips
                      below, or switch method to Difference for tiny parts).
                    </p>
                    <div className="vac-row">
                      <button
                        className="btn btn-sm"
                        onClick={() => readVacuum(n.id)}
                        disabled={!teachReady}
                        title="Read the live vacuum sensor now"
                      >
                        Read vacuum
                      </button>
                      <button
                        className="btn btn-sm"
                        onClick={() => readVacuum(n.id, "on")}
                        disabled={!teachReady}
                        title="Read now and capture as the part-ON level (part held)"
                      >
                        Read → part on
                      </button>
                      <button
                        className="btn btn-sm"
                        onClick={() => readVacuum(n.id, "off")}
                        disabled={!teachReady}
                        title="Read now and capture as the part-OFF level (no part)"
                      >
                        Read → part off
                      </button>
                      <span className="vac-readout">
                        {vacReading != null ? `reading: ${vacReading}` : "—"}
                        {vacOn != null ? ` · on: ${vacOn}` : ""}
                        {vacOff != null ? ` · off: ${vacOff}` : ""}
                      </span>
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => {
                          const tipId = nzTips.find(
                            (t) => t.name === n.tip,
                          )?.id;
                          if (tipId) applyVacThresholds(tipId);
                          else setError("No tip loaded on this nozzle.");
                        }}
                        disabled={vacOn == null || vacOff == null || !n.tip}
                        title="Set the loaded tip's part-on window from the captured on/off levels"
                      >
                        Apply to loaded tip
                      </button>
                    </div>
                  </div>

                  <div className="detect-grp">
                    <div className="detect-title">
                      Head offsets (nozzle ↔ camera)
                      {n.headOffsets &&
                        ` — X ${n.headOffsets.x} · Y ${n.headOffsets.y} · Z ${n.headOffsets.z}`}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        marginTop: 6,
                        flexWrap: "wrap",
                      }}
                    >
                      <button
                        className="btn"
                        disabled={!teachReady}
                        title={
                          teachReady
                            ? "Move this nozzle over the primary fiducial at safe Z"
                            : "enable + home the machine first"
                        }
                        onClick={() => nozzleOverFid(n.id, "primary")}
                      >
                        Over primary fid
                      </button>
                      <button
                        className="btn btn-primary"
                        disabled={!teachReady}
                        title={
                          teachReady
                            ? "Tip must be touching the primary fiducial — captures head offsets (and fiducial Z on the default nozzle)"
                            : "enable + home the machine first"
                        }
                        onClick={() => captureNozzleOffsets(n.id, "primary")}
                      >
                        Capture @ primary
                      </button>
                      {n.isDefault && (
                        <>
                          <button
                            className="btn"
                            disabled={!teachReady}
                            title={
                              teachReady
                                ? "Move this nozzle over the secondary fiducial at safe Z"
                                : "enable + home the machine first"
                            }
                            onClick={() => nozzleOverFid(n.id, "secondary")}
                          >
                            Over secondary fid
                          </button>
                          <button
                            className="btn btn-primary"
                            disabled={!teachReady}
                            title={
                              teachReady
                                ? "Tip must be touching the secondary fiducial — sets its Z and enables 3D units-per-pixel"
                                : "enable + home the machine first"
                            }
                            onClick={() =>
                              captureNozzleOffsets(n.id, "secondary")
                            }
                          >
                            Capture @ secondary
                          </button>
                        </>
                      )}
                    </div>
                    {nozOffMsg && (
                      <div className="muted" style={{ marginTop: 6 }}>
                        {nozOffMsg}
                      </div>
                    )}
                    {n.isDefault && (
                      <div className="muted" style={{ marginTop: 6 }}>
                        Touch-off calibration, in order: ① this nozzle on the
                        primary fiducial (sets offsets + reference Z), ② this
                        nozzle on the secondary fiducial (sets its Z, enables
                        3D units-per-pixel), ③ the other nozzle on the primary
                        (sets its offsets, equalizes Z). Jog the tip down until
                        it just touches before each capture.
                      </div>
                    )}
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

                    <div className="field-grid">
                      <label
                        className="loc-field"
                        title="How long the nozzle stays at pick depth with vacuum on before lifting. 0 = lifts the instant the valve fires — vacuum never builds and the part stays behind. 500 is a good default."
                      >
                        <span>Pick dwell (ms)</span>
                        <NumberInput
                          step={50}
                          min={0}
                          value={t.pickDwellMs ?? 0}
                          onChange={(v) => updateTip(t.id, { pickDwellMs: v })}
                        />
                      </label>
                      <label
                        className="loc-field"
                        title="How long the nozzle stays at place depth after vacuum off (blow-off) before lifting"
                      >
                        <span>Place dwell (ms)</span>
                        <NumberInput
                          step={50}
                          min={0}
                          value={t.placeDwellMs ?? 0}
                          onChange={(v) => updateTip(t.id, { placeDwellMs: v })}
                        />
                      </label>
                      <label
                        className="loc-field"
                        title="Bottom vision measures how far off-center the part sits on the nozzle and corrects it at placement. Picks offset by MORE than this are treated as bad picks (corner grip / tilt / misdetection) and discarded. Size to the part: ~1mm for small passives, 2mm+ for large-bodied ICs."
                      >
                        <span>Max pick tolerance (mm)</span>
                        <NumberInput
                          step={0.1}
                          min={0}
                          value={t.maxPickToleranceMm ?? 0}
                          onChange={(v) =>
                            updateTip(t.id, { maxPickToleranceMm: v })
                          }
                        />
                      </label>
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

                    <div className="detect-grp">
                      <div className="detect-title">
                        Runout calibration (rotation compensation)
                      </div>
                      <div className="muted" style={{ marginBottom: 6 }}>
                        {t.loaded
                          ? t.calibrated
                            ? "✓ calibrated"
                            : "loaded — not yet calibrated"
                          : "tip not loaded on a nozzle"}
                      </div>
                      <div className="detect-checks">
                        <label className="check-row">
                          <input
                            type="checkbox"
                            checked={t.calEnabled ?? false}
                            onChange={(e) =>
                              updateTip(t.id, {
                                calEnabled: e.currentTarget.checked,
                              })
                            }
                          />
                          <span>enable compensation</span>
                        </label>
                      </div>
                      {t.calEnabled && (
                        <>
                          <div className="field-grid">
                            <label className="loc-field">
                              <span>Recalibrate</span>
                              <select
                                className="type-select"
                                value={t.calRecalTrigger ?? "NozzleTipChange"}
                                onChange={(e) =>
                                  updateTip(t.id, {
                                    calRecalTrigger: e.currentTarget.value,
                                  })
                                }
                              >
                                {RECAL_TRIGGERS.map((m) => (
                                  <option key={m} value={m}>
                                    {m}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="loc-field">
                              <span>Circle divisions</span>
                              <NumberInput
                                step={1}
                                min={3}
                                value={t.calAngleSubdivisions ?? 6}
                                onChange={(v) =>
                                  updateTip(t.id, { calAngleSubdivisions: v })
                                }
                              />
                            </label>
                            <label className="loc-field">
                              <span>Allowed misdetects</span>
                              <NumberInput
                                step={1}
                                min={0}
                                value={t.calAllowMisdetections ?? 0}
                                onChange={(v) =>
                                  updateTip(t.id, { calAllowMisdetections: v })
                                }
                              />
                            </label>
                            <label className="loc-field">
                              <span>Cal Z offset (mm)</span>
                              <NumberInput
                                step={0.1}
                                value={t.calZOffset ?? 0}
                                onChange={(v) =>
                                  updateTip(t.id, { calZOffset: v })
                                }
                              />
                            </label>
                          </div>
                          <div style={{ marginTop: 8 }}>
                            <button
                              className="btn btn-primary"
                              disabled={
                                !teachReady || !t.loaded || calibrating !== null
                              }
                              title={
                                !teachReady
                                  ? "enable + home the machine first"
                                  : !t.loaded
                                    ? "load this tip on a nozzle first"
                                    : "measure tip runout across rotation"
                              }
                              onClick={() => calibrateTip(t.id)}
                            >
                              {calibrating === t.id
                                ? "Calibrating…"
                                : "Calibrate runout"}
                            </button>
                          </div>
                          {calResult && calResult.tip === t.id && (
                            <div className="muted" style={{ marginTop: 6 }}>
                              {calResult.calibrated
                                ? "✓ runout calibration complete"
                                : "✗ did not converge — check bottom-cam exposure & pipeline"}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}

              {bottomVision && (
                <>
                  <div className="sub-head" style={{ marginTop: 14 }}>
                    Bottom-vision alignment (part offset &amp; rotation)
                  </div>
                  <div className="teach-block">
                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={bottomVision.preRotate}
                        onChange={(e) =>
                          updateBottomVision({
                            preRotate: e.currentTarget.checked,
                          })
                        }
                      />
                      <span>
                        Pre-rotate to placement angle before measuring
                        (recommended)
                      </span>
                    </label>
                    <div className="field-grid" style={{ marginTop: 8 }}>
                      <label className="loc-field">
                        <span>Max vision passes</span>
                        <NumberInput
                          step={1}
                          min={1}
                          value={bottomVision.maxVisionPasses}
                          onChange={(v) =>
                            updateBottomVision({ maxVisionPasses: v })
                          }
                        />
                      </label>
                      <label className="loc-field">
                        <span>Max linear offset (mm)</span>
                        <NumberInput
                          step={0.1}
                          min={0}
                          value={bottomVision.maxLinearOffset}
                          onChange={(v) =>
                            updateBottomVision({ maxLinearOffset: v })
                          }
                        />
                      </label>
                      <label className="loc-field">
                        <span>Max angular offset (°)</span>
                        <NumberInput
                          step={1}
                          min={0}
                          value={bottomVision.maxAngularOffset}
                          onChange={(v) =>
                            updateBottomVision({ maxAngularOffset: v })
                          }
                        />
                      </label>
                      <label
                        className="loc-field"
                        title="Bottom-camera exposure used ONLY during nozzle-tip runout calibration, then restored. The shiny tip wants a different exposure than dark parts — set the part-friendly exposure on the camera itself and put the runout-friendly value here. Negative values are normal (UVC exposure is a log scale). The checkbox turns the switch on/off."
                      >
                        <span>Runout cal exposure</span>
                        <span className="cal-exp-row">
                          <input
                            type="checkbox"
                            checked={bottomVision.calExposureEnabled ?? false}
                            onChange={(e) =>
                              updateBottomVision({
                                calExposureEnabled: e.currentTarget.checked,
                              })
                            }
                          />
                          <NumberInput
                            step={1}
                            value={bottomVision.calExposure ?? 0}
                            onChange={(v) =>
                              updateBottomVision({ calExposure: v })
                            }
                          />
                        </span>
                      </label>
                    </div>
                    <div className="muted" style={{ marginTop: 6 }}>
                      Pre-rotate images the part at its final angle so residual
                      nozzle runout is measured out. Multi-pass re-centers the
                      part until offsets fall under these thresholds. Runout cal
                      exposure switches the bottom camera to that exposure only
                      while calibrating the tip, so part vision keeps its own.
                    </div>
                  </div>
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

                  <div className="sub-head" style={{ marginTop: 14 }}>
                    Calibration fiducials (mm)
                  </div>
                  {general.homingFiducial && (
                    <div className="muted" style={{ marginBottom: 6 }}>
                      Homing / primary fiducial: X {general.homingFiducial.x} · Y{" "}
                      {general.homingFiducial.y}
                      {general.primaryFiducial &&
                        ` · Z ${general.primaryFiducial.z}`}
                      {(general.primaryFiducialDiameter ?? 0) > 0 &&
                        ` · Ø ${general.primaryFiducialDiameter}`}
                    </div>
                  )}
                  <div className="detect-grp">
                    <div className="detect-title">
                      Secondary fiducial — raised target enabling 3D
                      units-per-pixel (camera scale vs. height)
                    </div>
                    <div className="field-grid">
                      <label className="loc-field">
                        <span>X</span>
                        <NumberInput
                          step={0.1}
                          value={general.secondaryFiducial?.x ?? 0}
                          onChange={(v) => updateGeneral({ secFidX: v })}
                        />
                      </label>
                      <label className="loc-field">
                        <span>Y</span>
                        <NumberInput
                          step={0.1}
                          value={general.secondaryFiducial?.y ?? 0}
                          onChange={(v) => updateGeneral({ secFidY: v })}
                        />
                      </label>
                      <label className="loc-field">
                        <span>Z (top surface)</span>
                        <NumberInput
                          step={0.1}
                          value={general.secondaryFiducial?.z ?? 0}
                          onChange={(v) => updateGeneral({ secFidZ: v })}
                        />
                      </label>
                      <label className="loc-field">
                        <span>Ø diameter</span>
                        <NumberInput
                          step={0.1}
                          value={general.secondaryFiducialDiameter ?? 0}
                          onChange={(v) => updateGeneral({ secFidDiameter: v })}
                        />
                      </label>
                      <label className="loc-field">
                        <span>Expected px (locate)</span>
                        <NumberInput
                          step={5}
                          min={5}
                          value={fidPx}
                          onChange={(v) => setFidPx(v)}
                        />
                      </label>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        marginTop: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      <button
                        className="btn"
                        disabled={!teachReady}
                        title={
                          teachReady
                            ? "Move the top camera over the stored position"
                            : "enable + home the machine first"
                        }
                        onClick={() => fidAction("go")}
                      >
                        Go to
                      </button>
                      <button
                        className="btn"
                        disabled={!teachReady}
                        title={
                          teachReady
                            ? "Store the camera's current X/Y as the fiducial position"
                            : "enable + home the machine first"
                        }
                        onClick={() => fidAction("capture")}
                      >
                        Capture camera position
                      </button>
                      <button
                        className="btn btn-primary"
                        disabled={!teachReady || fidBusy}
                        title={
                          teachReady
                            ? "Jog the camera roughly over the fiducial first — vision then measures it precisely (like OpenPnP Issues & Solutions)"
                            : "enable + home the machine first"
                        }
                        onClick={() => fidAction("locate")}
                      >
                        {fidBusy ? "Locating…" : "Auto-locate (vision)"}
                      </button>
                      <button
                        className="btn"
                        disabled={!teachReady}
                        title={
                          teachReady
                            ? "Move the nozzle tip over the fiducial at safe Z (then jog Z down to touch)"
                            : "enable + home the machine first"
                        }
                        onClick={() => fidAction("nozzleGo")}
                      >
                        Nozzle over fiducial
                      </button>
                      <button
                        className="btn"
                        disabled={!teachReady}
                        title={
                          teachReady
                            ? "Store the nozzle's current Z as the fiducial Z (touch-off)"
                            : "enable + home the machine first"
                        }
                        onClick={() => fidAction("zFromNozzle")}
                      >
                        Set Z from nozzle tip
                      </button>
                    </div>
                    {fidMsg && (
                      <div className="muted" style={{ marginTop: 6 }}>
                        {fidMsg}
                      </div>
                    )}
                    <label className="check-row" style={{ marginTop: 10 }}>
                      <input
                        type="checkbox"
                        checked={general.verifyFidAfterHome ?? false}
                        onChange={(e) =>
                          updateGeneral({
                            verifyFidAfterHome: e.currentTarget.checked,
                          })
                        }
                      />
                      <span>
                        Verify after homing — re-measure this fiducial and warn
                        if the plate or calibration drifted (report-only, never
                        blocks homing)
                      </span>
                    </label>
                    <div className="muted" style={{ marginTop: 6 }}>
                      Opulo kit installs in slots 19/21 of row A on the primary
                      staging plate, PCB side toward you. Jog the camera roughly
                      over the fiducial, set the expected pixel size, then
                      Auto-locate: the camera jogs around the target to measure
                      its position (and seeds the camera's secondary
                      units-per-pixel). For Z: "Nozzle over fiducial", jog Z
                      down until the tip just touches the surface (watch it
                      against the ring light), then "Set Z from nozzle tip". Z
                      must differ from the primary fiducial Z for 3D
                      calibration to work.
                    </div>
                  </div>

                  <div className="sub-head" style={{ marginTop: 14 }}>
                    Config backups
                  </div>
                  <div className="muted" style={{ marginBottom: 8 }}>
                    Timestamped snapshots of the machine config (fiducials, nozzle
                    offsets, feeders). One is taken automatically on every save and
                    before each nozzle calibration, so a bad calibration is a
                    one-click restore. Restoring needs a backend restart to apply.
                  </div>
                  <div
                    style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}
                  >
                    <button className="btn" onClick={snapshotConfig}>
                      Snapshot now
                    </button>
                    <button className="btn" onClick={loadBackups}>
                      Refresh
                    </button>
                  </div>
                  {backupMsg && (
                    <div className="muted" style={{ marginBottom: 8 }}>
                      {backupMsg}
                    </div>
                  )}
                  {backups.length === 0 ? (
                    <div className="muted">No backups yet.</div>
                  ) : (
                    <div className="backup-list">
                      {backups.slice(0, 12).map((b) => (
                        <div key={b.name} className="backup-row">
                          <span className="backup-when">
                            {new Date(b.whenMs).toLocaleString()}
                          </span>
                          <span className="backup-label mono">{b.label}</span>
                          <button
                            className="btn btn-sm"
                            onClick={() => restoreConfig(b.name)}
                            title={`Restore ${b.name} (current config is snapshotted first)`}
                          >
                            Restore
                          </button>
                        </div>
                      ))}
                    </div>
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

      {plcMenu && (
        <>
          <div className="ctx-backdrop" onClick={() => setPlcMenu(null)} />
          <div
            className="ctx-menu"
            style={{ left: plcMenu.x, top: plcMenu.y }}
            onContextMenu={(e) => e.preventDefault()}
          >
            <div className="ctx-title mono">{plcMenu.id}</div>
            <button
              className="ctx-item"
              onClick={() => setOriginFromPlacement(plcMenu.id)}
              disabled={!teachReady}
              title={
                teachReady
                  ? "Shift the board origin so this placement lands exactly under the current camera position"
                  : teachHint
              }
            >
              <CrosshairIcon size={13} /> Set board origin from this placement
            </button>
            <button
              className="ctx-item"
              onClick={() => cameraToPlacement(plcMenu.id)}
              disabled={!teachReady}
              title={
                teachReady
                  ? "Jog the camera to this placement's expected location"
                  : teachHint
              }
            >
              <CameraIcon size={13} /> Camera to this placement
            </button>
            <button
              className="ctx-item"
              onClick={() => capturePlacementFromCamera(plcMenu.id)}
              disabled={!teachReady}
              title={
                teachReady
                  ? "Set this placement's board-local X/Y from the camera's current position (fiducial-align the board first, then hover over the real part)"
                  : teachHint
              }
            >
              <CrosshairIcon size={13} /> Capture location from camera
            </button>
          </div>
        </>
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
                  {editPlacement.part &&
                    !partsDetail.some((pt) => pt.id === editPlacement.part) && (
                      <option value={editPlacement.part}>
                        {editPlacement.part}
                      </option>
                    )}
                  {partsDetail.map((pt) => (
                    <option key={pt.id} value={pt.id}>
                      {pt.id}
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
