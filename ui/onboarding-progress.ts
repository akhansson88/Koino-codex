import { createContext, useContext } from "react";
import type { OnboardingChoice } from "@/state/onboarding-progress";

async function unavailable() {
  throw new Error("Onboarding is unavailable.");
}

export const OnboardingProgressContext = createContext<{
  userId?: string;
  pending: boolean;
  journey?: OnboardingChoice;
  chooseJourney: (userId: string, journey: OnboardingChoice) => Promise<void>;
  complete: (userId: string) => Promise<void>;
}>({
  pending: false,
  chooseJourney: unavailable,
  complete: unavailable,
});

export function useOnboardingProgress() {
  return useContext(OnboardingProgressContext);
}
