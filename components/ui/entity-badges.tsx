import type {
  CompanyStatus,
  CompanyType,
  DealStage,
  LeadPriority,
  LeadStatus,
  LeadType
} from "@prisma/client";
import { Badge } from "@/components/ui/badge";

export function CompanyStatusBadge({ status }: { status: CompanyStatus }) {
  const variant = status === "ACTIVE" ? "success" : status === "TO_VERIFY" ? "warning" : "default";
  return <Badge variant={variant}>{status}</Badge>;
}

export function CompanyTypeBadge({ type }: { type: CompanyType }) {
  const variant = type === "SUPPLIER" ? "info" : type === "BUYER" ? "success" : "default";
  return <Badge variant={variant}>{type}</Badge>;
}

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  const variant =
    status === "NEW"
      ? "info"
      : status === "NEGOTIATING"
        ? "warning"
        : status === "CLOSED"
          ? "success"
          : status === "DEAD"
            ? "danger"
            : "default";
  return <Badge variant={variant}>{status}</Badge>;
}

export function LeadTypeBadge({ type }: { type: LeadType }) {
  const variant = type === "BUY" ? "success" : type === "SELL" ? "info" : "default";
  return <Badge variant={variant}>{type}</Badge>;
}

export function LeadPriorityBadge({ priority }: { priority: LeadPriority }) {
  const variant = priority === "HIGH" ? "danger" : priority === "MEDIUM" ? "warning" : "default";
  return <Badge variant={variant}>{priority}</Badge>;
}

export function DealStageBadge({ stage }: { stage: DealStage }) {
  const variant =
    stage === "COMPLETED"
      ? "success"
      : stage === "NEGOTIATING"
        ? "warning"
        : stage === "LOST"
          ? "danger"
          : "default";
  return <Badge variant={variant}>{stage}</Badge>;
}
