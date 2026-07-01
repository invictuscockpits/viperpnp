package org.openpnp.viper;

import java.io.File;
import java.net.URL;
import java.util.List;

import org.apache.commons.io.FileUtils;
import org.openpnp.model.Configuration;
import org.openpnp.spi.Camera;
import org.openpnp.spi.Driver;
import org.openpnp.spi.Head;
import org.openpnp.spi.Machine;
import org.openpnp.spi.Nozzle;

/**
 * ViperPNP Phase 0 proof: boot the OpenPnP core with NO Swing and enumerate the
 * machine model. Validates that the headless seam (Configuration.initialize -&gt;
 * load -&gt; getMachine) works on this machine before we build the REST/WebSocket
 * wrapper. Run headless via:
 *
 *   mvn -q compile org.codehaus.mojo:exec-maven-plugin:3.1.0:java \
 *       -Dexec.mainClass=org.openpnp.viper.HeadlessSmokeTest -Djava.awt.headless=true
 */
public class HeadlessSmokeTest {
    public static void main(String[] args) throws Exception {
        long t0 = System.currentTimeMillis();

        // Seed an isolated config dir from the bundled default config resources,
        // so the proof is deterministic and never touches the user's ~/.openpnp2.
        File dir = new File(System.getProperty("java.io.tmpdir"), "viperpnp-smoke");
        FileUtils.deleteQuietly(dir);
        dir.mkdirs();
        for (String f : new String[] { "machine.xml", "packages.xml", "parts.xml", "vision-settings.xml" }) {
            URL u = ClassLoader.getSystemResource("config/" + f);
            if (u != null) {
                FileUtils.copyURLToFile(u, new File(dir, f));
            }
        }
        System.out.println("[viper] headless=" + System.getProperty("java.awt.headless")
                + "  config dir=" + dir);

        Configuration.initialize(dir);
        Configuration.get().load();

        Machine machine = Configuration.get().getMachine();
        System.out.println("[viper] machine impl: " + machine.getClass().getName());

        List<Driver> drivers = machine.getDrivers();
        System.out.println("[viper] drivers (" + drivers.size() + "):");
        for (Driver d : drivers) {
            System.out.println("    - " + d.getName() + "  [" + d.getClass().getSimpleName() + "]");
        }

        System.out.println("[viper] heads (" + machine.getHeads().size() + "):");
        for (Head h : machine.getHeads()) {
            System.out.println("    head " + h.getName());
            for (Nozzle n : h.getNozzles()) {
                System.out.println("        nozzle " + n.getName());
            }
            for (Camera c : h.getCameras()) {
                System.out.println("        head-camera " + c.getName());
            }
        }
        System.out.println("[viper] machine-level cameras: " + machine.getCameras().size());
        System.out.println("[viper] feeders:   " + machine.getFeeders().size());
        System.out.println("[viper] actuators: " + machine.getActuators().size());

        System.out.println("[viper] OK - core booted headless in "
                + (System.currentTimeMillis() - t0) + " ms with zero Swing.");
        System.exit(0);
    }
}
