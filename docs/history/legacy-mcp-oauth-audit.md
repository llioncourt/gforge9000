# Legacy MCP OAuth Decommission Audit

**Date:** 2026-09-23
**Status:** READ-ONLY AUDIT. NO MUTATIONS EXECUTED.

## Overview
Audit of legacy MCP OAuth tables to identify unused resources for potential decommissioning.

## Findings
Runtime analysis (`rg`) confirms no active code references to these tables (excluding auto-generated types).

### Table Statistics
- `public.mcp_oauth_clients`: 5 rows
- `public.mcp_oauth_codes`: 0 rows
- `public.mcp_oauth_tokens`: 0 rows
- `public.mcp_tokens`: 2 rows

### RLS Policies
- `mcp_tokens`: Has CRUD policies restricted to `user_id = auth.uid()`.
- `mcp_oauth_*`: RLS is enabled but no policies are defined (effectively deny-all).

## Decommission Recommendation
The following SQL identifies the objects that would be removed. 

**CAUTION: DO NOT EXECUTE WITHOUT EXPLICIT APPROVAL.**

```sql
-- Proposed decommission script (NOT EXECUTED)
-- DROP TABLE public.mcp_tokens CASCADE;
-- DROP TABLE public.mcp_oauth_tokens CASCADE;
-- DROP TABLE public.mcp_oauth_codes CASCADE;
-- DROP TABLE public.mcp_oauth_clients CASCADE;
```

### Impact Analysis
- **Data Loss:** Minimal (7 total rows across legacy tables).
- **Functionality:** No impact expected as no runtime code references these tables.
- **Dependencies:** Foreign keys to `auth.users` and internal FKs between legacy tables will be removed via CASCADE.
