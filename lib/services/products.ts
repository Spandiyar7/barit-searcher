import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { ProductFilters } from "@/types/crm";
import type { ProductInput } from "@/lib/validations/product";
import { emptyToNull } from "./helpers";

export const listProducts = async (filters: ProductFilters = {}) => {
  const where: Prisma.ProductWhereInput = {
    AND: [
      filters.q
        ? {
            OR: [
              { name: { contains: filters.q, mode: "insensitive" } },
              { category: { contains: filters.q, mode: "insensitive" } },
              { hsCode: { contains: filters.q, mode: "insensitive" } },
              { synonyms: { hasSome: [filters.q] } }
            ]
          }
        : {},
      filters.category ? { category: { equals: filters.category, mode: "insensitive" } } : {}
    ]
  };

  return prisma.product.findMany({
    where,
    include: {
      _count: {
        select: {
          leads: true,
          deals: true
        }
      }
    },
    orderBy: { name: "asc" }
  });
};

export const getProductById = async (id: string) =>
  prisma.product.findUnique({
    where: { id },
    include: {
      leads: {
        include: { company: true },
        orderBy: { createdAt: "desc" },
        take: 30
      },
      deals: {
        include: { buyerCompany: true, sellerCompany: true },
        orderBy: { createdAt: "desc" },
        take: 30
      }
    }
  });

export const createProduct = async (input: ProductInput) =>
  prisma.product.create({
    data: {
      name: input.name,
      category: input.category,
      synonyms: input.synonyms,
      hsCode: emptyToNull(input.hsCode),
      specsJson: input.specsJson ?? Prisma.JsonNull
    }
  });

export const updateProduct = async (id: string, input: ProductInput) =>
  prisma.product.update({
    where: { id },
    data: {
      name: input.name,
      category: input.category,
      synonyms: input.synonyms,
      hsCode: emptyToNull(input.hsCode),
      specsJson: input.specsJson ?? Prisma.JsonNull
    }
  });

export const deleteProduct = async (id: string) => prisma.product.delete({ where: { id } });

export const findProductByNameOrSynonym = async (query: string) => {
  const value = query.trim();
  if (!value) return null;

  return prisma.product.findFirst({
    where: {
      OR: [
        { name: { equals: value, mode: "insensitive" } },
        { name: { contains: value, mode: "insensitive" } },
        { synonyms: { hasSome: [value] } }
      ]
    },
    orderBy: { updatedAt: "desc" }
  });
};

export const getProductOptions = async () =>
  prisma.product.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" }
  });
