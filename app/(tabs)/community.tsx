import { CommunityScreen } from "@/features/settings-screen";
import { InAppBrowserProvider } from "@/ui/in-app-browser";

export default function CommunityRoute() {
  return (
    <InAppBrowserProvider>
      <CommunityScreen />
    </InAppBrowserProvider>
  );
}
