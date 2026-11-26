package expo.modules.fastingalarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings

object FastingAlarmScheduler {
  private fun prefs(context: Context) =
    context.getSharedPreferences(FastingAlarmConstants.PREFS, Context.MODE_PRIVATE)

  fun canScheduleExactAlarms(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < 31) return true
    return context.getSystemService(AlarmManager::class.java)?.canScheduleExactAlarms() == true
  }

  fun schedule(context: Context, endAtMillis: Long) {
    val alarm = context.getSystemService(AlarmManager::class.java) ?: return
    prefs(context).edit().putLong(FastingAlarmConstants.KEY_END, endAtMillis).apply()
    val completion = endIntent(context, FastingAlarmConstants.REQUEST_END, endAtMillis)
    if (endAtMillis <= System.currentTimeMillis()) {
      alarm.cancel(completion)
      return
    }
    try {
      alarm.setAlarmClock(
        AlarmManager.AlarmClockInfo(endAtMillis, showIntent(context, FastingAlarmConstants.REQUEST_SHOW)),
        completion,
      )
    } catch (_: SecurityException) {
      alarm.set(AlarmManager.RTC_WAKEUP, endAtMillis, completion)
    }
  }

  fun cancel(context: Context) {
    prefs(context).edit().remove(FastingAlarmConstants.KEY_END).apply()
    val alarm = context.getSystemService(AlarmManager::class.java) ?: return
    alarm.cancel(endIntent(context, FastingAlarmConstants.REQUEST_END, 0))
  }

  fun test(context: Context, delayMillis: Long) {
    val alarm = context.getSystemService(AlarmManager::class.java) ?: return
    val at = System.currentTimeMillis() + delayMillis.coerceIn(1_000L, 60_000L)
    val test = endIntent(context, FastingAlarmConstants.REQUEST_TEST, at, test = true)
    try {
      alarm.setAlarmClock(
        AlarmManager.AlarmClockInfo(at, showIntent(context, FastingAlarmConstants.REQUEST_SHOW + 1)),
        test,
      )
    } catch (_: SecurityException) {
      alarm.set(AlarmManager.RTC_WAKEUP, at, test)
    }
  }

  fun reschedule(context: Context) {
    val end = prefs(context).getLong(FastingAlarmConstants.KEY_END, 0)
    if (end > System.currentTimeMillis()) schedule(context, end)
  }

  fun openExactAlarmSettings(context: Context) {
    if (Build.VERSION.SDK_INT < 31) return
    try {
      context.startActivity(
        Intent(
          Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
          Uri.parse("package:${context.packageName}"),
        ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      )
    } catch (_: Exception) {
      // The settings page can be missing on a customized build.
    }
  }

  fun stop(context: Context) {
    try {
      context.stopService(Intent(context, FastingAlarmService::class.java))
    } catch (_: Exception) {
      // The service may not be running.
    }
    FastingAlarmNotifications.cancel(context)
    context.sendBroadcast(
      Intent(FastingAlarmConstants.ACTION_STOPPED).setPackage(context.packageName),
    )
  }

  fun fullIntent(context: Context): Intent =
    Intent(context, FastingAlarmActivity::class.java)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)

  private fun endIntent(context: Context, requestCode: Int, at: Long, test: Boolean = false): PendingIntent {
    val intent = Intent(context, FastingAlarmReceiver::class.java)
      .setPackage(context.packageName)
      .putExtra(FastingAlarmConstants.EXTRA_TEST, test)
      .putExtra(FastingAlarmConstants.EXTRA_END, at)
    return PendingIntent.getBroadcast(
      context,
      requestCode,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun showIntent(context: Context, requestCode: Int): PendingIntent =
    PendingIntent.getActivity(
      context,
      requestCode,
      fullIntent(context),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
}
