import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { DealFilters } from "@/types/crm";
import type { DealInput } from "@/lib/validations/deal";
import { emptyToNull } from "./helpers";

export const listDeals = async (filters: DealFilters = {}) => {
  const where: Prisma.DealWhereInput = {
    AND: [
      filters.q
        ? {
            OR: [
              { notes: { contains: filters.q, mode: "insensitive" } },
              { originCountry: { contains: filters.q, mode: "insensitive" } },
              { destinationCountry: { contains: filters.q, mode: "insensitive" } },
              { incoterms: { contains: filters.q, mode: "insensitive" } },
              { product: { name: { contains: filters.q, mode: "insensitive" } } },
              { buyerCompany: { name: { contains: filters.q, mode: "insensitive" } } },
              { sellerCompany: { name: { contains: filters.q, mode: "insensitive" } } }
            ]
          }
        : {},
      filters.productId ? { productId: filters.productId } : {},
      filters.stage ? { stage: filters.stage } : {},
      filters.originCountry
        ? { originCountry: { contains: filters.originCountry, mode: "insensitive" } }
        : {},
      filters.destinationCountry
        ? { destinationCountry: { contains: filters.destinationCountry, mode: "insensitive" } }
        : {}
    ]
  };

  return prisma.deal.findMany({
    where,
    include: {
      product: true,
      buyerCompany: true,
      sellerCompany: true,
      sourceLead: true,
      _count: { select: { activities: true } }
    },
    orderBy: { updatedAt: "desc" }
  });
};

export const getDealById = async (id: string) =>
  prisma.deal.findUnique({
    where: { id },
    include: {
      product: true,
      buyerCompany: true,
      sellerCompany: true,
      sourceLead: true,
      activities: {
        orderBy: { createdAt: "desc" },
        take: 40
      }
    }
  });

export const createDeal = async (input: DealInput) =>
  prisma.deal.create({
    data: {
      productId: input.productId,
      sourceLeadId: emptyToNull(input.sourceLeadId),
      sellerCompanyId: emptyToNull(input.sellerCompanyId),
      buyerCompanyId: emptyToNull(input.buyerCompanyId),
      volume: input.volume ?? undefined,
      unit: emptyToNull(input.unit),
      price: input.price ?? undefined,
      currency: emptyToNull(input.currency),
      incoterms: emptyToNull(input.incoterms),
      originCountry: emptyToNull(input.originCountry),
      destinationCountry: emptyToNull(input.destinationCountry),
      stage: input.stage,
      notes: emptyToNull(input.notes)
    }
  });

export const updateDeal = async (id: string, input: DealInput) =>
  prisma.deal.update({
    where: { id },
    data: {
      productId: input.productId,
      sourceLeadId: emptyToNull(input.sourceLeadId),
      sellerCompanyId: emptyToNull(input.sellerCompanyId),
      buyerCompanyId: emptyToNull(input.buyerCompanyId),
      volume: input.volume ?? undefined,
      unit: emptyToNull(input.unit),
      price: input.price ?? undefined,
      currency: emptyToNull(input.currency),
      incoterms: emptyToNull(input.incoterms),
      originCountry: emptyToNull(input.originCountry),
      destinationCountry: emptyToNull(input.destinationCountry),
      stage: input.stage,
      notes: emptyToNull(input.notes)
    }
  });

export const deleteDeal = async (id: string) => prisma.deal.delete({ where: { id } });
