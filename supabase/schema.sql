-- Schéma de la base de gestion du Master Exécutif AIGP (Supabase / PostgreSQL)
-- À exécuter une seule fois dans l'éditeur SQL de Supabase, puis seed.sql.

create extension if not exists pgcrypto;

create table if not exists cohortes (
  id text primary key,                 -- C2, C3, C4
  libelle text not null,
  debut date,
  fin date
);

create table if not exists participants (
  id uuid primary key default gen_random_uuid(),
  cohorte text not null references cohortes(id),
  nom text not null,
  prenom text not null default '',
  email text default '',
  organisation text default '',
  fonction text default '',
  statut text not null default 'Actif',          -- Actif / Abandon / Diplômé / Suspendu
  financement text not null default 'Individuel', -- Individuel / Entreprise / Mixte / Bourse
  frais numeric not null default 0,               -- frais d'inscription (MAD)
  remise numeric not null default 0,
  notes text default '',
  created_at timestamptz not null default now()
);
create index if not exists participants_cohorte_idx on participants(cohorte);

create table if not exists emargements (
  id text primary key,                 -- C4-J01-AM
  cohorte text not null references cohortes(id),
  certificat text not null default '', -- C1..C6
  jour int not null,
  date date,
  demi text not null,                  -- AM / PM
  code text not null,                  -- code à 4 chiffres affiché sur la slide
  intervenant text default '',
  ouvert boolean not null default false -- pointage autorisé hors fenêtre de date
);

create table if not exists seances (
  id text primary key,                 -- C4-J01-S1
  cohorte text not null references cohortes(id),
  certificat text not null default '',
  jour int not null,
  date date,
  creneau text not null,               -- S1..S4
  duree numeric not null default 1.5,  -- heures
  cours text default '',
  intervenant text default '',
  statut text not null default 'Planifié', -- Planifié / Réalisé / Reporté / Annulé
  emargement text references emargements(id)
);
create index if not exists seances_cohorte_idx on seances(cohorte);

create table if not exists presences (
  id bigserial primary key,
  emargement text not null references emargements(id) on delete cascade,
  participant uuid not null references participants(id) on delete cascade,
  statut text not null default 'Présent',  -- Présent / Absent / Excusé
  source text not null default 'manuel',   -- qr / manuel / import
  horodatage timestamptz not null default now(),
  unique (emargement, participant)
);

create table if not exists depenses (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  cohorte text not null default 'Commun',  -- id de cohorte ou 'Commun'
  certificat text default '',
  categorie text not null,
  libelle text not null,
  fournisseur text default '',
  montant numeric not null default 0,      -- MAD TTC
  statut text not null default 'À payer',  -- À payer / Payé
  piece text default '',
  notes text default ''
);

create table if not exists recettes (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  cohorte text not null references cohortes(id),
  participant uuid references participants(id) on delete set null,
  payeur text not null,                    -- nom du participant, de l'entreprise, du sponsor
  type text not null default 'Participant',-- Participant / Entreprise / Sponsor / Subvention
  objet text default '',
  facture text default '',
  montant_facture numeric not null default 0,
  montant_encaisse numeric not null default 0,
  date_encaissement date,
  echeance date,
  notes text default ''
);

create table if not exists config (
  cle text primary key,
  valeur jsonb not null
);

-- ---------------------------------------------------------------------------
-- Comptes et rôles. Les comptes sont créés dans Supabase (Authentication → Users) ;
-- la table profils leur attribue un rôle : 'admin' (équipe) ou 'intervenant'.
-- Pour un intervenant, la colonne intervenant est un fragment de son nom tel
-- qu'il apparaît dans le planning (ex. 'Gouvier') : il voit et gère les journées
-- dont le champ intervenant contient ce fragment.
-- ---------------------------------------------------------------------------
create table if not exists profils (
  email text primary key,
  nom text not null default '',
  role text not null default 'intervenant' check (role in ('admin','intervenant')),
  intervenant text not null default '',
  created_at timestamptz not null default now()
);

-- Checklist de journée (avant / pendant / après le cours), cochée par l'intervenant ou l'équipe.
create table if not exists checklist (
  id bigserial primary key,
  cohorte text not null references cohortes(id) on delete cascade,
  jour int not null,
  item text not null,                 -- identifiant de l'élément (config.checklist)
  fait boolean not null default false,
  fait_par text default '',
  fait_le timestamptz,
  commentaire text default '',
  unique (cohorte, jour, item)
);

create or replace function app_role() returns text
language sql stable security definer set search_path = public as $$
  select role from profils where lower(email) = lower(coalesce(auth.email(), ''))
$$;
create or replace function app_intervenant() returns text
language sql stable security definer set search_path = public as $$
  select nullif(trim(intervenant), '') from profils where lower(email) = lower(coalesce(auth.email(), ''))
$$;
create or replace function est_mon_cours(interv text) returns boolean
language sql stable as $$
  select app_intervenant() is not null and lower(coalesce(interv, '')) like '%' || lower(app_intervenant()) || '%'
$$;
create or replace function ma_journee(p_cohorte text, p_jour int) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from seances s where s.cohorte = p_cohorte and s.jour = p_jour and est_mon_cours(s.intervenant))
$$;
create or replace function mon_emargement(p_em text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from emargements e where e.id = p_em and (est_mon_cours(e.intervenant) or ma_journee(e.cohorte, e.jour)))
$$;

-- Vue minimale des participants pour les intervenants (pas de coordonnées ni de finances).
create or replace view participants_min as
  select id, cohorte, nom, prenom, statut from participants;
revoke all on participants_min from anon;
grant select on participants_min to authenticated;

-- ---------------------------------------------------------------------------
-- Sécurité (RLS)
--   admin        : tout.
--   intervenant  : planning en lecture, ses journées (checklist, présences, séances) en écriture.
--   anon         : planning en lecture ; pointage via les fonctions checkin_* uniquement.
-- ---------------------------------------------------------------------------
alter table cohortes     enable row level security;
alter table participants enable row level security;
alter table emargements  enable row level security;
alter table seances      enable row level security;
alter table presences    enable row level security;
alter table depenses     enable row level security;
alter table recettes     enable row level security;
alter table config       enable row level security;
alter table profils      enable row level security;
alter table checklist    enable row level security;

do $$ declare t text;
begin
  foreach t in array array['cohortes','participants','emargements','seances','presences','depenses','recettes','config','profils','checklist'] loop
    execute format('drop policy if exists equipe_tout on %I', t);
    execute format('drop policy if exists admin_tout on %I', t);
    execute format('create policy admin_tout on %I for all to authenticated using (app_role() = ''admin'') with check (app_role() = ''admin'')', t);
  end loop;
end $$;

-- Lecture du planning : public (page planning.html) et comptes connectés.
drop policy if exists public_lecture on seances;
create policy public_lecture on seances for select to anon, authenticated using (true);
drop policy if exists public_lecture on cohortes;
create policy public_lecture on cohortes for select to anon, authenticated using (true);
drop policy if exists lecture_config on config;
create policy lecture_config on config for select to authenticated using (true);

-- Intervenants
drop policy if exists interv_seances on seances;
create policy interv_seances on seances for update to authenticated using (est_mon_cours(intervenant)) with check (est_mon_cours(intervenant));
drop policy if exists interv_emargements on emargements;
create policy interv_emargements on emargements for select to authenticated using (est_mon_cours(intervenant) or ma_journee(cohorte, jour));
drop policy if exists interv_emargements_maj on emargements;
create policy interv_emargements_maj on emargements for update to authenticated using (est_mon_cours(intervenant) or ma_journee(cohorte, jour)) with check (est_mon_cours(intervenant) or ma_journee(cohorte, jour));
drop policy if exists interv_presences_lecture on presences;
create policy interv_presences_lecture on presences for select to authenticated using (mon_emargement(emargement));
drop policy if exists interv_presences_ecriture on presences;
create policy interv_presences_ecriture on presences for insert to authenticated with check (mon_emargement(emargement));
drop policy if exists interv_presences_maj on presences;
create policy interv_presences_maj on presences for update to authenticated using (mon_emargement(emargement)) with check (mon_emargement(emargement));
drop policy if exists interv_checklist on checklist;
create policy interv_checklist on checklist for all to authenticated using (ma_journee(cohorte, jour)) with check (ma_journee(cohorte, jour));

-- Profils : chacun lit le sien ; le premier compte connecté sur une table vide devient admin.
drop policy if exists profil_propre on profils;
create policy profil_propre on profils for select to authenticated using (lower(email) = lower(coalesce(auth.email(), '')));
drop policy if exists profil_amorcage on profils;
create policy profil_amorcage on profils for insert to authenticated
  with check (lower(email) = lower(coalesce(auth.email(), '')) and role = 'admin' and not exists (select 1 from profils));

-- Pointage : la liste des participants n'est renvoyée que si le code est bon.
create or replace function checkin_participants(p_emargement text, p_code text)
returns table (id uuid, nom text, prenom text, deja boolean)
language plpgsql security definer set search_path = public as $$
declare e emargements%rowtype;
begin
  select * into e from emargements where emargements.id = p_emargement;
  if not found or e.code <> p_code then
    raise exception 'Code de séance incorrect' using errcode = 'P0001';
  end if;
  if not e.ouvert and (e.date is null or abs(current_date - e.date) > 1) then
    raise exception 'Le pointage de cette séance n''est pas ouvert' using errcode = 'P0002';
  end if;
  return query
    select p.id, p.nom, p.prenom,
           exists (select 1 from presences pr where pr.emargement = p_emargement and pr.participant = p.id) as deja
    from participants p
    where p.cohorte = e.cohorte and p.statut = 'Actif'
    order by p.nom, p.prenom;
end $$;

create or replace function checkin(p_emargement text, p_code text, p_participant uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare e emargements%rowtype; p participants%rowtype;
begin
  select * into e from emargements where emargements.id = p_emargement;
  if not found or e.code <> p_code then
    raise exception 'Code de séance incorrect' using errcode = 'P0001';
  end if;
  if not e.ouvert and (e.date is null or abs(current_date - e.date) > 1) then
    raise exception 'Le pointage de cette séance n''est pas ouvert' using errcode = 'P0002';
  end if;
  select * into p from participants where participants.id = p_participant and cohorte = e.cohorte;
  if not found then
    raise exception 'Participant inconnu pour cette cohorte' using errcode = 'P0003';
  end if;
  insert into presences (emargement, participant, statut, source)
  values (p_emargement, p_participant, 'Présent', 'qr')
  on conflict (emargement, participant) do update set statut = 'Présent', source = 'qr', horodatage = now();
  return p.prenom || ' ' || p.nom;
end $$;

grant execute on function checkin_participants(text, text) to anon, authenticated;
grant execute on function checkin(text, text, uuid) to anon, authenticated;
