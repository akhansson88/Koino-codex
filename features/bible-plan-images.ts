import type { ImageSourcePropType } from "react-native";

/**
 * Featured art for the plan library.
 *
 * A cohesive series of painted Bible-land scenes (oil-painting style) generated
 * with the Perchance AI image generator and saved to assets/bible-plans as JPEGs.
 * They are intentionally language-neutral so the same art works in Swedish and
 * English; the app overlays the localized title on the bottom gradient.
 */
export const biblePlanCovers: Record<string, ImageSourcePropType> = {
  "whole-bible-1-year": require("../assets/bible-plans/whole-bible-1-year.jpg"),
  "whole-bible-2-year": require("../assets/bible-plans/whole-bible-2-year.jpg"),
  "new-testament-90": require("../assets/bible-plans/new-testament-90.jpg"),
  "new-testament-1-year": require("../assets/bible-plans/new-testament-1-year.jpg"),
  "gospels-30": require("../assets/bible-plans/gospels-30.jpg"),
  "jesus-life-21": require("../assets/bible-plans/jesus-life-21.jpg"),
  "psalms-30": require("../assets/bible-plans/psalms-30.jpg"),
  "psalms-90": require("../assets/bible-plans/psalms-90.jpg"),
  "proverbs-31": require("../assets/bible-plans/proverbs-31.jpg"),
  "wisdom-21": require("../assets/bible-plans/wisdom-21.jpg"),
  "anxiety-14": require("../assets/bible-plans/anxiety-14.jpg"),
  "hope-21": require("../assets/bible-plans/hope-21.jpg"),
  "prayer-14": require("../assets/bible-plans/prayer-14.jpg"),
  "gratitude-7": require("../assets/bible-plans/gratitude-7.jpg"),
  "love-14": require("../assets/bible-plans/love-14.jpg"),
  "forgiveness-14": require("../assets/bible-plans/forgiveness-14.jpg"),
  "paul-30": require("../assets/bible-plans/paul-30.jpg"),
  "story-30": require("../assets/bible-plans/story-30.jpg"),
  "women-21": require("../assets/bible-plans/women-21.jpg"),
  "new-believer-14": require("../assets/bible-plans/new-believer-14.jpg"),
  custom: require("../assets/bible-plans/custom.jpg"),
};

export function biblePlanCover(key?: string) {
  return (key ? biblePlanCovers[key] : undefined) ?? biblePlanCovers.custom;
}
