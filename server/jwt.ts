import jwt from "jsonwebtoken";
import { createHash, randomBytes } from "crypto";

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_TTL = process.env.JWT_ACCESS_TTL || "15m";
const REFRESH_TTL = process.env.JWT_REFRESH_TTL || "30d";

export function ensureJwtSecrets(): void {
  if (!ACCESS_SECRET) {
    throw new Error("JWT_ACCESS_SECRET environment variable is required");
  }
  if (!REFRESH_SECRET) {
    throw new Error("JWT_REFRESH_SECRET environment variable is required");
  }
}

export interface AccessTokenPayload {
  userId: string;
  email: string;
}

export function generateAccessToken(user: { id: string; email: string }): string {
  return jwt.sign(
    { userId: user.id, email: user.email } as AccessTokenPayload,
    ACCESS_SECRET!,
    { expiresIn: ACCESS_TTL }
  );
}

export function generateRefreshToken(): string {
  return randomBytes(40).toString("hex");
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, ACCESS_SECRET!) as AccessTokenPayload;
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function getRefreshTokenExpiry(): Date {
  const match = REFRESH_TTL.match(/^(\d+)([smhd])$/);
  if (!match) {
    return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  }
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const ms = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[unit]!;
  return new Date(Date.now() + value * ms);
}
