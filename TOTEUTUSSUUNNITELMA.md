# Pörssisähkölaskuri – toteutussuunnitelma

## Tavoite

Selainpohjainen laskuri, joka kertoo retroaktiivisesti, paljonko sähkö olisi maksanut, jos käyttäjällä olisi ollut pörssisähkösopimus tarkasteltavalla ajanjaksolla. Käyttäjä syöttää oman kulutushistoriansa Fingrid Datahubista ladattuna CSV-tiedostona, ja laskuri näyttää:

- Kokonaiskustannuksen pörssisähkönä (spot + marginaali, ALV mukana)
- Kulutuksella painotetun keskihinnan
- Vertailun käyttäjän kiinteähintaiseen sopimukseen
- Kuukausikohtaisen kuvaajan vertailusta

Pääkohderyhmä: itse + lähipiiri, mahdollisesti laajempi yleisö myöhemmin.

## Toiminnallinen laajuus (MVP)

### Käyttäjän syötteet

- **Kulutusdata**: Datahubista ladattu CSV-tiedosto (drag-and-drop tai tiedostonvalinta)
- **Spot-marginaali**: snt/kWh, verollisena (esim. 0,5 snt/kWh)
- **Pörssisopimuksen perusmaksu**: €/kk (vapaaehtoinen, oletus 0)
- **Kiinteän sopimuksen hinta**: snt/kWh, verollisena
- **Kiinteän sopimuksen perusmaksu**: €/kk (vapaaehtoinen, oletus 0)
- **Tarkasteluväli**: oletuksena CSV:n alku- ja loppupäivä, käyttäjä voi rajata

### Tulokset

- Kokonaiskustannus pörssisähkönä (€)
- Painotettu keskihinta (snt/kWh)
- Kokonaiskustannus kiinteällä hinnalla (€)
- Erotus euroissa ja prosenteissa (säästö tai lisäkustannus)
- Kuukausikohtainen pylväskuvaaja: pörssi vs. kiinteä per kuukausi

### Pois MVP:stä (mahdollisesti myöhemmin)

- Useamman sähköyhtiön CSV-formaattien tuki (Datahub-only riittää alkuun)
- Kallein/halvin tunti, kulutusprofiili-analyysit
- Useampi vertailuhinta samanaikaisesti
- Kokonaissummien syöttö laskulta (vaihtoehto kiinteälle €/kWh-hinnalle)
- Siirto- ja sähkönsiirtokustannukset

## Arkkitehtuuri

**Staattinen, asiakaspuolella ajettava verkkosovellus.** Ei backendia, ei tietokantaa, ei käyttäjätilejä.

### Komponentit

1. **Selainsovellus**: HTML + JavaScript. Käsittelee CSV-tiedoston, lataa spot-hinnat staattisena JSON:na, laskee tulokset, piirtää kuvaajan. Käyttäjän data ei lähde mihinkään.

2. **Spot-hinta-arkisto**: staattinen JSON-tiedosto repon `data/`-kansiossa. Sisältää historialliset tuntihinnat verottomina (€/MWh tai snt/kWh) sekä aikaleiman.

3. **Päivittäinen päivitysskripti**: GitHub Actions -työ ajaa kerran päivässä Python- (tai Node-) skriptin, joka hakee uusimmat hinnat spot-hinta.fi:stä, päivittää JSON-tiedoston ja committaa muutokset. Tämä laukaisee automaattisen redeployn.

4. **Hostaus**: GitHub Pages (ilmainen, yksinkertainen, integroituu suoraan repoon). Vaihtoehtona Netlify tai Vercel, jos myöhemmin tarvitaan enemmän ominaisuuksia.

### Datavirta käyttäjän näkökulmasta

```
Käyttäjä
   │
   │ 1. Lataa kulutus.csv Datahubista (manuaalinen vaihe)
   │ 2. Avaa laskurin URL:n selaimessa
   │
   ▼
[Selain] ──── 3. Hakee spot-prices.json (cachetetaan IndexedDB:hen)
   │
   │ 4. Käyttäjä raahaa CSV:n sovellukseen
   │ 5. Käyttäjä syöttää marginaalin ja kiinteän hinnan
   │
   ▼
[Selain laskee] → tulokset näytölle
```

Käyttäjän selain ei tee yhtään API-kutsua kolmansille osapuolille — kaikki data tulee samalta domainilta josta sovellus on ladattu.

## Datalähteet ja formaatit

### Kulutusdata (Fingrid Datahub CSV)

Esimerkkidatan perusteella formaatti on:

- Erotin: puolipiste (`;`)
- Desimaalierotin: pilkku
- Encoding: UTF-8 BOM
- Aikaleima: ISO 8601 UTC (esim. `2024-05-31T21:00:00Z`)
- Resoluutio: **PT15M** (15 minuuttia) — uusi EU-standardi
- Käytettävät sarakkeet: `Alkuaika`, `Määrä`. Muut sivuutetaan.

Parserin pitää huomioida:

- BOM-tavujen ohittaminen tiedoston alusta
- Pilkku desimaalierottimena
- UTC-aikaleimat (kun ryhmitellään kuukausittain, käännetään Suomen aikaan ja huomioidaan kesäaika)
- Mahdolliset puuttuvat tunnit (rivi puuttuu kokonaan tai `Laatu`-kenttä on jotain muuta kuin `OK`)

### Spot-hintadata (spot-hinta.fi)

Käytetään spot-hinta.fi:n julkista APIa historiallisten Suomen hinta-alueen päivähuutokauppahintojen hakuun. Hinnat ovat tunneittain, snt/kWh, verottomina. CORS-tuki on suomalaisten kuluttajasovellusten käyttämä, mutta varmistetaan toteutusvaiheessa. Jos CORS ei toimi suoraan selaimesta, päivitysskripti hakee silti backendissa GitHub Actionsista, joten staattisen JSON:in syntyminen ei ole CORS:in varassa.

Tallennettava JSON-formaatti (ehdotus):

```json
{
  "updated": "2026-04-27T08:00:00Z",
  "currency": "EUR",
  "unit": "snt/kWh",
  "vat_included": false,
  "area": "FI",
  "prices": [
    { "t": "2022-01-01T00:00:00Z", "p": 12.34 },
    { "t": "2022-01-01T01:00:00Z", "p": 11.78 }
  ]
}
```

Avainten lyhyet nimet (`t`, `p`) säästävät tilaa, kun hintoja on kymmeniä tuhansia. 3 vuoden tuntihinnat ovat ~26 000 riviä, gzipattuna ~200–300 KB.

### ALV-käsittely

Sähkön ALV Suomessa on muuttunut, joten sovellus soveltaa ALV:n päivämäärän mukaan automaattisesti. Tunnetut rajat:

| Ajanjakso              | ALV    |
| ---------------------- | ------ |
| ennen 2022-12-01       | 24,0 % |
| 2022-12-01 – 2023-04-30 | 10,0 % |
| 2023-05-01 – 2024-08-31 | 24,0 % |
| 2024-09-01 alkaen      | 25,5 % |

Nämä prosentit on syytä laittaa ylläpidettävään konfiguraatioon (esim. `js/vat-rates.js`), jotta tuleva muutos on helppo lisätä.

Käyttäjän syöttämät hinnat (marginaali, kiinteä hinta, perusmaksut) ovat aina **verollisia**. Spot-hintaan API:sta ALV lisätään laskennassa. Lopputulokset näytetään verollisina euroina.

## Laskennan logiikka

Pseudokoodina:

```
total_spot_cost = 0
total_kwh = 0
total_fixed_cost = 0

for each row in consumption_csv:
    t = row.alkuaika                       // UTC
    kwh = row.määrä                        // 15-min kulutus

    hour_key = floor_to_hour(t)
    spot_excl_vat = spot_prices[hour_key]  // snt/kWh, ALV 0%
    vat_rate = vat_for_date(t)
    spot_incl_vat = spot_excl_vat * (1 + vat_rate)

    spot_total_price = spot_incl_vat + margin_incl_vat   // snt/kWh

    total_spot_cost += kwh * spot_total_price / 100      // €
    total_fixed_cost += kwh * fixed_price_incl_vat / 100 // €
    total_kwh += kwh

months = months_in_period(start, end)
total_spot_cost += months * spot_monthly_fee
total_fixed_cost += months * fixed_monthly_fee

weighted_avg_spot = total_spot_cost / total_kwh * 100    // snt/kWh
difference = total_spot_cost - total_fixed_cost
```

Kuukausigraafia varten sama laskenta tehdään kuukausi kerrallaan ryhmittelemällä kulutusrivit kuukausiavaimen (`YYYY-MM` Suomen aikaa) mukaan.

## Reunatapaukset

- **Puuttuvat spot-hinnat**: jos jollekin tunnille ei löydy hintaa (uusinta dataa ei vielä ole tai jokin gap), kyseinen 15-min slotti jätetään laskennasta pois ja käyttäjälle näytetään huomautus että X tuntia on sivuutettu.
- **Puuttuvat kulutusrivit**: jos rivi puuttuu kokonaan, sitä ei lasketa (kulutus oletetaan tuntemattomaksi). Jos `Laatu` ≠ `OK`, käytetään silti, mutta logitetaan varoituksena.
- **Eri aikavyöhykkeet**: kaikki vertailut tehdään UTC:ssä. Vain kuukausiryhmittely tekee paikallisaikamuunnoksen `Europe/Helsinki`-vyöhykkeellä, jotta kuukausijaot vastaavat käyttäjän kokemusta.
- **Kesäaika**: Suomen aikaleimoissa kesäaika vaikuttaa kuukausijakoon mutta ei laskentaan, koska kaikki UTC-leimat ovat yksiselitteisiä.
- **Tyhjä/virheellinen CSV**: selkeä virheilmoitus ja ohje ladata tiedosto Datahubista.
- **Käyttäjän rajaama aikaväli ulkona datasta**: rajataan datan kattavuuden mukaan ja näytetään huomautus.

## Teknologiavalinnat

### Etupää

- **Vanilla HTML + JavaScript** ilman build-vaihetta. Kevyt, helppo ymmärtää, ei riippuvuusryteikköä.
- **Chart.js** kuukausigraafiin (yksi `<script>`-tagi CDN:stä, ei build).
- **Tyylit**: yksinkertainen oma CSS tai kevyt classless-kirjasto (esim. Pico.css). Pidetään minimissä.

Vaihtoehto: jos UI alkaa monimutkaistua, vaihdetaan Vite + React. Mutta ei nyt.

### Päivitysskripti

- **Python** (yksinkertaisin GitHub Actionsissa, valmiina runneriin). Vaihtoehtoisesti Node, jos halutaan koko stack samalla kielellä.
- Skripti hakee viimeisimmät hinnat, mergetään olemassa olevaan JSONiin, kirjoitetaan tiedostoon, committataan jos muutoksia.

### Hostaus

- **GitHub Pages** julkisesta reposta. Ilmainen, riittää tähän. SSL automaattisesti.
- Jos myöhemmin halutaan oma domain, GitHub Pages tukee custom domainia.

## Repo-rakenne (ehdotus)

```
porssisahkolaskuri/
├── index.html                    # Pääsivu
├── css/
│   └── style.css
├── js/
│   ├── app.js                    # Bootstrap, UI-kytkennät
│   ├── csv-parser.js             # Datahub CSV → kulutusrivit
│   ├── price-loader.js           # spot-prices.json haku + cache
│   ├── calculator.js             # Painotetun keskiarvon laskenta
│   ├── vat-rates.js              # ALV-prosentit päivämäärän mukaan
│   └── chart.js                  # Kuukausigraafi (Chart.js wrapper)
├── data/
│   └── spot-prices.json          # Auto-generoituva, GitHub Actions ylläpitää
├── scripts/
│   └── update_prices.py          # Päivittäinen hintapäivitys
├── .github/
│   └── workflows/
│       └── update-prices.yml     # Cron-aikataulu, ajaa skriptin
├── README.md                     # Käyttöohjeet ja Datahub-latausohje
└── LICENSE
```

## Toteutuksen vaiheet

### Vaihe 1: Pohjat ja datanloudaus

1. Repo, README, lisenssi, GitHub Pages päälle
2. Päivitysskripti: hakee spot-hinta.fi:stä historiallista dataa (esim. 3 vuotta) ja kirjoittaa `spot-prices.json`:n
3. GitHub Actions cronilla päivittäin

### Vaihe 2: CSV-parserin ja laskennan ydin

4. CSV-parseri Datahub-formaatille
5. ALV-konfiguraatio
6. Painotetun keskiarvon laskenta + kiinteän hinnan vertailu
7. Yksikkötestit testidatan kanssa (`consumption.csv`-tiedosto on jo olemassa esimerkkidatana)

### Vaihe 3: UI

8. Yksinkertainen lomake: tiedostonvalinta + numerokentät + tarkasteluvälin valinta
9. Tulokset numeroina
10. Kuukausigraafi Chart.js:llä

### Vaihe 4: Viimeistely

11. Käyttöohje selkeästi näkyviin: miten ladata data Datahubista
12. Virheilmoitukset reunatapauksiin
13. Mobiilinäkymä toimivaksi
14. README päivitys, deploy

## Avoimia kysymyksiä myöhempään

- **15-minuutin spot-hinnat**: EU on siirtymässä 15 minuutin selvitysjaksoon (Suomessa todennäköisesti loppuvuonna 2025). Kun spot-hinta.fi alkaa palauttaa PT15M-dataa, formaatin tukeminen on hyvä lisätä.
- **Marginaalin oletusarvo**: voisi näyttää tyypillisen markkinaehtoisen marginaalin (esim. 0,3–0,5 snt/kWh) syöttökenttää klikatessa.
- **Datahub-ohjeen tarkkuus**: lisätään kuvakaappauksia README:hen kun ohjetta tehdään.
- **Vertailu useampaan vuoteen**: kiinnostava feature jos haluaa nähdä trendin.
- **Testaus eri Datahub-vienneillä**: olisi hyvä saada datasetti useammasta käyttäjästä, varmistus että formaatti on todella standardi.
