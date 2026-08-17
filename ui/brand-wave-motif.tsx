import { StyleProp, ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";

import { brandPalette } from "@/ui/theme";

const waves = [
  { color: brandPalette.warmPersika, d: "M0 22 C24 8 48 8 72 22 S120 36 144 22 S192 8 216 22 S264 36 288 22" },
  { color: brandPalette.blushRosa, d: "M0 34 C24 18 48 18 72 34 S120 50 144 34 S192 18 216 34 S264 50 288 34" },
  { color: brandPalette.lavenderHaze, d: "M0 46 C24 30 48 30 72 46 S120 62 144 46 S192 30 216 46 S264 62 288 46" },
  { color: brandPalette.softCyan, d: "M0 58 C24 42 48 42 72 58 S120 74 144 58 S192 42 216 58 S264 74 288 58" },
  { color: brandPalette.warmPersika, d: "M0 70 C24 54 48 54 72 70 S120 86 144 70 S192 54 216 70 S264 86 288 70" },
  { color: brandPalette.blushRosa, d: "M0 82 C24 66 48 66 72 82 S120 98 144 82 S192 66 216 82 S264 98 288 82" },
  { color: brandPalette.lavenderHaze, d: "M0 94 C24 78 48 78 72 94 S120 110 144 94 S192 78 216 94 S264 110 288 94" },
  { color: brandPalette.softCyan, d: "M0 106 C24 90 48 90 72 106 S120 122 144 106 S192 90 216 106 S264 122 288 106" },
] as const;

const horizonWaves = [
  {
    color: brandPalette.warmPersika,
    d: "M-144 54 C-24 18 96 18 216 54 S456 90 576 54 S816 18 936 54",
    opacity: 0.32,
    strokeWidth: 2.4,
  },
  {
    color: brandPalette.blushRosa,
    d: "M-72 96 C48 58 168 58 288 96 S528 134 648 96 S888 58 1008 96",
    opacity: 0.3,
    strokeWidth: 2.7,
  },
  {
    color: brandPalette.lavenderHaze,
    d: "M-168 146 C-48 102 72 102 192 146 S432 190 552 146 S792 102 912 146",
    opacity: 0.36,
    strokeWidth: 3,
  },
  {
    color: brandPalette.softCyan,
    d: "M-48 198 C72 154 192 154 312 198 S552 242 672 198 S912 154 1032 198",
    opacity: 0.34,
    strokeWidth: 3.2,
  },
] as const;

export function BrandWaveMotif({
  height = 128,
  intensity = 1,
  layerIndices,
  opacity = 1,
  style,
  variant = "full",
  width = 288,
}: {
  height?: number;
  intensity?: number;
  layerIndices?: readonly number[];
  opacity?: number;
  style?: StyleProp<ViewStyle>;
  variant?: "accent" | "full" | "horizon";
  width?: number;
}) {
  const accent = variant === "accent";
  const horizon = variant === "horizon";
  const indexedWaves = waves.map((wave, index) => ({ index, wave }));
  const indexedHorizonWaves = horizonWaves.map((wave, index) => ({ index, wave }));
  const visibleWaves = horizon
    ? layerIndices
      ? indexedHorizonWaves.filter(({ index }) => layerIndices.includes(index))
      : indexedHorizonWaves
    : accent
      ? waves.slice(1, 4).map((wave, index) => ({ index, wave }))
      : layerIndices
        ? indexedWaves.filter(({ index }) => layerIndices.includes(index))
        : indexedWaves;

  return (
    <Svg
      height={height}
      opacity={opacity}
      pointerEvents="none"
      style={style}
      viewBox={horizon ? "0 0 720 252" : accent ? "0 18 288 52" : "0 0 288 128"}
      width={width}
    >
      {visibleWaves.map(({ index, wave }) => (
        <Path
          d={wave.d}
          fill="none"
          key={`${wave.color}-${index}`}
          opacity={Math.min(
            1,
            (horizon ? horizonWaves[index].opacity : 0.22 + (index % 2) * 0.06) * intensity,
          )}
          stroke={wave.color}
          strokeLinecap="round"
          strokeWidth={horizon ? horizonWaves[index].strokeWidth : accent ? 5 : 1.35}
        />
      ))}
    </Svg>
  );
}
