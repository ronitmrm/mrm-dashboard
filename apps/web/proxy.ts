import { convexAuthNextjsMiddleware } from "@convex-dev/auth/nextjs/server";
import { NextRequest, NextResponse, type NextFetchEvent } from "next/server";

import { PUBLIC_CONVEX_URL } from "@/lib/convex-env";

const authMiddleware = convexAuthNextjsMiddleware(undefined, {
  convexUrl: PUBLIC_CONVEX_URL,
});

export default async function proxy(request: NextRequest, event: NextFetchEvent) {
  if (request.method === "POST" && isAuthRoute(request)) {
    let payload: unknown;
    try {
      payload = await request.clone().json();
    } catch {
      return NextResponse.json({ error: "Invalid authentication request JSON." }, { status: 400 });
    }

    const normalizedPayload = normalizeAuthPayload(payload);
    if (normalizedPayload !== payload) {
      return authMiddleware(
        new NextRequest(request.url, {
          body: JSON.stringify(normalizedPayload),
          headers: withJsonContentType(request.headers),
          method: request.method,
        }),
        event,
      );
    }
  }

  return authMiddleware(request, event);
}

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};

function isAuthRoute(request: NextRequest) {
  return request.nextUrl.pathname === "/api/auth" || request.nextUrl.pathname === "/api/auth/";
}

function withJsonContentType(headers: Headers) {
  const nextHeaders = new Headers(headers);
  nextHeaders.set("content-type", "application/json");
  return nextHeaders;
}

function normalizeAuthPayload(payload: unknown) {
  if (!isRecord(payload) || payload.action !== "auth:signIn" || !isRecord(payload.args)) {
    return payload;
  }

  const { args } = payload;
  if (args.provider !== "password" || args.refreshToken !== undefined || !isRecord(args.params)) {
    return payload;
  }

  if (typeof args.params.flow === "string" || typeof args.params.code === "string") {
    return payload;
  }

  return {
    ...payload,
    args: {
      ...args,
      params: {
        ...args.params,
        flow: "signIn",
      },
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
