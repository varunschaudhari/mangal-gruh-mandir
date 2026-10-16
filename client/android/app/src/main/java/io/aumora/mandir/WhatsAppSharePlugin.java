package io.aumora.mandir;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;

import androidx.core.content.FileProvider;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;

/**
 * Sends a picture with a caption straight into one number's WhatsApp chat — the Mahaprasad
 * coupon QR to the devotee. Android's share menu can't do this: it only lists saved contacts and
 * recent chats, and devotees' numbers usually aren't saved on the counter phone.
 *
 *   share({ phone: "919822012345", text, image: <PNG as base64> })
 *     → opens WhatsApp (or WhatsApp Business) in that chat with the picture and caption ready;
 *       the counter taps Send. Rejects with code NO_WHATSAPP when neither app is installed.
 */
@CapacitorPlugin(name = "WhatsAppShare")
public class WhatsAppSharePlugin extends Plugin {
    private static final String[] APPS = { "com.whatsapp", "com.whatsapp.w4b" };
    private static final long KEEP_MS = 24L * 60 * 60 * 1000;

    @PluginMethod
    public void share(PluginCall call) {
        String phone = call.getString("phone", "").replaceAll("\\D", "");
        String text = call.getString("text", "");
        String image = call.getString("image");
        if (phone.isEmpty() || image == null) {
            call.reject("Phone number and picture are needed");
            return;
        }
        Uri uri;
        try {
            uri = savePicture(Base64.decode(image, Base64.DEFAULT));
        } catch (Exception e) {
            call.reject("Could not prepare the picture: " + e.getMessage());
            return;
        }
        for (String app : APPS) {
            Intent intent = new Intent(Intent.ACTION_SEND)
                .setType("image/png")
                .setPackage(app)
                .putExtra(Intent.EXTRA_STREAM, uri)
                .putExtra(Intent.EXTRA_TEXT, text)
                .putExtra("jid", phone + "@s.whatsapp.net")   // opens that chat instead of the contact list
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            try {
                getActivity().startActivity(intent);
                call.resolve();
                return;
            } catch (ActivityNotFoundException ignored) {
                // not installed — try the next one
            }
        }
        call.reject("WhatsApp is not installed on this phone", "NO_WHATSAPP");
    }

    // A file WhatsApp can read through the app's FileProvider (res/xml/file_paths.xml: cache-path).
    // Earlier pictures are removed after a day.
    private Uri savePicture(byte[] png) throws Exception {
        File dir = new File(getContext().getCacheDir(), "whatsapp-share");
        if (!dir.exists() && !dir.mkdirs()) throw new Exception("no cache folder");
        File[] old = dir.listFiles();
        if (old != null) {
            for (File f : old) if (System.currentTimeMillis() - f.lastModified() > KEEP_MS) f.delete();
        }
        File file = new File(dir, "mahaprasad-coupon-" + System.currentTimeMillis() + ".png");
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(png);
        }
        return FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
    }
}
