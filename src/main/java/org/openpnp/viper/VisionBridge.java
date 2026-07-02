package org.openpnp.viper;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Consumer;

import javax.imageio.ImageIO;

import org.openpnp.spi.Camera;

/**
 * Headless tap for vision working images. In the Swing GUI, OpenPnP flashes each
 * vision operation's annotated working image (masks, detected features) into the
 * camera view via {@code CameraView.showFilteredImage}. Headless there is no view,
 * so the vision classes also publish here and the API layer serves/broadcasts the
 * frames to the web UI.
 */
public class VisionBridge {

    /** One published vision frame for a camera. */
    public static class VisionFrame {
        public final String cameraId;
        public final String text;
        public final long seq;
        public final long timestamp;
        private final byte[] jpeg;

        VisionFrame(String cameraId, BufferedImage image, String text, long seq)
                throws Exception {
            this.cameraId = cameraId;
            this.text = text;
            this.seq = seq;
            this.timestamp = System.currentTimeMillis();
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            ImageIO.write(image, "jpg", buf);
            this.jpeg = buf.toByteArray();
        }

        public byte[] getJpeg() {
            return jpeg;
        }
    }

    private static final Map<String, VisionFrame> FRAMES = new ConcurrentHashMap<>();
    private static final AtomicLong SEQ = new AtomicLong();
    private static volatile Consumer<VisionFrame> listener;

    /** Publishes a vision working image for a camera (no-op on nulls/errors). */
    public static void publish(Camera camera, BufferedImage image, String text) {
        if (camera == null || image == null) {
            return;
        }
        try {
            VisionFrame f = new VisionFrame(camera.getId(), image,
                    text != null ? text : "", SEQ.incrementAndGet());
            FRAMES.put(camera.getId(), f);
            Consumer<VisionFrame> l = listener;
            if (l != null) {
                l.accept(f);
            }
        }
        catch (Exception e) {
            // vision must never fail because of the viewer
        }
    }

    /** The last published frame for a camera, or null. */
    public static VisionFrame get(String cameraId) {
        return cameraId != null ? FRAMES.get(cameraId) : null;
    }

    /** Registers the (single) listener notified on each publish. */
    public static void setListener(Consumer<VisionFrame> l) {
        listener = l;
    }
}
