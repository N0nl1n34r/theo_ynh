# Psychoedukation: Redaktion und Ausbau

Die mitgelieferten Inhalte liegen in `app/education.js` und werden offline zwischengespeichert. Das Admin-Panel bietet zusätzlich Entwürfe und explizite Veröffentlichung ohne App-Deployment; veröffentlichte Fassungen ergänzen bzw. überschreiben die mitgelieferten Inhalte nach stabiler ID und werden für Offline-Zugriff zwischengespeichert. App-Daten der Nutzer werden dadurch nicht verändert. Neue Code-Funktionen und mitgelieferte Inhalte benötigen weiterhin ein Deployment.

## Inhalte bearbeiten

Einen vorhandenen Datensatz bearbeiten, kopieren oder entfernen. `id` ist ein stabiler, eindeutiger Schlüssel (Kleinbuchstaben und Bindestriche): Beim Entfernen oder Umbenennen bleiben bestehende Verknüpfungen und Fortschrittsmarkierungen auf die alte ID bezogen. `title`, `category`, `minutes`, `summary`, `takeaway`, `paragraphs` und `practice` enthalten Klartext, kein HTML. Mit `actions` kann auf `woche`, `jahr`, `eingang` oder `bereiche` verlinkt werden. Unter `sources` geprüfte HTTPS-Quellen mit verständlichem Titel angeben. Kurze, konkrete Aussagen und Unterschiede zwischen Menschen betonen; keine Diagnosen oder Heilversprechen.

`resources` ist für optionale externe Artikel, Videos oder Produkte vorgesehen, z. B. `{label:'Titel · Video', url:'https://…', description:'Dauer, Sprache und Untertitel', affiliate:false}`. Keine Platzhalter- oder erfundenen Partnerlinks veröffentlichen. Bei einem echten Affiliate-Link `affiliate:true` setzen: er wird ausdrücklich als Werbung / Affiliate-Link und mit `rel="sponsored"` gekennzeichnet. Preise, Partnerbeziehungen, Kennzeichnungspflichten und redaktionelle Unabhängigkeit vor Veröffentlichung prüfen. Externe Medien werden nicht automatisch eingebettet oder abgespielt und benötigen Internet.

Änderungen fachlich und möglichst von AuDHS-Betroffenen prüfen lassen, Quellen und Aktualität prüfen, dann `npm test` und `npm run build` ausführen und veröffentlichen. Die aktuellen Texte sind ein erster allgemeiner Entwurf, keine fachärztlich geprüfte Patienteninformation.

## Recherche und Gestaltung

- [NICE CG142 Autismus im Erwachsenenalter](https://www.nice.org.uk/guidance/cg142/chapter/Recommendations): individuelle Kommunikation, Selbstbestimmung, verschiedene Formate und Anpassung der Umgebung.
- [NICE NG87 ADHS](https://www.nice.org.uk/guidance/ng87/chapter/Recommendations): zugängliche, individuelle Informationen und Unterstützung; gleichzeitiges Auftreten anderer neuroentwicklungsbedingter Besonderheiten berücksichtigen.
- [Leeds Autism AIM / Advonet: Making information accessible](https://www.wypartnership.co.uk/application/files/3716/4735/6437/making-information-accessible-for-neurodivergent-people-final-v2-20.04.21.pdf): kurze Sätze und Absätze, klare Sprache, verschiedene Bedürfnisse. Von neurodivergenten Beteiligten erstellt.
- [Strömberg et al. 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC8992902/): kleine Befragungsstudie zu Reizbelastung und Kommunikationsbarrieren in der Versorgung; nicht als allgemeiner Wirksamkeitsnachweis für Produkte verstehen.

Daraus abgeleitet: kurze Themen mit Lesezeit und Zusammenfassung, freiwillige Übungen, klare Quellen und kein Autoplay. Verschiedene Formate und Nutzerbedürfnisse bleiben ein Ausbauziel; bisher sind die drei Startbeiträge Text, keine Audio- oder Videoeigenerstellung. Die Gestaltung ersetzt keine Tests mit der Zielgruppe.

## Nutzung: Fortschritt und Zeit einplanen

Auf einer Themenkarte oder im Artikel öffnet „Zeit dafür einplanen“ einen mit dem Artikel verknüpften Termin-Editor. Datum und Uhrzeit können verändert werden; erst „Eintragen“ erstellt einen echten Termin. Im Termin lässt sich der Artikel öffnen. Das Erledigt-Häkchen ist freiwillig und rückgängig zu machen; es misst nur selbst markierte Artikel, nicht Lesezeit oder Lernerfolg. Wissen kann im Modul ausgeblendet und unter Konfiguration → Module wieder eingeblendet werden; Markierungen und Termine bleiben erhalten. Markierungen und Sichtbarkeit werden in der synchronisierten Theo-Kapsel gespeichert und unterliegen deren Last-Write-Wins-Konfliktverhalten. Artikel-IDs stabil halten: sie sind Schlüssel für Fortschritt und Terminverknüpfung. Entfernte Artikel bleiben als nicht verfügbar gekennzeichnet.

## Medien und Redaktion

Externe Videos, Podcasts, Audios und andere Inhalte lassen sich heute über `resources` als HTTPS-Link ergänzen, einschließlich Format, Sprache, Laufzeit, Untertiteln/Transkript und Hinweis auf den externen Anbieter. Links öffnen erst auf Nutzungsentscheidung; der Anbieter kann dabei Daten erhalten und ist für Verfügbarkeit zuständig. Die App bettet Medien derzeit **nicht** ein und lädt sie nicht offline vor. Selbst gehostete Medien, Einbettung, Transkripte und ein Redaktionssystem müssten separat entwickelt und datenschutzrechtlich sowie lizenzrechtlich geprüft werden. Im Admin-Panel können Titel, Absätze, Quellen und HTTPS-Medienlinks gepflegt, als Entwurf gespeichert und ausdrücklich veröffentlicht werden. Affiliate-Kennzeichnung wird für unveränderte Links beibehalten; neue Affiliate-Links vorerst über die Datei mit `affiliate:true` eintragen. Vor jeder Veröffentlichung die fachliche Prüfung durchführen.

## Drei freiwillige Schritte

Die Beiträge „Erkenne dich selbst“, „Steh zu dir selbst“ und „Sei ganz du selbst“ sind offene Selbstreflexion, keine medizinische Behandlung oder starre Reihenfolge. Offenlegung und Anpassung sind individuelle Entscheidungen; Sicherheit und Umfeld zählen. Sie werden über die Funktion `authenticity` freigegeben.
