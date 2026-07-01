package org.openpnp.viper;

import java.io.File;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.openpnp.model.Configuration;
import org.openpnp.spi.Camera;
import org.openpnp.spi.Driver;
import org.openpnp.spi.Head;
import org.openpnp.spi.Machine;
import org.openpnp.spi.Nozzle;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;

import io.javalin.Javalin;

/**
 * ViperPNP Phase 1: an embedded HTTP/WebSocket server that wraps the headless
 * OpenPnP core. This is the backend the desktop shell (Tauri/Electron) talks to
 * over localhost. It owns the proven headless boot sequence
 * (Configuration.initialize -&gt; load -&gt; getMachine) and exposes machine state
 * as JSON, with zero Swing.
 *
 * <p>Run (dev, on the built classpath):
 * <pre>
 *   java -Dviper.port=8077 -Djava.awt.headless=true \
 *        --add-opens=java.base/java.lang=ALL-UNNAMED \
 *        --add-opens=java.desktop/java.awt=ALL-UNNAMED \
 *        org.openpnp.viper.ViperServer [configDir]
 * </pre>
 *
 * <p>Config dir defaults to ~/.openpnp2 (OpenPnP's standard location, so on a
 * real machine it picks up the live config). An optional first argument
 * overrides it.
 */
public class ViperServer {
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

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
        Machine machine = Configuration.get().getMachine();
        System.out.println("[viper] core booted headless from " + configDir + " in "
                + (System.currentTimeMillis() - t0) + " ms");

        int port = Integer.getInteger("viper.port", 8077);
        Javalin app = Javalin.create(config -> {
            config.showJavalinBanner = false;
        });

        app.get("/api/health", ctx -> ctx.result("ok"));

        app.get("/api/machine", ctx -> {
            ctx.contentType("application/json");
            ctx.result(GSON.toJson(describeMachine(machine)));
        });

        app.start(port);
        System.out.println("[viper] ViperPNP server listening on http://localhost:" + port);
        System.out.println("[viper]   GET /api/health");
        System.out.println("[viper]   GET /api/machine");
    }

    /**
     * Builds a JSON-friendly snapshot of the machine model: drivers, heads with
     * their nozzles and cameras, machine-level cameras, feeders and actuators.
     */
    private static Map<String, Object> describeMachine(Machine machine) {
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("impl", machine.getClass().getName());

        List<Map<String, Object>> drivers = new ArrayList<>();
        for (Driver d : machine.getDrivers()) {
            Map<String, Object> dm = new LinkedHashMap<>();
            dm.put("name", d.getName());
            dm.put("type", d.getClass().getSimpleName());
            drivers.add(dm);
        }
        root.put("drivers", drivers);

        List<Map<String, Object>> heads = new ArrayList<>();
        for (Head h : machine.getHeads()) {
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
        for (Camera c : machine.getCameras()) {
            machineCameras.add(c.getName());
        }
        root.put("machineCameras", machineCameras);

        root.put("feederCount", machine.getFeeders().size());
        root.put("actuatorCount", machine.getActuators().size());
        return root;
    }
}
