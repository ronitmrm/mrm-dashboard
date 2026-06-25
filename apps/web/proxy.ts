import { convexAuthNextjsMiddleware } from "@convex-dev/auth/nextjs/server";

import { PUBLIC_CONVEX_URL } from "@/lib/convex-env";

export default convexAuthNextjsMiddleware(undefined, {
  convexUrl: PUBLIC_CONVEX_URL,
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
