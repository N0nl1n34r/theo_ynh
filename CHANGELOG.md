# CHANGELOG — theo_ynh

- **0.13~ynh3** (26.11.2026) — App-HTML: **Hotfix Kapsel-Sync für Neugeräte** („Motto/Eingangskiste/Bereiche/Blocktypen kamen nicht an"): Pull-zuerst im Erstverbinden-Zyklus, Kapsel-PUT-Sperre bis zur ersten Lesung (`S.meta.pulled`), Server-Wahrheit vor erster Lesung bei der Kapsel-Adoption; Nachzieh-Push im selben Zyklus. `tests/` (9 Smoke-Driver, R7–R13b) und `HANDOFF.md` aufgenommen.
- **0.13~ynh2** (26.11.2026) — `manifest.toml`: Pflicht-Sektion `[upstream]` ergänzt (Schema-Validierung ohne sie schlägt fehl → leere Webadmin-Installationsseite).
- **0.13~ynh1** (26.11.2026) — Erste Paketierung: Companion-Server (App + PWA + CalDAV-Proxy mit Ziel-Pinning, optionalem `--auth`/`THEO_AUTH` und `--pfad`) als systemd-Dienst hinter nginx; Installationsfragen Domain/Pfad/Berechtigung/Nextcloud-URL.
