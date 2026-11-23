# My Personal AI Agent

A mobile-friendly personal coding agent with a PWA interface, configurable owner instructions, workspace file tools, and optional terminal access. It uses an OpenAI-compatible Chat Completions API.

## Requirements
- Node.js 20+
- An API key from an AI provider that supports an OpenAI-compatible `/chat/completions` endpoint and tool calling.
- GitHub account (for source hosting)

## Run locally
1. Copy `.env.example` to `.env`.
2. Add your provider API key and model name to `.env`.
3. Install and start:
   ```bash
   npm install
   npm start
   ```
4. Open `http://localhost:3000`.

Never commit `.env`. It contains your private API key.

## Deploy for phone access
Deploy this repository to a Node.js host that supports persistent environment variables and Node 20 (for example, a VPS or a suitable app hosting service). Set these environment variables in the host dashboard:
- `AI_BASE_URL`
- `AI_API_KEY`
- `AI_MODEL`
- `ENABLE_TERMINAL=false`
- `WORKSPACE_DIR=./workspace`

Then open the deployed HTTPS URL on your phone and use your browser's **Add to Home Screen** option. The app behaves like an installable web app. The workspace must be on persistent storage if you want project files to survive redeployments.

## GitHub setup from Android
1. Install/open GitHub or visit github.com in your browser and sign in.
2. Create a new repository named `personal-ai-agent`.
3. Upload the extracted project files. Do not upload `.env`, `node_modules`, or `workspace`.
4. Connect the repository to your Node.js hosting provider and deploy.
5. Add the environment variables in the hosting provider's settings, not in GitHub.
6. Open the HTTPS deployment link on your phone; use browser menu → **Add to Home screen**.

## Optional Android APK
The web app can be wrapped with Capacitor after deployment or from a local development environment:
```bash
npm install @capacitor/core @capacitor/cli
npx cap init "My Personal AI" "com.example.personalai"
```
Create `capacitor.config.json` with your hosted HTTPS URL:
```json
{
  "appId": "com.example.personalai",
  "appName": "My Personal AI",
  "webDir": "public",
  "server": { "url": "https://YOUR-DEPLOYED-APP.example", "cleartext": false }
}
```
Then add Android and build using Android Studio:
```bash
npm install @capacitor/android
npx cap add android
npx cap sync android
npx cap open android
```
Building an APK requires a computer or cloud Android build environment; GitHub mobile alone cannot compile a native APK.

## Agent permissions and safety
- Owner instructions are editable in the app settings.
- File reading and writing can be toggled in the app settings.
- Terminal permission requires BOTH the app toggle and `ENABLE_TERMINAL=true` on the server.
- Terminal commands execute as the server's operating-system user. Workspace working-directory restriction is not a security sandbox. Do not enable terminal access on a shared or public deployment. For stronger isolation, run the agent in a disposable container/VM with restricted network, CPU, memory, filesystem, and non-root user.
- This is not literally unlimited: the selected model, provider policy, API quota, context window, hosting limits, and operating system permissions still apply.

## Notes
- The AI provider must support tool calling. Some OpenAI-compatible providers implement only part of the API.
- This starter stores chat history in the current browser tab only; it does not provide server-side accounts or cross-device sync.
- Do not expose this service publicly without authentication and rate limiting. Add authentication before sharing the URL with anyone.
