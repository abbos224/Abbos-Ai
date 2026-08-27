# Abbos Ai

AI-powered video repurposing app. Upload a long video (interview, podcast, lecture) and it finds
the best moments, cuts them into vertical 9:16 Reels/Shorts with dynamic captions and an AI-written
hook, ready to export.

> Record once. Post all month.

This is **MVP v1**: Upload → Transcribe → AI finds best clips → 9:16 crop → remove silence →
dynamic captions → AI hook → export.

## Project structure

```
/server   Node.js + TypeScript backend: upload API, transcription, AI clip analysis, ffmpeg pipeline
/mobile   Expo (React Native + TypeScript) app: upload, processing status, results, preview/export
```

## Prerequisites

- [Node.js](https://nodejs.org) (LTS)
- [ffmpeg](https://ffmpeg.org) on your `PATH`
- An [Anthropic API key](https://console.anthropic.com) (Claude — finds best clips, writes hooks)
- An [AssemblyAI API key](https://www.assemblyai.com) (speech transcription with word timestamps)
- The [Expo Go](https://expo.dev/go) app on your phone, on the **same Wi-Fi** as your computer

## Setup

### 1. Backend

```bash
cd server
copy .env.example .env
```

Open `.env` and paste in your `ANTHROPIC_API_KEY` and `ASSEMBLYAI_API_KEY`.

```bash
npm install
npm run dev
```

Server runs at `http://localhost:4000`.

### 2. Mobile app

Edit `mobile/src/config.ts` and set `API_BASE_URL` to your computer's **LAN IP** (not
`localhost` — your phone needs to reach it over Wi-Fi). Find it with `ipconfig` (look for your
Wi-Fi adapter's IPv4 address, not a VPN adapter).

```bash
cd mobile
npm install
npx expo start
```

Scan the QR code with your phone's camera app to open the project in Expo Go.

## Notes

- Backend job/clip metadata is stored in a plain JSON file (`server/storage/db.json`) — no
  database setup needed for MVP scale.
- Rendered clips and uploads are kept on local disk under `server/storage/` (gitignored).
- Mobile app currently targets **Expo SDK 54**, to match what Expo Go supports on the Apple App
  Store (Apple has not approved newer Expo Go SDK builds as of this writing).

## Roadmap

See the project plan for the staged roadmap (v2: B-roll, music, AI CTA, cover, multi-language;
v3: publishing, analytics, content calendar, brand kit; v4: full "30 days of content" generation).
