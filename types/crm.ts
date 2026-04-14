import type {
  ActivityType,
  CompanyStatus,
  CompanyType,
  DealStage,
  LeadPriority,
  LeadStatus,
  LeadType
} from "@prisma/client";

export type CompanyFilters = {
  q?: string;
  country?: string;
  companyType?: CompanyType | "";
  status?: CompanyStatus | "";
};

export type ContactFilters = {
  q?: string;
  companyId?: string;
};

export type ProductFilters = {
  q?: string;
  category?: string;
};

export type LeadFilters = {
  q?: string;
  productId?: string;
  leadType?: LeadType | "";
  originCountry?: string;
  destinationCountry?: string;
  status?: LeadStatus | "";
  priority?: LeadPriority | "";
};

export type DealFilters = {
  q?: string;
  productId?: string;
  stage?: DealStage | "";
  originCountry?: string;
  destinationCountry?: string;
};

export type RawMarketLeadFilters = {
  product?: string;
  sourceName?: string;
  country?: string;
  confidenceScore?: number | null;
  createdAt?: string;
  page?: number;
  pageSize?: number;
};

export type ActivityInput = {
  companyId?: string | null;
  contactId?: string | null;
  leadId?: string | null;
  dealId?: string | null;
  type: ActivityType;
  note: string;
  nextActionDate?: string | null;
};

export type ParsedLeadDraft = {
  title: string;
  productName: string;
  leadType: LeadType;
  volume: number | null;
  unit: string | null;
  price: number | null;
  currency: string | null;
  incoterms: string | null;
  originCountry: string | null;
  destinationCountry: string | null;
  confidence: number;
};
