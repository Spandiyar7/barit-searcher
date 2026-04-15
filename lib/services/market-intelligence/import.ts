import { createHash } from "node:crypto";
import { CompanyStatus, CompanyType, LeadPriority, LeadStatus, LeadType, Prisma } from "@prisma/client";
import { parseLeadText, summarizeLead } from "@/lib/ai";
import { prisma } from "@/lib/db/prisma";
import { enrichCompanyFromMarketResult, type CompanyEnrichment } from "@/lib/services/company-enrichment";
import { findProductByNameOrSynonym } from "@/lib/services/products";
import { withOriginMeta } from "./source-origin";
import { findMatchingLeadBySignals, updateExistingLeadFromResult } from "./dedupe";
import { extractVisibleTextFromHtml, fetchPublicHtml, normalizeText as normalizeSharedText } from "./engines/shared";
import type {
  MarketIntelligenceImportInput,
  MarketIntelligenceImportResponse,
  MarketIntelligenceManualImportInput,
  MarketIntelligenceManualImportResponse,
  MarketRole,
  NormalizedMarketResult
} from "./types";

const DEFAULT_PRODUCT_NAME = "Uncategorized Commodity";

const normalizeText = (value: string | null | undefined) => {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim();
};

const truncate = (value: string, max = 255) => (value.length <= max ? value : `${value.slice(0, max - 1)}…`);

const normalizeDomain = (value: string | null | undefined) => {
  const normalized = normalizeText(value);
  if (!normalized) return "";
  try {
    return new URL(normalized).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return normalized.toLowerCase().replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0];
  }
};

const normalizeCompanyForMatch = (value: string | null | undefined) =>
  normalizeText(value)
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(
      /\b(llc|ltd|limited|inc|corp|co|company|gmbh|sarl|sa|jsc|llp|pte|fze|dmcc|l\.l\.c)\b/g,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();

const companySimilarity = (a: string, b: string) => {
  const left = new Set(normalizeCompanyForMatch(a).split(" ").filter(Boolean));
  const right = new Set(normalizeCompanyForMatch(b).split(" ").filter(Boolean));
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  left.forEach((token) => {
    if (right.has(token)) intersection += 1;
  });
  const union = new Set([...left, ...right]).size;
  return union > 0 ? intersection / union : 0;
};

const mapRoleToLeadType = (role: MarketRole | undefined, resultType: string): LeadType => {
  if (role === "buyer" || role === "importer") return "BUY";
  if (role === "supplier" || role === "exporter") return "SELL";

  const lowered = resultType.toLowerCase();
  if (/(buyer|rfq|import)/.test(lowered)) return "BUY";
  if (/(supplier|manufacturer|export|offer)/.test(lowered)) return "SELL";
  return "INQUIRY";
};

const mapLeadTypeToRole = (leadType: LeadType): MarketRole => {
  if (leadType === "BUY") return "buyer";
  if (leadType === "SELL") return "supplier";
  return "trader";
};

const mapRoleToCompanyType = (role: MarketRole | undefined): CompanyType => {
  if (role === "buyer" || role === "importer") return CompanyType.BUYER;
  if (role === "supplier" || role === "exporter") return CompanyType.SUPPLIER;
  if (role === "trader") return CompanyType.TRADER;
  return CompanyType.OTHER;
};

const pickPriority = (relevanceScore: number | undefined): LeadPriority => {
  if (typeof relevanceScore !== "number") return LeadPriority.MEDIUM;
  if (relevanceScore >= 0.78) return LeadPriority.HIGH;
  if (relevanceScore <= 0.45) return LeadPriority.LOW;
  return LeadPriority.MEDIUM;
};

const parseVolumeAndUnit = (quantity: string | null) => {
  if (!quantity) return { volume: null as number | null, unit: null as string | null };

  const numeric = quantity.match(/(\d{1,3}(?:[,\s]\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)/);
  if (!numeric?.[1]) return { volume: null as number | null, unit: null as string | null };

  const parsed = Number(numeric[1].replace(/[,\s]/g, ""));
  if (!Number.isFinite(parsed)) return { volume: null as number | null, unit: null as string | null };

  const unitMatch = quantity.match(/\b(mt|ton|tons|tonne|tonnes|kg|kgs|lb|lbs|bag|bags|container|containers|m3|cbm)\b/i);

  return {
    volume: parsed,
    unit: unitMatch ? unitMatch[1].toUpperCase() : null
  };
};

const parsePublishedAt = (postedDate: string | null) => {
  if (!postedDate) return null;
  const parsed = new Date(postedDate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const findOrCreateFallbackProductId = async () => {
  const existing = await prisma.product.findFirst({
    where: { name: { equals: DEFAULT_PRODUCT_NAME, mode: "insensitive" } },
    select: { id: true }
  });
  if (existing) return existing.id;

  try {
    const created = await prisma.product.create({
      data: {
        name: DEFAULT_PRODUCT_NAME,
        category: "General",
        synonyms: []
      },
      select: { id: true }
    });

    return created.id;
  } catch {
    const retry = await prisma.product.findFirst({
      where: { name: { equals: DEFAULT_PRODUCT_NAME, mode: "insensitive" } },
      select: { id: true }
    });
    if (retry) return retry.id;
  }

  const fallback = await prisma.product.findFirst({
    orderBy: { updatedAt: "desc" },
    select: { id: true }
  });

  if (!fallback) throw new Error("No products found to attach imported lead.");
  return fallback.id;
};

const resolveProductId = async (input: MarketIntelligenceImportInput) => {
  const candidates = [
    input.result.product,
    input.parsed_query?.product,
    input.result.description,
    input.result.raw_text,
    input.result.company
  ].filter((item): item is string => Boolean(item && item.trim()));

  for (const candidate of candidates) {
    const product = await findProductByNameOrSynonym(candidate);
    if (product) return product.id;
  }

  return findOrCreateFallbackProductId();
};

const inferCompanyNameFromWebsite = (website: string | null) => {
  if (!website) return null;
  try {
    const host = new URL(website).hostname.replace(/^www\./i, "");
    const primary = host.split(".")[0] || "";
    if (!primary) return null;
    return primary
      .split(/[-_]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  } catch {
    return null;
  }
};

const findOrCreateCompany = async (result: NormalizedMarketResult, enrichment: CompanyEnrichment) => {
  const companyName =
    normalizeText(result.company) || normalizeText(enrichment.companyName) || inferCompanyNameFromWebsite(enrichment.website);
  const country = normalizeText(result.country) || normalizeText(enrichment.country) || "Unknown";
  if (!companyName) return null;

  const companyNameNormalized = normalizeCompanyForMatch(companyName);
  const websiteDomain = normalizeDomain(enrichment.website);
  const sourceDomain = normalizeDomain(result.source_url);
  const firstToken = companyNameNormalized.split(" ")[0] || "";
  const candidateOr: Prisma.CompanyWhereInput[] = [
    ...(websiteDomain ? [{ website: { contains: websiteDomain, mode: "insensitive" as const } }] : []),
    ...(firstToken ? [{ name: { contains: firstToken, mode: "insensitive" as const } }] : []),
    ...(sourceDomain ? [{ website: { contains: sourceDomain, mode: "insensitive" as const } }] : [])
  ];

  const directMatch = await prisma.company.findFirst({
    where: {
      OR: [
        {
          name: { equals: companyName, mode: "insensitive" as const },
          ...(country ? { country: { equals: country, mode: "insensitive" as const } } : {})
        },
        ...(enrichment.website
          ? [
              {
                website: { equals: enrichment.website, mode: "insensitive" as const }
              }
            ]
          : [])
      ]
    },
    select: {
      id: true,
      name: true,
      country: true,
      website: true,
      description: true,
      source: true
    }
  });

  const fuzzyCandidates =
    candidateOr.length > 0
      ? await prisma.company.findMany({
          where: {
            OR: candidateOr
          },
          select: {
            id: true,
            name: true,
            country: true,
            website: true,
            description: true,
            source: true
          },
          take: 25
        })
      : [];

  let existing = directMatch || null;
  if (!existing) {
    let bestScore = 0;
    for (const candidate of fuzzyCandidates) {
      const score = companySimilarity(companyName, candidate.name);
      const countryBoost =
        country && candidate.country && country.toLowerCase() === candidate.country.toLowerCase() ? 0.1 : 0;
      const finalScore = score + countryBoost;
      if (finalScore > bestScore) {
        bestScore = finalScore;
        existing = candidate;
      }
    }
    if (bestScore < 0.72) existing = null;
  }

  if (existing) {
    const updateData: {
      website?: string;
      description?: string;
      source?: string;
      country?: string;
    } = {};
    if (!existing.website && enrichment.website) updateData.website = enrichment.website;
    if (!existing.description && enrichment.description) updateData.description = enrichment.description;
    if (!existing.source) updateData.source = result.source_name;
    if ((!existing.country || existing.country === "Unknown") && country && country !== "Unknown") {
      updateData.country = country;
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.company.update({
        where: { id: existing.id },
        data: updateData
      });
    }
    return existing.id;
  }

  const created = await prisma.company.create({
    data: {
      name: companyName,
      companyType: mapRoleToCompanyType(result.ai_classification),
      country,
      city: "Unknown",
      website: enrichment.website,
      description: enrichment.description || truncate(result.description, 800),
      source: result.source_name,
      status: CompanyStatus.TO_VERIFY
    },
    select: { id: true }
  });

  return created.id;
};

const findOrCreateContact = async (
  companyId: string,
  result: NormalizedMarketResult,
  enrichment: CompanyEnrichment
) => {
  const fullName = normalizeText(result.contact_name) || normalizeText(enrichment.contactName);
  const email = normalizeText(enrichment.email);
  const phone = normalizeText(enrichment.phone);
  const telegram = normalizeText(enrichment.telegram);
  const whatsapp = normalizeText(enrichment.whatsapp);
  const hasIdentity = Boolean(fullName || email || phone || telegram || whatsapp);
  if (!hasIdentity) return null;

  const identityClauses: Prisma.ContactWhereInput[] = [];
  if (fullName) {
    identityClauses.push({ fullName: { equals: fullName, mode: "insensitive" as const } });
  }
  if (email) {
    identityClauses.push({ email: { equals: email, mode: "insensitive" as const } });
  }
  if (phone) {
    identityClauses.push({ phone: { equals: phone, mode: "insensitive" as const } });
  }
  if (telegram) {
    identityClauses.push({ telegram: { equals: telegram, mode: "insensitive" as const } });
  }
  if (whatsapp) {
    identityClauses.push({ whatsapp: { equals: whatsapp, mode: "insensitive" as const } });
  }

  const noteParts = [`Imported from ${result.source_name}`];
  if (enrichment.contactPageUrl) noteParts.push(`Contact page: ${enrichment.contactPageUrl}`);
  const importNote = noteParts.join(" | ");

  const existing = await prisma.contact.findFirst({
    where: {
      companyId,
      OR: identityClauses.length > 0 ? identityClauses : undefined
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      telegram: true,
      whatsapp: true,
      notes: true
    }
  });

  if (existing) {
    const updateData: {
      fullName?: string;
      email?: string;
      phone?: string;
      telegram?: string;
      whatsapp?: string;
      notes?: string;
    } = {};
    if (!existing.fullName && fullName) updateData.fullName = fullName;
    if (!existing.email && email) updateData.email = email;
    if (!existing.phone && phone) updateData.phone = phone;
    if (!existing.telegram && telegram) updateData.telegram = telegram;
    if (!existing.whatsapp && whatsapp) updateData.whatsapp = whatsapp;
    if (!existing.notes) updateData.notes = importNote;

    if (Object.keys(updateData).length > 0) {
      await prisma.contact.update({
        where: { id: existing.id },
        data: updateData
      });
    }
    return existing.id;
  }

  const created = await prisma.contact.create({
    data: {
      companyId,
      fullName: fullName || "Trading Contact",
      email: email || null,
      phone: phone || null,
      telegram: telegram || null,
      whatsapp: whatsapp || null,
      position: "Trading Contact",
      notes: importNote
    },
    select: { id: true }
  });

  return created.id;
};

const applyEnrichmentToCompany = async (
  companyId: string,
  result: NormalizedMarketResult,
  enrichment: CompanyEnrichment
) => {
  const existing = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      website: true,
      description: true,
      source: true,
      country: true
    }
  });

  if (!existing) return;

  const country = normalizeText(result.country) || normalizeText(enrichment.country) || "";
  const updateData: {
    website?: string;
    description?: string;
    source?: string;
    country?: string;
  } = {};

  if (!existing.website && enrichment.website) updateData.website = enrichment.website;
  if (!existing.description && enrichment.description) updateData.description = enrichment.description;
  if (!existing.source) updateData.source = result.source_name;
  if ((!existing.country || existing.country === "Unknown") && country && country !== "Unknown") {
    updateData.country = country;
  }

  if (Object.keys(updateData).length > 0) {
    await prisma.company.update({
      where: { id: existing.id },
      data: updateData
    });
  }
};

const normalizedFromRawPayload = (value: Prisma.JsonValue | null): NormalizedMarketResult | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const payload = value as Record<string, unknown>;
  const sourceUrl = normalizeText(typeof payload.source_url === "string" ? payload.source_url : "");
  if (!sourceUrl) return null;

  const sourceName = normalizeText(typeof payload.source_name === "string" ? payload.source_name : "");
  return {
    id: normalizeText(typeof payload.id === "string" ? payload.id : sourceUrl) || sourceUrl,
    product: typeof payload.product === "string" ? payload.product : null,
    company: typeof payload.company === "string" ? payload.company : null,
    contact_name: typeof payload.contact_name === "string" ? payload.contact_name : null,
    country: typeof payload.country === "string" ? payload.country : null,
    quantity: typeof payload.quantity === "string" ? payload.quantity : null,
    incoterms: typeof payload.incoterms === "string" ? payload.incoterms : null,
    payment_terms: typeof payload.payment_terms === "string" ? payload.payment_terms : null,
    description: typeof payload.description === "string" ? payload.description : "",
    source_name: sourceName || "Unknown Source",
    source_url: sourceUrl,
    raw_text: typeof payload.raw_text === "string" ? payload.raw_text : "",
    result_type: typeof payload.result_type === "string" ? payload.result_type : "market_listing",
    confidence_score:
      typeof payload.confidence_score === "number" && Number.isFinite(payload.confidence_score) ? payload.confidence_score : 0.5,
    shipping_terms: typeof payload.shipping_terms === "string" ? payload.shipping_terms : null,
    destination: typeof payload.destination === "string" ? payload.destination : null,
    posted_date: typeof payload.posted_date === "string" ? payload.posted_date : null,
    source_kind:
      typeof payload.source_kind === "string" && ["live", "mock", "test", "fallback"].includes(payload.source_kind)
        ? (payload.source_kind as NormalizedMarketResult["source_kind"])
        : undefined,
    import_mode:
      typeof payload.import_mode === "string" && ["fetch", "browser", "manual", "generated"].includes(payload.import_mode)
        ? (payload.import_mode as NormalizedMarketResult["import_mode"])
        : undefined,
    ai_classification:
      typeof payload.ai_classification === "string" &&
      ["buyer", "supplier", "trader", "importer", "exporter"].includes(payload.ai_classification)
        ? (payload.ai_classification as NormalizedMarketResult["ai_classification"])
        : undefined,
    ai_summary: typeof payload.ai_summary === "string" ? payload.ai_summary : null,
    relevance_score: typeof payload.relevance_score === "number" ? payload.relevance_score : undefined,
    next_action: typeof payload.next_action === "string" ? payload.next_action : null,
    acquisition_origin:
      typeof payload.acquisition_origin === "string" &&
      ["directory_page", "company_website", "browser_fallback", "unknown"].includes(payload.acquisition_origin)
        ? (payload.acquisition_origin as NormalizedMarketResult["acquisition_origin"])
        : undefined,
    contact_completeness_score:
      typeof payload.contact_completeness_score === "number" && Number.isFinite(payload.contact_completeness_score)
        ? Math.max(0, Math.min(payload.contact_completeness_score, 1))
        : undefined
  };
};

export const enrichLeadContactsById = async (leadId: string) => {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      product: true,
      company: true,
      rawMarketLeads: {
        orderBy: { createdAt: "desc" },
        take: 1
      }
    }
  });

  if (!lead) throw new Error("Lead not found");

  const rawNormalized = normalizedFromRawPayload((lead.rawMarketLeads[0]?.normalized as Prisma.JsonValue) || null);
  const result: NormalizedMarketResult =
    rawNormalized ||
    withOriginMeta(
      {
        id: lead.id,
        product: lead.product?.name || null,
        company: lead.company?.name || null,
        contact_name: null,
        country: lead.originCountry || lead.destinationCountry || lead.company?.country || null,
        quantity: lead.volume ? `${lead.volume.toString()}${lead.unit ? ` ${lead.unit}` : ""}` : null,
        incoterms: lead.incoterms,
        payment_terms: null,
        description: lead.title,
        source_name: lead.sourceName || "Lead Source",
        source_url: normalizeText(lead.sourceUrl || "") || `https://lead.local/${lead.id}`,
        raw_text: lead.rawText || lead.title,
        result_type: lead.leadType === "BUY" ? "buyer_rfq" : lead.leadType === "SELL" ? "supplier_offer" : "market_listing",
        confidence_score: 0.5,
        shipping_terms: lead.incoterms,
        destination: lead.destinationCountry,
        posted_date: lead.publishedAt?.toISOString() || null
      },
      "generated"
    );

  const enrichment = await enrichCompanyFromMarketResult(result);

  let companyId = lead.companyId || null;
  if (companyId) {
    await applyEnrichmentToCompany(companyId, result, enrichment);
  } else {
    companyId = await findOrCreateCompany(result, enrichment);
    if (companyId) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: { companyId }
      });
    }
  }

  const contactId = companyId ? await findOrCreateContact(companyId, result, enrichment) : null;

  const enrichmentLines = [
    enrichment.website ? `Website: ${enrichment.website}` : "",
    enrichment.email ? `Email: ${enrichment.email}` : "",
    enrichment.phone ? `Phone: ${enrichment.phone}` : "",
    enrichment.telegram ? `Telegram: ${enrichment.telegram}` : "",
    enrichment.whatsapp ? `WhatsApp: ${enrichment.whatsapp}` : "",
    enrichment.contactName ? `Contact: ${enrichment.contactName}` : "",
    enrichment.contactPageUrl ? `Contact Page: ${enrichment.contactPageUrl}` : ""
  ]
    .filter(Boolean)
    .join("\n");

  if (enrichmentLines) {
    const existingText = lead.rawText || "";
    const hasAllLines = enrichmentLines
      .split("\n")
      .every((line) => line.trim().length === 0 || existingText.includes(line));
    const nextRawText = `${existingText}\n${enrichmentLines}`.trim();
    if (!hasAllLines && nextRawText) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          rawText: truncate(nextRawText, 19000)
        }
      });
    }
  }

  return {
    leadId: lead.id,
    companyId,
    contactId,
    enrichment: {
      website: enrichment.website,
      email: enrichment.email,
      phone: enrichment.phone,
      telegram: enrichment.telegram,
      whatsapp: enrichment.whatsapp,
      contactName: enrichment.contactName,
      contactPageUrl: enrichment.contactPageUrl
    }
  };
};

const safeSourceUrl = (value: string | undefined, rawText: string) => {
  const normalized = normalizeText(value || "");
  if (normalized) {
    try {
      return new URL(normalized).toString();
    } catch {
      throw new Error("Source URL is invalid.");
    }
  }

  const hash = createHash("sha1").update(rawText).digest("hex").slice(0, 18);
  return `https://manual-import.local/entry/${hash}`;
};

const deriveSourceName = (inputName: string | undefined, sourceUrl: string) => {
  const normalized = normalizeText(inputName || "");
  if (normalized) return normalized;

  try {
    const hostname = new URL(sourceUrl).hostname.replace(/^www\./i, "");
    return hostname || "Manual Source";
  } catch {
    return "Manual Source";
  }
};

const loadRawTextForManualImport = async (sourceUrl: string | undefined, pageText: string | undefined) => {
  const pastedText = normalizeSharedText(pageText || "");
  if (pastedText) return pastedText;

  const normalizedUrl = normalizeText(sourceUrl || "");
  if (!normalizedUrl) {
    throw new Error("Provide page text or source URL for manual import.");
  }

  try {
    const { html } = await fetchPublicHtml(normalizedUrl);
    const extracted = extractVisibleTextFromHtml(html);

    if (!extracted) throw new Error("Source page did not return readable text.");
    return extracted;
  } catch (error) {
    throw new Error(
      `Failed to fetch URL for manual import (${error instanceof Error ? error.message : "unknown error"}). Paste page text instead.`
    );
  }
};

const quantityFromParsedDraft = (volume: number | null, unit: string | null) => {
  if (!volume) return null;
  return `${volume}${unit ? ` ${unit}` : ""}`;
};

const resultTypeFromLeadType = (leadType: LeadType) => {
  if (leadType === "BUY") return "buyer_rfq";
  if (leadType === "SELL") return "supplier_offer";
  return "trade_listing";
};

export const importMarketIntelligenceLead = async (
  input: MarketIntelligenceImportInput
): Promise<MarketIntelligenceImportResponse> => {
  const sourceUrl = normalizeText(input.result.source_url);
  if (!sourceUrl) throw new Error("Source URL is required for import.");
  const saveCompany = input.save_company ?? true;

  const matchedLead = await findMatchingLeadBySignals({
    source_url: sourceUrl,
    source_name: input.result.source_name,
    company: input.result.company,
    product: input.result.product,
    description: input.result.description,
    raw_text: input.result.raw_text,
    country: input.result.country,
    contact_name: input.result.contact_name
  });

  const duplicate = matchedLead
    ? await prisma.lead.findUnique({
        where: { id: matchedLead.leadId },
        select: { id: true, companyId: true }
      })
    : null;

  if (duplicate) {
    await updateExistingLeadFromResult(duplicate.id, {
      source_url: sourceUrl,
      source_name: input.result.source_name,
      description: input.result.description,
      raw_text: input.result.raw_text,
      country: input.result.country,
      destination: input.result.destination,
      payment_terms: input.result.payment_terms,
      incoterms: input.result.incoterms,
      ai_summary: input.result.ai_summary,
      contact_name: input.result.contact_name
    });

    if (saveCompany) {
      try {
        const enrichment = await enrichCompanyFromMarketResult(input.result);
        let resolvedCompanyId = duplicate.companyId || null;
        if (!resolvedCompanyId) {
          resolvedCompanyId = await findOrCreateCompany(input.result, enrichment);
          if (resolvedCompanyId) {
            await prisma.lead.update({
              where: { id: duplicate.id },
              data: { companyId: resolvedCompanyId }
            });
          }
        }
        if (resolvedCompanyId) {
          await findOrCreateContact(resolvedCompanyId, input.result, enrichment);
        }
      } catch {
        // Non-blocking enrichment update on duplicate import.
      }
    }

    return {
      status: "duplicate",
      leadId: duplicate.id,
      message: "Already imported"
    };
  }

  const productId = await resolveProductId(input);
  const leadType = mapRoleToLeadType(input.result.ai_classification, input.result.result_type);
  const { volume, unit } = parseVolumeAndUnit(input.result.quantity);
  const enrichment = await enrichCompanyFromMarketResult(input.result);

  let companyId: string | undefined;
  let contactId: string | undefined;

  if (saveCompany) {
    const linkedCompanyId = await findOrCreateCompany(input.result, enrichment);
    if (linkedCompanyId) {
      companyId = linkedCompanyId;
      const linkedContactId = await findOrCreateContact(linkedCompanyId, input.result, enrichment);
      if (linkedContactId) contactId = linkedContactId;
    }
  }

  const aiSummary = input.result.ai_summary
    ? input.result.ai_summary
    : input.with_ai
      ? await summarizeLead({
          title: input.result.company || input.result.description,
          rawText: input.result.raw_text,
          product: input.result.product || input.parsed_query?.product || undefined,
          leadType,
          volume,
          unit,
          incoterms: input.result.incoterms,
          originCountry: input.result.country,
          destinationCountry: input.result.destination
        })
      : null;

  const title = truncate(
    input.result.company
      ? `${input.result.company} • ${input.result.product || input.parsed_query?.product || "Commodity"}`
      : input.result.description,
    180
  );

  const rawText = truncate(
    [
      `Source: ${input.result.source_name}`,
      `Result Type: ${input.result.result_type}`,
      input.result.company ? `Company: ${input.result.company}` : "",
      input.result.contact_name ? `Contact: ${input.result.contact_name}` : "",
      enrichment.contactName ? `Enriched Contact: ${enrichment.contactName}` : "",
      input.result.country ? `Country: ${input.result.country}` : "",
      enrichment.website ? `Website: ${enrichment.website}` : "",
      enrichment.email ? `Email: ${enrichment.email}` : "",
      enrichment.phone ? `Phone: ${enrichment.phone}` : "",
      enrichment.telegram ? `Telegram: ${enrichment.telegram}` : "",
      enrichment.whatsapp ? `WhatsApp: ${enrichment.whatsapp}` : "",
      enrichment.contactPageUrl ? `Contact Page: ${enrichment.contactPageUrl}` : "",
      input.result.quantity ? `Quantity: ${input.result.quantity}` : "",
      input.result.payment_terms ? `Payment Terms: ${input.result.payment_terms}` : "",
      input.result.shipping_terms ? `Shipping Terms: ${input.result.shipping_terms}` : "",
      input.result.destination ? `Destination: ${input.result.destination}` : "",
      input.result.posted_date ? `Posted Date: ${input.result.posted_date}` : "",
      `Source URL: ${sourceUrl}`,
      `Description: ${input.result.description}`,
      `Raw: ${input.result.raw_text}`
    ]
      .filter(Boolean)
      .join("\n"),
    19000
  );

  const lead = await prisma.lead.create({
    data: {
      title,
      productId,
      companyId,
      leadType,
      volume,
      unit,
      price: null,
      currency: null,
      incoterms: input.result.incoterms,
      originCountry: input.result.country,
      destinationCountry: input.result.destination,
      sourceName: input.result.source_name,
      sourceUrl,
      rawText,
      aiSummary,
      priority: pickPriority(input.result.relevance_score),
      status: LeadStatus.NEW,
      publishedAt: parsePublishedAt(input.result.posted_date)
    },
    select: { id: true }
  });

  return {
    status: "imported",
    leadId: lead.id,
    companyId,
    contactId,
    message: "Import successful"
  };
};

export const manualImportMarketLead = async (
  input: MarketIntelligenceManualImportInput
): Promise<MarketIntelligenceManualImportResponse> => {
  const rawText = await loadRawTextForManualImport(input.source_url, input.page_text);
  const draft = await parseLeadText(rawText);

  const sourceUrl = safeSourceUrl(input.source_url, rawText);
  const sourceName = deriveSourceName(input.source_name, sourceUrl);
  const role = mapLeadTypeToRole(draft.leadType);

  const summary = input.with_ai
    ? await summarizeLead({
        title: draft.title,
        rawText,
        product: draft.productName,
        leadType: draft.leadType,
        volume: draft.volume,
        unit: draft.unit,
        price: draft.price,
        currency: draft.currency,
        incoterms: draft.incoterms,
        originCountry: draft.originCountry,
        destinationCountry: draft.destinationCountry
      })
    : null;

  const result: NormalizedMarketResult = withOriginMeta(
    {
      id: createHash("sha1").update(`${sourceName}|${sourceUrl}`).digest("hex").slice(0, 16),
      product: draft.productName || null,
      company: null,
      contact_name: null,
      country: draft.originCountry || draft.destinationCountry || null,
      quantity: quantityFromParsedDraft(draft.volume, draft.unit),
      incoterms: draft.incoterms,
      payment_terms: null,
      description: truncate(summary || rawText, 1000),
      source_name: sourceName,
      source_url: sourceUrl,
      raw_text: truncate(rawText, 18000),
      result_type: resultTypeFromLeadType(draft.leadType),
      confidence_score: Number(Math.max(0.05, Math.min(draft.confidence || 0.5, 0.99)).toFixed(2)),
      shipping_terms: draft.incoterms,
      destination: draft.destinationCountry,
      posted_date: null,
      ai_classification: role,
      ai_summary: summary,
      relevance_score: Number(Math.max(0.1, Math.min(draft.confidence || 0.5, 0.99)).toFixed(2)),
      next_action: null
    },
    "manual"
  );

  const imported = await importMarketIntelligenceLead({
    result,
    parsed_query: input.parsed_query,
    save_company: input.save_company,
    with_ai: input.with_ai
  });

  return {
    extracted: {
      title: draft.title,
      product: draft.productName || null,
      lead_type: draft.leadType,
      volume: draft.volume,
      unit: draft.unit,
      price: draft.price,
      currency: draft.currency,
      incoterms: draft.incoterms,
      origin_country: draft.originCountry,
      destination_country: draft.destinationCountry,
      confidence: draft.confidence
    },
    imported
  };
};
