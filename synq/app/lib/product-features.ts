// Product visibility only. Existing API permissions remain mandatory in all modes.
export const platformEnabled = process.env.NEXT_PUBLIC_SYNQ_PLATFORM_ENABLED === "true";
export function isDormantRoute(path: string) {
  return ["/room", "/rooms", "/agents", "/developers"].some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}
