import type { RowDataPacket } from "mysql2/promise";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface HealthRow extends RowDataPacket {
  result: number;
}

export async function GET() {
  try {
    // A parameterized query that checks connectivity without requiring any tables.
    const rows = await query<HealthRow[]>("SELECT ? AS result", [1]);
    if (rows[0]?.result !== 1)
      throw new Error("Unexpected health check result");

    return Response.json(
      { status: "ok", database: "connected" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    // Avoid logging driver errors: they can contain SQL, hostnames, or credentials.
    console.error(
      "Database health check failed. Check server configuration and MySQL availability.",
    );
    return Response.json(
      {
        status: "error",
        message: "Database is unavailable. Please try again later.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
