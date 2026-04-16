import { normalizeText } from "./engines/shared";
import type { NormalizedMarketResult } from "./types";

const BLOCKED_HOST_HINTS = [
  "wikipedia.org",
  "youtube.com",
  "youtu.be",
  "reddit.com",
  "quora.com",
  "zhihu.com",
  "baidu.com",
  "yahoo.com",
  "linkedin.com",
  "x.com",
  "twitter.com",
  "facebook.com",
  "instagram.com",
  "tiktok.com",
  "medium.com",
  "substack.com",
  "bloomberg.com",
  "forbes.com",
  "reuters.com",
  "theguardian.com",
  "nytimes.com",
  "wsj.com",
  "forum",
  "news.",
  "blog.",
  "magazine",
  "press."
];

const BLOCKED_TEXT_PATTERN =
  /\b(news|blog|article|press release|what is|definition|encyclopedia|forum|video|podcast|medical|health|market report|price forecast|opinion|analysis)\b/i;

const BLOCKED_PATH_HINTS = [
  "/news",
  "/blog",
  "/article",
  "/articles",
  "/press",
  "/media",
  "/insights",
  "/insight",
  "/wiki",
  "/knowledge",
  "/glossary",
  "/forum",
  "/video",
  "/videos",
  "/podcast",
  "/post/"
];

const BUSINESS_SIGNAL_PATTERN =
  /\b(importer|exporter|supplier|manufacturer|distributor|wholesaler|trader|trading company|company profile|company|co\.|ltd|llc|inc|corp|gmbh|pte|s\.a\.|s\.r\.l)\b/i;

const CONTACT_SIGNAL_PATTERN =
  /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\+?\d[\d\s\-()]{6,}\d|\bwhats?app\b|\btelegram\b|mailto:|tel:)/i;

const toHost = (value: string) => {
  const normalized = normalizeText(value);
  if (!normalized) return "";
  try {
    return new URL(normalized).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
};

const toPath = (value: string) => {
  const normalized = normalizeText(value);
  if (!normalized) return "";
  try {
    return new URL(normalized).pathname.toLowerCase();
  } catch {
    return "";
  }
};

export const isMediaOrNewsLikeResult = (result: NormalizedMarketResult) => {
  const host = toHost(result.source_url);
  const path = toPath(result.source_url);
  if (!host) return false;
  if (BLOCKED_HOST_HINTS.some((hint) => host.includes(hint))) return true;
  if (BLOCKED_PATH_HINTS.some((hint) => path.includes(hint))) return true;

  const company = normalizeText(result.company);
  const text = `${company} ${result.description || ""} ${result.raw_text || ""}`.toLowerCase();
  const hasBusinessSignal = BUSINESS_SIGNAL_PATTERN.test(text);
  const hasContactSignal = CONTACT_SIGNAL_PATTERN.test(text);

  if (BLOCKED_TEXT_PATTERN.test(text) && !hasBusinessSignal && !hasContactSignal) {
    return true;
  }

  if (!company && !hasBusinessSignal && !hasContactSignal) {
    return true;
  }

  return false;
};

export const filterPrimaryLeadResults = (results: NormalizedMarketResult[]) => {
  const kept: NormalizedMarketResult[] = [];
  const rejected: NormalizedMarketResult[] = [];

  results.forEach((item) => {
    if (isMediaOrNewsLikeResult(item)) {
      rejected.push(item);
      return;
    }
    kept.push(item);
  });

  return { kept, rejected };
};
