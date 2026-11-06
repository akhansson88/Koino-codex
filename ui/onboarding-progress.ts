import { createContext, useContext } from "react";

export const OnboardingProgressContext = createContext<{
  userId?: string;
  pending: boolean;
  advance: (userId: string) => Promise<void>;
}>({
  pending: false,
  advance: async () => { throw new Error("Onboarding is unavailable."); },
});

export function useOnboardingProgress() {
  return useContext(OnboardingProgressContext);
}
