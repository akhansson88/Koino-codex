const escapeAttribute = (value) => String(value || "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]));

export default async function donationReturn(request) {
  const url = new URL(request.url);
  const result = ["success", "cancel", "portal"].includes(url.searchParams.get("result"))
    ? url.searchParams.get("result")
    : "cancel";
  const target = new URL(result === "success" ? "koino://donation-thank-you" : result === "portal" ? "koino://me" : "koino://donation-confirm");
  for (const key of ["session_id", "amount", "frequency"]) {
    const value = url.searchParams.get(key);
    if (value) target.searchParams.set(key, value);
  }
  const deepLink = escapeAttribute(target.toString());
  return new Response(`<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="refresh" content="0;url=${deepLink}"><title>Återgår till KOINO</title></head><body><p>Återgår till KOINO…</p><p><a href="${deepLink}">Öppna KOINO</a></p></body></html>`, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
      "Content-Type": "text/html; charset=utf-8",
      "Referrer-Policy": "no-referrer",
    },
  });
}
