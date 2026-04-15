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
  "forum",
  "news.",
  "blog.",
  "medium.com",
  "substack.com",
  "twitter.com",
  "x.com",
  "instagram.com",
  "facebook.com",
  "tiktok.com"
];

const BLOCKED_TEXT_PATTERN =
  /\b(news|blog|article|press release|what is|definition|encyclopedia|forum|video|podcast|medical|health)\b/i;

const toHost = (value: string) => {
  const normalized = normalizeText(value);
  if (!normalized) return "";
  try {
    return new URL(normalized).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
};

export const isMediaOrNewsLikeResult = (result: NormalizedMarketResult) => {
  const host = toHost(result.source_url);
  if (!host) return false;
  if (BLOCKED_HOST_HINTS.some((hint) => host.includes(hint))) return true;

  const text = `${result.company || ""} ${result.description || ""} ${result.raw_text || ""}`.toLowerCase();
  if (BLOCKED_TEXT_PATTERN.test(text) && !/(supplier|importer|exporter|manufacturer|distributor|trading company|co\.|ltd|llc|inc)/i.test(text)) {
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

