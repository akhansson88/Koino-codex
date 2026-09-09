import { BibleDatabaseProvider } from "@/features/bible-database-provider";
import { BibleScreen } from "@/features/bible-screen";

export default function BibleRoute() {
  return (
    <BibleDatabaseProvider>
      <BibleScreen />
    </BibleDatabaseProvider>
  );
}
