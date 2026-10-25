-- CreateEnum
CREATE TYPE "BoardRole" AS ENUM ('owner', 'member');

-- AlterTable
ALTER TABLE "ApiToken" ADD COLUMN     "createdById" UUID;

-- CreateTable
CREATE TABLE "BoardMember" (
    "boardId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "BoardRole" NOT NULL DEFAULT 'member',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoardMember_pkey" PRIMARY KEY ("boardId","userId")
);

-- CreateIndex
CREATE INDEX "BoardMember_userId_idx" ON "BoardMember"("userId");

-- CreateIndex
CREATE INDEX "ApiToken_createdById_idx" ON "ApiToken"("createdById");

-- AddForeignKey
ALTER TABLE "ApiToken" ADD CONSTRAINT "ApiToken_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardMember" ADD CONSTRAINT "BoardMember_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardMember" ADD CONSTRAINT "BoardMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: the creator of each existing board becomes its owner. Boards created by an agent
-- go to the oldest human, since agents act on behalf of a human.
INSERT INTO "BoardMember" ("boardId", "userId", "role")
SELECT b."id",
       CASE WHEN u."type" = 'agent'
            THEN (SELECT h."id" FROM "User" h WHERE h."type" = 'human' ORDER BY h."createdAt" LIMIT 1)
            ELSE b."createdById" END,
       'owner'
FROM "Board" b
JOIN "User" u ON u."id" = b."createdById"
WHERE u."type" = 'human'
   OR EXISTS (SELECT 1 FROM "User" h WHERE h."type" = 'human');

-- Backfill: a human's own token was created by that human; an existing agent token is
-- attributed to the oldest human (who keeps the access the token had in practice).
UPDATE "ApiToken" t
SET "createdById" = CASE WHEN u."type" = 'human'
                         THEN t."userId"
                         ELSE (SELECT h."id" FROM "User" h WHERE h."type" = 'human' ORDER BY h."createdAt" LIMIT 1) END
FROM "User" u
WHERE u."id" = t."userId";
