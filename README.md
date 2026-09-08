# Volleybal Tracker offline

## Lokaal starten
1. Installeer Node.js LTS.
2. Open een terminal in deze map.
3. Voer `npm install` uit.
4. Voer `npm run dev` uit.
5. Open het getoonde lokale adres.

## Productiebestand maken
Voer `npm run build` uit. De map `dist` kan op vrijwel elke statische webhost worden geplaatst.

## Delen met anderen
Publiceer de inhoud via een statische host, bijvoorbeeld Azure Static Web Apps, GitHub Pages, Netlify of Cloudflare Pages. Na het eerste volledige bezoek kan de PWA offline blijven werken. Op mobiel kan de gebruiker via de browser kiezen voor 'Toevoegen aan beginscherm' of 'App installeren'.

## Gegevens
De actieve wedstrijd en volledige puntenhistorie worden lokaal in de browser opgeslagen via localStorage. De data wordt niet automatisch tussen apparaten gesynchroniseerd.
Deployment retry
