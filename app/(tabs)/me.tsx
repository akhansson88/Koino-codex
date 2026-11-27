import { JournalScreen } from "@/features/journal-screen";
import { InAppBrowserProvider } from "@/ui/in-app-browser";

export default function MeRoute() {
  return (
    <InAppBrowserProvider>
      <JournalScreen />
    </InAppBrowserProvider>
  );
}
