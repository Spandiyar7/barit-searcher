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
  "exporthub.com",
  "petrochemz.com",
  "globy.com",
  "toocle.com",
  "chemnet.com",
  "plastic4trade.com"
];

const CONTACT_PATHS = ["/contact", "/contact-us", "/about", "/about-us", "/company", "/company-profile", "/team"];

type Signals = {
  urls: Set<string>;
  emails: Set<string>;
  phones: Set<string>;
  telegrams: Set<string>;
  whatsapps: Set<string>;
  contactNames: Set<string>;
  contactPages: Set<string>;
};

const toAbsoluteUrl = (href: string, base: string) => {
  try {
    return new URL(href, base).toString();
  } catch {
    return "";
  }
};

const isLikelyMarketplaceHost = (value: string) => MARKETPLACE_HOST_HINTS.some((hint) => value.includes(hint));

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
  const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);
  return match ? match.map((item) => item.toLowerCase()) : [];
};

const parsePhone = (text: string) => {
  const matches = text.match(/\+?\d[\d\s\-()]{6,}\d/g) || [];
  return matches
    .map((value) => normalizeText(value))
    .filter((value) => {
      const digits = value.replace(/\D/g, "");
      return digits.length >= 7 && digits.length <= 15;
    });
};

const normalizeHandle = (value: string) => value.replace(/^@+/, "").trim();

const parseTelegram = (text: string) => {
  const values = new Set<string>();

  const link = text.match(/(?:https?:\/\/)?(?:t\.me|telegram\.me)\/([A-Za-z0-9_]{4,})/gi) || [];
  link.forEach((item) => {
    const match = item.match(/(?:t\.me|telegram\.me)\/([A-Za-z0-9_]{4,})/i);
    if (match?.[1]) values.add(`@${normalizeHandle(match[1])}`);
  });

  const handle = text.match(/\b(?:telegram|tg)\s*[:\-]?\s*@?([A-Za-z0-9_]{4,})/gi) || [];
  handle.forEach((item) => {
    const match = item.match(/@?([A-Za-z0-9_]{4,})$/i);
    if (match?.[1]) values.add(`@${normalizeHandle(match[1])}`);
  });

  return Array.from(values);
};

const parseWhatsApp = (text: string) => {
  const values = new Set<string>();
  const waLinks = text.match(/(?:https?:\/\/)?wa\.me\/(\d{7,15})/gi) || [];
  waLinks.forEach((item) => {
    const match = item.match(/wa\.me\/(\d{7,15})/i);
    if (match?.[1]) values.add(`+${match[1]}`);
  });

  const appLinks = text.match(/(?:https?:\/\/)?api\.whatsapp\.com\/send\?phone=(\d{7,15})/gi) || [];
  appLinks.forEach((item) => {
    const match = item.match(/phone=(\d{7,15})/i);
    if (match?.[1]) values.add(`+${match[1]}`);
  });

  const direct = text.match(/\bwhats?app\s*[:\-]?\s*(\+?\d[\d\s\-()]{6,}\d)\b/gi) || [];
  direct.forEach((item) => {
    const match = item.match(/(\+?\d[\d\s\-()]{6,}\d)/);
    if (match?.[1]) values.add(normalizeText(match[1]));
  });

  return Array.from(values);
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
      if (isLikelyMarketplaceHost(host)) continue;
      return candidate;
    } catch {
      // ignore
    }
  }
  return null;
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

const initSignals = (): Signals => ({
  urls: new Set<string>(),
  emails: new Set<string>(),
  phones: new Set<string>(),
  telegrams: new Set<string>(),
  whatsapps: new Set<string>(),
  contactNames: new Set<string>(),
  contactPages: new Set<string>()
});

const addTextSignals = (signals: Signals, text: string) => {
  parseUrls(text).forEach((url) => signals.urls.add(url));
  parseEmail(text).forEach((email) => signals.emails.add(email));
  parsePhone(text).forEach((phone) => signals.phones.add(phone));
  parseTelegram(text).forEach((telegram) => signals.telegrams.add(telegram));
  parseWhatsApp(text).forEach((whatsapp) => signals.whatsapps.add(whatsapp));
  const contactName = parseContactName(text);
  if (contactName) signals.contactNames.add(contactName);
};

const addJsonLdSignals = (signals: Signals, html: string, pageUrl: string) => {
  const $ = load(html);
  $("script[type='application/ld+json']").each((_, element) => {
    const raw = normalizeText($(element).text());
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as unknown;
      const queue: unknown[] = [parsed];
      while (queue.length > 0) {
        const current = queue.shift();
        if (!current) continue;

        if (Array.isArray(current)) {
          queue.push(...current);
          continue;
        }

        if (typeof current === "object") {
          const obj = current as Record<string, unknown>;
          if (typeof obj.email === "string") parseEmail(obj.email).forEach((item) => signals.emails.add(item));
          if (typeof obj.telephone === "string") parsePhone(obj.telephone).forEach((item) => signals.phones.add(item));
          if (typeof obj.name === "string") {
            const parsedName = parseContactName(`contact: ${obj.name}`) || normalizeText(obj.name);
            if (parsedName) signals.contactNames.add(parsedName);
          }
          if (typeof obj.url === "string") {
            const abs = toAbsoluteUrl(obj.url, pageUrl);
            if (abs) signals.urls.add(abs);
          }

          const contactPoint = obj.contactPoint;
          if (contactPoint) queue.push(contactPoint);
          Object.values(obj).forEach((value) => queue.push(value));
        }
      }
    } catch {
      // ignore malformed json-ld
    }
  });
};

const addHtmlSignals = (signals: Signals, html: string, pageUrl: string) => {
  const pageText = extractVisibleTextFromHtml(html);
  addTextSignals(signals, pageText);
  addJsonLdSignals(signals, html, pageUrl);

  const $ = load(html);
  $("a[href]").each((_, element) => {
    const href = normalizeText($(element).attr("href"));
    if (!href) return;
    const label = normalizeText($(element).text()).toLowerCase();
    const loweredHref = href.toLowerCase();

    if (loweredHref.startsWith("mailto:")) {
      parseEmail(loweredHref.replace(/^mailto:/i, "")).forEach((item) => signals.emails.add(item));
      return;
    }

    if (loweredHref.startsWith("tel:")) {
      parsePhone(loweredHref.replace(/^tel:/i, "")).forEach((item) => signals.phones.add(item));
      return;
    }

    if (/wa\.me|api\.whatsapp\.com\/send\?phone=/.test(loweredHref)) {
      parseWhatsApp(loweredHref).forEach((item) => signals.whatsapps.add(item));
      return;
    }

    if (/t\.me|telegram\.me/.test(loweredHref)) {
      parseTelegram(loweredHref).forEach((item) => signals.telegrams.add(item));
      return;
    }

    const abs = toAbsoluteUrl(href, pageUrl);
    if (!abs) return;
    signals.urls.add(abs);

    const contactHint = /contact|about|company|profile|team|support|staff/.test(`${label} ${loweredHref}`);
    if (contactHint) signals.contactPages.add(abs);
  });

  $("footer a[href]").each((_, element) => {
    const href = normalizeText($(element).attr("href"));
    if (!href) return;
    const abs = toAbsoluteUrl(href, pageUrl);
    if (!abs) return;
    if (/contact|about|company|profile|team|support/.test(abs.toLowerCase())) {
      signals.contactPages.add(abs);
    }
  });
};

const pickFromSet = (set: Set<string>) => Array.from(set)[0] || null;

const crawlWebsiteContacts = async (website: string, signals: Signals) => {
  let base: URL;
  try {
    base = new URL(website);
  } catch {
    return;
  }

  const candidates = new Set<string>();
  candidates.add(base.toString());
  CONTACT_PATHS.forEach((path) => candidates.add(new URL(path, base).toString()));

  Array.from(signals.contactPages).forEach((url) => {
    try {
      const parsed = new URL(url);
      if (parsed.hostname === base.hostname) {
        candidates.add(parsed.toString());
      }
    } catch {
      // ignore bad links
    }
  });

  let fetched = 0;
  for (const url of Array.from(candidates)) {
    if (fetched >= 8) break;
    try {
      const { html } = await fetchPublicHtml(url);
      addHtmlSignals(signals, html, url);
      fetched += 1;
    } catch {
      // best-effort only
    }
  }
};

export const enrichCompanyFromMarketResult = async (
  result: NormalizedMarketResult
): Promise<CompanyEnrichment> => {
  const signals = initSignals();
  const localText = normalizeText([result.raw_text, result.description].filter(Boolean).join("\n"));
  addTextSignals(signals, localText);

  let fetchedFromSourcePage = false;

  try {
    const { html } = await fetchPublicHtml(result.source_url);
    addHtmlSignals(signals, html, result.source_url);
    fetchedFromSourcePage = true;
  } catch {
    // keep enrichment non-blocking
  }

  let website = pickCompanyWebsite(Array.from(signals.urls), result.source_url);

  if (website) {
    try {
      await crawlWebsiteContacts(website, signals);
      const upgraded = pickCompanyWebsite(Array.from(signals.urls), result.source_url);
      if (upgraded) website = upgraded;
    } catch {
      // non-blocking
    }
  }

  return {
    companyName: result.company || null,
    website: website || null,
    email: pickFromSet(signals.emails),
    phone: pickFromSet(signals.phones),
    telegram: pickFromSet(signals.telegrams),
    whatsapp: pickFromSet(signals.whatsapps),
    contactName: result.contact_name || pickFromSet(signals.contactNames),
    contactPageUrl: pickFromSet(signals.contactPages),
    country: result.country || null,
    specialization: result.product || null,
    description: mergeDescription(result) || null,
    fetchedFromSourcePage
  };
};

