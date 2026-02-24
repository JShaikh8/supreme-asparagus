# SportsData Pro Desktop

Desktop application for sports data management and comparison with Oracle database integration.

## Features

- 🔐 Secure login with Oracle credentials (stored in OS keychain)
- 📊 Full team management interface
- 🔄 Data scraping from multiple sources
- 🔍 Real-time comparison between MongoDB and Oracle/Stats API
- 📈 Field mapping and data transformation
- 💾 Import/Export functionality
- 🔄 Automatic updates
- 🔒 VPN-aware (uses user's VPN connection)

## Prerequisites

Before building or running the app, you need:

1. **Node.js** (v18 or higher)
2. **MongoDB** (connection to MongoDB Atlas or local instance)
3. **Oracle Database** (VPN access required)
4. **Stats API** (VPN access required)
5. **VPN Connection** (for Oracle and Stats API access)

## Setup Instructions

### 1. Install Dependencies

```bash
# Install backend dependencies (if not already installed)
cd ../backend
npm install

# Install frontend dependencies (if not already installed)
cd ../frontend
npm install

# Install Electron app dependencies
cd ../electron-app
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `config.js` and update with your values:

```javascript
// electron-app/config.js

module.exports = {
  mongodb: {
    uri: 'mongodb+srv://your-connection-string'
  },
  oracle: {
    host: '10.0.0.5',      // Your Oracle host
    port: 1521,
    database: 'PRODDB'
  },
  statsApi: {
    baseUrl: 'https://your_stats_api_url',
    apiKey: 'your_stats_api_key_here'
  },
  // ...
};
```

### 3. Build Frontend

The Electron app needs the React frontend to be built first:

```bash
cd ../frontend
npm run build
```

This creates a production build in `frontend/build/` that the Electron app will load.

## Development

### Run in Development Mode

```bash
npm run dev
```

This will:
- Start the Electron app
- Open developer tools
- Show the login screen

### Test Login

1. Make sure you're connected to VPN
2. Enter your Oracle username and password
3. Click "Test Connection" to verify credentials
4. Click "Sign In" to access the full app

## Building for Distribution

### Build for Windows

```bash
npm run build:win
```

Output: `dist/SportsData Pro Desktop Setup 1.0.0.exe`

### Build for Mac

```bash
npm run build:mac
```

Output: `dist/SportsData Pro Desktop-1.0.0.dmg`

### Build for Both Platforms

```bash
npm run build:all
```

## Distribution

### Option 1: Manual Distribution

1. Build the installer (`.exe` for Windows, `.dmg` for Mac)
2. Copy the installer to a shared network drive
3. Send users the download link
4. Users install and run the app

### Option 2: GitHub Releases (Recommended)

1. Tag a new release:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

2. Build and upload:
   ```bash
   npm run build:all
   ```

3. The built files in `dist/` will be uploaded to GitHub Releases

4. Users download from GitHub Releases page

5. **Auto-updates work automatically** - when you push a new release, users get notified

## Auto-Update System

The app includes automatic updates:

- Checks for updates on startup
- Checks every hour for new versions
- Downloads updates in background
- Prompts user to restart when ready
- Works via GitHub Releases

To disable auto-updates, edit `config.js`:

```javascript
app: {
  autoUpdateEnabled: false
}
```

## User Guide

### First Launch

1. **Connect to VPN** before launching the app
2. Enter your Oracle username and password
3. Check "Remember my credentials" to save them securely
4. Click "Sign In"

### Stored Credentials

Credentials are stored securely using:
- **Windows**: Windows Credential Manager
- **Mac**: macOS Keychain
- **Linux**: libsecret

Users can clear credentials by:
1. Going to Settings
2. Clicking "Logout"
3. Stored credentials will be deleted

### Using the App

After login, users have access to:
- **Dashboard**: Overview of teams and data
- **Team Management**: Add/edit/delete teams
- **Data Collection**: Scrape data from sources
- **View Data**: Browse scraped data
- **Comparison**: Compare MongoDB vs Oracle/Stats API
- **Field Mappings**: Configure data transformations
- **Settings**: App configuration and logout

## Troubleshooting

### "Unable to connect to Oracle"

- Verify VPN is connected
- Check Oracle host/port/database in `config.js`
- Verify credentials are correct
- Check firewall settings

### "MongoDB connection error"

- Verify MongoDB URI in `config.js`
- Check internet connection
- Verify MongoDB Atlas IP whitelist (use 0.0.0.0/0 for all IPs)

### "Port 5000 already in use"

- Close any apps using port 5000
- Or change port in `config.js`:
  ```javascript
  server: { port: 5001 }
  ```

### Build Errors

If you get build errors related to native modules (like `oracledb` or `keytar`):

```bash
# Rebuild native modules for Electron
npm run rebuild
# Or manually:
./node_modules/.bin/electron-rebuild
```

## Architecture

```
Electron App
├── Main Process (Node.js)
│   ├── Creates app window
│   ├── Manages credentials (keytar)
│   ├── Runs Express server
│   └── Handles auto-updates
│
├── Renderer Process (Browser)
│   ├── Login screen (custom HTML)
│   └── Main app (React build from ../frontend)
│
└── Express Server (Embedded)
    ├── All backend routes
    ├── MongoDB connection
    ├── Oracle connection (user's credentials)
    └── Stats API integration
```

## Security

- **No credentials hardcoded**: Users enter their own Oracle credentials
- **Secure storage**: Credentials stored in OS-native secure storage
- **Context isolation**: Renderer process is sandboxed
- **No remote access**: Server only listens on localhost
- **HTTPS for API calls**: All external APIs use HTTPS

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Contact the development team
3. Submit an issue on GitHub

## Version History

### v1.0.0 (Initial Release)
- Secure Oracle login with credential storage
- Full team management
- Data scraping from multiple sources
- MongoDB vs Oracle/Stats API comparison
- Field mapping system
- Auto-update functionality
