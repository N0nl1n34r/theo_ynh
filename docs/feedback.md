# Privates Feedback: Betrieb und kontrollierte Übergabe

Unter Konfiguration → Feedback können angemeldete Personen online eine freiwillige Nachricht übermitteln, eigene Nachrichten anzeigen und löschen. Die Einträge liegen in `public.app_feedback` mit Konto-ID, Kategorie, Text, Ansicht und Erstellungszeit. RLS beschränkt Zugriff auf eigene Einträge; Administratoren mit privilegiertem Datenbankzugang können sie zur Bearbeitung sehen. Der Datenexport enthält Feedback, Konto-Löschung kaskadiert darauf. Nicht für sensible Gesundheitsinformationen oder Geheimnisse vorgesehen. Kein Offline-Versand, kein automatisches öffentliches Issue und kein Agent.

## Manuelle Bearbeitung

Berechtigte Betreiber können Nachrichten über das Supabase-Dashboard in der Frankfurt-Datenbank sichten und in der App gelöschte Nachrichten sind nicht mehr in der Tabelle. Vor einer Weitergabe an einen Coding-Agenten oder GitHub muss ein Mensch Inhalt und Berechtigung prüfen, Kontobezug und unnötige personenbezogene/sensible Daten entfernen und nur eine technische, minimal notwendige Aufgabenbeschreibung weitergeben; keine Rohmeldungen automatisiert veröffentlichen. Der Export, die Anzeige und das Löschen sind für Nutzer zugänglich. Regeln zur Aufbewahrungsfrist und Rechtsgrundlage müssen vor Marktstart rechtlich geprüft werden.
