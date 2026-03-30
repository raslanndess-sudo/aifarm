import json
import os
import sys
import urllib.request

def load_api_key():
    key = os.environ.get("SERPER_API_KEY")
    if key:
        return key.strip()
    key_path = os.path.expanduser(r"~/.openclaw/secrets/serper.key")
    if os.path.exists(key_path):
        with open(key_path, "r", encoding="utf-8") as fh:
            return fh.read().strip()
    raise RuntimeError("SERPER API key not found")

def search(query, num=10):
    api_key = load_api_key()
    endpoint = "https://google.serper.dev/search"
    payload = {
        "q": query,
        "num": num,
        "gl": "us",
        "hl": "en"
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(endpoint, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("X-API-KEY", api_key)
    with urllib.request.urlopen(req, timeout=30) as resp:
        body = resp.read()
    return json.loads(body)

def main():
    if len(sys.argv) < 2:
        print("Usage: python serper_search.py <query>")
        sys.exit(1)
    query = " ".join(sys.argv[1:])
    results = search(query)
    organic = results.get("organic", [])
    for idx, item in enumerate(organic[:10], start=1):
        title = item.get("title", "").strip()
        link = item.get("link", "").strip()
        snippet = (item.get("snippet") or item.get("snippetHighlighted") or "").strip()
        print(f"{idx}. {title}\n   {snippet}\n   {link}\n")

if __name__ == "__main__":
    main()
