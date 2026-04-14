import { NextRequest } from "next/server";
import { deleteActivity, updateActivity } from "@/lib/services/activities";
import { activitySchema } from "@/lib/validations/activity";
import { apiError, apiOk, parseZodError } from "@/lib/utils/http";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const json = await request.json();
    const payload = activitySchema.parse(json);
    const data = await updateActivity(params.id, payload);
    return apiOk(data);
  } catch (error) {
    return apiError(parseZodError(error));
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await deleteActivity(params.id);
    return apiOk({ success: true });
  } catch (error) {
    return apiError(parseZodError(error), 500);
  }
}
