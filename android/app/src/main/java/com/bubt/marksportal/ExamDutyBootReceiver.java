package com.bubt.marksportal;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Restores native schedules after Android reboots the device. */
public class ExamDutyBootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        if (intent != null && (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction()) ||
            Intent.ACTION_MY_PACKAGE_REPLACED.equals(intent.getAction()))) {
            ExamDutyNotifications.onBoot(context);
        }
    }
}
