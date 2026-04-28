# Pörssisähkölaskuri

Selainpohjainen laskuri joka kertoo retroaktiivisesti, paljonko sähkö
olisi maksanut, jos käyttäjällä olisi ollut pörssisähkösopimus
tarkasteltavana ajanjaksona. Vertailu kiinteähintaiseen sopimukseen,
kulutuksella painotettu keskihinta, kuukausi- ja päiväkohtaiset
graafit. Kaikki laskenta tapahtuu käyttäjän selaimessa — kulutusdata
ei lähde mihinkään.

## Käyttäjälle

1. **Lataa kulutushistoriasi Datahubista.**
   Mene osoitteeseen [datahub.fi](https://datahub.fi/), kirjaudu
   Suomi.fi-tunnistautumisella ja lataa oman käyttöpaikkasi
   tuntiraportti CSV-muodossa.

2. **Avaa laskuri** (URL kun deployattu GitHub Pagesiin).

3. **Raahaa CSV-tiedosto** sovellukseen tai valitse se klikkaamalla.

4. **Syötä hintatiedot:** pörssisähkösopimuksen marginaali, perusmaksu
   sekä kiinteän sopimuksen vertailuhinta ja perusmaksu. **Anna kaikki
   hinnat verollisina** — sähkön ALV lisätään pörssin tukkuhintaan
   automaattisesti päivämäärän mukaan oikealla prosentilla (10 %, 24 %
   tai 25,5 % sen hetkisen verokannan mukaan).

5. **Klikkaa Laske.** Saat:
   - "Säästit X €" / "Maksoit X € enemmän" -loppusumman
   - Kokonaiskustannukset molemmilla hintamalleilla
   - Painotetun spot-keskihinnan
   - Kuukausi- ja päiväkohtaisen vertailugraafin
   - Yhteenvedon datan kattavuudesta

## Lähdekoodin rakenne

```
.
├── index.html              Pääsivu
├── css/style.css
├── js/
│   ├── app.js              Bootstrap, lomakkeen kytkennät
│   ├── csv-parser.js       Datahub CSV → kulutusrivit
│   ├── price-loader.js     spot-prices.json haku
│   ├── calculator.js       Painotetun keskiarvon laskenta
│   ├── vat-rates.js        ALV-prosentit päivämäärän mukaan
│   ├── chart.js            Chart.js-kuvaajat
│   └── debug.js            ?debug=1-näkymä
├── data/
│   └── spot-prices.json    Auto-generoituva (GitHub Actions)
├── scripts/
│   ├── update_prices.py            Päivittäinen hintapäivitys
│   ├── generate_synthetic_prices.py  Testausta varten (synteettiset)
│   └── sources/
│       └── spot_hinta_fi.py        Datalähde, vaihdettavissa
├── tests/
│   ├── run.js                      Golden test runner (Node)
│   └── golden/                     Kiinnitetyt testifixturet
└── .github/workflows/
    └── update-prices.yml           Päivittäinen cron-päivitys
```

## Datalähteet

**Spot-hinnat:** [spot-hinta.fi](https://spot-hinta.fi/) (Suomen
hinta-alueen day-ahead -hinnat). Datalähde on abstrahoitu
moduulissa `scripts/sources/spot_hinta_fi.py` ja vaihdettavissa
toiseen (esim. Elering tai ENTSO-E) yhden tiedoston työnä.

**Kulutusdata:** Käyttäjä lataa itse Fingrid Datahubista oman
mittauspaikkansa CSV-tiedoston. Datahubin formaatti on standardi
kaikille suomalaisille sähköasiakkaille.

## Hintojen päivitys

Tuotannossa GitHub Actions ajaa `scripts/update_prices.py`:n joka
päivä klo 08:30 UTC ja committaa muutokset. Päivähinnat julkaistaan
n. klo 10 UTC, joten ajastus on hieman ennen sitä — varmistaen että
edellisten päivien hinnat ovat varmasti tallessa.

Manuaalinen päivitys paikallisesti:

```bash
cd scripts && python3 update_prices.py
```

## Kehitys ja testaus

Lokaali kehityspalvelin:

```bash
python3 -m http.server 8000
# avaa http://localhost:8000
```

Golden-testi (varmistaa laskennan oikeellisuuden):

```bash
node tests/run.js
```

Debug-näkymä (per-rivi spot, ALV, marginaali, lopullinen €/kWh):

```
http://localhost:8000/?debug=1
```

## Synteettinen testidata

Tähän repoon `data/spot-prices.json` on tällä hetkellä **synteettistä
testidataa** (luotu `scripts/generate_synthetic_prices.py`:llä).
Tiedoston metadatassa on `"synthetic": true` -merkintä, jonka
sovellus näyttää statusrivissä. Kun GitHub Actions ajaa
oikean `update_prices.py`:n, tiedosto korvautuu oikealla datalla.

## Mitä laskuri ottaa huomioon

- Pörssin tuntihinta + ALV (päivämäärän mukainen kanta)
- Käyttäjän syöttämä marginaali ja perusmaksu pörssisopimukselle
- Kiinteän sopimuksen €/kWh ja perusmaksu vertailuun
- Kalenterikuukausilogiikka perusmaksuille (vajaa kuukausi = täysi maksu)
- 15 minuutin Datahub-resoluutio (lasketaan jokaiselle slotille,
  haetaan kunkin tunnin spot-hinta)
- Aikavyöhykkeet: kaikki UTC:ssä, vain käyttäjälle näkyvät
  kuukausi- ja päivätunnisteet Helsinki-aikaa (DST huomioiden)

## Mitä laskuri **ei** tee (toistaiseksi)

- Sähkönsiirto, energia­vero ja muut kiinteät komponentit
- Useamman sähköyhtiön omat CSV-formaatit (Datahub-only)
- Puuttuvien tuntien imputointi (näytetään vain kuinka paljon puuttui)
- Useampi kiinteä vertailusopimus samanaikaisesti

## Tietosuoja

Sovellus on staattinen sivu. Käyttäjän kulutusdata käsitellään
selaimessa eikä lähde mihinkään palvelimelle. Spot-hinnat ladataan
samalta domainilta josta sivu on ladattu.

## Lisenssi

(MIT, lisätään myöhemmin LICENSE-tiedostona.)
