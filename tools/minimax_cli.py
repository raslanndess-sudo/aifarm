#!/usr/bin/env python3
"""CLI для обращения к локальной LM Studio модели minimax"""
import argparse
import json
import sys
import requests

API_URL = "http://10.100.0.15:1234/v1/chat/completions"
MODEL = "minimax-m2-her-4b"


def main():
    parser = argparse.ArgumentParser(description="Send prompt to local minimax model")
    parser.add_argument("prompt", nargs="*", help="User prompt text")
    parser.add_argument("-f", "--file", dest="file", help="Read prompt from file")
    parser.add_argument("-m", "--model", default=MODEL, help="Model name")
    parser.add_argument("-t", "--temperature", type=float, default=0.7)
    args = parser.parse_args()

    if args.file:
        prompt = open(args.file, "r", encoding="utf-8").read()
    else:
        prompt = " ".join(args.prompt).strip()

    if not prompt:
        print("Empty prompt", file=sys.stderr)
        sys.exit(1)

    payload = {
        "model": args.model,
        "messages": [
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": prompt}
        ],
        "temperature": args.temperature,
        "max_tokens": 600,
    }

    resp = requests.post(API_URL, json=payload, timeout=60)
    resp.raise_for_status()
    data = resp.json()
    content = data["choices"][0]["message"]["content"].strip()
    print(content)


if __name__ == "__main__":
    main()
