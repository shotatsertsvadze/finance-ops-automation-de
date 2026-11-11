Betreff: Projektsteckbrief Abschlussprojekt – Finance Operations Automation
An: bastian.siedenburg@skillsprinters.de

Hallo Bastian,

anbei mein Projektsteckbrief zum Abschlussprojekt.

1. Firma
Nordwerk GmbH, ein fiktiver Mittelständler und keine Firma aus dem Pool. Begründung: Ich habe in den Operations eines FinTech-Unternehmens gearbeitet (Pfändungen, behördliche Auskunftsersuchen) und dort erlebt, wie viele wiederkehrende Arbeitsschritte von Hand laufen. Dasselbe Grundmuster steckt im Rechnungseingang: Dokument kommt an, Daten werden abgeglichen, Regeln angewendet, ein Mensch entscheidet bei Abweichungen. Mit einer fiktiven Firma und synthetischen E-Rechnungen kann ich den ganzen Ablauf vorführen, ohne echte Kunden- oder Kontodaten.

2. Auftraggeber
Die Leitung Finanzen der Nordwerk GmbH (fiktiv). Sie entscheidet über die Einführung und bewertet das Projekt. Nutzer im Alltag ist Jonas Weber aus dem Finance-Team.

3. Geschäftsproblem
Nordwerk erhält rund 2.000 Eingangsrechnungen im Monat (Annahme). Jede wird von Hand abgelegt, abgetippt, mit Lieferant, Bestellung und Bankverbindung verglichen und zur Freigabe per Mail nachverfolgt, laut Modellrechnung rund 327 Arbeitsstunden im Monat. Weil die IBAN nur mit dem Auge geprüft wird, kann eine echt aussehende Rechnung mit fremdem Konto unbemerkt bezahlt werden, ein bekanntes Muster beim Rechnungsbetrug. Seit 2025 kommen Rechnungen zunehmend als strukturierte E-Rechnung an, doch der manuelle Prozess nutzt diese Struktur nicht.

4. Vorhaben
Ich baue eine Anwendung, die XRechnungen per E-Mail (über n8n) oder per Upload annimmt, gegen Stammdaten, Bestellungen und feste Geschäftsregeln prüft und jede Rechnung einordnet: automatisch freigeben, zur Freigabe oder mit Grund zur Prüfung. Bei Ausnahmen sieht das Finance-Team den Grund, den Beleg und den nächsten Schritt. Eine neue Bankverbindung braucht Vorschlag, Rückruf und Freigabe durch drei verschiedene Personen. Jede Entscheidung wird im Verlauf protokolliert und von n8n zusätzlich in ein Google Sheet geschrieben.

5. Erfolgskriterien
- Der manuelle Aufwand im Rechnungseingang sinkt von rund 327 auf rund 80 Stunden im Monat (Modellrechnung für 2.000 Rechnungen im Monat, im Pilot zu messen).
- Mindestens 8 von 10 Rechnungen laufen ohne manuelle Sachprüfung durch. Jede Ausnahme kommt mit Grund und Beleg zur Prüfung.
- 100 % der Rechnungen mit abweichender IBAN werden vor der Zahlung gestoppt. Keine Bankverbindung ändert sich ohne Rückruf und Freigabe durch eine weitere Person.

6. Out-of-Scope
- Echte Zahlungen und Bankanbindung: Zahlungen sind simuliert, Kontoauszüge kommen als Import.
- Anbindung an Buchhaltung oder ERP, etwa DATEV: Buchungssätze gibt es nur als CSV-Export.
- Papier- und PDF-Rechnungen mit Texterkennung: nur strukturierte E-Rechnungen (XRechnung).

7. Pflichtbausteine-Hypothese
Tragend:
- M02 Prozessaufnahme und Modellierung (Ist- und Soll-Prozess Rechnungseingang)
- M03 Prozessanalyse und Effizienz (Modellrechnung Aufwand)
- M05 Werkzeuge für Automatisierung (n8n, Google Sheets)
- M07 Intelligente Dokumentenverarbeitung (strukturierte E-Rechnung, Prüfung)
- M11 Projektmanagement und Sicherheit (Rollen, Mehr-Augen-Prinzip, Bankdatenschutz)

Ergänzend:
- M04 Prozessautomatisierung mit KI (Regeln entscheiden, KI erklärt nur optional)
- M09 Daten und Dashboards (Kennzahlen)
- M12 Datenschutz und KI-Recht (synthetische Daten, KI ohne Entscheidungsbefugnis)

Viele Grüße
Shota
