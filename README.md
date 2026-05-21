# Mobile LCA — LiveCallAssistant (Mobile Web)

## What is this?
AI-powered interview assistant that runs in iPhone Safari.
Listens to interviewer questions via mic, transcribes with Groq Whisper,
shows streaming AI answers on screen in real time.
No App Store, no installation — just open in Safari and Add to Home Screen.

## Live App
https://mobile-lca.vercel.app

## How to use
1. Open URL in iPhone Safari
2. Share → Add to Home Screen → Launch
3. Settings → add API keys (Groq + OpenAI or Anthropic)
4. Set your target Role and Company
5. Put phone on desk, interviewer on speakerphone
6. Tap START SESSION
7. Tap MUTE while you answer, tap UNMUTE when interviewer speaks
8. Read answers from screen

## Tech Stack
- React + Vite + TypeScript
- Tailwind CSS (dark cockpit aesthetic, Space Mono font)
- Zustand state management
- Deployed on Vercel

## Answer Pipeline
- Tier 1: 1,563 prepared Q&A entries — keyword match, instant, no API call
- Tier 2: Runtime semantic cache — keyword match against past answers, instant
- Tier 3: GPT-4o or Claude streaming — grounded in Nithin's resume

## API Keys needed
- Groq — for Whisper transcription (free at console.groq.com)
- OpenAI — for GPT-4o answers + Tier 2 cache (if using GPT-4o)
- Anthropic — for Claude answers (if using Claude)

## Build Blocks completed
- B1 — Project scaffold + navigation + settings
- B2 — Mic capture + wave bars + wake lock
- B3 — VAD (voice activity detection) + audio chunking
- B4 — Groq Whisper transcription
- B5 — Tier 3 AI streaming (GPT-4o + Claude 3.5)
- B6 — Tier 1 Q&A bank (1,563 entries, fuzzy match)
- B7 — Conversation history (10 pairs / 20 turns)
- Mute — Manual mute + 45s auto-unmute + manual unmute button
- B8 — Tier 2 semantic cache (keyword match, IndexedDB persistence)
- B9 — UI polish + session timer + interview-ready layout
- B10 — Resume grounding (Nithin's full resume in system prompt)
- B11 — PWA manifest + home screen icon
- B12 — Tier 2 cache persistence to IndexedDB
- B13 — Conversation history UI panel (collapsible, drill-down detail)
- B14 — Custom Q&A bank upload from device
- B15 — Service worker + offline app shell
- B16 — Role and company context in settings
- B17 — T2 embedding replaced with keyword match (zero latency)

## Latency Budget (current)
- VAD silence detection: 800ms
- Groq Whisper: ~300ms
- Tier 1 match: <1ms
- Tier 2 match: <1ms
- Tier 3 AI first token: ~800ms
- Total T1 path: ~1.1s
- Total T3 path: ~3-3.5s

## Known Limitations
- Mic captures ambient sound only — no system audio on mobile browsers
- Headphone interviews won't work — must use speakerphone
- Offline voice not possible — Whisper requires network
- Safari only recommended — Chrome on iOS has mic/PWA limitations

## Backlog (next session)
- [ ] Semantic T1 upgrade — replace keyword match with embedding match
      for better paraphrase detection
- [ ] Web Speech API fallback — on-device transcription when offline
- [ ] Font size control — slider in settings for readability
- [ ] Haptic feedback — vibrate on T1/T2/T3 hits
- [ ] Network retry logic — auto-retry failed Whisper/AI calls once
- [ ] Answer playback — TTS option to hear the answer (ElevenLabs)
- [ ] Tier 1 bank editor — add/edit/delete Q&A entries from the app
- [ ] Multi-profile support — switch between different Q&A banks per role
- [ ] Android PWA testing and fixes
- [ ] iOS 16 minimum version audit

## Architecture
See earlier planning docs. Core principle: browser-native APIs only,
no native app required, deploys to Vercel in 30 seconds.

## Git
github.com/Kokkisa/mobile-lca

## Author
Nithin Kokkisa
nithinkokkisa10@gmail.com
github.com/Kokkisa
