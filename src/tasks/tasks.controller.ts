import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  Get,
  Body,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CsvService } from './csv.service';
import { GeocodeService } from './geocode.service';
import { DistanceService } from './distance.service';
import { TaskAllocationService } from './task-allocation.service';
import { Public } from '../common/decorators/public.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

@Controller('tasks')
export class TaskController {
  constructor(
    private readonly csvService: CsvService,
    private readonly geocodeService: GeocodeService,
    private readonly distanceService: DistanceService,
    private readonly taskAllocationService: TaskAllocationService,
  ) {}


  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post('upload-csv')
  @UseInterceptors(FileInterceptor('file', {
    limits: {
      fileSize: 10 * 1024 * 1024,
    },
    fileFilter: (req, file, callback) => {
      if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
        callback(null, true);
      } else {
        callback(new BadRequestException('Only CSV files are allowed'), false);
      }
    },
  }))
  async uploadCSV(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    return this.csvService.parseCSV(file);
  }


  @Public()
  @Post('geocode')
  async batchGeocode() {
    return this.geocodeService.batchGeocode();
  }


  @Public()
  @Get('nearest-workers')
  async nearestWorkers() {
    return this.distanceService.calculateNearestWorkers();
  }


  @Public()
  @Post('allocate')
  async allocateTasks() {
    return this.taskAllocationService.allocateTasks();
  }


  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post('allocate-optimized')
  async allocateTasksOptimized() {
    return this.taskAllocationService.allocateTasksOptimized();
  }


  @Get('performance-stats')
  async getPerformanceStats() {
    return this.taskAllocationService.getPerformanceStats();
  }


  @Get('allocation-trends')
  async getAllocationTrends() {
    return this.taskAllocationService.getAllocationTrends();
  }


  @Get('geocoding-stats')
  async getGeocodingStats() {
    return this.geocodeService.getGeocodingStats();
  }


  @Post('reset-failed-geocoding')
  async resetFailedGeocoding() {
    return this.geocodeService.resetFailedGeocoding();
  }


  @Get('cache-stats')
  async getCacheStats() {
    return this.taskAllocationService.getCacheStats();
  }


  @Public()
  @Get('unassigned')
  async getUnassignedTasks() {
    return this.taskAllocationService.getUnassignedTasks();
  }


  @Post('delete-unassigned')
  async deleteUnassigned(@Body('ids') ids: string[]) {
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException('IDs must be a non-empty array');
    }
    return this.taskAllocationService.deleteUnassignedTasks(ids);
  }
}
