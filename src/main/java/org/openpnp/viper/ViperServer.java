package org.openpnp.viper;

import java.io.File;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.concurrent.ConcurrentHashMap;

import org.openpnp.gui.importer.KicadPosImporter;
import org.openpnp.machine.photon.PhotonFeeder;
import org.openpnp.machine.photon.PhotonProperties;
import org.openpnp.machine.reference.ReferenceFeeder;
import org.openpnp.machine.reference.ReferenceNozzle;
import org.openpnp.machine.reference.ReferencePnpJobProcessor;
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
import org.openpnp.model.Part;
import org.openpnp.model.Placement;
import org.openpnp.spi.Actuator;
import org.openpnp.spi.Camera;
import org.openpnp.spi.Driver;
import org.openpnp.spi.Feeder;
import org.openpnp.spi.Head;
import org.openpnp.spi.HeadMountable;
import org.openpnp.spi.JobProcessor;
import org.openpnp.spi.Machine;
import org.openpnp.spi.MachineListener;
import org.openpnp.spi.Nozzle;
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
        app.get("/api/job", ctx -> {
            ctx.contentType("application/json");
            ctx.result(GSON.toJson(describeJob(currentJob)));
        });
        app.post("/api/job/placement", ViperServer::updatePlacement);
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
            Board board = new Board();
            board.setName(new File(req.topFile).getName());
            for (Placement p : KicadPosImporter.parseFile(new File(req.topFile), Side.Top, true,
                    req.createMissingParts, req.useValueOnly)) {
                board.addPlacement(p);
            }
            if (req.bottomFile != null && !req.bottomFile.isEmpty()) {
                for (Placement p : KicadPosImporter.parseFile(new File(req.bottomFile), Side.Bottom, true,
                        req.createMissingParts, req.useValueOnly)) {
                    board.addPlacement(p);
                }
            }
            Job job = new Job();
            BoardLocation bl = new BoardLocation(board);
            bl.setGlobalSide(Side.Top);
            job.addBoardOrPanelLocation(bl);
            currentJob = job;
            ctx.result(GSON.toJson(describeJob(job)));
        }
        catch (Exception e) {
            ctx.status(500);
            ctx.result(GSON.toJson(errorMap(e)));
        }
    }

    /**
     * Updates a single placement in the current job (its Type and/or enabled
     * flag) — the core of OpenPnP's board-input editor. Body: {id, type?,
     * enabled?}. Returns the refreshed job.
     */
    private static void updatePlacement(io.javalin.http.Context ctx) {
        ctx.contentType("application/json");
        try {
            PlacementUpdate req = GSON.fromJson(ctx.body(), PlacementUpdate.class);
            if (currentJob == null || req == null || req.id == null) {
                ctx.status(400);
                ctx.result("{\"error\":\"no job loaded or missing placement id\"}");
                return;
            }
            Placement found = null;
            for (BoardLocation bl : currentJob.getBoardLocations()) {
                for (Placement p : bl.getBoard().getPlacements()) {
                    if (p.getId().equals(req.id)) {
                        found = p;
                        break;
                    }
                }
                if (found != null) {
                    break;
                }
            }
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
            ctx.result(GSON.toJson(describeJob(currentJob)));
        }
        catch (Exception e) {
            ctx.status(500);
            ctx.result(GSON.toJson(errorMap(e)));
        }
    }

    /** JSON body for POST /api/job/placement. */
    private static class PlacementUpdate {
        String id;
        String type;
        Boolean enabled;
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
                Map<String, Object> pm = new LinkedHashMap<>();
                pm.put("id", p.getId());
                pm.put("part", p.getPart() != null ? p.getPart().getId() : null);
                pm.put("side", p.getSide() != null ? p.getSide().toString() : null);
                pm.put("type", p.getType() != null ? p.getType().toString() : "Placement");
                pm.put("enabled", p.isEnabled());
                Location l = p.getLocation().convertToUnits(LengthUnit.Millimeters);
                pm.put("x", round(l.getX()));
                pm.put("y", round(l.getY()));
                pm.put("rot", round(l.getRotation()));
                placements.add(pm);
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
        String topFile;
        String bottomFile;
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
        return root;
    }
}
