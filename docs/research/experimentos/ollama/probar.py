#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
probar.py - Compara modelos de embeddings de Ollama sobre un set sintetico de
items de boletas peruanas de olla comun.

Proyecto: hackODS-Autonoma-2026  ·  experimento local, no toca el repo git.

Uso:
    python probar.py                     # todos los modelos de embedding instalados
    python probar.py --modelos bge-m3    # uno o varios (coma)
    python probar.py --latencia          # mide latencia y RAM (mas lento)
    python probar.py --json salida.json  # vuelca los numeros crudos

Solo usa stdlib + numpy. Habla la API HTTP de Ollama en 127.0.0.1:11434.
No instala nada.
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
import time
import unicodedata
import urllib.error
import urllib.request
from pathlib import Path

import numpy as np

BASE = "http://127.0.0.1:11434"
AQUI = Path(__file__).resolve().parent
TAU, MARGEN, PISO = 0.62, 0.04, 0.45  # umbrales del plan 08 §4.3

# ---------------------------------------------------------------- normalizacion

MARCAS = {
    "primor", "gloria", "ecomusa", "bolivar", "cocinero", "costeno", "costeño",
    "alicorp", "nestle", "nestlé", "pilsen", "backus", "casserita", "ideal",
}

ABREV = {
    "pap": "papa", "pap.": "papa", "ceb": "cebolla", "ceb.": "cebolla",
    "zanah": "zanahoria", "zanah.": "zanahoria", "zan": "zanahoria",
    "corr": "corriente", "corr.": "corriente", "evap": "evaporada",
    "evap.": "evaporada", "amar": "amarilla", "amar.": "amarilla",
    "frj": "frijol", "frejol": "frijol", "ent": "entero", "ent.": "entero",
    "tall": "tallarin", "tall.": "tallarin", "1ra": "primera", "1era": "primera",
    "unid": "unidad", "und": "unidad", "un": "unidad", "pall": "pallar",
    "hvo": "huevo", "pllo": "pollo", "arr": "arroz", "aceit": "aceite",
}

UNIDADES = {
    "kg", "k", "gr", "g", "l", "lt", "lts", "ml", "cc", "un", "und", "unid",
    "saco", "sacos", "botella", "bot", "tarro", "lata", "bandeja", "bolsa",
    "paquete", "pqt", "caja", "docena",
}

PRES_RE = None  # se compila abajo

import re

PRES_RE = re.compile(
    r"^(\d+([.,]\d+)?(kg|k|gr|g|l|lt|lts|ml|cc|un|und|unid)?|\d+/\d+|\d+[.,]\d+)$"
)


def _sin_tildes(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def _tokens(s: str) -> list[str]:
    # NFKC ya lo hace unicodedata; separamos puntuacion salvo la barra de 1/2
    s = s.replace(".", " ").replace(",", " ").replace("-", " ")
    s = re.sub(r"[^\w/\s]", " ", s)
    return [t for t in s.split() if t]


def normalizar(texto: str, nivel: int) -> str:
    """nivel 0=crudo, 1=minus+tildes, 2=+abreviaturas, 3=+marca fuera, 4=+presentacion fuera"""
    if nivel == 0:
        return texto
    t = unicodedata.normalize("NFKC", texto).lower()
    t = _sin_tildes(t)
    toks = _tokens(t)
    if nivel >= 2:
        toks = [ABREV.get(x, x) for x in toks]
    if nivel >= 3:
        toks = [x for x in toks if x not in MARCAS]
    if nivel >= 4:
        toks = [x for x in toks if x not in UNIDADES and not PRES_RE.match(x)]
    return " ".join(toks)


VARIANTES = {
    0: "crudo",
    1: "minus+tildes",
    2: "+abreviaturas",
    3: "+marca fuera",
    4: "+presentacion fuera",
}

# ---------------------------------------------------------------- cliente ollama


def _post(ruta: str, payload: dict, timeout: int = 180) -> dict:
    req = urllib.request.Request(
        BASE + ruta,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def _get(ruta: str, timeout: int = 10) -> dict:
    with urllib.request.urlopen(BASE + ruta, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def embed(modelo: str, textos: list[str], keep_alive: str | None = None) -> tuple[np.ndarray, dict]:
    """Devuelve matriz (n, dim) normalizada L2 y los metadatos de tiempo de la API."""
    payload = {"model": modelo, "input": textos}
    if keep_alive is not None:
        payload["keep_alive"] = keep_alive
    r = _post("/api/embed", payload)
    m = np.array(r["embeddings"], dtype=np.float32)
    n = np.linalg.norm(m, axis=1, keepdims=True)
    n[n == 0] = 1.0
    return m / n, r


def modelos_embedding() -> list[str]:
    tags = _get("/api/tags")
    out = []
    for m in tags.get("models", []):
        caps = m.get("capabilities") or []
        if "embedding" in caps:
            out.append(m["name"])
    return out


def descargar_modelo(modelo: str) -> None:
    """ollama pull via API de streaming (solo si falta)."""
    req = urllib.request.Request(
        BASE + "/api/pull",
        data=json.dumps({"model": modelo, "stream": False}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=3600) as r:
        json.loads(r.read().decode())


# ---------------------------------------------------------------- experimento


def cargar() -> dict:
    return json.loads((AQUI / "dataset.json").read_text(encoding="utf-8"))


def entradas_catalogo(cat: list[dict], nivel: int) -> tuple[list[str], list[str]]:
    """Devuelve (textos, producto_id) de nombre + alias, normalizados y deduplicados."""
    textos, ids, vistos = [], [], set()
    for p in cat:
        for t in [p["nombre"]] + list(p.get("alias") or []):
            n = normalizar(t, nivel).strip()
            if not n or (n, p["id"]) in vistos:
                continue
            vistos.add((n, p["id"]))
            textos.append(n)
            ids.append(p["id"])
    return textos, ids


def evaluar(modelo: str, cat: list[dict], items: list[dict], nivel: int) -> dict:
    txt_cat, id_cat = entradas_catalogo(cat, nivel)
    norm_cat = set(txt_cat)
    emb_cat, _ = embed(modelo, txt_cat)
    txt_items = [normalizar(i["texto"], nivel) for i in items]
    emb_items, _ = embed(modelo, txt_items)

    prod_ids = [p["id"] for p in cat]
    idx = {pid: k for k, pid in enumerate(prod_ids)}
    # matriz producto -> entradas
    filas = [[] for _ in prod_ids]
    for j, pid in enumerate(id_cat):
        if pid in idx:
            filas[idx[pid]].append(j)

    filas_out = []
    for k, it in enumerate(items):
        sims = emb_items[k] @ emb_cat.T  # (n_entradas,)
        punt = {pid: float(np.max(sims[js])) for pid, js in zip(prod_ids, filas) if js}
        orden = sorted(punt.items(), key=lambda x: -x[1])
        s1_id, s1 = orden[0]
        s2_id, s2 = orden[1]
        top3 = [p for p, _ in orden[:3]]
        filas_out.append(
            {
                "id": it["id"],
                "texto": it["texto"],
                "texto_norm": txt_items[k],
                "esperado": it.get("esperado"),
                "dificil": bool(it.get("dificil")),
                "nota": it.get("nota"),
                "identico": txt_items[k] in norm_cat,
                "top1": s1_id,
                "s1": round(s1, 4),
                "s2_id": s2_id,
                "s2": round(s2, 4),
                "margen": round(s1 - s2, 4),
                "top3": top3,
            }
        )

    # decision
    for f in filas_out:
        if f["s1"] >= TAU and f["margen"] >= MARGEN:
            f["estado"] = "confirmado"
        elif f["s1"] >= PISO:
            f["estado"] = "por_revisar"
        else:
            f["estado"] = "desconocido"

    con_etiqueta = [f for f in filas_out if f["esperado"]]
    negativos = [f for f in filas_out if not f["esperado"]]
    aciertos1 = [f for f in con_etiqueta if f["top1"] == f["esperado"]]
    aciertos3 = [f for f in con_etiqueta if f["esperado"] in f["top3"]]
    # subconjunto sin identidad de cadena: el que de verdad mide el modelo
    sem = [f for f in con_etiqueta if not f["identico"]]
    sem_ok = [f for f in sem if f["top1"] == f["esperado"]]
    confirmados = [f for f in filas_out if f["estado"] == "confirmado"]
    conf_ok = [f for f in confirmados if f["esperado"] and f["top1"] == f["esperado"]]
    conf_mal = [f for f in confirmados if not (f["esperado"] and f["top1"] == f["esperado"])]

    return {
        "modelo": modelo,
        "nivel": nivel,
        "variante": VARIANTES[nivel],
        "dim": int(emb_cat.shape[1]),
        "n_entradas": len(txt_cat),
        "acc1": len(aciertos1) / len(con_etiqueta),
        "acc3": len(aciertos3) / len(con_etiqueta),
        "identicos": sum(1 for f in filas_out if f["identico"]),
        "n_sem": len(sem),
        "acc1_sem": (len(sem_ok) / len(sem)) if sem else None,
        "n_etiquetados": len(con_etiqueta),
        "confirmados": len(confirmados),
        "prec_auto": (len(conf_ok) / len(confirmados)) if confirmados else None,
        "conf_mal": [(f["texto"], f["esperado"], f["top1"]) for f in conf_mal],
        "revision": sum(1 for f in filas_out if f["estado"] != "confirmado") / len(filas_out),
        "desconocidos": sum(1 for f in filas_out if f["estado"] == "desconocido") / len(filas_out),
        "negativos_ok": sum(1 for f in negativos if f["estado"] != "confirmado"),
        "negativos": len(negativos),
        "errores": [(f["texto"], f["esperado"], f["top1"], f["s1"], f["margen"]) for f in con_etiqueta if f["top1"] != f["esperado"]],
        "dificiles_ok": sum(1 for f in con_etiqueta if f["dificil"] and f["top1"] == f["esperado"]),
        "dificiles": sum(1 for f in con_etiqueta if f["dificil"]),
        "filas": filas_out,
    }


def matriz_confusion(filas: list[dict]) -> dict[tuple[str, str], int]:
    m: dict[tuple[str, str], int] = {}
    for f in filas:
        if f["esperado"] and f["top1"] != f["esperado"]:
            k = (f["esperado"], f["top1"])
            m[k] = m.get(k, 0) + 1
    return m


def medir_latencia(modelo: str, textos: list[str]) -> dict:
    """Cold start (descarga el modelo de VRAM primero) + latencia caliente por item."""
    out: dict = {}
    try:
        _post("/api/embed", {"model": modelo, "input": "x", "keep_alive": 0})
        time.sleep(1.2)
    except Exception:
        pass
    t0 = time.perf_counter()
    _, meta = embed(modelo, textos[:1])
    out["frio_s"] = round(time.perf_counter() - t0, 3)
    out["load_duration_s"] = round(meta.get("load_duration", 0) / 1e9, 3)
    out["total_duration_s"] = round(meta.get("total_duration", 0) / 1e9, 3)

    # caliente: una llamada por item, como haria la PWA item a item
    lat = []
    for t in textos:
        t0 = time.perf_counter()
        embed(modelo, [t])
        lat.append((time.perf_counter() - t0) * 1000)
    lat.sort()
    out["p50_ms"] = round(statistics.median(lat), 1)
    out["p90_ms"] = round(lat[int(0.9 * (len(lat) - 1))], 1)
    out["min_ms"] = round(lat[0], 1)

    # lote de 10 (una boleta)
    t0 = time.perf_counter()
    embed(modelo, textos[:10])
    out["lote10_ms"] = round((time.perf_counter() - t0) * 1000, 1)

    try:
        ps = _get("/api/ps")
        base = modelo.split(":")[0]
        for m in ps.get("models", []):
            if m.get("name", "").split(":")[0] == base or m.get("model", "").split(":")[0] == base:
                out["ram_mb"] = round(m.get("size", 0) / 1e6, 1)
                out["vram_mb"] = round(m.get("size_vram", 0) / 1e6, 1)
                out["procesador"] = "GPU" if m.get("size_vram", 0) > 0.9 * m.get("size", 1) else "CPU/parcial"
    except Exception:
        pass
    return out


# ---------------------------------------------------------------- salida


def tabla(resultados: list[dict]) -> str:
    h = ("| Modelo | Variante | dim | ident. | acc@1 | acc@1 sin ident. | acc@3 | confirmados | prec.auto | revision | desconoc. | dificiles |")
    sep = "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|"
    lineas = [h, sep]
    for r in resultados:
        pa = f"{r['prec_auto']*100:.0f}%" if r["prec_auto"] is not None else "—"
        sem = f"{r['acc1_sem']*100:.1f}% (n={r['n_sem']})" if r["acc1_sem"] is not None else "—"
        lineas.append(
            f"| {r['modelo']} | {r['variante']} | {r['dim']} | {r['identicos']}/{len(r['filas'])} | "
            f"{r['acc1']*100:.1f}% | {sem} | "
            f"{r['acc3']*100:.1f}% | {r['confirmados']}/{len(r['filas'])} | {pa} | "
            f"{r['revision']*100:.1f}% | {r['desconocidos']*100:.1f}% | "
            f"{r['dificiles_ok']}/{r['dificiles']} |"
        )
    return "\n".join(lineas)


def calibrar(filas: list[dict]) -> list[tuple[float, float, int, float, float]]:
    """Grilla (tau, margen): devuelve los puntos con precision de auto-aceptados = 100%,
    ordenados por mas confirmados. 'Correcto' exige top1 == esperado; un negativo
    (esperado null) confirmado cuenta como falso positivo."""
    puntos = []
    for tau_i in range(50, 96):
        tau = round(tau_i / 100, 2)
        for m_i in range(0, 13):
            mg = round(m_i / 100, 2)
            conf = [f for f in filas if f["s1"] >= tau and f["margen"] >= mg]
            if not conf:
                continue
            malos = sum(1 for f in conf if not (f["esperado"] and f["top1"] == f["esperado"]))
            if malos:
                continue
            rev = sum(1 for f in filas if not (f["s1"] >= tau and f["margen"] >= mg)) / len(filas)
            puntos.append((tau, mg, len(conf), rev, conf and max(f["s1"] for f in conf)))
    puntos.sort(key=lambda x: (-x[2], -x[0]))
    return puntos


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--modelos", default="", help="coma-separados; vacio = todos los instalados")
    ap.add_argument("--variantes", default="0,1,2,3,4")
    ap.add_argument("--latencia", action="store_true")
    ap.add_argument("--json", dest="json_out", default="")
    args = ap.parse_args()

    data = cargar()
    disponibles = modelos_embedding()
    modelos = [m.strip() for m in args.modelos.split(",") if m.strip()] or disponibles
    faltan = [m for m in modelos if not any(d == m or d.startswith(m + ":") for d in disponibles)]
    for m in faltan:
        print(f"[pull] bajando {m} ...", flush=True)
        descargar_modelo(m)

    print(f"# Entorno: {BASE} | modelos de embedding instalados: {', '.join(disponibles) or 'ninguno'}")
    print(f"# Umbrales del plan 08: tau={TAU}  margen={MARGEN}  piso={PISO}")
    print(f"# Items: {len(data['items'])} ({sum(1 for i in data['items'] if i.get('esperado'))} etiquetados + "
          f"{sum(1 for i in data['items'] if not i.get('esperado'))} negativos) | "
          f"catalogo: {len(data['catalogo'])} productos")
    print()

    niveles = [int(x) for x in args.variantes.split(",")]
    resultados = []
    for modelo in modelos:
        for nivel in niveles:
            r = evaluar(modelo, data["catalogo"], data["items"], nivel)
            resultados.append(r)
            print(f"[ok] {modelo} | {r['variante']} | acc@1={r['acc1']*100:.1f}%", flush=True)

    print("\n## Tabla principal\n")
    print(tabla(resultados))
    print("\n> `ident.` = items cuya forma normalizada coincide literalmente con una entrada del "
          "catalogo (los resuelve el alias exacto, no el modelo). `acc@1 sin ident.` mide solo el "
          "resto, que es la parte que el embedding tiene que resolver de verdad.")

    print("\n## Calibracion de umbral (grilla tau x margen, precision de auto-aceptados = 100%)\n")
    print("> Puntos que no auto-confirman ni un error. Sobre n=32 es indicativo, no definitivo "
          "(el plan calibra con 60).\n")
    print("| Modelo | Variante | tau* | margen* | confirmados | revision | puntos validos |")
    print("|---|---|---:|---:|---:|---:|---:|")
    for r in resultados:
        pts = calibrar(r["filas"])
        if not pts:
            print(f"| {r['modelo']} | {r['variante']} | n/a | n/a | 0 | 100% | 0 |")
            continue
        tau, mg, n, rev, _ = pts[0]
        print(f"| {r['modelo']} | {r['variante']} | {tau:.2f} | {mg:.2f} | {n}/{len(r['filas'])} | "
              f"{rev*100:.1f}% | {len(pts)} |")

    print("\n## Errores de top-1 (por modelo y variante)\n")
    for r in resultados:
        if r["errores"]:
            print(f"### {r['modelo']} | {r['variante']}")
            for t, esp, got, s1, mg in r["errores"]:
                print(f"  - {t!r}: esperado {esp} -> {got} (s1={s1}, margen={mg})")
            if r["conf_mal"]:
                for t, esp, got in r["conf_mal"]:
                    print(f"  !! AUTO-CONFIRMADO MAL: {t!r} {esp} -> {got}")
            print()

    print("## Matriz de confusion (esperado -> top1), solo errores\n")
    for r in resultados:
        m = matriz_confusion(r["filas"])
        if m:
            print(f"### {r['modelo']} | {r['variante']}")
            for (esp, got), n in sorted(m.items(), key=lambda x: -x[1]):
                print(f"  {esp:20s} -> {got:20s} x{n}")
            print()

    # detalle del mejor resultado por modelo
    print("## Detalle del mejor item a item (mejor variante por acc@1)\n")
    for modelo in modelos:
        propios = [r for r in resultados if r["modelo"] == modelo]
        if not propios:
            continue
        mejor = max(propios, key=lambda r: (r["acc1"], r["acc3"], -r["identicos"], -r["revision"]))
        print(f"### {modelo} | {mejor['variante']} (acc@1={mejor['acc1']*100:.1f}%)")
        print(f"{'id':4} {'texto':26} {'esperado':18} {'top1':18} {'s1':>6} {'s2':>6} {'marg':>6} estado")
        for f in mejor["filas"]:
            print(f"{f['id']:4} {f['texto'][:26]:26} {str(f['esperado'])[:18]:18} {f['top1'][:18]:18} "
                  f"{f['s1']:6.3f} {f['s2']:6.3f} {f['margen']:6.3f} {f['estado']}")
        print()

    # ---------------------------------------------------- stress: catalogo grande
    stress = []
    vpath = AQUI / "vecinos.json"
    if vpath.exists():
        vec = json.loads(vpath.read_text(encoding="utf-8"))
        cat_full = data["catalogo"] + vec["catalogo_vecinos"]
        items_full = data["items"] + vec["items_vecinos"]
        # Con el catalogo ampliado, "POLLO VIVO" deja de ser un negativo: ahora es un
        # producto real, asi que confirmarlo es correcto. Se re-etiqueta para no
        # contar un falso positivo inexistente.
        items_amp = [dict(it) for it in data["items"]]
        for it in items_amp:
            if it["id"] == "q31":
                it["esperado"] = "pollo_vivo"
                it["nota"] = "con pollo_vivo en el catalogo debe resolverlo, no rechazarlo"
        print("## Stress: el mismo catalogo + 15 vecinos lexicos (21 -> 36 productos)\n")
        print(f"Catalogo ampliado: {len(cat_full)} productos. Items nuevos: {len(vec['items_vecinos'])}.\n")
        print("> En el escenario ampliado el item `POLLO VIVO` se re-etiqueta como `pollo_vivo` "
              "(existe en el catalogo), asi que la base y el ampliado no tienen exactamente el mismo "
              "conteo de etiquetas.\n")
        print("| Escenario | Modelo | Variante | acc@1 | acc@1 sin ident. | prec.auto | revision |")
        print("|---|---|---|---:|---:|---:|---:|")
        for modelo in modelos:
            for nivel in [n for n in niveles if n in (1, 3)] or [niveles[0]]:
                base = next((r for r in resultados if r["modelo"] == modelo and r["nivel"] == nivel), None)
                rA = evaluar(modelo, cat_full, items_amp, nivel)
                rB = evaluar(modelo, cat_full, vec["items_vecinos"], nivel)
                rC = evaluar(modelo, cat_full, items_full, nivel)
                rD = evaluar(modelo, cat_full, vec.get("items_ocr", []), nivel) if vec.get("items_ocr") else None
                stress += [x for x in (rA, rB, rC, rD) if x is not None]
                for nombre, r in (("21 prod / 30 items (base)", base),
                                  ("36 prod / 30 items", rA),
                                  ("36 prod / 15 vecinos", rB),
                                  ("36 prod / 9 items con ruido OCR", rD),
                                  ("36 prod / 47 items (45 etiq.)", rC)):
                    if r is None:
                        continue
                    pa = f"{r['prec_auto']*100:.0f}%" if r["prec_auto"] is not None else "n/a"
                    sem = f"{r['acc1_sem']*100:.1f}% (n={r['n_sem']})" if r["acc1_sem"] is not None else "n/a"
                    print(f"| {nombre} | {modelo} | {r['variante']} | {r['acc1']*100:.1f}% | {sem} | "
                          f"{pa} | {r['revision']*100:.1f}% |")
        print()
        print("### Errores en el catalogo ampliado\n")
        for r in stress:
            if r["errores"]:
                print(f"#### {r['modelo']} | {r['variante']} | {r['n_etiquetados']} items")
                for t, esp, got, s1, mg in r["errores"]:
                    print(f"  - {t!r}: esperado {esp} -> {got} (s1={s1}, margen={mg})")
                if r["conf_mal"]:
                    for t, esp, got in r["conf_mal"]:
                        print(f"  !! AUTO-CONFIRMADO MAL: {t!r} {esp} -> {got}")
                print()

    lat_all = {}
    if args.latencia:
        print("## Rendimiento\n")
        print("| Modelo | frio (carga) | p50/item | p90/item | lote 10 | RAM | VRAM | procesador |")
        print("|---|---:|---:|---:|---:|---:|---:|---|")
        textos = [i["texto"] for i in data["items"]]
        for modelo in modelos:
            L = medir_latencia(modelo, textos)
            lat_all[modelo] = L
            print(f"| {modelo} | {L.get('frio_s')}s (load_duration {L.get('load_duration_s')}s) | "
                  f"{L.get('p50_ms')} ms | {L.get('p90_ms')} ms | {L.get('lote10_ms')} ms | "
                  f"{L.get('ram_mb')} MB | {L.get('vram_mb')} MB | {L.get('procesador', '?')} |")
        print()

    if args.json_out:
        salida = {
            "umbrales": {"tau": TAU, "margen": MARGEN, "piso": PISO},
            "resultados": [{k: v for k, v in r.items() if k != "filas"} for r in resultados],
            "stress": [{k: v for k, v in r.items() if k != "filas"} for r in stress],
            "latencia": lat_all,
            "detalle": {f"{r['modelo']}|{r['variante']}": r["filas"] for r in resultados},
        }
        (AQUI / args.json_out).write_text(json.dumps(salida, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"[json] escrito en {args.json_out}")
    return 0


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    try:
        sys.exit(main())
    except urllib.error.URLError as e:
        print(f"ERROR: no responde Ollama en {BASE} ({e})", file=sys.stderr)
        sys.exit(2)
