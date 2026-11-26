package expo.modules.fastingalarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

/** Fired by AlarmManager when the fast ends or a test alert is due. */
class FastingAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val test = intent.getBooleanExtra(FastingAlarmConstants.EXTRA_TEST, false)
    if (!test) {
      val stored = context
        .getSharedPreferences(FastingAlarmConstants.PREFS, Context.MODE_PRIVATE)
        .getLong(FastingAlarmConstants.KEY_END, 0)
      // Ignore a queued broadcast from a schedule the user has since edited.
      if (intent.getLongExtra(FastingAlarmConstants.EXTRA_END, 0) != stored) return
    }

    FastingAlarmNotifications.post(context)
    val service = Intent(context, FastingAlarmService::class.java)
    try {
      if (Build.VERSION.SDK_INT >= 26) {
        context.startForegroundService(service)
      } else {
        context.startService(service)
      }
    } catch (_: RuntimeException) {
      // Some OEM builds block a background foreground-service start. The
      // full-screen notification still opens the alarm screen.
    }
  }
}
