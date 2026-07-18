import { FeedDetailScreen } from "@/features/feed-detail-screen";
import { InAppBrowserProvider } from "@/ui/in-app-browser";

export default function FeedDetailRoute() {
  return (
    <InAppBrowserProvider>
      <FeedDetailScreen />
    </InAppBrowserProvider>
  );
}
