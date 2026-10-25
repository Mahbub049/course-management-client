package com.bubt.marksportal;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Handles alarm delivery and user clicks even when the WebView is not running. */
public class ExamDutyActionReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String key = intent.getStringExtra(ExamDutyNotifications.EXTRA_KEY);
        if (key == null || !key.startsWith("exam-duty:")) return;
        if (ExamDutyNotifications.ACTION_SHOW.equals(intent.getAction())) {
            ExamDutyNotifications.showByKey(context, key);
        } else if (ExamDutyNotifications.ACTION_ACK.equals(intent.getAction())) {
            // Acknowledgment is authenticated by the React API session. The
            // notification stays visible until that server request succeeds.
            ExamDutyNotifications.requestAcknowledgement(context, key);
            Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
            if (launch != null) {
                launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                context.startActivity(launch);
            }
        }
    }
}
