# Theo 🐣

Theo ist ein Werkzeug zur persönlichen Selbstorganisation im Alltag und ersetzt **keine** ärztliche oder psychotherapeutische Diagnose, Beratung oder Behandlung.

Es gibt zwei Betriebsarten:

| Variante | Wohin | Für wen |
|---|---|---|
| **Theo Beta** (Supabase + Vercel, Frankfurt `eu-central-1`) | [theo.example → Vercel `fra1`] | Öffentlicher Prototyp mit lokaler Demo; Konten in geschlossener Beta, Passwort- oder optional Magic-Link-Login und serverbasierter Sync |
| **Theo als YunoHost-App** (Alpha, Nextcloud/CalDAV) | eigene YunoHost-Maschine | Selbsthosting mit eigener Nextcloud |

---

## Theo Beta — Deployment (closed Beta)

Die Beta ist für **Vercel (`fra1`)** und **Supabase (`eu-central-1`, Frankfurt)** vorbereitet. Das Live-Deployment und die tatsächlichen Netzwerkverbindungen müssen vor der Freigabe geprüft werden. Für den produktiven Betrieb sind außerdem Mailversand und die rechtlichen Angaben einzurichten und zu prüfen.

### Aktueller Prototyp und offene Punkte

- Die Demo ist ohne Konto zugänglich. Die freiwillige Auswahl personalisiert den Einstieg und die Modulübersicht; sie ist nicht mit einer Warteliste verknüpft. Das frühere Wartelistenformular ist ausgeblendet. Mailanbindung und Warteliste kommen später.
- Wochenübersicht, Eingangskiste und Lebensbereiche sind vorhanden; Werte, Psychoedukation, Reflexion samt späteren Auswertungen, Übergänge und Social Accountability sind zunächst als Ideen markiert, nicht als fertige Funktionen. Fünf Farbschemata einschließlich Nachtmodus sind auswählbar. Neue Schemafarben für Bereiche und Phasen folgen dem aktiven Schema; eigene und bereits vorhandene Farben ohne Herkunft bleiben unverändert.
- Bestehende Konten können sich mit E-Mail und Passwort anmelden; nach einem erfolgreichen Login lässt sich das Passwort in der Konfiguration ändern. Die Registrierung mit Einladung und der optionale Magic Link benötigen einen funktionierenden Mailversand. Fiktive Adressen können keine E-Mails empfangen.
- Lokale Kontodaten werden getrennt nach Benutzer-ID zwischengespeichert; diese Daten sind nicht verschlüsselt und können für andere Personen mit Zugriff auf dasselbe Browserprofil sichtbar sein. Beim Konto-Wechsel werden verspätete Antworten des vorherigen Kontos verworfen und Sync-Anfragen an die ursprüngliche Sitzung gebunden. Öffentliche Geräte nicht für echte Daten verwenden.
- Die Test-Suite verwendet Auth-/Sync-Mocks; Browser-Anmeldungen, Kontowechsel im Browser und der Mailversand müssen vor einer Freigabe zusätzlich Ende zu Ende getestet werden. Die beiden bekannten Testkonten wurden separat direkt gegen den Live-Auth-Dienst geprüft. Rechtstexte bleiben Entwürfe, Stripe ist nicht freigeschaltet.

### 1. Supabase-Projekt (Frankfurt)

- Neues Projekt in Region **Frankfurt (`eu-central-1`)** anlegen.
- Migrationen aus `supabase/migrations/` einspielen (Reihenfolge beachten):
  - `20261126000100_theo_beta_init.sql` — Tabellen `profiles`, `items`, `waitlist`, `invite_codes`, `rate_limits`, Trigger, `upsert_user_items`-RPC, RLS (alle Tabellen `FORCE ROW LEVEL SECURITY`).
  - `20261126000200_auth_lookup_rpc.sql` — RPC `find_auth_user_by_email` für die geschlossene Beta.
- Auth-Härtung (Supabase-Dashboard → Authentication → Providers/URL Configuration):
  - **Sign-ups deaktivieren** (`disable_signup = true`) — die Beta ist rein invite-basiert; Konten werden serverseitig über die Service-Role angelegt.
  - **Site URL** = deine Vercel-Domain (z. B. `https://theo.example.vercel.app`).
  - **Redirect allow list** = `https://<domain>/app/` (Magic-Link-Landing).
  - Deutsche E-Mail-Texte hinterlegen (oder den eigenen SMTP/Brevo-Mailer nutzen — die App verschickt die Magic-Link-, Willkommens- und Lösch-E-Mails selbst auf Deutsch).

### 2. Vercel-Deployment (`fra1`)

Das bestehende Vercel-Projekt mit dem GitHub-Repository verbinden. Git-Pushes können ein Deployment auslösen; dessen Zielumgebung und Domain in Vercel kontrollieren: Das erste Deployment kann auch von einem anderen Branch aus als Production eingestuft werden. Vor Tests prüfen, ob Vercel Deployment Protection den Zugriff einschränkt. `NEXT_PUBLIC_SITE_URL` und Supabase-Redirects müssen zur tatsächlich verwendeten Domain passen; sonst führen E-Mail-Links auf die falsche Umgebung.

```bash
npm install
npm run build          # baut .vercel-dist/ + vendored /app/supabase.min.js
vercel deploy --prod             # Ziel-Region und Deployment Protection prüfen
```

In Vercel unter **Settings → Environment Variables** (Production) setzen:

| Variable | Inhalt |
|---|---|
| `SUPABASE_URL` | `https://<ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | anon/public Key (Client-seitig) |
| `SUPABASE_SERVICE_ROLE_KEY` | **nur server-seitig** — nie im Client/Repo |
| `INVITE_REQUIRED` | `true` (geschlossene Beta) |
| `NEXT_PUBLIC_SITE_URL` | `https://<domain>` |
| `BREVO_API_KEY` / `SMTP_*`, `MAIL_FROM` | Transaktionsmailer für Wartelisten-Bestätigung und Lösch-E-Mails; nur Auth hat einen Supabase-Mailer-Fallback |
| `RATE_LIMIT_SALT` | Zufälliger geheimer Salt für das Rate-Limiting |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY_29`, `STRIPE_PRICE_YEARLY_290` | optional, für M5-Zahlung (29 €/Monat · 290 €/Jahr, Bestandsschutz via `profiles.price_locked`) |

> **Sicherheit:** Secrets nur in geschützten Umgebungsvariablen hinterlegen, niemals ins Repository, Client-Bundle oder den Klartext-Chat übernehmen. `api/config` liefert bewusst nur öffentliche Parameter.
>
> Ohne Transaktionsmailer werden Wartelisten-Bestätigungen nicht versendet; die Kontolöschung verwendet dann eine Bestätigungsphrase statt einer E-Mail. Supabase-Standardmails müssen separat lokalisiert und der Mailversand vollständig getestet werden.

### 3. Nach dem Deployment prüfen

```bash
npm test               # Syntax + Alpha-Regression + Beta-Suites (smoke7..smoke23)
curl -I https://<domain>/          # Landingpage
curl -I https://<domain>/app/      # PWA
curl -I https://<domain>/api/config
curl -I https://<domain>/impressum
```

### Beta-Funktionen (M0–M5)

- **M1** Öffentliche Landingpage; Warteliste (Double Opt-in) für später vorbereitet und derzeit ausgeblendet und ehrlichen Datenschutz-/Impressum-/AGB-Entwürfen (`legal-review: needed`).
- **M2** Einladungscode-gates Registration, Passwort-Login für bestehende Konten und optionaler Magic-Link-Login (Mailversand offen), `profiles`-Zeile bei Erstlogin (`price_locked = 29`, `price_locked_at`, `invite_code`).
- **M3** Single-File-PWA ohne CalDAV/Nextcloud, Supabase-`items`-Sync (Pro-Row-LWW, Tombstones, R13b Pull-first auf Neugeräten), 5-Minuten-Onboarding.
- **M4** Self-Service JSON-Datenexport + Konto-Löschung (E-Mail-Bestätigung → löscht `auth.users` + kaskadiert).
- **M5** Stripe-Checkout (29 €/Monat · 290 €/Jahr) mit Bestandsschutz über `profiles.price_locked`, HMAC-Webhook, § 312k-BGB-Zweischritt-Kündigung.

---

# Theo als YunoHost-App 🐣 (Alpha / Selbsthosting)

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
