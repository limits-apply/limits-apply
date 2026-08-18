/** Shared fetch helper for every source module — one User-Agent, one error contract. */
export const UA = "Mozilla/5.0 (compatible; limitsapply-refresh/1.0)";

export async function get(url, accept, headers = {}) {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: accept, ...headers } });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return accept === "application/json" ? res.json() : res.text();
}
