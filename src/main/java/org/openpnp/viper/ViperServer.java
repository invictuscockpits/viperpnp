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
import org.openpnp.machine.reference.driver.SerialPortCommunications;
import org.openpnp.model.Abstract2DLocatable.Side;
import org.openpnp.model.Board;
import org.openpnp.model.BoardLocation;
import org.openpnp.model.Configuration;
import org.openpnp.model.Job;
import org.openpnp.model.LengthUnit;
import org.openpnp.model.Location;
import org.openpnp.model.Motion.MotionOption;
import org.openpnp.model.Placement;
import org.openpnp.spi.Camera;
import org.openpnp.spi.Driver;
import org.openpnp.spi.Head;
import org.openpnp.spi.HeadMountable;
import org.openpnp.spi.Machine;
import org.openpnp.spi.MachineListener;
import org.openpnp.spi.Nozzle;

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

        app.post("/api/jog", ctx -> {
            JogRequest req = GSON.fromJson(ctx.body(), JogRequest.class);
            final JogRequest jog = req != null ? req : new JogRequest();
            machine.submit(() -> {
                HeadMountable tool = machine.getDefaultHead().getDefaultNozzle();
                Location current = tool.getLocation().convertToUnits(LengthUnit.Millimeters);
                Location delta = new Location(LengthUnit.Millimeters, jog.dx, jog.dy, jog.dz, jog.dc);
                Location target = current.addWithRotation(delta);
                double speed = jog.speed > 0 ? jog.speed : 1.0;
                tool.moveTo(target, speed, MotionOption.JogMotion);
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
        return status;
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

    /** JSON body for POST /api/jog; millimetre deltas plus optional 0..1 speed. */
    private static class JogRequest {
        double dx;
        double dy;
        double dz;
        double dc;
        double speed;
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
