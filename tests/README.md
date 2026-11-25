# Smoke-Tests (Regression)

Standalone-Node-Driver gegen den größten `<script>`-Block der App-HTML. Kein Browser nötig (Stub-DOM + Mini-DAV/fetch-Mock).

```bash
# 1) App-Code extrahieren (es gibt mehrere Script-Blöcke — nimm den größten!):
python3 -c "import re;h=open('../conf/lebensrhythmus-prototyp.html',encoding='utf-8').read();b=re.findall(r'<script>(.*?)</script>',h,re.S);open('/tmp/theo.js','w',encoding='utf-8').write(max(b,key=len))"
node --check /tmp/theo.js

# 2) alle Driver:
for s in 7 8 9 10 11 12 13 14 15; do node smoke$s.js; done
```

**Erwartung: alle grün.** Inhalte:

| Driver | Revision | Thema (Assertionen) |
|---|---|---|
| smoke7 | R7 | Kanban/PERT/Gantt-Basis/Zuordnung (42) |
| smoke8 | R8 | VTODO/Kapsel/leerer Start (31) |
| smoke9 | R9 | MIT transparent, Agenda-Chip, Writeback bytegleich (22) |
| smoke10 | R10-Hotfix | cal2 auf Zyklus-Ebene (12) |
| smoke11 | R10 | UID-Registry, Lösch-Sync, ☑️-Blöcke (29) |
| smoke12 | R11 | Direkt-Push, Race-Guard, „🗑 Löschen", Ampel-Draft (29) |
| smoke13 | R12 | asAppt-Zeiten, Phasen „ | ", Wochensprung, Grabsteine, Gantt-Reparatur (28) |
| smoke14 | R13 | asAppt-Erstell-Flow mit Uhrzeit, Gantt-Balken = Estimate (12) |
| smoke15 | R13b | **Kapsel-Neugeräte-Schutz**: Adoption trotz lokalem ts, kein Kapsel-PUT vor erstem Lesen, Konvergenz, Legacy unverändert (13) |

Driver-Konventionen/Fallstricke: siehe HANDOFF.md §4. `/tmp` ist flüchtig — vor jeder Validierung neu extrahieren. Ältere Driver setzen `S.meta.pulled=true` (etabliertes Gerät); nur smoke15 deckt den Neugeräte-Pfad ab.
