import { LeadStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { LeadFilters } from "@/types/crm";
import type { LeadInput } from "@/lib/validations/lead";
import { emptyToNull } from "./helpers";

export const listLeads = async (filters: LeadFilters = {}) => {
  const where: Prisma.LeadWhereInput = {
    AND: [
      filters.q
        ? {
            OR: [
              { title: { contains: filters.q, mode: "insensitive" } },
              { rawText: { contains: filters.q, mode: "insensitive" } },
              { sourceName: { contains: filters.q, mode: "insensitive" } },
              { sourceUrl: { contains: filters.q, mode: "insensitive" } },
              { originCountry: { contains: filters.q, mode: "insensitive" } },
              { destinationCountry: { contains: filters.q, mode: "insensitive" } },
              { incoterms: { contains: filters.q, mode: "insensitive" } },
              { product: { name: { contains: filters.q, mode: "insensitive" } } },
              { company: { name: { contains: filters.q, mode: "insensitive" } } }
            ]
          }
        : {},
      filters.productId ? { productId: filters.productId } : {},
      filters.leadType ? { leadType: filters.leadType } : {},
      filters.originCountry
        ? { originCountry: { contains: filters.originCountry, mode: "insensitive" } }
        : {},
      filters.destinationCountry
        ? { destinationCountry: { contains: filters.destinationCountry, mode: "insensitive" } }
        : {},
      filters.status ? { status: filters.status } : {},
      filters.priority ? { priority: filters.priority } : {}
    ]
  };

  return prisma.lead.findMany({
    where,
    include: {
      product: true,
      company: true,
      sourceDeal: true,
      _count: { select: { activities: true } }
    },
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }]
  });
};

export const getLeadById = async (id: string) =>
  prisma.lead.findUnique({
    where: { id },
    include: {
      product: true,
      company: {
        include: {
          contacts: {
            select: {
              id: true,
              fullName: true,
              email: true,
              phone: true
            },
            orderBy: { createdAt: "desc" },
            take: 5
          }
        }
      },
      sourceDeal: true,
      rawMarketLeads: {
        select: {
          id: true,
          sourceName: true,
          searchJobId: true,
          sourceRunId: true,
          normalized: true,
          createdAt: true
        },
        orderBy: { createdAt: "desc" }
      },
      activities: {
        orderBy: { createdAt: "desc" },
        take: 40
      }
    }
  });

export const createLead = async (input: LeadInput) =>
  prisma.lead.create({
    data: {
      title: input.title,
      productId: input.productId,
      companyId: emptyToNull(input.companyId),
      leadType: input.leadType,
      volume: input.volume ?? undefined,
      unit: emptyToNull(input.unit),
      price: input.price ?? undefined,
      currency: emptyToNull(input.currency),
      incoterms: emptyToNull(input.incoterms),
      originCountry: emptyToNull(input.originCountry),
      destinationCountry: emptyToNull(input.destinationCountry),
      sourceName: input.sourceName,
      sourceUrl: emptyToNull(input.sourceUrl),
      rawText: input.rawText,
      aiSummary: emptyToNull(input.aiSummary),
      priority: input.priority,
      status: input.status,
      publishedAt: input.publishedAt ? new Date(input.publishedAt) : null
    }
  });

export const updateLead = async (id: string, input: LeadInput) =>
  prisma.lead.update({
    where: { id },
    data: {
      title: input.title,
      productId: input.productId,
      companyId: emptyToNull(input.companyId),
      leadType: input.leadType,
      volume: input.volume ?? undefined,
      unit: emptyToNull(input.unit),
      price: input.price ?? undefined,
      currency: emptyToNull(input.currency),
      incoterms: emptyToNull(input.incoterms),
      originCountry: emptyToNull(input.originCountry),
      destinationCountry: emptyToNull(input.destinationCountry),
      sourceName: input.sourceName,
      sourceUrl: emptyToNull(input.sourceUrl),
      rawText: input.rawText,
      aiSummary: emptyToNull(input.aiSummary),
      priority: input.priority,
      status: input.status,
      publishedAt: input.publishedAt ? new Date(input.publishedAt) : null
    }
  });

export const deleteLead = async (id: string) => prisma.lead.delete({ where: { id } });

export const convertLeadToDeal = async (leadId: string) => {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new Error("Lead not found");

  if (lead.status !== LeadStatus.CLOSED && lead.status !== LeadStatus.NEGOTIATING) {
    await prisma.lead.update({
      where: { id: leadId },
      data: { status: LeadStatus.NEGOTIATING }
    });
  }

  const existing = await prisma.deal.findFirst({ where: { sourceLeadId: leadId } });
  if (existing) return existing;

  return prisma.deal.create({
    data: {
      sourceLeadId: lead.id,
      productId: lead.productId,
      buyerCompanyId: lead.leadType === "BUY" ? lead.companyId : null,
      sellerCompanyId: lead.leadType === "SELL" ? lead.companyId : null,
      volume: lead.volume,
      unit: lead.unit,
      price: lead.price,
      currency: lead.currency,
      incoterms: lead.incoterms,
      originCountry: lead.originCountry,
      destinationCountry: lead.destinationCountry,
      stage: "DRAFT",
      notes: `Auto-created from lead ${lead.title}`
    }
  });
};

export const getLeadOptions = async () =>
  prisma.lead.findMany({
    select: { id: true, title: true },
    orderBy: { createdAt: "desc" },
    take: 150
  });
