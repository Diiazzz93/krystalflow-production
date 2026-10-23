// Server-only comparison for shared secrets such as SYNC_WEBHOOK_SECRET
// and QC_FEED_SECRET.
// Hash both sides first so timingSafeEqual always sees equal-length digests.

export async function secretsMatch(provided: string, expected: string): Promise<boolean> {
  if (!provided || !expected) return false;
  const { createHash, timingSafeEqual } = await import("crypto");
  const providedDigest = createHash("sha256").update(provided, "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(providedDigest, expectedDigest);
}
