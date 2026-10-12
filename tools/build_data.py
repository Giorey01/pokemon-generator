#!/usr/bin/env python3
"""Scarica dati e sprite da PokeAPI e genera sprites/ e data/pokemon.js.

Uso:  .venv/bin/python tools/build_data.py
Richiede: pillow, numpy. I download vengono messi in .cache/ (non versionata).
"""
import csv
import io
import json
import shutil
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache"
CSV_URL = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/"
SPRITE_URL = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/"
LAST_ID = 1025
ITALIAN = "8"
SIZE = 96


def fetch(url, dest):
    """Scarica url in dest (se non già in cache). False se il file non esiste."""
    if dest.exists():
        return True
    dest.parent.mkdir(parents=True, exist_ok=True)
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            dest.write_bytes(r.read())
        return True
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return False
        raise


def read_csv(name):
    path = CACHE / "csv" / f"{name}.csv"
    fetch(CSV_URL + f"{name}.csv", path)
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def render_to_sprite(img):
    """Converte un render 3D in uno sprite 96x96 in stile pixel art:
    ritaglio, riduzione, alpha netto, palette a 16 colori e contorno scuro."""
    img = img.convert("RGBA")
    img = img.crop(img.getchannel("A").getbbox())
    scale = (SIZE - 4) / max(img.size)
    small = img.resize(
        (max(1, round(img.width * scale)), max(1, round(img.height * scale))),
        Image.Resampling.BOX,
    )
    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    canvas.paste(small, ((SIZE - small.width) // 2, (SIZE - small.height) // 2))

    a = np.array(canvas)
    opaque = a[..., 3] >= 128
    rgb = Image.fromarray(a[..., :3]).quantize(15, method=Image.Quantize.MEDIANCUT)
    out = np.array(rgb.convert("RGB"))

    # contorno: pixel opachi che toccano la trasparenza
    pad = np.pad(opaque, 1)
    inner = pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:]
    out[opaque & ~inner] = (32, 32, 40)

    rgba = np.dstack([out, np.where(opaque, 255, 0).astype(np.uint8)])
    rgba[~opaque] = 0
    return Image.fromarray(rgba, "RGBA")


def get_sprite(pid):
    """Ritorna (immagine RGBA 96x96, convertito?)."""
    raw = CACHE / "raw" / f"{pid}.png"
    if fetch(SPRITE_URL + f"{pid}.png", raw):
        return Image.open(raw).convert("RGBA"), False
    home = CACHE / "home" / f"{pid}.png"
    if not fetch(SPRITE_URL + f"other/home/{pid}.png", home):
        raise RuntimeError(f"nessuna immagine per il Pokémon #{pid}")
    return render_to_sprite(Image.open(home)), True


def features(img):
    """Misure grezze di complessità: (transizioni di colore, densità, n. colori)."""
    a = np.array(img).astype(np.int32)
    opaque = a[..., 3] >= 128
    # un intero per colore, -1 per il trasparente
    key = np.where(opaque, (a[..., 0] << 16) | (a[..., 1] << 8) | a[..., 2], -1)
    transitions = int((key[:, 1:] != key[:, :-1]).sum() + (key[1:, :] != key[:-1, :]).sum())
    area = int(opaque.sum())
    colors = len(np.unique(key[opaque]))
    return transitions, transitions / max(area, 1), colors


def percentile_rank(values):
    values = np.asarray(values, dtype=float)
    order = values.argsort(kind="stable")
    ranks = np.empty(len(values))
    ranks[order] = np.arange(len(values))
    # media dei ranghi a parità di valore
    for v in np.unique(values):
        same = values == v
        ranks[same] = ranks[same].mean()
    return ranks / max(len(values) - 1, 1)


def main():
    ids = list(range(1, LAST_ID + 1))

    names = {
        int(r["pokemon_species_id"]): r["name"]
        for r in read_csv("pokemon_species_names")
        if r["local_language_id"] == ITALIAN
    }
    type_names = {
        int(r["type_id"]): r["name"]
        for r in read_csv("type_names")
        if r["local_language_id"] == ITALIAN and int(r["type_id"]) <= 18
    }
    types = {}
    for r in sorted(read_csv("pokemon_types"), key=lambda r: int(r["slot"])):
        types.setdefault(int(r["pokemon_id"]), []).append(int(r["type_id"]))

    with ThreadPoolExecutor(16) as pool:
        sprites = list(pool.map(get_sprite, ids))

    out_dir = ROOT / "sprites"
    shutil.rmtree(out_dir, ignore_errors=True)
    out_dir.mkdir()
    converted = []
    feats = []
    for pid, (img, was_converted) in zip(ids, sprites):
        if was_converted:
            converted.append(pid)
        feats.append(features(img))
        buf = io.BytesIO()
        img.save(buf, "PNG", optimize=True)
        (out_dir / f"{pid}.png").write_bytes(buf.getvalue())

    transitions, density, colors = zip(*feats)
    score = (
        0.60 * percentile_rank(transitions)
        + 0.25 * percentile_rank(density)
        + 0.15 * percentile_rank(colors)
    )
    # decili: ogni voto da 1 a 10 copre circa lo stesso numero di Pokémon
    order = score.argsort(kind="stable")
    level = np.empty(len(ids), dtype=int)
    level[order] = np.arange(len(ids)) * 10 // len(ids) + 1

    rows = [[pid, names[pid], types[pid], int(level[i])] for i, pid in enumerate(ids)]
    data_dir = ROOT / "data"
    data_dir.mkdir(exist_ok=True)
    js = (
        "// Generato da tools/build_data.py — non modificare a mano.\n"
        "// POKEMON: [numero, nome, [id tipi], complessità 1-10]\n"
        f"window.TYPES = {json.dumps(type_names, ensure_ascii=False)};\n"
        "window.POKEMON = [\n"
        + ",\n".join(json.dumps(r, ensure_ascii=False, separators=(",", ":")) for r in rows)
        + "\n];\n"
    )
    (data_dir / "pokemon.js").write_text(js, encoding="utf-8")

    print(f"{len(rows)} Pokémon, {len(converted)} sprite convertiti da render 3D: {converted}")


if __name__ == "__main__":
    main()
