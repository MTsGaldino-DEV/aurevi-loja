import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { noStore } from './admin/no-store.js';
import { env } from './env.js';

const app = await NestFactory.create(AppModule);
app.setGlobalPrefix('api');
app.use('/api/admin', noStore);
app.enableShutdownHooks();
await app.listen(env.API_PORT);
