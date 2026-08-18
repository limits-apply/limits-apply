export interface SmokeResponse {
  status: number;
  body: string;
}

export type SmokePoster = (url: string, body: unknown) => Promise<SmokeResponse>;

export async function smokeTestAlias(post: SmokePoster, baseUrl: string, alias: string): Promise<boolean> {
  let response: SmokeResponse;
  try {
    response = await post(`${baseUrl}/v1/chat/completions`, {
      model: alias,
      messages: [{ role: "user", content: "ping" }],
    });
  } catch {
    return false;
  }
  if (response.status === 429) return true;
  if (response.status !== 200) return false;
  const body = response.body.toLowerCase();
  return body.includes("pong") || body.includes("ratelimiterror") || body.includes("usage limit reached");
}

export async function smokeTestAliases(post: SmokePoster, baseUrl: string, aliases: string[]): Promise<Record<string, boolean>> {
  const results: Record<string, boolean> = {};
  for (const alias of aliases) {
    results[alias] = await smokeTestAlias(post, baseUrl, alias);
  }
  return results;
}
