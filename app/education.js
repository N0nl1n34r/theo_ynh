/* Redaktion: stabile IDs behalten; Anleitung und Quellenprüfung in docs/psychoedukation.md.
   Nur veröffentlichte, geprüfte Inhalte eintragen. Keine HTML-Tags; Texte werden escaped. */
globalThis.THEO_EDUCATION = [
  {
    id: 'erstgespraech', title: 'Erstgespräch mit deinem Gehirn', category: 'Ankommen', minutes: 2,
    summary: 'Du musst dich hier nicht beweisen. Wir beginnen mit dem, was dir im Alltag auffällt.',
    takeaway: 'Deine Erfahrungen sind ein guter Ausgangspunkt – keine Prüfung und keine Diagnose.',
    paragraphs: [
      'Vielleicht verstehst du gerade erst, warum manche Dinge viel Kraft kosten. Vielleicht kennst du deine Muster schon länger. Beides ist okay.',
      'ADHS und Autismus können gemeinsam auftreten. Wie sie sich zeigen, ist individuell. Ein einzelnes Merkmal beweist keine Diagnose.',
      'Du kannst ein Thema auswählen, eine Pause machen oder direkt planen. Nichts davon ist Pflicht.'
    ],
    practice: 'Wenn du magst: Was war heute anstrengend – und was hat geholfen? Ein Stichwort reicht.',
    actions: [{label:'Gedanken in der Eingangskiste ablegen',view:'eingang'},{label:'Zur Wochenansicht',view:'woche'}],
    sources: [{label:'NICE: ADHS – Leitlinie (Englisch)',url:'https://www.nice.org.uk/guidance/ng87/chapter/Recommendations'},{label:'NICE: Autismus im Erwachsenenalter (Englisch)',url:'https://www.nice.org.uk/guidance/cg142/chapter/Recommendations'}], resources: []
  },
  {
    id: 'reize', title: 'Wenn Reize zu viel werden', category: 'Reize & Umgebung', minutes: 3,
    summary: 'Geräusche, Licht oder Nähe können viel Kraft kosten. Was angenehm ist, unterscheidet sich von Person zu Person.',
    takeaway: 'Du darfst deine Umgebung anpassen und ausprobieren, was dir hilft.',
    paragraphs: [
      'Manche Menschen reagieren empfindlich auf Geräusche, Licht, Berührung oder viele gleichzeitige Eindrücke. Andere suchen bestimmte Reize. Beides kann sich je nach Situation ändern.',
      'Wenn gerade zu viel ankommt, kann eine Pause oder ein ruhigerer Ort hilfreich sein. Ohrstöpsel, Kopfhörer oder Bewegung sind mögliche Hilfen – keine Pflicht und keine Behandlung.',
      'Achte beim Dämpfen von Geräuschen darauf, wichtige Warnsignale und den Verkehr weiterhin wahrzunehmen.'
    ],
    practice: 'Welche Reize sind gerade da? Wähle, wenn möglich, eine kleine Veränderung – etwa leiser, dunkler oder mehr Abstand.',
    actions: [{label:'Erholungszeit in der Woche ansehen',view:'woche'},{label:'Eine Idee in der Eingangskiste ablegen',view:'eingang'}],
    sources: [{label:'NICE: Umgebung und sensorische Bedürfnisse (Englisch)',url:'https://www.nice.org.uk/guidance/cg142/chapter/Recommendations#general-principles-of-care'},{label:'Studie: Reize und Kommunikation im Gesundheitswesen (Englisch)',url:'https://pmc.ncbi.nlm.nih.gov/articles/PMC8992902/'}], resources: []
  },
  {
    id: 'energie', title: 'Energie und Übergänge', category: 'Alltag & Planung', minutes: 3,
    summary: 'Termine, Wechsel und Erholung können unterschiedlich viel Energie brauchen. Deine Einschätzung zählt.',
    takeaway: 'Die Ampel ist eine persönliche Orientierung, keine Messung deiner Gesundheit.',
    paragraphs: [
      'Ein Termin kann wegen Vorbereitung, Anreise oder vieler Eindrücke mehr Kraft kosten als seine Dauer vermuten lässt. Das ist nicht bei allen Menschen gleich.',
      'In Theo kannst du selbst eine Energie-Ampel setzen: Rot und Orange für intensive Dinge, Grün für Erholung. Auch ohne Farbe darf ein Eintrag wichtig sein.',
      'Vielleicht hilft ein freier Übergang vor oder nach einem Termin. Wenn nicht, darfst du etwas anderes ausprobieren.'
    ],
    practice: 'Schau auf einen kommenden Termin: Brauchst du davor oder danach etwas Freiraum?',
    actions: [{label:'Woche und Energie-Ampel öffnen',view:'woche'},{label:'Jahresübersicht ansehen',view:'jahr'}],
    sources: [{label:'NICE: ADHS – Unterstützung und Umweltanpassungen (Englisch)',url:'https://www.nice.org.uk/guidance/ng87/chapter/Recommendations'},{label:'NICE: Autismus – individuelle Umgebung und Pausen (Englisch)',url:'https://www.nice.org.uk/guidance/cg142/chapter/Recommendations#general-principles-of-care'}], resources: []
  }
];
