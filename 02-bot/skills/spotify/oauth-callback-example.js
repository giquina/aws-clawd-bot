/**
 * Spotify OAuth Callback Handler Example
 *
 * Add this to your Express app (index.js) to handle Spotify OAuth redirects.
 * This endpoint exchanges the authorization code for access and refresh tokens.
 */

const database = require('../../lib/database');

/**
 * Spotify OAuth callback endpoint
 *
 * Add this route to your Express app:
 *
 * const spotifyOAuthCallback = require('./skills/spotify/oauth-callback-example');
 * app.get('/spotify/callback', spotifyOAuthCallback);
 */
async function spotifyOAuthCallback(req, res) {
  const { code, state, error } = req.query;

  // Handle authorization errors
  if (error) {
    console.error('[Spotify OAuth] Authorization error:', error);
    return res.status(400).send(`
      <html>
        <head><title>Spotify Authorization Failed</title></head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h1 style="color: #e74c3c;">❌ Authorization Failed</h1>
          <p>Error: ${error}</p>
          <p>Please try again by sending "spotify connect" to ClawdBot.</p>
        </body>
      </html>
    `);
  }

  // Validate authorization code
  if (!code) {
    console.error('[Spotify OAuth] Missing authorization code');
    return res.status(400).send(`
      <html>
        <head><title>Invalid Request</title></head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h1 style="color: #e74c3c;">❌ Invalid Request</h1>
          <p>Authorization code is missing.</p>
        </body>
      </html>
    `);
  }

  // State contains the userId
  const userId = state;

  if (!userId) {
    console.error('[Spotify OAuth] Missing userId in state');
    return res.status(400).send(`
      <html>
        <head><title>Invalid Request</title></head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h1 style="color: #e74c3c;">❌ Invalid Request</h1>
          <p>User identifier is missing.</p>
        </body>
      </html>
    `);
  }

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
      const errorData = await tokenResponse.json().catch(() => ({}));
      console.error('[Spotify OAuth] Token exchange failed:', errorData);
      throw new Error(`Token exchange failed: ${tokenResponse.status}`);
    }

    const tokens = await tokenResponse.json();

    // Store refresh token in database
    // TODO: Implement proper encryption for the refresh token
    // For now, we store it as-is (which is NOT secure for production)
    const encryptedToken = tokens.refresh_token;

    database.saveSecret(
      `spotify_refresh_token_${userId}`,
      encryptedToken,
      'default', // encryption key ID
      userId
    );

    // Log the audit event
    const secret = database.getSecret(`spotify_refresh_token_${userId}`);
    if (secret) {
      database.logSecretAudit(
        secret.id,
        secret.name,
        'set',
        userId,
        'spotify_oauth',
        true
      );
    }

    console.log(`[Spotify OAuth] Successfully stored tokens for user ${userId}`);

    // Try to send success message to user via Telegram
    try {
      const { sendTelegramMessage } = require('../../telegram-handler');

      if (sendTelegramMessage) {
        await sendTelegramMessage(
          userId,
          '✅ *Spotify Connected Successfully!*\n\n' +
          'You can now control playback with commands like:\n' +
          '• `play <song>` - Search and play\n' +
          '• `pause` - Pause playback\n' +
          '• `next` - Skip track\n' +
          '• `currently playing` - Show current track\n\n' +
          '_Tip: These also work with voice notes!_'
        );
      }
    } catch (msgError) {
      console.error('[Spotify OAuth] Failed to send success message:', msgError);
      // Don't fail the whole operation if we can't send a message
    }

    // Return success page
    res.send(`
      <html>
        <head>
          <title>Spotify Connected</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
        </head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px; background: linear-gradient(135deg, #1DB954 0%, #191414 100%); color: white; min-height: 100vh; margin: 0;">
          <div style="background: rgba(255,255,255,0.1); border-radius: 20px; padding: 40px; max-width: 500px; margin: 0 auto; backdrop-filter: blur(10px);">
            <h1 style="font-size: 48px; margin: 0 0 20px 0;">✅</h1>
            <h1 style="margin: 0 0 20px 0;">Success!</h1>
            <p style="font-size: 18px; line-height: 1.6;">
              Your Spotify account has been connected to ClawdBot.
            </p>
            <p style="font-size: 16px; opacity: 0.9; line-height: 1.6; margin: 20px 0;">
              You can now control your music directly from Telegram or WhatsApp!
            </p>
            <div style="background: rgba(0,0,0,0.3); border-radius: 10px; padding: 20px; margin: 30px 0; text-align: left;">
              <p style="margin: 0 0 10px 0; font-weight: bold;">Try these commands:</p>
              <p style="margin: 5px 0; font-family: monospace;">• play Bohemian Rhapsody</p>
              <p style="margin: 5px 0; font-family: monospace;">• pause</p>
              <p style="margin: 5px 0; font-family: monospace;">• next</p>
              <p style="margin: 5px 0; font-family: monospace;">• currently playing</p>
            </div>
            <p style="font-size: 14px; opacity: 0.7; margin-top: 30px;">
              You can close this window now.
            </p>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('[Spotify OAuth] Error in callback:', error);

    // Return error page
    res.status(500).send(`
      <html>
        <head>
          <title>Connection Failed</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
        </head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #e74c3c; color: white; min-height: 100vh; margin: 0;">
          <div style="background: rgba(255,255,255,0.1); border-radius: 20px; padding: 40px; max-width: 500px; margin: 0 auto;">
            <h1 style="font-size: 48px; margin: 0 0 20px 0;">❌</h1>
            <h1 style="margin: 0 0 20px 0;">Connection Failed</h1>
            <p style="font-size: 18px; line-height: 1.6;">
              Failed to connect your Spotify account.
            </p>
            <p style="font-size: 14px; opacity: 0.9; margin-top: 20px;">
              Error: ${error.message}
            </p>
            <p style="font-size: 14px; opacity: 0.7; margin-top: 30px;">
              Please try again by sending "spotify connect" to ClawdBot.
            </p>
          </div>
        </body>
      </html>
    `);
  }
}

module.exports = spotifyOAuthCallback;
