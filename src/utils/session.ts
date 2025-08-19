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
  
  // Query the database directly to get GitHub access token
  // Using better-auth's internal database structure
  try {
    // Use raw SQL query with better-sqlite3 to get the account access token
    const db = (auth as any).options.database;
    const stmt = db.prepare(`
      SELECT access_token 
      FROM account 
      WHERE user_id = ? AND provider_id = 'github'
    `);
    
    const account = stmt.get(session.user.id);
    
    if (!account || !account.access_token) {
      throw redirect({
        to: "/login",
      });
    }
    
    return account.access_token;
  } catch (error) {
    console.error("Failed to get GitHub access token:", error);
    throw redirect({
      to: "/login", 
    });
  }
}