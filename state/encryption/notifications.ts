import { database } from "@/state/store/firebase";
import type { ActivityNotification, Membership, Post, Reply } from "@/state/types";
import { get, ref } from "./database";

// The server stores routing references. Names and previews are reconstructed
// after authenticated decryption on the recipient's authorized device.
export async function hydrateNotification(value: ActivityNotification): Promise<ActivityNotification> {
  const fallback = { ...value, actorName: "KOINO member", targetOwnerName: "KOINO member", contentLabel: value.targetType === "post" ? "post" as const : "check-in" as const, preview: "" };
  try {
    const [actor, reply, target] = await Promise.all([
      get(ref(database, `groupMembers/${value.groupId}/${value.actorUserId}`)),
      get(ref(database, `replies/${value.groupId}/${value.replyId}`)),
      get(ref(database, `${value.targetType === "post" ? "posts" : "checkIns"}/${value.groupId}/${value.targetId}`)),
    ]);
    const member = actor.val() as Membership | null;
    const content = reply.val() as Reply | null;
    const entry = target.val() as Post | null;
    const owner = entry?.userId ? (await get(ref(database, `groupMembers/${value.groupId}/${entry.userId}`))).val() as Membership | null : null;
    const labels: Record<string, ActivityNotification["contentLabel"]> = { prayer_request: "prayer request", prayer_moment: "prayer", praise: "praise", reflection: "reflection", scripture: "scripture reflection", update: "update" };
    return { ...fallback, actorName: member?.userName ?? fallback.actorName, actorImage: member?.image, targetOwnerName: owner?.userName ?? fallback.targetOwnerName, preview: content?.body.slice(0, 180) ?? "", contentLabel: entry?.kind ? labels[entry.kind] ?? "post" : fallback.contentLabel };
  } catch { return fallback; }
}
