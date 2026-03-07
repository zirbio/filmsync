import { NextRequest, NextResponse } from "next/server";
import { exchangeCode } from "@/lib/trakt";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.json({ error: "No code provided" }, { status: 400 });
  }

  try {
    await exchangeCode(code);
    return NextResponse.redirect(new URL("/sync", request.url));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
