# Popcorn Language

NUS Master of Computing capstone — local-LLM-powered bilingual language-learning platform with persistent NPCs and embedded scenario gameplay. See [`docs/context.md`](docs/context.md) for project background.

## Layout

```
.
├── docs/                   # Background & UI documentation
│   ├── context.md
│   └── web-ui-summary.md
├── prototypes/
│   └── web/                # Static HTML/JSX demo (no build step)
│       ├── main-app.html
│       ├── scenario.html
│       ├── onboarding-journey.html
│       ├── design-canvas.html
│       ├── src/            # JSX (Babel-standalone, loaded in browser)
│       └── styles/         # CSS tokens
└── scripts/
    └── start.ps1           # Local dev server launcher
```

## Run the web prototype

```powershell
./scripts/start.ps1
```

Requires Python 3 in PATH. Serves `prototypes/web/` at `http://localhost:8080` and opens `main-app.html` automatically. The three demo screens cross-link via the bottom-right dock.
