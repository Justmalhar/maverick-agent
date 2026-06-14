import { NextRequest, NextResponse } from "next/server";

const AGENT_URL = process.env.AGENT_URL || "http://localhost:4096";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, sessionId, stream } = body;

    if (!message || !sessionId) {
      return NextResponse.json(
        { error: "message and sessionId are required" },
        { status: 400 }
      );
    }

    const agentRes = await fetch(`${AGENT_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, sessionId, stream }),
    });

    if (!agentRes.ok) {
      const error = await agentRes.json().catch(() => ({ error: "Agent error" }));
      return NextResponse.json(error, { status: agentRes.status });
    }

    if (stream && agentRes.body) {
      return new Response(agentRes.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    const data = await agentRes.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("Chat API error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}