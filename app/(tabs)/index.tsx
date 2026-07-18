import { HomeScreen } from "@/features/home-screen";
import { InAppBrowserProvider } from "@/ui/in-app-browser";

export default function HomeRoute() {
  return (
    <InAppBrowserProvider>
      <HomeScreen />
    </InAppBrowserProvider>
  );
}
