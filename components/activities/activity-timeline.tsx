import type { ActivityType } from "@prisma/client";
import { fmtDate } from "@/lib/utils/format";
import { Badge } from "@/components/ui/badge";

type TimelineItem = {
  id: string;
  type: ActivityType;
  note: string;
  nextActionDate: Date | null;
  createdAt: Date;
};

const typeVariant: Record<ActivityType, "default" | "success" | "warning" | "danger" | "info"> = {
  CALL: "info",
  WHATSAPP: "success",
  EMAIL: "default",
  MEETING: "warning",
  NOTE: "default",
  TASK: "danger"
};

export function ActivityTimeline({ activities }: { activities: TimelineItem[] }) {
  if (!activities.length) {
    return <p className="text-sm text-slate-500">No activities yet.</p>;
  }

  return (
    <ul className="space-y-3">
      {activities.map((activity) => (
        <li key={activity.id} className="rounded-lg border border-border bg-white p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <Badge variant={typeVariant[activity.type]}>{activity.type}</Badge>
            <span className="text-xs text-slate-500">{fmtDate(activity.createdAt)}</span>
          </div>
          <p className="text-sm text-slate-700">{activity.note}</p>
          {activity.nextActionDate ? (
            <p className="mt-2 text-xs font-medium text-sky-700">Next action: {fmtDate(activity.nextActionDate)}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
