import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { PrismaService } from '../prisma/prisma.service.js';
import { MelhorEnvioService } from './melhor-envio.service.js';

const prisma = new PrismaService();
const terminal = createInterface({ input: stdin, output: stdout });
try {
  const melhorEnvio = new MelhorEnvioService(prisma);
  const state = randomBytes(32).toString('hex');
  stdout.write(
    `Abra este endereço e autorize apenas a cotação de fretes:\n${melhorEnvio.authorizationUrl(state)}\n\n`,
  );
  const callback = await terminal.question(
    'Após autorizar, cole aqui a URL completa da página de retorno: ',
  );
  await melhorEnvio.connect(callback.trim(), state);
  stdout.write('Melhor Envio conectado. Os tokens foram cifrados e salvos no banco.\n');
} catch {
  // The pasted URL contains a temporary authorization code; never echo it on failure.
  stdout.write(
    'Não foi possível conectar. Confira a configuração da API e reinicie este comando para autorizar novamente.\n',
  );
  process.exitCode = 1;
} finally {
  terminal.close();
  await prisma.$disconnect();
}
