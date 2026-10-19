# Finance-Ops – wie die Anwendung funktioniert

Stand: 19. Oktober 2026. Beschreibt die Anwendung, wie sie im Code auf `main`
steht: wo sie liegt, woraus sie besteht, welchen Weg eine Rechnung nimmt und
was echt und was simuliert ist. Das ganze Projekt beschreibt
[PROJEKTBESCHREIBUNG_DE.md](PROJEKTBESCHREIBUNG_DE.md), die technischen
Details stehen in [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md).

---

## 1. Wo die Anwendung liegt

| Was | Wo |
|---|---|
| **Quellcode** | Projektordner `finance-ops-automation-de`, auf GitHub unter `shotatsertsvadze/finance-ops-automation-de` |
| **Laufende Anwendung** | nur lokal auf dem eigenen Rechner, nicht im Internet |
| **Daten** | lokale PostgreSQL-Datenbank `finops` |
| **Rechnungsdateien** | Ordner `storage/` im Projekt (`STORAGE_DIR`); jede Datei wird unverändert aufbewahrt |

**Zwei Wege, die Anwendung zu starten:**

- **Zum Entwickeln** mit `npm run dev`: Der Server (die „API“) läuft auf
  `http://localhost:4400`, die Oberfläche auf `http://localhost:5400`.
- **Mit Docker** über `docker compose up`: Datenbank und Anwendung laufen in
  Containern, alles unter `http://localhost:4400`. Bei jedem Start wird ein
  neuer Monat Demo-Rechnungen erzeugt.

**Für die n8n-Demo:** n8n läuft nicht auf demselben Rechner und kann
`localhost` nicht erreichen. Für die Aufnahme wurde deshalb ein **temporärer
Tunnel** geöffnet: eine öffentliche Adresse, die auf den lokalen Server zeigt.
Diese Adresse steht im n8n-Knoten „CONFIG – Finance Ops API“. Ist der Tunnel
zu, kommt n8n nicht mehr an die Anwendung.

---

## 2. Woraus die Anwendung besteht

```
Browser (React-Oberfläche, Port 5400)
        │  zeigt an, entscheidet nichts
        ▼
Server (Node.js + Express, Port 4400)  ← n8n schickt Rechnungen hierher
        │  alle Geschäftsregeln, Rechte, Zustände
        ▼
PostgreSQL-Datenbank „finops“ (23 Tabellen)   +   Ordner storage/ (Originaldateien)

optional:  KoSIT-Prüfer (lokal, Java, Port 8081)   ·   KI-Anbieter (aus)
```

| Baustein | Ordner | Aufgabe |
|---|---|---|
| **Server** | `server/` | die ganze Logik; die Fachbereiche sind getrennte Ordner unter `server/domain/`: Eingang, Prüfung, Routing, Freigaben, Bankverbindungen, Buchhaltung, Zahlungen, Abgleich, Kennzahlen, KI |
| **Schnittstellen** | `server/routes/` | Anmeldung, Rechnungen, Stammdaten, Bankverbindungen, Geldweg, Zustand des Dienstes |
| **Datenbank** | `db/migrations/` (24 Schritte) | Rechnungen, Positionen, Prüfergebnisse, Routing-Entscheidungen, Freigabeschritte, Lieferanten mit Bankverbindungen, Bestellungen, Buchungssätze, Zahlungen, Kontoauszugszeilen und der Prüfpfad (`audit_events`) |
| **Oberfläche** | `client/` | React, Deutsch, umschaltbar auf Englisch |
| **Offizieller Prüfer** | `vendor/kosit` | KoSIT-Validator, ein Java-Programm, lokal; in der Demo aus |
| **KI-Erklärung** | `server/integrations/ai-explainer.js` | würde ein Anthropic-Modell aufrufen; standardmäßig ausgeschaltet |
| **Testrechnungen** | `fixtures/xrechnung/` | Beispieldateien A bis J, darunter G (sauber, 380 €) und B (IBAN weicht ab) |

---

## 3. Der Weg einer Rechnung, Schritt für Schritt

Jede Rechnung hat genau einen **Status**. Er ändert sich nur über eine
einzige Funktion. Die erlaubten Wechsel stehen in einer festen Tabelle
(`server/domain/workflow/states.js`), und jeder Wechsel schreibt im selben
Moment einen Eintrag in den Prüfpfad.

1. **Eingang.** Die XML-Datei kommt per Upload im Browser oder von n8n an
   `POST /api/invoices`, von n8n mit dem Eingangskanal „E-Mail“. Die Datei wird
   gespeichert, ihr Fingerabdruck (SHA-256) berechnet. Status: **Eingegangen**.
2. **Duplikat?** Ist es dieselbe Datei wie eine schon verarbeitete, wird sie
   **Duplikat** und nicht noch einmal geprüft.
3. **Prüfung** (Status **In Prüfung**):
   - **technisch:** gültiges XML, Pflichtfelder vorhanden
   - **offiziell:** KoSIT-Prüfer, falls eingerichtet
   - **fachlich gegen die Stammdaten:** Lieferant bekannt und aktiv, IBAN
     gehört zu seinen freigegebenen Konten, Bestellung vorhanden und passend,
     Beträge Zeile für Zeile auf den Cent nachgerechnet, Rechnungsnummer nicht
     doppelt
   - Jede Prüfung speichert, was **erwartet** wurde, was **gefunden** wurde,
     den Grund und den nächsten Schritt.
4. **Routing:** Feste Regeln ordnen die Rechnung ein:
   - alles bestanden, bis 500 €: **automatisch freigegeben**
   - alles bestanden, höherer Betrag: **zur Freigabe**, je nach Betrag durch
     Kostenstellenleitung, Finanzen und CFO
   - eine Prüfung fehlgeschlagen: **zur Prüfung**, also zu Jonas, mit Grund
5. **Mensch.** Bei einer Prüfung kann Jonas die Rechnung zur Freigabe
   schicken, ablehnen, eine Rückfrage stellen oder sie als Duplikat
   bestätigen. Eine Prüfung endet nie direkt in „freigegeben“. Wer die
   Rechnung aus der Prüfung entlassen hat, darf sie nicht selbst freigeben.
6. **Buchung.** Nach der Freigabe entsteht ein **Buchungssatz** für die
   Buchhaltung, als CSV-Export.
7. **Zahlung (simuliert).** Die Zahlung wird angewiesen, mit einer eigenen
   Kennung wie `NW-P-00000001`. Sie endet als **bezahlt** oder
   **fehlgeschlagen**. Wer freigegeben hat, darf nicht zahlen.
8. **Abgleich.** Ein synthetischer Kontoauszug wird importiert. Eine Zeile
   wird nur zugeordnet, wenn sie die Zahlungskennung nennt und der Betrag
   stimmt. Sonst wird sie eine Ausnahme für einen Menschen.

```
Eingegangen → In Prüfung ─┬─→ automatisch freigegeben ─┐
                          ├─→ zur Freigabe ──→ freigegeben
                          └─→ zur Prüfung ──→ Mensch ──┘
freigegeben → Buchungssatz → Zahlung (simuliert) → bezahlt → abgeglichen
```

**Sonderfall IBAN-Abweichung:** Die Rechnung kann die Bankverbindung nie
selbst ändern. Unter „Bankverbindungen“ schlägt Person 1 das neue Konto vor,
Person 2 ruft unter der hinterlegten Nummer zurück, Person 3 gibt frei.
Danach prüft das System die betroffenen Rechnungen neu. Die Freigabe der
Rechnung bleibt eine eigene, zweite Entscheidung.

---

## 4. Die Bildschirme

| Bildschirm | Wofür |
|---|---|
| **Anmeldung** | Login mit E-Mail und Passwort |
| **Posteingang** | Arbeitsliste: welche Rechnungen warten auf wen und warum |
| **Rechnungsdetail** | Status, Prüfspur mit „erwartet/gefunden“, Verlauf, Aktionen je nach Rolle |
| **Hochladen** | eine XRechnung von Hand einreichen |
| **Bankverbindungen** | Vorschlag, Rückruf und Freigabe neuer Konten |
| **Zahlungen und Abgleich** | Zahlungen, Kontoauszug importieren, abgleichen |
| **Kennzahlen** | Durchlaufquote, Ausnahmegründe, Durchlaufzeiten, modellierte Einsparung; jede Zahl mit ihrer Quelle |

---

## 5. Rollen und Demo-Konten

Sechs erfundene Personen, alle mit demselben Demo-Passwort aus dem README:

| Person | Rolle | Darf |
|---|---|---|
| Anna Berger | Kreditorenbuchhaltung | hochladen, Ausnahmen bearbeiten; mit ihrem Konto meldet sich auch n8n an |
| Tim Kessler, Lea Sommer | Kostenstellenleitung | hochladen, Freigabestufen |
| **Jonas Weber**, Mira Hoffmann | Finanzen | prüfen, freigeben, Zahlung und Abgleich |
| Sabine Vogt | CFO | hochladen, Freigabestufen |

Jede Aktion prüft der Server, die Oberfläche blendet nur aus. Im
Produktionsmodus startet die Anwendung mit dem Demo-Passwort gar nicht.

---

## 6. Demodaten und wichtige Befehle

```bash
npm run dev          # API auf 4400, Oberfläche auf 5400
npm run demo:reset   # Datenbank leeren und einen Monat Demo-Rechnungen erzeugen
npm test             # alle automatisierten Tests
```

`npm run demo:reset` erzeugt **70 synthetische Rechnungen**. Sie laufen durch
die echte Prüfkette und werden danach zeitlich in die Vergangenheit
verschoben, damit die Durchlaufzeiten realistisch aussehen. Dabei wird auch
die Datei `client/public/demo/statement_2026-09.json` neu geschrieben. Sie
gehört nicht in einen Commit.

---

## 7. Was echt ist und was simuliert

- **Echt im Code:** Prüfungen, Routing, Freigaben, Funktionstrennung,
  Bankverbindungsprozess, Prüfpfad, Kennzahlen, Anmeldung mit gehashten
  Passwörtern.
- **Simuliert:** Zahlungen, Kontoauszüge und die Übergabe an die Buchhaltung
  (nur CSV, kein DATEV).
- **Erfunden:** alle Firmen, Personen und Rechnungen.
