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
  },
  {
    id:'selbst-erkennen', title:'Erkenne dich selbst', category:'Authentizität · 1', minutes:3, feature:'authenticity',
    summary:'Entdecke neugierig, was dir guttut, was Kraft kostet und was dir wichtig ist.',
    takeaway:'Selbsterkenntnis ist eine offene Erkundung – kein Test, den du bestehen musst.',
    paragraphs:[
      'Vielleicht merkst du erst nach einem Termin, wie viel Energie er gebraucht hat. Oder du bemerkst, dass ein bestimmter Ort dir Ruhe gibt. Solche Beobachtungen dürfen klein und unvollständig sein.',
      'Deine Bedürfnisse und Interessen können sich verändern. Du musst sie weder sofort erklären noch aus einzelnen Beobachtungen eine Diagnose ableiten.',
      'Du kannst auf Reize, Energie, Freude, Grenzen und Werte achten. Entscheide selbst, ob du etwas notierst oder einfach wahrnimmst.'
    ],
    practice:'Wenn du magst: Was hat mir heute Kraft gegeben – und was hat Kraft gekostet? Ein Wort oder keine Antwort ist genug.',
    actions:[{label:'Einen Gedanken festhalten',view:'eingang'},{label:'Meine Woche ansehen',view:'woche'}],
    sources:[{label:'NICE: Autismus im Erwachsenenalter – individuelle Bedürfnisse (Englisch)',url:'https://www.nice.org.uk/guidance/cg142/chapter/Recommendations'},{label:'NICE: ADHS – Information und Unterstützung (Englisch)',url:'https://www.nice.org.uk/guidance/ng87/chapter/Recommendations'}],resources:[]
  },
  {
    id:'zu-dir-stehen', title:'Steh zu dir selbst', category:'Authentizität · 2', minutes:3, feature:'authenticity',
    summary:'Erkunde, wie du deine Bedürfnisse ernst nehmen und Grenzen in deinem Tempo ausdrücken kannst.',
    takeaway:'Zu dir zu stehen bedeutet nicht, dich überall erklären oder offenlegen zu müssen.',
    paragraphs:[
      'Ein Bedürfnis ernst zu nehmen kann bedeuten, eine Pause einzuplanen, eine Bitte zu formulieren oder eine Grenze zunächst nur für dich zu bemerken.',
      'Offenheit kann hilfreich sein, aber sie ist keine Pflicht. Wie viel du wem erzählst, entscheidest du selbst – auch Sicherheit und Abhängigkeiten am Arbeitsplatz oder zuhause spielen eine Rolle.',
      'Du darfst verschiedene Wege ausprobieren und deine Entscheidung ändern. Unterstützung von vertrauten Menschen oder Fachpersonen kann dabei helfen.'
    ],
    practice:'Wenn du magst: Gibt es eine kleine Bitte, die sich für dich sicher genug anfühlt? Vielleicht zunächst nur als Entwurf.',
    actions:[{label:'Einen Gedanken festhalten',view:'eingang'}],
    sources:[{label:'NICE: Autismus – Selbstbestimmung und Unterstützung (Englisch)',url:'https://www.nice.org.uk/guidance/cg142/chapter/Recommendations'}],resources:[]
  },
  {
    id:'du-selbst-sein', title:'Sei ganz du selbst', category:'Authentizität · 3', minutes:3, feature:'authenticity',
    summary:'Finde deine eigenen Möglichkeiten, Interessen und Bedürfnisse im Alltag zu leben.',
    takeaway:'Du musst dich nicht ständig gleich zeigen. Authentizität ist kein weiterer Leistungsanspruch.',
    paragraphs:[
      'Vielleicht fühlt sich Echtheit in einer Situation nach einem klaren Nein an, in einer anderen nach Rückzug oder nach Begeisterung für ein Interesse. Beides darf sein.',
      'Sich anzupassen kann eine bewusste Entscheidung oder eine Schutzstrategie sein. Du musst keine Maske ablegen, wenn sich das unsicher anfühlt.',
      'Diese drei Schritte sind eine freiwillige Orientierung, keine Diagnose und keine feste Reihenfolge. Du darfst zurückgehen, etwas überspringen oder ganz anders vorgehen.'
    ],
    practice:'Wenn du magst: Welche kleine Sache fühlt sich nach dir an, und wo könnte sie heute Platz finden?',
    actions:[{label:'Zeit dafür in der Woche finden',view:'woche'}],
    sources:[{label:'NICE: Autismus – Wünsche und individuelle Ziele (Englisch)',url:'https://www.nice.org.uk/guidance/cg142/chapter/Recommendations'}],resources:[]
  }
];
