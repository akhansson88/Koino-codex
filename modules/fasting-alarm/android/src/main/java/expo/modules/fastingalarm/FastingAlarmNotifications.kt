package expo.modules.fastingalarm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build

object FastingAlarmNotifications {
  fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < 26) return
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    val channel = NotificationChannel(
      FastingAlarmConstants.CHANNEL,
      context.getString(R.string.fasting_alarm_channel),
      NotificationManager.IMPORTANCE_HIGH,
    ).apply {
      setSound(null, null)
      enableVibration(false)
      lockscreenVisibility = Notification.VISIBILITY_PRIVATE
    }
    manager.createNotificationChannel(channel)
  }

  fun build(context: Context): Notification {
    ensureChannel(context)
    val full = FastingAlarmScheduler.fullIntent(context)
    val fullPending = PendingIntent.getActivity(
      context,
      FastingAlarmConstants.REQUEST_SHOW,
      full,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val stopIntent = Intent(context, FastingAlarmService::class.java).putExtra("stop", true)
    val stopPending = PendingIntent.getService(
      context,
      99,
      stopIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    val builder = if (Build.VERSION.SDK_INT >= 26) {
      Notification.Builder(context, FastingAlarmConstants.CHANNEL)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(context)
    }
    return builder
      .setContentTitle(context.getString(R.string.fasting_alarm_notification_title))
      .setContentText(context.getString(R.string.fasting_alarm_notification_body))
      .setSmallIcon(R.drawable.ic_fasting_alarm)
      .setCategory(Notification.CATEGORY_ALARM)
      .setContentIntent(fullPending)
      .setFullScreenIntent(fullPending, true)
      .setOngoing(true)
      .setAutoCancel(false)
      .setVisibility(Notification.VISIBILITY_PRIVATE)
      .addAction(
        Notification.Action.Builder(
          0,
          context.getString(R.string.fasting_alarm_stop),
          stopPending,
        ).build(),
      )
      .build()
  }

  fun post(context: Context) {
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    manager.notify(FastingAlarmConstants.NOTIFICATION_ID, build(context))
  }

  fun cancel(context: Context) {
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    manager.cancel(FastingAlarmConstants.NOTIFICATION_ID)
  }
}
