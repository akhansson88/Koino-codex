// Flip storesLive to true once both public store listings are live. Until
// then the invite page offers the waitlist instead of a store page that 404s.
window.KOINO_JOIN_CONFIG = {
  iosStoreUrl: "https://apps.apple.com/app/id6809953941",
  androidStoreUrl: "https://play.google.com/store/apps/details?id=com.akhansson.koinomvp",
  storesLive: false,
  waitlistUrl: "https://koinolabs.com/#waitlist",
  autoStoreRedirect: true
};
