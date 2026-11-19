import snapshot from "../../../../data/reports.snapshot.json";
import type { ReportsPayload } from "@/lib/types";

export async function GET() {
  return Response.json({ ...(snapshot as ReportsPayload), mode: "snapshot" } satisfies ReportsPayload);
}
