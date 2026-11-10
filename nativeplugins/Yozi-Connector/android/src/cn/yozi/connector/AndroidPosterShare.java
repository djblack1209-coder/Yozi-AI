package cn.yozi.connector;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.ClipData;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.service.chooser.ChooserResult;
import android.util.Base64;
import androidx.core.content.FileProvider;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/** One user-selected study image per Sharesheet. Called on the UI thread. */
public final class AndroidPosterShare {
    public static final int REQUEST_CODE = 0x57E2;
    private static final int MAX_PNG_BYTES = 2_000_000; // Same poster limit as the desktop bridge.
    private static final String FILE_NAME = "Yozi-AI-study.png";
    private static final Map<Uri, AndroidPosterShare> PENDING = new HashMap<>();
    private Attempt attempt;

    public interface Result {
        void complete(String status);
    }

    private static final class Attempt {
        final Activity activity;
        final File file;
        final Intent report;
        final PendingIntent sender;
        final int flags;
        final Result result;
        boolean returned;
        Boolean selected;

        Attempt(Activity activity, File file, Intent report, PendingIntent sender, int flags, Result result) {
            this.activity = activity;
            this.file = file;
            this.report = report;
            this.sender = sender;
            this.flags = flags;
            this.result = result;
        }
    }

    public static final class Provider extends FileProvider {}

    public static final class SelectionReceiver extends BroadcastReceiver {
        @Override public void onReceive(Context context, Intent intent) {
            AndroidPosterShare share = PENDING.get(intent.getData());
            if (share == null) return;
            ComponentName component = intent.getParcelableExtra(Intent.EXTRA_CHOSEN_COMPONENT);
            boolean selected = component != null;
            if (Build.VERSION.SDK_INT >= 35) {
                ChooserResult result = intent.getParcelableExtra(Intent.EXTRA_CHOOSER_RESULT, ChooserResult.class);
                if (result != null) {
                    selected = result.getType() == ChooserResult.CHOOSER_RESULT_SELECTED_COMPONENT
                            && result.getSelectedComponent() != null;
                }
            }
            share.attempt.selected = selected;
            if (share.attempt.returned) share.finish(selected ? "selected" : "cancelled", true);
        }
    }

    public static boolean supported() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP_MR1;
    }

    public void open(Activity activity, String base64, Result result) {
        if (!supported() || activity == null || attempt != null) {
            result.complete("failed");
            return;
        }
        File image = null;
        try {
            byte[] png = posterBytes(base64);
            File folder = new File(activity.getCacheDir(), "yozi-poster-share");
            if (!folder.isDirectory() && !folder.mkdirs()) throw new IOException("Poster cache unavailable");
            image = File.createTempFile("poster-", ".png", folder);
            try (FileOutputStream output = new FileOutputStream(image)) {
                output.write(png);
            }
            Uri uri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".yozi.studyshare", image, FILE_NAME);
            Intent send = new Intent(Intent.ACTION_SEND).setType("image/png");
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.setClipData(ClipData.newRawUri(FILE_NAME, uri));
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            Intent report = new Intent(activity, SelectionReceiver.class)
                    .setData(Uri.fromParts("yozi-poster", UUID.randomUUID().toString(), null));
            int flags = PendingIntent.FLAG_ONE_SHOT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) flags |= PendingIntent.FLAG_MUTABLE;
            PendingIntent sender = PendingIntent.getBroadcast(activity, 0, report, flags);
            attempt = new Attempt(activity, image, report, sender, flags, result);
            PENDING.put(report.getData(), this);
            activity.startActivityForResult(Intent.createChooser(send, null, sender.getIntentSender()), REQUEST_CODE);
        } catch (IOException | RuntimeException failure) {
            if (attempt != null) {
                finish("failed", true);
            } else {
                if (image != null) image.delete();
                result.complete("failed");
            }
        }
    }

    private static byte[] posterBytes(String base64) {
        if (base64 == null || base64.length() > (MAX_PNG_BYTES + 2) / 3 * 4)
            throw new IllegalArgumentException("Invalid poster size");
        byte[] bytes = Base64.decode(base64, Base64.NO_WRAP);
        if (bytes.length > MAX_PNG_BYTES) throw new IllegalArgumentException("Invalid poster size");
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
        if (!"image/png".equals(bounds.outMimeType) || bounds.outWidth != 1080 || bounds.outHeight != 1440)
            throw new IllegalArgumentException("Invalid poster format");
        return bytes;
    }

    public void returned() {
        if (attempt == null) return;
        attempt.returned = true;
        if (attempt.selected != null) {
            finish(attempt.selected ? "selected" : "cancelled", true);
            return;
        }
        // The system consumes the one-shot token on selection. Its broadcast may still be queued.
        if (PendingIntent.getBroadcast(attempt.activity, 0, attempt.report,
                attempt.flags | PendingIntent.FLAG_NO_CREATE) != null) finish("cancelled", true);
    }

    public void dispose() {
        if (attempt != null) finish("cancelled", false);
    }

    private void finish(String status, boolean removeFile) {
        Attempt finished = attempt;
        attempt = null;
        PENDING.remove(finished.report.getData());
        finished.sender.cancel();
        // A receiver may still be reading if the source Activity was destroyed.
        if (removeFile) finished.file.delete();
        finished.result.complete(status);
    }
}
