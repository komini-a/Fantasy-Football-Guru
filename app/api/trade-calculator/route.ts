import { getTradeData, TradeInputError } from "@/lib/trade/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  try {
    return Response.json(
      await getTradeData(new URL(request.url).searchParams),
      { headers },
    );
  } catch (error) {
    if (error instanceof TradeInputError)
      return Response.json(
        { message: error.message },
        { status: 400, headers },
      );
    console.error(
      "Trade data unavailable. Check MySQL, schema, and scoring profiles.",
    );
    return Response.json(
      { message: "Player data couldn’t be loaded. Please try again." },
      { status: 503, headers },
    );
  }
}
