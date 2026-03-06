"use client";

import FingerprintJS from "@fingerprintjs/fingerprintjs";

let cachedVisitorId: string | null = null;
let fpPromise: Promise<string> | null = null;

export async function getFingerprint(): Promise<string> {
  if (cachedVisitorId) return cachedVisitorId;

  if (!fpPromise) {
    fpPromise = (async () => {
      const fp = await FingerprintJS.load();
      const result = await fp.get();
      cachedVisitorId = result.visitorId;
      return result.visitorId;
    })().catch((err) => {
      fpPromise = null;
      throw err;
    });
  }

  return fpPromise;
}
