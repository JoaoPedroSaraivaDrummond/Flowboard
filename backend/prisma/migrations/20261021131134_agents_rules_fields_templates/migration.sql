-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('human', 'agent');

-- CreateEnum
CREATE TYPE "CustomFieldType" AS ENUM ('text', 'number', 'select', 'url');

-- AlterTable
ALTER TABLE "Card" ADD COLUMN     "completedAt" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "List" ADD COLUMN     "onEnterAssigneeId" UUID,
ADD COLUMN     "onEnterLabelId" UUID,
ADD COLUMN     "onEnterMarkDone" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "wipLimit" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "type" "UserType" NOT NULL DEFAULT 'human';

-- CreateTable
CREATE TABLE "CustomField" (
    "id" UUID NOT NULL,
    "boardId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CustomFieldType" NOT NULL,
    "options" TEXT[],
    "position" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "CustomField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardCustomFieldValue" (
    "cardId" UUID NOT NULL,
    "fieldId" UUID NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "CardCustomFieldValue_pkey" PRIMARY KEY ("cardId","fieldId")
);

-- CreateTable
CREATE TABLE "CardTemplate" (
    "id" UUID NOT NULL,
    "boardId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "checklist" TEXT[],
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomField_boardId_name_key" ON "CustomField"("boardId", "name");

-- CreateIndex
CREATE INDEX "CardCustomFieldValue_fieldId_idx" ON "CardCustomFieldValue"("fieldId");

-- CreateIndex
CREATE UNIQUE INDEX "CardTemplate_boardId_name_key" ON "CardTemplate"("boardId", "name");

-- AddForeignKey
ALTER TABLE "List" ADD CONSTRAINT "List_onEnterAssigneeId_fkey" FOREIGN KEY ("onEnterAssigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "List" ADD CONSTRAINT "List_onEnterLabelId_fkey" FOREIGN KEY ("onEnterLabelId") REFERENCES "Label"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomField" ADD CONSTRAINT "CustomField_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardCustomFieldValue" ADD CONSTRAINT "CardCustomFieldValue_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardCustomFieldValue" ADD CONSTRAINT "CardCustomFieldValue_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "CustomField"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardTemplate" ADD CONSTRAINT "CardTemplate_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;
