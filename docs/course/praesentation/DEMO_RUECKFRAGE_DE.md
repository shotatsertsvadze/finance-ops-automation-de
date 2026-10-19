# Vorführung: KI-gestützte Lieferantenrückfrage

Eine eigene, kurze Vorführung (etwa 90 Sekunden) für die Fragerunde oder das
Gespräch mit dem Dozenten. Das Demo-Video und die Hauptdemo bleiben
unverändert: Ohne `AI_EXPLANATIONS=true` zeigt die Anwendung nichts davon.
Hintergrund: ADR-084.

## Vorbereitung

1. In `.env` (nie ins Repo, nie auf dem Bildschirm zeigen):
   ```
   AI_EXPLANATIONS=true
   ANTHROPIC_API_KEY=…   # eigener Schlüssel mit bezahltem Zugang
   ```
   Optional `AI_MODEL`; Standard ist `claude-sonnet-5-5`.
2. `npm run dev` neu starten.
3. Als **anna.berger@nordwerk.example** anmelden und
   `fixtures/xrechnung/C_po_overrun_8500.xml` hochladen. Die Rechnung von
   Spree IT-Systeme (SIT-2026-0918) geht in die Sichtprüfung: Der Betrag liegt
   über dem offenen Bestellwert. Geprüft am 19.10.2026 auf einem frischen
   Demo-Monat.

Danach `AI_EXPLANATIONS` wieder entfernen, wenn die Hauptdemo ohne KI laufen
soll. `npm run demo:reset` stellt den Demo-Monat wieder her.

## Ablauf

1. Rechnung SIT-2026-0918 öffnen, nach unten zum Panel
   **Lieferantenrückfrage**.
2. **KI-Entwurf erstellen.** Der Entwurf erscheint mit Rechnungsnummer, Betrag
   und Bestellnummer. Sagen: *Diese Werte hat das Modell nie gesehen. Es
   schreibt Platzhalter, die Anwendung setzt die Werte erst nach der Prüfung
   ein.*
3. Einen Satz im Text ändern, dann **Text freigeben**. Sagen: *Freigegeben ist
   nicht versendet. Die Rechnung steht weiter in der Sichtprüfung.*
4. **Text kopieren**. Versendet wird außerhalb der Anwendung.
5. **Als von Hand versendet vermerken**, Rückfrage bestätigen. Erst jetzt geht
   die Rechnung auf *Rückfrage gestellt*. Im Verlauf stehen beide Einträge:
   freigegeben, dann versendet.
6. Zum Vergleich Havel Logistik (HL-2026-7731) öffnen: keine Rückfrage, nur der
   Hinweis auf den Rückruf. Sagen: *Bei einer geänderten IBAN wäre eine Mail
   der falsche Kanal: Sie könnte genau beim Betrüger landen.*

## Wenn das Modell nicht antwortet

Dann lädt das Panel die feste Vorlage und sagt das. Genau das zeigen: Die
Funktion blockiert nie die Rechnung, und es gibt immer einen deterministischen
Ersatz.

## Was nicht behauptet wird

- Die Anwendung versendet keine E-Mails.
- Ob die KI-Entwürfe besser sind als die Vorlage, ist erst nach der Bewertung
  mit dem echten Modell belegt (`npm run ai:eval:inquiry`, siehe
  `docs/TEST_MATRIX.md`, INQ15).
