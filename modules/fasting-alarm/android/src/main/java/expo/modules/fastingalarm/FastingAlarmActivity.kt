package expo.modules.fastingalarm

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.WindowManager
import android.widget.Button

/** Full-screen completion screen, shown over the lock screen by the alarm notification. */
class FastingAlarmActivity : Activity() {
  private val handler = Handler(Looper.getMainLooper())
  private val autoStop = Runnable { stopAndFinish() }
  private var stoppedReceiver: BroadcastReceiver? = null
  private var fallback: MediaPlayer? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (Build.VERSION.SDK_INT >= 27) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
          WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON,
      )
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    setContentView(R.layout.activity_fasting_alarm)
    findViewById<Button>(R.id.fasting_alarm_stop).setOnClickListener { stopAndFinish() }

    stoppedReceiver = object : BroadcastReceiver() {
      override fun onReceive(context: Context, intent: Intent) {
        if (!isFinishing) finish()
      }
    }
    val filter = IntentFilter(FastingAlarmConstants.ACTION_STOPPED)
    if (Build.VERSION.SDK_INT >= 33) {
      registerReceiver(stoppedReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      @Suppress("DEPRECATION")
      registerReceiver(stoppedReceiver, filter)
    }

    // The receiver normally starts the service; this covers a full-screen launch
    // after an OEM blocked the background start.
    try {
      if (Build.VERSION.SDK_INT >= 26) {
        startForegroundService(Intent(this, FastingAlarmService::class.java))
      } else {
        startService(Intent(this, FastingAlarmService::class.java))
      }
    } catch (_: RuntimeException) {
      // The screen still tells the user what happened.
    }
    handler.postDelayed(this::maybeRingFallback, 1200)
    handler.postDelayed(autoStop, FastingAlarmService.AUTO_STOP_MS)
  }

  private fun maybeRingFallback() {
    if (FastingAlarmService.playing || isFinishing || isDestroyed) return
    try {
      fallback = MediaPlayer().apply {
        setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build(),
        )
        setDataSource(this@FastingAlarmActivity, RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM))
        isLooping = true
        prepare()
        start()
      }
    } catch (_: Exception) {
      fallback = null
    }
  }

  private fun stopAndFinish() {
    FastingAlarmScheduler.stop(this)
    finish()
  }

  @Deprecated("The alarm screen has one explicit action.")
  override fun onBackPressed() {
    stopAndFinish()
  }

  override fun onDestroy() {
    handler.removeCallbacksAndMessages(null)
    fallback?.let {
      try {
        if (it.isPlaying) it.stop()
      } catch (_: Exception) {
        // Already stopped.
      }
      it.release()
    }
    fallback = null
    stoppedReceiver?.let {
      try {
        unregisterReceiver(it)
      } catch (_: Exception) {
        // Already unregistered.
      }
    }
    stoppedReceiver = null
    super.onDestroy()
  }
}
