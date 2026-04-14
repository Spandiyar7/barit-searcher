import { NextResponse } from "next/server";
import { ZodError } from "zod";

export const apiOk = <T>(data: T) => NextResponse.json({ data });

export const apiError = (message: string, status = 400) =>
  NextResponse.json({ error: message }, { status });

export const parseZodError = (error: unknown) => {
  if (error instanceof ZodError) {
    return error.issues.map((issue) => issue.message).join(", ");
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected error";
};
