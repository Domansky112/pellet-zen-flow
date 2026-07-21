/**
 * Shared authorization helper for cron/webhook endpoints under /api/public/hooks.
 *
 * Uses a private CRON_SECRET (server-only) instead of the public Supabase anon key,
 * so external callers cannot trigger scraping / notification side effects at will.
 *
 * Configure your scheduler (pg_cron / GitHub Actions / etc.) to send the value in
 * either `x-cron-secret` or `authorization: Bearer <CRON_SECRET>` header.
 */
export function isAuthorizedCron(request: Request): boolean {
  const expected = process.env.CRON_SECRET ?? "";
  if (!expected) return false;

  const provided =
    request.headers.get("x-cron-secret") ??
    (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!provided) return false;

  // Timing-safe constant-time comparison.
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
