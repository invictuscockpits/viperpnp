package org.openpnp.viper;

import java.io.File;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.concurrent.ConcurrentHashMap;

import org.openpnp.gui.importer.EagleMountsmdUlpImporter;
import org.openpnp.gui.importer.KicadPosImporter;
import org.openpnp.gui.importer.ReferenceCsvImporter;
import org.openpnp.machine.photon.PhotonFeeder;
import org.openpnp.machine.photon.PhotonProperties;
import org.openpnp.machine.reference.ReferenceFeeder;
import org.openpnp.machine.reference.ReferenceNozzle;
import org.openpnp.machine.reference.ReferencePnpJobProcessor;
import org.openpnp.machine.reference.axis.ReferenceControllerAxis;
import org.openpnp.machine.reference.camera.ReferenceCamera;
import org.openpnp.machine.reference.driver.AbstractReferenceDriver;
import org.openpnp.machine.reference.driver.SerialPortCommunications;
import org.openpnp.machine.reference.feeder.ReferenceRotatedTrayFeeder;
import org.openpnp.machine.reference.feeder.ReferenceStripFeeder;
import org.openpnp.machine.reference.feeder.ReferenceTrayFeeder;
import org.openpnp.model.Abstract2DLocatable.Side;
import org.openpnp.model.Board;
import org.openpnp.model.BoardLocation;
import org.openpnp.model.Configuration;
import org.openpnp.model.Job;
import org.openpnp.model.Length;
import org.openpnp.model.LengthUnit;
import org.openpnp.model.Location;
import org.openpnp.model.Motion.MotionOption;
import org.openpnp.model.Package;
import org.openpnp.model.Part;
import org.openpnp.model.Placement;
import org.openpnp.spi.Actuator;
import org.openpnp.spi.Axis;
import org.openpnp.spi.Camera;
import org.openpnp.spi.Driver;
import org.openpnp.spi.Feeder;
import org.openpnp.spi.Head;
import org.openpnp.spi.HeadMountable;
import org.openpnp.spi.JobProcessor;
import org.openpnp.spi.Machine;
import org.openpnp.spi.MachineListener;
import org.openpnp.spi.Nozzle;
import org.openpnp.spi.NozzleTip;
import org.openpnp.spi.PnpJobProcessor;
import org.openpnp.spi.base.AbstractFeeder;
import org.openpnp.util.MovableUtils;
import org.openpnp.util.Utils2D;

import com.google.common.util.concurrent.FutureCallback;
import com.google.gson.Gson;
import com.google.gson.GsonBuilder;

import io.javalin.Javalin;
import io.javalin.websocket.WsContext;

/**
 * ViperPNP backend: an embedded HTTP/WebSocket server that wraps the headless
 * OpenPnP core. This is what the desktop shell (Tauri/Electron) talks to over
 * localhost. It owns the proven headless boot sequence and exposes machine
 * state and control with zero Swing.
 *
 * <p>REST:
 * <ul>
 *   <li>GET  /api/health            liveness</li>
 *   <li>GET  /api/machine           static inventory (drivers, heads, feeders...)</li>
 *   <li>GET  /api/machine/status    live state: enabled, homed, busy, position</li>
 *   <li>GET  /api/ports             available serial ports</li>
 *   <li>POST /api/machine/connect   enable the machine (connect drivers)</li>
 *   <li>POST /api/machine/disconnect disable the machine</li>
 *   <li>POST /api/machine/home      home (async, reported over /ws/events)</li>
 *   <li>POST /api/jog               relative jog {dx,dy,dz,dc,speed} in mm</li>
 * </ul>
 *
 * <p>WebSocket /ws/events streams a status snapshot on connect and whenever the
 * machine is enabled/disabled/homed/busy or a head moves.
 *
 * <p>Machine actions that touch motion (home, jog) are dispatched on OpenPnP's
 * machine task executor via {@link Machine#submit}; connect/disconnect call
 * {@link Machine#setEnabled} directly (safe from any thread).
 */
public class ViperServer {
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
    private static final Set<WsContext> SESSIONS = ConcurrentHashMap.newKeySet();

    private static Machine machine;
    private static Job currentJob;
    private static volatile boolean jobRunning = false;
    private static volatile boolean jobAbortRequested = false;
    private static PnpJobProcessor jobProcessor;
    private static volatile boolean configDirty = false;
    /** file-part-id → canonical-part-id remap rules (persisted alongside config). */
    private static final Map<String, String> partAliases = new LinkedHashMap<>();

    public static void main(String[] args) throws Exception {
        File configDir;
        if (args.length > 0) {
            configDir = new File(args[0]);
        }
        else {
            configDir = new File(System.getProperty("user.home"), ".openpnp2");
        }
        configDir.mkdirs();

        long t0 = System.currentTimeMillis();
        Configuration.initialize(configDir);
        Configuration.get().load();
        machine = Configuration.get().getMachine();
        System.out.println("[viper] core booted headless from " + configDir + " in "
                + (System.currentTimeMillis() - t0) + " ms");

        loadBoardsFolder();
        loadAliases();
        machine.addListener(new StatusBroadcastListener());

        int port = Integer.getInteger("viper.port", 8077);
        Javalin app = Javalin.create(config -> {
            config.showJavalinBanner = false;
        });

        app.get("/api/health", ctx -> ctx.result("ok"));

        app.get("/api/machine", ctx -> {
            ctx.contentType("application/json");
            ctx.result(GSON.toJson(describeMachine(machine)));
        });

        app.get("/api/machine/status", ctx -> {
            ctx.contentType("application/json");
            ctx.result(GSON.toJson(statusSnapshot()));
        });

        app.get("/api/ports", ctx -> {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("ports", SerialPortCommunications.getPortNames());
            ctx.contentType("application/json");
            ctx.result(GSON.toJson(out));
        });

        app.post("/api/machine/connect", ctx -> setEnabled(ctx, true));
        app.post("/api/machine/disconnect", ctx -> setEnabled(ctx, false));

        app.post("/api/machine/home", ctx -> {
            machine.submit(() -> {
                machine.home();
                return null;
            }, broadcastCallback());
            ctx.contentType("application/json");
            ctx.result("{\"submitted\":true}");
        });

        app.post("/api/machine/park", ctx -> {
            machine.submit(() -> {
                MovableUtils.park(machine.getDefaultHead());
                return null;
            }, broadcastCallback());
            ctx.contentType("application/json");
            ctx.result("{\"submitted\":true}");
        });

        app.post("/api/io", ViperServer::setIo);

        app.post("/api/machine/camera-to-nozzle", ctx -> {
            machine.submit(() -> {
                Head head = machine.getDefaultHead();
                MovableUtils.moveToLocationAtSafeZ(head.getDefaultCamera(),
                        head.getDefaultNozzle().getLocation());
                return null;
            }, broadcastCallback());
            ctx.contentType("application/json");
            ctx.result("{\"submitted\":true}");
        });

        app.post("/api/machine/nozzle-to-camera", ctx -> {
            machine.submit(() -> {
                Head head = machine.getDefaultHead();
                MovableUtils.moveToLocationAtSafeZ(head.getDefaultNozzle(),
                        head.getDefaultCamera().getLocation());
                return null;
            }, broadcastCallback());
            ctx.contentType("application/json");
            ctx.result("{\"submitted\":true}");
        });

        app.post("/api/jog", ctx -> {
            JogRequest req = GSON.fromJson(ctx.body(), JogRequest.class);
            final JogRequest jog = req != null ? req : new JogRequest();
            machine.submit(() -> {
                Head head = machine.getDefaultHead();
                HeadMountable tool;
                if (jog.tool == null || jog.tool.isEmpty()
                        || "nozzle".equalsIgnoreCase(jog.tool)) {
                    tool = head.getDefaultNozzle();
                }
                else if ("camera".equalsIgnoreCase(jog.tool)) {
                    tool = head.getDefaultCamera();
                }
                else {
                    HeadMountable n = head.getNozzle(jog.tool);
                    tool = n != null ? n : head.getDefaultNozzle();
                }
                Location current = tool.getLocation().convertToUnits(LengthUnit.Millimeters);
                Location delta = new Location(LengthUnit.Millimeters, jog.dx, jog.dy, jog.dz, jog.dc);
                Location target = current.addWithRotation(delta);
                double sp = jog.speed > 0 ? jog.speed : 1.0;
                tool.moveTo(target, sp, MotionOption.JogMotion);
                return null;
            }, broadcastCallback());
            ctx.contentType("application/json");
            ctx.result("{\"submitted\":true}");
        });

        app.post("/api/import/kicad", ViperServer::importKicad);
        app.post("/api/import", ViperServer::importKicad);
        app.get("/api/job", ctx -> {
            ctx.contentType("application/json");
            ctx.result(GSON.toJson(describeJob(currentJob)));
        });
        app.post("/api/job/placement", ViperServer::updatePlacement);
        app.post("/api/job/placement/add", ViperServer::addPlacement);
        app.post("/api/job/placement/delete", ViperServer::deletePlacement);
        app.post("/api/job/placement/batch", ViperServer::batchPlacements);
        app.post("/api/job/board-origin", ViperServer::setBoardOriginFromPlacement);
        app.get("/api/drivers/detail", ViperServer::listDrivers);
        app.post("/api/driver", ViperServer::updateDriver);
        app.get("/api/actuators/detail", ViperServer::listActuators);
        app.post("/api/actuator", ViperServer::actuateActuator);
        app.get("/api/cameras/detail", ViperServer::listCameras);
        app.post("/api/camera", ViperServer::updateCamera);
        app.get("/api/nozzles/detail", ViperServer::listNozzles);
        app.post("/api/nozzle", ViperServer::updateNozzle);
        app.post("/api/nozzletip", ViperServer::updateNozzleTip);
        app.get("/api/axes/detail", ViperServer::listAxes);
        app.post("/api/axis", ViperServer::updateAxis);
        app.get("/api/parts/detail", ViperServer::listPartsDetail);
        app.post("/api/part", ViperServer::updatePart);
        app.post("/api/part/add", ViperServer::addPart);
        app.post("/api/part/delete", ViperServer::deletePart);
        app.post("/api/parts/merge", ViperServer::mergeParts);
        app.post("/api/parts/apply-remaps", ViperServer::applyRemaps);
        app.get("/api/aliases", ViperServer::listAliases);
        app.post("/api/aliases/remove", ViperServer::removeAlias);
        app.get("/api/packages", ViperServer::listPackages);
        app.post("/api/package", ViperServer::updatePackage);
        app.post("/api/package/add", ViperServer::addPackage);
        app.post("/api/package/delete", ViperServer::deletePackage);
        app.get("/api/boards", ViperServer::listBoards);
        app.post("/api/board", ViperServer::getBoardPlacements);
        app.post("/api/board/dimensions", ViperServer::setBoardDimensions);
        app.post("/api/boards/new", ViperServer::newBoard);
        app.post("/api/boards/remove", ViperServer::removeBoard);
        app.post("/api/job/run", ViperServer::runJob);
        app.post("/api/job/abort", ViperServer::abortJob);
        app.get("/api/job/state", ctx -> {
            Map<String, Object> s = new LinkedHashMap<>();
            s.put("running", jobRunning);
            s.put("loaded", currentJob != null);
            ctx.contentType("application/json");
            ctx.result(GSON.toJson(s));
        });
        app.get("/api/config/state", ctx -> {
            ctx.contentType("application/json");
            ctx.result(GSON.toJson(configEvent()));
        });
        app.post("/api/config/save", ctx -> {
            ctx.contentType("application/json");
            try {
                // A null partId can't be serialized; normalize to "" for any
                // part-less feeder (matches setPart(null)'s behavior).
                for (Feeder f : machine.getFeeders()) {
                    if (f.getPart() == null) {
                        f.setPart(null);
                    }
                }
                // Persist edited boards to their .board.xml files.
                for (Board b : Configuration.get().getBoards()) {
                    if (b.isDirty() && b.getFile() != null) {
                        Configuration.get().saveBoard(b);
                    }
                }
                Configuration.get().save();
                configDirty = false;
                broadcast(GSON.toJson(configEvent()));
                ctx.result(GSON.toJson(configEvent()));
            }
            catch (Exception e) {
                ctx.status(500);
                ctx.result(GSON.toJson(errorMap(e)));
            }
        });
        app.get("/api/feeders", ctx -> {
            ctx.contentType("application/json");
            ctx.result(GSON.toJson(describeFeeders()));
        });
        app.get("/api/parts", ctx -> {
            List<String> parts = new ArrayList<>();
            for (Part p : Configuration.get().getParts()) {
                parts.add(p.getId());
            }
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("parts", parts);
            ctx.contentType("application/json");
            ctx.result(GSON.toJson(out));
        });
        app.post("/api/feeder", ViperServer::updateFeeder);
        app.post("/api/feeders/add", ViperServer::addFeeder);
        app.post("/api/feeders/delete", ViperServer::deleteFeeder);
        app.post("/api/feeders/reorder", ViperServer::reorderFeeders);
        app.get("/api/feeder/{id}", ViperServer::getFeederConfig);
        app.post("/api/feeder/location", ViperServer::setFeederLocation);
        app.post("/api/feeder/photon", ViperServer::setPhoton);
        app.post("/api/feeder/photon/find", ctx -> photonAction(ctx, false));
        app.post("/api/feeder/photon/feed", ctx -> photonAction(ctx, true));
        app.post("/api/feeder/strip", ViperServer::setStrip);
        app.post("/api/feeder/tray", ViperServer::setTray);
        app.post("/api/feeder/rotatedtray", ViperServer::setRotatedTray);
        app.post("/api/feeder/count", ViperServer::feederCount);
        app.post("/api/feeder/retry", ViperServer::setFeederRetry);
        app.post("/api/feeders/scan", ctx -> {
            machine.submit(() -> {
                PhotonFeeder.findAllFeeders((addr, state) -> { });
                return null;
            }, new FutureCallback<Object>() {
                @Override
                public void onSuccess(Object result) {
                    markDirty();
                    broadcast(GSON.toJson(feedersEvent()));
                }

                @Override
                public void onFailure(Throwable t) {
                    broadcast(GSON.toJson(errorMap(t)));
                }
            });
            ctx.contentType("application/json");
            ctx.result("{\"submitted\":true}");
        });
        app.post("/api/feeder/move", ViperServer::moveToFeeder);
        app.post("/api/feeder/capture", ViperServer::captureFeeder);

        // Any successful POST that edits persistent config marks it dirty.
        app.after(ctx -> {
            if (!"POST".equalsIgnoreCase(ctx.req().getMethod())) {
                return;
            }
            if (ctx.statusCode() >= 300) {
                return;
            }
            String p = ctx.path();
            boolean configPath = (p.startsWith("/api/feeder") && !p.equals("/api/feeders/scan"))
                    || p.equals("/api/job/placement")
                    || p.equals("/api/import/kicad");
            if (configPath) {
                markDirty();
            }
        });

        app.ws("/ws/events", ws -> {
            ws.onConnect(sctx -> {
                SESSIONS.add(sctx);
                sctx.send(GSON.toJson(statusSnapshot()));
            });
            ws.onClose(sctx -> SESSIONS.remove(sctx));
            ws.onError(sctx -> SESSIONS.remove(sctx));
        });

        app.start(port);
        System.out.println("[viper] ViperPNP server listening on http://localhost:" + port);
    }

    private static void setEnabled(io.javalin.http.Context ctx, boolean enabled) {
        ctx.contentType("application/json");
        try {
            machine.setEnabled(enabled);
            ctx.result(GSON.toJson(statusSnapshot()));
        }
        catch (Exception e) {
            ctx.status(500);
            ctx.result(GSON.toJson(errorMap(e)));
        }
    }

    /** Live machine state, reused by the status endpoint and the WebSocket. */
    private static Map<String, Object> statusSnapshot() {
        Map<String, Object> status = new LinkedHashMap<>();
        status.put("enabled", machine.isEnabled());
        status.put("homed", machine.isHomed());
        status.put("busy", machine.isBusy());
        status.put("position", position());
        status.put("io", ioSnapshot());
        return status;
    }

    /** On/off state of the sidebar toggles (null when the actuator can't be read). */
    private static Map<String, Object> ioSnapshot() {
        Map<String, Object> io = new LinkedHashMap<>();
        for (String t : new String[] {"vac1", "vac2", "topLight", "bottomLight"}) {
            Boolean state = null;
            try {
                Actuator a = resolveIo(t);
                if (a != null) {
                    state = a.isActuated();
                }
            }
            catch (Exception e) {
                state = null;
            }
            io.put(t, state);
        }
        return io;
    }

    /**
     * Resolves the actuator behind a sidebar toggle from the live machine, so it
     * follows the config rather than hardcoded names: vac1/vac2 = the vacuum
     * valve of nozzle 1/2; topLight = the head (down) camera light; bottomLight =
     * the first machine (up) camera light. Returns null if not present.
     */
    private static Actuator resolveIo(String target) throws Exception {
        Head head = machine.getDefaultHead();
        if ("vac1".equals(target) || "vac2".equals(target)) {
            List<Nozzle> nozzles = head.getNozzles();
            int i = "vac1".equals(target) ? 0 : 1;
            if (i < nozzles.size() && nozzles.get(i) instanceof ReferenceNozzle) {
                return ((ReferenceNozzle) nozzles.get(i)).getVacuumActuator();
            }
            return null;
        }
        if ("topLight".equals(target)) {
            Camera c = head.getDefaultCamera();
            return c != null ? c.getLightActuator() : null;
        }
        if ("bottomLight".equals(target)) {
            List<Camera> cams = machine.getCameras();
            return cams.isEmpty() ? null : cams.get(0).getLightActuator();
        }
        return null;
    }

    /**
     * POST /api/io — toggles a sidebar actuator. Body: {target: "vac1"|"vac2"|
     * "topLight"|"bottomLight", on}. Runs on the machine task thread.
     */
    private static void setIo(io.javalin.http.Context ctx) {
        ctx.contentType("application/json");
        try {
            IoRequest req = GSON.fromJson(ctx.body(), IoRequest.class);
            final Actuator act = req != null ? resolveIo(req.target) : null;
            if (act == null) {
                ctx.status(404);
                ctx.result("{\"error\":\"no actuator for that target\"}");
                return;
            }
            final boolean on = req.on;
            machine.submit(() -> {
                act.actuate(on);
                return null;
            }, broadcastCallback());
            ctx.result("{\"submitted\":true}");
        }
        catch (Exception e) {
            ctx.status(500);
            ctx.result(GSON.toJson(errorMap(e)));
        }
    }

    /** JSON body for POST /api/io. */
    private static class IoRequest {
        String target;
        boolean on;
    }

    /** Current default-nozzle position in mm, or null if unavailable. */
    private static Map<String, Object> position() {
        try {
            Nozzle nozzle = machine.getDefaultHead().getDefaultNozzle();
            Location l = nozzle.getLocation().convertToUnits(LengthUnit.Millimeters);
            Map<String, Object> pos = new LinkedHashMap<>();
            pos.put("tool", nozzle.getName());
            pos.put("x", round(l.getX()));
            pos.put("y", round(l.getY()));
            pos.put("z", round(l.getZ()));
            pos.put("c", round(l.getRotation()));
            pos.put("units", "mm");
            return pos;
        }
        catch (Exception e) {
            return null;
        }
    }

    private static double round(double v) {
        return Math.round(v * 1000.0) / 1000.0;
    }

    private static FutureCallback<Object> broadcastCallback() {
        return new FutureCallback<Object>() {
            @Override
            public void onSuccess(Object result) {
                broadcast(GSON.toJson(statusSnapshot()));
            }

            @Override
            public void onFailure(Throwable t) {
                broadcast(GSON.toJson(errorMap(t)));
            }
        };
    }

    private static Map<String, Object> errorMap(Throwable t) {
        Map<String, Object> err = new LinkedHashMap<>();
        err.put("event", "error");
        err.put("message", t.getMessage() != null ? t.getMessage() : t.toString());
        return err;
    }

    private static void broadcast(String json) {
        for (WsContext ctx : SESSIONS) {
            try {
                if (ctx.session.isOpen()) {
                    ctx.send(json);
                }
            }
            catch (Exception e) {
                SESSIONS.remove(ctx);
            }
        }
    }

    /** Pushes a fresh status snapshot to all WebSocket clients on machine events. */
    private static class StatusBroadcastListener extends MachineListener.Adapter {
        @Override
        public void machineEnabled(Machine m) {
            broadcast(GSON.toJson(statusSnapshot()));
        }

        @Override
        public void machineDisabled(Machine m, String reason) {
            broadcast(GSON.toJson(statusSnapshot()));
        }

        @Override
        public void machineHomed(Machine m, boolean isHomed) {
            broadcast(GSON.toJson(statusSnapshot()));
        }

        @Override
        public void machineBusy(Machine m, boolean busy) {
            broadcast(GSON.toJson(statusSnapshot()));
        }

        @Override
        public void machineHeadActivity(Machine m, Head head) {
            broadcast(GSON.toJson(statusSnapshot()));
        }
    }

    /** JSON body for POST /api/jog; mm deltas, 0..1 speed, and the tool to move. */
    private static class JogRequest {
        double dx;
        double dy;
        double dz;
        double dc;
        double speed;
        String tool;
    }

    /**
     * Imports a KiCad .pos file (and optional bottom file) into a Board, wraps
     * it in a single-board Job, and holds that as the current job. Reuses
     * OpenPnP's own {@link KicadPosImporter#parseFile} (a headless static
     * method — the Swing dialog only collects the file and options).
     */
    private static void importKicad(io.javalin.http.Context ctx) {
        ctx.contentType("application/json");
        try {
            ImportRequest req = GSON.fromJson(ctx.body(), ImportRequest.class);
            if (req == null || req.topFile == null || req.topFile.isEmpty()) {
                ctx.status(400);
                ctx.result("{\"error\":\"topFile is required\"}");
                return;
            }
            String fmt = req.format != null ? req.format.toLowerCase() : "kicad";
            String name = req.boardName != null && !req.boardName.trim().isEmpty()
                    ? req.boardName.trim() : boardName(req.topFile);
            File file = resolveBoardFile(req.savePath, name);
            try {
                file = file.getCanonicalFile();
            }
            catch (Exception ignore) {
                // fall back to the absolute file
            }
            // A board already lives here: let the client rename/replace/cancel.
            if (!req.replace && findBoard(file.getAbsolutePath()) != null) {
                Map<String, Object> conflict = new LinkedHashMap<>();
                conflict.put("conflict", true);
                conflict.put("name", name);
                conflict.put("file", file.getAbsolutePath());
                ctx.status(409);
                ctx.result(GSON.toJson(conflict));
                return;
            }
            Board board = new Board();
            board.setName(name);
            for (Placement p : parsePlacements(fmt, new File(req.topFile), Side.Top, req)) {
                board.addPlacement(p);
            }
            if (req.bottomFile != null && !req.bottomFile.isEmpty()) {
                for (Placement p : parsePlacements(fmt, new File(req.bottomFile), Side.Bottom, req)) {
                    board.addPlacement(p);
                }
            }
            // Any placement whose reference starts with FID is a fiducial.
            for (Placement p : board.getPlacements()) {
                if (p.getId() != null && p.getId().toUpperCase().startsWith("FID")) {
                    p.setType(Placement.Type.Fiducial);
                }
            }
            // Persist as a .board.xml file and add it to the library.
            file.getParentFile().mkdirs();
            board.setFile(file);
            Configuration.get().saveBoard(board);
            Configuration.get().addBoard(board);
            syncJob();
            Map<String, Object> resp = describeBoards();
            resp.put("pendingRemaps", pendingRemaps(board));
            resp.put("importedBoard", file.getAbsolutePath());
            ctx.result(GSON.toJson(resp));
        }
        catch (Exception e) {
            ctx.status(500);
            ctx.result(GSON.toJson(errorMap(e)));
        }
    }

    /** Dispatches to the matching OpenPnP importer's headless parseFile. */
    private static List<Placement> parsePlacements(String fmt, File file, Side side,
            ImportRequest req) throws Exception {
        switch (fmt) {
            case "eagle":
                return EagleMountsmdUlpImporter.parseFile(file, side, req.createMissingParts);
            case "csv":
                // A centroid CSV carries each part's side, so it is parsed once
                // (the per-file side is ignored); columns are auto-detected.
                return new ReferenceCsvImporter().parseCsv(file, req.createMissingParts);
            case "kicad":
                return KicadPosImporter.parseFile(file, side, true,
                        req.createMissingParts, req.useValueOnly);
            default:
                throw new Exception("Import format '" + fmt + "' is not supported yet.");
        }
    }

    /** The default boards folder, &lt;configDir&gt;/boards. */
    private static File boardsDir() {
        return new File(Configuration.get().getConfigurationDirectory(), "boards");
    }

    /** A board name from a source file path (basename without its extension). */
    private static String boardName(String path) {
        String base = new File(path).getName();
        int dot = base.indexOf('.');
        return dot > 0 ? base.substring(0, dot) : base;
    }

    /** Resolves where a board's .board.xml is written, honoring a custom path. */
    private static File resolveBoardFile(String savePath, String name) {
        String fileName = name.replaceAll("[^a-zA-Z0-9._-]", "_") + ".board.xml";
        if (savePath != null && !savePath.trim().isEmpty()) {
            String sp = savePath.trim();
            if (sp.toLowerCase().endsWith(".board.xml")) {
                return new File(sp);
            }
            return new File(sp, fileName);
        }
        return new File(boardsDir(), fileName);
    }

    /** Loads every *.board.xml under the boards folder into the library at startup. */
    private static void loadBoardsFolder() {
        File dir = boardsDir();
        dir.mkdirs();
        File[] files = dir.listFiles((d, n) -> n.toLowerCase().endsWith(".board.xml"));
        if (files == null) {
            return;
        }
        for (File f : files) {
            try {
                Configuration.get().addBoard(f);
            }
            catch (Exception e) {
                System.out.println("[viper] failed to load board " + f + ": " + e.getMessage());
            }
        }
        syncJob();
    }

    /** Board width (mm) or height (mm) from its dimensions, 0 if unset. */
    private static double boardDim(Board b, boolean width) {
        Location d = b.getDimensions();
        if (d == null) {
            return 0;
        }
        d = d.convertToUnits(LengthUnit.Millimeters);
        return round(width ? d.getX() : d.getY());
    }

    /** The board library: every loaded board with its placement/fiducial counts. */
    private static Map<String, Object> describeBoards() {
        List<Map<String, Object>> boards = new ArrayList<>();
        for (Board b : Configuration.get().getBoards()) {
            Map<String, Object> bm = new LinkedHashMap<>();
            bm.put("file", b.getFile() != null ? b.getFile().getAbsolutePath() : null);
            bm.put("name", b.getName());
            int pl = 0;
            int fid = 0;
            for (Placement p : b.getPlacements()) {
                if (p.getType() == Placement.Type.Fiducial) {
                    fid++;
                }
                else {
                    pl++;
                }
            }
            bm.put("placements", pl);
            bm.put("fiducials", fid);
            bm.put("dirty", b.isDirty());
            bm.put("width", boardDim(b, true));
            bm.put("height", boardDim(b, false));
            boards.add(bm);
        }
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("boards", boards);
        return root;
    }

    /** Finds a library board by its canonical file path. */
    private static Board findBoard(String file) {
        if (file == null) {
            return null;
        }
        for (Board b : Configuration.get().getBoards()) {
            if (b.getFile() != null && b.getFile().getAbsolutePath().equals(file)) {
                return b;
            }
        }
        return null;
    }

    /**
     * Keeps {@link #currentJob} holding one BoardLocation per library board, so
     * placement teach/origin/run all work while boards live as reusable files.
     */
    private static void syncJob() {
        // Rebuild the job from the library (only adds locations — never removes,
        // because BoardLocation.dispose() pokes the Swing GUI, which is null
        // headless). Origins/side of surviving boards are carried over by object.
        Map<Board, BoardLocation> prior = new java.util.IdentityHashMap<>();
        if (currentJob != null) {
            for (BoardLocation bl : currentJob.getBoardLocations()) {
                prior.put(bl.getBoard(), bl);
            }
        }
        Job job = new Job();
        for (Board b : Configuration.get().getBoards()) {
            BoardLocation bl = new BoardLocation(b);
            BoardLocation was = prior.get(b);
            if (was != null) {
                bl.setLocation(was.getLocation());
                bl.setGlobalSide(was.getGlobalSide());
                bl.setPlacementTransform(was.getPlacementTransform());
            }
            else {
                bl.setGlobalSide(Side.Top);
            }
            job.addBoardOrPanelLocation(bl);
        }
        currentJob = job;
    }

    /** The library board a placement request targets: by file, else the first. */
    private static Board resolveBoard(String file) {
        if (file != null && !file.isEmpty()) {
            return findBoard(file);
        }
        List<Board> lib = Configuration.get().getBoards();
        return lib.isEmpty() ? null : lib.get(0);
    }

    /** The BoardLocation in the current job that wraps the given board. */
    private static BoardLocation boardLocationFor(Board board) {
        if (currentJob == null || board == null) {
            return null;
        }
        for (BoardLocation bl : currentJob.getBoardLocations()) {
            if (bl.getBoard() == board) {
                return bl;
            }
        }
        return null;
    }

    // ---------------------------------------------------------------- Parts

    /**
     * The ids of parts that are fiducials — used only as a fiducial (never a
     * real placement or feeder) or fiducial-named (id/package starts with FID).
     * A fiducial is never picked, so it needs neither a height nor a nozzle tip.
     */
    private static Set<String> fiducialPartIds() {
        Set<String> placed = new java.util.HashSet<>();
        Set<String> fiducial = new java.util.HashSet<>();
        for (Board b : Configuration.get().getBoards()) {
            for (Placement p : b.getPlacements()) {
                if (p.getPart() == null) {
                    continue;
                }
                if (p.getType() == Placement.Type.Fiducial) {
                    fiducial.add(p.getPart().getId());
                }
                else {
                    placed.add(p.getPart().getId());
                }
            }
        }
        for (Feeder f : machine.getFeeders()) {
            if (f.getPart() != null) {
                placed.add(f.getPart().getId());
            }
        }
        Set<String> result = new java.util.HashSet<>();
        for (Part p : Configuration.get().getParts()) {
            String pkgId = p.getPackage() != null ? p.getPackage().getId() : "";
            boolean named = p.getId().toUpperCase().startsWith("FID")
                    || pkgId.toUpperCase().startsWith("FID");
            boolean usedFiducialOnly = fiducial.contains(p.getId())
                    && !placed.contains(p.getId());
            if (named || usedFiducialOnly) {
                result.add(p.getId());
            }
        }
        return result;
    }

    /** All parts with the fields the Parts page needs; hasHeight flags the issue. */
    private static Map<String, Object> describePartsDetail() {
        Set<String> fiducials = fiducialPartIds();
        List<Map<String, Object>> parts = new ArrayList<>();
        for (Part p : Configuration.get().getParts()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", p.getId());
            m.put("name", p.getName());
            double h = p.getHeight() != null
                    ? p.getHeight().convertToUnits(LengthUnit.Millimeters).getValue() : 0;
            boolean fiducial = fiducials.contains(p.getId());
            m.put("height", round(h));
            m.put("fiducial", fiducial);
            m.put("hasHeight", h > 0 || fiducial);
            m.put("package", p.getPackage() != null ? p.getPackage().getId() : null);
            m.put("speed", round(p.getSpeed()));
            parts.add(m);
        }
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("parts", parts);
        return root;
    }

    private static void listPartsDetail(io.javalin.http.Context ctx) {
        ctx.contentType("application/json");
        ctx.result(GSON.toJson(describePartsDetail()));
    }

    /** POST /api/part — update. Body: {id, name?, height?, packageId?, speed?}. */
    private static void updatePart(io.javalin.http.Context ctx) {
        ctx.contentType("application/json");
        try {
            PartUpdate req = GSON.fromJson(ctx.body(), PartUpdate.class);
            Part p = req != null ? Configuration.get().getPart(req.id) : null;
            if (p == null) {
                ctx.status(404);
                ctx.result("{\"error\":\"part not found\"}");
                return;
            }
            if (req.name != null) {
                p.setName(req.name);
            }
            if (req.height != null) {
                p.setHeight(new Length(Math.max(0, req.height), LengthUnit.Millimeters));
            }
            if (req.packageId != null) {
                p.setPackage(req.packageId.isEmpty() ? null
                        : Configuration.get().getPackage(req.packageId));
            }
            if (req.speed != null) {
                p.setSpeed(req.speed);
            }
            markDirty();
            ctx.result(GSON.toJson(describePartsDetail()));
        }
        catch (Exception e) {
            ctx.status(500);
            ctx.result(GSON.toJson(errorMap(e)));
        }
    }

    /** POST /api/part/add — create. Body: {id, name?, height?, packageId?}. */
    private static void addPart(io.javalin.http.Context ctx) {
        ctx.contentType("application/json");
        try {
            PartUpdate req = GSON.fromJson(ctx.body(), PartUpdate.class);
            if (req == null || req.id == null || req.id.trim().isEmpty()) {
                ctx.status(400);
                ctx.result("{\"error\":\"id is required\"}");
                return;
            }
            String id = req.id.trim();
            if (Configuration.get().getPart(id) != null) {
                ctx.status(409);
                ctx.result("{\"error\":\"a part with that id already exists\"}");
                return;
            }
            Part p = new Part(id);
            p.setName(req.name != null ? req.name : id);
            if (req.height != null) {
                p.setHeight(new Length(Math.max(0, req.height), LengthUnit.Millimeters));
            }
            if (req.packageId != null && !req.packageId.isEmpty()) {
                p.setPackage(Configuration.get().getPackage(req.packageId));
            }
            Configuration.get().addPart(p);
            markDirty();
            ctx.result(GSON.toJson(describePartsDetail()));
        }
        catch (Exception e) {
            ctx.status(500);
            ctx.result(GSON.toJson(errorMap(e)));
        }
    }

    /** POST /api/part/delete — Body: {id}. */
    private static void deletePart(io.javalin.http.Context ctx) {
        ctx.contentType("application/json");
        try {
            PartUpdate req = GSON.fromJson(ctx.body(), PartUpdate.class);
            Part p = req != null ? Configuration.get().getPart(req.id) : null;
            if (p == null) {
                ctx.status(404);
                ctx.result("{\"error\":\"part not found\"}");
                return;
            }
            Configuration.get().removePart(p);
            markDirty();
            ctx.result(GSON.toJson(describePartsDetail()));
        }
        catch (Exception e) {
            ctx.status(500);
            ctx.result(GSON.toJson(errorMap(e)));
        }
    }

    // ---------------------------------------------------- Connection/Driver

    /** Drivers + their comms (serial/tcp) + available ports + connection state. */
    private static Map<String, Object> describeDrivers() {
        List<Map<String, Object>> drivers = new ArrayList<>();
        for (Driver d : machine.getDrivers()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", d.getId());
            m.put("name", d.getName());
            m.put("type", d.getClass().getSimpleName());
            if (d instanceof AbstractReferenceDriver) {
                AbstractReferenceDriver rd = (AbstractReferenceDriver) d;
                m.put("commType", rd.getCommunicationsType().name());
                m.put("port", rd.getSerial().getPortName());
                m.put("baud", rd.getSerial().getBaud());
                m.put("ip", rd.getTcp().getIpAddress());
                m.put("tcpPort", rd.getTcp().getPort());
            }
            drivers.add(m);
        }
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("drivers", drivers);
        try {
            root.put("ports", SerialPortCommunications.getPortNames());
        }
        catch (Exception e) {
            root.put("ports", new ArrayList<>());
        }
        root.put("connected", machine.isEnabled());
        return root;
    }

    private static void listDrivers(io.javalin.http.Context ctx) {
        ctx.contentType("application/json");
        ctx.result(GSON.toJson(describeDrivers()));
    }

    /** POST /api/driver — Body: {id, commType?, port?, baud?, ip?, tcpPort?}. */
    private static void updateDriver(io.javalin.http.Context ctx) {
        ctx.contentType("application/json");
        try {
            DriverUpdate req = GSON.fromJson(ctx.body(), DriverUpdate.class);
            Driver found = null;
            for (Driver d : machine.getDrivers()) {
                if (req != null && d.getId().equals(req.id)) {
                    found = d;
                    break;
                }
            }
            if (!(found instanceof AbstractReferenceDriver)) {
                ctx.status(404);
                ctx.result("{\"error\":\"driver not found\"}");
                return;
            }
            AbstractReferenceDriver rd = (AbstractReferenceDriver) found;
            if (req.commType != null) {
                rd.setCommunicationsType(
                        AbstractReferenceDriver.CommunicationsType.valueOf(req.commType));
            }
            if (req.port != null) {
                rd.getSerial().setPortName(req.port);
            }
            if (req.baud != null) {
                rd.getSerial().setBaud(req.baud);
            }
            if (req.ip != null) {
                rd.getTcp().setIpAddress(req.ip);
            }
            if (req.tcpPort != null) {
                rd.getTcp().setPort(req.tcpPort);
            }
            markDirty();
            ctx.result(GSON.toJson(describeDrivers()));
        }
        catch (Exception e) {
            ctx.status(500);
            ctx.result(GSON.toJson(errorMap(e)));
        }
    }

    /** JSON body for POST /api/driver. */
    private static class DriverUpdate {
        String id;
        String commType;
        String port;
        Integer baud;
        String ip;
        Integer tcpPort;
    }

    // ---------------------------------------------------- Nozzles & tips

    private static Map<String, Object> describeNozzles() {
        List<Map<String, Object>> nozzles = new ArrayList<>();
        List<Map<String, Object>> acts = new ArrayList<>();
        try {
            for (Head h : machine.getHeads()) {
                for (Nozzle n : h.getNozzles()) {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", n.getId());
                    m.put("name", n.getName());
                    m.put("mount", h.getName());
                    if (n instanceof ReferenceNozzle) {
                        ReferenceNozzle rn = (ReferenceNozzle) n;
                        m.put("vacuum", rn.getVacuumActuator() != null
                                ? rn.getVacuumActuator().getId() : "");
                        m.put("blowOff", rn.getBlowOffActuator() != null
                                ? rn.getBlowOffActuator().getId() : "");
                    }
                    m.put("tip", n.getNozzleTip() != null ? n.getNozzleTip().getName() : null);
                    nozzles.add(m);
                }
                for (Actuator a : h.getActuators()) {
                    Map<String, Object> am = new LinkedHashMap<>();
                    am.put("id", a.getId());
                    am.put("name", a.getName());
                    acts.add(am);
                }
            }
        }
        catch (Exception e) {
            // best effort
        }
        for (Actuator a : machine.getActuators()) {
            Map<String, Object> am = new LinkedHashMap<>();
            am.put("id", a.getId());
            am.put("name", a.getName());
            acts.add(am);
        }
        List<Map<String, Object>> tips = new ArrayList<>();
        for (NozzleTip nt : machine.getNozzleTips()) {
            Map<String, Object> tm = new LinkedHashMap<>();
            tm.put("id", nt.getId());
            tm.put("name", nt.getName());
            tips.add(tm);
        }
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("nozzles", nozzles);
        root.put("actuators", acts);
        root.put("nozzleTips", tips);
        return root;
    }

    private static void listNozzles(io.javalin.http.Context ctx) {
        ctx.contentType("application/json");
        ctx.result(GSON.toJson(describeNozzles()));
    }

    private static Nozzle findNozzle(String id) {
        try {
            for (Head h : machine.getHeads()) {
                for (Nozzle n : h.getNozzles()) {
                    if (n.getId().equals(id)) {
                        return n;
                    }
                }
            }
        }
        catch (Exception e) {
            // ignore
        }
        return null;
    }

    /** POST /api/nozzle — Body: {id, vacuum?(actuator id), blowOff?(actuator id)}. */
    private static void updateNozzle(io.javalin.http.Context ctx) {
        ctx.contentType("application/json");
        try {
            NozzleUpdate req = GSON.fromJson(ctx.body(), NozzleUpdate.class);
            Nozzle n = req != null ? findNozzle(req.id) : null;
            if (!(n instanceof ReferenceNozzle)) {
                ctx.status(404);
                ctx.result("{\"error\":\"nozzle not found\"}");
                return;
            }
            ReferenceNozzle rn = (ReferenceNozzle) n;
            if (req.vacuum != null) {
                rn.setVacuumActuator(req.vacuum.isEmpty() ? null : findActuator(req.vacuum));
            }
            if (req.blowOff != null) {
                rn.setBlowOffActuator(req.blowOff.isEmpty() ? null : findActuator(req.blowOff));
            }
            markDirty();
            ctx.result(GSON.toJson(describeNozzles()));
        }
        catch (Exception e) {
            ctx.status(500);
            ctx.result(GSON.toJson(errorMap(e)));
        }
    }

    /** POST /api/nozzletip — rename. Body: {id, name}. */
    private static void updateNozzleTip(io.javalin.http.Context ctx) {
        ctx.contentType("application/json");
        try {
            NozzleUpdate req = GSON.fromJson(ctx.body(), NozzleUpdate.class);
            NozzleTip found = null;
            for (NozzleTip nt : machine.getNozzleTips()) {
                if (req != null && nt.getId().equals(req.id)) {
                    found = nt;
                    break;
                }
            }
            if (found == null) {
                ctx.status(404);
                ctx.result("{\"error\":\"nozzle tip not found\"}");
                return;
            }
            if (req.name != null && !req.name.trim().isEmpty()) {
                found.setName(req.name.trim());
            }
            markDirty();
            ctx.result(GSON.toJson(describeNozzles()));
        }
        catch (Exception e) {
            ctx.status(500);
            ctx.result(GSON.toJson(errorMap(e)));
        }
    }

    /** JSON body for nozzle endpoints. */
    private static class NozzleUpdate {
        String id;
        String name;
        String vacuum;
        String blowOff;
    }

    // -------------------------------------------------------- Motion & axes

    private static double mm(Length l) {
        if (l == null) {
            return 0;
        }
        return l.convertToUnits(LengthUnit.Millimeters).getValue();
    }

    private static ReferenceControllerAxis findAxis(String id) {
        for (Axis ax : machine.getAxes()) {
            if (ax instanceof ReferenceControllerAxis && ax.getId().equals(id)) {
                return (ReferenceControllerAxis) ax;
            }
        }
        return null;
    }

    private static Map<String, Object> describeAxes() {
        List<Map<String, Object>> axes = new ArrayList<>();
        for (Axis ax : machine.getAxes()) {
            if (!(ax instanceof ReferenceControllerAxis)) {
                continue;
            }
            ReferenceControllerAxis a = (ReferenceControllerAxis) ax;
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", a.getId());
            m.put("name", a.getName());
            m.put("type", a.getType() != null ? a.getType().name() : null);
            m.put("letter", a.getLetter());
            m.put("driver", a.getDriver() != null ? a.getDriver().getName() : null);
            m.put("feedrate", mm(a.getFeedratePerSecond()));
            m.put("accel", mm(a.getAccelerationPerSecond2()));
            m.put("jerk", mm(a.getJerkPerSecond3()));
            m.put("limitLow", mm(a.getSoftLimitLow()));
            m.put("limitLowOn", a.isSoftLimitLowEnabled());
            m.put("limitHigh", mm(a.getSoftLimitHigh()));
            m.put("limitHighOn", a.isSoftLimitHighEnabled());
            axes.add(m);
        }
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("axes", axes);
        return root;
    }

    private static void listAxes(io.javalin.http.Context ctx) {
        ctx.contentType("application/json");
        ctx.result(GSON.toJson(describeAxes()));
    }

    /** POST /api/axis — Body: {id, feedrate?, accel?, jerk?, limitLow?, limitLowOn?, limitHigh?, limitHighOn?}. */
    private static void updateAxis(io.javalin.http.Context ctx) {
        ctx.contentType("application/json");
        try {
            AxisUpdate req = GSON.fromJson(ctx.body(), AxisUpdate.class);
            ReferenceControllerAxis a = req != null ? findAxis(req.id) : null;
            if (a == null) {
                ctx.status(404);
                ctx.result("{\"error\":\"axis not found\"}");
                return;
            }
            if (req.feedrate != null) {
                a.setFeedratePerSecond(new Length(req.feedrate, LengthUnit.Millimeters));
            }
            if (req.accel != null) {
                a.setAccelerationPerSecond2(new Length(req.accel, LengthUnit.Millimeters));
            }
            if (req.jerk != null) {
                a.setJerkPerSecond3(new Length(req.jerk, LengthUnit.Millimeters));
            }
            if (req.limitLow != null) {
                a.setSoftLimitLow(new Length(req.limitLow, LengthUnit.Millimeters));
            }
            if (req.limitLowOn != null) {
                a.setSoftLimitLowEnabled(req.limitLowOn);
            }
            if (req.limitHigh != null) {
                a.setSoftLimitHigh(new Length(req.limitHigh, LengthUnit.Millimeters));
            }
            if (req.limitHighOn != null) {
                a.setSoftLimitHighEnabled(req.limitHighOn);
            }
            markDirty();
            ctx.result(GSON.toJson(describeAxes()));
        }
        catch (Exception e) {
            ctx.status(500);
            ctx.result(GSON.toJson(errorMap(e)));
        }
    }

    /** JSON body for POST /api/axis. */
    private static class AxisUpdate {
        String id;
        Double feedrate;
        Double accel;
        Double jerk;
        Double limitLow;
        Double limitHigh;
        Boolean limitLowOn;
        Boolean limitHighOn;
    }

    // ------------------------------------------------------------- Cameras

    private static void addCameras(List<Map<String, Object>> out, List<Camera> list,
            String mount) {
        for (Camera c : list) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", c.getId());
            m.put("name", c.getName());
            m.put("mount", mount);
            m.put("looking", c.getLooking() != null ? c.getLooking().name() : "Down");
            m.put("width", c.getWidth());
            m.put("height", c.getHeight());
            Location upp = c.getUnitsPerPixel() != null
                    ? c.getUnitsPerPixel().convertToUnits(LengthUnit.Millimeters) : null;
            m.put("uppX", upp != null ? round(upp.getX()) : 0);
            m.put("uppY", upp != null ? round(upp.getY()) : 0);
            m.put("rotation", c instanceof ReferenceCamera
                    ? round(((ReferenceCamera) c).getRotation()) : 0);
            m.put("light", c.getLightActuator() != null ? c.getLightActuator().getName() : null);
            out.add(m);
        }
    }

    private static Map<String, Object> describeCameras() {
        List<Map<String, Object>> out = new ArrayList<>();
        addCameras(out, machine.getCameras(), "Machine");
        try {
            for (Head h : machine.getHeads()) {
                addCameras(out, h.getCameras(), h.getName());
            }
        }
        catch (Exception e) {
            // best effort
        }
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("cameras", out);
        return root;
    }

    private static void listCameras(io.javalin.http.Context ctx) {
        ctx.contentType("application/json");
        ctx.result(GSON.toJson(describeCameras()));
    }

    private static Camera findCamera(String id) {
        for (Camera c : machine.getCameras()) {
            if (c.getId().equals(id)) {
                return c;
            }
        }
        try {
            for (Head h : machine.getHeads()) {
                for (Camera c : h.getCameras()) {
                    if (c.getId().equals(id)) {
                        return c;
                    }
                }
            }
        }
        catch (Exception e) {
            // ignore
        }
        return null;
    }

    /** POST /api/camera — Body: {id, uppX?, uppY?, rotation?, looking?}. */
    private static void updateCamera(io.javalin.http.Context ctx) {
        ctx.contentType("application/json");
        try {
            CameraUpdate req = GSON.fromJson(ctx.body(), CameraUpdate.class);
            Camera c = req != null ? findCamera(req.id) : null;
            if (c == null) {
                ctx.status(404);
                ctx.result("{\"error\":\"camera not found\"}");
                return;
            }
            if (req.uppX != null || req.uppY != null) {
                Location cur = c.getUnitsPerPixel().convertToUnits(LengthUnit.Millimeters);
                c.setUnitsPerPixel(new Location(LengthUnit.Millimeters,
                        req.uppX != null ? req.uppX : cur.getX(),
                        req.uppY != null ? req.uppY : cur.getY(), 0, 0));
            }
            if (req.rotation != null && c instanceof ReferenceCamera) {
                ((ReferenceCamera) c).setRotation(req.rotation);
            }
            if (req.looking != null) {
                c.setLooking(Camera.Looking.valueOf(req.looking));
            }
            markDirty();
            ctx.result(GSON.toJson(describeCameras()));
        }
        catch (Exception e) {
            ctx.status(500);
            ctx.result(GSON.toJson(errorMap(e)));
        }
    }

    /** JSON body for POST /api/camera. */
    private static class CameraUpdate {
        String id;
        Double uppX;
        Double uppY;
        Double rotation;
        String looking;
    }

    // -------------------------------------------------------- Actuators / IO

    private static void putRole(Map<String, String> roles, Actuator a, String role) {
        if (a != null) {
            roles.putIfAbsent(a.getId(), role);
        }
    }

    /** Maps each actuator id to what it's wired to (nozzle vacuum, camera light…). */
    private static Map<String, String> actuatorRoles() {
        Map<String, String> roles = new LinkedHashMap<>();
        try {
            for (Head h : machine.getHeads()) {
                for (Nozzle n : h.getNozzles()) {
                    if (n instanceof ReferenceNozzle) {
                        ReferenceNozzle rn = (ReferenceNozzle) n;
                        putRole(roles, rn.getVacuumActuator(), n.getName() + " vacuum");
                        putRole(roles, rn.getVacuumSenseActuator(), n.getName() + " vacuum sense");
                        putRole(roles, rn.getBlowOffActuator(), n.getName() + " blow-off");
                    }
                }
                for (Camera c : h.getCameras()) {
                    putRole(roles, c.getLightActuator(), c.getName() + " light");
                }
            }
            for (Camera c : machine.getCameras()) {
                putRole(roles, c.getLightActuator(), c.getName() + " light");
            }
        }
        catch (Exception e) {
            // best effort
        }
        return roles;
    }

    private static void addActuators(List<Map<String, Object>> out, List<Actuator> list,
            String mount, Map<String, String> roles) {
        for (Actuator a : list) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", a.getId());
            m.put("name", a.getName());
            m.put("mount", mount);
            m.put("type", a.getValueType() != null ? a.getValueType().name() : "Boolean");
            m.put("driver", a.getDriver() != null ? a.getDriver().getName() : null);
            m.put("role", roles.get(a.getId()));
            m.put("state", a.isActuated());
            out.add(m);
        }
    }

    /** Every actuator (machine + head) with its role and current state. */
    private static Map<String, Object> describeActuators() {
        Map<String, String> roles = actuatorRoles();
        List<Map<String, Object>> out = new ArrayList<>();
        addActuators(out, machine.getActuators(), "Machine", roles);
        for (Head h : machine.getHeads()) {
            addActuators(out, h.getActuators(), h.getName(), roles);
        }
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("actuators", out);
        root.put("enabled", machine.isEnabled());
        return root;
    }

    private static void listActuators(io.javalin.http.Context ctx) {
        ctx.contentType("application/json");
        ctx.result(GSON.toJson(describeActuators()));
    }

    private static Actuator findActuator(String id) {
        for (Actuator a : machine.getActuators()) {
            if (a.getId().equals(id)) {
                return a;
            }
        }
        try {
            for (Head h : machine.getHeads()) {
                for (Actuator a : h.getActuators()) {
                    if (a.getId().equals(id)) {
                        return a;
                    }
                }
            }
        }
        catch (Exception e) {
            // ignore
        }
        return null;
    }

    /** POST /api/actuator — toggles a boolean actuator. Body: {id, on}. */
    private static void actuateActuator(io.javalin.http.Context ctx) {
        ctx.contentType("application/json");
        IoRequest req = GSON.fromJson(ctx.body(), IoRequest.class);
        final Actuator a = req != null ? findActuator(req.target) : null;
        if (a == null) {
            ctx.status(404);
            ctx.result("{\"error\":\"actuator not found\"}");
            return;
        }
        final boolean on = req.on;
        machine.submit(() -> {
            a.actuate(on);
            return null;
        }, broadcastCallback());
        ctx.result("{\"submitted\":true}");
    }

    // --------------------------------------------------------- Part aliases

    /** The alias-rules file, &lt;configDir&gt;/viper-part-aliases.json. */
    private static File aliasesFile() {
        return new File(Configuration.get().getConfigurationDirectory(),
                "viper-part-aliases.json");
    }

    @SuppressWarnings("unchecked")
    private static void loadAliases() {
        File f = aliasesFile();
        if (!f.exists()) {
            return;
        }
        try (java.io.Reader r = new java.io.FileReader(f)) {
            Map<String, String> m = GSON.fromJson(r, Map.class);
            if (m != null) {
                partAliases.putAll(m);
            }
        }
        catch (Exception e) {
            System.out.println("[viper] failed to load part aliases: " + e.getMessage());
        }
    }

    private static void saveAliases() {
        try (java.io.Writer w = new java.io.FileWriter(aliasesFile())) {
            GSON.toJson(partAliases, w);
        }
        catch (Exception e) {
            System.out.println("[viper] failed to save part aliases: " + e.getMessage());
        }
    }

    /** True if the part id is used by any board placement or any feeder. */
    private static boolean partInUse(String partId) {
        for (Board b : Configuration.get().getBoards()) {
            for (Placement p : b.getPlacements()) {
                if (p.getPart() != null && p.getPart().getId().equals(partId)) {
                    return true;
                }
            }
        }
        for (Feeder f : machine.getFeeders()) {
            if (f.getPart() != null && f.getPart().getId().equals(partId)) {
                return true;
            }
        }
        return false;
    }

    /** Reassigns every placement/feeder using {@code from} to {@code to}. */
    private static void reassignPart(String from, Part to) {
        for (Board b : Configuration.get().getBoards()) {
            boolean changed = false;
            for (Placement p : b.getPlacements()) {
                if (p.getPart() != null && p.getPart().getId().equals(from)) {
                    p.setPart(to);
                    changed = true;
                }
            }
            if (changed) {
                b.setDirty(true);
            }
        }
        for (Feeder f : machine.getFeeders()) {
            if (f.getPart() != null && f.getPart().getId().equals(from)) {
                f.setPart(to);
            }
        }
    }

    /**
     * POST /api/parts/merge — merges {from} into {to}: reassigns all placements
     * and feeders, records an alias so future imports of {from} remap to {to},
     * then deletes {from}. Body: {from, to}.
     */
    private static void mergeParts(io.javalin.http.Context ctx) {
        ctx.contentType("application/json");
        try {
            MergeRequest req = GSON.fromJson(ctx.body(), MergeRequest.class);
            Part fromP = req != null ? Configuration.get().getPart(req.from) : null;
            Part toP = req != null ? Configuration.get().getPart(req.to) : null;
            if (fromP == null || toP == null || req.from.equals(req.to)) {
                ctx.status(400);
                ctx.result("{\"error\":\"need distinct existing from and to parts\"}");
                return;
            }
            reassignPart(req.from, toP);
            partAliases.put(req.from, req.to);
            saveAliases();
            Configuration.get().removePart(fromP);
            markDirty();
            ctx.result(GSON.toJson(describePartsDetail()));
        }
        catch (Exception e) {
            ctx.status(500);
            ctx.result(GSON.toJson(errorMap(e)));
        }
    }

    /** Alias rules a just-imported board triggers: {from, to, count} per matched part. */
    private static List<Map<String, Object>> pendingRemaps(Board board) {
        Map<String, Integer> counts = new LinkedHashMap<>();
        for (Placement p : board.getPlacements()) {
            if (p.getPart() == null) {
                continue;
            }
            String id = p.getPart().getId();
            String to = partAliases.get(id);
            if (to != null && Configuration.get().getPart(to) != null) {
                counts.merge(id, 1, Integer::sum);
            }
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map.Entry<String, Integer> e : counts.entrySet()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("from", e.getKey());
            m.put("to", partAliases.get(e.getKey()));
            m.put("count", e.getValue());
            out.add(m);
        }
        return out;
    }

    /**
     * POST /api/parts/apply-remaps — applies confirmed alias remaps to a board:
     * reassigns placements from→to and deletes any now-orphaned from-part. Body:
     * {board, remaps:[{from,to}]}.
     */
    private static void applyRemaps(io.javalin.http.Context ctx) {
        ctx.contentType("application/json");
        try {
            RemapRequest req = GSON.fromJson(ctx.body(), RemapRequest.class);
            Board board = req != null ? resolveBoard(req.board) : null;
            if (board == null || req.remaps == null) {
                ctx.status(400);
                ctx.result("{\"error\":\"board and remaps are required\"}");
                return;
            }
            for (Remap r : req.remaps) {
                Part to = Configuration.get().getPart(r.to);
                if (to == null) {
                    continue;
                }
                for (Placement p : board.getPlacements()) {
                    if (p.getPart() != null && p.getPart().getId().equals(r.from)) {
                        p.setPart(to);
                    }
                }
                if (!partInUse(r.from)) {
                    Part fromP = Configuration.get().getPart(r.from);
                    if (fromP != null) {
                        Configuration.get().removePart(fromP);
                    }
                }
            }
            board.setDirty(true);
            markDirty();
            ctx.result(GSON.toJson(describeBoards()));
        }
        catch (Exception e) {
            ctx.status(500);
            ctx.result(GSON.toJson(errorMap(e)));
        }
    }

    /** GET /api/aliases — the alias rules. POST /api/aliases/remove {from} drops one. */
    private static void listAliases(io.javalin.http.Context ctx) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map.Entry<String, String> e : partAliases.entrySet()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("from", e.getKey());
            m.put("to", e.getValue());
            out.add(m);
        }
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("aliases", out);
        ctx.contentType("application/json");
        ctx.result(GSON.toJson(root));
    }

    private static void removeAlias(io.javalin.http.Context ctx) {
        ctx.contentType("application/json");
        MergeRequest req = GSON.fromJson(ctx.body(), MergeRequest.class);
        if (req != null && req.from != null) {
            partAliases.remove(req.from);
            saveAliases();
        }
        listAliases(ctx);
    }

    /** JSON body for POST /api/parts/merge and /api/aliases/remove. */
    private static class MergeRequest {
        String from;
        String to;
    }

    /** JSON body for POST /api/parts/apply-remaps. */
    private static class RemapRequest {
        String board;
        List<Remap> remaps;
    }

    private static class Remap {
        String from;
        String to;
    }

    // ------------------------------------------------------------- Packages

    /** All packages + the machine's nozzle tips; hasNozzle flags the issue. */
    private static Map<String, Object> describePackages() {
        // Packages used by a real (non-fiducial) part genuinely need a nozzle tip;
        // fiducial-only / fiducial-named / unused packages don't.
        Set<String> fiducials = fiducialPartIds();
        Set<String> realPackages = new java.util.HashSet<>();
        for (Part p : Configuration.get().getParts()) {
            if (p.getPackage() != null && !fiducials.contains(p.getId())) {
                realPackages.add(p.getPackage().getId());
            }
        }
        List<Map<String, Object>> pkgs = new ArrayList<>();
        for (Package pk : Configuration.get().getPackages()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", pk.getId());
            m.put("description", pk.getDescription());
            List<String> nts = new ArrayList<>();
            for (NozzleTip nt : pk.getCompatibleNozzleTips()) {
                nts.add(nt.getId());
            }
            m.put("nozzleTips", nts);
            boolean fiducial = pk.getId().toUpperCase().startsWith("FID")
                    || !realPackages.contains(pk.getId());
            m.put("fiducial", fiducial);
            m.put("hasNozzle", !nts.isEmpty() || fiducial);
            pkgs.add(m);
        }
        List<Map<String, Object>> allNts = new ArrayList<>();
        for (NozzleTip nt : machine.getNozzleTips()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", nt.getId());
            m.put("name", nt.getName());
            allNts.add(m);
        }
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("packages", pkgs);
        root.put("nozzleTips", allNts);
        return root;
    }

    private static void listPackages(io.javalin.http.Context ctx) {
        ctx.contentType("application/json");
        ctx.result(GSON.toJson(describePackages()));
    }

    private static NozzleTip findNozzleTip(String id) {
        for (NozzleTip nt : machine.getNozzleTips()) {
            if (nt.getId().equals(id)) {
                return nt;
            }
        }
        return null;
    }

    /** POST /api/package — Body: {id, description?, nozzleTips?:[ids]}. */
    private static void updatePackage(io.javalin.http.Context ctx) {
        ctx.contentType("application/json");
        try {
            PackageUpdate req = GSON.fromJson(ctx.body(), PackageUpdate.class);
            Package pk = req != null ? Configuration.get().getPackage(req.id) : null;
            if (pk == null) {
                ctx.status(404);
                ctx.result("{\"error\":\"package not found\"}");
                return;
            }
            if (req.description != null) {
                pk.setDescription(req.description);
            }
            if (req.nozzleTips != null) {
                for (NozzleTip nt : new ArrayList<>(pk.getCompatibleNozzleTips())) {
                    pk.removeCompatibleNozzleTip(nt);
                }
                for (String ntId : req.nozzleTips) {
                    NozzleTip nt = findNozzleTip(ntId);
                    if (nt != null) {
                        pk.addCompatibleNozzleTip(nt);
                    }
                }
            }
            markDirty();
            ctx.result(GSON.toJson(describePackages()));
        }
        catch (Exception e) {
            ctx.status(500);
            ctx.result(GSON.toJson(errorMap(e)));
        }
    }

    /** POST /api/package/add — Body: {id, description?}. */
    private static void addPackage(io.javalin.http.Context ctx) {
        ctx.contentType("application/json");
        try {
            PackageUpdate req = GSON.fromJson(ctx.body(), PackageUpdate.class);
            if (req == null || req.id == null || req.id.trim().isEmpty()) {
                ctx.status(400);
                ctx.result("{\"error\":\"id is required\"}");
                return;
            }
            String id = req.id.trim();
            if (Configuration.get().getPackage(id) != null) {
                ctx.status(409);
                ctx.result("{\"error\":\"a package with that id already exists\"}");
                return;
            }
            Package pk = new Package(id);
            if (req.description != null) {
                pk.setDescription(req.description);
            }
            Configuration.get().addPackage(pk);
            markDirty();
            ctx.result(GSON.toJson(describePackages()));
        }
        catch (Exception e) {
            ctx.status(500);
            ctx.result(GSON.toJson(errorMap(e)));
        }
    }

    /** POST /api/package/delete — Body: {id}. */
    private static void deletePackage(io.javalin.http.Context ctx) {
        ctx.contentType("application/json");
        try {
            PackageUpdate req = GSON.fromJson(ctx.body(), PackageUpdate.class);
            Package pk = req != null ? Configuration.get().getPackage(req.id) : null;
            if (pk == null) {
                ctx.status(404);
                ctx.result("{\"error\":\"package not found\"}");
                return;
            }
            Configuration.get().removePackage(pk);
            markDirty();
            ctx.result(GSON.toJson(describePackages()));
        }
        catch (Exception e) {
            ctx.status(500);
            ctx.result(GSON.toJson(errorMap(e)));
        }
    }

    /** JSON body for part endpoints. */
    private static class PartUpdate {
        String id;
        String name;
        Double height;
        String packageId;
        Double speed;
    }

    /** JSON body for package endpoints. */
    private static class PackageUpdate {
        String id;
        String description;
        List<String> nozzleTips;
    }

    /** GET /api/boards — the board library. */
    private static void listBoards(io.javalin.http.Context ctx) {
        ctx.contentType("application/json");
        ctx.result(GSON.toJson(describeBoards()));
    }

    /** POST /api/board — one board's placements. Body: {board: file}. */
    private static void getBoardPlacements(io.javalin.http.Context ctx) {
        ctx.contentType("application/json");
        BoardUpdate req = GSON.fromJson(ctx.body(), BoardUpdate.class);
        Board board = req != null ? resolveBoard(req.board) : null;
        if (board == null) {
            ctx.status(404);
            ctx.result("{\"error\":\"board not found\"}");
            return;
        }
        ctx.result(GSON.toJson(describeBoardPlacements(board)));
    }

    /** POST /api/boards/remove — drops a board from the library. Body: {board}. */
    private static void removeBoard(io.javalin.http.Context ctx) {
        ctx.contentType("application/json");
        BoardUpdate req = GSON.fromJson(ctx.body(), BoardUpdate.class);
        Board board = req != null ? resolveBoard(req.board) : null;
        if (board == null) {
            ctx.status(404);
            ctx.result("{\"error\":\"board not found\"}");
            return;
        }
        // Clear dirty so removeBoard doesn't try to pop a (headless) save dialog.
        board.setDirty(false);
        Configuration.get().removeBoard(board);
        syncJob();
        ctx.result(GSON.toJson(describeBoards()));
    }

    /**
     * Updates one placement of a board — the core of OpenPnP's board-input
     * editor. Body (all optional): {board, id, type, enabled, side,
     * errorHandling, partId, x, y, rot}. Returns the board's placements.
     */
    private static void updatePlacement(io.javalin.http.Context ctx) {
        ctx.contentType("application/json");
        try {
            PlacementUpdate req = GSON.fromJson(ctx.body(), PlacementUpdate.class);
            Board board = req != null ? resolveBoard(req.board) : null;
            Placement found = board != null ? board.getPlacements().get(req.id) : null;
            if (found == null) {
                ctx.status(404);
                ctx.result("{\"error\":\"placement not found\"}");
                return;
            }
            if (req.type != null) {
                found.setType(Placement.Type.valueOf(req.type));
            }
            if (req.enabled != null) {
                found.setEnabled(req.enabled);
            }
            if (req.side != null) {
                found.setSide(Side.valueOf(req.side));
            }
            if (req.errorHandling != null) {
                found.setErrorHandling(Placement.ErrorHandling.valueOf(req.errorHandling));
            }
            if (req.partId != null) {
                found.setPart(req.partId.isEmpty() ? null
                        : Configuration.get().getPart(req.partId));
            }
            if (req.x != null || req.y != null || req.rot != null) {
                Location l = found.getLocation().convertToUnits(LengthUnit.Millimeters);
                found.setLocation(new Location(LengthUnit.Millimeters,
                        req.x != null ? req.x : l.getX(),
                        req.y != null ? req.y : l.getY(),
                        l.getZ(),
                        req.rot != null ? req.rot : l.getRotation()));
            }
            board.setDirty(true);
            markDirty();
            ctx.result(GSON.toJson(describeBoardPlacements(board)));
        }
        catch (Exception e) {
            ctx.status(500);
            ctx.result(GSON.toJson(errorMap(e)));
        }
    }

    /**
     * POST /api/job/placement/add — adds a new placement to a board. Body:
     * {board, id?, partId?}. Returns the board's placements.
     */
    private static void addPlacement(io.javalin.http.Context ctx) {
        ctx.contentType("application/json");
        try {
            PlacementUpdate req = GSON.fromJson(ctx.body(), PlacementUpdate.class);
            Board board = req != null ? resolveBoard(req.board) : null;
            if (board == null) {
                ctx.status(400);
                ctx.result("{\"error\":\"no board loaded\"}");
                return;
            }
            String id = req.id != null && !req.id.trim().isEmpty()
                    ? req.id.trim() : nextPlacementId(board);
            Placement p = new Placement(id);
            p.setSide(Side.Top);
            p.setType(Placement.Type.Placement);
            if (req.partId != null && !req.partId.isEmpty()) {
                p.setPart(Configuration.get().getPart(req.partId));
            }
            board.addPlacement(p);
            board.setDirty(true);
            markDirty();
            ctx.result(GSON.toJson(describeBoardPlacements(board)));
        }
        catch (Exception e) {
            ctx.status(500);
            ctx.result(GSON.toJson(errorMap(e)));
        }
    }

    /** A unique reference like P1, P2 … for a newly added placement. */
    private static String nextPlacementId(Board board) {
        int n = board.getPlacements().size() + 1;
        while (board.getPlacements().get("P" + n) != null) {
            n++;
        }
        return "P" + n;
    }

    /** POST /api/job/placement/delete — removes placement(s). Body: {board, id|ids}. */
    private static void deletePlacement(io.javalin.http.Context ctx) {
        ctx.contentType("application/json");
        try {
            PlacementUpdate req = GSON.fromJson(ctx.body(), PlacementUpdate.class);
            Board board = req != null ? resolveBoard(req.board) : null;
            if (board == null) {
                ctx.status(404);
                ctx.result("{\"error\":\"board not found\"}");
                return;
            }
            List<String> ids = idsOf(req);
            boolean any = false;
            for (String id : ids) {
                Placement p = board.getPlacements().get(id);
                if (p != null) {
                    board.removePlacement(p);
                    any = true;
                }
            }
            if (any) {
                board.setDirty(true);
                markDirty();
            }
            ctx.result(GSON.toJson(describeBoardPlacements(board)));
        }
        catch (Exception e) {
            ctx.status(500);
            ctx.result(GSON.toJson(errorMap(e)));
        }
    }

    /** ids from a request: the {ids} list if present, else the single {id}. */
    private static List<String> idsOf(PlacementUpdate req) {
        if (req.ids != null && !req.ids.isEmpty()) {
            return req.ids;
        }
        List<String> out = new ArrayList<>();
        if (req.id != null) {
            out.add(req.id);
        }
        return out;
    }

    /**
     * POST /api/job/placement/batch — applies the same change to many placements.
     * Body: {board, ids:[], type?, side?, enabled?, errorHandling?}.
     */
    private static void batchPlacements(io.javalin.http.Context ctx) {
        ctx.contentType("application/json");
        try {
            PlacementUpdate req = GSON.fromJson(ctx.body(), PlacementUpdate.class);
            Board board = req != null ? resolveBoard(req.board) : null;
            if (board == null || req.ids == null) {
                ctx.status(400);
                ctx.result("{\"error\":\"board and ids are required\"}");
                return;
            }
            for (String id : req.ids) {
                Placement p = board.getPlacements().get(id);
                if (p == null) {
                    continue;
                }
                if (req.type != null) {
                    p.setType(Placement.Type.valueOf(req.type));
                }
                if (req.side != null) {
                    p.setSide(Side.valueOf(req.side));
                }
                if (req.enabled != null) {
                    p.setEnabled(req.enabled);
                }
                if (req.errorHandling != null) {
                    p.setErrorHandling(Placement.ErrorHandling.valueOf(req.errorHandling));
                }
            }
            board.setDirty(true);
            markDirty();
            ctx.result(GSON.toJson(describeBoardPlacements(board)));
        }
        catch (Exception e) {
            ctx.status(500);
            ctx.result(GSON.toJson(errorMap(e)));
        }
    }

    /** POST /api/board/dimensions — sets board size. Body: {board, width, height} (mm). */
    private static void setBoardDimensions(io.javalin.http.Context ctx) {
        ctx.contentType("application/json");
        try {
            DimRequest req = GSON.fromJson(ctx.body(), DimRequest.class);
            Board board = req != null ? resolveBoard(req.board) : null;
            if (board == null) {
                ctx.status(404);
                ctx.result("{\"error\":\"board not found\"}");
                return;
            }
            board.setDimensions(new Location(LengthUnit.Millimeters,
                    Math.max(0, req.width), Math.max(0, req.height), 0, 0));
            board.setDirty(true);
            markDirty();
            ctx.result(GSON.toJson(describeBoardPlacements(board)));
        }
        catch (Exception e) {
            ctx.status(500);
            ctx.result(GSON.toJson(errorMap(e)));
        }
    }

    /** POST /api/boards/new — creates an empty board. Body: {name, savePath?}. */
    private static void newBoard(io.javalin.http.Context ctx) {
        ctx.contentType("application/json");
        try {
            NewBoardRequest req = GSON.fromJson(ctx.body(), NewBoardRequest.class);
            if (req == null || req.name == null || req.name.trim().isEmpty()) {
                ctx.status(400);
                ctx.result("{\"error\":\"name is required\"}");
                return;
            }
            String name = req.name.trim();
            File file = resolveBoardFile(req.savePath, name);
            try {
                file = file.getCanonicalFile();
            }
            catch (Exception ignore) {
                // fall back to absolute
            }
            if (findBoard(file.getAbsolutePath()) != null) {
                Map<String, Object> conflict = new LinkedHashMap<>();
                conflict.put("conflict", true);
                conflict.put("name", name);
                conflict.put("file", file.getAbsolutePath());
                ctx.status(409);
                ctx.result(GSON.toJson(conflict));
                return;
            }
            file.getParentFile().mkdirs();
            Board board = new Board();
            board.setName(name);
            board.setFile(file);
            Configuration.get().saveBoard(board);
            Configuration.get().addBoard(board);
            syncJob();
            ctx.result(GSON.toJson(describeBoards()));
        }
        catch (Exception e) {
            ctx.status(500);
            ctx.result(GSON.toJson(errorMap(e)));
        }
    }

    /**
     * POST /api/job/board-origin — sets the board origin so the given placement
     * lands under the current camera. Body: {board, id}. Clears any fiducial-
     * derived transform, then shifts the board translation by (camera − current
     * placement machine location), keeping board Z and rotation. A single point
     * fixes the origin (translation); rotation still needs fiducials.
     */
    private static void setBoardOriginFromPlacement(io.javalin.http.Context ctx) {
        ctx.contentType("application/json");
        try {
            PlacementUpdate req = GSON.fromJson(ctx.body(), PlacementUpdate.class);
            Board board = req != null ? resolveBoard(req.board) : null;
            Placement p = board != null ? board.getPlacements().get(req.id) : null;
            BoardLocation bl = boardLocationFor(board);
            if (p == null || bl == null) {
                ctx.status(404);
                ctx.result("{\"error\":\"placement or board not found\"}");
                return;
            }
            Camera camera = machine.getDefaultHead().getDefaultCamera();
            Location cam = camera.getLocation().convertToUnits(LengthUnit.Millimeters);
            bl.setPlacementTransform(null);
            Location current = Utils2D.calculateBoardPlacementLocation(bl, p)
                    .convertToUnits(LengthUnit.Millimeters);
            Location origin = bl.getLocation().convertToUnits(LengthUnit.Millimeters);
            bl.setLocation(new Location(LengthUnit.Millimeters,
                    origin.getX() + (cam.getX() - current.getX()),
                    origin.getY() + (cam.getY() - current.getY()),
                    origin.getZ(),
                    origin.getRotation()));
            markDirty();
            ctx.result(GSON.toJson(describeBoardPlacements(board)));
        }
        catch (Exception e) {
            ctx.status(500);
            ctx.result(GSON.toJson(errorMap(e)));
        }
    }

    /** JSON body for placement endpoints. */
    private static class PlacementUpdate {
        String board;
        String id;
        List<String> ids;
        String type;
        Boolean enabled;
        String side;
        String errorHandling;
        String partId;
        Double x;
        Double y;
        Double rot;
    }

    /** JSON body for board-scoped endpoints. */
    private static class BoardUpdate {
        String board;
    }

    /** JSON body for POST /api/board/dimensions. */
    private static class DimRequest {
        String board;
        double width;
        double height;
    }

    /** JSON body for POST /api/boards/new. */
    private static class NewBoardRequest {
        String name;
        String savePath;
    }

    /**
     * POST /api/job/run — runs the current job. Body (all optional): {errorHandling:
     * "Defer"|"Alert", feederFaultLimit, maxPlacementRetries}. Defaults to Defer,
     * so a feeder fault retries and the placement is skipped rather than hard-
     * stopping the job. Progress and a final jobComplete (with the list of skipped
     * placements) are pushed over the WebSocket. The processor runs on the machine
     * task thread; next() drives motion directly there.
     */
    private static void runJob(io.javalin.http.Context ctx) {
        ctx.contentType("application/json");
        try {
            if (currentJob == null) {
                ctx.status(400);
                ctx.result("{\"error\":\"no job loaded\"}");
                return;
            }
            if (jobRunning) {
                ctx.status(409);
                ctx.result("{\"error\":\"a job is already running\"}");
                return;
            }
            JobRunRequest req = GSON.fromJson(ctx.body(), JobRunRequest.class);
            currentJob.setErrorHandling("Alert".equalsIgnoreCase(req != null ? req.errorHandling : null)
                    ? Job.ErrorHandling.Alert : Job.ErrorHandling.Defer);
            PnpJobProcessor jp = machine.getPnpJobProcessor();
            if (req != null && jp instanceof ReferencePnpJobProcessor) {
                ReferencePnpJobProcessor r = (ReferencePnpJobProcessor) jp;
                if (req.feederFaultLimit != null) {
                    r.setFeederFaultLimit(Math.max(1, req.feederFaultLimit));
                }
                if (req.maxPlacementRetries != null) {
                    r.setMaxPlacementRetries(Math.max(1, req.maxPlacementRetries));
                }
            }
            final JobProcessor.TextStatusListener tsl = text -> broadcast(GSON.toJson(jobEvent("jobStatus", text, null, false)));
            final Job job = currentJob;
            jp.addTextStatusListener(tsl);
            jp.initialize(job);
            jobProcessor = jp;
            jobAbortRequested = false;
            jobRunning = true;
            broadcast(GSON.toJson(jobEvent("jobStarted", "Job started", null, false)));
            machine.submit(() -> {
                String error = null;
                try {
                    while (jobRunning && jp.next()) {
                        // next() advances one step and drives its own motion.
                    }
                }
                catch (Exception e) {
                    error = e.getMessage() != null ? e.getMessage() : e.toString();
                }
                finally {
                    jobRunning = false;
                    jp.removeTextStatusListener(tsl);
                    broadcast(GSON.toJson(jobEvent("jobComplete", "Job complete",
                            collectSkipped(job), jobAbortRequested)));
                }
                if (error != null) {
                    broadcast(GSON.toJson(errorMap(new Exception(error))));
                }
                return null;
            }, broadcastCallback());
            ctx.result("{\"started\":true}");
        }
        catch (Exception e) {
            jobRunning = false;
            ctx.status(500);
            ctx.result(GSON.toJson(errorMap(e)));
        }
    }

    /** POST /api/job/abort — requests a graceful abort of the running job. */
    private static void abortJob(io.javalin.http.Context ctx) {
        ctx.contentType("application/json");
        if (!jobRunning) {
            ctx.result("{\"running\":false}");
            return;
        }
        jobAbortRequested = true;
        jobRunning = false;
        try {
            if (jobProcessor != null) {
                jobProcessor.abort();
            }
        }
        catch (Exception e) {
            // abort() cleans up best-effort; the run loop will exit regardless.
        }
        ctx.result("{\"aborting\":true}");
    }

    /** Builds a job WebSocket event payload. */
    private static Map<String, Object> jobEvent(String event, String text,
            List<Map<String, Object>> skipped, boolean aborted) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("event", event);
        m.put("text", text);
        m.put("running", jobRunning);
        if (skipped != null) {
            m.put("skipped", skipped);
            m.put("aborted", aborted);
        }
        return m;
    }

    /**
     * Enabled placements (type Placement) that did not end up placed — i.e. the
     * ones skipped during the run (feeder faults, alignment failures, etc.).
     */
    private static List<Map<String, Object>> collectSkipped(Job job) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (BoardLocation bl : job.getBoardLocations()) {
            for (Placement p : bl.getBoard().getPlacements()) {
                if (!p.isEnabled() || p.getType() != Placement.Type.Placement) {
                    continue;
                }
                if (!job.retrievePlacedStatus(bl, p.getId())) {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", p.getId());
                    m.put("part", p.getPart() != null ? p.getPart().getId() : null);
                    m.put("board", bl.getBoard().getName());
                    out.add(m);
                }
            }
        }
        return out;
    }

    /** JSON body for POST /api/job/run. */
    private static class JobRunRequest {
        String errorHandling;
        Integer feederFaultLimit;
        Integer maxPlacementRetries;
    }

    /** Marks the config as having unsaved changes and notifies clients. */
    private static void markDirty() {
        if (!configDirty) {
            configDirty = true;
            broadcast(GSON.toJson(configEvent()));
        }
    }

    /** WebSocket/REST payload describing the unsaved-changes state. */
    private static Map<String, Object> configEvent() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("event", "config");
        m.put("dirty", configDirty);
        return m;
    }

    /** Feeder list wrapped as a WebSocket event so clients can refresh live. */
    private static Map<String, Object> feedersEvent() {
        Map<String, Object> e = describeFeeders();
        e.put("event", "feeders");
        return e;
    }

    /**
     * Display name for a feeder. {@link PhotonFeeder#getName()} hardcodes
     * "Unconfigured PhotonFeeder" whenever the feeder has no hardwareId yet
     * (i.e. it hasn't been discovered on the bus), which throws away any name
     * the user set. Here we prefer the stored name in that case so a rename is
     * actually visible; once the feeder is discovered, its normal
     * "name (Slot: N)" form takes over again.
     */
    private static String feederName(Feeder f) {
        if (f instanceof PhotonFeeder) {
            String raw = rawFeederName(f);
            boolean hasUserName = raw != null && !raw.isEmpty()
                    && !raw.equals(PhotonFeeder.class.getSimpleName());
            if (hasUserName) {
                return raw;
            }
            String hw = ((PhotonFeeder) f).getHardwareId();
            if (hw != null && !hw.isEmpty()) {
                return hw;
            }
        }
        return f.getName();
    }

    /** Reads the stored name field on AbstractFeeder, bypassing getName() overrides. */
    private static String rawFeederName(Feeder f) {
        try {
            java.lang.reflect.Field field = AbstractFeeder.class.getDeclaredField("name");
            field.setAccessible(true);
            Object v = field.get(f);
            return v != null ? v.toString() : null;
        }
        catch (Exception e) {
            return null;
        }
    }

    /**
     * What a feeder still needs before it can be enabled. A Photon feeder's
     * isEnabled() is gated on being fully configured (hardware discovered, part,
     * slot address, offset, slot location), so ticking Active on an
     * unconfigured Photon has no effect. This lists the missing prerequisites so
     * the UI can disable the checkbox and explain why. Other feeder types are
     * always enable-able and return an empty list.
     */
    private static List<String> feederNeeds(Feeder f) {
        List<String> needs = new ArrayList<>();
        if (f instanceof PhotonFeeder) {
            PhotonFeeder pf = (PhotonFeeder) f;
            if (pf.getHardwareId() == null) {
                needs.add("hardware");
            }
            if (pf.getPart() == null) {
                needs.add("part");
            }
            if (pf.getSlotAddress() == null) {
                needs.add("slot");
            }
            else if (pf.getSlot() == null || pf.getSlot().getLocation() == null) {
                needs.add("slot location");
            }
            if (pf.getOffset() == null) {
                needs.add("offset");
            }
        }
        return needs;
    }

    /** Current feed count for feeders that track one (tray/rotated tray/strip), else null. */
    private static Integer feederFeedCount(Feeder f) {
        if (f instanceof ReferenceTrayFeeder) {
            return ((ReferenceTrayFeeder) f).getFeedCount();
        }
        if (f instanceof ReferenceRotatedTrayFeeder) {
            return ((ReferenceRotatedTrayFeeder) f).getFeedCount();
        }
        if (f instanceof ReferenceStripFeeder) {
            return ((ReferenceStripFeeder) f).getFeedCount();
        }
        return null;
    }

    /** Total part capacity, else null when unknown (e.g. a strip with no max set). */
    private static Integer feederCapacity(Feeder f) {
        if (f instanceof ReferenceTrayFeeder) {
            ReferenceTrayFeeder t = (ReferenceTrayFeeder) f;
            return t.getEffectiveTrayCountX() * t.getEffectiveTrayCountY();
        }
        if (f instanceof ReferenceRotatedTrayFeeder) {
            ReferenceRotatedTrayFeeder t = (ReferenceRotatedTrayFeeder) f;
            return t.getEffectiveTrayCountCols() * t.getEffectiveTrayCountRows();
        }
        if (f instanceof ReferenceStripFeeder) {
            int m = ((ReferenceStripFeeder) f).getMaxFeedCount();
            return m > 0 ? m : null;
        }
        return null;
    }

    private static void setFeederFeedCount(Feeder f, int n) {
        if (f instanceof ReferenceTrayFeeder) {
            ((ReferenceTrayFeeder) f).setFeedCount(n);
        }
        else if (f instanceof ReferenceRotatedTrayFeeder) {
            ((ReferenceRotatedTrayFeeder) f).setFeedCount(n);
        }
        else if (f instanceof ReferenceStripFeeder) {
            ((ReferenceStripFeeder) f).setFeedCount(n);
        }
    }

    /** Feeder list snapshot: name, type, assigned part, enabled, setup needs, parts left. */
    private static Map<String, Object> describeFeeders() {
        Map<String, Object> root = new LinkedHashMap<>();
        List<Map<String, Object>> feeders = new ArrayList<>();
        for (Feeder f : machine.getFeeders()) {
            Map<String, Object> fm = new LinkedHashMap<>();
            fm.put("id", f.getId());
            fm.put("name", feederName(f));
            fm.put("type", f.getClass().getSimpleName());
            fm.put("part", f.getPart() != null ? f.getPart().getId() : null);
            fm.put("enabled", f.isEnabled());
            List<String> needs = feederNeeds(f);
            fm.put("canEnable", needs.isEmpty());
            fm.put("needs", needs);
            Integer cap = feederCapacity(f);
            Integer fc = feederFeedCount(f);
            if (cap != null && fc != null) {
                fm.put("capacity", cap);
                fm.put("remaining", Math.max(0, cap - fc));
            }
            feeders.add(fm);
        }
        root.put("feeders", feeders);
        return root;
    }

    /** Assigns a part to a feeder and/or toggles it. Body: {id, partId?, enabled?}. */
    private static void updateFeeder(io.javalin.http.Context ctx) {
        ctx.contentType("application/json");
        try {
            FeederUpdate req = GSON.fromJson(ctx.body(), FeederUpdate.class);
            if (req == null || req.id == null) {
                ctx.status(400);
                ctx.result("{\"error\":\"missing feeder id\"}");
                return;
            }
            Feeder f = machine.getFeeder(req.id);
            if (f == null) {
                ctx.status(404);
                ctx.result("{\"error\":\"feeder not found\"}");
                return;
            }
            if (req.partId != null) {
                f.setPart(req.partId.isEmpty() ? null
                        : Configuration.get().getPart(req.partId));
            }
            if (req.enabled != null) {
                f.setEnabled(req.enabled);
            }
            if (req.name != null && !req.name.trim().isEmpty()) {
                f.setName(req.name.trim());
            }
            ctx.result(GSON.toJson(describeFeeders()));
        }
        catch (Exception e) {
            ctx.status(500);
            ctx.result(GSON.toJson(errorMap(e)));
        }
    }

    /** Adds a feeder. Body: {type: "photon"|"strip", name?, partId?}. */
    private static void addFeeder(io.javalin.http.Context ctx) {
        ctx.contentType("application/json");
        try {
            FeederAdd req = GSON.fromJson(ctx.body(), FeederAdd.class);
            String type = req != null && req.type != null ? req.type.toLowerCase() : "photon";
            Feeder f;
            switch (type) {
                case "tray":
                    f = new ReferenceTrayFeeder();
                    break;
                case "rotatedtray":
                    f = new ReferenceRotatedTrayFeeder();
                    break;
                case "strip":
                    f = new ReferenceStripFeeder();
                    break;
                default:
                    f = new PhotonFeeder();
                    break;
            }
            if (req != null && req.name != null && !req.name.isEmpty()) {
                f.setName(req.name);
            }
            // Always call setPart so partId is "" (not null) when no part is
            // assigned — a null partId can't be serialized to machine.xml.
            f.setPart(req != null && req.partId != null && !req.partId.isEmpty()
                    ? Configuration.get().getPart(req.partId) : null);
            machine.addFeeder(f);
            ctx.result(GSON.toJson(describeFeeders()));
        }
        catch (Exception e) {
            ctx.status(500);
            ctx.result(GSON.toJson(errorMap(e)));
        }
    }

    /** Removes a feeder from the machine. Body: {id}. */
    private static void deleteFeeder(io.javalin.http.Context ctx) {
        ctx.contentType("application/json");
        try {
            FeederUpdate req = GSON.fromJson(ctx.body(), FeederUpdate.class);
            Feeder f = req != null ? machine.getFeeder(req.id) : null;
            if (f == null) {
                ctx.status(404);
                ctx.result("{\"error\":\"feeder not found\"}");
                return;
            }
            machine.removeFeeder(f);
            ctx.result(GSON.toJson(describeFeeders()));
        }
        catch (Exception e) {
            ctx.status(500);
            ctx.result(GSON.toJson(errorMap(e)));
        }
    }

    /** JSON body for POST /api/feeder. */
    private static class FeederUpdate {
        String id;
        String partId;
        Boolean enabled;
        String name;
    }

    /** JSON body for POST /api/feeders/add. */
    private static class FeederAdd {
        String type;
        String name;
        String partId;
    }

    /**
     * Reorders the machine feeder list to the given id order. The feeder list is
     * an unmodifiable view, so we rebuild it via remove/add. Body: {order:[ids]}.
     */
    private static void reorderFeeders(io.javalin.http.Context ctx) {
        ctx.contentType("application/json");
        try {
            ReorderRequest req = GSON.fromJson(ctx.body(), ReorderRequest.class);
            if (req == null || req.order == null) {
                ctx.status(400);
                ctx.result("{\"error\":\"missing order\"}");
                return;
            }
            List<Feeder> current = new ArrayList<>(machine.getFeeders());
            List<Feeder> target = new ArrayList<>();
            for (String id : req.order) {
                Feeder f = machine.getFeeder(id);
                if (f != null && !target.contains(f)) {
                    target.add(f);
                }
            }
            for (Feeder f : current) {
                if (!target.contains(f)) {
                    target.add(f);
                }
            }
            for (Feeder f : current) {
                machine.removeFeeder(f);
            }
            for (Feeder f : target) {
                machine.addFeeder(f);
            }
            ctx.result(GSON.toJson(describeFeeders()));
        }
        catch (Exception e) {
            ctx.status(500);
            ctx.result(GSON.toJson(errorMap(e)));
        }
    }

    /** JSON body for POST /api/feeders/reorder. */
    private static class ReorderRequest {
        List<String> order;
    }

    /**
     * Full config for one feeder, including its editable pick location. Every
     * feeder type extends {@link ReferenceFeeder}, which carries a settable
     * X/Y/Z + rotation {@code location}; that is the universal editable field
     * the edit dialog binds to. Type-specific geometry (Photon slot/offset,
     * strip reference holes) is layered on later.
     */
    private static Map<String, Object> feederConfig(Feeder f) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", f.getId());
        m.put("name", feederName(f));
        m.put("type", f.getClass().getSimpleName());
        m.put("part", f.getPart() != null ? f.getPart().getId() : null);
        m.put("enabled", f.isEnabled());
        if (f instanceof AbstractFeeder) {
            AbstractFeeder af = (AbstractFeeder) f;
            m.put("feedRetryCount", af.getFeedRetryCount());
            m.put("pickRetryCount", af.getPickRetryCount());
        }
        if (f instanceof PhotonFeeder) {
            PhotonFeeder pf = (PhotonFeeder) f;
            Map<String, Object> ph = new LinkedHashMap<>();
            ph.put("slotAddress", pf.getSlotAddress());
            ph.put("hardwareId", pf.getHardwareId());
            ph.put("offset", locMap(pf.getOffset()));
            ph.put("slotLocation", pf.getSlot() != null ? locMap(pf.getSlot().getLocation()) : null);
            ph.put("commMaxRetry", new PhotonProperties(machine).getFeederCommunicationMaxRetry());
            m.put("photon", ph);
            m.put("editableLocation", false);
        }
        else if (f instanceof ReferenceTrayFeeder) {
            ReferenceTrayFeeder tf = (ReferenceTrayFeeder) f;
            Location off = tf.getOffsets().convertToUnits(LengthUnit.Millimeters);
            Map<String, Object> tr = new LinkedHashMap<>();
            tr.put("firstLocation", locMap(tf.getLocation()));
            tr.put("trayCountX", tf.getTrayCountX());
            tr.put("trayCountY", tf.getTrayCountY());
            tr.put("offsetX", round(off.getX()));
            tr.put("offsetY", round(off.getY()));
            tr.put("feedCount", tf.getFeedCount());
            m.put("tray", tr);
            m.put("editableLocation", false);
        }
        else if (f instanceof ReferenceRotatedTrayFeeder) {
            ReferenceRotatedTrayFeeder tf = (ReferenceRotatedTrayFeeder) f;
            Map<String, Object> tr = new LinkedHashMap<>();
            tr.put("firstLocation", locMap(tf.getLocation()));
            tr.put("firstRowLastLocation", locMap(tf.getFirstRowLastComponentLocation()));
            tr.put("lastLocation", locMap(tf.getLastComponentLocation()));
            tr.put("trayCountCols", tf.getTrayCountCols());
            tr.put("trayCountRows", tf.getTrayCountRows());
            tr.put("componentRotation", round(tf.getComponentRotationInTray()));
            tr.put("feedCount", tf.getFeedCount());
            Location off = tf.getOffsets().convertToUnits(LengthUnit.Millimeters);
            tr.put("colPitch", round(off.getX()));
            tr.put("rowPitch", round(off.getY()));
            tr.put("trayRotation", round(tf.getLocation().getRotation()));
            m.put("rotatedTray", tr);
            m.put("editableLocation", false);
        }
        else if (f instanceof ReferenceStripFeeder) {
            ReferenceStripFeeder sf = (ReferenceStripFeeder) f;
            Map<String, Object> st = new LinkedHashMap<>();
            st.put("referenceHole", locMap(sf.getReferenceHoleLocation()));
            st.put("lastHole", locMap(sf.getLastHoleLocation()));
            st.put("partPitch", round(sf.getPartPitch().convertToUnits(LengthUnit.Millimeters).getValue()));
            st.put("tapeWidth", round(sf.getTapeWidth().convertToUnits(LengthUnit.Millimeters).getValue()));
            st.put("tapeType", sf.getTapeType().name());
            st.put("feedCount", sf.getFeedCount());
            st.put("maxFeedCount", sf.getMaxFeedCount());
            m.put("strip", st);
            m.put("editableLocation", false);
        }
        else if (f instanceof ReferenceFeeder) {
            m.put("location", locMap(((ReferenceFeeder) f).getLocation()));
            m.put("editableLocation", true);
        }
        else {
            m.put("editableLocation", false);
        }
        return m;
    }

    /** Serializes a Location to an {x,y,z,rotation} map in mm, or null. */
    private static Map<String, Object> locMap(Location l) {
        if (l == null) {
            return null;
        }
        Location m = l.convertToUnits(LengthUnit.Millimeters);
        Map<String, Object> o = new LinkedHashMap<>();
        o.put("x", round(m.getX()));
        o.put("y", round(m.getY()));
        o.put("z", round(m.getZ()));
        o.put("rotation", round(m.getRotation()));
        return o;
    }

    /** A Location in mm from an {x,y,z,rotation} DTO. */
    private static Location loc(LocDto d) {
        return new Location(LengthUnit.Millimeters, d.x, d.y, d.z, d.rotation);
    }

    /** Pick location if the feeder is fully configured, else null (never throws). */
    private static Location tryPickLocation(Feeder f) {
        try {
            return f.getPickLocation();
        }
        catch (Exception e) {
            return null;
        }
    }

    /**
     * Resolves a named teachable location on a feeder: "location" (generic
     * ReferenceFeeder), "slot" (Photon slot), "refHole"/"lastHole" (strip), or
     * "pick" (computed pick location, read-only). Returns null if unresolvable.
     */
    private static Location namedLocation(Feeder f, String target) {
        String t = target == null ? "location" : target;
        switch (t) {
            case "slot":
                return f instanceof PhotonFeeder && ((PhotonFeeder) f).getSlot() != null
                        ? ((PhotonFeeder) f).getSlot().getLocation() : null;
            case "pick":
            case "offset":
                return tryPickLocation(f);
            case "refHole":
                return f instanceof ReferenceStripFeeder
                        ? ((ReferenceStripFeeder) f).getReferenceHoleLocation() : null;
            case "lastHole":
                return f instanceof ReferenceStripFeeder
                        ? ((ReferenceStripFeeder) f).getLastHoleLocation() : null;
            case "firstRowLast":
                return f instanceof ReferenceRotatedTrayFeeder
                        ? ((ReferenceRotatedTrayFeeder) f).getFirstRowLastComponentLocation() : null;
            case "lastComponent":
                return f instanceof ReferenceRotatedTrayFeeder
                        ? ((ReferenceRotatedTrayFeeder) f).getLastComponentLocation() : null;
            case "location":
            default:
                return f instanceof ReferenceFeeder ? ((ReferenceFeeder) f).getLocation() : null;
        }
    }

    /** Writes a named teachable location; returns false if the target is invalid. */
    private static boolean writeNamedLocation(Feeder f, String target, Location loc) {
        String t = target == null ? "location" : target;
        switch (t) {
            case "slot":
                if (f instanceof PhotonFeeder && ((PhotonFeeder) f).getSlot() != null) {
                    ((PhotonFeeder) f).getSlot().setLocation(loc);
                    return true;
                }
                return false;
            case "offset":
                if (f instanceof PhotonFeeder) {
                    PhotonFeeder pf = (PhotonFeeder) f;
                    if (pf.getSlot() == null || pf.getSlot().getLocation() == null) {
                        return false;
                    }
                    // loc is the absolute part position; store it relative to the slot.
                    pf.setOffset(loc.getLocalLocationRelativeTo(
                            pf.getSlot().getLocation().convertToUnits(LengthUnit.Millimeters)));
                    return true;
                }
                return false;
            case "refHole":
                if (f instanceof ReferenceStripFeeder) {
                    ((ReferenceStripFeeder) f).setReferenceHoleLocation(loc);
                    return true;
                }
                return false;
            case "lastHole":
                if (f instanceof ReferenceStripFeeder) {
                    ((ReferenceStripFeeder) f).setLastHoleLocation(loc);
                    return true;
                }
                return false;
            case "firstRowLast":
                if (f instanceof ReferenceRotatedTrayFeeder) {
                    ((ReferenceRotatedTrayFeeder) f).setFirstRowLastComponentLocation(loc);
                    return true;
                }
                return false;
            case "lastComponent":
                if (f instanceof ReferenceRotatedTrayFeeder) {
                    ((ReferenceRotatedTrayFeeder) f).setLastComponentLocation(loc);
                    return true;
                }
                return false;
            case "location":
            default:
                if (f instanceof ReferenceFeeder) {
                    ((ReferenceFeeder) f).setLocation(loc);
                    return true;
                }
                return false;
        }
    }

    /** GET /api/feeder/{id} — full config for the edit dialog. */
    private static void getFeederConfig(io.javalin.http.Context ctx) {
        ctx.contentType("application/json");
        Feeder f = machine.getFeeder(ctx.pathParam("id"));
        if (f == null) {
            ctx.status(404);
            ctx.result("{\"error\":\"feeder not found\"}");
            return;
        }
        ctx.result(GSON.toJson(feederConfig(f)));
    }

    /** POST /api/feeder/location — sets the feeder pick location. Body: {id, x, y, z, rotation}. */
    private static void setFeederLocation(io.javalin.http.Context ctx) {
        ctx.contentType("application/json");
        try {
            FeederLocation req = GSON.fromJson(ctx.body(), FeederLocation.class);
            Feeder f = req != null ? machine.getFeeder(req.id) : null;
            if (f == null) {
                ctx.status(404);
                ctx.result("{\"error\":\"feeder not found\"}");
                return;
            }
            if (!(f instanceof ReferenceFeeder)) {
                ctx.status(400);
                ctx.result("{\"error\":\"feeder has no editable location\"}");
                return;
            }
            ((ReferenceFeeder) f).setLocation(
                    new Location(LengthUnit.Millimeters, req.x, req.y, req.z, req.rotation));
            ctx.result(GSON.toJson(feederConfig(f)));
        }
        catch (Exception e) {
            ctx.status(500);
            ctx.result(GSON.toJson(errorMap(e)));
        }
    }

    /**
     * POST /api/feeder/photon — Photon config. Body: {id, slotAddress?,
     * offset?{x,y,z,rotation}, slotLocation?{x,y,z,rotation}}. The slot location
     * is shared by all feeders at that address; the offset is per-feeder.
     */
    private static void setPhoton(io.javalin.http.Context ctx) {
        ctx.contentType("application/json");
        try {
            PhotonUpdate req = GSON.fromJson(ctx.body(), PhotonUpdate.class);
            Feeder f = req != null ? machine.getFeeder(req.id) : null;
            if (!(f instanceof PhotonFeeder)) {
                ctx.status(404);
                ctx.result("{\"error\":\"photon feeder not found\"}");
                return;
            }
            PhotonFeeder pf = (PhotonFeeder) f;
            if (req.slotAddress != null) {
                pf.setSlotAddress(req.slotAddress);
            }
            if (req.offset != null) {
                pf.setOffset(loc(req.offset));
            }
            if (req.slotLocation != null) {
                if (pf.getSlot() == null) {
                    ctx.status(400);
                    ctx.result("{\"error\":\"assign a slot address before setting the slot location\"}");
                    return;
                }
                pf.getSlot().setLocation(loc(req.slotLocation));
            }
            ctx.result(GSON.toJson(feederConfig(f)));
        }
        catch (Exception e) {
            ctx.status(500);
            ctx.result(GSON.toJson(errorMap(e)));
        }
    }

    /**
     * POST /api/feeder/strip — strip-feeder tape geometry. Body: {id,
     * referenceHole?, lastHole?, partPitch?, tapeWidth?, tapeType?, feedCount?}.
     * Locations in mm; pitches/widths in mm.
     */
    private static void setStrip(io.javalin.http.Context ctx) {
        ctx.contentType("application/json");
        try {
            StripUpdate req = GSON.fromJson(ctx.body(), StripUpdate.class);
            Feeder f = req != null ? machine.getFeeder(req.id) : null;
            if (!(f instanceof ReferenceStripFeeder)) {
                ctx.status(404);
                ctx.result("{\"error\":\"strip feeder not found\"}");
                return;
            }
            ReferenceStripFeeder sf = (ReferenceStripFeeder) f;
            if (req.referenceHole != null) {
                sf.setReferenceHoleLocation(loc(req.referenceHole));
            }
            if (req.lastHole != null) {
                sf.setLastHoleLocation(loc(req.lastHole));
            }
            if (req.partPitch != null) {
                sf.setPartPitch(new Length(req.partPitch, LengthUnit.Millimeters));
            }
            if (req.tapeWidth != null) {
                sf.setTapeWidth(new Length(req.tapeWidth, LengthUnit.Millimeters));
            }
            if (req.tapeType != null) {
                sf.setTapeType(ReferenceStripFeeder.TapeType.valueOf(req.tapeType));
            }
            if (req.feedCount != null) {
                sf.setFeedCount(req.feedCount);
            }
            if (req.maxFeedCount != null) {
                sf.setMaxFeedCount(Math.max(0, req.maxFeedCount));
            }
            ctx.result(GSON.toJson(feederConfig(f)));
        }
        catch (Exception e) {
            ctx.status(500);
            ctx.result(GSON.toJson(errorMap(e)));
        }
    }

    /**
     * POST /api/feeder/tray — matrix-tray geometry. Body: {id, firstLocation?,
     * trayCountX?, trayCountY?, offsetX?, offsetY?, feedCount?}. The first
     * location is the part at index (0,0); offsets are the X/Y pitch between
     * adjacent parts. Pick location is derived from these by the core.
     */
    private static void setTray(io.javalin.http.Context ctx) {
        ctx.contentType("application/json");
        try {
            TrayUpdate req = GSON.fromJson(ctx.body(), TrayUpdate.class);
            Feeder f = req != null ? machine.getFeeder(req.id) : null;
            if (!(f instanceof ReferenceTrayFeeder)) {
                ctx.status(404);
                ctx.result("{\"error\":\"tray feeder not found\"}");
                return;
            }
            ReferenceTrayFeeder tf = (ReferenceTrayFeeder) f;
            if (req.firstLocation != null) {
                tf.setLocation(loc(req.firstLocation));
            }
            if (req.trayCountX != null) {
                tf.setTrayCountX(req.trayCountX);
            }
            if (req.trayCountY != null) {
                tf.setTrayCountY(req.trayCountY);
            }
            if (req.offsetX != null || req.offsetY != null) {
                Location cur = tf.getOffsets().convertToUnits(LengthUnit.Millimeters);
                double ox = req.offsetX != null ? req.offsetX : cur.getX();
                double oy = req.offsetY != null ? req.offsetY : cur.getY();
                tf.setOffsets(new Location(LengthUnit.Millimeters, ox, oy, 0, 0));
            }
            if (req.feedCount != null) {
                tf.setFeedCount(req.feedCount);
            }
            ctx.result(GSON.toJson(feederConfig(f)));
        }
        catch (Exception e) {
            ctx.status(500);
            ctx.result(GSON.toJson(errorMap(e)));
        }
    }

    /**
     * POST /api/feeder/rotatedtray — rotated/skewed matrix tray. Body (optional):
     * {id, firstLocation, firstRowLastLocation, lastLocation, trayCountCols,
     * trayCountRows, componentRotation, feedCount, recalculate}. The first three
     * are the 3 taught corners; with recalculate=true the row/column pitch and
     * tray rotation are derived from them (same math as OpenPnP's wizard).
     */
    private static void setRotatedTray(io.javalin.http.Context ctx) {
        ctx.contentType("application/json");
        try {
            RotatedTrayUpdate req = GSON.fromJson(ctx.body(), RotatedTrayUpdate.class);
            Feeder f = req != null ? machine.getFeeder(req.id) : null;
            if (!(f instanceof ReferenceRotatedTrayFeeder)) {
                ctx.status(404);
                ctx.result("{\"error\":\"rotated tray feeder not found\"}");
                return;
            }
            ReferenceRotatedTrayFeeder tf = (ReferenceRotatedTrayFeeder) f;
            if (req.firstLocation != null) {
                tf.setLocation(loc(req.firstLocation));
            }
            if (req.firstRowLastLocation != null) {
                tf.setFirstRowLastComponentLocation(loc(req.firstRowLastLocation));
            }
            if (req.lastLocation != null) {
                tf.setLastComponentLocation(loc(req.lastLocation));
            }
            if (req.trayCountCols != null) {
                tf.setTrayCountCols(req.trayCountCols);
            }
            if (req.trayCountRows != null) {
                tf.setTrayCountRows(req.trayCountRows);
            }
            if (req.componentRotation != null) {
                tf.setComponentRotationInTray(req.componentRotation);
            }
            if (req.feedCount != null) {
                tf.setFeedCount(req.feedCount);
            }
            if (Boolean.TRUE.equals(req.recalculate)) {
                recomputeRotatedTray(tf);
            }
            ctx.result(GSON.toJson(feederConfig(f)));
        }
        catch (Exception e) {
            ctx.status(500);
            ctx.result(GSON.toJson(errorMap(e)));
        }
    }

    /**
     * Derives the row/column pitch (offsets) and tray rotation from the three
     * taught corners and the row/column counts. Mirrors
     * ReferenceRotatedTrayFeederConfigurationWizard.calculateOffsetsAndRotation.
     */
    private static void recomputeRotatedTray(ReferenceRotatedTrayFeeder tf) {
        int nCols = tf.getTrayCountCols();
        int nRows = tf.getTrayCountRows();
        if (nCols < 1 || nRows < 1) {
            return;
        }
        Location a = tf.getLocation();
        Location b = tf.getFirstRowLastComponentLocation();
        Location c = tf.getLastComponentLocation();
        Length abLen = a.getLinearLengthTo(b);
        Length bcLen = b.getLinearLengthTo(c);
        Length colStep = nCols > 1 ? abLen.divide(nCols - 1) : new Length(0, LengthUnit.Millimeters);
        Length rowStep = nRows > 1 ? bcLen.divide(nRows - 1) : new Length(0, LengthUnit.Millimeters);
        double rowAngle = Utils2D.getAngleFromPoint(a, b);
        double colAngle = Utils2D.getAngleFromPoint(b, c);
        if (nRows > 1 && nCols > 1) {
            double check = Utils2D.normalizeAngle180(rowAngle - colAngle);
            if (check < 0) {
                rowStep = rowStep.multiply(-1);
            }
        }
        double rotDeg = a.getRotation();
        if (nCols > 1) {
            rotDeg = rowAngle;
        }
        else if (nRows > 1) {
            rotDeg = colAngle + 90;
        }
        tf.setOffsets(new Location(LengthUnit.Millimeters,
                colStep.convertToUnits(LengthUnit.Millimeters).getValue(),
                rowStep.convertToUnits(LengthUnit.Millimeters).getValue(), 0, 0));
        tf.setLocation(tf.getLocation().derive(null, null, null, rotDeg));
    }

    /**
     * POST /api/feeder/count — moves a tray/strip feeder's part counter. Body:
     * {id, op: "reset"|"advance"}. Reset goes back to the first part; advance
     * steps to the next, bounded by capacity.
     */
    private static void feederCount(io.javalin.http.Context ctx) {
        ctx.contentType("application/json");
        try {
            CountRequest req = GSON.fromJson(ctx.body(), CountRequest.class);
            Feeder f = req != null ? machine.getFeeder(req.id) : null;
            Integer fc = f != null ? feederFeedCount(f) : null;
            if (fc == null) {
                ctx.status(404);
                ctx.result("{\"error\":\"feeder has no part counter\"}");
                return;
            }
            Integer cap = feederCapacity(f);
            int next;
            if ("reset".equalsIgnoreCase(req.op)) {
                next = 0;
            }
            else if ("advance".equalsIgnoreCase(req.op)) {
                next = cap != null ? Math.min(cap, fc + 1) : fc + 1;
            }
            else {
                ctx.status(400);
                ctx.result("{\"error\":\"op must be reset or advance\"}");
                return;
            }
            setFeederFeedCount(f, next);
            ctx.result(GSON.toJson(describeFeeders()));
        }
        catch (Exception e) {
            ctx.status(500);
            ctx.result(GSON.toJson(errorMap(e)));
        }
    }

    /**
     * POST /api/feeder/retry — reliability knobs. Body: {id, feedRetryCount?,
     * pickRetryCount?, commMaxRetry?}. feed/pick retry counts are per-feeder;
     * commMaxRetry is the machine-wide Photon RS-485 retry. On a job, each feed
     * retry re-locates and re-initializes the feeder (a reconnect) before
     * retrying, so raising feedRetryCount gives reconnect-and-retry before the
     * hard stop that disables the feeder.
     */
    private static void setFeederRetry(io.javalin.http.Context ctx) {
        ctx.contentType("application/json");
        try {
            RetryUpdate req = GSON.fromJson(ctx.body(), RetryUpdate.class);
            Feeder f = req != null ? machine.getFeeder(req.id) : null;
            if (!(f instanceof AbstractFeeder)) {
                ctx.status(404);
                ctx.result("{\"error\":\"feeder not found\"}");
                return;
            }
            AbstractFeeder af = (AbstractFeeder) f;
            if (req.feedRetryCount != null) {
                af.setFeedRetryCount(Math.max(0, req.feedRetryCount));
            }
            if (req.pickRetryCount != null) {
                af.setPickRetryCount(Math.max(0, req.pickRetryCount));
            }
            if (req.commMaxRetry != null) {
                new PhotonProperties(machine).setFeederCommunicationMaxRetry(Math.max(0, req.commMaxRetry));
            }
            ctx.result(GSON.toJson(feederConfig(f)));
        }
        catch (Exception e) {
            ctx.status(500);
            ctx.result(GSON.toJson(errorMap(e)));
        }
    }

    /**
     * POST /api/feeder/photon/find — locates this Photon feeder's slot address
     * on the RS-485 bus. POST /api/feeder/photon/feed — advances the feeder by
     * one part. Both need the machine enabled and the feeder hardware present;
     * they run on the machine task thread and report errors over the WebSocket.
     */
    private static void photonAction(io.javalin.http.Context ctx, boolean feed) {
        ctx.contentType("application/json");
        FeederAction req = GSON.fromJson(ctx.body(), FeederAction.class);
        Feeder f = req != null ? machine.getFeeder(req.id) : null;
        if (!(f instanceof PhotonFeeder)) {
            ctx.status(404);
            ctx.result("{\"error\":\"photon feeder not found\"}");
            return;
        }
        final PhotonFeeder pf = (PhotonFeeder) f;
        machine.submit(() -> {
            if (feed) {
                pf.feed(machine.getDefaultHead().getDefaultNozzle());
            }
            else {
                pf.findSlotAddress();
            }
            return null;
        }, broadcastCallback());
        ctx.result("{\"submitted\":true}");
    }

    /**
     * POST /api/feeder/move — jogs a tool to a named feeder location at safe Z.
     * Body: {id, tool: "camera"|"nozzle", target?}. target defaults to "pick"
     * (the computed pick location); "slot", "refHole", "lastHole", "location"
     * address the specific teachable point. Runs on the machine task thread.
     */
    private static void moveToFeeder(io.javalin.http.Context ctx) {
        ctx.contentType("application/json");
        FeederAction req = GSON.fromJson(ctx.body(), FeederAction.class);
        Feeder f = req != null ? machine.getFeeder(req.id) : null;
        if (f == null) {
            ctx.status(404);
            ctx.result("{\"error\":\"feeder not found\"}");
            return;
        }
        String tgt = req.target != null ? req.target : "pick";
        final Location target = namedLocation(f, tgt);
        if (target == null) {
            ctx.status(400);
            ctx.result("{\"error\":\"location not set for target '" + tgt + "'\"}");
            return;
        }
        final boolean nozzle = "nozzle".equalsIgnoreCase(req.tool);
        machine.submit(() -> {
            Head head = machine.getDefaultHead();
            HeadMountable hm = nozzle ? head.getDefaultNozzle() : head.getDefaultCamera();
            MovableUtils.moveToLocationAtSafeZ(hm, target);
            return null;
        }, broadcastCallback());
        ctx.result("{\"submitted\":true}");
    }

    /**
     * POST /api/feeder/capture — writes the current tool position into a named
     * feeder location. Camera capture sets X/Y (keeps the target's existing Z,
     * since the camera can't reach pick depth); nozzle capture sets X/Y/Z.
     * Rotation is preserved. Body: {id, tool, target?}. Reads position — no motion.
     */
    private static void captureFeeder(io.javalin.http.Context ctx) {
        ctx.contentType("application/json");
        try {
            FeederAction req = GSON.fromJson(ctx.body(), FeederAction.class);
            Feeder f = req != null ? machine.getFeeder(req.id) : null;
            if (f == null) {
                ctx.status(404);
                ctx.result("{\"error\":\"feeder not found\"}");
                return;
            }
            Head head = machine.getDefaultHead();
            boolean nozzle = "nozzle".equalsIgnoreCase(req.tool);
            HeadMountable hm = nozzle ? head.getDefaultNozzle() : head.getDefaultCamera();
            Location cur = hm.getLocation().convertToUnits(LengthUnit.Millimeters);
            Location existing = namedLocation(f, req.target);
            Location prior = existing != null ? existing.convertToUnits(LengthUnit.Millimeters) : cur;
            double z = nozzle ? cur.getZ() : prior.getZ();
            Location updated = new Location(LengthUnit.Millimeters, cur.getX(), cur.getY(), z,
                    prior.getRotation());
            if (!writeNamedLocation(f, req.target, updated)) {
                ctx.status(400);
                ctx.result("{\"error\":\"cannot capture into target '" + req.target
                        + "' (for a Photon slot, assign a slot address first)\"}");
                return;
            }
            ctx.result(GSON.toJson(feederConfig(f)));
        }
        catch (Exception e) {
            ctx.status(500);
            ctx.result(GSON.toJson(errorMap(e)));
        }
    }

    /** JSON body for POST /api/feeder/location. */
    private static class FeederLocation {
        String id;
        double x;
        double y;
        double z;
        double rotation;
    }

    /** An {x,y,z,rotation} location DTO (mm). */
    private static class LocDto {
        double x;
        double y;
        double z;
        double rotation;
    }

    /** JSON body for the feeder move/capture teach actions. */
    private static class FeederAction {
        String id;
        String tool;
        String target;
    }

    /** JSON body for POST /api/feeder/photon. */
    private static class PhotonUpdate {
        String id;
        Integer slotAddress;
        LocDto offset;
        LocDto slotLocation;
    }

    /** JSON body for POST /api/feeder/strip. */
    private static class StripUpdate {
        String id;
        LocDto referenceHole;
        LocDto lastHole;
        Double partPitch;
        Double tapeWidth;
        String tapeType;
        Integer feedCount;
        Integer maxFeedCount;
    }

    /** JSON body for POST /api/feeder/retry. */
    private static class RetryUpdate {
        String id;
        Integer feedRetryCount;
        Integer pickRetryCount;
        Integer commMaxRetry;
    }

    /** JSON body for POST /api/feeder/rotatedtray. */
    private static class RotatedTrayUpdate {
        String id;
        LocDto firstLocation;
        LocDto firstRowLastLocation;
        LocDto lastLocation;
        Integer trayCountCols;
        Integer trayCountRows;
        Double componentRotation;
        Integer feedCount;
        Boolean recalculate;
    }

    /** JSON body for POST /api/feeder/count. */
    private static class CountRequest {
        String id;
        String op;
    }

    /** JSON body for POST /api/feeder/tray. */
    private static class TrayUpdate {
        String id;
        LocDto firstLocation;
        Integer trayCountX;
        Integer trayCountY;
        Double offsetX;
        Double offsetY;
        Integer feedCount;
    }

    /** JSON summary of the current job: boards, placements and distinct parts. */
    /** Serializes a single placement. */
    private static Map<String, Object> placementMap(Placement p) {
        Map<String, Object> pm = new LinkedHashMap<>();
        pm.put("id", p.getId());
        pm.put("part", p.getPart() != null ? p.getPart().getId() : null);
        pm.put("side", p.getSide() != null ? p.getSide().toString() : null);
        pm.put("type", p.getType() != null ? p.getType().toString() : "Placement");
        pm.put("enabled", p.isEnabled());
        pm.put("errorHandling", p.getErrorHandling() != null
                ? p.getErrorHandling().toString() : "Default");
        Location l = p.getLocation().convertToUnits(LengthUnit.Millimeters);
        pm.put("x", round(l.getX()));
        pm.put("y", round(l.getY()));
        pm.put("rot", round(l.getRotation()));
        return pm;
    }

    /** One board's placements — the payload for the placements popup. */
    private static Map<String, Object> describeBoardPlacements(Board board) {
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("file", board.getFile() != null ? board.getFile().getAbsolutePath() : null);
        root.put("name", board.getName());
        root.put("width", boardDim(board, true));
        root.put("height", boardDim(board, false));
        List<Map<String, Object>> placements = new ArrayList<>();
        for (Placement p : board.getPlacements()) {
            placements.add(placementMap(p));
        }
        root.put("placements", placements);
        return root;
    }

    private static Map<String, Object> describeJob(Job job) {
        Map<String, Object> root = new LinkedHashMap<>();
        if (job == null) {
            root.put("loaded", false);
            return root;
        }
        root.put("loaded", true);

        List<Map<String, Object>> boards = new ArrayList<>();
        int totalPlacements = 0;
        Set<String> parts = new TreeSet<>();
        for (BoardLocation bl : job.getBoardLocations()) {
            Board board = bl.getBoard();
            Map<String, Object> bm = new LinkedHashMap<>();
            bm.put("name", board.getName());
            bm.put("side", bl.getGlobalSide().toString());

            List<Map<String, Object>> placements = new ArrayList<>();
            for (Placement p : board.getPlacements()) {
                placements.add(placementMap(p));
                totalPlacements++;
                if (p.getPart() != null) {
                    parts.add(p.getPart().getId());
                }
            }
            bm.put("placementCount", board.getPlacements().size());
            bm.put("placements", placements);
            boards.add(bm);
        }
        root.put("boardCount", job.getBoardLocations().size());
        root.put("placementCount", totalPlacements);
        root.put("partCount", parts.size());
        root.put("parts", new ArrayList<>(parts));
        root.put("boards", boards);
        return root;
    }

    /** JSON body for POST /api/import/kicad. */
    private static class ImportRequest {
        String format;
        String topFile;
        String bottomFile;
        String savePath;
        String boardName;
        boolean replace = false;
        boolean createMissingParts = true;
        boolean useValueOnly = false;
    }

    /**
     * Builds a JSON-friendly snapshot of the static machine model: drivers,
     * heads with their nozzles and cameras, machine-level cameras, feeders and
     * actuators.
     */
    private static Map<String, Object> describeMachine(Machine m) {
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("impl", m.getClass().getName());

        List<Map<String, Object>> drivers = new ArrayList<>();
        for (Driver d : m.getDrivers()) {
            Map<String, Object> dm = new LinkedHashMap<>();
            dm.put("name", d.getName());
            dm.put("type", d.getClass().getSimpleName());
            drivers.add(dm);
        }
        root.put("drivers", drivers);

        List<Map<String, Object>> heads = new ArrayList<>();
        for (Head h : m.getHeads()) {
            Map<String, Object> hm = new LinkedHashMap<>();
            hm.put("name", h.getName());

            List<String> nozzles = new ArrayList<>();
            for (Nozzle n : h.getNozzles()) {
                nozzles.add(n.getName());
            }
            hm.put("nozzles", nozzles);

            List<String> cameras = new ArrayList<>();
            for (Camera c : h.getCameras()) {
                cameras.add(c.getName());
            }
            hm.put("cameras", cameras);
            heads.add(hm);
        }
        root.put("heads", heads);

        List<String> machineCameras = new ArrayList<>();
        for (Camera c : m.getCameras()) {
            machineCameras.add(c.getName());
        }
        root.put("machineCameras", machineCameras);

        root.put("feederCount", m.getFeeders().size());
        root.put("actuatorCount", m.getActuators().size());
        int axisCount = 0;
        for (Axis ax : m.getAxes()) {
            if (ax instanceof ReferenceControllerAxis) {
                axisCount++;
            }
        }
        root.put("axisCount", axisCount);
        return root;
    }
}
