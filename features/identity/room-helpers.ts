import * as ImagePicker from "expo-image-picker";
import { Image, Platform, Share } from "react-native";
import type { Group, Id } from "@/state/types";
import type { TranslationFunction } from "@/ui/localization";

export function roomMemberCount(counts: Record<Id, number>, roomId?: Id, fallback = 1) {
  if (!roomId) return fallback;
  return counts[roomId] || fallback;
}

export async function shareRoomInvite(room: Group, t: TranslationFunction) {
  const invitation = t("community.rooms.invitation", { code: room.inviteCode, name: room.name });
  const clipboard =
    Platform.OS === "web"
      ? (globalThis as typeof globalThis & { navigator?: { clipboard?: { writeText?: (text: string) => Promise<void> } } }).navigator?.clipboard
      : undefined;

  if (clipboard?.writeText) {
    await clipboard.writeText(invitation);
    return t("community.rooms.inviteCopied");
  }

  await Share.share({ message: invitation, title: t("community.rooms.joinNamed", { name: room.name }) });
  return t("community.rooms.inviteReady");
}

export async function selectedImageSize(asset: ImagePicker.ImagePickerAsset) {
  if (asset.width > 0 && asset.height > 0) {
    return { height: asset.height, width: asset.width };
  }

  return new Promise<{ height: number; width: number }>((resolve, reject) => {
    Image.getSize(
      asset.uri,
      (width, height) => resolve({ height, width }),
      () => reject(new Error("Could not read that image.")),
    );
  });
}
