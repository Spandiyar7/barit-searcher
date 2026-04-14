import { load } from "cheerio";
import { extractVisibleTextFromHtml, fetchPublicHtml, normalizeText, truncate } from "@/lib/services/market-intelligence/engines/shared";
import type { NormalizedMarketResult } from "@/lib/services/market-intelligence/types";

export type CompanyEnrichment = {
  companyName: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  telegram: string | null;
  whatsapp: string | null;
  contactName: string | null;
  contactPageUrl: string | null;
  country: string | null;
  specialization: string | null;
  description: string | null;
  fetchedFromSourcePage: boolean;
};

const MARKETPLACE_HOST_HINTS = [
  "go4worldbusiness.com",
  "tradewheel.com",
  "tradekey.com",
  "alibaba.com",
  "kompass.com",
  "eworldtrade.com",
  "ec21.com",
  "exporthub.com"
];

const parseUrls = (text: string) => {
  const matches = text.match(/(?:https?:\/\/|www\.)[^\s<>"')]+/gi) || [];
  return Array.from(
    new Set(
      matches
        .map((item) => item.trim())
        .map((item) => (item.startsWith("http") ? item : `https://${item}`))
        .map((item) => {
          try {
            return new URL(item).toString();
          } catch {
            return null;
          }
        })
        .filter((item): item is string => Boolean(item))
    )
  );
};

const parseEmail = (text: string) => {
  const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0].toLowerCase() : null;
};

const parsePhone = (text: string) => {
  const matches = text.match(/\+?\d[\d\s\-()]{6,}\d/g) || [];
  for (const value of matches) {
    const digits = value.replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 15) continue;
    return value.trim();
  }
  return null;
};

const normalizeHandle = (value: string) => value.replace(/^@+/, "").trim();

const parseTelegram = (text: string) => {
  const link = text.match(/(?:https?:\/\/)?(?:t\.me|telegram\.me)\/([A-Za-z0-9_]{4,})/i);
  if (link?.[1]) return `@${normalizeHandle(link[1])}`;

  const handle = text.match(/\b(?:telegram|tg)\s*[:\-]?\s*@?([A-Za-z0-9_]{4,})/i);
  if (handle?.[1]) return `@${normalizeHandle(handle[1])}`;

  return null;
};

const parseWhatsApp = (text: string) => {
  const waLink = text.match(/(?:https?:\/\/)?wa\.me\/(\d{7,15})/i);
  if (waLink?.[1]) return `+${waLink[1]}`;

  const appLink = text.match(/(?:https?:\/\/)?api\.whatsapp\.com\/send\?phone=(\d{7,15})/i);
  if (appLink?.[1]) return `+${appLink[1]}`;

  const direct = text.match(/\bwhats?app\s*[:\-]?\s*(\+?\d[\d\s\-()]{6,}\d)\b/i);
  if (direct?.[1]) return normalizeText(direct[1]);

  return null;
};

const parseContactName = (text: string) => {
  const normalized = normalizeText(text);
  const match = normalized.match(
    /\b(?:contact|attn|attention|person|mr\.|ms\.|mrs\.)\s*[:\-]?\s*([A-Z][A-Za-z'`.-]+(?:\s+[A-Z][A-Za-z'`.-]+){0,2})/
  );
  return match?.[1] ? normalizeText(match[1]) : null;
};

const pickCompanyWebsite = (urls: string[], sourceUrl: string) => {
  const sourceHost = (() => {
    try {
      return new URL(sourceUrl).hostname.replace(/^www\./i, "");
    } catch {
      return "";
    }
  })();

  for (const candidate of urls) {
    try {
      const host = new URL(candidate).hostname.replace(/^www\./i, "");
      if (!host) continue;
      if (host === sourceHost) continue;
      if (MARKETPLACE_HOST_HINTS.some((hint) => host.includes(hint))) continue;
      return candidate;
    } catch {
      // ignore
    }
  }
  return null;
};

const pickContactPageUrl = (html: string, sourceUrl: string) => {
  const $ = load(html);
  const sourceHost = (() => {
    try {
      return new URL(sourceUrl).hostname.replace(/^www\./i, "");
    } catch {
      return "";
    }
  })();

  const candidates: string[] = [];
  $("a[href]").each((_, element) => {
    const href = normalizeText($(element).attr("href"));
    if (!href) return;
    const label = normalizeText($(element).text()).toLowerCase();
    const loweredHref = href.toLowerCase();
    const contactHint = /contact|about|profile|company|team|staff|support/.test(`${label} ${loweredHref}`);
    if (!contactHint) return;

    try {
      const resolved = new URL(href, sourceUrl).toString();
      const host = new URL(resolved).hostname.replace(/^www\./i, "");
      if (sourceHost && host && host !== sourceHost && MARKETPLACE_HOST_HINTS.some((hint) => host.includes(hint))) {
        return;
      }
      candidates.push(resolved);
    } catch {
      // ignore invalid links
    }
  });

  return candidates[0] || null;
};

const mergeDescription = (result: NormalizedMarketResult) => {
  const segments = [
    result.description,
    result.product ? `Product: ${result.product}` : "",
    result.quantity ? `Quantity: ${result.quantity}` : "",
    result.payment_terms ? `Payment: ${result.payment_terms}` : "",
    result.destination ? `Destination: ${result.destination}` : ""
  ]
    .filter(Boolean)
    .join(". ");
  return truncate(normalizeText(segments), 900);
};

export const enrichCompanyFromMarketResult = async (
  result: NormalizedMarketResult
): Promise<CompanyEnrichment> => {
  const localText = normalizeText([result.raw_text, result.description].filter(Boolean).join("\n"));
  const localUrls = parseUrls(localText);

  let website = pickCompanyWebsite(localUrls, result.source_url);
  let email = parseEmail(localText);
  let phone = parsePhone(localText);
  let telegram = parseTelegram(localText);
  let whatsapp = parseWhatsApp(localText);
  let contactName = result.contact_name || parseContactName(localText);
  let contactPageUrl: string | null = null;
  let fetchedFromSourcePage = false;

  if (!website || !email || !phone || !contactName || !telegram || !whatsapp) {
    try {
      const { html } = await fetchPublicHtml(result.source_url);
      const pageText = extractVisibleTextFromHtml(html);
      const mergedText = normalizeText(`${localText}\n${pageText}`);
      const pageUrls = parseUrls(mergedText);

      if (!website) website = pickCompanyWebsite(pageUrls, result.source_url);
      if (!email) email = parseEmail(mergedText);
      if (!phone) phone = parsePhone(mergedText);
      if (!telegram) telegram = parseTelegram(mergedText);
      if (!whatsapp) whatsapp = parseWhatsApp(mergedText);
      if (!contactName) contactName = parseContactName(mergedText);
      contactPageUrl = pickContactPageUrl(html, result.source_url);
      if (!contactPageUrl) {
        contactPageUrl = pageUrls.find((item) => /contact|about|profile|company|team|staff|support/i.test(item)) || null;
      }
      fetchedFromSourcePage = true;

      if (contactPageUrl && (!email || !phone || !telegram || !whatsapp || !contactName)) {
        try {
          const { html: contactHtml } = await fetchPublicHtml(contactPageUrl);
          const contactText = normalizeText(extractVisibleTextFromHtml(contactHtml));
          if (!email) email = parseEmail(contactText);
          if (!phone) phone = parsePhone(contactText);
          if (!telegram) telegram = parseTelegram(contactText);
          if (!whatsapp) whatsapp = parseWhatsApp(contactText);
          if (!contactName) contactName = parseContactName(contactText);
        } catch {
          // keep non-blocking
        }
      }
    } catch {
      // keep enrichment best-effort and non-blocking
    }
  }

  return {
    companyName: result.company || null,
    website: website || null,
    email: email || null,
    phone: phone || null,
    telegram: telegram || null,
    whatsapp: whatsapp || null,
    contactName: contactName || null,
    contactPageUrl: contactPageUrl || null,
    country: result.country || null,
    specialization: result.product || null,
    description: mergeDescription(result) || null,
    fetchedFromSourcePage
  };
};
