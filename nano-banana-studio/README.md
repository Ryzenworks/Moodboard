# Nano Banana Studio

A local image-generation workstation powered by **Nano Banana Pro** (`gemini-3-pro-image`).

## Quick Start

### Prerequisites

- **Node.js 20+** — [Download](https://nodejs.org/)
- **Gemini API Key** — [Get one here](https://aistudio.google.com/apikey)

### Setup

```bash
# 1. Install all dependencies
npm install

# 2. Create your API key file
cp server/.env.example server/.env

# 3. Edit server/.env and paste your Gemini API key
#    GEMINI_API_KEY=AIzaSy...your-key-here

# 4. Start both servers
npm run dev
```

The application will open at:
- **Frontend:** http://localhost:5173
- **Backend:** http://localhost:3001

### Architecture

```
Browser (React)  ←→  Local Backend (Express)  ←→  Google Gemini API
                          ↕
                    Local Storage
                  (SQLite + Files)
```

- **API key stays on the server** — never exposed to the browser
- **All data stored locally** — images and metadata survive restarts
- **No cloud infrastructure** — runs entirely on your machine

### Project Structure

```
nano-banana-studio/
├── client/          # React + Vite + TypeScript
├── server/          # Express + TypeScript
├── shared/          # Shared TypeScript types
├── data/            # Generated at runtime (gitignored)
│   ├── nano-banana.db
│   └── generations/
└── package.json     # Workspace root
```

## Security

- `.env` is gitignored — your API key is never committed
- The frontend communicates only with your local backend
- The backend validates all inputs before forwarding to Google
- File operations are restricted to the `data/` directory

## License

Private local tool — not intended for public distribution.
