# WC Ohio Weather (West Central Ohio Weather Center)

A free, fast weather website for Bellefontaine, Logan County and West Central Ohio, with a browser-based editor for publishing forecasts, blog posts and maps. This project is separate from any other brand or site.

## What you get

| Page | What it does | Data |
|---|---|---|
| Home | Alert banner, current conditions, forecast summary, radar, latest discussion and posts | NWS API, radar tiles, your content |
| Forecast | Current conditions, today/tonight, 7-day, next 12 hours, SPC outlook images, **your** discussion, official NWS discussion | NWS API, SPC images |
| Radar | Live NEXRAD mosaic with a 50-minute loop | Iowa Environmental Mesonet tiles |
| Alerts | Active NWS alerts for Logan + 9 surrounding counties, linked to the original record | NWS API |
| Blog | Posts with categories, images, drafts | Your content |
| Maps | Gallery of maps/graphics you upload, with captions and dates | Your content |
| About and Safety | Disclaimer, sources, safety guidance, official links | Static |

Everything labeled "SAMPLE" is placeholder content. Delete it once you publish your own.

## Honest status: what was and was not tested

Tested here: the site builds, drafts stay hidden, post and map pages generate, the GitHub Pages sub-path build works, the local preview server serves every page, and the weather/alert/radar code runs correctly against **mock** responses (including "no alerts", "alert feed down" and "forecast down" cases).

**Not tested (this environment has no internet and no browser):** the live NWS API, live radar tiles, the Pages CMS sign-in, the GitHub Actions deploy, and how the pages look in a real browser. These use documented, standard services, but please run the checklist in "First-launch checklist" below and tell me if anything misbehaves.

## Cost

| Item | Cost |
|---|---|
| Hosting (GitHub Pages) | Free |
| Editor (Pages CMS, hosted by the Pages CMS project) | Free |
| Weather data (NWS API) | Free, no key |
| Radar tiles (Iowa Environmental Mesonet) + basemap (OpenStreetMap) | Free |
| Domain `wcoweather.com` | Roughly $10-$15 per year for a .com. Prices vary by registrar and renewal prices can be higher than the first year, so check the renewal price before buying. |

The only thing you pay for is the domain.

## Why this setup

* **GitHub Pages** hosts static sites free. HTTPS is free and automatic, including for your own domain.
* **Pages CMS** is a free, open-source editor made for GitHub-hosted sites. You sign in with GitHub at app.pagescms.org, and it saves your posts and images as files in your repository. No OAuth server for you to run and no paid service.
* A small **GitHub Action** (already included) rebuilds the site every time you save in the editor, so new posts appear on the homepage and blog automatically in about 1-2 minutes.
* The `/admin/` page on your site is a **launch pad** that links to the editor. The real sign-in happens at Pages CMS with GitHub. There is no login on your own site, so there is nothing on the site for anyone to break into.

**Requirements and limits:** you need a free GitHub account. The free plan requires the repository to be **public**, so your posts and images are publicly visible in the repository (they are public on the website anyway). Free Pages limits (about 1 GB site size, 100 GB/month traffic) are far above what a local weather site needs. Keep images under about 1 MB each.

## One-time setup (about 20 minutes)

1. **Create a GitHub account** at github.com if you do not have one.
2. **Create a repository:** click New repository, name it `wco-weather`, choose **Public**, and create it.
3. **Upload this project:** unzip the project, then on the repository page choose *Add file > Upload files* and drag in everything inside the `wco-weather` folder (including the hidden `.github` folder and `.pages.yml`; if your browser skips hidden files, use GitHub Desktop or the `git` commands below). Commit to the `main` branch.
   ```
   git init && git add -A && git commit -m "Initial site"
   git branch -M main
   git remote add origin https://github.com/YOUR-NAME/wco-weather.git
   git push -u origin main
   ```
4. **Turn on Pages:** repository *Settings > Pages > Build and deployment > Source: GitHub Actions*.
5. **Wait for the first deploy:** open the *Actions* tab. When "Build and deploy" shows a green check, your temporary site is live at `https://YOUR-NAME.github.io/wco-weather/`.
6. **Connect the editor:** go to https://app.pagescms.org, sign in with GitHub, install the Pages CMS GitHub App on your account (choose your `wco-weather` repository), and open it. It reads the included `.pages.yml` and shows **Forecast Discussion**, **Blog Posts** and **Maps and Graphics**.

## First-launch checklist

* Home page shows an alert banner, current conditions and a forecast (not error messages).
* Radar page shows moving radar over Ohio (press Play loop).
* Alerts page says either "No matching active alerts" or lists real alerts. If it says "Alert status unavailable", the feed could not be reached; try again later.
* In the editor, change the Forecast Discussion, save, wait 2 minutes, and confirm the Forecast page changed.

## Publishing after launch

Go to **app.pagescms.org** (or `yoursite/admin/` and click the button), choose your repository, and:

* **Forecast discussion:** *Forecast Discussion* > edit the text > Save. It appears on the Forecast page and homepage.
* **Blog post:** *Blog Posts* > New entry > fill in title, date, category, short summary, optional image, and article > Save. Turn on **Draft** to keep it hidden; turn it off and save to publish.
* **Map or graphic:** *Maps and Graphics* > New entry > upload the image, add title, type and caption > Save.
* **Edit or delete:** open the entry from the list.

Changes go live in about 1-2 minutes. You can also let another person edit: in Pages CMS, invite them as a collaborator by email (they do not need a GitHub account).

If Pages CMS is ever unavailable, you can edit files directly on github.com (for example `content/discussion.md`), and the site rebuilds the same way.

## Connecting wcoweather.com (after you buy it on October 31)

1. Buy the domain at a registrar of your choice. Turn on free WHOIS privacy if offered.
2. At the registrar's DNS settings, add (confirm the current values in GitHub's "Managing a custom domain" docs):
   * Four `A` records for the root `@`: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   * (Optional) `AAAA` records: `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`
   * One `CNAME` for `www` pointing to `YOUR-NAME.github.io`
3. In the repository, rename `CNAME.example` to `CNAME` (it contains `wcoweather.com`) and commit. The build detects it and switches all links from the temporary `/wco-weather/` address to the root domain.
4. In *Settings > Pages*, enter `wcoweather.com` as the custom domain, wait for the DNS check, then tick **Enforce HTTPS**. GitHub issues the certificate for free, which can take up to an hour.
5. Do not use the `<name>.github.io` address after launch; it will redirect.

## Previewing on your computer (optional)

Install Node.js 18 or newer, open a terminal in the project folder, and run:

```
node scripts/dev.js
```

Open http://localhost:8080. The preview rebuilds when you change files. (Live weather needs internet.)

## How the pieces fit

```
public/            pages (HTML), css/style.css, js/app.js  -> the website
partials/          shared header and footer
templates/post.html   layout for each blog post page
content/           what the editor changes: posts/, maps/, discussion.md
media/             images uploaded through the editor
.pages.yml         tells the editor which fields to show
.github/workflows  rebuilds and publishes the site on every save
scripts/build.js   turns content into pages and data files (no installs needed)
```

## Changing things

* **Coverage area, counties, point of interest:** top of `public/js/app.js` (`CFG`). County codes are NWS "UGC" codes (Logan = `OHC091`). The compact homepage radar frames the area set in `buildRadar` (`fitBounds`).
* **Logo:** replace `public/img/logo.png` (and `public/favicon.png`).
* **Fonts:** Inter (text) and Barlow Condensed (headlines) load from Google Fonts; they are named at the top of `public/css/style.css`, and the font link is added in `scripts/build.js`.
* **Colors:** variables at the top of `public/css/style.css` (blue and orange come from the logo).
* **About page text, your contact info:** `public/about.html`.
* **Categories:** `.pages.yml` (blog and maps).

## Technical notes and limits

* **NWS API:** requires no key. Browsers cannot set the `User-Agent` header the NWS suggests, so requests go without one; the site retries on short outages and checks alerts every 2 minutes and conditions every 10 minutes per open page, well within normal use. If traffic grows large, put a small proxy in front (Cloudflare Workers has a free tier) that sends a User-Agent with your contact email.
* **Alerts** are filtered to the coverage counties (Mercer, Darke, Auglaize, Shelby, Miami, Hardin, Logan, Champaign, Clark and Union) and exclude test messages. If the feed fails, the site says it cannot confirm alert status rather than saying "no alerts".
* **Radar** is a reflectivity mosaic (no velocity or storm tracks) and can lag or occasionally fail; the page links to official NWS radar. The basemap uses OpenStreetMap's public tile server, which is free for light use with attribution (see their tile usage policy). If traffic grows a lot, switch to a provider with a free key (for example MapTiler or Stadia Maps) by changing the tile URL in `buildRadar` in `app.js`.
* **SPC outlook images** are loaded directly from spc.noaa.gov; if SPC changes those file names, the links on the page still work.
* **No scheduled posts:** a post appears when saved with Draft off. Use Draft for unfinished work.
* **Markdown subset:** posts support headings, bold, italics, links, images, lists, quotes. Raw HTML is escaped by design.
* **Third-party resources:** Leaflet loads from cdnjs and fonts from Google Fonts. For extra hardening you can add Subresource Integrity hashes.
* **Affiliation:** the footer and About page state that this site is independent and not affiliated with the NWS.

## Troubleshooting

* **Site shows 404 after setup:** *Settings > Pages > Source* must be **GitHub Actions**; check the *Actions* tab for a red X.
* **New post not showing:** wait 2 minutes, confirm Draft is off, and check the Actions run succeeded.
* **Editor says "no .pages.yml":** confirm it is in the repository root on the `main` branch.
* **Images missing after the domain switch:** make sure `CNAME` is committed, then re-run *Actions > Build and deploy*.
