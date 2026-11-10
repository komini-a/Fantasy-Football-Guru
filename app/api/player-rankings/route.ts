import { getRankings, RankingsInputError } from "@/lib/rankings-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  try {
    return Response.json(await getRankings(new URL(request.url).searchParams), {
      headers,
    });
  } catch (error) {
    if (error instanceof RankingsInputError) {
      return Response.json(
        { message: error.message },
        { status: 400, headers },
      );
    }
    console.error(
      "Rankings unavailable. Check MySQL availability, schema, and scoring profiles.",
    );
    return Response.json(
      { message: "Rankings couldn’t be loaded. Please try again." },
      { status: 503, headers },
    );
  }
}
