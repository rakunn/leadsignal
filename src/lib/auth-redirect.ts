const FALLBACK_DESTINATION = "/datasets";

/** Returns a local application path suitable for post-login navigation. */
export function safeLoginDestination(value: string | null, origin: string): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\u0000-\u001F\u007F\\]/.test(value)
  ) {
    return FALLBACK_DESTINATION;
  }

  try {
    const destination = new URL(value, origin);
    if (
      destination.origin !== origin ||
      destination.username ||
      destination.password ||
      destination.pathname.startsWith("//") ||
      destination.pathname.replace(/\/+$/, "") === "/login"
    ) {
      return FALLBACK_DESTINATION;
    }
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return FALLBACK_DESTINATION;
  }
}
