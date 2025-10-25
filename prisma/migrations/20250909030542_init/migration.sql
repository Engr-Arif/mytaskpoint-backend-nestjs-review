-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('ADMIN', 'MANAGER', 'TERRITORY_OFFICER', 'WORKER');

-- CreateEnum
CREATE TYPE "public"."CallResult" AS ENUM ('PHONE_OFF', 'USER_BUSY', 'RECEIVED');

-- CreateEnum
CREATE TYPE "public"."DeliveryPossibility" AS ENUM ('POSSIBLE', 'NOT_POSSIBLE');

-- CreateEnum
CREATE TYPE "public"."TaskStatus" AS ENUM ('unassigned', 'assigned', 'accepted', 'rejected', 'completed');

-- CreateTable
CREATE TABLE "public"."Territory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Territory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "publicId" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "public"."Role" NOT NULL DEFAULT 'WORKER',
    "territoryId" TEXT,
    "refreshTokenHash" TEXT,
    "district" TEXT,
    "policeStation" TEXT,
    "area" TEXT,
    "lat" DOUBLE PRECISION,
    "lon" DOUBLE PRECISION,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Task" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lon" DOUBLE PRECISION,
    "status" "public"."TaskStatus" NOT NULL DEFAULT 'unassigned',
    "geocodePending" BOOLEAN NOT NULL DEFAULT true,
    "errorLog" TEXT,
    "transactionNumber" TEXT,
    "requisitionDate" TEXT,
    "requisitionTime" TEXT,
    "customerName" TEXT,
    "phone" TEXT,
    "city" TEXT,
    "area" TEXT,
    "thana" TEXT,
    "orderStatus" TEXT,
    "lastStatusUpdate" TEXT,
    "productType" TEXT,
    "productName" TEXT,
    "unitPriceExVat" DOUBLE PRECISION,
    "unitPriceIncVat" DOUBLE PRECISION,
    "productCode" TEXT,
    "qty" INTEGER,
    "mrp" DOUBLE PRECISION,
    "invoiceAmount" DOUBLE PRECISION,
    "paymentMode" TEXT,
    "deliveryPartner" TEXT,
    "assignedUserId" TEXT,
    "territoryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TaskRejection" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskRejection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CallReport" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "callerId" TEXT NOT NULL,
    "callerRole" "public"."Role" NOT NULL,
    "callStartTime" TIMESTAMP(3) NOT NULL,
    "callEndTime" TIMESTAMP(3) NOT NULL,
    "callResult" "public"."CallResult" NOT NULL,
    "deliveryPossibility" "public"."DeliveryPossibility" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Territory_name_key" ON "public"."Territory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "User_publicId_key" ON "public"."User"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_territoryId_fkey" FOREIGN KEY ("territoryId") REFERENCES "public"."Territory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_territoryId_fkey" FOREIGN KEY ("territoryId") REFERENCES "public"."Territory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TaskRejection" ADD CONSTRAINT "TaskRejection_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TaskRejection" ADD CONSTRAINT "TaskRejection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CallReport" ADD CONSTRAINT "CallReport_callerId_fkey" FOREIGN KEY ("callerId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CallReport" ADD CONSTRAINT "CallReport_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
