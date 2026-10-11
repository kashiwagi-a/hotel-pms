/*
  Warnings:

  - You are about to drop the column `checkedInAt` on the `Reservation` table. All the data in the column will be lost.
  - You are about to drop the column `extraDetail` on the `Reservation` table. All the data in the column will be lost.
  - You are about to drop the column `extraFee` on the `Reservation` table. All the data in the column will be lost.
  - You are about to drop the column `frontNote` on the `Reservation` table. All the data in the column will be lost.
  - You are about to drop the column `groupCode` on the `Reservation` table. All the data in the column will be lost.
  - You are about to drop the column `mealPlan` on the `Reservation` table. All the data in the column will be lost.
  - You are about to drop the column `pricePerNight` on the `Reservation` table. All the data in the column will be lost.
  - You are about to drop the column `receiptsRaw` on the `Reservation` table. All the data in the column will be lost.
  - You are about to drop the column `received` on the `Reservation` table. All the data in the column will be lost.
  - You are about to drop the column `roomId` on the `Reservation` table. All the data in the column will be lost.
  - You are about to drop the column `roomNumber` on the `Reservation` table. All the data in the column will be lost.
  - You are about to drop the column `sourceCreatedAt` on the `Reservation` table. All the data in the column will be lost.
  - You are about to drop the column `sourceCreatedBy` on the `Reservation` table. All the data in the column will be lost.
  - You are about to drop the column `sourceUpdatedAt` on the `Reservation` table. All the data in the column will be lost.
  - You are about to drop the column `sourceUpdatedBy` on the `Reservation` table. All the data in the column will be lost.
  - You are about to drop the column `unpaid` on the `Reservation` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "RoomAssignment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "reservationId" INTEGER NOT NULL,
    "roomId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RoomAssignment_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RoomAssignment_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Reservation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "facilityId" INTEGER NOT NULL,
    "externalKey" TEXT NOT NULL,
    "bookingNo" TEXT,
    "status" TEXT NOT NULL,
    "arrival" TEXT,
    "departure" TEXT,
    "nights" INTEGER,
    "pax" INTEGER,
    "roomCount" INTEGER NOT NULL DEFAULT 1,
    "roomTypeCode" TEXT,
    "roomType" TEXT,
    "planName" TEXT,
    "channel" TEXT,
    "guestName" TEXT NOT NULL,
    "phone" TEXT,
    "settlement" TEXT,
    "couponPoints" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" INTEGER NOT NULL DEFAULT 0,
    "billed" INTEGER NOT NULL DEFAULT 0,
    "memo" TEXT,
    "confirmMark" TEXT,
    "printMark" TEXT,
    "linkMark" TEXT,
    "bookedAt" DATETIME,
    "isSample" BOOLEAN NOT NULL DEFAULT false,
    "localCheckedInAt" DATETIME,
    "localCheckedOutAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Reservation_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Reservation" ("arrival", "billed", "bookingNo", "channel", "couponPoints", "createdAt", "departure", "externalKey", "facilityId", "guestName", "id", "isSample", "localCheckedInAt", "nights", "pax", "phone", "planName", "roomType", "settlement", "status", "totalAmount", "updatedAt") SELECT "arrival", "billed", "bookingNo", "channel", "couponPoints", "createdAt", "departure", "externalKey", "facilityId", "guestName", "id", "isSample", "localCheckedInAt", "nights", "pax", "phone", "planName", "roomType", "settlement", "status", "totalAmount", "updatedAt" FROM "Reservation";
DROP TABLE "Reservation";
ALTER TABLE "new_Reservation" RENAME TO "Reservation";
CREATE INDEX "Reservation_facilityId_arrival_idx" ON "Reservation"("facilityId", "arrival");
CREATE INDEX "Reservation_facilityId_departure_idx" ON "Reservation"("facilityId", "departure");
CREATE UNIQUE INDEX "Reservation_facilityId_externalKey_key" ON "Reservation"("facilityId", "externalKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "RoomAssignment_roomId_idx" ON "RoomAssignment"("roomId");

-- CreateIndex
CREATE UNIQUE INDEX "RoomAssignment_reservationId_roomId_key" ON "RoomAssignment"("reservationId", "roomId");
