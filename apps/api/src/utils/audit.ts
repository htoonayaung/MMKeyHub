import { ActorType, Prisma } from '@prisma/client';
import type { Request } from 'express';
import { prisma } from '../lib/prisma.js';

export type AuditDbClient = Prisma.TransactionClient | typeof prisma;

export function extractClientIp(req?: Request | null): string | null {
  if (!req) return null;
  const xff = req.header('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  const realIp = req.header('x-real-ip')?.trim();
  if (realIp) return realIp.slice(0, 64);
  const raw = req.ip || req.socket?.remoteAddress || null;
  return raw ? raw.slice(0, 64) : null;
}

export async function recordAuditLog(
  db: AuditDbClient,
  params: {
    actorType: ActorType;
    actorId: string;
    actorIp?: string | null;
    action: string;
    entityType: string;
    entityId: string;
    targetId?: string | null;
    metadata?: Prisma.InputJsonValue;
  }
): Promise<void> {
  await db.auditLog.create({
    data: {
      actorType: params.actorType,
      actorId: params.actorId,
      actorIp: params.actorIp ?? null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      targetId: params.targetId ?? params.entityId,
      ...(params.metadata !== undefined ? { metadata: params.metadata } : {}),
    },
  });
}
