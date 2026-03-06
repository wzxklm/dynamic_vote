export function register() {
  if (typeof window !== "undefined") return;

  const origLog = console.log;
  const origError = console.error;
  const origWarn = console.warn;

  const timestamp = () => {
    const now = new Date();
    return now.toISOString().replace("T", " ").slice(0, 19);
  };

  console.log = (...args: unknown[]) => origLog(`[${timestamp()}]`, ...args);
  console.error = (...args: unknown[]) => origError(`[${timestamp()}]`, ...args);
  console.warn = (...args: unknown[]) => origWarn(`[${timestamp()}]`, ...args);
}
