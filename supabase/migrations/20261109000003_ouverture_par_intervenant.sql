-- L'émargement n'est possible que pendant que l'intervenant affiche le QR code :
-- l'ouverture est enregistrée (ouvert, ouvert_le) quand il projette le code, fermée quand il quitte.
-- Sécurité : fermeture automatique 4 h après l'ouverture si l'intervenant oublie de fermer.
-- À exécuter dans l'éditeur SQL après les deux premiers fichiers.

alter table emargements add column if not exists ouvert_le timestamptz;

create or replace view emargements_min as
  select id, cohorte, certificat, jour, date, demi, intervenant,
         (ouvert and ouvert_le is not null and ouvert_le > now() - interval '4 hours') as ouvert
  from emargements;
revoke all on emargements_min from anon;
grant select on emargements_min to authenticated;

create or replace function emargement_ouvert(e emargements) returns boolean
language sql immutable as $$
  select e.ouvert and e.ouvert_le is not null and e.ouvert_le > now() - interval '4 hours'
$$;

create or replace function checkin_participants(p_emargement text, p_code text)
returns table (id uuid, nom text, prenom text, deja boolean)
language plpgsql security definer set search_path = public as $$
declare e emargements%rowtype;
begin
  select * into e from emargements where emargements.id = p_emargement;
  if not found or e.code <> p_code then
    raise exception 'Code de séance incorrect' using errcode = 'P0001';
  end if;
  if not emargement_ouvert(e) then
    raise exception 'L''émargement n''est pas ouvert : attendez que l''intervenant affiche le QR code' using errcode = 'P0002';
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
  if not emargement_ouvert(e) then
    raise exception 'L''émargement n''est pas ouvert : attendez que l''intervenant affiche le QR code' using errcode = 'P0002';
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

create or replace function checkin_me(p_emargement text, p_code text)
returns text
language plpgsql security definer set search_path = public as $$
declare e emargements%rowtype; p participants%rowtype;
begin
  select * into p from participants where id = mon_participant();
  if not found then raise exception 'Aucune fiche participant pour ce compte' using errcode = 'P0003'; end if;
  select * into e from emargements where emargements.id = p_emargement;
  if not found or e.code <> p_code then raise exception 'Code de séance incorrect' using errcode = 'P0001'; end if;
  if e.cohorte <> p.cohorte then raise exception 'Cette séance ne concerne pas votre cohorte' using errcode = 'P0003'; end if;
  if not emargement_ouvert(e) then
    raise exception 'L''émargement n''est pas ouvert : attendez que l''intervenant affiche le QR code' using errcode = 'P0002';
  end if;
  insert into presences (emargement, participant, statut, source)
  values (p_emargement, p.id, 'Présent', 'qr')
  on conflict (emargement, participant) do update set statut = 'Présent', source = 'qr', horodatage = now();
  return p.prenom || ' ' || p.nom;
end $$;
