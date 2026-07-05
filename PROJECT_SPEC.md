# AirSense — Locked Project Specification

**Status: FINAL. Do not add, remove, or change scope from this document mid-build.**
If something feels missing while building, note it in a file called `IDEAS_FOR_LATER.md` instead of changing this spec or the code structure. This file is the single source of truth for every AI tool (Copilot, Antigravity, OpenCode, or any other) working on this project. Any AI assistant working on this codebase should read this entire file before writing or changing any code.

---

## 1. What this project is

AirSense is an AI-powered urban air quality intelligence platform built for the ET AI Hackathon 2026, Problem Statement 5 ("AI-Powered Urban Air Quality Intelligence for Smart City Intervention"). It fuses live government air quality data, weather data, and open geographic data into a single dashboard that: forecasts AQI 24-72 hours ahead, generates AI health advisories in multiple languages, reasons about likely pollution sources, ranks zones for enforcement priority, and compares multiple cities — all driven by live, real API data, not mock/sample data.

Built solo, for a working-prototype hackathon round. Optimized for: correctness, demo-ability, and finishability — not maximum feature count.

## 2. Final feature list (nothing more, nothing less)

1. **Live data ingestion** — real AQI (OpenAQ), real weather (OpenWeatherMap), real hospital/school locations (OpenStreetMap Overpass API)
2. **Real interactive map** (Leaflet.js) — actual map tiles, real station coordinates, color-coded by live AQI, with a heatmap interpolation layer
3. **Forecasting engine** (XGBoost) — 24/48/72hr AQI forecast per monitored city, benchmarked against a naive persistence baseline, with the improvement percentage displayed on screen
4. **LLM advisory agent** (Google Gemini API, free tier) — three distinct prompts reused across three UI surfaces:
   - Health advisory generation (multilingual: English + 2 regional languages)
   - Source attribution reasoning (with a displayed confidence score)
   - Free-text citizen chat Q&A
5. **Enforcement priority queue** — ranked list of zones by severity × trend × unexplained cause, generated from data already collected (no new data source)
6. **Multi-city comparison strip** — side-by-side current AQI + trend for all monitored cities
7. **Vulnerability overlay** — schools/hospitals plotted on the map, flagged if inside a currently severe zone

## 3. Explicitly OUT of scope (do not build these — say so if asked)

- Satellite imagery / Sentinel / MODIS processing — documented only in the architecture diagram as future roadmap
- IVR / phone system integration — mentioned only in the pitch deck as future scalability
- Real WhatsApp Business API integration — the chat UI simulates this experience in-browser only
- User accounts, authentication, login systems
- Mobile app — web dashboard only
- Training any custom deep learning model (no LSTM) unless Phase constraints explicitly allow it later as a stretch goal
- Any hardware or physical sensor integration

## 4. Cities in scope

Exactly 3 cities for the full build: **Chennai, Delhi, Bengaluru**. Do not add more cities mid-build — 3 is enough to prove multi-city comparison works and keeps API call volume manageable.

## 5. Tech stack (final — matches solo dev on 16GB RAM / 4GB GPU / Ubuntu laptop)

| Layer | Choice | Why |
|---|---|---|
| Backend | Python 3.11 + FastAPI | Fast to build, great with ML libraries, async-friendly for API calls |
| ML | XGBoost + pandas + scikit-learn | CPU-only, trains in seconds/minutes, no GPU needed |
| LLM | Google Gemini API (Gemini Flash, via google-generativeai SDK) | Genuinely free tier, no credit card, generous daily quota — no local model needed, saves your GPU/RAM entirely for other work |
| Database | SQLite (single file, `airsense.db`) | Zero setup, no server process, perfectly fine for hackathon scale |
| Scheduler | Python `APScheduler` (in-process) | No external cron needed, runs inside the backend process |
| Frontend | React (Vite) + react-leaflet + Chart.js | Fast dev loop, Leaflet is the standard free mapping library |
| Map tiles | OpenStreetMap tile server (free, no key) | No cost, no signup needed |
| Data sources | OpenAQ API, OpenWeatherMap API, OSM Overpass API | All free, no hardware, generous free tiers |
| Hosting (optional, for judge access) | Render.com or Railway free tier | Only needed if you want judges to access it without your laptop running |

**Nothing in this stack requires your GPU.** Your 4GB NVIDIA card is not a bottleneck for this project — XGBoost and API-based LLMs are both CPU/network bound, not GPU bound. Don't spend time setting up CUDA/GPU acceleration; it's wasted effort here.

## 6. Repository structure (final — do not reorganize mid-build)

```
airsense/
├── PROJECT_SPEC.md          <- this file, never edited during build
├── IDEAS_FOR_LATER.md       <- park new ideas here instead of scope-creeping
├── backend/
│   ├── main.py              <- FastAPI app entrypoint
│   ├── config.py            <- API keys, constants (cities, coordinates)
│   ├── database.py          <- SQLite connection + schema setup
│   ├── data_ingestion/
│   │   ├── fetch_aqi.py         <- OpenAQ API calls
│   │   ├── fetch_weather.py     <- OpenWeatherMap API calls
│   │   └── fetch_vulnerable_sites.py  <- Overpass API calls (schools/hospitals)
│   ├── ml/
│   │   ├── features.py      <- feature engineering pipeline
│   │   ├── train_model.py   <- XGBoost training script
│   │   └── predict.py       <- forecasting function used by API
│   ├── llm/
│   │   ├── advisory.py      <- health advisory + translation prompt
│   │   ├── attribution.py   <- source attribution reasoning prompt
│   │   └── chat.py          <- free-text Q&A prompt
│   ├── api/
│   │   └── routes.py        <- all FastAPI endpoints
│   ├── scheduler.py         <- hourly data refresh job
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── MapView.jsx
│   │   │   ├── ForecastPanel.jsx
│   │   │   ├── AdvisoryPanel.jsx
│   │   │   ├── AttributionPanel.jsx
│   │   │   ├── EnforcementQueue.jsx
│   │   │   ├── CityComparison.jsx
│   │   │   └── ChatBox.jsx
│   │   ├── App.jsx
│   │   └── api.js           <- all backend calls from frontend, one file
│   ├── package.json
│   └── vite.config.js
└── data/
    └── airsense.db          <- SQLite database file (created at runtime)
```

**Rule: every new piece of code goes into the file it belongs in above. Do not create new top-level folders or restructure this layout partway through.**

## 7. Data flow (how everything connects — memorize this, it doesn't change)

```
[Scheduler, runs every 60 min]
   → fetch_aqi.py, fetch_weather.py  → write rows into SQLite (aqi_readings, weather_readings tables)
   → fetch_vulnerable_sites.py runs once at setup (schools/hospitals don't move) → stored in SQLite (vulnerable_sites table)

[On backend startup, and after each new data refresh]
   → features.py reads recent rows from SQLite → builds feature table
   → train_model.py (run manually/periodically, not on every request) → saves model file (model.json)
   → predict.py loads the saved model → used live by API endpoints

[FastAPI routes, called live by frontend]
   GET /api/aqi/current?city=X          → latest AQI per station, from SQLite
   GET /api/aqi/forecast?city=X         → calls predict.py live
   GET /api/vulnerable-sites?city=X     → from SQLite
   GET /api/advisory?city=X&lang=Y      → calls llm/advisory.py live (uses latest forecast)
   GET /api/attribution?city=X          → calls llm/attribution.py live (uses latest AQI + context)
   GET /api/enforcement-queue           → ranks all zones using stored data (no LLM needed, pure logic + optional LLM summary)
   GET /api/city-comparison             → aggregates latest AQI across all 3 cities
   POST /api/chat                       → calls llm/chat.py live with user's question

[Frontend]
   App.jsx holds selected city + language state
   → MapView.jsx calls /api/aqi/current + /api/vulnerable-sites, renders Leaflet map
   → clicking a station/zone sets "selected zone" state
   → ForecastPanel, AdvisoryPanel, AttributionPanel all react to "selected zone" state, each calling their respective endpoint
   → EnforcementQueue and CityComparison load independently, not tied to zone selection
   → ChatBox is fully independent, posts to /api/chat
```

**Every number shown on the frontend must trace back to a real API call in this diagram. No hardcoded/sample data anywhere in the final build.**

## 8. Evaluation-metric checklist (keep visible, refer back before declaring "done")

- [ ] Forecast accuracy shown vs. persistence baseline, on-screen, with a real computed percentage
- [ ] Source attribution includes a visible confidence score
- [ ] Enforcement queue produces a ranked, actionable list
- [ ] Citizen advisory available in English + 2 regional languages
- [ ] Multi-city comparison visible on one screen
- [ ] Architecture diagram documents satellite imagery as future-phase (not built)
- [ ] All 4 deliverables prepared: working prototype, architecture diagram, deck, demo video

## 9. Working with multiple AI coding tools (Copilot / Antigravity / OpenCode)

Since you'll switch between tools as credits run out, **paste the relevant section of this file into the new tool's context at the start of every session**, or explicitly tell it: *"Read PROJECT_SPEC.md in this repo fully before making any changes."* Never let a new tool "guess" the architecture — always point it here first. This is what prevents one tool from restructuring folders, renaming files, or changing the tech stack that a previous tool already built.
