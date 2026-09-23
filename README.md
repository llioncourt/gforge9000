# Universal Character Forge / GURPS Forge Companion (GF9)

## Purpose
GF9 is an unofficial GURPS 4e character builder and campaign companion. It provides tools for character management, lore tracking, battle grids, and campaign media synchronization.

## Stack
- **Framework:** [TanStack Start v1](https://tanstack.com/start)
- **Frontend:** React 19, Vite 7, Tailwind v4
- **Backend/Auth:** Supabase, Lovable Cloud Auth Bridge
- **Language:** TypeScript

## Local Setup
1. Install dependencies:
   ```bash
   bun install
   ```
2. Set up environment variables in `.env`.
3. Start development server:
   ```bash
   bun dev
   ```

## Quality Control
- **Tests:** `bunx vitest run`
- **Typecheck:** `npx tsgo --noEmit`
- **Lint:** `bun run lint`
- **Build:** `bun run build`

## MCP Endpoint Architecture
The project exposes a public Model Context Protocol (MCP) server at `/api/public/mcp`.
- **Standards:** Implements RFC 9728 protected-resource metadata.
- **Security:** Native Supabase OAuth 2.1 authentication.
- **Access Control:** RLS-scoped per-caller client; no service role usage in MCP domains.
- **Capabilities:** 39 public tools for campaign and character management.

## Auth Architecture
- **Providers:** Supabase email/password + Google (via Lovable cloud auth bridge).
- **Flow:** Site-origin redirect with RLS-enforced security across all layers.

## Deployment Safety Notes
- **PWA/Service Worker:** Intentionally disabled for this release.
- **Database:** No schema changes allowed without explicit approval.
- **Environment:** Do not remove `.env` or `.lovable/plan` files.
