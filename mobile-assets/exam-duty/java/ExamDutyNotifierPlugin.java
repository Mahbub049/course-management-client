package com.bubt.marksportal;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;
import org.json.JSONArray;
import org.json.JSONException;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import java.util.ArrayList;
import java.util.List;

/** Exposes real Android notification-shade reminders to the Capacitor web UI. */
@CapacitorPlugin(name = "ExamDutyNotifier")
public class ExamDutyNotifierPlugin extends Plugin {
    @PluginMethod
    public void sync(PluginCall call) {
        JSArray duties = call.getArray("duties");
        String account = call.getString("accountKey", "");
        if (account == null || account.isEmpty() || duties == null) {
            call.reject("accountKey and duties are required");
            return;
        }
        try {
            ExamDutyNotifications.sync(getContext(), account, duties);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not schedule native exam duty notifications", e);
        }
    }

    @PluginMethod
    public void getPendingAcknowledgements(PluginCall call) {
        JSObject result = new JSObject();
        result.put("sourceKeys", ExamDutyNotifications.pendingAcknowledgements(getContext()));
        result.put("accountKey", ExamDutyNotifications.currentAccount(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void confirmAcknowledgement(PluginCall call) {
        String key = call.getString("sourceKey", "");
        if (key == null || !key.startsWith("exam-duty:")) {
            call.reject("Invalid exam duty source key");
            return;
        }
        ExamDutyNotifications.confirm(getContext(), key);
        call.resolve();
    }

    @PluginMethod
    public void preview(PluginCall call) {
        try {
            final String key = ExamDutyNotifications.preview(getContext());
            // Allow Android SystemUI enough time to process the custom layout.
            // A short 500ms single check was wrongly reported as a permission
            // problem on some phones even with all categories enabled.
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                try {
                    if (ExamDutyNotifications.isActive(getContext(), key)) {
                        resolvePreview(call, ExamDutyNotifications.isCompatibilityMode(getContext()));
                        return;
                    }
                    // A custom RemoteViews layout can be rejected by Xiaomi
                    // SystemUI while posting returns success. Use a native
                    // Android BigTextStyle notification as a real fallback.
                    if (!ExamDutyNotifications.fallbackToSystem(getContext(), key)) {
                        call.reject("Android rejected both custom and standard exam-duty notifications. Open Android Studio Logcat and filter ExamDutyNotifier or NotificationService.");
                        return;
                    }
                    new Handler(Looper.getMainLooper()).postDelayed(() -> {
                        if (ExamDutyNotifications.isActive(getContext(), key)) {
                            resolvePreview(call, true);
                        } else {
                            // Don't silently remove failed previews: retain the
                            // pending record so later sync can retry delivery.
                            call.reject("Android did not confirm the standard fallback notification either. Capture Android Studio Logcat (ExamDutyNotifier / NotificationService / RemoteViews) to identify the OS rejection.");
                        }
                    }, 1700L);
                } catch (Exception e) {
                    call.reject("Exam-duty preview verification failed: " + e.getMessage(), e);
                }
            }, 1750L);
        } catch (Exception e) {
            call.reject(e.getMessage() == null ? "Could not display exam-duty preview" : e.getMessage(), e);
        }
    }

    private void resolvePreview(PluginCall call, boolean compatibilityMode) {
        JSObject result = new JSObject();
        result.put("posted", true);
        result.put("visibleInSystem", true);
        result.put("mode", compatibilityMode ? "system" : "custom");
        call.resolve(result);
    }

    @PluginMethod
    public void notificationStatus(PluginCall call) {
        try {
            ExamDutyNotifications.channel(getContext());
            String reason = ExamDutyNotifications.blockingReason(getContext());
            JSObject result = new JSObject();
            result.put("enabled", reason == null);
            result.put("reason", reason == null ? "" : reason);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Could not check Android exam-duty notification status", e);
        }
    }

    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        try {
            Intent intent;
            if (Build.VERSION.SDK_INT >= 26) {
                intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                intent.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
            } else {
                intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:" + getContext().getPackageName()));
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not open Android notification settings", e);
        }
    }

    @PluginMethod
    public void clear(PluginCall call) {
        ExamDutyNotifications.clear(getContext());
        call.resolve();
    }
}
