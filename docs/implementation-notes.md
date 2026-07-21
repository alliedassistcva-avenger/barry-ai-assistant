# Implementation Notes

## Model And Context Wiring

- Feed Barry active repository/file context, directory structure, and relevant terminal/execution logs on each turn where coding is involved.
- Maintain a per-session installed skills/integrations manifest with name, category, connection status, auth requirements, capability descriptions, and example trigger phrases.
- Inject the manifest into model context so Barry's `<skills_and_integrations>` logic has a concrete source of truth.
- The local web app reads Barry's prompt from `prompts/barry-system.prompt.xml` through `server/index.ts`, so prompt edits apply to the API-backed chat runtime after restart.

## Local App Runtime

- Frontend: Vite + React + TanStack Router.
- Server: Express + OpenAI Responses API.
- Provider switcher: chat requests include `provider`, allowing `openai`, `deepseek`, or `gemini`.
- Thread storage: browser `localStorage`, which keeps the app usable without adding a database.
- Live AI mode: set `OPENAI_API_KEY`, `DEEPSEEK_API_KEY`, `GEMINI_API_KEY`, or any combination of them in `.env`.
- Missing key behavior: if the selected provider key is empty, `/api/chat` returns a clear `503` configuration error.
- Deployment binding: the Express server reads `PORT` and binds to `HOST` or `0.0.0.0`, so Railway and similar platforms can route external traffic to it.

## Extensibility Pattern For New Integrations

Each integration should register:

- A short capability description.
- Required auth and connection state.
- Example trigger phrases.
- Consequential action types the integration can perform.

This lets Barry's "check for relevant integration" step be a lookup rather than a guess.

New domain modules, such as TikTok Ads or a specific CRM, should be added as their own subsection under `<capabilities>` using the same pattern:

- What Barry does.
- What Barry hands off.
- What requires confirmation before execution.

## Confirmation Gating

Implement a hard gate in the host application for any action tagged as consequential:

- Ad spend and budget changes.
- Publishing or sending externally.
- Production deploys.
- Destructive delete operations.
- Billing, auth, and paid external-service connection changes.

The prompt tells Barry to ask; the host app should make the gate impossible to skip.

See [src/consequence-gate.ts](../src/consequence-gate.ts) for a small TypeScript reference implementation.
