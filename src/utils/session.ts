import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getWebRequest } from "@tanstack/react-start/server";

async function getServerSession(request: Request) {
  const auth = (await import("../auth")).auth;
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  return session;
}

async function requireServerAuth(request: Request) {
  const session = await getServerSession(request);

  if (!session) {
    throw redirect({
      to: "/login",
    });
  }

  return session;
}

export const requireAuthServerFn = createServerFn().handler(async (_ctx) => {
  const request = getWebRequest();
  const session = await requireServerAuth(request);

  return session;
});

export async function getGitHubAccessToken(request: Request) {
  const session = await requireServerAuth(request);

  try {
    const auth = (await import("../auth")).auth;
    const account = await auth.api.getAccessToken({
      body: {
        providerId: "github",
        userId: session.user.id,
      },
    });

    // const account = stmt.get(session.user.id);

    if (!account || !account.accessToken) {
      throw redirect({
        to: "/login",
      });
    }

    return account.accessToken;
  } catch (error) {
    console.error("Failed to get GitHub access token:", error);
    throw redirect({
      to: "/login",
    });
  }
}
