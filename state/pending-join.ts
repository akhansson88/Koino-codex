// A deep link opened while signed out must survive the sign-in and onboarding
// detour: the code is remembered here and resumed once the account is ready.
let pendingJoinCode: string | undefined;

export function rememberPendingJoinCode(code: string | undefined) {
  const normalized = code?.trim().toUpperCase();
  if (normalized) pendingJoinCode = normalized;
}

export function peekPendingJoinCode() {
  return pendingJoinCode;
}

export function takePendingJoinCode() {
  const code = pendingJoinCode;
  pendingJoinCode = undefined;
  return code;
}

export function clearPendingJoinCode() {
  pendingJoinCode = undefined;
}
