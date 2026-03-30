"""
Model Manager — веб-интерфейс для управления моделями OpenClaw + Alem.Cloud
Запуск: python server.py
Открыть: http://localhost:5050
"""

import json, os, subprocess, sys
from pathlib import Path
from flask import Flask, request, jsonify, send_from_directory
from dotenv import load_dotenv
import requests as req

# --- paths ---
BASE_DIR = Path(__file__).parent
ENV_PATH = BASE_DIR / ".env"
OPENCLAW_JSON = Path(r"E:\Users\rasla\.openclaw\openclaw.json")
ALEM_BASE_URL = "https://llm.nitec.kz"
SESSIONS_JSON = Path(r"E:\Users\rasla\.openclaw\agents\main\sessions\sessions.json")

load_dotenv(ENV_PATH)

app = Flask(__name__, static_folder="static")


# ── helpers ──────────────────────────────────────────────────────
def read_config():
    return json.loads(OPENCLAW_JSON.read_text(encoding="utf-8"))


def write_config(data):
    OPENCLAW_JSON.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def get_api_key():
    load_dotenv(ENV_PATH, override=True)
    return os.getenv("ALEM_CLOUD_API_KEY", "")


def save_api_key(key: str):
    lines = []
    found = False
    if ENV_PATH.exists():
        for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
            if line.startswith("ALEM_CLOUD_API_KEY"):
                lines.append(f"ALEM_CLOUD_API_KEY={key}")
                found = True
            else:
                lines.append(line)
    if not found:
        lines.append(f"ALEM_CLOUD_API_KEY={key}")
    ENV_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")
    os.environ["ALEM_CLOUD_API_KEY"] = key


# ── API routes ───────────────────────────────────────────────────
@app.get("/")
def index():
    return send_from_directory(BASE_DIR, "index.html")


@app.get("/api/status")
def api_status():
    cfg = read_config()
    defaults = cfg.get("agents", {}).get("defaults", {})
    primary = defaults.get("model", {}).get("primary", "")
    fallbacks = defaults.get("model", {}).get("fallbacks", [])
    models_map = defaults.get("models", {})
    providers = cfg.get("models", {}).get("providers", {})
    has_alem = "alem" in providers
    api_key = get_api_key()
    return jsonify({
        "primary": primary,
        "fallbacks": fallbacks,
        "models": list(models_map.keys()),
        "providers": list(providers.keys()),
        "has_alem": has_alem,
        "api_key_set": bool(api_key and api_key.strip()),
        "api_key_preview": (api_key[:8] + "..." + api_key[-4:]) if api_key and len(api_key) > 12 else ""
    })


@app.post("/api/save-key")
def save_key():
    data = request.json
    key = data.get("key", "").strip()
    if not key:
        return jsonify({"error": "Пустой ключ"}), 400
    save_api_key(key)
    return jsonify({"ok": True})


@app.get("/api/alem-models")
def alem_models():
    key = get_api_key()
    if not key:
        return jsonify({"error": "API ключ не задан"}), 400
    try:
        r = req.get(f"{ALEM_BASE_URL}/v1/models", headers={"Authorization": f"Bearer {key}"}, timeout=15)
        r.raise_for_status()
        models = r.json().get("data", [])
        return jsonify({"models": [{"id": m["id"], "owned_by": m.get("owned_by", "")} for m in models]})
    except Exception as e:
        return jsonify({"error": str(e)}), 502


@app.post("/api/connect-alem")
def connect_alem():
    data = request.json
    model_ids = data.get("models", [])
    key = get_api_key()
    if not key:
        return jsonify({"error": "Сначала сохраните API ключ"}), 400
    if not model_ids:
        return jsonify({"error": "Выберите хотя бы одну модель"}), 400

    cfg = read_config()
    providers = cfg.setdefault("models", {}).setdefault("providers", {})
    providers["alem"] = {
        "baseUrl": f"{ALEM_BASE_URL}/v1",
        "apiKey": key,
        "api": "openai-completions",
        "models": [{"id": mid, "name": mid} for mid in model_ids]
    }
    # ensure auth profile exists for alem
    auth_profiles = cfg.setdefault("auth", {}).setdefault("profiles", {})
    if "alem:default" not in auth_profiles:
        auth_profiles["alem:default"] = {
            "provider": "alem",
            "mode": "api_key"
        }
    defaults = cfg.setdefault("agents", {}).setdefault("defaults", {})
    models_map = defaults.setdefault("models", {})
    for mid in model_ids:
        full_id = f"alem/{mid}"
        if full_id not in models_map:
            models_map[full_id] = {}
    write_config(cfg)
    return jsonify({"ok": True, "added": len(model_ids)})


@app.post("/api/disconnect-alem")
def disconnect_alem():
    cfg = read_config()
    cfg.get("models", {}).get("providers", {}).pop("alem", None)
    defaults = cfg.get("agents", {}).get("defaults", {})
    models_map = defaults.get("models", {})
    for key in list(models_map.keys()):
        if key.startswith("alem/"):
            models_map.pop(key)
    fallbacks = defaults.get("model", {}).get("fallbacks", [])
    defaults["model"]["fallbacks"] = [f for f in fallbacks if not f.startswith("alem/")]
    write_config(cfg)
    return jsonify({"ok": True})


@app.post("/api/switch-model")
def switch_model():
    data = request.json
    model_id = data.get("model", "").strip()
    if not model_id:
        return jsonify({"error": "Не указана модель"}), 400
    try:
        # 1) update default in openclaw.json
        cfg = read_config()
        cfg["agents"]["defaults"]["model"]["primary"] = model_id
        write_config(cfg)

        # 2) clear per-session overrides so gateway uses new default
        if SESSIONS_JSON.exists():
            sessions = json.loads(SESSIONS_JSON.read_text(encoding="utf-8"))
            for key, sess in sessions.items():
                if not isinstance(sess, dict):
                    continue
                for field in ["modelOverride", "providerOverride", "authProfileOverride",
                              "authProfileOverrideSource", "authProfileOverrideCompactionCount"]:
                    sess.pop(field, None)
            SESSIONS_JSON.write_text(json.dumps(sessions, indent=2, ensure_ascii=False), encoding="utf-8")

        # 3) restart gateway to apply (picks up config + cleared overrides)
        subprocess.run(
            ["openclaw", "gateway", "restart"],
            capture_output=True, text=True, timeout=30, shell=True
        )

        return jsonify({"ok": True, "model": model_id})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.post("/api/add-fallback")
def add_fallback():
    data = request.json
    model_id = data.get("model", "").strip()
    if not model_id:
        return jsonify({"error": "Не указана модель"}), 400
    cfg = read_config()
    fallbacks = cfg["agents"]["defaults"]["model"].setdefault("fallbacks", [])
    if model_id not in fallbacks:
        fallbacks.append(model_id)
    write_config(cfg)
    return jsonify({"ok": True})


@app.post("/api/remove-fallback")
def remove_fallback():
    data = request.json
    model_id = data.get("model", "").strip()
    cfg = read_config()
    fallbacks = cfg["agents"]["defaults"]["model"].get("fallbacks", [])
    cfg["agents"]["defaults"]["model"]["fallbacks"] = [f for f in fallbacks if f != model_id]
    write_config(cfg)
    return jsonify({"ok": True})


if __name__ == "__main__":
    print("Model Manager -> http://localhost:5050")
    app.run(host="127.0.0.1", port=5050, debug=False)
