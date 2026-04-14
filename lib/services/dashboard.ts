import { LeadStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { listRecentActivities } from "./activities";

export const getDashboardMetrics = async () => {
  const [
    totalCompanies,
    totalContacts,
    totalProducts,
    totalLeads,
    activeDeals,
    leadStatusCounts,
    topProducts,
    recentActivities
  ] = await Promise.all([
    prisma.company.count(),
    prisma.contact.count(),
    prisma.product.count(),
    prisma.lead.count(),
    prisma.deal.count({ where: { stage: { in: ["ACTIVE", "NEGOTIATING"] } } }),
    prisma.lead.groupBy({
      by: ["status"],
      _count: { _all: true }
    }),
    prisma.product.findMany({
      select: {
        id: true,
        name: true,
        _count: { select: { leads: true } }
      },
      orderBy: { leads: { _count: "desc" } },
      take: 6
    }),
    listRecentActivities(10)
  ]);

  const statusMap = Object.values(LeadStatus).reduce(
    (acc, status) => {
      acc[status] = 0;
      return acc;
    },
    {} as Record<LeadStatus, number>
  );

  leadStatusCounts.forEach((item) => {
    statusMap[item.status] = item._count._all;
  });

  return {
    totals: {
      totalCompanies,
      totalContacts,
      totalProducts,
      totalLeads,
      activeDeals
    },
    leadStatusCounts: statusMap,
    topProducts: topProducts.map((product) => ({
      id: product.id,
      name: product.name,
      leadsCount: product._count.leads
    })),
    recentActivities
  };
};
