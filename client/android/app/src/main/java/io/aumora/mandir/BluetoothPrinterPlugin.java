package io.aumora.mandir;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothClass;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.os.Build;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.IOException;
import java.io.OutputStream;
import java.lang.reflect.Method;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Prints to a receipt printer paired over classic Bluetooth (serial port profile), e.g. the
 * Rugtek BP-03. The web side sends ready ESC/POS bytes (base64): slips are drawn as pictures there,
 * so Marathi prints on any printer.
 *
 *   listPaired()                  → { devices: [{ name, address, printer }] }  (printers first in the app)
 *   print({ address, data })      → sends the bytes; rejects with a reason the counter can show
 */
@SuppressLint("MissingPermission") // checked at run time: Android 12+ asks for "Nearby devices"
@CapacitorPlugin(
    name = "BluetoothPrinter",
    permissions = { @Permission(alias = "bluetooth", strings = { Manifest.permission.BLUETOOTH_CONNECT }) }
)
public class BluetoothPrinterPlugin extends Plugin {

    // Serial port profile — what receipt printers speak
    private static final UUID SPP = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    // Sent in small pieces with a short pause: cheap printers drop data when their buffer overflows
    private static final int CHUNK = 512;
    private static final int PAUSE_MS = 15;

    // One print at a time, off the app's main thread
    private final ExecutorService worker = Executors.newSingleThreadExecutor();

    private boolean needsPermission() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && getPermissionState("bluetooth") != PermissionState.GRANTED;
    }

    private BluetoothAdapter adapter() {
        BluetoothManager manager = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        return manager != null ? manager.getAdapter() : null;
    }

    /** True when Bluetooth can't be used — the call is then rejected with the reason. */
    private boolean unusable(PluginCall call, BluetoothAdapter adapter) {
        if (adapter == null) { call.reject("This phone has no Bluetooth", "NO_BLUETOOTH"); return true; }
        if (!adapter.isEnabled()) { call.reject("Bluetooth is off — turn it on and try again", "BLUETOOTH_OFF"); return true; }
        return false;
    }

    // ── Paired devices ─────────────────────────────────────────────────────────

    @PluginMethod
    public void listPaired(PluginCall call) {
        if (needsPermission()) { requestPermissionForAlias("bluetooth", call, "listAfterPermission"); return; }
        listPairedNow(call);
    }

    @PermissionCallback
    private void listAfterPermission(PluginCall call) {
        if (needsPermission()) { call.reject("Allow \"Nearby devices\" for this app to use the Bluetooth printer", "PERMISSION"); return; }
        listPairedNow(call);
    }

    private void listPairedNow(PluginCall call) {
        BluetoothAdapter adapter = adapter();
        if (unusable(call, adapter)) return;
        JSArray devices = new JSArray();
        for (BluetoothDevice device : adapter.getBondedDevices()) {
            JSObject item = new JSObject();
            item.put("name", device.getName() != null ? device.getName() : device.getAddress());
            item.put("address", device.getAddress());
            BluetoothClass type = device.getBluetoothClass();
            item.put("printer", type != null && type.getMajorDeviceClass() == BluetoothClass.Device.Major.IMAGING);
            devices.put(item);
        }
        JSObject result = new JSObject();
        result.put("devices", devices);
        call.resolve(result);
    }

    // ── Printing ───────────────────────────────────────────────────────────────

    @PluginMethod
    public void print(PluginCall call) {
        if (needsPermission()) { requestPermissionForAlias("bluetooth", call, "printAfterPermission"); return; }
        printNow(call);
    }

    @PermissionCallback
    private void printAfterPermission(PluginCall call) {
        if (needsPermission()) { call.reject("Allow \"Nearby devices\" for this app to use the Bluetooth printer", "PERMISSION"); return; }
        printNow(call);
    }

    private void printNow(PluginCall call) {
        String address = call.getString("address");
        String data = call.getString("data");
        if (address == null || data == null) { call.reject("Printer or print data missing", "BAD_REQUEST"); return; }
        BluetoothAdapter adapter = adapter();
        if (unusable(call, adapter)) return;
        final byte[] bytes;
        try {
            bytes = Base64.decode(data, Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            call.reject("Print data could not be read", "BAD_REQUEST");
            return;
        }
        worker.execute(() -> {
            BluetoothSocket socket = null;
            try {
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) adapter.cancelDiscovery(); // a running search slows the connection
                socket = connect(adapter.getRemoteDevice(address));
                OutputStream out = socket.getOutputStream();
                for (int i = 0; i < bytes.length; i += CHUNK) {
                    out.write(bytes, i, Math.min(CHUNK, bytes.length - i));
                    out.flush();
                    Thread.sleep(PAUSE_MS);
                }
                Thread.sleep(500); // let the printer take the last bytes before the line closes
                call.resolve();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                call.reject("Printing was interrupted", "PRINT_FAILED");
            } catch (Exception e) {
                call.reject("Printer not reachable — is it on, charged and near the phone?", "PRINT_FAILED", e);
            } finally {
                if (socket != null) {
                    try { socket.close(); } catch (IOException ignored) { /* already closed */ }
                }
            }
        });
    }

    // The usual connection first; some printers only take the insecure one or the raw channel 1
    private BluetoothSocket connect(BluetoothDevice device) throws IOException {
        IOException first;
        try {
            BluetoothSocket socket = device.createRfcommSocketToServiceRecord(SPP);
            socket.connect();
            return socket;
        } catch (IOException e) {
            first = e;
        }
        try {
            BluetoothSocket socket = device.createInsecureRfcommSocketToServiceRecord(SPP);
            socket.connect();
            return socket;
        } catch (IOException ignored) {
            // try the raw channel below
        }
        try {
            Method channel = device.getClass().getMethod("createRfcommSocket", int.class);
            BluetoothSocket socket = (BluetoothSocket) channel.invoke(device, 1);
            socket.connect();
            return socket;
        } catch (Exception ignored) {
            throw first;
        }
    }
}
