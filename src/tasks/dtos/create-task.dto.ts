import { IsString, IsOptional, IsNumber, IsInt } from 'class-validator';

export class CreateTaskDto {
  @IsString()
  title!: string;

  @IsString()
  address!: string;

  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lon?: number;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  geocodePending?: boolean;

  @IsOptional()
  @IsString()
  errorLog?: string;

  @IsOptional()
  @IsString()
  transactionNumber?: string;

  @IsOptional()
  @IsString()
  requisitionDate?: string;

  @IsOptional()
  @IsString()
  requisitionTime?: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  area?: string;

  @IsOptional()
  @IsString()
  thana?: string;

  @IsOptional()
  @IsString()
  orderStatus?: string;

  @IsOptional()
  @IsString()
  lastStatusUpdate?: string;

  @IsOptional()
  @IsString()
  productType?: string;

  @IsOptional()
  @IsString()
  productName?: string;

  @IsOptional()
  @IsNumber()
  unitPriceExVat?: number;

  @IsOptional()
  @IsNumber()
  unitPriceIncVat?: number;

  @IsOptional()
  @IsString()
  productCode?: string;

  @IsOptional()
  @IsInt()
  qty?: number;

  @IsOptional()
  @IsNumber()
  mrp?: number;

  @IsOptional()
  @IsNumber()
  invoiceAmount?: number;

  @IsOptional()
  @IsString()
  paymentMode?: string;

  @IsOptional()
  @IsString()
  deliveryPartner?: string;

  @IsOptional()
  @IsString()
  assignedUserId?: string;

  @IsOptional()
  @IsString()
  territory?: string;
}
