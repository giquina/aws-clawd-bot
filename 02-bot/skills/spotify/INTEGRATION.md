# Spotify Skill Integration Guide

This guide walks through the complete setup process for the Spotify Control Skill.

## Prerequisites

- Spotify account (Free or Premium)
- Access to Spotify Developer Dashboard
- ClawdBot running on a server with a public URL (for OAuth callback)

## Step 1: Create Spotify Developer App

1. Visit [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Log in with your Spotify account
3. Click **"Create App"**
4. Fill in the form:
   - **App name**: `ClawdBot Spotify Control`
   - **App description**: `Control Spotify playback via ClawdBot`
   - **Website**: Your bot's URL (optional)
   - **Redirect URI**: `https://your-domain.com/spotify/callback`
     - For local testing: `http://localhost:3000/spotify/callback`
     - For EC2 production: `http://16.171.150.151:3000/spotify/callback`
   - Check "Web API" in the API/SDKs section
5. Click **"Save"**
6. In the app settings, copy your **Client ID** and **Client Secret**

## Step 2: Configure Environment Variables

Add to `02-bot/config/.env.local` (do NOT commit this file):

```bash
# Spotify API Configuration
SPOTIFY_CLIENT_ID=abc123...
SPOTIFY_CLIENT_SECRET=def456...
SPOTIFY_REDIRECT_URI=http://16.171.150.151:3000/spotify/callback
```

## Step 3: Add OAuth Callback Route

Open `02-bot/index.js` and add the Spotify OAuth callback handler.

### Option A: Direct Integration (Recommended)

Add this near the top of your file with other requires:

```javascript
const database = require('./lib/database');
```

Then add this route with your other Express routes (after `app.use(express.json())`):

```javascript
// Spotify OAuth callback
app.get('/spotify/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    console.error('[Spotify OAuth] Authorization error:', error);
    return res.status(400).send(`<h1>Authorization Failed</h1><p>Error: ${error}</p>`);
  }

  if (!code || !state) {
    return res.status(400).send(`<h1>Invalid Request</h1><p>Missing parameters</p>`);
  }

  const userId = state;

  try {
    console.log(`[Spotify OAuth] Processing callback for user ${userId}`);

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
      throw new Error(`Token exchange failed: ${tokenResponse.status}`);
    }

    const tokens = await tokenResponse.json();

    // Store refresh token in database
    // TODO: Implement proper encryption
    database.saveSecret(
      `spotify_refresh_token_${userId}`,
      tokens.refresh_token,
      'default',
      userId
    );

    console.log(`[Spotify OAuth] Successfully stored tokens for user ${userId}`);

    // Send success message via Telegram
    try {
      await bot.telegram.sendMessage(
        userId,
        '✅ *Spotify Connected Successfully!*\\n\\n' +
        'You can now control playback with commands like:\\n' +
        '• `play <song>` \\- Search and play\\n' +
        '• `pause` \\- Pause playback\\n' +
        '• `next` \\- Skip track\\n' +
        '• `currently playing` \\- Show current track',
        { parse_mode: 'MarkdownV2' }
      );
    } catch (msgError) {
      console.error('[Spotify OAuth] Failed to send success message:', msgError);
    }

    // Return success page
    res.send(`
      <html>
        <head><title>Spotify Connected</title></head>
        <body style="font-family: Arial; text-align: center; padding: 50px; background: #1DB954; color: white;">
          <h1>✅ Success!</h1>
          <p style="font-size: 18px;">Your Spotify account has been connected.</p>
          <p>You can close this window now.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('[Spotify OAuth] Error in callback:', error);
    res.status(500).send(`<h1>Error</h1><p>${error.message}</p>`);
  }
});
```

### Option B: Modular Approach

Use the provided callback handler:

```javascript
// Near top of index.js
const spotifyOAuthCallback = require('./skills/spotify/oauth-callback-example');

// In routes section
app.get('/spotify/callback', spotifyOAuthCallback);
```

## Step 4: Implement Token Encryption (Security Best Practice)

The current implementation stores tokens in plaintext. For production, implement proper encryption.

Create `02-bot/lib/encryption.js`:

```javascript
const crypto = require('crypto');

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY; // Must be 32 bytes for AES-256
const ALGORITHM = 'aes-256-gcm';

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
  console.warn('[Encryption] ENCRYPTION_KEY not set or invalid. Generate with: openssl rand -hex 32');
}

/**
 * Encrypt a string value
 * @param {string} text - Text to encrypt
 * @returns {{ encrypted: string, iv: string, authTag: string }}
 */
function encrypt(text) {
  if (!ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY not configured');
  }

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(
    ALGORITHM,
    Buffer.from(ENCRYPTION_KEY, 'hex'),
    iv
  );

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag: cipher.getAuthTag().toString('hex')
  };
}

/**
 * Decrypt an encrypted value
 * @param {string} encrypted - Encrypted text
 * @param {string} iv - Initialization vector
 * @param {string} authTag - Authentication tag
 * @returns {string} - Decrypted text
 */
function decrypt(encrypted, iv, authTag) {
  if (!ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY not configured');
  }

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    Buffer.from(ENCRYPTION_KEY, 'hex'),
    Buffer.from(iv, 'hex')
  );

  decipher.setAuthTag(Buffer.from(authTag, 'hex'));

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

module.exports = { encrypt, decrypt };
```

Then update the Spotify skill to use encryption:

```javascript
// In spotify/index.js, replace _encryptToken and _decryptToken:

const { encrypt, decrypt } = require('../../lib/encryption');

_encryptToken(token) {
  const { encrypted, iv, authTag } = encrypt(token);
  return {
    value: JSON.stringify({ encrypted, iv, authTag }),
    keyId: 'aes-256-gcm'
  };
}

_decryptToken(encryptedValue, keyId) {
  const { encrypted, iv, authTag } = JSON.parse(encryptedValue);
  return decrypt(encrypted, iv, authTag);
}
```

Generate an encryption key:

```bash
openssl rand -hex 32
```

Add to `.env.local`:

```bash
ENCRYPTION_KEY=your_64_character_hex_string_here
```

## Step 5: Deploy to EC2

### Full deployment:

```bash
./deploy.sh full
```

This will:
1. Git pull latest changes
2. Install dependencies
3. Rebuild native modules (better-sqlite3)
4. Restart PM2

### Quick deployment (if only JS files changed):

```bash
./deploy.sh
```

## Step 6: Test the Integration

### 1. Check Configuration

```bash
ssh -i ~/.ssh/clawd-bot-key.pem ubuntu@16.171.150.151
cd /opt/clawd-bot/02-bot
cat config/.env.local | grep SPOTIFY
```

You should see:
```
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
SPOTIFY_REDIRECT_URI=http://16.171.150.151:3000/spotify/callback
```

### 2. Check PM2 Logs

```bash
pm2 logs clawd-bot --lines 50
```

Look for:
```
[Skill:spotify] Skill "spotify" initialized
```

### 3. Test the Callback Endpoint

```bash
curl http://16.171.150.151:3000/spotify/callback
```

Should return HTML (even if it's an error about missing parameters - that's expected).

### 4. Test via Telegram

Send to ClawdBot:
```
spotify status
```

Expected response:
```
❌ Not connected

Send "spotify connect" to get started
```

Send:
```
spotify connect
```

Expected response:
```
🔗 Authorization Link:
https://accounts.spotify.com/authorize?client_id=...
```

Click the link, authorize, and you should be redirected to the success page.

### 5. Test Playback Control

```
play Bohemian Rhapsody
```

Make sure Spotify is open on at least one device first!

## Troubleshooting

### "Invalid redirect URI"

- Check that the redirect URI in your Spotify app settings EXACTLY matches `SPOTIFY_REDIRECT_URI` in `.env.local`
- Include protocol (`http://` or `https://`)
- No trailing slash
- Port number if applicable

### "No active device"

- Open Spotify on your phone or computer
- Start playing any track
- Try the command again

### "Token exchange failed"

- Verify Client ID and Client Secret are correct
- Check that the authorization code hasn't expired (valid for 10 minutes)
- Ensure redirect URI matches

### Callback route not responding

```bash
# Check if Express is listening
curl http://localhost:3000/health

# Check PM2 status
pm2 status

# Check error logs
pm2 logs clawd-bot --err --lines 100
```

### Database errors

```bash
# Check database file exists
ls -lh /opt/clawd-bot/data/clawdbot.db

# Check permissions
stat /opt/clawd-bot/data/clawdbot.db
```

## Production Checklist

- [ ] HTTPS enabled for callback URL
- [ ] Encryption implemented for refresh tokens
- [ ] `ENCRYPTION_KEY` set and secured
- [ ] Spotify app redirect URI updated to production URL
- [ ] Error logging configured
- [ ] Rate limiting implemented (optional)
- [ ] Token refresh tested
- [ ] Multiple users tested
- [ ] PM2 auto-restart configured
- [ ] Database backups scheduled

## Security Considerations

1. **Never commit secrets**: Keep `.env.local` out of git
2. **Use HTTPS in production**: HTTP is acceptable only for local testing
3. **Encrypt refresh tokens**: Implement the encryption module
4. **Rotate keys regularly**: Plan for key rotation
5. **Monitor access**: Check `secrets_audit` table regularly
6. **Rate limit OAuth endpoints**: Prevent abuse

## Monitoring

Check Spotify connection health:

```sql
-- Via SSH on EC2
sqlite3 /opt/clawd-bot/data/clawdbot.db

-- Count connected users
SELECT COUNT(DISTINCT name) FROM secrets WHERE name LIKE 'spotify_refresh_token_%';

-- Recent Spotify access
SELECT * FROM secrets_audit WHERE secret_name LIKE 'spotify_refresh_token_%' ORDER BY created_at DESC LIMIT 10;
```

## Next Steps

Once working:
- Add volume control commands
- Implement playlist management
- Add shuffle/repeat toggle
- Create saved tracks functionality
- Build custom playlists via voice

## Support

If you encounter issues:
1. Check PM2 logs: `pm2 logs clawd-bot`
2. Review Spotify API documentation
3. Test OAuth flow manually with Postman
4. Check database for stored tokens
5. Verify environment variables are loaded
