const DEFAULT_ADMIN_PORTAL_PATH = '/admin';

/**
 * Normalizes a configured admin portal path (e.g. "ops-portal-9x7k/" -> "/ops-portal-9x7k").
 * Falls back to "/admin" when unset or invalid.
 */
export function normalizeAdminPortalPath(raw?: string | null): string {
  const trimmed = (raw || '').trim();
  if (!trimmed || trimmed === '/') {
    return DEFAULT_ADMIN_PORTAL_PATH;
  }

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  const withoutTrailingSlash = withLeadingSlash.replace(/\/+$/, '');
  return withoutTrailingSlash || DEFAULT_ADMIN_PORTAL_PATH;
}

/**
 * Returns the configured client-visible admin portal path.
 */
export function getConfiguredAdminPortalPath(): string {
  return normalizeAdminPortalPath(process.env.NEXT_PUBLIC_ADMIN_PORTAL_PATH);
}

/**
 * Checks whether a pathname belongs to the isolated Admin Portal
 * (matches either the default "/admin" route or a custom configured secret path).
 */
export function isAdminPortalPathname(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const normalizedPath = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const configuredPath = getConfiguredAdminPortalPath();

  const matchesDefault =
    normalizedPath === DEFAULT_ADMIN_PORTAL_PATH ||
    normalizedPath.startsWith(`${DEFAULT_ADMIN_PORTAL_PATH}/`);

  const matchesConfigured =
    normalizedPath === configuredPath ||
    normalizedPath.startsWith(`${configuredPath}/`);

  return matchesDefault || matchesConfigured;
}
