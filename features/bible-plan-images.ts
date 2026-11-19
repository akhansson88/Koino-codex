import type { ImageSourcePropType } from "react-native";

/**
 * Featured art for the plan library.
 *
 * A cohesive series of flat graphical Bible-land illustrations (arched "window"
 * scenes) drawn procedurally in FigCraft by design/paint-bible-plan-art.mjs and
 * exported as PNGs to assets/bible-plans. They are intentionally language-neutral
 * so the same art works in Swedish and English; the app overlays the localized
 * title on the bottom gradient.
 */
export const biblePlanCovers: Record<string, ImageSourcePropType> = {
  "whole-bible-1-year": require("../assets/bible-plans/whole-bible-1-year.png"),
  "whole-bible-2-year": require("../assets/bible-plans/whole-bible-2-year.png"),
  "new-testament-90": require("../assets/bible-plans/new-testament-90.png"),
  "new-testament-1-year": require("../assets/bible-plans/new-testament-1-year.png"),
  "gospels-30": require("../assets/bible-plans/gospels-30.png"),
  "jesus-life-21": require("../assets/bible-plans/jesus-life-21.png"),
  "psalms-30": require("../assets/bible-plans/psalms-30.png"),
  "psalms-90": require("../assets/bible-plans/psalms-90.png"),
  "proverbs-31": require("../assets/bible-plans/proverbs-31.png"),
  "wisdom-21": require("../assets/bible-plans/wisdom-21.png"),
  "anxiety-14": require("../assets/bible-plans/anxiety-14.png"),
  "hope-21": require("../assets/bible-plans/hope-21.png"),
  "prayer-14": require("../assets/bible-plans/prayer-14.png"),
  "gratitude-7": require("../assets/bible-plans/gratitude-7.png"),
  "love-14": require("../assets/bible-plans/love-14.png"),
  "forgiveness-14": require("../assets/bible-plans/forgiveness-14.png"),
  "paul-30": require("../assets/bible-plans/paul-30.png"),
  "story-30": require("../assets/bible-plans/story-30.png"),
  "women-21": require("../assets/bible-plans/women-21.png"),
  "new-believer-14": require("../assets/bible-plans/new-believer-14.png"),
  custom: require("../assets/bible-plans/custom.png"),
};

export function biblePlanCover(key?: string) {
  return (key ? biblePlanCovers[key] : undefined) ?? biblePlanCovers.custom;
}
