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
-- Sécurité : les utilisateurs connectés (équipe) ont tous les droits ;
-- les visiteurs anonymes (participants qui scannent le QR) ne passent que par
-- deux fonctions contrôlées par le code de séance.
-- ---------------------------------------------------------------------------
alter table cohortes     enable row level security;
alter table participants enable row level security;
alter table emargements  enable row level security;
alter table seances      enable row level security;
alter table presences    enable row level security;
alter table depenses     enable row level security;
alter table recettes     enable row level security;
alter table config       enable row level security;

do $$ declare t text;
begin
  foreach t in array array['cohortes','participants','emargements','seances','presences','depenses','recettes','config'] loop
    execute format('drop policy if exists equipe_tout on %I', t);
    execute format('create policy equipe_tout on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- Lecture publique du planning (pour la page planning intégrée dans Canvas).
drop policy if exists public_lecture on seances;
create policy public_lecture on seances for select to anon using (true);
drop policy if exists public_lecture on cohortes;
create policy public_lecture on cohortes for select to anon using (true);

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
