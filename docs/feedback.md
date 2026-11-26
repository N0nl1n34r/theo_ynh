# Privates Feedback: Betrieb und kontrollierte Übergabe

Unter Konfiguration → Feedback können angemeldete Personen online eine freiwillige Nachricht übermitteln, eigene Nachrichten anzeigen und löschen. Die Einträge liegen in `public.app_feedback` mit Konto-ID, Kategorie, Text, Ansicht und Erstellungszeit. RLS beschränkt Zugriff auf eigene Einträge; Administratoren mit privilegiertem Datenbankzugang können sie zur Bearbeitung sehen. Der Datenexport enthält Feedback, Konto-Löschung kaskadiert darauf. Nicht für sensible Gesundheitsinformationen oder Geheimnisse vorgesehen. Kein Offline-Versand, kein automatisches öffentliches Issue und kein Agent.

## Manuelle Bearbeitung

Berechtigte Admins können Nachrichten im Theo-Admin-Panel sichten, sortieren und eigene datensparsame Zusammenfassungen schreiben. Die Zusammenfassungen werden nur auf ausdrückliche Aktion zur manuellen Weitergabe kopiert. Gelöschte Nachrichten und ihre Sortierung/Zusammenfassung werden aus der Datenbank gelöscht. Vor einer Weitergabe an einen Coding-Agenten oder GitHub muss ein Mensch Inhalt und Berechtigung prüfen, Kontobezug und unnötige personenbezogene/sensible Daten entfernen und nur eine technische, minimal notwendige Aufgabenbeschreibung weitergeben; keine Rohmeldungen automatisiert veröffentlichen. Der Export, die Anzeige und das Löschen sind für Nutzer zugänglich. Regeln zur Aufbewahrungsfrist und Rechtsgrundlage müssen vor Marktstart rechtlich geprüft werden.

## Zugriffe und Funktionsfreigabe

Das Admin-Panel erhält über eng begrenzte, serverseitig autorisierte Datenbankfunktionen ausschließlich Feedback, redaktionelle Beiträge, Konto-E-Mail/Erstellungsdatum und Freigabeeinstellungen. Es besitzt keinen Endpunkt für fremde Planungsdaten; deren Row Level Security bleibt unverändert. **Dies ist keine Ende-zu-Ende-Verschlüsselung:** Supabase-Infrastrukturbetreiber bzw. Personen mit separatem privilegiertem Datenbankzugang können technisch auf Serverdaten zugreifen. Produktions-Admins benötigen ein starkes Passwort; MFA und Rechteprüfung sind vor einem öffentlichen Marktstart zu ergänzen.

Die Gruppen „Stabil“ und „Frühtester“ und individuelle Ausnahmen steuern registrierte Funktionen innerhalb derselben aktuellen App-Version. Die erste Funktion ist `authenticity`; weitere müssen von der Entwicklung registriert und im Code berücksichtigt werden. Dies sind keine vollständig getrennten Deployments und keine Vertraulichkeits- oder Bezahlschranke. Der zuletzt geladene Stand gilt offline, Änderungen wirken beim nächsten Laden/Anmelden.
