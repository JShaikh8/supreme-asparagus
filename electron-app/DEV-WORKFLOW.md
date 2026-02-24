# Development Workflow Guide

## Available Scripts

### Development Mode

#### Option 1: Manual Sync (What you were doing before)
```bash
# Copy backend manually, then run electron
node copy-backend.js
npm run dev
```

#### Option 2: Auto-Sync Once (Recommended for most development)
```bash
# Copies backend once, then starts electron
npm run dev:sync
```
**Use this when**: You make backend changes and want to test them in Electron.

#### Option 3: Continuous Watch Mode (Advanced)
Run this in a **separate terminal** to auto-copy backend changes:
```bash
# Terminal 1: Watch and auto-copy backend changes
npm run dev:watch

# Terminal 2: Run electron
npm run dev
```
**Use this when**: You're actively developing backend features and want instant sync.

**Note**: You'll still need to restart the Electron app (`Ctrl+R` or restart) to pick up backend changes.

---

### Production Build

```bash
# Automatically builds frontend + copies backend + packages electron app
npm run build          # Current platform
npm run build:win      # Windows
npm run build:mac      # macOS
npm run build:all      # Both platforms
```

The `prebuild` script automatically:
1. Builds frontend (`cd ../frontend && npm run build`)
2. Copies backend (`node copy-backend.js`)
3. Then electron-builder packages everything

---

## Typical Development Workflows

### Workflow 1: Frontend Changes Only
```bash
# In frontend folder
cd frontend
npm start              # Live reload at localhost:3000

# OR build for electron
npm run build
cd ../electron-app
npm run dev:sync
```

### Workflow 2: Backend Changes
```bash
# Make changes in /backend folder
# Then in electron-app folder:
cd electron-app
npm run dev:sync       # Copies backend + starts electron
```

### Workflow 3: Active Backend Development
```bash
# Terminal 1 (watch backend changes)
cd electron-app
npm run dev:watch

# Terminal 2 (run electron)
cd electron-app
npm run dev

# Now edit /backend files - they auto-copy to /electron-app/backend
# Restart electron app to see changes (Ctrl+R)
```

### Workflow 4: Full Stack Development
```bash
# Terminal 1: Backend watcher
cd electron-app
npm run dev:watch

# Terminal 2: Frontend dev server (optional, for testing web version)
cd frontend
npm start

# Terminal 3: Electron app
cd electron-app
npm run dev
```

---

## Environment Setup

### Backend Environment
Make sure `/backend/.env` has:
```
ENABLE_INTERNAL_FEATURES=false    # For web version
```

### Electron Environment
Make sure `/electron-app/.env` has:
```
ENABLE_INTERNAL_FEATURES=true     # For desktop app
```

### Frontend Environment
For Electron builds, ensure frontend has internal features enabled:
```bash
# When building frontend for electron:
cd frontend
REACT_APP_ENABLE_INTERNAL_FEATURES=true npm run build

# For web deployment:
REACT_APP_ENABLE_INTERNAL_FEATURES=false npm run build
```

---

## Tips

- **Backend changes**: Use `npm run dev:sync` or `npm run dev:watch`
- **Frontend changes**: Use `npm start` in frontend folder for live reload
- **Production builds**: Just run `npm run build` - everything is automated
- **The `/electron-app/backend` folder is a copy** - always edit `/backend` directly
