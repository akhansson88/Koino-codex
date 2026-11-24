import { useKoinoFields } from "@/state/koino-store";
import { usePresencePublisher } from "@/state/presence";

// Mounted once for the signed-in session so the member's device keeps a live
// presence session in the current community.
export function PresenceRuntime() {
  const { currentGroupId, currentUserId } = useKoinoFields(["currentGroupId", "currentUserId"]);
  usePresencePublisher(currentGroupId, currentUserId);
  return null;
}
