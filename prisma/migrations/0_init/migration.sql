-- CreateTable
CREATE TABLE "Vote" (
    "id" TEXT NOT NULL,
    "isBlocked" BOOLEAN NOT NULL,
    "org" TEXT NOT NULL,
    "asn" TEXT NOT NULL,
    "usage" TEXT NOT NULL,
    "protocol" TEXT,
    "keyConfig" TEXT,
    "count" INTEGER NOT NULL DEFAULT 1,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "queueFailed" BOOLEAN NOT NULL DEFAULT false,
    "fingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DynamicOption" (
    "id" TEXT NOT NULL,
    "layer" TEXT NOT NULL,
    "parentKey" TEXT NOT NULL DEFAULT '',
    "value" TEXT NOT NULL,
    "isPreset" BOOLEAN NOT NULL DEFAULT false,
    "submitCount" INTEGER NOT NULL DEFAULT 0,
    "promoted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DynamicOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OptionContributor" (
    "id" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OptionContributor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalVotesAtGeneration" INTEGER NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Vote_resolved_isBlocked_org_asn_usage_idx" ON "Vote"("resolved", "isBlocked", "org", "asn", "usage");

-- CreateIndex
CREATE INDEX "Vote_resolved_idx" ON "Vote"("resolved");

-- CreateIndex
CREATE INDEX "DynamicOption_layer_promoted_idx" ON "DynamicOption"("layer", "promoted");

-- CreateIndex
CREATE INDEX "DynamicOption_layer_parentKey_idx" ON "DynamicOption"("layer", "parentKey");

-- CreateIndex
CREATE UNIQUE INDEX "DynamicOption_layer_value_parentKey_key" ON "DynamicOption"("layer", "value", "parentKey");

-- CreateIndex
CREATE UNIQUE INDEX "OptionContributor_optionId_fingerprint_key" ON "OptionContributor"("optionId", "fingerprint");

-- AddForeignKey
ALTER TABLE "OptionContributor" ADD CONSTRAINT "OptionContributor_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "DynamicOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

