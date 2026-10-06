import { BibleScreen } from "@/features/bible-screen";
import { BibleDatabaseBoundary } from "@/features/bible-database-provider";

export default function BibleRoute() {
  return <BibleDatabaseBoundary><BibleScreen /></BibleDatabaseBoundary>;
}
