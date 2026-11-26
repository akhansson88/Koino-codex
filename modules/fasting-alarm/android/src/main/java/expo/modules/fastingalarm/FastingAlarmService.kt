package expo.modules.fastingalarm

import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

/**
 * Rings the completion alarm until the user stops it, or for five minutes.
 * An exact-alarm receiver may start this foreground service from the background.
 */
class FastingAlarmService : Service() {
  companion object {
    const val AUTO_STOP_MS = 5 * 60 * 1000L
    private const val WAKE_LOCK_TIMEOUT = 10 * 60 * 1000L

    @Volatile
    var playing: Boolean = false
      private set
  }

  private var player: MediaPlayer? = null
  private var vibrator: Vibrator? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private val handler = Handler(Looper.getMainLooper())
  private val autoStop = Runnable { stopEverything() }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.getBooleanExtra("stop", false) == true) {
      stopEverything()
      return START_NOT_STICKY
    }
    startInForeground()
    if (player == null) startRinging()
    handler.removeCallbacks(autoStop)
    handler.postDelayed(autoStop, AUTO_STOP_MS)
    return START_STICKY
  }

  private fun startInForeground() {
    val notification = FastingAlarmNotifications.build(this)
    if (Build.VERSION.SDK_INT >= 29) {
      startForeground(
        FastingAlarmConstants.NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK,
      )
    } else {
      startForeground(FastingAlarmConstants.NOTIFICATION_ID, notification)
    }
  }

  private fun startRinging() {
    playing = true
    try {
      val power = getSystemService(Context.POWER_SERVICE) as PowerManager
      wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "KOINO:fasting-alarm").apply {
        acquire(WAKE_LOCK_TIMEOUT)
      }
    } catch (_: Exception) {
      wakeLock = null
    }

    try {
      player = MediaPlayer().apply {
        setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build(),
        )
        setDataSource(applicationContext, RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM))
        isLooping = true
        prepare()
        start()
      }
    } catch (_: Exception) {
      player = null
    }

    try {
      val device = if (Build.VERSION.SDK_INT >= 31) {
        (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
      } else {
        @Suppress("DEPRECATION")
        getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
      }
      vibrator = device
      if (device.hasVibrator()) {
        if (Build.VERSION.SDK_INT >= 26) {
          device.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 700, 500), 0))
        } else {
          @Suppress("DEPRECATION")
          device.vibrate(longArrayOf(0, 700, 500), 0)
        }
      }
    } catch (_: Exception) {
      vibrator = null
    }
  }

  private fun stopEverything() {
    playing = false
    handler.removeCallbacksAndMessages(null)
    player?.let {
      try {
        if (it.isPlaying) it.stop()
      } catch (_: Exception) {
        // Already stopped.
      }
      it.release()
    }
    player = null
    try {
      vibrator?.cancel()
    } catch (_: Exception) {
      // The vibrator can disappear with the device.
    }
    vibrator = null
    wakeLock?.let {
      if (it.isHeld) it.release()
    }
    wakeLock = null
    FastingAlarmNotifications.cancel(this)
    if (Build.VERSION.SDK_INT >= 24) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
    sendBroadcast(Intent(FastingAlarmConstants.ACTION_STOPPED).setPackage(packageName))
    stopSelf()
  }

  override fun onDestroy() {
    if (playing || player != null) stopEverything()
    super.onDestroy()
  }
}
