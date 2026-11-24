import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import { formatBibleCopyText, type BibleCopyInput } from "@/features/bible-reader/copy-format";

export async function copyBibleVerses(input: BibleCopyInput): Promise<boolean> {
  const text = formatBibleCopyText(input);
  if (!text) return false;

  try {
    await Clipboard.setStringAsync(text);
    if (Platform.OS !== "web") void Haptics.selectionAsync().catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}
