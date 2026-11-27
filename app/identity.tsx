import { IdentitySupportScreen } from "@/features/identity-support-screen";
import { InAppBrowserProvider } from "@/ui/in-app-browser";

export default function IdentityRoute() {
  return (
    <InAppBrowserProvider>
      <IdentitySupportScreen presentation="sheet" />
    </InAppBrowserProvider>
  );
}
