# Psychoedukation: Redaktion und Ausbau

Die Inhalte liegen als gut lesbare Datensätze in `app/education.js` und werden mit der App ausgeliefert und offline zwischengespeichert. Änderungen benötigen zurzeit eine Veröffentlichung; es gibt noch kein browserbasiertes Redaktionssystem. App-Daten der Nutzer werden dadurch nicht verändert.

## Inhalte bearbeiten

Einen vorhandenen Datensatz bearbeiten, kopieren oder entfernen. `id` ist ein stabiler, eindeutiger Schlüssel (Kleinbuchstaben und Bindestriche): Beim Umbenennen oder Entfernen auch Verweise in der Wochenansicht (`openEducation`) prüfen. `title`, `category`, `minutes`, `summary`, `takeaway`, `paragraphs` und `practice` enthalten Klartext, kein HTML. Mit `actions` kann auf `woche`, `jahr`, `eingang` oder `bereiche` verlinkt werden. Unter `sources` geprüfte HTTPS-Quellen mit verständlichem Titel angeben. Kurze, konkrete Aussagen und Unterschiede zwischen Menschen betonen; keine Diagnosen oder Heilversprechen.

`resources` ist für optionale externe Artikel, Videos oder Produkte vorgesehen, z. B. `{label:'Titel · Video', url:'https://…', description:'Dauer, Sprache und Untertitel', affiliate:false}`. Keine Platzhalter- oder erfundenen Partnerlinks veröffentlichen. Bei einem echten Affiliate-Link `affiliate:true` setzen: er wird ausdrücklich als Werbung / Affiliate-Link und mit `rel="sponsored"` gekennzeichnet. Preise, Partnerbeziehungen, Kennzeichnungspflichten und redaktionelle Unabhängigkeit vor Veröffentlichung prüfen. Externe Medien werden nicht automatisch eingebettet oder abgespielt und benötigen Internet.

Änderungen fachlich und möglichst von AuDHS-Betroffenen prüfen lassen, Quellen und Aktualität prüfen, dann `npm test` und `npm run build` ausführen und veröffentlichen. Die aktuellen Texte sind ein erster allgemeiner Entwurf, keine fachärztlich geprüfte Patienteninformation.

## Recherche und Gestaltung

- [NICE CG142 Autismus im Erwachsenenalter](https://www.nice.org.uk/guidance/cg142/chapter/Recommendations): individuelle Kommunikation, Selbstbestimmung, verschiedene Formate und Anpassung der Umgebung.
- [NICE NG87 ADHS](https://www.nice.org.uk/guidance/ng87/chapter/Recommendations): zugängliche, individuelle Informationen und Unterstützung; gleichzeitiges Auftreten anderer neuroentwicklungsbedingter Besonderheiten berücksichtigen.
- [Leeds Autism AIM / Advonet: Making information accessible](https://www.wypartnership.co.uk/application/files/3716/4735/6437/making-information-accessible-for-neurodivergent-people-final-v2-20.04.21.pdf): kurze Sätze und Absätze, klare Sprache, verschiedene Bedürfnisse. Von neurodivergenten Beteiligten erstellt.
- [Strömberg et al. 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC8992902/): kleine Befragungsstudie zu Reizbelastung und Kommunikationsbarrieren in der Versorgung; nicht als allgemeiner Wirksamkeitsnachweis für Produkte verstehen.

Daraus abgeleitet: kurze Themen mit Lesezeit und Zusammenfassung, freiwillige Übungen, klare Quellen und kein Autoplay. Verschiedene Formate und Nutzerbedürfnisse bleiben ein Ausbauziel; bisher sind die drei Startbeiträge Text, keine Audio- oder Videoeigenerstellung. Die Gestaltung ersetzt keine Tests mit der Zielgruppe.
