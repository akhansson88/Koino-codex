// Supabase's current secret keys use only the apikey header. Legacy service
// JWTs also use Authorization; treating an opaque key as a JWT is rejected.
export function storageHeadersFor(credential: string): Record<string, string> {
  const key = credential.trim();
  if (/^sb_secret_[A-Za-z0-9_-]+$/.test(key)) return { apikey: key };
  if (/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) {
    const claims = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString("utf8"));
    if (claims.role === "service_role" && claims.ref === "prumjueusdyqnwwovpen") return { apikey: key, authorization: `Bearer ${key}` };
  }
  throw new Error("Configure a Supabase backend secret key or this project's legacy service_role credential.");
}
