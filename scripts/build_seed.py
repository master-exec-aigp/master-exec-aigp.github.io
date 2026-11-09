"""Construit les données d'amorçage (séances + émargements) à partir du planning Excel.
Usage : python3 scripts/build_seed.py "<planning>.xlsx" > supabase/seed.sql
Produit supabase/seed.sql (cohortes, séances, émargements, certificats) à exécuter dans Supabase.
"""
import sys, re, json, random, unicodedata
import openpyxl

SRC = sys.argv[1] if len(sys.argv) > 1 else "../../PLanning ME AIGP 2&3.xlsx"
SHEETS = {"EXEC_Cohorte_2": "C2", "EXEC_Cohorte_3 ": "C3", "EXEC_Cohorte_4": "C4"}
MOIS = {"janvier":1,"fevrier":2,"mars":3,"avril":4,"mai":5,"juin":6,"juillet":7,"aout":8,
        "septembre":9,"september":9,"octobre":10,"novembre":11,"decembre":12,"december":12}
CERTS = {"C1":"AI Foundations","C2":"AI Applications","C3":"AI Analytics & Data Science",
         "C4":"Robotics & Autonomous Systems","C5":"AI Governance","C6":"AI Transformation"}

def norm(s):
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii","ignore").decode()
    return re.sub(r"\s+"," ",s).strip()

def parse_date(s):
    if not s: return ""
    m = re.search(r"(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})", norm(s))
    if not m: return ""
    d, mo, y = int(m.group(1)), MOIS.get(m.group(2).lower()), int(m.group(3))
    return f"{y:04d}-{mo:02d}-{d:02d}" if mo else ""

def clean_name(s):
    s = norm(s or "")
    return " ".join(w if (w.isupper() and len(w) <= 3) else w.capitalize() if w.isupper() else w for w in s.split())

random.seed(2026)
wb = openpyxl.load_workbook(SRC, data_only=True)
seances, emargements = [], []
for sheet, coh in SHEETS.items():
    ws = wb[sheet]
    grid = {(c.row, c.column): c.value for row in ws.iter_rows() for c in row}
    for m in ws.merged_cells.ranges:
        v = grid.get((m.min_row, m.min_col))
        for r in range(m.min_row, m.max_row+1):
            for c in range(m.min_col, m.max_col+1):
                grid[(r, c)] = v
    jour = 0; cur_em = None
    for r in range(6, ws.max_row+1):
        cert_raw, date_raw, sess, cours, interv = (grid.get((r,c)) for c in (1,3,4,5,6))
        if not sess: continue
        n = int(re.search(r"\d", str(sess)).group())
        cert = re.match(r"\s*(C\d)", norm(cert_raw or "")).group(1) if cert_raw else ""
        if n == 1: jour += 1
        demi = "AM" if n <= 2 else "PM"
        em_id = f"{coh}-J{jour:02d}-{demi}"
        date = parse_date(date_raw)
        intervenant = clean_name(interv) if interv else ""
        if em_id != cur_em:
            cur_em = em_id
            emargements.append({"id": em_id, "cohorte": coh, "certificat": cert, "jour": jour, "date": date,
                                "demi": demi, "code": f"{random.randint(0,9999):04d}", "intervenant": intervenant})
        else:
            if intervenant and not emargements[-1]["intervenant"]:
                emargements[-1]["intervenant"] = intervenant
        seances.append({"id": f"{coh}-J{jour:02d}-S{n}", "cohorte": coh, "certificat": cert, "jour": jour,
                        "date": date, "creneau": f"S{n}", "duree": 1.5, "cours": norm(cours) if cours else "",
                        "intervenant": intervenant, "statut": "Planifié", "emargement": em_id})

def q(v):
    if v is None or v == "": return "null"
    if isinstance(v, (int, float)): return str(v)
    return "'" + str(v).replace("'", "''") + "'"

out = ["-- Données d'amorçage générées par scripts/build_seed.py à partir du planning Excel.",
       "-- Relancer le script et ré-exécuter ce fichier si le planning change (les upserts n'écrasent pas les présences).", ""]
out.append("insert into cohortes (id, libelle, debut, fin) values")
out.append(",\n".join(f"({q(c)}, {q(l)}, {q(d)}, {q(f)})" for c,l,d,f in [
    ("C2","Cohorte 2 (2024-2026)","2024-07-01","2026-06-30"),
    ("C3","Cohorte 3 (2025-2027)","2025-07-01","2027-06-30"),
    ("C4","Cohorte 4 (2026-2028)","2026-11-01","2028-06-30")]) +
    "\non conflict (id) do update set libelle = excluded.libelle;")
out.append("")
out.append("insert into emargements (id, cohorte, certificat, jour, date, demi, code, intervenant) values")
out.append(",\n".join(f"({q(e['id'])}, {q(e['cohorte'])}, {q(e['certificat'])}, {e['jour']}, {q(e['date'])}, {q(e['demi'])}, {q(e['code'])}, {q(e['intervenant'])})" for e in emargements) +
    "\non conflict (id) do update set certificat = excluded.certificat, date = excluded.date, intervenant = excluded.intervenant;")
out.append("")
out.append("insert into seances (id, cohorte, certificat, jour, date, creneau, duree, cours, intervenant, emargement) values")
out.append(",\n".join(f"({q(s['id'])}, {q(s['cohorte'])}, {q(s['certificat'])}, {s['jour']}, {q(s['date'])}, {q(s['creneau'])}, {s['duree']}, {q(s['cours'])}, {q(s['intervenant'])}, {q(s['emargement'])})" for s in seances) +
    "\non conflict (id) do update set certificat = excluded.certificat, date = excluded.date, cours = excluded.cours, intervenant = excluded.intervenant;")
out.append("")
import json as _j
out.append("insert into config (cle, valeur) values")
out.append(f"('certificats', {q(_j.dumps(CERTS, ensure_ascii=False))}::jsonb),")
out.append("('categories_depenses', '[\"Honoraires intervenants\", \"Déplacements & hébergement\", \"Restauration\", \"Logistique & salles\", \"Communication & marketing\", \"Plateformes & licences\", \"Frais administratifs\", \"Coûts internes UM6P\", \"Autre\"]'::jsonb),")
out.append("('seuil_presence', '70'::jsonb),")
out.append("('checkin_url', '\"https://master-exec-aigp.github.io/checkin.html\"'::jsonb)")
out.append("on conflict (cle) do nothing;")
print("\n".join(out))
import sys
print(f"-- {len(seances)} séances, {len(emargements)} émargements", file=sys.stderr)
