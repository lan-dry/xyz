/** Production bootstrap must use real staff emails, not fake local domains. */
export function assertBootstrapEmailAllowed(email: string): void {
  const lower = email.toLowerCase();
  if (lower.endsWith("@salanor.local") || lower.endsWith("@test.salanor.local")) {
    console.error(
      "Bootstrap refused: use a real work email, not @salanor.local or @test.salanor.local.",
    );
    process.exit(1);
  }
}
