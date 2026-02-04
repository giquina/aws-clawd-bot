# Spotify Skill - Quick Start

Get Spotify control working in under 10 minutes.

## 1. Create Spotify App (3 minutes)

1. Go to https://developer.spotify.com/dashboard
2. Click "Create App"
3. Name: `ClawdBot`
4. Redirect URI: `http://16.171.150.151:3000/spotify/callback`
5. Save and copy Client ID + Client Secret

## 2. Configure ClawdBot (2 minutes)

SSH to EC2:
```bash
ssh -i ~/.ssh/clawd-bot-key.pem ubuntu@16.171.150.151
```

Edit environment file:
```bash
cd /opt/clawd-bot/02-bot
nano config/.env.local
```

Add these lines:
```bash
SPOTIFY_CLIENT_ID=your_client_id_here
SPOTIFY_CLIENT_SECRET=your_client_secret_here
SPOTIFY_REDIRECT_URI=http://16.171.150.151:3000/spotify/callback
```

Save (Ctrl+O, Enter, Ctrl+X)

## 3. Add OAuth Callback (3 minutes)

Edit index.js:
```bash
nano index.js
```

Find the section with other routes (after `app.use(express.json())`) and add:

```javascript
// Spotify OAuth callback
app.get('/spotify/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state) {
    return res.status(400).send('<h1>Invalid Request</h1>');
  }

  const userId = state;

  try {
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

    const tokens = await tokenResponse.json();

    database.saveSecret(
      `spotify_refresh_token_${userId}`,
      tokens.refresh_token,
      'default',
      userId
    );

    await bot.telegram.sendMessage(userId, '✅ Spotify connected!');

    res.send('<html><body style="text-align:center;padding:50px;background:#1DB954;color:white;"><h1>✅ Connected!</h1><p>Close this window</p></body></html>');
  } catch (error) {
    res.status(500).send('<h1>Error</h1><p>' + error.message + '</p>');
  }
});
```

Save and exit.

## 4. Deploy (1 minute)

```bash
exit  # Exit SSH
./deploy.sh full
```

## 5. Test (1 minute)

Send to ClawdBot via Telegram:
```
spotify connect
```

Click the link, authorize, done!

Test playback:
```
play Bohemian Rhapsody
```

## Commands

```
spotify connect       # Connect account
spotify status        # Check connection
play <song>           # Search and play
pause                 # Pause
resume                # Resume
next                  # Skip
previous              # Previous track
currently playing     # What's playing
```

## Troubleshooting

**"No active device"**
- Open Spotify on your phone/computer first
- Play any track
- Try command again

**"Not connected"**
- Send `spotify connect`
- Click the link
- Authorize

**Callback not working**
- Check redirect URI matches exactly
- Verify environment variables loaded: `pm2 logs clawd-bot`
- Test endpoint: `curl http://16.171.150.151:3000/spotify/callback`

## Need Help?

See full documentation in:
- `README.md` - Feature overview
- `INTEGRATION.md` - Detailed setup guide

## What's Next?

The skill supports:
- Voice commands ("play some jazz")
- Natural language search
- Multiple user accounts
- Automatic token refresh

Future features:
- Volume control
- Playlist management
- Queue control
- Shuffle/repeat toggle
