-- Okey oyunu için oda deposu (Supabase SQL Editor'da bir kez çalıştırın).
-- Tablolar API'ye açık olmayan ayrı bir "okey" şemasında tutulur; erişim yalnızca
-- gizli anahtar isteyen public.okey_* fonksiyonlarıyla olur.
-- __SECRET_SHA256__ yerine OKEY_DB_SECRET değerinin sha256 özetini yazın:
--   printf %s "$OKEY_DB_SECRET" | sha256sum
create schema if not exists okey;
revoke all on schema okey from public, anon, authenticated;

create table okey.config (id int primary key default 1 check (id = 1), secret_sha256 text not null);
insert into okey.config (secret_sha256) values ('__SECRET_SHA256__');

create table okey.rooms (
  code text primary key,
  state jsonb not null,
  expires_at timestamptz not null
);
create index rooms_expires_idx on okey.rooms (expires_at);

create table okey.locks (
  code text primary key,
  until timestamptz not null
);

alter table okey.config enable row level security;
alter table okey.rooms enable row level security;
alter table okey.locks enable row level security;

create function okey.check_secret(p_secret text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if encode(extensions.digest(p_secret, 'sha256'), 'hex') is distinct from (select secret_sha256 from okey.config) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end $$;

create function public.okey_get(p_secret text, p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform okey.check_secret(p_secret);
  return (select state from okey.rooms where code = p_code and expires_at > now());
end $$;

create function public.okey_set(p_secret text, p_code text, p_state jsonb, p_ttl_seconds int) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform okey.check_secret(p_secret);
  insert into okey.rooms (code, state, expires_at)
  values (p_code, p_state, now() + make_interval(secs => p_ttl_seconds))
  on conflict (code) do update set state = excluded.state, expires_at = excluded.expires_at;
end $$;

create function public.okey_create(p_secret text, p_code text, p_state jsonb, p_ttl_seconds int) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform okey.check_secret(p_secret);
  delete from okey.rooms where expires_at < now();
  insert into okey.rooms (code, state, expires_at)
  values (p_code, p_state, now() + make_interval(secs => p_ttl_seconds))
  on conflict (code) do nothing;
  return found;
end $$;

create function public.okey_lock(p_secret text, p_code text, p_ms int) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform okey.check_secret(p_secret);
  insert into okey.locks (code, until) values (p_code, now() + make_interval(secs => p_ms / 1000.0))
  on conflict (code) do update set until = excluded.until where okey.locks.until < now();
  return found;
end $$;

create function public.okey_unlock(p_secret text, p_code text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform okey.check_secret(p_secret);
  delete from okey.locks where code = p_code;
end $$;

revoke all on function okey.check_secret(text) from public, anon, authenticated;
revoke all on function public.okey_get(text, text), public.okey_set(text, text, jsonb, int),
  public.okey_create(text, text, jsonb, int), public.okey_lock(text, text, int), public.okey_unlock(text, text)
  from public, authenticated;
grant execute on function public.okey_get(text, text), public.okey_set(text, text, jsonb, int),
  public.okey_create(text, text, jsonb, int), public.okey_lock(text, text, int), public.okey_unlock(text, text)
  to anon;
