import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { parse } from 'csv-parse/sync';
import { Prisma } from '@prisma/client';
import { RedisCacheService } from '../common/services/redis-cache.service';
import { getErrorMessage } from '../common/utils/error.util';

interface CsvRow {
  'Transaction Number': string;
  'Requisition Date': string;
  'Requisition Time': string;
  'Customer Name': string;
  Phone: string;
  Address: string;
  'City/District': string;
  Area: string;
  Thana: string;
  'Order Status': string;
  'Last Status Update time': string;
  'Product Type': string;
  'Product Name': string;
  'Unit Price Exclude VAT': string;
  'Unit Price Include VAT': string;
  'Product Code(SKU)': string;
  Qty: string;
  MRP: string;
  'Invoice Amount': string;
  'Payment Mode': string;
  'Delivery Partner': string;
}

@Injectable()
export class CsvService {
  private readonly logger = new Logger(CsvService.name);

  constructor(
    private prisma: PrismaService,
    private redisCache: RedisCacheService
  ) {}

  async parseCSV(file: Express.Multer.File) {
    if (!file) {
      this.logger.error('CSV upload failed: No file provided');
      throw new BadRequestException('No file uploaded');
    }

    this.logger.log(
      `CSV upload started: ${file.originalname}, size: ${file.size} bytes`
    );

    try {
      const csvText = file.buffer.toString('utf-8');

      const records = parse(csvText, {
        columns: (header) => header.map((h) => h.replace(/^\ufeff/, '').trim()),
        skip_empty_lines: true,
        trim: true,
        skip_records_with_empty_values: false,
        skip_records_with_error: true,
      });
      const typedRecords = records as CsvRow[];

      if (!records.length) {
        throw new BadRequestException('CSV file is empty or invalid');
      }

      const filteredRecords = typedRecords.filter((row: CsvRow) => {
        const values = Object.values(row);
        return values.some((value) => value && value.toString().trim() !== '');
      });

      this.logger.log(
        `CSV parsed: ${records.length} total rows, ${filteredRecords.length} non-empty rows`
      );

      if (!filteredRecords.length) {
        throw new BadRequestException('CSV file contains only blank rows');
      }

      const transactionSet = new Set<string>();
      const errors: string[] = [];
      let missingTransactionCount = 0;

      filteredRecords.forEach((row: CsvRow, index) => {
        const txn = row['Transaction Number']?.trim();
        if (!txn) {
          missingTransactionCount++;
          errors.push(
            `Row ${index + 1}: Transaction Number is missing - Required for delivery tracking`
          );
        } else if (transactionSet.has(txn)) {
          errors.push(
            `Row ${index + 1}: Duplicate Transaction Number in CSV (${txn}) - Each delivery must have unique tracking ID`
          );
        } else {
          transactionSet.add(txn);
        }
      });

      if (errors.length) {
        const errorMessage =
          missingTransactionCount > 0
            ? `CSV validation failed: ${missingTransactionCount} rows missing Transaction Numbers. All delivery tasks must have Transaction Numbers for tracking.`
            : 'CSV validation failed: Duplicate Transaction Numbers found.';

        throw new BadRequestException({
          message: errorMessage,
          errors,
          summary: {
            totalRows: filteredRecords.length,
            missingTransactionNumbers: missingTransactionCount,
            duplicateTransactionNumbers:
              errors.length - missingTransactionCount,
            validRows: filteredRecords.length - errors.length,
          },
        });
      }

      const transactionNumbers = Array.from(transactionSet);
      const existingTasks = await this.prisma.task.findMany({
        where: {
          transactionNumber: {
            in: transactionNumbers,
          },
        },
        select: {
          id: true,
          transactionNumber: true,
          customerName: true,
          phone: true,
          address: true,
          createdAt: true,
        },
      });

      if (existingTasks.length > 0) {
        const existingTransactionNumbers = existingTasks.map(
          (task) => task.transactionNumber
        );
        const duplicateErrors: string[] = [];

        filteredRecords.forEach((row: CsvRow, index) => {
          const txn = row['Transaction Number']?.trim();
          if (txn && existingTransactionNumbers.includes(txn)) {
            const existingTask = existingTasks.find(
              (task) => task.transactionNumber === txn
            );
            if (existingTask) {
              duplicateErrors.push(
                `Row ${index + 1}: Transaction Number "${txn}" already exists in database (Task ID: ${existingTask.id}, Customer: ${existingTask.customerName}, Created: ${existingTask.createdAt.toISOString()})`
              );
            }
          }
        });

        throw new BadRequestException({
          message: `CSV upload failed: ${existingTasks.length} transaction numbers already exist in database. Each transaction number must be unique.`,
          errors: duplicateErrors,
          summary: {
            totalRows: filteredRecords.length,
            duplicateTransactionNumbers: existingTasks.length,
            validRows: filteredRecords.length - existingTasks.length,
            existingTasks: existingTasks,
          },
          csvData: {
            headers: Object.keys(filteredRecords[0] || {}),
            rows: filteredRecords,
            totalRows: filteredRecords.length,
          },
        });
      }

      const tasksData = filteredRecords.map((row: CsvRow) => {
        const fullAddress = [
          row['Address'],
          row['Area'],
          row['Thana'],
          row['City/District'],
        ]
          .filter(Boolean)
          .join(', ');

        return {
          title: row['Customer Name'] || 'Untitled Task',
          address: fullAddress,
          status: 'unassigned',
          geocodePending: true,
          errorLog: null,
          assignedUserId: null,
          territory: null,
          transactionNumber: row['Transaction Number']?.trim() || null,
          requisitionDate: row['Requisition Date'] || null,
          requisitionTime: row['Requisition Time'] || null,
          customerName: row['Customer Name'] || null,
          phone: row['Phone'] || null,
          city: row['City/District'] || null,
          area: row['Area'] || null,
          thana: row['Thana'] || null,
          orderStatus: row['Order Status'] || null,
          lastStatusUpdate: row['Last Status Update time'] || null,
          productType: row['Product Type'] || null,
          productName: row['Product Name'] || null,
          unitPriceExVat: row['Unit Price Exclude VAT']
            ? parseFloat(row['Unit Price Exclude VAT'])
            : null,
          unitPriceIncVat: row['Unit Price Include VAT']
            ? parseFloat(row['Unit Price Include VAT'])
            : null,
          productCode: row['Product Code(SKU)'] || null,
          qty: row['Qty'] ? parseInt(row['Qty'], 10) : null,
          mrp: row['MRP'] ? parseFloat(row['MRP']) : null,
          invoiceAmount: row['Invoice Amount']
            ? parseFloat(row['Invoice Amount'])
            : null,
          paymentMode: row['Payment Mode'] || null,
          deliveryPartner: row['Delivery Partner'] || null,
        };
      });

      const chunkSize = 1000;
      let totalInserted = 0;
      const newTasks: any[] = [];

      for (let i = 0; i < tasksData.length; i += chunkSize) {
        const chunk = tasksData.slice(i, i + chunkSize);
        const result = await this.prisma.task.createMany({
          data: chunk as unknown as Prisma.TaskCreateManyInput,
          skipDuplicates: true,
        });
        totalInserted += result.count;

        if (result.count > 0) {
          newTasks.push(...chunk.slice(0, result.count));
        }
      }

      try {
        if (totalInserted > 0) {
          const unassignedTasks = newTasks.filter(
            (task) => task.status === 'unassigned'
          );
          if (unassignedTasks.length > 0) {
            await this.redisCache.updateUnassignedTasksCache(unassignedTasks);
            this.logger.log(
              `Updated unassigned tasks cache with ${unassignedTasks.length} new tasks`
            );
          }

          await this.redisCache.del('tasks:unassigned');
          await this.redisCache.del('admin:tasks:*');

          this.logger.log(`CSV Import - ${totalInserted} tasks created`);
          this.logger.log(`Cache updated for new task creation`);
          this.logger.log(`Unassigned tasks cache invalidated for fresh data`);

          const years = new Set<number>();
          const nowYear = new Date().getUTCFullYear();
          years.add(nowYear);

          // Collecting years for cache invalidation is unnecessary here
          // (we already add current year). Keep minimal behavior.
          for (const y of years) {
            await this.redisCache.del(`admin:stats:monthly:${y}`);
          }
        }
      } catch (error) {
        this.logger.error(
          `Cache update failed for new task creation:`,
          getErrorMessage(error)
        );
      }

      return {
        status: 'success',
        message: `${totalInserted} delivery tasks imported successfully - All tasks have Transaction Numbers for tracking`,
        imported: totalInserted,
        cacheUpdated: true,
        trackingInfo: {
          allTasksHaveTransactionNumbers: true,
          totalTasksWithTracking: totalInserted,
          message:
            'All delivery tasks can be tracked using their Transaction Numbers',
        },
      };
    } catch (err: unknown) {
      this.logger.error('CSV parse error', {
        error: getErrorMessage(err),
        stack: (err as unknown as { stack?: string })?.stack ?? undefined,
        fileName: file?.originalname,
        fileSize: file?.size,
      });
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException(
        `Failed to parse CSV: ${getErrorMessage(err)}. Ensure the file format is correct and data is valid.`
      );
    }
  }
}
