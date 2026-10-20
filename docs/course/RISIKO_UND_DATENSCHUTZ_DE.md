# Risikoanalyse und Datenschutzkonzept

Teil des Abschlusspakets, siehe [COURSE_FINAL_DE.md](COURSE_FINAL_DE.md).
Empfohlene Projektdokumentation, keine verbindliche Kursvorgabe.

Die technischen Gegenmaßnahmen in diesem Dokument sind **im Code umgesetzt
und getestet**, sofern nicht ausdrücklich als „geplant“ oder „fehlt“
markiert.
Die Belege stehen in `docs/ARCHITECTURE.md`, `docs/DECISIONS.md` und
`docs/TEST_MATRIX.md`.

---

## Teil A: Risikoanalyse

Wahrscheinlichkeit und Auswirkung sind Einschätzungen für einen möglichen
Pilotbetrieb mit echten Rechnungen. Sie sind nicht gemessen.

| # | Risiko | Wahrscheinlichkeit | Auswirkung | Gegenmaßnahme (umgesetzt) | Restrisiko |
|---|---|---|---|---|---|
| 1 | **Falsche Lieferanten-Bankverbindung** (z. B. gefälschte Mitteilung „neue Bankverbindung“) | mittel | hoch | Die IBAN jeder Rechnung wird mit den hinterlegten Konten verglichen. Eine Abweichung stoppt die Rechnung und lässt sich nicht übersteuern. Ein neues Konto braucht Vorschlag, Rückruf unter der hinterlegten Nummer und Freigabe durch drei verschiedene Personen. Bei der Zahlungsanweisung wird das Konto erneut geprüft. | Das alte Konto bleibt vertrauenswürdig, bis ein Stilllegen gebaut ist. Ist schon die hinterlegte Rückrufnummer falsch, oder wird der Anruf selbst manipuliert, greift die Kontrolle nicht. |
| 2 | **Unzulässige Freigabe** – Verletzung des Vier-Augen- oder Drei-Personen-Prinzips | niedrig | hoch | Funktionstrennung wird auf dem Server erzwungen, nicht nur in der Oberfläche: Wer prüft, gibt nicht frei; wer einreicht, gibt nicht frei; niemand entscheidet zwei Stufen; wer freigibt, zahlt nicht. Für Bankverbindungen sichert die Datenbank die drei Personen zusätzlich ab. Jede Freigabe ist an Dokument, Prüflauf und Betrag gebunden. | Absprachen zwischen mehreren Personen verhindert keine Software. Die Anmeldung ist auf Demo-Niveau (siehe Risiko 6). |
| 3 | **Fehlerhafte oder ungültige E-Rechnung** | hoch | mittel | Technische Prüfung, offizielle KoSIT-Prüfung und das Nachrechnen aller Beträge. Besteht eine Rechnung eine Prüfung nicht, geht sie in die manuelle Prüfung, nicht in die Freigabe. Unvollständige oder nicht zuverlässig prüfbare Rechnungspositionen werden nicht automatisch freigegeben, sondern zur manuellen Prüfung weitergeleitet. Rechenfehler in den Summen lassen sich nicht übersteuern. | Nur XRechnung in UBL-Syntax wird gelesen; CII und ZUGFeRD fehlen. Eine abgelehnte Rechnung kann nicht von Hand weiterverarbeitet werden; der Lieferant muss eine korrigierte schicken. |
| 4 | **Ausfall des externen Validators** (KoSIT) | mittel | mittel | Transportfehler, Nichterreichbarkeit sowie zentrale Versions- und Dokumentabweichungen führen in die Prüfung. Das lässt sich nicht übersteuern. Version und Konfiguration sind festgelegt und per Prüfsumme gesichert. Nach dem Ausfall werden die betroffenen Rechnungen gezielt neu geprüft. Im Produktionsmodus startet die Anwendung ohne Validator nicht. | Für ungewöhnlich aufgebaute Validatorantworten besteht noch weiterer Härtungsbedarf. Während eines Ausfalls wächst die Prüfwarteschlange. Die Wiederholung gibt es nur über die Schnittstelle, noch ohne Schaltfläche. Die Bereitschaftsprüfung der Anwendung fragt den Validator nicht ab. |
| 5 | **Inkonsistente Stammdaten** | mittel | mittel | Jede Rechnung wird gegen die aktuellen Stammdaten geprüft. Vor jeder Freigabe laufen die fachlichen Prüfungen erneut. Bankverbindungen ändern sich nur über den kontrollierten Prozess. | Pflege und Import von Lieferanten und Bestellungen sind nicht gebaut. Eine Bestellung ist ein einzelner Restbetrag, ohne Teillieferungen. Die Datenqualität beim Kunden bleibt eine Voraussetzung. |
| 6 | **Unberechtigter Zugriff oder unberechtigte Aktion** | mittel | hoch | Anmeldung mit gehashten Passwörtern und Sitzungscookies, Schutz gegen gefälschte Anfragen (CSRF), gebremste Fehlversuche, Sicherheits-Header. Eine Rechtematrix wird bei jeder Aktion auf dem Server geprüft. Im vorgesehenen Produktionsprofil darf die Anwendungsrolle den Prüfpfad nur ergänzen, nicht ändern oder löschen. Im Produktionsmodus startet die Anwendung nicht mit dem Demo-Passwort. | Keine Mehr-Faktor-Anmeldung, kein SSO, kein Passwort-Zurücksetzen. Hosting, Netzwerk und Betrieb sind nicht gehärtet, weil es noch keinen Produktionsbetrieb gibt. |
| 7 | **Falsche Abstimmung** | mittel | mittel | Eine Kontoauszugszeile wird nur zugeordnet, wenn sie die eindeutige Zahlungs-ID nennt und der Betrag stimmt. Ein bloß gleicher Betrag reicht nie; das wird eine Ausnahme. Ausnahmen klärt ein Mensch, mit Begründung. | Teil- und Sammelzahlungen werden immer zu Ausnahmen, also zu Handarbeit. Kontoauszüge sind bisher synthetisch; echte Bankformate (camt.053) fehlen. |
| 8 | **KI-Halluzination / Automation Bias** (Menschen vertrauen der KI zu sehr) | mittel | mittel | Die KI ist standardmäßig aus und entscheidet nichts; ein Test verhindert, dass Workflow-Code sie nutzt. Jede Antwort wird vor der Anzeige gegen die Belege geprüft; nennt sie Zahlen oder Kennungen, die nicht in den Belegen stehen, wird sie nicht gezeigt. Die regelbasierten Prüfergebnisse stehen über der Erklärung, die als Vorschlag gekennzeichnet ist. | Widersprüche im freien Text werden nur über eine Liste von Formulierungen erkannt. Die Erklärung ist mit dem echten Modell noch nicht bewertet. Übervertrauen lässt sich durch Gestaltung verringern, nicht ausschließen. |
| 9 | **Datenweitergabe an einen externen KI-Anbieter** | niedrig, solange die Funktion aus ist | hoch | Standardmäßig aus. Eingeschaltet werden nur ausdrücklich freigegebene, minimierte Prüfinformationen gesendet. Dokumentbasierte Rohwerte werden standardmäßig nicht übertragen; KoSIT-Fehlermeldungen werden auf Regelcodes reduziert. Keine Rechnungsdatei, keine Namen von Lieferant, Käufer oder Firma, keine vollständige IBAN, keine Kommentare. Was gesendet wurde, wird gespeichert. | Die Anwendung erkennt personenbezogene Daten nicht automatisch; sie vermeidet stattdessen, Werte aus dem Dokument zu senden. Auch minimierte Prüfinformationen verlassen das System, etwa ein Bestellstatus oder eine gekürzte IBAN. Ein Vertrag zur Auftragsverarbeitung und eine Prüfung der Speicherfristen beim Anbieter fehlen. |
| 9a | **KI-Entwurf einer Lieferantenrückfrage sagt etwas Falsches oder Gefährliches** (ADR-084) | mittel | mittel | Der Entwurf ist ein Vorschlag; ein Mensch bearbeitet, gibt frei und versendet von Hand. Vor der Anzeige wird jeder Entwurf deterministisch geprüft: nur bekannte Platzhalter statt Rechnungswerten, keine unbelegten Zahlen, keine Kontaktdaten, keine Bankdaten, keine Entscheidung. Bei abweichender IBAN gibt es gar keine Rückfrage, auch keine Vorlage. Fällt das Modell aus, bleibt die feste Vorlage. Nur „von Hand versendet“ ändert den Status der Rechnung. | Ton und inhaltliche Vollständigkeit prüft keine Regel; das leistet der Mensch. Mit dem echten Modell auf Zulässigkeit bewertet: in der Erstbewertung 16 von 24 Entwürfen angenommen, nach einer Prompt-Anpassung 15 von 15 in einer gezielten Nachprüfung mit 5 Fällen, keine neue Gesamtquote ([KI_BEWERTUNG_DE.md](KI_BEWERTUNG_DE.md)). Im Vergleich mit der festen Vorlage fiel die Wahl in 6 von 6 Fällen auf die Vorlage (eine Person, mit Hilfe von ChatGPT, nicht unabhängig); für Standardfälle ist kein Mehrwert gezeigt. |
| 10 | **Scope Creep** (der Umfang wächst unkontrolliert) | hoch | hoch | Feature Freeze seit dem 30.09.2026, aufgehoben nur für die KI-gestützte Lieferantenrückfrage (ADR-084). Ein Plan mit klarer „nicht jetzt“-Liste. Jede Phase endet getestet und dokumentiert, bevor die nächste beginnt. | Druck in einem Pilot, ERP-Funktionen nachzubauen. Dagegen hilft nur die klare Abgrenzung: kein ERP, kein Zahlungsdienstleister. |
| 11 | **Integrationsfehler** (Buchhaltung, Bank, Validator, Postfach) | mittel | hoch | Klare Schnittstellen („Adapter“) für Buchhaltung, Zahlung, Validator und KI. Zahlungen tragen einen Idempotenzschlüssel, der Kontoauszugsimport ist wiederholbar, der Validator ist versionsgebunden. | Die Anbindungen an DATEV und die Bank (pain.001, camt.053) existieren noch nicht. Den Eingang per E-Mail gibt es nur als Demo mit n8n, einem Demo-Postfach und einem temporären Tunnel. Gegen echte Systeme ist nichts davon getestet. Hier liegt die größte Unsicherheit für einen Pilot. |

### Einordnung

Die wichtigsten Finanzrisiken – falsche Bankverbindung, unzulässige Freigabe,
ungültige Rechnung – werden durch Kontrollen adressiert, die im Code erzwungen
werden. Die zentralen Finanzkontrollen sind umgesetzt und getestet. Für einen
echten Pilot bleiben neben Integrationen und Betrieb auch einzelne
Härtungspunkte bei Berechtigungen und Randfällen der Validierung offen.

---

## Teil B: Datenschutzkonzept

Das Projekt beansprucht **keine DSGVO-Konformität** (ADR-008). Es arbeitet
ausschließlich mit synthetischen Daten. Dieser Abschnitt beschreibt, welche
Schutzmaßnahmen eingebaut sind und was vor einem Einsatz mit echten Daten
noch fehlt.

### Welche Daten ein echter Betrieb verarbeiten würde

| Kategorie | Beispiele | Personenbezug |
|---|---|---|
| Mitarbeitende | Name, E-Mail-Adresse, Rolle, Handlungen im Prüfpfad, Kommentare | ja |
| Anmeldedaten | Passwort-Hash, Sitzungen, IP-Adresse bei fehlgeschlagener Anmeldung | ja |
| Lieferanten | Firmenname, USt-IdNr., IBAN, Rückrufnummer | bei Einzelunternehmen und Ansprechpartnern ja |
| Rechnungsinhalte | Positionen, Beträge, Referenzen, IBAN, ggf. Kontaktdaten im Dokument | teilweise |

### Bereits umgesetzt

**Technische Schutzmaßnahmen**

- Passwörter werden nur als Hash gespeichert (scrypt, pro Person eigenes
  Salt). Auch Sitzungen liegen nur als Hash in der Datenbank.
- Cookies sind für Skripte unlesbar (HttpOnly) und gelten nur für die eigene
  Seite (SameSite=Strict). Jede ändernde Anfrage braucht ein
  CSRF-Token.
- Hochgeladene Dateien werden sicher gelesen und nie im Browser ausgeführt.
- Sicherheits-Header bei jeder Antwort.

**Datenminimierung**

- Protokolle enthalten nie den Inhalt einer Anfrage, nur Methode, Pfad,
  Status, Dauer und Nutzer-ID.
- Fehlgeschlagene Anmeldeversuche mit IP-Adresse werden nach dem Zeitfenster
  der Bremse (standardmäßig 15 Minuten) gelöscht.
- Beendete Sitzungen werden einen Tag nach ihrem Ende gelöscht.
- Kennzahlen werden pro Prozess berechnet, nie pro Person. Das System ist
  kein Werkzeug zur Leistungskontrolle von Mitarbeitenden.

**Rollen und Berechtigungen**

- Eine zentrale Rechtematrix, auf dem Server bei jeder Aktion geprüft.
- Dedizierte Stammdaten-, Kontoauszugs- und Buchhaltungsfunktionen sind
  rollenbasiert geschützt. Vor einem echten Pilot muss zusätzlich die
  Rechnungsdetailansicht so eingeschränkt werden, dass jede Rolle nur die
  für ihre Aufgabe erforderlichen Finanzdaten erhält.
- Die Administration betreibt das System, nimmt aber an keiner
  Bankverbindungsänderung teil.

**Audit Trail**

- Jede Statusänderung wird mit Person, Zeitpunkt, Grund und Beleg
  gespeichert.
- Im vorgesehenen Produktionsprofil darf die Anwendungsrolle den Prüfpfad
  nur ergänzen. Die Anwendung prüft beim Start zentrale Tabellenrechte;
  zusätzliche Datenbank-Härtung ist vor einem echten Pilot weiterhin
  erforderlich.
- Die Originaldatei jeder Rechnung wird unverändert aufbewahrt. Die
  Schnittstelle bietet kein Löschen an.

**Offizielle Validierung ohne Datenweitergabe**

- Der KoSIT-Prüfer läuft lokal bzw. im internen Netz. Für die offizielle
  Prüfung verlässt keine Rechnung das System.

**KI: minimierte Datenweitergabe, standardmäßig aus**

- Die KI-Funktion ist optional und ausgeschaltet, solange sie nicht
  ausdrücklich eingeschaltet wird. Sie entscheidet nichts und liegt
  außerhalb des finanziellen Entscheidungswegs.
- Für die optionale KI-Erklärung werden nur ausdrücklich freigegebene,
  minimierte Prüfinformationen verwendet. Dokumentbasierte Rohwerte werden
  standardmäßig nicht übertragen; KoSIT-Fehlermeldungen werden auf
  Regelcodes reduziert. Empfänger ist der Anbieter Anthropic.
- Der Grund: In einem Rechnungsfeld kann ein Name, eine Adresse oder eine
  Telefonnummer stehen, und kein Suchmuster erkennt jede solche Angabe
  zuverlässig. Deshalb gilt eine Positivliste. Gesendet wird nur, was die
  Anwendung selbst formuliert: feste Sätze, Feldnamen, Statuscodes und
  berechnete Beträge. Eine neu hinzugefügte Prüfung sendet nichts von ihren
  Belegen, bis sie in diese Liste aufgenommen ist.
- IBANs erscheinen nur gekürzt, mit den ersten und letzten vier Zeichen.
  Namen von Lieferant, Käufer oder Firma, USt-IdNr., Lieferantennummer und
  Kommentare werden nicht gesendet.
- **Die Rechnungsdatei selbst wird nie gesendet**, ebenso wenig
  Zahlungs- oder Kontoauszugsdaten.
- Genau das, was gesendet wurde, wird gespeichert. So ist später
  nachvollziehbar, welche Daten den Anbieter erreicht haben.
- Die KI-Anfrage läuft nur, wenn ein Prüfer sie ausdrücklich anstößt.
- **Lieferantenrückfrage (ADR-084):** Das Modell erhält dieselben minimierten
  Prüfinformationen und nur die Namen von Platzhaltern wie
  `{{rechnungsnummer}}`, nie deren Werte. Rechnungsnummer, Betrag,
  Bestellnummer, Lieferant und Firmenname setzt die Anwendung erst nach der
  Prüfung ein. Versendet wird nicht aus der Anwendung.

### n8n, Google Sheets und Tunnel (nur in der Demo)

Welche Daten wohin gehen, zeigt [DATENFLUSS_DE.md](DATENFLUSS_DE.md). Was das
für den Datenschutz heißt:

- **Im Google Sheet stehen keine Bankdaten.** Es hat neun Spalten: Eingang,
  Rechnungsnummer, Lieferant, Betrag, Ergebnis, Status, Grund, Invoice ID,
  Eingangskanal. Der Grund nennt eine IBAN-Abweichung als Satz, nie die IBAN.
  Das Sheet ist eine Anzeige. Verbindlich ist der Prüfpfad in der Anwendung.
- **n8n sieht mehr als das Sheet:** die ganze XML-Datei und die Antwort der
  Anwendung, also die ganze Rechnungsansicht. Darin stehen die IBAN der
  Rechnung und die hinterlegten IBANs aus der Prüfung. Je nach Einstellung der
  n8n-Instanz bleiben diese Daten in den Ausführungsdaten gespeichert; im
  Demo-Workflow ist dazu nichts abweichend eingestellt.
- **n8n meldet sich mit dem Demo-Konto der Kreditorenbuchhaltung an.** Dieses
  Konto darf mehr als hochladen, zum Beispiel Ausnahmen entscheiden. Eine
  Rolle, die nur hochladen darf, gibt es noch nicht.
- **Zugangsdaten** für Postfach, Anmeldung und Google liegen in den
  n8n-Credentials, nicht im Workflow.
- **Tunnel:** Für die Aufnahme war die lokale Anwendung über einen temporären
  Cloudflare-Tunnel aus dem Internet erreichbar, geschützt nur durch die
  Anmeldung. Der Tunnelanbieter leitet die Daten weiter.
- Alle Daten in der Demo sind synthetisch.

**Was das für ein Echtsystem heißt, besonders für Bankdaten:**

- Keine Rechnungsdaten in ein Google Sheet. Die Übersicht gehört in die
  Anwendung selbst, die Rechte und Prüfpfad hat. Wenn ein Sheet bleiben soll,
  dann nur mit Kennzahlen ohne Lieferant und Betrag. Rechnungsnummer,
  Lieferant und Betrag sind Geschäftsdaten, bei Einzelunternehmen auch
  personenbezogen. Google wäre dann Auftragsverarbeiter, mit Vertrag,
  Speicherort, Zugriffsrechten und Löschfristen.
- n8n im eigenen Netz oder in der EU betreiben, Ausführungsdaten erfolgreicher
  Läufe nicht oder nur kurz speichern, eigenes technisches Konto nur mit dem
  Recht zum Hochladen, die Antwort an n8n auf die nötigen Felder kürzen.
- Ein fester Server mit eigenem Zertifikat statt eines Tunnels.
- Die Rechte des Google-Zugangs in n8n auf das Nötige beschränken.

### Noch für die Produktion nötig

- **Rollenklärung und Verträge:** Der Kunde wäre Verantwortlicher, der
  Betreiber der Anwendung Auftragsverarbeiter, ein KI-Anbieter
  Unterauftragsverarbeiter. Dafür braucht es einen Vertrag zur
  Auftragsverarbeitung (AVV/DPA), bevor die erste echte Rechnung verarbeitet
  wird.
- **Prüfung des KI-Anbieters:** Datenverarbeitungsbedingungen,
  Speicherfristen und Speicherort beim Anbieter prüfen, bevor echte Daten
  gesendet werden – oder die Funktion ausgeschaltet lassen.
- **Aufbewahrungs- und Archivierungskonzept:** Rechnungen und Buchungsbelege
  unterliegen gesetzlichen Aufbewahrungsfristen (HGB/AO, 8 bzw. 10 Jahre).
  Dem stehen Löschpflichten nach der DSGVO gegenüber. Die Fristen sind in der
  Architektur benannt, ein Konzept dafür fehlt: Es gibt weder automatische
  Löschung nach Fristablauf noch revisionssichere Archivierung.
- **Produktionshosting und Sicherheitshärtung:** HTTPS, Backups mit
  Wiederherstellung, Geheimnisverwaltung, zentrale Protokolle mit Alarmen,
  Mehr-Faktor-Anmeldung.
- **Weitere Pflichten klären:** Rechtsgrundlagen, Verzeichnis der
  Verarbeitungstätigkeiten und eine erste Prüfung, ob eine
  Datenschutz-Folgenabschätzung nötig ist – gemeinsam mit den
  Datenschutzbeauftragten des Kunden.
- **Mitbestimmung:** Wo ein Betriebsrat besteht, hat er bei technischer
  Überwachung von Mitarbeitenden ein Mitspracherecht. Die Kennzahlen sind
  deshalb bewusst prozessbezogen; das sollte vor einem Pilot mit dem
  Betriebsrat besprochen werden.
