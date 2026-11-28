import { useCallback, useEffect, useRef, useState } from "react";
import { useKoino } from "@/state/koino-store";
import { getDonationStatus, type DonationStatus } from "@/features/donation-api";
import { useAppTranslation } from "@/ui/app-language";

export function usePersistentDonationStatus() {
  const { state, getAuthToken } = useKoino();
  const { t } = useAppTranslation();
  const userId = state.currentUserId;
  const [status, setStatus] = useState<DonationStatus>();
  const [pending, setPending] = useState(true);
  const [error, setError] = useState<string>();
  const requestVersion = useRef(0);

  const load = useCallback(async (force: boolean) => {
    const version = ++requestVersion.current;
    if (!userId) {
      setStatus(undefined);
      setPending(false);
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      const result = await getDonationStatus(await getAuthToken(), userId, force);
      if (version === requestVersion.current) setStatus(result);
    } catch (loadError) {
      if (version === requestVersion.current) {
        setError(loadError instanceof Error ? loadError.message : t("donation.manage.loadError"));
      }
    } finally {
      if (version === requestVersion.current) setPending(false);
    }
  }, [getAuthToken, t, userId]);

  useEffect(() => {
    void load(false);
    return () => { requestVersion.current += 1; };
  }, [load]);

  return { error, pending, refresh: () => load(true), status };
}
