#!/usr/bin/env python3
"""Generate the sample data set of TAMEIO THEMISTOCLES 96 from the lodge roster (Book2.xlsx).

Usage:  python3 tools/make_seed.py path/to/Book2.xlsx

Outputs (all deterministic):
  sample-data/members.json   - members in the internal data model (no phone / e-mail, see README)
  sample-data/ledger.json    - realistic (fictitious) payment history
  sample-data/seed.json      - members + ledger + default settings (what the app loads on first start)
  sample-data/treasury-summary.json
  assets/samples/Book2-sample.xlsx|csv|json - import samples in the exact Book2.xlsx layout
  js/seed-data.js            - the same seed as an ES module (works from file:// and offline)
"""
import csv, json, sys, datetime as dt
from pathlib import Path
import openpyxl

ROOT = Path(__file__).resolve().parent.parent
IDS = [960003, 960006, 960007, 960008, 960009, 960015, 960018, 960019, 960020, 960021, 960022,
       960023, 960025, 960028, 960031, 960032, 960033, 960034, 960035, 960036, 960037, 960038]
DEGREE = {"ΜΑΘΗΤΗΣ": "ΜΑΘΗΤΗΣ", "ΕΤΑΙΡΟΣ": "ΕΤΑΙΡΟΣ", "ΔΙΔΑΣΚΑΛΟΣ": "ΔΙΔΑΣΚΑΛΟΣ"}
CAT = {"1. ΤΑΚΤΙΚΟ": "ΤΑΚΤΙΚΟ", "4. ΥΙΟΘΕΤΗΜΕΝΟ": "ΥΙΟΘΕΤΗΜΕΝΟ", "5. ΔΙΑΓΡΑΦΕΝ": "ΔΙΑΓΡΑΦΕΝ"}
FEES = {
    "ΤΑΚΤΙΚΟ":      {"2024": 280, "2025": 280, "2026": 300, "2027": 300, "2028": 320, "2029": 320, "2030": 340},
    "ΥΙΟΘΕΤΗΜΕΝΟ":  {"2024": 140, "2025": 140, "2026": 150, "2027": 150, "2028": 160, "2029": 160, "2030": 170},
    "ΕΠΙΤΙΜΟ":      {y: 0 for y in map(str, range(2024, 2031))},
    "ΔΙΑΓΡΑΦΕΝ":    {y: 0 for y in map(str, range(2024, 2031))},
}


def iso(v):
    return v.strftime("%Y-%m-%d") if isinstance(v, (dt.datetime, dt.date)) else ""


def s(v):
    return "" if v is None else str(v).strip()


class Rng:  # tiny deterministic LCG so the seed is reproducible
    def __init__(self, seed): self.x = seed
    def next(self):
        self.x = (self.x * 1103515245 + 12345) & 0x7FFFFFFF
        return self.x / 0x7FFFFFFF
    def pick(self, seq): return seq[int(self.next() * len(seq)) % len(seq)]


def main(path):
    ws = openpyxl.load_workbook(path).active
    rows = list(ws.iter_rows(values_only=True))
    header = rows[0]
    by_id = {r[0]: r for r in rows[1:] if r[0] in IDS}
    missing = [i for i in IDS if i not in by_id]
    if missing: sys.exit(f"missing registry numbers in workbook: {missing}")

    members = []
    for n in IDS:
        r = by_id[n]
        office = s(r[18]); office_from = iso(r[19])
        m = {
            "id": f"m_{n}", "registryNumber": str(n), "firstName": s(r[1]), "lastName": s(r[2]),
            "birthYear": int(r[3]) if r[3] else None, "fatherName": s(r[4]),
            "category": CAT.get(s(r[5]), "ΤΑΚΤΙΚΟ"), "mobilePhone": "", "email": "",
            "initiationDate": iso(r[8]), "passingDate": iso(r[9]), "raisingDate": iso(r[10]),
            "adoptionDate": iso(r[11]), "reinstatementDate": iso(r[13]),
            "residence": s(r[16]), "degree": DEGREE.get(s(r[17]), ""), "office": office,
            "officeInstallDate": office_from, "grandOffice": s(r[20]), "notes": s(r[21]),
            "lodgeEmail": "", "lodgeNumber": int(r[23]) if r[23] else 96, "lodgeName": s(r[24]) or "ΘΕΜΙΣΤΟΚΛΗΣ",
            "province": s(r[25]) or "Πειραιως & Αιγαιου", "status": "active", "statusChangedAt": "",
            "feeOverride": {}, "exempt": False, "offices": [], "history": [],
            "createdAt": "2026-01-01T00:00:00.000Z", "updatedAt": "2026-01-01T00:00:00.000Z",
        }
        if office and office != "Άλλο ή Άνευ Αξιώματος":
            m["offices"].append({"office": office, "from": office_from or "2026-06-09", "to": ""})
        members.append(m)

    # ---- payment history (fictitious, deterministic) ----
    rng = Rng(96)
    ledger, receipt = [], {}

    def pay(m, year, amount, date, method=None, note=""):
        receipt[year] = receipt.get(year, 0) + 1
        ledger.append({"id": f"p_{len(ledger)+1:04d}", "memberId": m["id"], "year": year, "amount": float(amount),
                       "date": date, "method": method or rng.pick(["bank", "bank", "cash", "card"]),
                       "receipt": f"ΑΠ-{year}-{receipt[year]:04d}", "note": note, "sample": True})

    def month_date(year, month, spread=27):
        return f"{year}-{month:02d}-{1 + int(rng.next() * spread):02d}"

    profile = {  # how each member behaves in 2026 (percent of fee paid, number of installments)
        960003: (1.0, 1), 960006: (0.0, 0), 960007: (1.0, 2), 960008: (1.0, 1), 960009: (1.0, 3),
        960015: (0.5, 2), 960018: (0.0, 0), 960019: (1.0, 1), 960020: (1.0, 3), 960021: (1.0, 2),
        960022: (0.34, 1), 960023: (0.5, 1), 960025: (1.0, 1), 960028: (0.67, 2), 960031: (0.5, 1),
        960032: (1.0, 3), 960033: (1.0, 1), 960034: (0.34, 1), 960035: (0.0, 0), 960036: (0.67, 2),
        960037: (0.5, 1), 960038: (1.0, 1),
    }
    for m in members:
        n = int(m["registryNumber"]); fee26 = FEES[m["category"]]["2026"]; fee25 = FEES[m["category"]]["2025"]
        init_year = int(m["initiationDate"][:4]) if m["initiationDate"] else 0
        # 2025 history
        if init_year <= 2025 and n not in (960006, 960018):
            part = rng.next()
            if part < 0.8: pay(m, 2025, fee25, month_date(2025, 1 + int(rng.next() * 4)))
            elif part < 0.92:
                half = fee25 / 2
                pay(m, 2025, half, month_date(2025, 2)); pay(m, 2025, half, month_date(2025, 9))
            else: pay(m, 2025, round(fee25 * 0.6, 2), month_date(2025, 5))
        elif n in (960006, 960018):
            pay(m, 2025, round(fee25 * 0.5, 2), month_date(2025, 6))
        # 2026
        share, k = profile[n]
        total = round(fee26 * share, 2)
        if k:
            part = round(total / k, 2); months = [1, 4, 7][:k] if k > 1 else [1 + int(rng.next() * 6)]
            acc = 0
            for i, mo in enumerate(months):
                a = part if i < k - 1 else round(total - acc, 2)
                acc += a
                pay(m, 2026, a, month_date(2026, mo))
    # two members pre-pay 2027
    for n in (960003, 960025):
        m = next(x for x in members if x["registryNumber"] == str(n))
        pay(m, 2027, 150, "2026-09-" + f"{10 + int(rng.next() * 15):02d}", "bank", "Προπληρωμή 2027")
    ledger.sort(key=lambda p: (p["date"], p["id"]))

    settings = {
        "lodge": {"name": "Θεμιστοκλής", "number": 96, "fullName": "Συμβολική Στοά Θεμιστοκλής υπ’ αριθμ. 96",
                  "province": "Επαρχιακή Μεγάλη Στοά Πειραιώς και Αιγαίου", "grandLodge": "Εθνική Μεγάλη Στοά της Ελλάδος"},
        "fees": FEES,
    }
    seed = {"schemaVersion": 1, "generatedFrom": "Book2.xlsx (22 lodge records)", "sample": True,
            "members": members, "ledger": ledger, "settings": settings}

    (ROOT / "sample-data").mkdir(exist_ok=True)
    dump = lambda p, o: (ROOT / p).write_text(json.dumps(o, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    dump("sample-data/members.json", members); dump("sample-data/ledger.json", ledger); dump("sample-data/seed.json", seed)
    by_year = {}
    for p in ledger: by_year[p["year"]] = round(by_year.get(p["year"], 0) + p["amount"], 2)
    dump("sample-data/treasury-summary.json", {"revenueByContributionYear": by_year, "payments": len(ledger), "members": len(members)})
    (ROOT / "js/seed-data.js").write_text(
        "/* Generated by tools/make_seed.py - do not edit by hand. */\nexport const SEED = "
        + json.dumps(seed, ensure_ascii=False) + ";\n", encoding="utf-8")

    # ---- import samples in the exact Book2.xlsx layout (without personal contact data) ----
    out = ROOT / "assets/samples"; out.mkdir(parents=True, exist_ok=True)
    wb = openpyxl.Workbook(); w = wb.active; w.title = "Sheet1"; w.append(list(header))
    for n in IDS:
        r = list(by_id[n]); r[6] = None; r[7] = None; r[22] = None  # strip phone / e-mail / lodge mail
        w.append(r)
    for c in w[1]: c.font = openpyxl.styles.Font(bold=True)
    for col in "ABCDEFGHIJKLMNOPQRSTUVWXYZ": w.column_dimensions[col].width = 18
    for row in w.iter_rows(min_row=2):
        for c in row:
            if isinstance(c.value, dt.datetime): c.number_format = "DD/MM/YYYY"
    wb.save(out / "Book2-sample.xlsx")
    with open(out / "Book2-sample.csv", "w", encoding="utf-8-sig", newline="") as f:
        cw = csv.writer(f, delimiter=";")
        for row in w.iter_rows(values_only=True):
            cw.writerow(["" if v is None else (v.strftime("%d/%m/%Y") if isinstance(v, dt.datetime) else v) for v in row])
    (out / "Book2-sample.json").write_text(json.dumps(
        [{header[i]: (iso(v) if isinstance(v, dt.datetime) else v) for i, v in enumerate(r) if v is not None}
         for r in list(w.iter_rows(values_only=True))[1:]], ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("members", len(members), "payments", len(ledger), "revenue by year", by_year)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "Book2.xlsx")
