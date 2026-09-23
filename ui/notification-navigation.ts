/** Begin local navigation before the notification read write enters the JS queue. */
export function navigateThenMarkRead(
  navigate: () => void,
  markRead: () => Promise<void>,
  onError: (error: unknown) => void,
) {
  navigate();
  requestAnimationFrame(() => {
    void markRead().catch(onError);
  });
}
