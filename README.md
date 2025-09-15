# Edwin

<img width="1306" height="949" alt="image" src="https://github.com/user-attachments/assets/2750f504-67a5-4f6c-9c9e-e956041ce2e1" />


# Self-host setup guide

## Prerequisites

1. **Node.js** (v18+) and **pnpm** installed
2. **GitHub account** for OAuth app setup

## 1. GitHub OAuth App Setup

1. Go to GitHub Settings: https://github.com/settings/developers
2. Click "New OAuth App"
3. Fill in the details:
   - **Application name**: `Edwin - GitHub Stars Organizer`
   - **Homepage URL**: `http://localhost:3001`
   - **Application description**: `Self-hosted GitHub stars organizer`
   - **Authorization callback URL**: `http://localhost:3001/api/auth/callback/github`

4. Click "Register application"
5. Copy the **Client ID** and generate a **Client Secret**

## 2. Environment Variables

1. Copy the environment template:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and add your GitHub OAuth credentials:
   ```env
   # GitHub OAuth
   GITHUB_CLIENT_ID=your_github_client_id_here
   GITHUB_CLIENT_SECRET=your_github_client_secret_here

   # App settings
   NODE_ENV=development
   BETTER_AUTH_SECRET=your_random_secret_key_here
   ```

3. Generate a random secret key:
   ```bash
   # On macOS/Linux
   openssl rand -base64 32

   # Or use any random string generator
   ```

## 3. Database Setup

The database is already set up and migrated. The SQLite file is located at `./edwin.db`.

```bash
pnpm dlx @better-auth/cli migrate
```

## 4. Start Development

```bash
# Install dependencies (if not already done)
pnpm install

# Start the development server
pnpm dev
```

## 5. Test the Setup

1. Visit http://localhost:3001/
2. Click "Get Started" to go to the login page
3. Click "Sign in with GitHub" to test OAuth flow
4. After successful auth, you'll be redirected back to the app

## 6. API Endpoints

- **Auth**: `/api/auth/*` (handled by better-auth)
- **Streaming**: `/api/stars/stream` (placeholder for SSE)

## Troubleshooting

### OAuth Issues
- Make sure the callback URL matches exactly: `http://localhost:3001/api/auth/callback/github`
- Ensure GitHub Client ID and Secret are correct in `.env`
- Check that the port (3001) matches in both GitHub app settings and your local server

### Database Issues
- If database issues occur, delete `edwin.db` and restart the server
- Migrations will run automatically

### Development Issues
- Run `pnpm build` to check for TypeScript errors
- Check browser console for runtime errors
- Ensure all environment variables are set correctly

## Next Steps

Once basic auth is working, the next features to implement are:
1. Store GitHub access tokens from OAuth flow
2. Implement real GitHub API integration
3. Complete SSE streaming for repository data
4. Add search and filtering capabilities

---

For more detailed implementation status, see `IMPLEMENTATION_STATUS.md`
