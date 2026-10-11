-- CreateTable
CREATE TABLE "Facility" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Room" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "facilityId" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "floor" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "outOfOrder" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Room_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "facilityId" INTEGER NOT NULL,
    "externalKey" TEXT NOT NULL,
    "bookingNo" TEXT,
    "roomId" INTEGER,
    "roomNumber" TEXT,
    "roomType" TEXT,
    "arrival" TEXT,
    "departure" TEXT,
    "nights" INTEGER,
    "guestName" TEXT NOT NULL,
    "phone" TEXT,
    "pax" INTEGER,
    "groupCode" TEXT,
    "status" TEXT NOT NULL,
    "checkedInAt" DATETIME,
    "channel" TEXT,
    "mealPlan" TEXT,
    "settlement" TEXT,
    "pricePerNight" INTEGER,
    "couponPoints" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" INTEGER NOT NULL DEFAULT 0,
    "extraFee" INTEGER NOT NULL DEFAULT 0,
    "extraDetail" TEXT,
    "billed" INTEGER NOT NULL DEFAULT 0,
    "received" INTEGER NOT NULL DEFAULT 0,
    "unpaid" INTEGER NOT NULL DEFAULT 0,
    "receiptsRaw" TEXT,
    "planName" TEXT,
    "frontNote" TEXT,
    "sourceCreatedAt" DATETIME,
    "sourceCreatedBy" TEXT,
    "sourceUpdatedAt" DATETIME,
    "sourceUpdatedBy" TEXT,
    "isSample" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Reservation_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Reservation_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "reservationId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'payment',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "amount" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "brand" TEXT,
    "register" TEXT,
    "raw" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payment_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImportLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "facilityId" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "total" INTEGER NOT NULL,
    "created" INTEGER NOT NULL,
    "updated" INTEGER NOT NULL,
    "skipped" INTEGER NOT NULL,
    "warnings" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImportLog_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Facility_name_key" ON "Facility"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Room_facilityId_number_key" ON "Room"("facilityId", "number");

-- CreateIndex
CREATE INDEX "Reservation_facilityId_arrival_idx" ON "Reservation"("facilityId", "arrival");

-- CreateIndex
CREATE INDEX "Reservation_facilityId_departure_idx" ON "Reservation"("facilityId", "departure");

-- CreateIndex
CREATE UNIQUE INDEX "Reservation_facilityId_externalKey_key" ON "Reservation"("facilityId", "externalKey");
