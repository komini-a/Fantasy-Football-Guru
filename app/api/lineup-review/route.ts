import { AIServiceError } from "@/lib/ai/service";
import { timingSafeEqual } from "node:crypto";
import { scoringFormats, type ScoringFormat } from "@/lib/rankings";
import { evaluateLineup, getLineupData } from "@/lib/lineup/server";
import {
  LineupInputError,
  parseLineupRequest,
  validSeason,
} from "@/lib/lineup/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const season = Number(params.get("season"));
  const scoring = params.get("scoring") as ScoringFormat;
  if (!validSeason(season) || !scoringFormats.includes(scoring))
    return Response.json(
      { message: "Choose a valid season and scoring format." },
      { status: 400, headers },
    );
  try {
    return Response.json(await getLineupData(season, scoring), { headers });
  } catch {
    return Response.json(
      { message: "Player data couldn’t be loaded. Please try again." },
      { status: 503, headers },
    );
  }
}

async function readInput(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json")
    throw new LineupInputError("Send the lineup as JSON.");
  const reader = request.body?.getReader();
  if (!reader)
    throw new LineupInputError("Provide a lineup and league settings.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 24_000) {
        await reader.cancel();
        throw new LineupInputError(
          "The lineup request is too large. Shorten the additional context.",
        );
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    if (error instanceof LineupInputError) throw error;
    throw new LineupInputError("The lineup request must contain valid JSON.");
  } finally {
    reader.releaseLock();
  }
}

export async function POST(request: Request) {
  const token = process.env.LINEUP_ACCESS_TOKEN;
  if (!token || !/^[a-f\d]{64}$/i.test(token))
    return Response.json(
      { message: "AI ratings are disabled until the owner configures a lineup access code." },
      { status: 503, headers },
    );
  const authorization = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${token}`);
  const supplied = Buffer.from(authorization);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
    return Response.json(
      { message: "Enter a valid lineup access code to request a rating." },
      { status: 401, headers: { ...headers, "WWW-Authenticate": "Bearer" } },
    );
  try {
    const input = parseLineupRequest(await readInput(request));
    const data = await getLineupData(
      input.settings.season,
      input.settings.scoring,
    );
    const evaluation = await evaluateLineup(input, data, request.signal);
    return Response.json(evaluation, { headers });
  } catch (error) {
    if (error instanceof LineupInputError)
      return Response.json(
        { message: error.message },
        { status: 400, headers },
      );
    if (error instanceof AIServiceError)
      return Response.json(
        { message: error.message },
        { status: 503, headers },
      );
    return Response.json(
      {
        message:
          "A complete lineup evaluation couldn’t be generated. Please try again.",
      },
      { status: 502, headers },
    );
  }
}
