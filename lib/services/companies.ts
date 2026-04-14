import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { CompanyFilters } from "@/types/crm";
import type { CompanyInput } from "@/lib/validations/company";
import { emptyToNull } from "./helpers";

export const listCompanies = async (filters: CompanyFilters = {}) => {
  const where: Prisma.CompanyWhereInput = {
    AND: [
      filters.q
        ? {
            OR: [
              { name: { contains: filters.q, mode: "insensitive" } },
              { city: { contains: filters.q, mode: "insensitive" } },
              { country: { contains: filters.q, mode: "insensitive" } },
              { description: { contains: filters.q, mode: "insensitive" } }
            ]
          }
        : {},
      filters.country ? { country: { equals: filters.country, mode: "insensitive" } } : {},
      filters.companyType ? { companyType: filters.companyType } : {},
      filters.status ? { status: filters.status } : {}
    ]
  };

  return prisma.company.findMany({
    where,
    include: {
      _count: {
        select: {
          contacts: true,
          leads: true,
          sellerDeals: true,
          buyerDeals: true
        }
      }
    },
    orderBy: { updatedAt: "desc" }
  });
};

export const getCompanyById = async (id: string) =>
  prisma.company.findUnique({
    where: { id },
    include: {
      contacts: {
        orderBy: { createdAt: "desc" }
      },
      leads: {
        include: { product: true },
        orderBy: { createdAt: "desc" },
        take: 30
      },
      sellerDeals: {
        include: { product: true, buyerCompany: true },
        orderBy: { createdAt: "desc" },
        take: 20
      },
      buyerDeals: {
        include: { product: true, sellerCompany: true },
        orderBy: { createdAt: "desc" },
        take: 20
      },
      activities: {
        orderBy: { createdAt: "desc" },
        take: 30
      }
    }
  });

export const createCompany = async (input: CompanyInput) =>
  prisma.company.create({
    data: {
      name: input.name,
      companyType: input.companyType,
      country: input.country,
      city: input.city,
      website: emptyToNull(input.website),
      description: emptyToNull(input.description),
      source: emptyToNull(input.source),
      status: input.status
    }
  });

export const updateCompany = async (id: string, input: CompanyInput) =>
  prisma.company.update({
    where: { id },
    data: {
      name: input.name,
      companyType: input.companyType,
      country: input.country,
      city: input.city,
      website: emptyToNull(input.website),
      description: emptyToNull(input.description),
      source: emptyToNull(input.source),
      status: input.status
    }
  });

export const deleteCompany = async (id: string) => prisma.company.delete({ where: { id } });

export const getCompanyOptions = async () =>
  prisma.company.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" }
  });
