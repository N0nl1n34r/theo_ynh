# Theo als YunoHost-App 🐣

Theo auf der eigenen YunoHost-Maschine installieren — YunoHost übernimmt dabei **HTTPS-Zertifikat, Domain, Zugangsschutz (SSO) und Dienst-Verwaltung**. Theo läuft als systemd-Dienst hinter nginx; das Handy installiert Theo als PWA über echtes HTTPS.

**Voraussetzung:** YunoHost ≥ 12.1 (prüfen: `yunohost --version`).

## Installation (einmalig, ~2 Minuten)

**Weg 1 · aus einem GitHub-Repo** — der Repo-Name **muss auf `_ynh` enden** (Unterstrich: `theo_ynh`, nicht `theo-ynh` — sonst lehnt YunoHost die URL ab), und `manifest.toml` muss direkt in der Repo-Wurzel liegen:

```bash
# einmalig hochladen (vom Arbeitsrechner, aus dem entpackten theo_ynh/):
git init && git add -A && git commit -m "Theo als YunoHost-App"
git branch -M main
git remote add origin https://github.com/N0nl1n34r/theo_ynh.git
git push -u origin main

# installieren — auf der YunoHost-Maschine:
sudo yunohost app install https://github.com/N0nl1n34r/theo_ynh
# (Webadmin: Anwendungen → Installieren → Benutzerdefinierte App → dieselbe URL)
```

Später genügt für Updates ein neuer `git push` + `sudo yunohost app upgrade theo` (YunoHost merkt sich die Repo-URL). Ohne Git geht das Hochladen auch im GitHub-Webinterface („uploading an existing file") — die Ordner `scripts/` und `conf/` mithochladen, damit die Struktur stimmt.

**Weg 2 · per Datei (ohne Git/Repo):**

```bash
# vom Arbeitsrechner aus:
tar czf theo_ynh.tar.gz theo_ynh
scp theo_ynh.tar.gz ADMIN@MASCHINE:~          # ADMIN = dein YunoHost-Benutzer
ssh ADMIN@MASCHINE

# auf der Maschine:
tar xzf theo_ynh.tar.gz
sudo yunohost app install "$PWD/theo_ynh"
sudo rm -r theo_ynh theo_ynh.tar.gz           # aufräumen
```

Die Installationsfragen:

| Frage | Empfehlung |
|---|---|
| **Domain** | eigene Subdomain (z. B. `theo.deine-domain.de`, DNS-A-Record auf die Maschine, Zertifikat macht YunoHost automatisch) **oder** die Hauptdomain |
| **Pfad** | bei eigener Subdomain `/`; auf der Hauptdomain z. B. `/theo` (Theo unterstützt Unterpfade) |
| **Zugriff** | **„Alle YunoHost-Benutzer“** — Anmeldung per YunoHost-Konto/SSO, kein zweites Passwort nötig. („Besucher“ = offen im Internet → dann zwingend `THEO_AUTH` aktivieren, s. u.) |
| **Nextcloud-URL** | Basis-URL deiner Nextcloud, z. B. `https://kai.nl.tab.digital` (Ziel wird fest gepinnt) |

Danach ist Theo unter `https://<domain><pfad>/` erreichbar.

## Auf Handy & Tablet installieren (PWA)

1. `https://<domain><pfad>/` im Browser öffnen → ggf. mit YunoHost-Konto anmelden (einmalig).
2. Android/Chrome: **„App installieren“** → Theo startet standalone mit eigenem Icon. iOS/Safari: „Zum Home-Bildschirm“.
3. Offline-Start: der Service-Worker hält den letzten Stand bereit; Daten liegen im Gerätespeicher und synchronisieren, sobald Verbindung besteht.

## Update der App (immer leicht)

**Nur neue HTML-Datei** (gewöhnlicher Fall — Revisionen der App):

```bash
scp lebensrhythmus-prototyp.html ADMIN@MASCHINE:/tmp/
ssh ADMIN@MASCHINE 'sudo cp /tmp/lebensrhythmus-prototyp.html /var/www/theo/ && sudo chown theo:www-data /var/www/theo/lebensrhythmus-prototyp.html'
```

Kein Neustart nötig — der Server liest die Datei pro Anfrage, der Service-Worker ist network-first; alle Geräte bekommen die neue Version beim nächsten Laden.

**Ganze Paket-Version** (wenn auch Server oder nginx/systemd-Vorlagen geändert haben):

```bash
tar czf theo_ynh.tar.gz theo_ynh && scp theo_ynh.tar.gz ADMIN@MASCHINE:~
ssh ADMIN@MASCHINE 'tar xzf theo_ynh.tar.gz && sudo yunohost app upgrade theo -f "$PWD/theo_ynh.tar.gz" && rm -r theo_ynh theo_ynh.tar.gz'
```

## Zugangsschutz (nur bei „Besucher“-Berechtigung)

Die Empfehlung ist „Alle YunoHost-Benutzer“ — dann gate das YunoHost-SSO jeden Zugriff und nichts Weiteres ist nötig. Wird die App bewusst auf „Besucher“ gestellt, aktiviere den HTTP-Basic-Schutz des Companion-Servers: in `/etc/systemd/system/theo.service` die Zeile `#Environment=THEO_AUTH=benutzer:passwort` entkommentieren, dann `sudo systemctl daemon-reload && sudo systemctl restart theo`.

## Deinstallation & Backup

- Entfernen: `sudo yunohost app remove theo` (install_dir + System-Benutzer räumt YunoHost selbst auf).
- **Kein App-Backup nötig:** Theo speichert nichts auf dem Host — die Daten liegen im localStorage der Geräte und in der Nextcloud (Kalender + Kapsel); der Companion-Server ist zustandslos. Ein neuer Host = neue Installation, die Geräte fügen sich automatisch wieder zusammen.

## Architektur in der Maschine

```
Browser/PWA  ──HTTPS──▶  nginx (YunoHost, Zertifikat, SSO-Gate)
                          └─▶ 127.0.0.1:__PORT__  ▸ systemd-Dienst „theo“
                               ├─ App (HTML/Manifest/SW/Icon)
                               └─ CalDAV-Proxy ──▶ Nextcloud (Ziel fest gepinnt,
                                                   Credentials nur im Browser)
```
