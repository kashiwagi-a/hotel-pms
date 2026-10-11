import { PrismaClient } from '@prisma/client';

// 開発中のホットリロードで接続が増えないよう、1 つのクライアントを使い回す
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
