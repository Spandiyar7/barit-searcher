import { NextRequest } from "next/server";
import { createActivity, listRecentActivities } from "@/lib/services/activities";
import { activitySchema } from "@/lib/validations/activity";
import { apiError, apiOk, parseZodError } from "@/lib/utils/http";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const take = Number(searchParams.get("take") || "15");
    const data = await listRecentActivities(take > 0 ? Math.min(take, 50) : 15);
    return apiOk(data);
  } catch (error) {
    return apiError(parseZodError(error), 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const json = await request.json();
    const payload = activitySchema.parse(json);
    const data = await createActivity(payload);
    return apiOk(data);
  } catch (error) {
    return apiError(parseZodError(error));
  }
}
