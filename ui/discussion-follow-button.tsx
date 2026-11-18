import { useAppTranslation } from "@/ui/app-language";
import { Button } from "@/ui/shadcn/button";

export function DiscussionFollowButton({ following, onPress }: { following: boolean; onPress: () => void }) {
  const { t } = useAppTranslation();
  return (
    <Button
      icon={following ? "bell-off" : "bell"}
      onPress={onPress}
      size="sm"
      style={{ alignSelf: "flex-start" }}
      variant={following ? "secondary" : "outline"}
    >
      {t(following ? "notifications.unfollowDiscussion" : "notifications.followDiscussion")}
    </Button>
  );
}
