import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/auth.decorators';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get('health')
  @ApiOperation({ summary: 'Check whether the API process is running' })
  @ApiResponse({ status: 200, description: 'The API process is healthy.' })
  health() {
    return this.healthService.health();
  }

  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Check PostgreSQL connectivity and schema readiness' })
  @ApiResponse({ status: 200, description: 'The API is ready to serve traffic.' })
  @ApiResponse({ status: 503, description: 'PostgreSQL or its schema is not ready.' })
  readiness() {
    return this.healthService.readiness();
  }
}
