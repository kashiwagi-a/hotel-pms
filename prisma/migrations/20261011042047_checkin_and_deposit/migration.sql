-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "note" TEXT;

-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN "localCheckedInAt" DATETIME;
