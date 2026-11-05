import { Module } from '@nestjs/common';
import { CatalogController } from './catalog/catalog.controller.js';
import { CatalogService } from './catalog/catalog.service.js';
import { HealthController } from './health/health.controller.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { ShippingController } from './shipping/shipping.controller.js';
import { ShippingService } from './shipping/shipping.service.js';

@Module({
  imports: [PrismaModule, SettingsModule],
  controllers: [HealthController, CatalogController, ShippingController],
  providers: [CatalogService, ShippingService],
})
export class AppModule {}
