import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { ContactFilters } from "@/types/crm";
import type { ContactInput } from "@/lib/validations/contact";
import { emptyToNull } from "./helpers";

export const listContacts = async (filters: ContactFilters = {}) => {
  const where: Prisma.ContactWhereInput = {
    AND: [
      filters.q
        ? {
            OR: [
              { fullName: { contains: filters.q, mode: "insensitive" } },
              { email: { contains: filters.q, mode: "insensitive" } },
              { phone: { contains: filters.q, mode: "insensitive" } },
              { position: { contains: filters.q, mode: "insensitive" } },
              { company: { name: { contains: filters.q, mode: "insensitive" } } }
            ]
          }
        : {},
      filters.companyId ? { companyId: filters.companyId } : {}
    ]
  };

  return prisma.contact.findMany({
    where,
    include: {
      company: true
    },
    orderBy: { updatedAt: "desc" }
  });
};

export const getContactById = async (id: string) =>
  prisma.contact.findUnique({
    where: { id },
    include: {
      company: true,
      activities: {
        orderBy: { createdAt: "desc" },
        take: 25
      }
    }
  });

export const createContact = async (input: ContactInput) =>
  prisma.contact.create({
    data: {
      companyId: input.companyId,
      fullName: input.fullName,
      position: emptyToNull(input.position),
      email: emptyToNull(input.email),
      phone: emptyToNull(input.phone),
      whatsapp: emptyToNull(input.whatsapp),
      telegram: emptyToNull(input.telegram),
      notes: emptyToNull(input.notes)
    }
  });

export const updateContact = async (id: string, input: ContactInput) =>
  prisma.contact.update({
    where: { id },
    data: {
      companyId: input.companyId,
      fullName: input.fullName,
      position: emptyToNull(input.position),
      email: emptyToNull(input.email),
      phone: emptyToNull(input.phone),
      whatsapp: emptyToNull(input.whatsapp),
      telegram: emptyToNull(input.telegram),
      notes: emptyToNull(input.notes)
    }
  });

export const deleteContact = async (id: string) => prisma.contact.delete({ where: { id } });
