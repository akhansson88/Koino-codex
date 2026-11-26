package expo.modules.fastingalarm

import android.content.Context
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class FastingAlarmModule : Module() {
  private val context: Context
    get() = appContext.reactContext
      ?: appContext.currentActivity
      ?: throw IllegalStateException("FastingAlarm needs an Android context.")

  override fun definition() = ModuleDefinition {
    Name("FastingAlarm")

    Function("schedule") { endAtMillis: Double ->
      FastingAlarmScheduler.schedule(context, endAtMillis.toLong())
    }

    Function("cancel") {
      FastingAlarmScheduler.cancel(context)
    }

    Function("test") { delayMillis: Double ->
      FastingAlarmScheduler.test(context, delayMillis.toLong())
    }

    Function("canScheduleExactAlarms") {
      FastingAlarmScheduler.canScheduleExactAlarms(context)
    }

    Function("openExactAlarmSettings") {
      FastingAlarmScheduler.openExactAlarmSettings(context)
    }

    Function("stop") {
      FastingAlarmScheduler.stop(context)
    }
  }
}
