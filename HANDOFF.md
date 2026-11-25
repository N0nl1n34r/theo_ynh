# HANDOFF — Theo (für den nächsten Agenten)

**Stand: 26. November 2026 · Revision 13b („Alpha") · Repo: https://github.com/N0nl1n34r/theo_ynh**

Dieses Dokument ist die vollständige Übergabe. Lies es ganz, bevor du etwas änderst. Es ersetzt keine Datei, sondern ordnet alle anderen.

---

## 1 · Was dieses Projekt ist

**Theo** ist eine persönliche Planungs-App für eine einzige Nutzerin/einen Nutzer (Zielgruppe AuDHS, Hochsensibilität, Belastungserfahrungen). **Kein Produktivitätstool:** keine Streaks, keine Metriken, keine Schuldmarker, ruhiges No-Shame-UX. „Lebensrhythmus" ist der Projektcodename der Konzeptpapiere; die App heißt Theo.

**Kernmodell:** Block ≠ Task ≠ Termin ≠ Phase. Wochenraster 7×3 frei belegbare Zeitfenster (`slotTimes`, Default 9–12/14–17/19–22, konfigurierbar); Aufgaben hängen beidseitig an Blöcken; Ampelsystem (rot #D96A5B / orange #E09B4C / gelb #D8B44C / grün #7CA982) ist **getrennt** von Bereichsfarben; „Plan" heißt in der UI „Erster Schritt"; überfällige Deadlines neutral formuliert; Regeneration/Import nur als Vorschlag. **Nextcloud-CalDAV ist die eine Quelle der Wahrheit** — keine Quell-Labels in der UI, fremde Elemente werden automatisch eingeordnet (scheitert nie: Stack), Zeit-Änderungen laufen als Writeback zurück (gleiche UID).

## 2 · Architektur (Invarianten — nicht brechen)

- **Single-File-App** (`lebensrhythmus-prototyp.html`, alles inline, localStorage `theo-state`) + **Companion-Server** (`theo-server.py`, reine Python-Stdlib): liefert App + PWA-Bestandteile und proxyt CalDAV (`/__dav_proxy__?url=&u=&p=`, Ziel-Pinning auf die konfigurierte Nextcloud, Credentials liegen **nur im Browser**, nichts wird persistiert). Detection: `/__theo_proxy__` → `{proxy:true,target}`.
- **Sync-Konventionen (ICS):** UIDs `theo-block|appt|mit|phase-<id>@theo-app`, `theo-todo-<id>@theo-app`, Kapsel `theo-state@theo-app`; CATEGORIES `LR-*`; X-LR-* Metadaten. **MIT/Phasen: VALUE=DATE + TRANSP:TRANSPARENT** (nicht besetzt, eigener Kalender `theo-phasen` via `cal2`). Blöcke/Termine mit Zeit → echte DTSTART/DTEND (`apTimeStr`). **DELETE/PUT-Dateinamen: VEVENTs = lokaler UID-Teil (`split('@')[0]`), VTODOs = volle UID**; PUT/DELETE immer `encodeURIComponent`.
- **Lösch-Sicherheit (Grabsteine):** Löschen markiert `S.tomb[uid.split('@')[0]]=1` (persistent, in Kapsel); Pull überspringt Grabsteine und **wiederholt das DELETE** (auch bei 403-Throttle), bis der Server die Abwesenheit bestätigt; `reconcileDeleted` iteriert `synced-keys + tomb-keys-ohne-synced`. Nie wieder Wiederbelebung.
- **Kapsel (VJOURNAL):** Motto, Eingangskiste, Bereiche, Blocktypen, Projekt-Metadaten, settings(aids/slotTimes/liveSync), mapped/ignored/tomb als JSON in `X-LR-STATE` (icsEsc). **LWW über `ts`** — **aber: Neugeräte-Schutz (R13b, wichtigster letzter Fix):** `S.meta.pulled=false` (Seed) → Gerät pullt im ersten Zyklus **zuerst**, Kapsel-PUT bleibt gesperrt bis zur ersten erfolgreichen Lesung (in `pushAll` UND im manuellen Schreiben-Knopf, der das meldet), und vor der ersten Lesung ist der **Server die Wahrheit** (Adoption ignoriert den lokal generierten `capsuleTs`). Hintergrund: `save()` stampt `capsuleTs=Date.now()` — ein frisches Gerät hat damit den „neuesten" Zeitstempel und würde LWW-technisch die volle Server-Kapsel mit der leeren plätten. Genau dieser Bug zerstörte im Alpha-Alltag Motto/Kiste/Bereiche/Typen auf einem neuen Gerät.
- **Push-Mechanik:** `save()` → `schedulePush()` (debounced 2,5 s) → `pushAll` (PUT main+phases+tds+Kapsel, `pruneSynced`, `registerSynced`). `syncCycle` (Live-Sync, Default 60 s): Proxy-Check → (dirty **und** nicht Neugerät) push → Pull-Skip bei währenddessen geänderten `capsuleTs` (Race-Guard) → `GET cal?export` (+cal2) → `importICS/processRemote/processTodos/processCapsule` → `pulled=true` → `reconcileDeleted` → `saveQuiet` → bei Dirty Nachzieh-Push im selben Zyklus.
- **PWA:** alles **relativ** (`./manifest.webmanifest`, `./sw.js`, `./theo-icon.png`, `start_url './'`) → läuft an Domain-Wurzel UND Unterpfaden. SW `theo-shell-v1` **network-first** (Update = HTML-Datei tauschen, kein Neustart). Server: `--pfad /theo` streift Basis-Pfade (YunoHost), `--auth BENUTZER:PASSWORT` / `THEO_AUTH` = HTTP-Basic für Betrieb im offenen Internet (401 + konstanter Zeitvergleich; Startwarnung bei offenem 0.0.0.0 ohne Schutz).
- **Gantt (R13):** Balkenlänge = Zeitschätzung (`Math.max(1,Math.ceil(estDays(t))||1)` Tage ab `t.start||todayISO()`); Deadline als ▼-Dreieck an `t.due` (bleibt fix, auch außerhalb des Balkens); `ganttMove` + Drag-Drop ändern **nur** `t.start`. Schätzung: PERT `(to+4tm+tp)/6` oder Einzelzahl.
- **„Wie Termin"-Blockarten (R13):** Erstell-Flow `sheetTypeAppt` (Formular `ta-title`/`ta-t0`/`ta-t1`/`ta-span`) — Uhrzeit beim Erstellen angeben; ohne Zeit gilt das Blockfenster.

## 3 · Deployment (Stand: läuft produktiv)

**Nutzer-Maschine: YunoHost 12.1.39, App installiert und funktioniert** (Installationsweg: dieses Repo). YunoHost übernimmt HTTPS, Domain, SSO-Zugangsschutz (Berechtigung „Alle Benutzer" empfohlen), systemd-Dienst `theo`, nginx-Reverse-Proxy auf `127.0.0.1:__PORT__`. App-Dateien liegen in `/var/www/theo/`.

**Packaging-Regeln (schmerzvoll gelernt):**
- Repo-Name **muss auf `_ynh` enden** (Unterstrich); `manifest.toml` in der **Repo-Wurzel**; sonst lehnt YunoHost die URL ab (Webadmin zeigt dann nur Skelett-Platzhalter — die echte Fehlermeldung kommt erst per CLI `sudo yunohost app install <url>`).
- Manifest-Schema (manifest.v2) ist **streng**: `additionalProperties:false`, Pflicht-Sektionen u. a. **`[upstream]` (mind. `license`)**. Manifest gegen das offizielle Schema validieren (JSON-Schema unter `raw.githubusercontent.com/YunoHost/apps/main/schemas/manifest.v2.schema.json`), bevor gepusht wird.
- Packaging v2 / Helfer 2.1 (`ynh_config_add_systemd`, `ynh_config_add_nginx`, `ynh_systemctl`, `ynh_app_setting_set`); `yunohost = ">= 12.1"`.
- Konfig-Dateien aus `conf/` werden im install-Skript mit `SRC="${YNH_APP_BASEDIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"` kopiert (funktioniert bei Repo- und Datei-Installation).
- **Versionsdisziplin:** jede Änderung an `conf/*` oder Vorlagen → `version` im Manifest bumpen (`~ynhN`) + Eintrag in `CHANGELOG.md` (existiert seit ynh3).

**Update-Pfade:** Schnellweg (nur App-HTML): `scp lebensrhythmus-prototyp.html ADMIN@MASCHINE:/tmp/ && ssh ADMIN@MASCHINE 'sudo cp /tmp/lebensrhythmus-prototyp.html /var/www/theo/ && sudo chown theo:www-data /var/www/theo/lebensrhythmus-prototyp.html'` — kein Neustart, network-first-SW verteilt an alle Geräte. Paketweg: Repo pushen → `sudo yunohost app upgrade theo`.

## 4 · Qualitätssicherung (Test-Suite liegt jetzt im Repo: `tests/`)

**Ablauf:** Der App-Code steckt im **größten** `<script>`-Block der HTML (es gibt mehrere!). Extrahieren, dann Driver laufen lassen:

```bash
python3 -c "import re;h=open('conf/lebensrhythmus-prototyp.html',encoding='utf-8').read();b=re.findall(r'<script>(.*?)</script>',h,re.S);open('/tmp/theo.js','w',encoding='utf-8').write(max(b,key=len))"
node --check /tmp/theo.js
for s in 7 8 9 10 11 12 13 14 15; do node tests/smoke$s.js; done
```

**Erwartung: alle grün** (smoke7: 42, smoke8: 31, smoke9: 22, smoke10: 12, smoke11: 29, smoke12: 29, smoke13: 28, smoke14: 12, smoke15: 13 Assertionen). smoke15 = Kapsel-Neugeräte-Schutz (das reale Alpha-Desaster als Test). Server: `python3 -m py_compile theo-server.py`.

**Driver-Fallstricke (gesammelt):** Stub-DOM mit `mkEl`/lazy `E()` **ohne** Auto-Create (Stub-Generierung verfälscht Reads); Sheet-Inputs vor `.value`-Setzung anlegen; `__T`-Exportliste pro Driver anpassen; Mini-DAV (`davFiles` + fetch-Mock, PUT legt ab, DELETE löscht, 30–80 ms settle für fire-and-forget); `failDelete`-Flag für 403-Simulation; gbar-Regex: `style="left:(\d+)px;width:(\d+)px;` (endet **nicht** mit `"`); Gantt-Tests brauchen `S.projects.push` + `ui.route={view:'projekt',id}` + `ui.projTab='gantt'`; Seed ist leer → Driver legen zz-Objekte an; **ältere Driver setzen `S.meta.pulled=true`** (etabliertes Gerät), nur smoke15 testet den Neugeräte-Pfad; `/tmp` ist flüchtig → `theo.js` vor jeder Validierung neu extrahieren.

## 5 · Stehende Nutzer-Vorgaben (Vertrag — nie verletzen)

CalDAV muss lesen **und** schreiben · **Live-Sync statt Klick** · Export-VEVENTs mit echten Uhrzeiten · Blockfenster konfigurierbar · fremde Kalenderelemente automatisch zuordnen · Zeit-Writeback (LR-ASSIGNED bytegleich) · Phasen: nicht busy, zweiter Kalender · Kanban: 5 Spalten (inkl. Pending (delegiert) + Backlog), mit Liste|Kanban|Gantt gekoppelt · Eingangskiste: Umwandlung als Editor-Fenster, Filterknöpfe dunkel markiert · Gantt: PERT oder Einzelzahl · **keine Demo-Daten** (nur anzeigen, was wirklich synchronisiert wird) · To-dos per VTODO, Kapsel per VJOURNAL · MIT transparent · Zuordnung scheitert nie (Stack) · Nextcloud überall Quelle, keine Quell-Labels · fremde Termine löschbar (inkl. Kalenderobjekt) · Lösch-Sync beidseitig, nie Wiederbelebung (Grabsteine) · „🗑 Löschen"-Label · Edits pushen direkt (debounced) · Leiste = angezeigter Tag · Ampel = Formularfeld · Termin-Titel editierbar · „wie Termin"-Blöcke bei „Termine" · überlappende Phasen „ | "-getrennt · Wochensprung per Monatswahl · „Wie Termine" beim Erstellen mit Uhrzeit · Gantt-Balken = Estimate, Deadline als Dreieck · Alpha = gut genug für produktives Testen · **läuft auf Laptop/Tablet/Smartphone, Host ist NICHT der Laptop** (Nutzer: „unabhängig vom Laptop, sonst ergibt es keinen Sinn") · Updates müssen leicht sein · 403-Kontext: App-Passwort zwingend, Brute-Force-Sperre 15–30 min abwarten · Anstehend-Liste = nur `due && !done && !delegated && !planned` · „Plan" heißt „Erster Schritt" · To-dos beim Bereichslöschen nie still verlieren · überfällige Deadlines neutral · Regeneration nur Vorschlag · funktionierende Interaktionen (kein Mockup).

## 6 · Bekannte Grenzen & offene Punkte

1. **Kapsel-Wiederherstellung: Status offen.** Der R13b-Bug plättete auf dem YunoHost-Gerät Kapsel-Inhalte (Motto/Kiste/Bereiche/Typen). Fix ist ausgerollt (Workspace + Paket); der Nutzer sollte bestätigen, dass die Wiederherstellung (Quellgerät pushen lassen, dann Update einspielen) geklappt hat. **Erste Frage an den Nutzer beim Übernehmen.**
2. Keine Wiederholungs-Termine (RRULE); Konfliktfall = LWW pro Objekt, kein Merging; iOS-Quirk: Safari-PWA kann bei `--auth` wiederholt nach Passwort fragen (bei YunoHost-SSO irrelevant).
3. APK nur optional via TWA (PWABuilder/Bubblewrap) mit HTTPS — PWA bleibt der Verpackungsweg.
4. YunoHost-Autoupdate (autoupdate-strategy) nicht eingerichtet — bewusst, Updates steuert der Nutzer.
5. Kleinigkeit akzeptiert: `fbSet`(Block) könnte ungespeicherten `b-fbnote` verlieren.
6. Konzept-/Forschungsdokumente (Dossier, Produktkonzept §1–28, Fahrplan) liegen **nicht** im Repo — nur im Arbeitsstand der vorherigen Sitzung. Falls der Nutzer sie dem Repo hinzufügen will: `docs/` vorschlagen, aber **Privacy abwägen** (öffentliches Repo, persönliche Kontexte). Wenn ein Dokument im Gespräch zitiert wird, gilt: Inhalt aus dem Gespräch/Dossier rekonstruieren, nicht erfinden.

## 7 · Nächste Schritte (geordnet)

1. **Repo-Sync prüfen:** Vergleiche `conf/lebensrhythmus-prototyp.html` im Repo mit dem Arbeitsstand — Marker für R13b: String `Neugeräte-Schutz` (2×) in der HTML. Fehlt er: Arbeitsstand pushen (dieser Stand hier im Paket ist aktuell: R13b-HTML, Manifest `0.13~ynh3`, `tests/`, `HANDOFF.md`, `CHANGELOG.md`).
2. Nutzer fragen: Kapsel-Wiederherstellung erfolgreich? (sonst gemeinsames Wiederaufbauen: Blöcke/Termine/MIT/Phasen/To-dos kommen aus dem Kalender zurück, Standard-Blocktypen baut der Seed, nur Motto/Kiste/Bereiche/eigene Typen neu anlegen).
3. Danach: Feature-Wünsche abwarten. Bei jeder Änderung: Smokes grün → Manifest-Bump → CHANGELOG → (Schnellweg oder Paketweg) deployen.
4. Ideen-Pool (nicht begonnen): RRULE-Leichtvariante („wöchentlich wiederholen"), konfliktarmes Merging (Feld-Level für Kapsel), YunoHost-Backup-Hook (zustandslos — aktuell bewusst keiner), TWA-APK-Rezept dokumentieren.

## 8 · Arbeitsweise, die sich bewährt hat

Klein schreiben, nach jedem Batch verifizieren, dass jeder Edit gelandet ist (grep den aktuellen Text **vor** dem Edit — exakte Matches sonst fail). Deutsch mit dem Nutzer. Kein Risiko ohne Test: erst Smoke-Driver, dann deploy. Der Nutzer testet am echten Nextcloud-Konto (kai.nl.tab.digital) — Fehlerberichte aus dem Alltag sind Gold und Priorität 1 (der Kapsel-Bug kam so).
