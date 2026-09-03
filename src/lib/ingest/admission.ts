const globalForIngest = globalThis as typeof globalThis & {
  __leadSignalIngestActive?: boolean;
};

/**
 * Admit one in-process ingestion at a time. This is deliberately a local
 * permit: instances still need platform-level limits when scaled out.
 */
export function tryAcquireIngest(): (() => void) | null {
  if (globalForIngest.__leadSignalIngestActive) return null;

  globalForIngest.__leadSignalIngestActive = true;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    globalForIngest.__leadSignalIngestActive = false;
  };
}
