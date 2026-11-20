import type { MetadataRoute } from 'next';
import { normalizeAdminPortalPath } from '@/lib/adminRoute';

export default function robots(): MetadataRoute.Robots {
  const customAdminPath = normalizeAdminPortalPath(
    process.env.ADMIN_PORTAL_PATH || process.env.NEXT_PUBLIC_ADMIN_PORTAL_PATH
  );

  const disallow = Array.from(
    new Set([
      '/admin',
      '/admin/',
      '/api/admin/',
      customAdminPath,
      `${customAdminPath}/`,
    ])
  );

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow,
      },
    ],
  };
}
