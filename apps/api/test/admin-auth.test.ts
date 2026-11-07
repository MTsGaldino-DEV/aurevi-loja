// Integration tests against real Postgres; guards are tested with a fake ExecutionContext.
import { PrismaPg } from '@prisma/adapter-pg';
import argon2 from 'argon2';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, beforeEach, test } from 'node:test';
import type { ExecutionContext } from '@nestjs/common';
import { PrismaClient } from '../src/generated/prisma/client.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

process.env['ORDER_TOKEN_SECRET'] = 'test-secret-test-secret-test-secret';
process.env['MP_ACCESS_TOKEN'] = 'unused-in-tests';
process.loadEnvFile('.env');
process.env['DATABASE_URL'] = process.env['TEST_DATABASE_URL'] ?? '';
process.env['ADMIN_ALLOWED_ORIGINS'] = 'http://localhost:3000,https://admin.example.com';
assert.match(process.env['DATABASE_URL'], /_test/, 'Refusing to run outside a test database');

const { AdminAuthService } = await import('../src/admin/admin-auth.service.js');
const { AdminOriginGuard, AdminSessionGuard } = await import('../src/admin/admin-auth.guard.js');
const { LoginRateLimit } = await import('../src/admin/login-rate-limit.js');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }),
});
const auth = new AdminAuthService(prisma as unknown as PrismaService);

const EMAIL = 'dono@example.com';
const PASSWORD = 'senha-de-teste-123';
let adminId: string;

beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE admin_sessions, admin_users CASCADE');
  const admin = await prisma.adminUser.create({
    data: { email: EMAIL, passwordHash: await argon2.hash(PASSWORD) },
  });
  adminId = admin.id;
});

after(() => prisma.$disconnect());

const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const loginOk = async () => {
  const result = await auth.login(EMAIL, PASSWORD);
  assert.ok(result);
  return result;
};

test('login devolve token e grava só o hash', async () => {
  const { token, expiresAt, admin } = await loginOk();
  assert.deepEqual(admin, { id: adminId, email: EMAIL });
  assert.ok(expiresAt.getTime() > Date.now());
  const rows = await prisma.adminSession.findMany();
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.tokenHash, sha(token));
  assert.notEqual(rows[0]?.tokenHash, token);
});

test('login recusa e-mail inexistente, senha errada e usuário inativo', async () => {
  assert.equal(await auth.login('outro@example.com', PASSWORD), null);
  assert.equal(await auth.login(EMAIL, 'errada'), null);
  await prisma.adminUser.update({ where: { id: adminId }, data: { isActive: false } });
  assert.equal(await auth.login(EMAIL, PASSWORD), null);
  assert.equal(await prisma.adminSession.count(), 0);
});

test('authenticate aceita o token, recusa desconhecido', async () => {
  const { token } = await loginOk();
  assert.deepEqual(await auth.authenticate(token), { id: adminId, email: EMAIL });
  assert.equal(await auth.authenticate('desconhecido'), null);
});

test('authenticate recusa sessão expirada', async () => {
  const { token } = await loginOk();
  await prisma.adminSession.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal(await auth.authenticate(token), null);
});

test('authenticate recusa após logout', async () => {
  const { token } = await loginOk();
  await auth.logout(token);
  assert.equal(await auth.authenticate(token), null);
  assert.equal(await prisma.adminSession.count(), 0);
});

test('authenticate recusa se o usuário for desativado depois do login', async () => {
  const { token } = await loginOk();
  await prisma.adminUser.update({ where: { id: adminId }, data: { isActive: false } });
  assert.equal(await auth.authenticate(token), null);
});

test('changePassword com senha atual errada devolve false e nada muda', async () => {
  const { token } = await loginOk();
  const before = await prisma.adminUser.findUniqueOrThrow({ where: { id: adminId } });
  assert.equal(await auth.changePassword(adminId, 'errada', 'nova-senha-123', token), false);
  const after = await prisma.adminUser.findUniqueOrThrow({ where: { id: adminId } });
  assert.equal(after.passwordHash, before.passwordHash);
});

test('changePassword troca o hash, mantém a sessão atual e apaga as outras', async () => {
  const { token } = await loginOk();
  const other = await loginOk();
  assert.equal(await auth.changePassword(adminId, PASSWORD, 'nova-senha-123', token), true);
  const user = await prisma.adminUser.findUniqueOrThrow({ where: { id: adminId } });
  assert.ok(await argon2.verify(user.passwordHash, 'nova-senha-123'));
  assert.ok(await auth.authenticate(token));
  assert.equal(await auth.authenticate(other.token), null);
  assert.equal(await prisma.adminSession.count(), 1);
});

test('LoginRateLimit: 6ª falha em 15 min bloqueia, janela e reset liberam', () => {
  const limit = new LoginRateLimit();
  const t0 = 1_000_000;
  for (let i = 0; i < 5; i++) assert.equal(limit.hit('ip', t0 + i), true);
  assert.equal(limit.hit('ip', t0 + 10), false);
  assert.equal(limit.hit('ip', t0 + 15 * 60_000 + 11), true);
  limit.hit('b', t0);
  limit.reset('ip');
  for (let i = 0; i < 5; i++) assert.equal(limit.hit('ip', t0 + i), true);
});

const contextFor = (request: object) =>
  ({ switchToHttp: () => ({ getRequest: () => request }) }) as unknown as ExecutionContext;

test('AdminOriginGuard: GET passa; POST exige Origin permitido', () => {
  const guard = new AdminOriginGuard();
  const run = (method: string, origin?: string) =>
    guard.canActivate(contextFor({ method, headers: origin ? { origin } : {} }));
  assert.equal(run('GET'), true);
  assert.equal(run('HEAD'), true);
  assert.equal(run('OPTIONS'), true);
  assert.equal(run('POST', 'https://admin.example.com'), true);
  assert.throws(() => run('POST'), { status: 403 });
  assert.throws(() => run('POST', 'https://evil.example.com'), { status: 403 });
  assert.throws(() => run('DELETE', 'null'), { status: 403 });
});

test('AdminSessionGuard: 401 sem cookie ou com token inválido; grava request.admin', async () => {
  const guard = new AdminSessionGuard(auth);
  await assert.rejects(guard.canActivate(contextFor({ headers: {} })), { status: 401 });
  await assert.rejects(
    guard.canActivate(contextFor({ headers: { cookie: 'aurevi_admin=invalido' } })),
    { status: 401 },
  );
  const { token } = await loginOk();
  const request: { headers: object; admin?: unknown } = {
    headers: { cookie: `a=b; aurevi_admin=${token}` },
  };
  assert.equal(await guard.canActivate(contextFor(request)), true);
  assert.deepEqual(request.admin, { id: adminId, email: EMAIL });
});

// Controller: called directly with minimal fake request/response objects.
const { AdminAuthController } = await import('../src/admin/admin-auth.controller.js');

const fakeResponse = () => {
  const calls: { cookie: unknown[][]; clearCookie: unknown[][] } = { cookie: [], clearCookie: [] };
  const response = {
    cookie: (...args: unknown[]) => void calls.cookie.push(args),
    clearCookie: (...args: unknown[]) => void calls.clearCookie.push(args),
  };
  return { response: response as never, calls };
};
const newController = () => new AdminAuthController(auth, new LoginRateLimit());
const fakeRequest = (extra: object = {}) => ({ ip: '1.2.3.4', headers: {}, ...extra }) as never;

test('controller login: certo define cookie httpOnly e devolve o admin', async () => {
  const { response, calls } = fakeResponse();
  const result = await newController().login(fakeRequest(), response, {
    email: ` ${EMAIL.toUpperCase()} `,
    password: PASSWORD,
  });
  assert.deepEqual(result, { admin: { id: adminId, email: EMAIL } });
  assert.equal(calls.cookie.length, 1);
  assert.equal(calls.cookie[0]?.[0], 'aurevi_admin');
  assert.equal((calls.cookie[0]?.[2] as { httpOnly: boolean }).httpOnly, true);
});

test('controller login: dados inválidos dão 400; senha errada dá 401 sem cookie', async () => {
  const controller = newController();
  const { response, calls } = fakeResponse();
  await assert.rejects(controller.login(fakeRequest(), response, { email: 'x' }), { status: 400 });
  await assert.rejects(
    controller.login(fakeRequest(), response, { email: EMAIL, password: 'errada' }),
    { status: 401, message: 'E-mail ou senha incorretos.' },
  );
  assert.equal(calls.cookie.length, 0);
});

test('controller login: 6ª tentativa errada dá 429; sucesso zera a contagem', async () => {
  const controller = newController();
  const { response } = fakeResponse();
  const wrong = () => controller.login(fakeRequest(), response, { email: EMAIL, password: 'x' });
  for (let i = 0; i < 4; i++) await assert.rejects(wrong(), { status: 401 });
  await controller.login(fakeRequest(), response, { email: EMAIL, password: PASSWORD });
  for (let i = 0; i < 5; i++) await assert.rejects(wrong(), { status: 401 });
  await assert.rejects(wrong(), { status: 429 });
});

test('controller logout apaga a sessão e limpa o cookie', async () => {
  const { token } = await loginOk();
  const { response, calls } = fakeResponse();
  await newController().logout(
    fakeRequest({ headers: { cookie: `aurevi_admin=${token}` } }),
    response,
  );
  assert.equal(calls.clearCookie.length, 1);
  assert.equal(await auth.authenticate(token), null);
});

test('controller me devolve o admin da requisição', () => {
  const admin = { id: adminId, email: EMAIL };
  assert.deepEqual(newController().me(fakeRequest({ admin })), { admin });
});

test('controller password: senha atual errada dá 400; certa troca a senha', async () => {
  const { token } = await loginOk();
  const request = fakeRequest({
    admin: { id: adminId, email: EMAIL },
    headers: { cookie: `aurevi_admin=${token}` },
  });
  const controller = newController();
  await assert.rejects(
    controller.password(request, { currentPassword: 'errada', newPassword: 'nova-senha-123' }),
    { status: 400, message: 'Senha atual incorreta.' },
  );
  await controller.password(request, { currentPassword: PASSWORD, newPassword: 'nova-senha-123' });
  assert.ok(await auth.login(EMAIL, 'nova-senha-123'));
  assert.ok(await auth.authenticate(token));
});

test('controller login: 10 tentativas erradas em paralelo, no máximo 5 chegam a verificar a senha', async () => {
  let verified = 0;
  const countingAuth = {
    login: (email: string, password: string) => {
      verified++;
      return auth.login(email, password);
    },
  };
  const controller = new AdminAuthController(countingAuth as never, new LoginRateLimit());
  const { response } = fakeResponse();
  const results = await Promise.allSettled(
    Array.from({ length: 10 }, () =>
      controller.login(fakeRequest(), response, { email: EMAIL, password: 'x' }),
    ),
  );
  const statuses = results.map((r) => (r.status === 'rejected' ? (r.reason as { status: number }).status : 200));
  assert.ok(verified <= 5, `verified=${verified}`);
  assert.equal(statuses.filter((s) => s === 401).length, verified);
  assert.equal(statuses.filter((s) => s === 429).length, 10 - verified);
});

test('controller login: bloqueado após 5 falhas, nem a senha certa passa e não há cookie', async () => {
  const controller = newController();
  const { response, calls } = fakeResponse();
  for (let i = 0; i < 5; i++)
    await assert.rejects(
      controller.login(fakeRequest(), response, { email: EMAIL, password: 'x' }),
      { status: 401 },
    );
  await assert.rejects(
    controller.login(fakeRequest(), response, { email: EMAIL, password: PASSWORD }),
    { status: 429 },
  );
  assert.equal(calls.cookie.length, 0);
  assert.equal(await prisma.adminSession.count(), 0);
});
