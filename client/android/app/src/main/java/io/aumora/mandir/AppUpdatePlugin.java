package io.aumora.mandir;

import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The in-app update (client/src/utils/appUpdate.js): downloads the new APK inside the app and opens
 * Android's installer for it. Before this the APK opened in a browser tab — Chrome downloaded it
 * but never started the installer, so people were left looking at a finished download.
 *
 *   download({ url, file }) → { path }     with "downloadProgress" events: { received, total } (bytes)
 *   install({ path })       → { started: true } once the installer is open, or
 *                             { needsPermission: true } after opening this app's "Install unknown apps"
 *                             setting (Android 8+, asked once); call install again when back.
 */
@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {
    private final ExecutorService worker = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url");
        String name = call.getString("file", "update.apk").replaceAll("[^A-Za-z0-9._-]", "_");
        if (url == null || !url.startsWith("https://")) {
            call.reject("The update needs an https address");
            return;
        }
        worker.execute(() -> {
            HttpURLConnection conn = null;
            try {
                File dir = updateDir();
                File[] old = dir.listFiles();   // an earlier update's file is no longer needed
                if (old != null) for (File f : old) f.delete();
                File part = new File(dir, name + ".part");
                File apk = new File(dir, name);

                conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setConnectTimeout(20000);
                conn.setReadTimeout(60000);
                conn.setRequestProperty("Cache-Control", "no-cache");
                int status = conn.getResponseCode();
                if (status != HttpURLConnection.HTTP_OK) throw new Exception("the server answered " + status);
                long total = conn.getContentLengthLong();
                long received = 0;
                long lastEvent = 0;
                try (InputStream in = new BufferedInputStream(conn.getInputStream());
                     FileOutputStream out = new FileOutputStream(part)) {
                    byte[] buf = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(buf)) != -1) {
                        out.write(buf, 0, n);
                        received += n;
                        long now = System.currentTimeMillis();
                        if (now - lastEvent > 250) {
                            lastEvent = now;
                            progress(received, total);
                        }
                    }
                }
                if (total > 0 && received != total) throw new Exception("the download stopped before the end");
                if (!part.renameTo(apk)) throw new Exception("the file could not be saved");
                progress(received, total > 0 ? total : received);

                JSObject ret = new JSObject();
                ret.put("path", apk.getAbsolutePath());
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Download failed: " + e.getMessage(), "DOWNLOAD_FAILED");
            } finally {
                if (conn != null) conn.disconnect();
            }
        });
    }

    @PluginMethod
    public void install(PluginCall call) {
        Context ctx = getContext();
        String path = call.getString("path");
        File apk = path == null ? null : new File(path);
        try {
            // Only a file this plugin downloaded
            if (apk == null || !apk.isFile() || !apk.getCanonicalPath().startsWith(updateDir().getCanonicalPath())) {
                call.reject("The downloaded update was not found — download it again", "NO_FILE");
                return;
            }
        } catch (Exception e) {
            call.reject("The downloaded update could not be read", "NO_FILE");
            return;
        }

        // Android 8+: the person allows this app to install apps once (Settings → Install unknown apps)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !ctx.getPackageManager().canRequestPackageInstalls()) {
            try {
                getActivity().startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + ctx.getPackageName())));
            } catch (ActivityNotFoundException ignored) {
                // no such settings screen on this phone — the installer itself will explain
            }
            JSObject ret = new JSObject();
            ret.put("needsPermission", true);
            call.resolve(ret);
            return;
        }

        Uri uri = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", apk);
        Intent intent = new Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            getActivity().startActivity(intent);
            JSObject ret = new JSObject();
            ret.put("started", true);
            call.resolve(ret);
        } catch (ActivityNotFoundException e) {
            call.reject("This phone has no app installer", "NO_INSTALLER");
        }
    }

    // In the app's cache (res/xml/file_paths.xml: cache-path), so the installer can read it through the FileProvider
    private File updateDir() throws Exception {
        File dir = new File(getContext().getCacheDir(), "app-update");
        if (!dir.exists() && !dir.mkdirs()) throw new Exception("no cache folder");
        return dir;
    }

    private void progress(long received, long total) {
        JSObject data = new JSObject();
        data.put("received", received);
        data.put("total", total);
        notifyListeners("downloadProgress", data);
    }
}
