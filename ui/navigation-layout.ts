export const TAB_CONTENT_HEIGHT = 56;
export function tabBarHeight(bottomInset: number) {
  return TAB_CONTENT_HEIGHT + Math.max(bottomInset, 8);
}
export function tabContentClearance(bottomInset: number) {
  return tabBarHeight(bottomInset) + 24;
}
