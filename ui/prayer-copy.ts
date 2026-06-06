export function prayerCountNoun(count: number) {
  return count === 1 ? "prayer" : "prayers";
}

export function prayerCountLabel(count: number) {
  return `${count} ${prayerCountNoun(count)}`;
}
