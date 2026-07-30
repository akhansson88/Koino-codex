import { PrayerRequestDetailRouteScreen } from "@/features/prayer-request-detail-screen";
import { InAppBrowserProvider } from "@/ui/in-app-browser";

export default function PrayerRequestDetailRoute() {
  return (
    <InAppBrowserProvider>
      <PrayerRequestDetailRouteScreen />
    </InAppBrowserProvider>
  );
}
