"""Import de recettes depuis une URL — codebase Python (« recipes »).

Deux étapes, deux callables :
  1. scrape_recipe(url)        → recipe-scrapers extrait la recette brute du site
  2. categorize_recipe(recipe) → l'IA (Anthropic) catégorise pour le modèle de l'app :
     catégorie (starter/main/…), régime (omnivore/…), contraintes (sans gluten/…),
     rapide, saisonnalité (toute saison / saisons / mois précis selon les ingrédients),
     et normalise les ingrédients en {name, quantity, unit}.

Clé API : ANTHROPIC_API_KEY dans functions-py/.env (cf. .env.example, non versionné).
Modèle : ANTHROPIC_MODEL (défaut claude-sonnet-5 — la saisonnalité au mois près
demande un vrai raisonnement ; claude-haiku-4-5 est testable en changeant le .env).
"""

import ipaddress
import json
import os
import socket
from base64 import b64encode
from urllib.parse import urljoin, urlparse

import requests
from firebase_admin import initialize_app
from firebase_functions import https_fn, options
from recipe_scrapers import scrape_html

# Requis : le framework vérifie les jetons des callables via le SDK admin —
# sans cette init, TOUT jeton est rejeté ("Auth token was rejected" / req.auth None).
initialize_app()

options.set_global_options(region="europe-west1", max_instances=5)

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)
MAX_HTML_BYTES = 5 * 1024 * 1024
MAX_IMAGE_BYTES = 8 * 1024 * 1024


# ── Garde-fous URL (anti-SSRF basique) ─────────────────────────────────────

def _normalize_url(url: str) -> str:
    """Les liens collés arrivent souvent sans schéma (« www.hellofresh.fr/… »)."""
    url = str(url or "").strip()
    if url and not url.lower().startswith(("http://", "https://")):
        url = f"https://{url}"
    return url


def _assert_public_http_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise https_fn.HttpsError("invalid-argument", "URL invalide.")
    try:
        infos = socket.getaddrinfo(parsed.hostname, None)
    except socket.gaierror:
        raise https_fn.HttpsError("invalid-argument", "Hôte introuvable.")
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            raise https_fn.HttpsError("invalid-argument", "URL non autorisée.")


def _require_auth(req: https_fn.CallableRequest) -> None:
    if req.auth is None:
        raise https_fn.HttpsError("unauthenticated", "Connexion requise.")


# ── Étape 1 : scraping ─────────────────────────────────────────────────────

def _safe(getter, default=None):
    """recipe-scrapers lève sur chaque champ absent — on collecte en best-effort."""
    try:
        value = getter()
        return value if value is not None else default
    except Exception:
        return default


def _download_image_as_data_url(image_url: str, page_url: str) -> str:
    try:
        absolute = urljoin(page_url, image_url)
        _assert_public_http_url(absolute)
        response = requests.get(
            absolute,
            headers={"User-Agent": USER_AGENT, "Referer": page_url},
            timeout=15,
            stream=True,
        )
        response.raise_for_status()
        content_type = response.headers.get("content-type", "").split(";")[0].strip()
        if not content_type.startswith("image/"):
            return ""
        data = response.raw.read(MAX_IMAGE_BYTES + 1, decode_content=True)
        if len(data) > MAX_IMAGE_BYTES:
            return ""
        return f"data:{content_type};base64,{b64encode(data).decode('ascii')}"
    except https_fn.HttpsError:
        return ""
    except Exception:
        return ""


@https_fn.on_call(memory=options.MemoryOption.MB_512, timeout_sec=60)
def scrape_recipe(req: https_fn.CallableRequest) -> dict:
    _require_auth(req)
    url = _normalize_url(req.data.get("url"))
    _assert_public_http_url(url)

    try:
        response = requests.get(
            url, headers={"User-Agent": USER_AGENT}, timeout=20, stream=True
        )
        response.raise_for_status()
        html = response.raw.read(MAX_HTML_BYTES, decode_content=True).decode(
            response.encoding or "utf-8", errors="replace"
        )
    except https_fn.HttpsError:
        raise
    except Exception:
        raise https_fn.HttpsError(
            "unavailable", "Impossible de charger la page. Vérifie le lien."
        )

    try:
        scraper = scrape_html(html, org_url=url, supported_only=False)
    except Exception:
        raise https_fn.HttpsError(
            "not-found",
            "Aucune recette détectée sur cette page (pas de données structurées).",
        )

    ingredients = _safe(scraper.ingredients, []) or []
    instructions = _safe(scraper.instructions, "") or ""

    # Groupes d'ingrédients fournis par le site (souvent absents du JSON-LD :
    # l'IA les déduira des instructions si cette liste est vide)
    site_groups = []
    try:
        for group in scraper.ingredient_groups():
            if group.purpose:
                site_groups.append({
                    "purpose": str(group.purpose).strip(),
                    "ingredients": [str(i).strip() for i in (group.ingredients or [])],
                })
    except Exception:
        site_groups = []
    title = _safe(scraper.title, "") or ""
    if not title and not ingredients:
        raise https_fn.HttpsError(
            "not-found", "Aucune recette exploitable trouvée sur cette page."
        )

    image_url = _safe(scraper.image, "") or ""
    return {
        "title": title,
        "ingredients": [str(item).strip() for item in ingredients if str(item).strip()],
        "ingredient_groups": site_groups,
        "instructions": instructions,
        "yields": _safe(scraper.yields, "") or "",
        "prep_time_min": _safe(scraper.prep_time, 0) or 0,
        "cook_time_min": _safe(scraper.cook_time, 0) or 0,
        "total_time_min": _safe(scraper.total_time, 0) or 0,
        "host": _safe(scraper.host, urlparse(url).hostname or "") or "",
        "image_data_url": _download_image_as_data_url(image_url, url) if image_url else "",
    }


# ── Étape 2 : catégorisation IA ────────────────────────────────────────────

# Schéma aligné sur le modèle de RecipesView.js (CATEGORIES, FOOD_TYPES,
# CONSTRAINT_LABELS, UNITS, SEASONS/MONTHS). additionalProperties:false +
# required exigés par les structured outputs.
CATEGORIZE_SCHEMA = {
    "type": "object",
    "properties": {
        "category": {
            "type": "string",
            "enum": ["starter", "main", "dessert", "breakfast", "drink", "base"],
        },
        "food_type": {
            "type": "string",
            "enum": ["omnivore", "vegetarian", "vegan", "pescetarian"],
        },
        "constraints": {
            "type": "array",
            "items": {
                "type": "string",
                "enum": [
                    "gluten_free", "lactose_free", "egg_free",
                    "nut_free", "pork_free", "halal", "kosher",
                ],
            },
        },
        "quick": {"type": "boolean"},
        "availability_mode": {
            "type": "string",
            "enum": ["all_year", "season", "months"],
        },
        "seasons": {
            "type": "array",
            "items": {"type": "string", "enum": ["spring", "summer", "autumn", "winter"]},
        },
        "months": {"type": "array", "items": {"type": "integer"}},
        "servings": {"type": "integer"},
        # Traduction du titre : chaîne VIDE si la recette est déjà en français.
        "title_fr": {"type": "string"},
        # Étapes de préparation : TOUJOURS renseignées — nettoyées, une phrase
        # ou deux par étape, en français, SANS numérotation (ajoutée côté app).
        "steps": {"type": "array", "items": {"type": "string"}},
        # Condiments détectés — ids de l'app uniquement (retirés des ingrédients)
        "condiments": {
            "type": "array",
            "items": {
                "type": "string",
                "enum": [
                    "sel", "poivre", "huile_olive", "huile", "ail", "curry",
                    "cumin", "paprika", "curcuma", "gingembre", "cannelle",
                    "safran", "piment", "muscade", "ras_el_hanout",
                    "herbes_provence", "thym", "romarin", "laurier", "basilic",
                    "origan", "persil", "ciboulette", "coriandre", "menthe",
                    "sauge", "vinaigre", "sauce_soja", "moutarde", "beurre",
                    "miel", "huile_sesame", "citron",
                ],
            },
        },
        "ingredients": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "quantity": {"type": "string"},
                    "unit": {
                        "type": "string",
                        "enum": ["", "unite", "g", "kg", "ml", "cl", "l"],
                    },
                    # Groupe de préparation (« Pour la pâte sablée »…) — "" si recette simple
                    "group": {"type": "string"},
                },
                "required": ["name", "quantity", "unit", "group"],
                "additionalProperties": False,
            },
        },
    },
    "required": [
        "category", "food_type", "constraints", "quick",
        "availability_mode", "seasons", "months", "servings",
        "title_fr", "steps", "condiments", "ingredients",
    ],
    "additionalProperties": False,
}

SYSTEM_PROMPT = """Tu analyses une recette de cuisine pour l'app familiale My Rolling Day (France).
Tu reçois un JSON: titre, ingrédients bruts, instructions, portions, temps. Tu renvoies UNIQUEMENT le JSON demandé.

Règles de catégorisation:
- category: starter (entrée), main (plat), dessert, breakfast (petit-déj/goûter), drink (boisson), base (préparation de base maison: pâte, sauce, bouillon…).
- food_type: vegan si aucun produit animal; vegetarian si pas de chair animale (œufs/laitages OK); pescetarian si poisson/fruits de mer mais pas de viande; sinon omnivore.
- constraints: uniquement celles VRAIMENT respectées par la recette telle quelle (gluten_free, lactose_free, egg_free, nut_free, pork_free, halal, kosher). pork_free seulement pertinent si la recette contient de la viande mais pas de porc. halal/kosher: seulement si explicitement indiqué. Dans le doute, omettre.
- quick: true si la recette se fait en ~30 minutes ou moins au total.

Saisonnalité (le point important — raisonne sur les fruits/légumes FRAIS, saisonnalité française):
- Ignore les produits de garde et le non-périssable (pâtes, riz, farine, conserves, épices, oignon, ail, pomme de terre, carotte, viandes, poissons d'élevage…).
- Si les produits frais sont disponibles toute l'année ou que la recette n'en dépend pas: availability_mode="all_year", seasons=[], months=[].
- Si les produits frais dominants appartiennent à une ou deux saisons (ex: tomates/courgettes → été): availability_mode="season", seasons=["summer"], months=[].
- Si un ingrédient clé n'est réellement bon que sur une fenêtre de 1 à 3 mois (ex: asperges → [4,5], clémentines → [11,12,1], gariguettes → [4,5,6]): availability_mode="months", months=[…] (1=janvier … 12=décembre), seasons=[].
- Un mélange d'ingrédients de saisons opposées → all_year.

Étapes (steps — toujours renseignées):
- Découpe les instructions en étapes courtes et claires, une action principale par étape, en FRANÇAIS (traduis si besoin, convertis °F → °C et unités impériales en métrique).
- SANS numérotation en début d'étape (l'app numérote elle-même). Ne change pas le contenu culinaire: reformate et clarifie, n'invente rien.

Traduction (title_fr):
- Si la recette N'EST PAS en français: traduis le titre dans title_fr. Sinon title_fr="".

Condiments (ids de l'app):
- Mets dans condiments les assaisonnements et l'épicerie d'appoint: sel, poivre, épices, herbes, huiles (filet/cuillère), vinaigre, moutarde, sauce soja, miel, jus de citron d'assaisonnement, noix de beurre… Ils ne doivent PAS apparaître dans ingredients.
- Un produit de la liste utilisé en quantité STRUCTURANTE reste un ingrédient: 125 g de beurre pour une pâte, 200 ml de miel pour un pain d'épices → ingredients, pas condiments.
- Un condiment absent de la liste d'ids reste dans ingredients.

Ingrédients (normalisation pour l'app):
- name: nom du produit EN FRANÇAIS (traduis si besoin), simple et minuscule, sans quantité ni mode de préparation (« 200 g de farine tamisée » → « farine »). Garde les précisions utiles (« crème liquide », « sucre glace »).
- group: si la recette comporte plusieurs préparations distinctes (pâte, garniture, crème, sauce, meringue…), regroupe avec un intitulé court (« Pour la pâte sablée ») déduit des instructions — utilise les intitulés du site s'ils sont fournis dans ingredient_groups. Les ingrédients d'un même groupe doivent être CONSÉCUTIFS. Recette simple: group="" partout.
- Recette non française: convertis aussi les quantités en métrique (1 cup de farine ≈ 120 g, 1 cup de liquide ≈ 240 ml, 1 oz ≈ 28 g, 1 stick de beurre ≈ 113 g).
- quantity: nombre en chaîne, point décimal (« 0.5 »), ou "" si non quantifié.
- unit: parmi "", unite, g, kg, ml, cl, l. Convertis ce qui s'en rapproche: cuillères/pincées/gousses/sachets → unit="" et mets la précision dans name (« sucre vanillé (1 sachet) » → name="sucre vanillé", quantity="1", unit="unite" si dénombrable, sinon quantity="", unit=""). Pièces dénombrables (œufs, citrons) → unit="unite".
- servings: nombre de portions (extrait de yields, sinon estime; 4 par défaut)."""


def _anthropic_categorize(payload: dict) -> dict:
    import anthropic

    model = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-5").strip()
    client = anthropic.Anthropic()  # lit ANTHROPIC_API_KEY

    response = client.messages.create(
        model=model,
        # Cap pensée adaptative + JSON. Large : la traduction des instructions
        # peut représenter plusieurs milliers de tokens en plus des catégories.
        max_tokens=16000,
        system=SYSTEM_PROMPT,
        messages=[{
            "role": "user",
            "content": json.dumps(payload, ensure_ascii=False),
        }],
        output_config={"format": {"type": "json_schema", "schema": CATEGORIZE_SCHEMA}},
    )
    if response.stop_reason == "refusal":
        raise https_fn.HttpsError("internal", "Analyse refusée par le modèle.")
    if response.stop_reason == "max_tokens":
        raise https_fn.HttpsError("internal", "Réponse du modèle tronquée.")
    text = next((b.text for b in response.content if b.type == "text"), "")
    return json.loads(text)


@https_fn.on_call(memory=options.MemoryOption.MB_512, timeout_sec=120)
def categorize_recipe(req: https_fn.CallableRequest) -> dict:
    _require_auth(req)
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise https_fn.HttpsError(
            "failed-precondition",
            "ANTHROPIC_API_KEY manquante côté serveur (functions-py/.env).",
        )

    recipe = req.data.get("recipe") or {}
    payload = {
        "titre": str(recipe.get("title") or "")[:300],
        "portions": str(recipe.get("yields") or "")[:100],
        "temps_total_min": int(recipe.get("total_time_min") or 0),
        "ingredients": [str(i)[:200] for i in (recipe.get("ingredients") or [])][:60],
        "ingredient_groups": recipe.get("ingredient_groups") or [],
        "instructions": str(recipe.get("instructions") or "")[:6000],
    }
    if not payload["ingredients"]:
        raise https_fn.HttpsError("invalid-argument", "Aucun ingrédient à analyser.")

    try:
        result = _anthropic_categorize(payload)
    except https_fn.HttpsError:
        raise
    except Exception:
        raise https_fn.HttpsError("internal", "L'analyse IA a échoué. Réessaie.")

    # Validation défensive (le schéma ne borne pas les mois)
    result["months"] = [m for m in result.get("months", []) if isinstance(m, int) and 1 <= m <= 12]
    if result.get("availability_mode") == "season" and not result.get("seasons"):
        result["availability_mode"] = "all_year"
    if result.get("availability_mode") == "months" and not result["months"]:
        result["availability_mode"] = "all_year"
    if not isinstance(result.get("servings"), int) or result["servings"] <= 0:
        result["servings"] = 4
    result["title_fr"] = str(result.get("title_fr") or "").strip()
    result["steps"] = [str(s).strip() for s in (result.get("steps") or []) if str(s).strip()]
    result["condiments"] = [str(c) for c in (result.get("condiments") or [])]
    return result
