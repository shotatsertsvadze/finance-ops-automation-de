# n8n-Ausführungen vom 20.10.2026

Die vier getesteten Läufe der Testkopie v2 („Finance Ops – Invoice Intake Demo
v2 (Wege)“, Version `f9122671`), gesichert am 21.10.2026 über die
n8n-Schnittstelle. n8n kann alte Ausführungen löschen; diese Auszüge bleiben.

| Ausführung | Datei | Zweig in n8n | Finance-Ops |
|---|---|---|---|
| 200209 | `G_clean_380.xml` | Automatisch freigegeben | `AUTO_APPROVE`, `APPROVED` |
| 200211 | `A_clean_1240.xml` | Wartet auf Freigabe | `APPROVAL`, `READY_FOR_APPROVAL`, Stufe MANAGER |
| 200213 | `B_iban_changed_2499.xml` | Gestoppt: Sichtprüfung | `REVIEW`, `REVIEW_REQUIRED`, Grund IBAN |
| 200216 | `I_discount_499.xml` | Technischer Fehler – nicht geprüft | nicht erreicht (HTTP 502) |

Die Dateien sind **Auszüge**, keine vollständigen Exporte. Entfernt sind
Anmeldeantwort, Sitzungscookie, CSRF-Token, Tunnel-Adresse, Formular-Links mit
Signatur, Resume-Token, Speicherpfade und Stacktraces; von der Antwort von
Finance-Ops sind nur die Felder für Entscheidung und Protokoll übernommen.
Alle Werte stehen so in der Ausführung, nichts ist nachgerechnet.

In allen drei erfolgreichen Läufen meldet Finance-Ops die offizielle
KoSIT-Prüfung als `SKIPPED`: Die Demo-Instanz läuft ohne Validator, was
außerhalb des Produktivbetriebs zulässig ist.
