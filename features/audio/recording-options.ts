import { AudioQuality, IOSOutputFormat, type RecordingOptions } from "expo-audio";

import { AUDIO_BITRATE, AUDIO_SAMPLE_RATE } from "@/state/audio";

/** AAC-LC mono at 32 kbit/s. The fallback profile only changes the sample rate. */
export const speechRecordingOptions: RecordingOptions = {
  isMeteringEnabled: true,
  extension: ".m4a",
  sampleRate: AUDIO_SAMPLE_RATE,
  numberOfChannels: 1,
  bitRate: AUDIO_BITRATE,
  android: {
    extension: ".m4a",
    outputFormat: "mpeg4",
    audioEncoder: "aac",
    sampleRate: AUDIO_SAMPLE_RATE,
  },
  ios: {
    extension: ".m4a",
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.MEDIUM,
    sampleRate: AUDIO_SAMPLE_RATE,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: { mimeType: "audio/mp4", bitsPerSecond: AUDIO_BITRATE },
};

export const speechRecordingFallbackOptions: RecordingOptions = {
  ...speechRecordingOptions,
  sampleRate: 44_100,
  android: { ...speechRecordingOptions.android, sampleRate: 44_100 },
  ios: { ...speechRecordingOptions.ios, sampleRate: 44_100 },
};
