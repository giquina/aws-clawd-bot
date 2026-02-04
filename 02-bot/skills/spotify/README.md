# Spotify Control Skill

Control Spotify playback directly from ClawdBot via Telegram or WhatsApp.

## Features

- 🎵 Search and play tracks or playlists
- ⏯️ Pause/resume playback
- ⏭️ Skip to next/previous track
- 📻 View currently playing track
- 🔗 Secure OAuth 2.0 authentication
- 🔄 Automatic token refresh

## Setup

### 1. Create Spotify Developer App

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Log in with your Spotify account
3. Click "Create App"
4. Fill in the details:
   - **App name**: ClawdBot Spotify Control
   - **App description**: Control Spotify via ClawdBot
   - **Redirect URI**: `http://localhost:3000/spotify/callback` (for local testing) or `https://your-domain.com/spotify/callback` (for production)
5. Click "Save"
6. Copy the **Client ID** and **Client Secret**

### 2. Configure Environment Variables

Add the following to `config/.env.local`:

```bash
# Spotify API Credentials
SPOTIFY_CLIENT_ID=your_client_id_here
SPOTIFY_CLIENT_SECRET=your_client_secret_here
SPOTIFY_REDIRECT_URI=http://localhost:3000/spotify/callback
```

### 3. Set Up Redirect URI Handler

The OAuth flow requires a web endpoint to handle the callback. You need to implement this in your Express app:

```javascript
// Add to index.js or create a separate routes file

app.get('/spotify/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!code) {
    return res.status(400).send('Authorization code missing');
  }

  const userId = state; // State contains the userId

  try {
    // Exchange authorization code for tokens
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(
          `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
        ).toString('base64')
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: process.env.SPOTIFY_REDIRECT_URI
      })
    });

    if (!tokenResponse.ok) {
      throw new Error('Token exchange failed');
    }

    const tokens = await tokenResponse.json();

    // Store refresh token in database
    const database = require('./lib/database');

    // TODO: Implement proper encryption
    const encryptedToken = tokens.refresh_token; // Should be encrypted

    database.saveSecret(
      `spotify_refresh_token_${userId}`,
      encryptedToken,
      'default',
      userId
    );

    // Send success message to user via Telegram
    const messagingPlatform = require('./lib/messaging-platform');
    await messagingPlatform.sendMessage(
      userId,
      '✅ Spotify connected successfully! You can now control playback with commands like "play", "pause", "next".',
      'telegram'
    );

    res.send('<h1>Success!</h1><p>Spotify connected successfully. You can close this window.</p>');
  } catch (error) {
    console.error('Error in Spotify callback:', error);
    res.status(500).send('<h1>Error</h1><p>Failed to connect Spotify. Please try again.</p>');
  }
});
```

### 4. Restart ClawdBot

```bash
./deploy.sh
```

Or restart PM2:

```bash
pm2 restart clawd-bot
```

## Usage

### Connect Your Account

```
spotify connect
```

This will generate an authorization link. Click it, log in to Spotify, and authorize ClawdBot.

### Check Connection Status

```
spotify status
```

Shows whether you're connected and displays your Spotify account details.

### Playback Control

**Play a song or playlist:**
```
play Bohemian Rhapsody
play focus music
play workout playlist
```

**Pause/Resume:**
```
pause
resume
play  (without a query resumes playback)
```

**Skip tracks:**
```
next
previous
prev
```

**Check what's playing:**
```
currently playing
now playing
what's playing
```

### Voice Commands

The skill also works with voice notes:

- "Play some jazz music"
- "Pause the music"
- "Skip to the next song"
- "What's playing right now?"

### Disconnect

```
spotify disconnect
```

Removes your Spotify authorization and deletes stored tokens.

## Troubleshooting

### "No active Spotify device"

This means you need to have Spotify open somewhere (phone, computer, etc.) before you can control it:

1. Open Spotify on any device
2. Start playing any track
3. Try the command again

### "Spotify not connected"

You need to authorize ClawdBot first:

```
spotify connect
```

### "Token refresh failed"

Your authorization may have expired. Reconnect:

```
spotify disconnect
spotify connect
```

### OAuth callback not working

Make sure:
1. The redirect URI in your Spotify app settings matches `SPOTIFY_REDIRECT_URI` in `.env.local`
2. The callback endpoint is implemented in your Express app
3. The server is accessible at the redirect URI

## Security Notes

- **Refresh tokens** should be encrypted before storing in the database. The current implementation includes placeholder encryption functions that need to be properly implemented using Node's `crypto` module.
- **Never commit** your Client Secret to version control
- Use **HTTPS** for the redirect URI in production
- The `state` parameter in OAuth helps prevent CSRF attacks

## API Rate Limits

Spotify Web API has the following limits:
- **Default**: 180 requests per minute per user
- **Market data**: 100 requests per minute

The skill includes basic error handling for rate limits.

## Permissions (Scopes)

The skill requests the following Spotify scopes:

- `user-read-playback-state` - Read your currently playing track
- `user-modify-playback-state` - Control playback (play, pause, skip)
- `user-read-currently-playing` - Read your currently playing track
- `streaming` - Play music in the Spotify Web Player

## Development

### Testing Locally

1. Set `SPOTIFY_REDIRECT_URI=http://localhost:3000/spotify/callback`
2. Start the bot: `npm run dev`
3. Use ngrok for public HTTPS endpoint (if needed for mobile testing):
   ```bash
   ngrok http 3000
   ```
4. Update redirect URI to ngrok URL

### Adding More Features

Potential enhancements:

- Volume control
- Shuffle/repeat toggle
- Queue management
- Playlist creation
- Save tracks to library
- Get recommendations
- View listening history

## References

- [Spotify Web API Documentation](https://developer.spotify.com/documentation/web-api)
- [OAuth 2.0 Authorization Guide](https://developer.spotify.com/documentation/general/guides/authorization/)
- [Web Playback SDK](https://developer.spotify.com/documentation/web-playback-sdk/)
