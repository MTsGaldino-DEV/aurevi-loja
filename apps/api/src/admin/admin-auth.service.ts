import { Injectable } from '@nestjs/common';
import type { AdminProfile } from '@aurevi/shared';
import argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';

const SESSION_DAYS = 7;
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
// Verified against when the e-mail is unknown, so response time does not reveal which e-mails exist.
let fakeHash: Promise<string> | undefined;

@Injectable()
export class AdminAuthService {
  constructor(private readonly prisma: PrismaService) {}

  async login(email: string, password: string) {
    const user = await this.prisma.adminUser.findUnique({ where: { email } });
    const valid = await argon2.verify(
      user?.passwordHash ?? (await (fakeHash ??= argon2.hash('x'))),
      password,
    );
    if (!user || !valid || !user.isActive) return null;

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    await this.prisma.adminSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    await this.prisma.adminSession.create({
      data: { adminUserId: user.id, tokenHash: hashToken(token), expiresAt },
    });
    return { token, expiresAt, admin: { id: user.id, email: user.email } satisfies AdminProfile };
  }

  async authenticate(token: string): Promise<AdminProfile | null> {
    const session = await this.prisma.adminSession.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { adminUser: true },
    });
    if (!session || session.expiresAt <= new Date() || !session.adminUser.isActive) return null;
    return { id: session.adminUser.id, email: session.adminUser.email };
  }

  async logout(token: string) {
    await this.prisma.adminSession.deleteMany({ where: { tokenHash: hashToken(token) } });
  }

  async changePassword(
    adminId: string,
    currentPassword: string,
    newPassword: string,
    keepToken: string,
  ) {
    const user = await this.prisma.adminUser.findUnique({ where: { id: adminId } });
    if (!user || !(await argon2.verify(user.passwordHash, currentPassword))) return false;
    const passwordHash = await argon2.hash(newPassword);
    await this.prisma.$transaction([
      this.prisma.adminUser.update({ where: { id: adminId }, data: { passwordHash } }),
      this.prisma.adminSession.deleteMany({
        where: { adminUserId: adminId, tokenHash: { not: hashToken(keepToken) } },
      }),
    ]);
    return true;
  }
}
