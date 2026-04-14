import { prisma } from "@/lib/db/prisma";
import { tokenizeSearch } from "@/lib/utils/query";

const buildTokenizedOr = (tokens: string[], fields: string[]) => {
  if (!tokens.length) return undefined;

  return {
    AND: tokens.map((token) => ({
      OR: fields.map((field) => ({
        [field]: { contains: token, mode: "insensitive" as const }
      }))
    }))
  };
};

export const globalSearch = async (query: string) => {
  const trimmed = query.trim();
  if (!trimmed) {
    return {
      companies: [],
      contacts: [],
      products: [],
      leads: [],
      deals: []
    };
  }

  const tokens = tokenizeSearch(trimmed);

  const [companies, contacts, products, leads, deals] = await Promise.all([
    prisma.company.findMany({
      where: {
        OR: [
          { name: { contains: trimmed, mode: "insensitive" } },
          { country: { contains: trimmed, mode: "insensitive" } },
          { city: { contains: trimmed, mode: "insensitive" } },
          { description: { contains: trimmed, mode: "insensitive" } }
        ],
        ...(buildTokenizedOr(tokens, ["name", "country", "city", "description"]) || {})
      },
      take: 8,
      orderBy: { updatedAt: "desc" }
    }),
    prisma.contact.findMany({
      where: {
        OR: [
          { fullName: { contains: trimmed, mode: "insensitive" } },
          { position: { contains: trimmed, mode: "insensitive" } },
          { email: { contains: trimmed, mode: "insensitive" } },
          { company: { name: { contains: trimmed, mode: "insensitive" } } }
        ],
        AND: tokens.map((token) => ({
          OR: [
            { fullName: { contains: token, mode: "insensitive" } },
            { position: { contains: token, mode: "insensitive" } },
            { notes: { contains: token, mode: "insensitive" } },
            { company: { name: { contains: token, mode: "insensitive" } } }
          ]
        }))
      },
      include: { company: { select: { name: true, id: true } } },
      take: 8,
      orderBy: { updatedAt: "desc" }
    }),
    prisma.product.findMany({
      where: {
        OR: [
          { name: { contains: trimmed, mode: "insensitive" } },
          { category: { contains: trimmed, mode: "insensitive" } },
          { hsCode: { contains: trimmed, mode: "insensitive" } },
          { synonyms: { hasSome: [trimmed] } }
        ],
        AND: tokens.map((token) => ({
          OR: [
            { name: { contains: token, mode: "insensitive" } },
            { category: { contains: token, mode: "insensitive" } },
            { synonyms: { hasSome: [token] } }
          ]
        }))
      },
      take: 8,
      orderBy: { updatedAt: "desc" }
    }),
    prisma.lead.findMany({
      where: {
        OR: [
          { title: { contains: trimmed, mode: "insensitive" } },
          { rawText: { contains: trimmed, mode: "insensitive" } },
          { sourceName: { contains: trimmed, mode: "insensitive" } },
          { incoterms: { contains: trimmed, mode: "insensitive" } },
          { originCountry: { contains: trimmed, mode: "insensitive" } },
          { destinationCountry: { contains: trimmed, mode: "insensitive" } },
          { product: { name: { contains: trimmed, mode: "insensitive" } } },
          { company: { name: { contains: trimmed, mode: "insensitive" } } }
        ],
        AND: tokens.map((token) => ({
          OR: [
            { title: { contains: token, mode: "insensitive" } },
            { rawText: { contains: token, mode: "insensitive" } },
            { sourceName: { contains: token, mode: "insensitive" } },
            { incoterms: { contains: token, mode: "insensitive" } },
            { originCountry: { contains: token, mode: "insensitive" } },
            { destinationCountry: { contains: token, mode: "insensitive" } },
            { product: { name: { contains: token, mode: "insensitive" } } },
            { company: { name: { contains: token, mode: "insensitive" } } }
          ]
        }))
      },
      include: {
        product: { select: { id: true, name: true } },
        company: { select: { id: true, name: true } }
      },
      take: 8,
      orderBy: { createdAt: "desc" }
    }),
    prisma.deal.findMany({
      where: {
        OR: [
          { notes: { contains: trimmed, mode: "insensitive" } },
          { incoterms: { contains: trimmed, mode: "insensitive" } },
          { originCountry: { contains: trimmed, mode: "insensitive" } },
          { destinationCountry: { contains: trimmed, mode: "insensitive" } },
          { product: { name: { contains: trimmed, mode: "insensitive" } } },
          { buyerCompany: { name: { contains: trimmed, mode: "insensitive" } } },
          { sellerCompany: { name: { contains: trimmed, mode: "insensitive" } } }
        ],
        AND: tokens.map((token) => ({
          OR: [
            { notes: { contains: token, mode: "insensitive" } },
            { incoterms: { contains: token, mode: "insensitive" } },
            { originCountry: { contains: token, mode: "insensitive" } },
            { destinationCountry: { contains: token, mode: "insensitive" } },
            { product: { name: { contains: token, mode: "insensitive" } } },
            { buyerCompany: { name: { contains: token, mode: "insensitive" } } },
            { sellerCompany: { name: { contains: token, mode: "insensitive" } } }
          ]
        }))
      },
      include: {
        product: { select: { id: true, name: true } },
        buyerCompany: { select: { id: true, name: true } },
        sellerCompany: { select: { id: true, name: true } }
      },
      take: 8,
      orderBy: { updatedAt: "desc" }
    })
  ]);

  return {
    companies,
    contacts,
    products,
    leads,
    deals
  };
};
