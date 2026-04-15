import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { NormalizedMarketResult } from "./types";

type LeadCandidate = Prisma.LeadGetPayload<{
  include: {
    company: {
      include: {
        contacts: true;
      };
    };
    product: true;
  };
}>;

type RawCandidate = Prisma.RawMarketLeadGetPayload<{
  select: {
    id: true;
    sourceName: true;
    sourceUrl: true;
    sourceUrlHash: true;
    normalized: true;
    leadId: true;
    status: true;
    createdAt: true;
  };
}>;

type Signals = {
  sourceUrl: string;
  sourceHost: string;
  company: string;
  product: string;
  email: string;
  phoneDigits: string;
  website: string;
  websiteHost: string;
  country: string;
  contactName: string;
};

type ParsedRaw = {
  sourceUrl: string;
  company: string;
  product: string;
  description: string;
  rawText: string;
  country: string;
  contactName: string;
};

const MARKETPLACE_HOST_HINTS = [
  "go4worldbusiness.com",
  "tradewheel.com",
  "tradekey.com",
  "alibaba.com",
  "kompass.com",
  "ec21.com",
  "exporthub.com",
  "eworldtrade.com",
  "petrochemz.com",
  "globy.com",
  "toocle.com",
  "chemnet.com",
  "plastic4trade.com"
];

const normalizeText = (value: string | null | undefined) => (value || "").replace(/\s+/g, " ").trim();

const normalizeUrl = (value: string | null | undefined) => {
  const input = normalizeText(value);
  if (!input) return "";
  try {
    return new URL(input).toString();
  } catch {
    return input;
  }
};

const normalizeHost = (value: string | null | undefined) => {
  const input = normalizeText(value);
  if (!input) return "";
  try {
    return new URL(input).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return input
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .split("/")[0]
      .toLowerCase();
  }
};

const isMarketplaceHost = (host: string) => MARKETPLACE_HOST_HINTS.some((hint) => host.includes(hint));

const normalizeCompany = (value: string | null | undefined) =>
  normalizeText(value)
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(
      /\b(llc|ltd|limited|inc|corp|co|company|gmbh|sarl|sa|jsc|llp|pte|fze|dmcc|l\.l\.c|s\.a\.)\b/g,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();

const normalizePhoneDigits = (value: string | null | undefined) => {
  const digits = normalizeText(value).replace(/\D/g, "");
  if (digits.length < 7) return "";
  return digits.slice(-12);
};

const normalizeEmail = (value: string | null | undefined) => normalizeText(value).toLowerCase();

const tokenize = (value: string) => value.split(" ").map((item) => item.trim()).filter(Boolean);

const tokenSimilarity = (a: string, b: string) => {
  const left = new Set(tokenize(a));
  const right = new Set(tokenize(b));
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  left.forEach((token) => {
    if (right.has(token)) intersection += 1;
  });
  const union = new Set([...left, ...right]).size;
  return union > 0 ? intersection / union : 0;
};

const extractFirstEmail = (text: string) => normalizeEmail((text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [])[0]);

const extractFirstPhone = (text: string) =>
  normalizePhoneDigits((text.match(/\+?\d[\d\s\-()]{6,}\d/g) || []).find((candidate) => normalizePhoneDigits(candidate).length >= 7));

const extractWebsite = (text: string, fallbackUrl = "") => {
  const match = (text.match(/(?:https?:\/\/|www\.)[^\s<>"')]+/gi) || [])
    .map((item) => item.trim().replace(/[,.;:]+$/, ""))
    .map((item) => (item.startsWith("http") ? item : `https://${item}`))
    .find((item) => {
      const host = normalizeHost(item);
      return Boolean(host) && !isMarketplaceHost(host);
    });

  if (match) return normalizeUrl(match);
  return normalizeUrl(fallbackUrl);
};

const parseRawPayload = (value: Prisma.JsonValue | null): ParsedRaw => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      sourceUrl: "",
      company: "",
      product: "",
      description: "",
      rawText: "",
      country: "",
      contactName: ""
    };
  }

  const payload = value as Record<string, unknown>;
  return {
    sourceUrl: normalizeUrl(typeof payload.source_url === "string" ? payload.source_url : ""),
    company: normalizeText(typeof payload.company === "string" ? payload.company : ""),
    product: normalizeText(typeof payload.product === "string" ? payload.product : ""),
    description: normalizeText(typeof payload.description === "string" ? payload.description : ""),
    rawText: normalizeText(typeof payload.raw_text === "string" ? payload.raw_text : ""),
    country: normalizeText(typeof payload.country === "string" ? payload.country : ""),
    contactName: normalizeText(typeof payload.contact_name === "string" ? payload.contact_name : "")
  };
};

const buildSignals = (result: Pick<
  NormalizedMarketResult,
  "source_url" | "company" | "product" | "description" | "raw_text" | "country" | "contact_name"
>): Signals => {
  const sourceUrl = normalizeUrl(result.source_url);
  const textBlob = normalizeText([result.description, result.raw_text, result.company, result.contact_name].filter(Boolean).join(" "));
  const email = extractFirstEmail(textBlob);
  const phoneDigits = extractFirstPhone(textBlob);
  const website = extractWebsite(textBlob);

  return {
    sourceUrl,
    sourceHost: normalizeHost(sourceUrl),
    company: normalizeCompany(result.company),
    product: normalizeText(result.product).toLowerCase(),
    email,
    phoneDigits,
    website,
    websiteHost: normalizeHost(website),
    country: normalizeText(result.country).toLowerCase(),
    contactName: normalizeText(result.contact_name).toLowerCase()
  };
};

const scoreLeadCandidate = (signals: Signals, lead: LeadCandidate) => {
  let score = 0;

  const leadSourceUrl = normalizeUrl(lead.sourceUrl);
  if (signals.sourceUrl && leadSourceUrl && signals.sourceUrl.toLowerCase() === leadSourceUrl.toLowerCase()) score += 3;

  const companyName = normalizeCompany(lead.company?.name);
  const productName = normalizeText(lead.product?.name).toLowerCase();
  const companySimilarity = tokenSimilarity(signals.company, companyName);
  const productSimilarity = tokenSimilarity(signals.product, productName);

  if (signals.company && companySimilarity >= 0.92) score += 1.2;
  else if (signals.company && companySimilarity >= 0.78) score += 0.8;
  else if (signals.company && companySimilarity >= 0.64) score += 0.45;

  if (signals.product && productSimilarity >= 0.84) score += 0.6;
  else if (signals.product && productSimilarity >= 0.62) score += 0.35;

  const companyWebsiteHost = normalizeHost(lead.company?.website);
  if (signals.websiteHost && companyWebsiteHost && signals.websiteHost === companyWebsiteHost) score += 1.15;

  const contacts = lead.company?.contacts || [];
  if (signals.email) {
    const hasEmail = contacts.some((item) => normalizeEmail(item.email) === signals.email);
    if (hasEmail) score += 1.45;
  }

  if (signals.phoneDigits) {
    const hasPhone = contacts.some((item) => {
      const phoneDigits = normalizePhoneDigits(item.phone) || normalizePhoneDigits(item.whatsapp);
      return Boolean(phoneDigits) && phoneDigits.endsWith(signals.phoneDigits.slice(-8));
    });
    if (hasPhone) score += 1.1;
  }

  if (signals.country && lead.destinationCountry && lead.destinationCountry.toLowerCase().includes(signals.country)) score += 0.15;

  return score;
};

const scoreRawCandidate = (signals: Signals, raw: RawCandidate) => {
  const parsed = parseRawPayload(raw.normalized);
  const rawSignals = buildSignals({
    source_url: parsed.sourceUrl || raw.sourceUrl,
    company: parsed.company || null,
    product: parsed.product || null,
    description: parsed.description,
    raw_text: parsed.rawText,
    country: parsed.country || null,
    contact_name: parsed.contactName || null
  });

  let score = 0;
  if (signals.sourceUrl && rawSignals.sourceUrl && signals.sourceUrl.toLowerCase() === rawSignals.sourceUrl.toLowerCase()) score += 3;

  const companySimilarity = tokenSimilarity(signals.company, rawSignals.company);
  const productSimilarity = tokenSimilarity(signals.product, rawSignals.product);

  if (signals.email && rawSignals.email && signals.email === rawSignals.email) score += 1.35;
  if (signals.phoneDigits && rawSignals.phoneDigits && rawSignals.phoneDigits.endsWith(signals.phoneDigits.slice(-8))) score += 1.05;
  if (signals.websiteHost && rawSignals.websiteHost && signals.websiteHost === rawSignals.websiteHost) score += 0.95;

  if (signals.company && companySimilarity >= 0.92) score += 1;
  else if (signals.company && companySimilarity >= 0.78) score += 0.68;
  else if (signals.company && companySimilarity >= 0.64) score += 0.38;

  if (signals.product && productSimilarity >= 0.82) score += 0.5;
  else if (signals.product && productSimilarity >= 0.6) score += 0.28;

  return score;
};

export const findMatchingLeadBySignals = async (
  result: Pick<
    NormalizedMarketResult,
    "source_url" | "source_name" | "company" | "product" | "description" | "raw_text" | "country" | "contact_name"
  >
): Promise<{ leadId: string; score: number } | null> => {
  const signals = buildSignals(result);
  if (!signals.sourceUrl && !signals.company && !signals.email && !signals.phoneDigits && !signals.websiteHost) return null;

  const direct = signals.sourceUrl
    ? await prisma.lead.findFirst({
        where: {
          sourceUrl: {
            equals: signals.sourceUrl,
            mode: "insensitive"
          }
        },
        select: { id: true }
      })
    : null;

  if (direct) {
    return {
      leadId: direct.id,
      score: 3
    };
  }

  const companyToken = tokenize(signals.company)[0] || "";
  const productToken = tokenize(signals.product)[0] || "";
  const whereOr: Prisma.LeadWhereInput[] = [];

  if (signals.email) {
    whereOr.push({
      company: {
        is: {
          contacts: {
            some: {
              email: { equals: signals.email, mode: "insensitive" }
            }
          }
        }
      }
    });
  }

  if (signals.phoneDigits) {
    const tail = signals.phoneDigits.slice(-8);
    whereOr.push({
      company: {
        is: {
          contacts: {
            some: {
              OR: [
                { phone: { contains: tail, mode: "insensitive" } },
                { whatsapp: { contains: tail, mode: "insensitive" } }
              ]
            }
          }
        }
      }
    });
  }

  if (signals.websiteHost) {
    whereOr.push({
      company: {
        is: {
          website: {
            contains: signals.websiteHost,
            mode: "insensitive"
          }
        }
      }
    });
  }

  if (companyToken) {
    whereOr.push({
      company: {
        is: {
          name: {
            contains: companyToken,
            mode: "insensitive"
          }
        }
      }
    });
  }

  if (productToken) {
    whereOr.push({
      product: {
        is: {
          name: {
            contains: productToken,
            mode: "insensitive"
          }
        }
      }
    });
  }

  if (whereOr.length === 0) return null;

  const candidates = await prisma.lead.findMany({
    where: {
      OR: whereOr
    },
    include: {
      company: {
        include: {
          contacts: {
            take: 12
          }
        }
      },
      product: true
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: 80
  });

  let best: { leadId: string; score: number } | null = null;
  for (const candidate of candidates) {
    const score = scoreLeadCandidate(signals, candidate);
    if (!best || score > best.score) {
      best = {
        leadId: candidate.id,
        score
      };
    }
  }

  if (!best || best.score < 1.05) return null;
  return best;
};

export const findMatchingRawLeadBySignals = async (
  result: Pick<
    NormalizedMarketResult,
    "source_url" | "source_name" | "company" | "product" | "description" | "raw_text" | "country" | "contact_name"
  >
): Promise<{ rawLeadId: string; score: number } | null> => {
  const signals = buildSignals(result);
  if (!signals.sourceUrl && !signals.company && !signals.email && !signals.phoneDigits && !signals.websiteHost) return null;

  const direct = signals.sourceUrl
    ? await prisma.rawMarketLead.findFirst({
        where: {
          sourceUrl: {
            equals: signals.sourceUrl,
            mode: "insensitive"
          }
        },
        select: { id: true }
      })
    : null;

  if (direct) {
    return {
      rawLeadId: direct.id,
      score: 3
    };
  }

  const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
  const candidates = await prisma.rawMarketLead.findMany({
    where: {
      OR: [
        {
          sourceName: {
            equals: normalizeText(result.source_name),
            mode: "insensitive"
          }
        },
        {
          createdAt: {
            gte: sixMonthsAgo
          }
        }
      ]
    },
    select: {
      id: true,
      sourceName: true,
      sourceUrl: true,
      sourceUrlHash: true,
      normalized: true,
      leadId: true,
      status: true,
      createdAt: true
    },
    orderBy: { createdAt: "desc" },
    take: 320
  });

  let best: { rawLeadId: string; score: number } | null = null;
  for (const candidate of candidates) {
    const score = scoreRawCandidate(signals, candidate);
    if (!best || score > best.score) {
      best = {
        rawLeadId: candidate.id,
        score
      };
    }
  }

  if (!best || best.score < 1) return null;
  return best;
};

const appendTextIfMissing = (base: string, line: string) => {
  const normalizedBase = normalizeText(base);
  const normalizedLine = normalizeText(line);
  if (!normalizedLine) return normalizedBase;
  if (normalizedBase.toLowerCase().includes(normalizedLine.toLowerCase())) return normalizedBase;
  return [normalizedBase, normalizedLine].filter(Boolean).join("\n");
};

export const updateExistingLeadFromResult = async (
  leadId: string,
  result: Pick<
    NormalizedMarketResult,
    | "source_url"
    | "source_name"
    | "description"
    | "raw_text"
    | "country"
    | "destination"
    | "payment_terms"
    | "incoterms"
    | "ai_summary"
    | "contact_name"
  >
) => {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      company: {
        include: {
          contacts: {
            orderBy: { updatedAt: "desc" },
            take: 8
          }
        }
      }
    }
  });
  if (!lead) return;

  const signals = buildSignals({
    source_url: result.source_url,
    company: lead.company?.name || null,
    product: null,
    description: result.description,
    raw_text: result.raw_text,
    country: result.country,
    contact_name: result.contact_name
  });

  const leadUpdate: Prisma.LeadUpdateInput = {};
  if (!lead.sourceUrl && signals.sourceUrl) leadUpdate.sourceUrl = signals.sourceUrl;
  if ((!lead.sourceName || lead.sourceName.trim().length === 0) && normalizeText(result.source_name)) {
    leadUpdate.sourceName = normalizeText(result.source_name);
  }
  if (!lead.aiSummary && normalizeText(result.ai_summary || "")) leadUpdate.aiSummary = normalizeText(result.ai_summary || "");
  if (!lead.originCountry && normalizeText(result.country)) leadUpdate.originCountry = normalizeText(result.country);
  if (!lead.destinationCountry && normalizeText(result.destination)) leadUpdate.destinationCountry = normalizeText(result.destination);
  if (!lead.incoterms && normalizeText(result.incoterms)) leadUpdate.incoterms = normalizeText(result.incoterms);
  if (!lead.currency && normalizeText(result.payment_terms)) {
    const currencyMatch = normalizeText(result.payment_terms).match(/\b(usd|eur|cny|aed|rub|kzt|inr)\b/i);
    if (currencyMatch?.[1]) leadUpdate.currency = currencyMatch[1].toUpperCase();
  }

  const mergedRaw = appendTextIfMissing(lead.rawText || "", normalizeText(result.raw_text || result.description || ""));
  if (mergedRaw && mergedRaw !== (lead.rawText || "")) {
    leadUpdate.rawText = mergedRaw.length <= 19000 ? mergedRaw : `${mergedRaw.slice(0, 18950)}...`;
  }

  if (Object.keys(leadUpdate).length > 0) {
    await prisma.lead.update({
      where: { id: lead.id },
      data: leadUpdate
    });
  }

  if (!lead.companyId) return;

  if (!lead.company?.website && signals.website) {
    await prisma.company.update({
      where: { id: lead.companyId },
      data: {
        website: signals.website
      }
    });
  }

  if (!signals.email && !signals.phoneDigits && !signals.contactName) return;

  const existingContacts = lead.company?.contacts || [];
  const matched = existingContacts.find((item) => {
    const emailMatch = signals.email && normalizeEmail(item.email) === signals.email;
    const phoneMatch =
      signals.phoneDigits &&
      (normalizePhoneDigits(item.phone).endsWith(signals.phoneDigits.slice(-8)) ||
        normalizePhoneDigits(item.whatsapp).endsWith(signals.phoneDigits.slice(-8)));
    const nameMatch =
      signals.contactName &&
      normalizeText(item.fullName).toLowerCase().includes(signals.contactName.toLowerCase()) &&
      signals.contactName.length >= 4;
    return Boolean(emailMatch || phoneMatch || nameMatch);
  });

  if (matched) {
    const updateData: Prisma.ContactUpdateInput = {};
    if (!matched.email && signals.email) updateData.email = signals.email;
    if (!matched.phone && signals.phoneDigits) updateData.phone = signals.phoneDigits;
    if (!matched.fullName && signals.contactName) updateData.fullName = signals.contactName;
    if (Object.keys(updateData).length > 0) {
      await prisma.contact.update({
        where: { id: matched.id },
        data: updateData
      });
    }
    return;
  }

  await prisma.contact.create({
    data: {
      companyId: lead.companyId,
      fullName: signals.contactName || "Trading Contact",
      email: signals.email || null,
      phone: signals.phoneDigits || null,
      position: "Trading Contact",
      notes: `Auto-enriched from ${normalizeText(result.source_name) || "source"}`
    }
  });
};

