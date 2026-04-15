import { Prisma, RawMarketLeadStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { RawMarketLeadFilters } from "@/types/crm";
import type { NormalizedMarketResult } from "@/lib/services/market-intelligence/types";
import { importMarketIntelligenceLead } from "@/lib/services/market-intelligence/import";
import { inferImportMode, inferSourceKind } from "@/lib/services/market-intelligence/source-origin";
import { normalizedMarketResultSchema } from "@/lib/validations/market-intelligence";

export type RawMarketLeadListItem = {
  id: string;
  rawRecordId: string;
  promotedToLeadId: string | null;
  company: string | null;
  product: string | null;
  country: string | null;
  sourceName: string;
  sourceUrl: string;
  sourceKind: "live" | "mock" | "test" | "fallback";
  importMode: "fetch" | "browser" | "manual" | "generated";
  confidenceScore: number | null;
  createdAt: Date;
  searchJobId: string | null;
  sourceRunId: string | null;
  status: RawMarketLeadStatus;
  leadId: string | null;
};

export type RawMarketLeadListResult = {
  items: RawMarketLeadListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

const parseNormalized = (value: Prisma.JsonValue): NormalizedMarketResult | null => {
  const parsed = normalizedMarketResultSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

const parseCreatedAtDate = (value: string | undefined) => {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  const next = new Date(parsed);
  next.setUTCDate(next.getUTCDate() + 1);
  return { gte: parsed, lt: next };
};

export const listRawMarketLeads = async (
  filters: RawMarketLeadFilters = {}
): Promise<RawMarketLeadListResult> => {
  const createdAtFilter = parseCreatedAtDate(filters.createdAt);
  const page = Number.isFinite(filters.page) && (filters.page || 0) > 0 ? Number(filters.page) : 1;
  const pageSizeInput = Number.isFinite(filters.pageSize) && (filters.pageSize || 0) > 0 ? Number(filters.pageSize) : 25;
  const pageSize = Math.min(Math.max(pageSizeInput, 10), 100);

  const where: Prisma.RawMarketLeadWhereInput = {
    AND: [
      filters.sourceName
        ? {
            sourceName: { contains: filters.sourceName, mode: "insensitive" }
          }
        : {},
      typeof filters.confidenceScore === "number" && Number.isFinite(filters.confidenceScore)
        ? {
            confidenceScore: { gte: filters.confidenceScore }
          }
        : {},
      createdAtFilter ? { createdAt: createdAtFilter } : {}
    ]
  };

  const rows = await prisma.rawMarketLead.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      sourceRun: {
        select: {
          executionMode: true
        }
      }
    }
  });

  const mapped = rows.map((row) => {
    const normalized = parseNormalized(row.normalized);
    const sourceKind = inferSourceKind({
      sourceName: row.sourceName,
      sourceUrl: row.sourceUrl,
      rawText: normalized?.raw_text,
      sourceKind: normalized?.source_kind
    });

    const importMode = inferImportMode({
      sourceName: row.sourceName,
      sourceUrl: row.sourceUrl,
      rawText: normalized?.raw_text,
      sourceKind: normalized?.source_kind,
      importMode: normalized?.import_mode,
      fallbackMode: (row.sourceRun?.executionMode as "fetch" | "browser" | "manual" | null) || null
    });

    return {
      id: row.id,
      rawRecordId: row.id,
      promotedToLeadId: row.leadId,
      company: normalized?.company || null,
      product: normalized?.product || null,
      country: normalized?.country || null,
      sourceName: row.sourceName,
      sourceUrl: row.sourceUrl,
      sourceKind,
      importMode,
      confidenceScore: row.confidenceScore ?? normalized?.confidence_score ?? null,
      createdAt: row.createdAt,
      searchJobId: row.searchJobId,
      sourceRunId: row.sourceRunId,
      status: row.status,
      leadId: row.leadId
    } satisfies RawMarketLeadListItem;
  });

  const filtered = mapped.filter((row) => {
    const productMatches = filters.product
      ? (row.product || "").toLowerCase().includes(filters.product.toLowerCase())
      : true;
    const countryMatches = filters.country
      ? (row.country || "").toLowerCase().includes(filters.country.toLowerCase())
      : true;
    return productMatches && countryMatches;
  });

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize);

  return {
    items,
    total,
    page: safePage,
    pageSize,
    totalPages
  };
};

const getRawLeadOrThrow = async (id: string) => {
  const rawLead = await prisma.rawMarketLead.findUnique({
    where: { id }
  });
  if (!rawLead) throw new Error("Raw market lead not found");
  return rawLead;
};

export const promoteRawMarketLead = async (id: string, saveCompany = true) => {
  const rawLead = await getRawLeadOrThrow(id);
  const normalized = parseNormalized(rawLead.normalized);
  if (!normalized) {
    throw new Error("Raw market lead has invalid normalized payload");
  }

  const imported = await importMarketIntelligenceLead({
    result: normalized,
    save_company: saveCompany,
    with_ai: false
  });

  await prisma.rawMarketLead.update({
    where: { id: rawLead.id },
    data: {
      status: RawMarketLeadStatus.IMPORTED,
      leadId: imported.leadId
    }
  });

  return imported;
};

export const rejectRawMarketLead = async (id: string) =>
  prisma.rawMarketLead.update({
    where: { id },
    data: { status: RawMarketLeadStatus.REJECTED }
  });

export const markRawMarketLeadDuplicate = async (id: string) => {
  const rawLead = await getRawLeadOrThrow(id);
  const existingLead = await prisma.lead.findFirst({
    where: {
      sourceUrl: {
        equals: rawLead.sourceUrl,
        mode: "insensitive"
      }
    },
    select: { id: true }
  });

  return prisma.rawMarketLead.update({
    where: { id: rawLead.id },
    data: {
      status: RawMarketLeadStatus.REJECTED,
      leadId: existingLead?.id || rawLead.leadId || null,
      aiClassification: "duplicate"
    }
  });
};
