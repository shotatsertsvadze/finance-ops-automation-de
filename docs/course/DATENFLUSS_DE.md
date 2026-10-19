# Prozess und Datenfluss

Zwei Diagramme für den Rechnungseingang der fiktiven Nordwerk GmbH: wer was
tut (Prozess) und welche Daten wohin gehen (Datenfluss). Stand: 19.10.2026,
mit der KI-gestützten Lieferantenrückfrage (ADR-084).

## 1. Prozess: wer tut was

Die Regeln stehen an einer Stelle, in Finance-Ops. n8n transportiert nur,
Menschen klären Ausnahmen und geben frei.

```mermaid
flowchart TD
  subgraph LIEF["Lieferant"]
    L1["schickt XRechnung per E-Mail"]
  end
  subgraph N8N["n8n: transportiert nur"]
    N1["holt die Mail ab,<br/>nimmt den XML-Anhang"]
    N2["schreibt eine Zeile<br/>ins Google Sheet"]
  end
  subgraph FO["Finance-Ops: prüft und ordnet nach festen Regeln"]
    F1["liest die Rechnung ein,<br/>speichert das Original"]
    F2["technische Prüfung<br/>und offizielle KoSIT-Prüfung"]
    F3["fachliche Prüfungen:<br/>Lieferant, Bestellung und Betrag,<br/>IBAN, Duplikat, Summen"]
    F4{"Ergebnis"}
    F5["automatisch freigegeben<br/>bis 500 €"]
    F6["zur Freigabe<br/>nach Betragsstufe"]
    F7["Sichtprüfung<br/>mit Grund und Beleg"]
    F8["Prüfpfad: jede Entscheidung<br/>mit Person, Zeit und Grund"]
  end
  subgraph TEAM["Finance-Team"]
    T0["lädt eine Rechnung<br/>im Browser hoch"]
    T1["klärt die Ausnahme"]
    T2["Rückfrage an den Lieferanten:<br/>Entwurf von KI oder Vorlage,<br/>Mensch prüft, gibt frei,<br/>versendet von Hand"]
    T3["abweichende IBAN:<br/>Rückruf unter der<br/>hinterlegten Nummer"]
  end
  subgraph FREI["Freigebende"]
    A1["Kostenstellenleitung,<br/>Finanzen, CFO je nach Betrag"]
    A2["neue Bankverbindung:<br/>Vorschlag, Rückruf, Freigabe<br/>durch drei verschiedene Personen"]
  end

  L1 --> N1 --> F1
  T0 --> F1
  F1 --> F2 --> F3 --> F4
  F4 -- "alles bestanden, klein" --> F5
  F4 -- "alles bestanden" --> F6
  F4 -- "eine Prüfung fehlgeschlagen" --> F7
  F6 --> A1
  F7 --> T1
  T1 -- "geklärt" --> A1
  T1 -- "Angaben fehlen oder falsch" --> T2
  T1 -- "IBAN weicht ab" --> T3 --> A2
  A2 -- "neu prüfen" --> F3
  F4 --> F8
  F4 -. "nur beim Eingang per E-Mail" .-> N2
```

Danach folgen Buchung (CSV-Export), Zahlung und Abgleich mit dem
Kontoauszug. Zahlung und Kontoauszug sind simuliert.

**Drei Ausgänge, jeder mit Grund:**

| Ausgang | Wann | Wer handelt |
|---|---|---|
| Automatisch freigegeben | alle Prüfungen bestanden, bis 500 € | niemand |
| Zur Freigabe | alle Prüfungen bestanden, über 500 € | Kostenstellenleitung; über 5.000 € auch Finanzen; über 25.000 € auch CFO |
| Sichtprüfung | mindestens eine Prüfung fehlgeschlagen | Finance-Team; danach noch mindestens eine Freigabe |

**Wo die KI hilft und wo nicht.** Bei einer Ausnahme kann ein Mensch einen
KI-Entwurf der Rückfrage an den Lieferanten anfordern. Die Anwendung prüft den
Entwurf, ein Mensch bearbeitet ihn, gibt ihn frei und versendet ihn von Hand.
Bei einer abweichenden IBAN gibt es keinen Entwurf: Dort gilt nur der Rückruf
unter der hinterlegten Nummer. Die KI entscheidet in keinem Fall, und ohne KI
läuft der Prozess unverändert.

## 2. Datenfluss: welche Daten wohin gehen

Im gestrichelten Rahmen stehen die externen Dienste. Alles andere lief in der
Demo auf dem eigenen Rechner.

```mermaid
flowchart LR
  LIEF["Lieferant"]
  subgraph EXT["Externe Dienste"]
    MAIL["Demo-Postfach<br/>(IMAP)"]
    N8N["n8n"]
    TUN["Tunnel<br/>(temporär, nur Demo)"]
    GS["Google Sheet<br/>Finance Ops Demo Log"]
    KI["KI-Anbieter<br/>Anthropic"]
  end
  subgraph LOKAL["Eigener Rechner"]
    APP["Finance-Ops<br/>Regeln und Entscheidungen"]
    DB[("PostgreSQL<br/>alle Daten, Prüfpfad")]
    KOSIT["KoSIT-Prüfer"]
    WEB["Browser<br/>Finance-Team"]
  end

  LIEF -- "E-Mail mit XRechnung" --> MAIL
  MAIL -- "Mail mit XML-Anhang" --> N8N
  N8N -- "XML-Datei, Demo-Anmeldung" --> TUN --> APP
  APP -- "Antwort: ganze Rechnungsansicht,<br/>auch IBAN" --> TUN --> N8N
  N8N -- "9 Spalten, keine IBAN" --> GS
  WEB -- "Anmeldung, Upload,<br/>Entscheidungen" --> APP
  APP --- DB
  APP -- "XML-Datei" --> KOSIT
  APP -- "nur auf Knopfdruck: Prüfcodes,<br/>feste Sätze, Platzhalternamen" --> KI
  KI -- "Entwurf mit Platzhaltern" --> APP

  style EXT stroke-dasharray: 5 5
```

| Empfänger | Was ankommt | Bankdaten? | Gespeichert |
|---|---|---|---|
| **Demo-Postfach** | die Mail mit der XRechnung | ja, die IBAN steht in der Rechnung | beim Mailanbieter |
| **n8n** | die XML-Datei und die Antwort von Finance-Ops, also die ganze Rechnungsansicht | **ja**: IBAN der Rechnung und die hinterlegten IBANs aus der Prüfung | in den Ausführungsdaten von n8n, je nach Einstellung der Instanz |
| **Tunnel** | dieselben Daten wie n8n, über HTTPS; der Tunnelanbieter (Cloudflare) leitet sie weiter | ja, auf dem Weg | nur in der Demo genutzt |
| **Google Sheet** | Eingang, Rechnungsnummer, Lieferant, Betrag, Ergebnis, Status, Grund, Invoice ID, Eingangskanal | **nein**: Der Grund nennt eine IBAN-Abweichung, nie die IBAN | in Google Drive |
| **KoSIT-Prüfer** | die XML-Datei | ja | nein; läuft im eigenen Netz, die Datei verlässt das System nicht |
| **KI-Anbieter** | nur freigegebene Prüfinformationen, nur auf Knopfdruck, standardmäßig aus | höchstens eine gekürzte IBAN bei der Erklärung; bei der Rückfrage keine | beim Anbieter nach dessen Bedingungen; in Finance-Ops genau das, was gesendet wurde |

Die Antwort an n8n ist dieselbe wie im Browser. Für die Demo ist das
gewollt, weil n8n die Werte für die Sheet-Zeile braucht. Für ein Echtsystem
gehört sie auf das Nötige gekürzt. Siehe
[RISIKO_UND_DATENSCHUTZ_DE.md](RISIKO_UND_DATENSCHUTZ_DE.md), Abschnitt zu
n8n und Google Sheets.

## 3. Warum die Aufgaben so verteilt sind

- **Regeln an einer Stelle.** In einem früheren Referenzprojekt liefen Regeln
  in n8n-Knoten auseinander (ADR-004). Hier ruft n8n nur die
  Upload-Schnittstelle auf. Rechte und Regeln gelten dort genau wie beim
  Upload im Browser.
- **n8n ist austauschbar.** Fällt n8n aus, bleiben die Mails im Postfach, und
  das Team lädt die Rechnungen im Browser hoch. Am Ergebnis ändert das nichts.
- **Das Sheet ist nur Anzeige.** Es wirkt nicht auf Finance-Ops zurück. Der
  verbindliche Nachweis ist der Prüfpfad in der Anwendung.
- **Eine grüne n8n-Ausführung heißt nicht „freigegeben“.** Grün heißt nur:
  transportiert. Ob eine Rechnung frei ist, entscheidet Finance-Ops.
