import { type SettingKey, type SettingValue, settingsSchemas } from '@aurevi/shared';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
    const row = await this.prisma.setting.findUniqueOrThrow({ where: { key } });
    return settingsSchemas[key].parse(row.value) as SettingValue<K>;
  }
}
