# PokéGenerator Forum

Generatore casuale di Pokémon in stile forum del 2005.

**Sito:** https://giorey01.github.io/pokemon-generator/

Tre filtri:

- **Quantità** — da 1 a 20 Pokémon, senza doppioni
- **Tipo** — uno dei 18 tipi (i doppi tipo valgono per entrambi)
- **Complessità grafica** — intervallo da 1 a 10, calcolato sullo sprite 96x96

## Complessità grafica

`tools/build_data.py` analizza ogni sprite e combina tre misure:

| Peso | Misura |
|------|--------|
| 60%  | numero di cambi di colore tra pixel adiacenti (quantità di linee e dettagli) |
| 25%  | densità dei cambi di colore rispetto all'area dello sprite |
| 15%  | numero di colori distinti |

I 1025 Pokémon vengono poi divisi in decili: ogni voto contiene circa 102 Pokémon.

## Rigenerare i dati

```sh
python -m venv .venv
.venv/bin/pip install pillow numpy
.venv/bin/python tools/build_data.py
```

Lo script scarica nomi, tipi e sprite da [PokéAPI](https://pokeapi.co/) e riscrive
`sprites/` e `data/pokemon.js`. Se per un Pokémon manca lo sprite 96x96, il render 3D
viene convertito automaticamente in pixel art (al momento non serve per nessuno).

## Crediti

Dati e sprite: [PokéAPI](https://github.com/PokeAPI). Pokémon e i rispettivi nomi sono
marchi di Nintendo / Creatures Inc. / GAME FREAK inc. Sito amatoriale non ufficiale.
