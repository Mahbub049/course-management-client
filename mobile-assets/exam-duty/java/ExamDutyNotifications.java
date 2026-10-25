package com.bubt.marksportal;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.graphics.Color;
import android.graphics.Typeface;
import android.text.SpannableStringBuilder;
import android.text.Spanned;
import android.text.style.StyleSpan;
import android.text.style.RelativeSizeSpan;
import android.service.notification.StatusBarNotification;
import android.util.Log;
import android.text.format.DateFormat;
import android.widget.RemoteViews;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import org.json.JSONArray;
import org.json.JSONObject;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;

/** AlarmManager + custom RemoteViews. Persists alarms across app process exit and reboots. */
public final class ExamDutyNotifications {
    static final String PREFS = "marks_exam_duty_v1";
    static final String CHANNEL = "marks_exam_duty_channel_v1";
    static final String ACTION_SHOW = "com.bubt.marksportal.DUTY_SHOW";
    static final String ACTION_ACK = "com.bubt.marksportal.DUTY_ACK";
    static final String EXTRA_KEY = "sourceKey";
    private static final String DUTIES = "duties";
    private static final String WAITING = "acknowledgements";
    private static final String ACCOUNT = "account";
    private static final String SYSTEM_LAYOUT = "system_notification_compatibility";

    private ExamDutyNotifications() { }
    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
    private static JSONArray readArray(Context context, String key) {
        try { return new JSONArray(prefs(context).getString(key, "[]")); }
        catch (Exception ignored) { return new JSONArray(); }
    }
    private static String sourceKey(JSONObject duty) { return duty.optString("sourceKey", ""); }
    private static int id(String key) { return (key.hashCode() & 0x7fffffff) % 2000000000 + 1; }
    private static Intent alarmIntent(Context c, String key) {
        Intent intent = new Intent(c, ExamDutyActionReceiver.class);
        intent.setAction(ACTION_SHOW);
        intent.putExtra(EXTRA_KEY, key);
        return intent;
    }
    private static PendingIntent alarm(Context c, String key, int flags) {
        return PendingIntent.getBroadcast(c, id(key), alarmIntent(c, key), flags | PendingIntent.FLAG_IMMUTABLE);
    }
    private static boolean allowed(Context c) {
        return Build.VERSION.SDK_INT < 33 || c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }
    /** Return an actionable reason rather than silently pretending to post. */
    static String blockingReason(Context c) {
        if (!allowed(c)) {
            return "Android notification permission is denied. Allow BUBT Portal notifications in the phone's app settings.";
        }
        if (!NotificationManagerCompat.from(c).areNotificationsEnabled()) {
            return "BUBT Portal notifications are switched off in Android settings.";
        }
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager manager = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager == null) return "Android notification manager is unavailable.";
            NotificationChannel dutyChannel = manager.getNotificationChannel(CHANNEL);
            if (dutyChannel != null && dutyChannel.getImportance() == NotificationManager.IMPORTANCE_NONE) {
                return "The 'Exam duty reminders' notification category is turned off. Enable it in BUBT Portal notification settings.";
            }
        }
        return null;
    }

    /** An Android system check, not merely an assumption that notify() succeeded. */
    static boolean isActive(Context c, String key) {
        if (Build.VERSION.SDK_INT < 23) return true;
        NotificationManager manager = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return false;
        try {
            StatusBarNotification[] active = manager.getActiveNotifications();
            for (StatusBarNotification item : active) {
                if (item.getId() == id(key)) return true;
            }
        } catch (RuntimeException e) {
            Log.w("ExamDutyNotifier", "Cannot check posted exam duty notification", e);
        }
        return false;
    }

    static void channel(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager manager = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        NotificationChannel channel = new NotificationChannel(CHANNEL, "Exam duty reminders", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Important invigilation duties awaiting acknowledgment");
        channel.enableVibration(true);
        manager.createNotificationChannel(channel);
    }
    private static void cancelOne(Context c, String key) {
        AlarmManager alarms = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        alarms.cancel(alarm(c, key, PendingIntent.FLAG_UPDATE_CURRENT));
        NotificationManagerCompat.from(c).cancel(id(key));
    }
    static synchronized void clear(Context c) {
        JSONArray all = readArray(c, DUTIES);
        for (int i = 0; i < all.length(); i++) {
            JSONObject duty = all.optJSONObject(i);
            if (duty != null) cancelOne(c, sourceKey(duty));
        }
        prefs(c).edit().clear().apply();
    }
    static synchronized void sync(Context c, String accountKey, JSONArray received) {
        String currentAccount = prefs(c).getString(ACCOUNT, "");
        if (!currentAccount.isEmpty() && !currentAccount.equals(accountKey)) clear(c);
        JSONArray before = readArray(c, DUTIES);
        Set<String> newKeys = new HashSet<>();
        JSONArray valid = new JSONArray();
        for (int i = 0; i < received.length(); i++) {
            JSONObject duty = received.optJSONObject(i);
            if (duty == null || !sourceKey(duty).startsWith("exam-duty:")) continue;
            if (duty.optLong("startAt") <= 0) continue;
            if (duty.optBoolean("acknowledged")) {
                cancelOne(c, sourceKey(duty));
                continue;
            }
            valid.put(duty);
            newKeys.add(sourceKey(duty));
        }
        for (int i = 0; i < before.length(); i++) {
            JSONObject duty = before.optJSONObject(i);
            if (duty == null || newKeys.contains(sourceKey(duty))) continue;
            // Already displayed, unacknowledged alerts remain in the Android
            // shade even after they fall outside the server's fetch window.
            // A future withdrawn duty, however, must not fire accidentally.
            if (sourceKey(duty).startsWith("exam-duty:preview:") ||
                duty.optLong("notifyAt") <= System.currentTimeMillis()) {
                valid.put(duty);
            } else {
                cancelOne(c, sourceKey(duty));
            }
        }
        prefs(c).edit().putString(ACCOUNT, accountKey).putString(DUTIES, valid.toString()).apply();
        channel(c);
        // An unsuccessful network acknowledgment must NOT cancel the alert.
        for (int i = 0; i < valid.length(); i++) {
            JSONObject duty = valid.optJSONObject(i);
            if (duty == null) continue;
            long notifyAt = duty.optLong("notifyAt", 0);
            if (notifyAt <= System.currentTimeMillis()) show(c, duty);
            else schedule(c, duty);
        }
    }
    static void schedule(Context c, JSONObject duty) {
        String key = sourceKey(duty);
        if (key.isEmpty()) return;
        AlarmManager alarms = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        PendingIntent alarm = alarm(c, key, PendingIntent.FLAG_UPDATE_CURRENT);
        long when = Math.max(System.currentTimeMillis() + 1000, duty.optLong("notifyAt"));
        if (Build.VERSION.SDK_INT >= 31 && alarms.canScheduleExactAlarms()) {
            alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, alarm);
        } else if (Build.VERSION.SDK_INT >= 23) {
            alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, alarm);
        } else {
            alarms.set(AlarmManager.RTC_WAKEUP, when, alarm);
        }
    }
    static void showByKey(Context c, String key) {
        JSONArray all = readArray(c, DUTIES);
        for (int i = 0; i < all.length(); i++) {
            JSONObject duty = all.optJSONObject(i);
            if (duty != null && key.equals(sourceKey(duty))) { show(c, duty); return; }
        }
    }
    /**
     * Keep the notification delivery independent of the custom RemoteViews.
     * HyperOS / some OEM SystemUI versions may reject a custom notification
     * without throwing to the posting application. In that case, switch this
     * installation to Android's reliable, system-rendered BigTextStyle.
     */
    private static NotificationCompat.Builder basicBuilder(Context c, JSONObject duty) {
        String key = sourceKey(duty);
        String time = safeDisplay(duty.optString("startTime", ""), "Time TBA");
        String room = safeDisplay(duty.optString("room", ""), "TBA");
        String day = readableDate(duty.optString("date", ""));
        int notificationId = id(key);

        Intent ack = new Intent(c, ExamDutyActionReceiver.class);
        ack.setAction(ACTION_ACK);
        ack.putExtra(EXTRA_KEY, key);
        PendingIntent acknowledge = PendingIntent.getBroadcast(c, notificationId + 100,
            ack, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Intent open = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
        PendingIntent launch = open == null ? acknowledge : PendingIntent.getActivity(
            c, notificationId, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        return new NotificationCompat.Builder(c, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_exam_duty_native)
            // Time and room are the largest system-controlled text even when
            // Android shows only the collapsed notification.
            .setContentTitle(time + "   ·   " + room)
            .setContentText("Today's exam duty  •  " + day)
            .setContentIntent(launch)
            .addAction(android.R.drawable.checkbox_on_background, "Acknowledge", acknowledge)
            .setColor(Color.rgb(88, 92, 220))
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setOngoing(true)
            .setAutoCancel(false)
            .setOnlyAlertOnce(true);
    }

    private static boolean post(Context c, JSONObject duty, boolean custom) {
        String key = sourceKey(duty);
        if (key.isEmpty() || !allowed(c)) return false;
        channel(c);
        NotificationCompat.Builder builder = basicBuilder(c, duty);
        if (custom) {
            String time = duty.optString("startTime", "");
            String room = duty.optString("room", "TBA");
            String course = duty.optString("course", "");
            RemoteViews expanded = new RemoteViews(c.getPackageName(), R.layout.notification_exam_duty);
            expanded.setTextViewText(R.id.duty_date, readableDate(duty.optString("date", "")));
            expanded.setTextViewText(R.id.duty_time, time);
            expanded.setTextViewText(R.id.duty_room, room);
            expanded.setTextViewText(R.id.duty_course,
                course.isEmpty() ? "Your invigilation duty is scheduled" : course);
            RemoteViews compact = new RemoteViews(c.getPackageName(), R.layout.notification_exam_duty_compact);
            compact.setTextViewText(R.id.duty_compact_time, time);
            compact.setTextViewText(R.id.duty_compact_room, room);
            Intent ack = new Intent(c, ExamDutyActionReceiver.class);
            ack.setAction(ACTION_ACK);
            ack.putExtra(EXTRA_KEY, key);
            expanded.setOnClickPendingIntent(R.id.duty_acknowledge, PendingIntent.getBroadcast(
                c, id(key) + 100, ack, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
            builder.setStyle(new NotificationCompat.DecoratedCustomViewStyle())
                .setCustomContentView(compact)
                .setCustomBigContentView(expanded);
        } else {
            // Standard Android notification: works on Xiaomi HyperOS / modern
            // Android without asking SystemUI to inflate custom RemoteViews.
            // A density-specific PNG is safer to render than a vector icon.
            builder.setSmallIcon(R.drawable.ic_stat_exam_duty_native);
            String time = safeDisplay(duty.optString("startTime", ""), "Time TBA");
            String room = safeDisplay(duty.optString("room", ""), "TBA");
            String date = readableDate(duty.optString("date", ""));
            String course = duty.optString("course", "").trim();
            // BigTextStyle preserves system typography and the action row.
            // Some OEMs honor these restrained bold/size text spans; when they
            // don't, the content remains readable without custom rendering.
            SpannableStringBuilder details = new SpannableStringBuilder();
            details.append("TIME  ");
            int timeStart = details.length();
            details.append(time);
            details.setSpan(new StyleSpan(Typeface.BOLD), timeStart, details.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            details.setSpan(new RelativeSizeSpan(1.10f), timeStart, details.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            details.append("     ·     ROOM  ");
            int roomStart = details.length();
            details.append(room);
            details.setSpan(new StyleSpan(Typeface.BOLD), roomStart, details.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            details.append("\n");
            details.append(date);
            if (!course.isEmpty()) details.append("\n").append(course);
            builder.setStyle(new NotificationCompat.BigTextStyle()
                .setBigContentTitle("Today's Exam Duty")
                .bigText(details)
                .setSummaryText("Acknowledgement required"));
        }
        try {
            NotificationManagerCompat.from(c).notify(id(key), builder.build());
            Log.i("ExamDutyNotifier", "Posted " + (custom ? "custom" : "system") +
                " exam duty alert; key=" + key + " id=" + id(key));
            return true;
        } catch (RuntimeException e) {
            Log.e("ExamDutyNotifier", "Android rejected " + (custom ? "custom" : "system") +
                " exam duty notification", e);
            return false;
        }
    }

    static boolean isCompatibilityMode(Context c) {
        // Android 12+ forces custom notification content into constrained
        // templates; Xiaomi HyperOS may drop RemoteViews entirely. Prefer the
        // system template on modern Android from the very first notification.
        return Build.VERSION.SDK_INT >= 31 || prefs(c).getBoolean(SYSTEM_LAYOUT, false);
    }

    private static boolean hasDuty(Context c, String key) {
        JSONArray all = readArray(c, DUTIES);
        for (int i = 0; i < all.length(); i++) {
            JSONObject duty = all.optJSONObject(i);
            if (duty != null && key.equals(sourceKey(duty))) return true;
        }
        return false;
    }

    /** Call only when the custom layout did not become active. */
    static synchronized boolean fallbackToSystem(Context c, String key) {
        JSONArray duties = readArray(c, DUTIES);
        for (int i = 0; i < duties.length(); i++) {
            JSONObject duty = duties.optJSONObject(i);
            if (duty == null || !key.equals(sourceKey(duty))) continue;
            // Sticky fallback for this installation: also protects scheduled
            // exam duties, not just the user-triggered preview.
            prefs(c).edit().putBoolean(SYSTEM_LAYOUT, true).apply();
            Log.w("ExamDutyNotifier", "Custom notification missing; trying system fallback for " + key);
            return post(c, duty, false);
        }
        return false; // Duty was acknowledged/removed meanwhile.
    }

    static boolean show(Context c, JSONObject duty) {
        if (!allowed(c)) return false;
        if (isCompatibilityMode(c)) return post(c, duty, false);
        if (!post(c, duty, true)) return fallbackToSystem(c, sourceKey(duty));
        // Posting is asynchronous: the OEM can discard malformed custom views
        // after notify() returned. Check again after Android had time to render.
        final String key = sourceKey(duty);
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            if (!isActive(c, key) && hasDuty(c, key)) {
                fallbackToSystem(c, key);
            }
        }, 1400L);
        return true;
    }

    private static String safeDisplay(String value, String fallback) {
        if (value == null || value.trim().isEmpty()) return fallback;
        return value.trim();
    }

    private static String readableDate(String iso) {
        try {
            SimpleDateFormat input = new SimpleDateFormat("yyyy-MM-dd", Locale.ENGLISH);
            input.setTimeZone(TimeZone.getTimeZone("Asia/Dhaka"));
            Date date = input.parse(iso);
            SimpleDateFormat output = new SimpleDateFormat("EEEE, dd MMM yyyy", Locale.ENGLISH);
            output.setTimeZone(TimeZone.getTimeZone("Asia/Dhaka"));
            return output.format(date);
        } catch (Exception ignored) { return iso; }
    }
    static synchronized JSONArray pendingAcknowledgements(Context c) { return readArray(c, WAITING); }
    static String currentAccount(Context c) { return prefs(c).getString(ACCOUNT, ""); }
    static synchronized String preview(Context c) throws Exception {
        channel(c);
        String blocked = blockingReason(c);
        if (blocked != null) throw new IllegalStateException(blocked);
        JSONObject demo = new JSONObject();
        demo.put("sourceKey", "exam-duty:preview:" + System.currentTimeMillis());
        demo.put("date", new SimpleDateFormat("yyyy-MM-dd", Locale.ENGLISH).format(new Date()));
        demo.put("startTime", "10:00 AM");
        demo.put("room", "A-401");
        demo.put("course", "Preview • Not a real exam duty");
        demo.put("startAt", System.currentTimeMillis() + 3600000L);
        demo.put("notifyAt", System.currentTimeMillis() - 1000L);
        JSONArray duties = readArray(c, DUTIES);
        duties.put(demo);
        prefs(c).edit().putString(DUTIES, duties.toString()).apply();
        if (!show(c, demo)) {
            confirm(c, sourceKey(demo));
            throw new IllegalStateException("Android refused to post the exam-duty notification. Check BUBT Portal notification settings.");
        }
        return sourceKey(demo);
    }
    static synchronized void requestAcknowledgement(Context c, String key) {
        if (!key.startsWith("exam-duty:")) return;
        // Avoid accepting arbitrary broadcasts for duties that are not scheduled.
        boolean found = false;
        JSONArray all = readArray(c, DUTIES);
        for (int i = 0; i < all.length(); i++) {
            JSONObject d = all.optJSONObject(i);
            if (d != null && key.equals(sourceKey(d))) { found = true; break; }
        }
        if (!found) return;
        JSONArray pending = readArray(c, WAITING);
        for (int i = 0; i < pending.length(); i++) if (key.equals(pending.optString(i))) return;
        pending.put(key);
        prefs(c).edit().putString(WAITING, pending.toString()).apply();
    }
    static synchronized void confirm(Context c, String key) {
        JSONArray pending = readArray(c, WAITING);
        JSONArray keep = new JSONArray();
        for (int i = 0; i < pending.length(); i++) if (!key.equals(pending.optString(i))) keep.put(pending.optString(i));
        JSONArray duties = readArray(c, DUTIES);
        JSONArray other = new JSONArray();
        for (int i = 0; i < duties.length(); i++) {
            JSONObject duty = duties.optJSONObject(i);
            if (duty != null && !key.equals(sourceKey(duty))) other.put(duty);
        }
        prefs(c).edit().putString(WAITING, keep.toString()).putString(DUTIES, other.toString()).apply();
        cancelOne(c, key);
    }
    static synchronized void onBoot(Context c) {
        JSONArray all = readArray(c, DUTIES);
        channel(c);
        for (int i = 0; i < all.length(); i++) {
            JSONObject duty = all.optJSONObject(i);
            if (duty == null) continue;
            if (duty.optLong("notifyAt") <= System.currentTimeMillis()) show(c, duty);
            else schedule(c, duty);
        }
    }
}
