# Vorführung: KI-gestützte Lieferantenrückfrage

Eine eigene, kurze Vorführung (etwa 90 Sekunden) für die Fragerunde oder das
Gespräch mit dem Dozenten. Das Demo-Video und die Hauptdemo bleiben
unverändert: Ohne `AI_EXPLANATIONS=true` zeigt die Anwendung nichts davon.
Hintergrund: ADR-084.

## Vorbereitung

1. In `.env` (nie ins Repo, nie auf dem Bildschirm zeigen):
   ```
   AI_EXPLANATIONS=true
   ANTHROPIC_API_KEY=…   # Schlüssel eines Workspace, mit Guthaben
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
   ein.* Bei Nachfrage: Die Beträge der Prüfung selbst, hier netto 8.500 € und
   5.000 € offen in der Bestellung, bekommt das Modell schon.
3. Einen Satz im Text ändern, dann **Text freigeben**. Sagen: *Freigegeben ist
   nicht versendet. Die Rechnung steht weiter in der Sichtprüfung.*
4. **Text kopieren**. Versendet wird außerhalb der Anwendung.
5. **Als von Hand versendet vermerken**, Rückfrage bestätigen. Erst jetzt geht
   die Rechnung auf den Status *Rückfrage offen*. Im Verlauf stehen beide Einträge:
   freigegeben, dann versendet.
6. Zum Vergleich Havel Logistik (HL-2026-7731) öffnen: keine Rückfrage, nur der
   Hinweis auf den Rückruf. Sagen: *Bei einer geänderten IBAN wäre eine Mail
   der falsche Kanal: Sie könnte genau beim Betrüger landen.*

## Reserve: Screenshots

Falls live nichts geht, liegen die Schritte als Bilder in
[`reserve_ki_rueckfrage/`](reserve_ki_rueckfrage/), aufgenommen am 19.10.2026
mit dem echten Modell auf einer Testdatenbank:

1. `1_panel.png`: das Panel vor dem Entwurf
2. `2_ki_entwurf.png`: der KI-Entwurf mit eingesetzten Werten
3. `3_freigegeben.png`: freigegeben, noch nicht versendet
4. `4_versendet.png` und `4_seite.png`: von Hand versendet, die Rechnung steht
   auf „Rückfrage offen“, im Verlauf „Rückfrage gestellt“
5. `5_iban.png`: Havel Logistik, nur der Hinweis auf den Rückruf

## Wenn das Modell nicht antwortet

Dann lädt das Panel die feste Vorlage und sagt das. Genau das zeigen: Die
Funktion blockiert nie die Rechnung, und es gibt immer einen deterministischen
Ersatz.

## Was belegt ist und was nicht

- Die Anwendung versendet keine E-Mails.
- Mit dem echten Modell waren in der Erstbewertung 16 von 24 Entwürfen
  zulässig. Nach einer Zeile mehr im Prompt waren es in einer gezielten
  Nachprüfung mit 5 Fällen 15 von 15; das ist keine neue Gesamtquote
  (`docs/course/KI_BEWERTUNG_DE.md`). Zulässig heißt: Die feste Prüfung hat
  nichts gefunden, nicht: Der Text ist gut.
- Im Vergleich mit der festen Vorlage fiel die Wahl in 6 von 6 Fällen auf die
  Vorlage. Die Vorführung zeigt also den abgesicherten Ablauf, keinen Vorteil
  der KI. Wer fragt, bekommt das so: Für Standardfälle reicht die Vorlage, die
  KI bliebe in einer Einführung aus. Den Knopf **Vorlage verwenden** gleich
  mitzeigen.
- Der Entwurf ist bei jedem Aufruf etwas anders formuliert. Live kann also ein
  anderer Text kommen als in der Probe.
