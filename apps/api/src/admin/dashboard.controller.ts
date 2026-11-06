import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminSessionGuard } from './admin-auth.guard.js';
import { DashboardService } from './dashboard.service.js';

@Controller('admin/dashboard')
@UseGuards(AdminSessionGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  get() {
    return this.dashboard.get();
  }
}
