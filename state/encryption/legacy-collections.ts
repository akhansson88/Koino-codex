// Retired schemas remain recoverable as authenticated JSON archives. This also
// hides their old plan names, date paths and nested participant identifiers.
export const legacyPersonalCollections = ["privateBiblePlans", "privateBiblePlanProgress", "pendingNotificationBundles", "pushDeliveryDiagnostics"] as const;
export const legacyGroupCollections = ["groupBiblePlans", "groupBiblePlanProgress", "commentReactions"] as const;
