import { auth } from "../auth";
import { redirect } from "@tanstack/react-router";

export async function getSession(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  return session;
}

export async function requireAuth(request: Request) {
  const session = await getSession(request);

  if (!session) {
    throw redirect({
      to: "/login",
    });
  }

  return session;
}

export async function getGitHubAccessToken(request: Request) {
  const session = await requireAuth(request);

  try {
    const account = await auth.api.getAccessToken({
      body: {
        providerId: "github",
        userId: session.user.id,
      }
    })

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
