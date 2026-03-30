"""
Тест авторизации YouTube API
"""
import os
import json
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

CLIENT_SECRET = r"E:\Users\rasla\Downloads\client_secret_974176685177-nft5kg90h0717dr2mvvvt1laahbcsukv.apps.googleusercontent.com.json"
TOKEN_FILE = r"E:\Users\rasla\.openclaw\workspace\yt-comments\token.json"

SCOPES = [
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/youtube.force-ssl",
]

def get_credentials():
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request

    creds = None
    if os.path.exists(TOKEN_FILE):
        creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRET, SCOPES)
            creds = flow.run_local_server(port=8080)
        with open(TOKEN_FILE, "w") as f:
            f.write(creds.to_json())

    return creds

def main():
    print("Подключаемся к YouTube API...")
    creds = get_credentials()
    youtube = build("youtube", "v3", credentials=creds)

    # Получаем свои каналы
    request = youtube.channels().list(part="snippet,statistics", mine=True)
    response = request.execute()

    items = response.get("items", [])
    if not items:
        print("Каналы не найдены.")
        return

    for ch in items:
        snippet = ch["snippet"]
        stats = ch["statistics"]
        print(f"\n✅ Канал: {snippet['title']}")
        print(f"   ID: {ch['id']}")
        print(f"   Подписчики: {stats.get('subscriberCount', '?')}")
        print(f"   Видео: {stats.get('videoCount', '?')}")

if __name__ == "__main__":
    main()
