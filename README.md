# Gabbang Simulator

A browser-playable 3D Gabbang simulator built with Three.js. It uses a selected
Tausug gabbang sample set from Katunog: 68 per-note strikes and 2 reference
recordings.

## Run Locally

```sh
pnpm install
pnpm dev
```

Then open the local URL Vite prints.

## Audio

This repo includes only the Gabbang files the page uses:

```text
public/data/katunog-public-audio/audio_manifest.csv
public/data/katunog-public-audio/audio/PIISD02596__gabbang/*.mp3
```

The full Katunog mirror is not included.

The bundled MP3s are audio-only copies of the selected Katunog files. Embedded
cover art was removed so the simulator can load quickly in the browser.

## Attribution

Audio and metadata are from Katunog, the Philippine Indigenous Instrument Sounds
Database Project by DOST-ASTI and the University of the Philippines.

The original MP3 credits identify Rano S. Anjah for the 68 individual key
samples, and Suraida A. Iri with Rano S. Anjah for the two reference
performances.

Source: https://katunog.asti.dost.gov.ph

Terms: https://katunog.asti.dost.gov.ph/client/terms

The 3D bamboo asset is from Poly Pizza / Poly by Google and is licensed under
CC BY 3.0:

https://poly.pizza/m/auVD_m-ugF0

The 360 environment photographs are resized versions of Secluded Beach,
River Walk 1, Monbachtal Riverbank, and Park Music Stage from Poly Haven. They are
released under CC0 1.0:

https://polyhaven.com/license

The Katunog audio and metadata are not MIT licensed. See `NOTICE.md`.

## Controls

- Click or tap the bamboo bars to play.
- Keyboard notes: `A W S E D F T G Y H U J K O L P`
- Drag the scene to adjust the view.
- Use `Sound` for volume, room sound, strike strength, and background scene.
- Use `Tune` to show or hide reference recordings.
