package org.openpnp.machine.photon.protocol.commands;

import org.openpnp.machine.photon.protocol.Command;
import org.openpnp.machine.photon.protocol.ErrorTypes;
import org.openpnp.machine.photon.protocol.Packet;
import org.openpnp.machine.photon.protocol.PacketBuilder;

/**
 * Vendor-specific options command (0xBF). The firmware interprets options[0] as
 * a subcommand. Subcommands used by ViperPNP's firmware fork:
 * 0x20 = set peel-motor time (ms per 0.1mm of feed); options[1] = value, 0 = firmware default.
 * 0x21 = get peel-motor time.
 * The feeder pads/ignores unused option bytes, so only the meaningful prefix is sent.
 */
public class VendorOptions extends Command<VendorOptions.Response> {
    public static final int COMMAND_ID = 0xbf;
    public static final int SUB_SET_PEEL_TIME = 0x20;
    public static final int SUB_GET_PEEL_TIME = 0x21;
    private final int toAddress;
    private final int[] options;

    public VendorOptions(int toAddress, int... options) {
        this.toAddress = toAddress;
        this.options = options;
    }

    @Override
    public Packet toPacket() {
        PacketBuilder b = PacketBuilder.command(COMMAND_ID, toAddress);
        for (int o : options) {
            b.putByte(o);
        }
        return b.toPacket();
    }

    @Override
    protected Response decodePacket(Packet packet) {
        return new Response(packet);
    }

    public static class Response {
        public final boolean valid;
        public final int toAddress;
        public final int fromAddress;
        public final ErrorTypes error;
        /** First vendor response byte (e.g. the applied peel time), -1 if absent. */
        public final int value;

        public Response(Packet packet) {
            toAddress = packet.toAddress;
            fromAddress = packet.fromAddress;
            if (packet.payloadLength < 1) {
                valid = false;
                error = null;
                value = -1;
                return;
            }
            valid = true;
            error = ErrorTypes.fromId(packet.payload[0]);
            value = packet.payloadLength > 1 ? (packet.payload[1] & 0xFF) : -1;
        }
    }
}
