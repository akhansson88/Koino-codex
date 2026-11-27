import type { FastMode } from "@/state/types";
import type { FastModeTint } from "@/state/fasting-modes";
import { fastModeConfig } from "@/state/fasting-modes";
import { colors, shadcn } from "@/ui/theme";

export function fastTint(tint: FastModeTint) {
  switch (tint) {
    case "water":
      return { soft: colors.cyanSoft, ink: colors.accentRhythm };
    case "warm":
      return { soft: colors.warmSoft, ink: colors.gold };
    case "reflection":
      return { soft: colors.reflectionSoft, ink: colors.accentReflection };
    case "lavender":
      return { soft: colors.lavenderSoft, ink: colors.accentReflection };
    case "moss":
      return { soft: colors.mossSurface, ink: colors.accentRhythm };
    case "danger":
      return { soft: colors.dangerSurface, ink: colors.danger };
    default:
      return { soft: shadcn.secondary, ink: colors.ink };
  }
}

export function fastModeTint(mode: FastMode) {
  return fastTint(fastModeConfig(mode).tint);
}
