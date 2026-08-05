# Dunyo Taxi — landing + legal site

Static site (no build step). Three pages, fully self-contained:

- `index.html` — landing page
- `privacy.html` — **Privacy Policy** (this is the URL you give Google Play)
- `terms.html` — Terms of Service
- `styles.css`, `logo.png`, `favicon.png` — assets

## Deploy (pick one)

**Vercel** (you already use it)
1. New Project → import the repo.
2. Set **Root Directory** to `landing`.
3. Framework preset: **Other**. Build command: *(leave empty)*. Output dir: `.`
4. Deploy. Your privacy URL becomes `https://<project>.vercel.app/privacy.html`.

**Netlify** — drag the `landing/` folder onto app.netlify.com/drop. Done.

**GitHub Pages** — push, then Settings → Pages → serve from `/landing`.

**Custom domain** — point `dunyotaxi.uz` (or `www.`) at whichever host. Then your
privacy URL is `https://dunyotaxi.uz/privacy.html`.

## Before you publish — customize these placeholders
- **Contact email** `support@dunyotaxi.uz` — set up this mailbox (or change it) in all
  three files. Google Play emails users here for data-deletion requests.
- **Phone number** `+998 90 000 00 00` in `index.html` footer — replace with the real one.
- **Google Play link** — the "Google Play’da (tez kunda)" buttons link to `#`. Once the app
  is live, paste the real Play Store URL.
- **Legal entity** — if there's a registered company name, add it to the footer / policies.

The privacy policy already covers what the app actually does (phone, location incl.
background driver location, driver documents, ratings) and the real third parties
(Yandex Maps, OSRM, Firebase, Eskiz). Have a lawyer review before launch if you can.
