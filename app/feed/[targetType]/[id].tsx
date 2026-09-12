import { Redirect, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator } from "react-native";

import { FeedDetailScreen } from "@/features/feed-detail-screen";
import { normalizeEntryKind } from "@/state/product";
import { useKoino } from "@/state/koino-store";
import { AppScreen, Card } from "@/ui/app-components";
import { InAppBrowserProvider } from "@/ui/in-app-browser";
import { colors } from "@/ui/theme";

function routeParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function FeedDetailRoute() {
  const { id, targetType, groupId } = useLocalSearchParams<{ id?: string | string[]; targetType?: string | string[]; groupId?: string | string[] }>();
  const routeId = routeParam(id);
  const routeTargetType = routeParam(targetType);
  const routeGroupId = routeParam(groupId);
  const { state, dispatch } = useKoino();
  const currentGroupId = state.currentGroupId;
  useEffect(() => {
    if (routeGroupId && state.userGroupsReady && routeGroupId !== currentGroupId) {
      void dispatch({ type: "switchGroup", id: routeGroupId });
    }
  }, [currentGroupId, dispatch, routeGroupId, state.userGroupsReady]);
  const switchingGroup = Boolean(routeGroupId && routeGroupId !== currentGroupId);
  const waitingForPost =
    routeTargetType === "post" &&
    (!state.authReady ||
      !state.profileReady ||
      !state.userGroupsReady ||
      Boolean(
        currentGroupId &&
          !state.communityFeedError &&
          (state.communityFeedGroupId !== currentGroupId || !state.communityFeedReady),
      ));

  if (switchingGroup || waitingForPost) {
    return (
      <AppScreen>
        <Card style={{ alignItems: "center" }}>
          <ActivityIndicator color={colors.olive} />
        </Card>
      </AppScreen>
    );
  }

  if (routeTargetType === "post" && routeId && currentGroupId) {
    const post = state.posts.find((candidate) => candidate.id === routeId && candidate.groupId === currentGroupId);
    if (post && normalizeEntryKind(post.kind) === "prayer_request") {
      return (
        <Redirect
          href={{
            pathname: "/community/[groupId]/prayers/[prayerRequestId]",
            params: { groupId: currentGroupId, prayerRequestId: post.id },
          } as never}
        />
      );
    }
  }

  return (
    <InAppBrowserProvider>
      <FeedDetailScreen />
    </InAppBrowserProvider>
  );
}
