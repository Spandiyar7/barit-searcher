-- CreateEnum
CREATE TYPE "SearchJobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "SourceRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'BLOCKED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "RawMarketLeadStatus" AS ENUM ('PENDING_REVIEW', 'IMPORTED', 'REJECTED');

-- CreateTable
CREATE TABLE "SearchJob" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "country" TEXT,
    "intent" TEXT,
    "customSources" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "parsedQuery" JSONB,
    "recommendedSources" JSONB,
    "selectedSources" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "maxSources" INTEGER NOT NULL DEFAULT 5,
    "maxResultsPerSource" INTEGER NOT NULL DEFAULT 12,
    "status" "SearchJobStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "totalSources" INTEGER NOT NULL DEFAULT 0,
    "processedSources" INTEGER NOT NULL DEFAULT 0,
    "totalResults" INTEGER NOT NULL DEFAULT 0,
    "importedLeads" INTEGER NOT NULL DEFAULT 0,
    "savedRawLeads" INTEGER NOT NULL DEFAULT 0,
    "lowConfidenceDropped" INTEGER NOT NULL DEFAULT 0,
    "warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "savedSearchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchJobSourceRun" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "executionMode" TEXT NOT NULL,
    "status" "SourceRunStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "responseStatus" INTEGER,
    "parseStatus" TEXT,
    "extractedResults" INTEGER NOT NULL DEFAULT 0,
    "importedLeads" INTEGER NOT NULL DEFAULT 0,
    "savedRawLeads" INTEGER NOT NULL DEFAULT 0,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "diagnostics" JSONB,
    "resultsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchJobSourceRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawMarketLead" (
    "id" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceUrlHash" TEXT NOT NULL,
    "searchJobId" TEXT,
    "sourceRunId" TEXT,
    "normalized" JSONB NOT NULL,
    "aiClassification" TEXT,
    "aiSummary" TEXT,
    "relevanceScore" DOUBLE PRECISION,
    "confidenceScore" DOUBLE PRECISION,
    "status" "RawMarketLeadStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "leadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RawMarketLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedSearch" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "country" TEXT,
    "intent" TEXT,
    "customSources" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "frequencyHours" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedSearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourcePerformance" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "totalRuns" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "blockedCount" INTEGER NOT NULL DEFAULT 0,
    "totalExtracted" INTEGER NOT NULL DEFAULT 0,
    "totalRelevance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "averageExtracted" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "averageRelevance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastSuccessAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourcePerformance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SearchJob_status_idx" ON "SearchJob"("status");

-- CreateIndex
CREATE INDEX "SearchJob_createdAt_idx" ON "SearchJob"("createdAt");

-- CreateIndex
CREATE INDEX "SearchJob_savedSearchId_idx" ON "SearchJob"("savedSearchId");

-- CreateIndex
CREATE INDEX "SearchJobSourceRun_jobId_idx" ON "SearchJobSourceRun"("jobId");

-- CreateIndex
CREATE INDEX "SearchJobSourceRun_sourceId_idx" ON "SearchJobSourceRun"("sourceId");

-- CreateIndex
CREATE INDEX "SearchJobSourceRun_status_idx" ON "SearchJobSourceRun"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SearchJobSourceRun_jobId_sourceId_key" ON "SearchJobSourceRun"("jobId", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "RawMarketLead_sourceUrlHash_key" ON "RawMarketLead"("sourceUrlHash");

-- CreateIndex
CREATE INDEX "RawMarketLead_sourceName_idx" ON "RawMarketLead"("sourceName");

-- CreateIndex
CREATE INDEX "RawMarketLead_status_idx" ON "RawMarketLead"("status");

-- CreateIndex
CREATE INDEX "RawMarketLead_searchJobId_idx" ON "RawMarketLead"("searchJobId");

-- CreateIndex
CREATE INDEX "RawMarketLead_sourceRunId_idx" ON "RawMarketLead"("sourceRunId");

-- CreateIndex
CREATE INDEX "RawMarketLead_createdAt_idx" ON "RawMarketLead"("createdAt");

-- CreateIndex
CREATE INDEX "SavedSearch_isActive_nextRunAt_idx" ON "SavedSearch"("isActive", "nextRunAt");

-- CreateIndex
CREATE INDEX "SavedSearch_createdAt_idx" ON "SavedSearch"("createdAt");

-- CreateIndex
CREATE INDEX "SourcePerformance_sourceId_idx" ON "SourcePerformance"("sourceId");

-- CreateIndex
CREATE INDEX "SourcePerformance_intent_idx" ON "SourcePerformance"("intent");

-- CreateIndex
CREATE UNIQUE INDEX "SourcePerformance_sourceId_intent_key" ON "SourcePerformance"("sourceId", "intent");

-- AddForeignKey
ALTER TABLE "SearchJob" ADD CONSTRAINT "SearchJob_savedSearchId_fkey" FOREIGN KEY ("savedSearchId") REFERENCES "SavedSearch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchJobSourceRun" ADD CONSTRAINT "SearchJobSourceRun_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "SearchJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawMarketLead" ADD CONSTRAINT "RawMarketLead_searchJobId_fkey" FOREIGN KEY ("searchJobId") REFERENCES "SearchJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawMarketLead" ADD CONSTRAINT "RawMarketLead_sourceRunId_fkey" FOREIGN KEY ("sourceRunId") REFERENCES "SearchJobSourceRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawMarketLead" ADD CONSTRAINT "RawMarketLead_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
