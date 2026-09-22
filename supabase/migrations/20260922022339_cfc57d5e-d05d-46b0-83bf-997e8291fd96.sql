create table public.mcp_oauth_clients (
  client_id text primary key,
  client_name text,
  redirect_uris text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.mcp_oauth_codes (
  code text primary key,
  client_id text not null references public.mcp_oauth_clients(client_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.mcp_oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null references public.mcp_oauth_clients(client_id) on delete cascade,
  access_token_hash text not null unique,
  refresh_token_hash text unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index mcp_oauth_codes_client_idx on public.mcp_oauth_codes(client_id);
create index mcp_oauth_tokens_user_idx on public.mcp_oauth_tokens(user_id);

grant all on public.mcp_oauth_clients to service_role;
grant all on public.mcp_oauth_codes to service_role;
grant all on public.mcp_oauth_tokens to service_role;

alter table public.mcp_oauth_clients enable row level security;
alter table public.mcp_oauth_codes enable row level security;
alter table public.mcp_oauth_tokens enable row level security;