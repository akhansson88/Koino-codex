import { HomePrayerFlowScreen } from "@/features/home-prayer-flow-screen";
import { InAppBrowserProvider } from "@/ui/in-app-browser";

export default function HomePrayerFlowRoute() {
  return (
    <InAppBrowserProvider>
      <HomePrayerFlowScreen />
    </InAppBrowserProvider>
  );
}
