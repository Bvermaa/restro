import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

export interface TokenUserPayload {
  id: string;
  email: string;
  role: string;
  name: string;
  kitchenRestaurantId?: string | null;
  sessionId?: string;
}

export const REFRESH_TOKEN_COOKIE_NAME = 'rt';
export const REFRESH_TOKEN_COOKIE_PATH = '/api/v1/auth';
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Generate short-lived JWT access token (default 15 minutes)
 */
export function generateAccessToken(payload: TokenUserPayload): string {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    throw new AppError('Server misconfiguration: JWT_ACCESS_SECRET is required', 500, 'SERVER_ERROR');
  }
  const expiresIn = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
  return jwt.sign(payload, secret, { expiresIn: expiresIn as any });
}

/**
 * Generate cryptographically secure base64url refresh token
 */
export function generateRawRefreshToken(): string {
  return crypto.randomBytes(64).toString('base64url');
}

/**
 * Compute SHA-256 hash of a raw token for database storage
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Set HttpOnly, Secure, SameSite=Lax cookie for the refresh token
 */
export function setRefreshTokenCookie(res: Response, rawToken: string): void {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie(REFRESH_TOKEN_COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: REFRESH_TOKEN_COOKIE_PATH,
    maxAge: REFRESH_TOKEN_TTL_MS,
  });
}

/**
 * Clear the refresh token cookie
 */
export function clearRefreshTokenCookie(res: Response): void {
  const isProd = process.env.NODE_ENV === 'production';
  res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: REFRESH_TOKEN_COOKIE_PATH,
  });
}

/**
 * Issue and persist a new refresh token record for a user
 */
export async function issueRefreshToken(
  userId: string,
  userAgent?: string,
  ip?: string,
  familyId?: string
): Promise<{ rawToken: string; familyId: string }> {
  const rawToken = generateRawRefreshToken();
  const tokenHash = hashToken(rawToken);
  const activeFamilyId = familyId || crypto.randomUUID();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

  await prisma.refreshToken.create({
    data: {
      tokenHash,
      familyId: activeFamilyId,
      userId,
      expiresAt,
      userAgent: userAgent || null,
      ip: ip || null,
    },
  });

  return { rawToken, familyId: activeFamilyId };
}

/**
 * Rotate refresh token:
 * - Detects reuse of revoked tokens and revokes the whole family
 * - Revokes current token and issues new token in the same family
 * - Issues a new JWT access token
 */
export async function rotateRefreshToken(
  rawToken: string,
  userAgent?: string,
  ip?: string
): Promise<{ accessToken: string; newRawToken: string; user: TokenUserPayload }> {
  if (!rawToken) {
    throw new AppError('Refresh token is required.', 401, 'REFRESH_TOKEN_REQUIRED');
  }

  const tokenHash = hashToken(rawToken);

  const tokenRecord = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          role: true,
          name: true,
          kitchenRestaurantId: true,
          verifyToken: true,
          deletedAt: true,
        },
      },
    },
  });

  if (!tokenRecord) {
    throw new AppError('Invalid refresh token.', 401, 'INVALID_REFRESH_TOKEN');
  }

  // Token reuse detection: if already revoked, revoke the ENTIRE family immediately
  if (tokenRecord.revokedAt !== null) {
    logger.warn(`[SECURITY ALERT] Refresh token reuse detected for family ${tokenRecord.familyId}, user ${tokenRecord.userId}`);
    await prisma.refreshToken.updateMany({
      where: { familyId: tokenRecord.familyId },
      data: { revokedAt: new Date() },
    });
    throw new AppError(
      'Compromised refresh token reuse detected. All sessions in this chain have been revoked. Please log in again.',
      401,
      'REFRESH_TOKEN_REUSED'
    );
  }

  // Expiration check
  if (tokenRecord.expiresAt < new Date()) {
    throw new AppError('Refresh token expired. Please log in again.', 401, 'REFRESH_TOKEN_EXPIRED');
  }

  // Account status check
  const user = tokenRecord.user;
  if (!user || user.deletedAt !== null || user.verifyToken === 'SUSPENDED') {
    throw new AppError('Account is inactive, suspended or deleted.', 401, 'ACCOUNT_INACTIVE');
  }

  const newRawToken = generateRawRefreshToken();
  const newTokenHash = hashToken(newRawToken);
  const now = new Date();
  const newExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

  // Atomic rotation transaction
  const userPayload: TokenUserPayload = {
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    kitchenRestaurantId: user.kitchenRestaurantId,
  };

  await prisma.$transaction(async (tx) => {
    const createdNew = await tx.refreshToken.create({
      data: {
        tokenHash: newTokenHash,
        familyId: tokenRecord.familyId,
        userId: user.id,
        expiresAt: newExpiresAt,
        userAgent: userAgent || null,
        ip: ip || null,
      },
    });

    await tx.refreshToken.update({
      where: { id: tokenRecord.id },
      data: {
        revokedAt: now,
        replacedById: createdNew.id,
      },
    });
  });

  const accessToken = generateAccessToken(userPayload);

  return {
    accessToken,
    newRawToken,
    user: userPayload,
  };
}

/**
 * Revoke the entire family for a given refresh token (used on logout)
 */
export async function revokeRefreshTokenFamily(rawToken?: string): Promise<void> {
  if (!rawToken) return;

  const tokenHash = hashToken(rawToken);
  const tokenRecord = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    select: { familyId: true },
  });

  if (tokenRecord) {
    await prisma.refreshToken.updateMany({
      where: { familyId: tokenRecord.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

/**
 * Revoke ALL refresh tokens for a user (used on password change/reset and logout-all)
 */
export async function revokeAllUserRefreshTokens(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Delete refresh tokens that expired more than 7 days ago
 */
export async function cleanupExpiredRefreshTokens(): Promise<number> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const result = await prisma.refreshToken.deleteMany({
    where: {
      expiresAt: { lt: cutoff },
    },
  });
  logger.info(`[CLEANUP] Deleted ${result.count} expired refresh tokens.`);
  return result.count;
}
