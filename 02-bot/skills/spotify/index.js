/**
 * Spotify Control Skill - Control Spotify playback via ClawdBot
 *
 * Provides Spotify playback control using the Spotify Web API.
 * Requires OAuth 2.0 authentication for user authorization.
 * Stores access and refresh tokens securely in the database.
 *
 * Commands:
 *   spotify connect                - Start OAuth flow for authorization
 *   play <song/playlist>           - Search and play track or playlist
 *   play                           - Resume playback
 *   pause                          - Pause playback
 *   resume                         - Resume playback
 *   next                           - Skip to next track
 *   previous / prev                - Go to previous track
 *   currently playing              - Show current track info
 *   now playing                    - Show current track info
 *   spotify status                 - Check connection status
 *   spotify disconnect             - Remove authorization
 *
 * @example
 * spotify connect
 * play focus music
 * pause
 * next
 * currently playing
 *
 * Voice examples:
 * - "play focus music"
 * - "pause the music"
 * - "what's playing?"
 * - "skip to the next song"
 */
const BaseSkill = require('../base-skill');
const database = require('../../lib/database');

class SpotifySkill extends BaseSkill {
  name = 'spotify';
  description = 'Control Spotify playback (play, pause, skip, search)';
  priority = 15;

  commands = [
    {
      pattern: /^spotify\s+connect$/i,
      description: 'Connect your Spotify account',
      usage: 'spotify connect'
    },
    {
      pattern: /^spotify\s+disconnect$/i,
      description: 'Disconnect your Spotify account',
      usage: 'spotify disconnect'
    },
    {
      pattern: /^spotify\s+status$/i,
      description: 'Check Spotify connection status',
      usage: 'spotify status'
    },
    {
      pattern: /^play(\s+(.+))?$/i,
      description: 'Play a song/playlist or resume playback',
      usage: 'play [song/playlist name]'
    },
    {
      pattern: /^pause$/i,
      description: 'Pause Spotify playback',
      usage: 'pause'
    },
    {
      pattern: /^resume$/i,
      description: 'Resume Spotify playback',
      usage: 'resume'
    },
    {
      pattern: /^next$/i,
      description: 'Skip to next track',
      usage: 'next'
    },
    {
      pattern: /^(previous|prev)$/i,
      description: 'Go to previous track',
      usage: 'previous'
    },
    {
      pattern: /^(currently\s+playing|now\s+playing|what'?s\s+playing)$/i,
      description: 'Show currently playing track',
      usage: 'currently playing'
    }
  ];

  constructor(context = {}) {
    super(context);

    // Spotify API configuration
    this.CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || '';
    this.CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || '';
    this.REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || 'http://localhost:3000/spotify/callback';

    // API endpoints
    this.API_BASE_URL = 'https://api.spotify.com/v1';
    this.AUTH_BASE_URL = 'https://accounts.spotify.com';

    // Token cache (userId -> { accessToken, refreshToken, expiresAt })
    this.tokenCache = new Map();
  }

  /**
   * Initialize the skill and validate configuration
   */
  async initialize() {
    await super.initialize();

    try {
      if (!this.CLIENT_ID || !this.CLIENT_SECRET) {
        this.log('warn', 'Spotify API credentials not configured. Spotify skill partially disabled.');
        this.log('warn', 'Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET environment variables.');
      } else {
        this.log('info', 'Spotify skill initialized successfully');
      }
    } catch (error) {
      this.log('error', 'Error initializing Spotify skill', error);
    }
  }

  /**
   * Execute Spotify commands
   */
  async execute(command, context) {
    const parsed = this.parseCommand(command);
    const lowerCommand = parsed.raw.toLowerCase();
    const userId = context.from || context.userId || 'default';

    // Check if API is configured
    if (!this.CLIENT_ID || !this.CLIENT_SECRET) {
      return this._notConfiguredResponse();
    }

    // Handle connection management
    if (lowerCommand === 'spotify connect') {
      return await this.handleConnect(userId);
    }

    if (lowerCommand === 'spotify disconnect') {
      return await this.handleDisconnect(userId);
    }

    if (lowerCommand === 'spotify status') {
      return await this.handleStatus(userId);
    }

    // Check if user is connected for all other commands
    const tokens = await this._getTokens(userId);
    if (!tokens) {
      return this.error(
        'Spotify not connected',
        'You need to connect your Spotify account first',
        {
          suggestion: 'Send "spotify connect" to get started'
        }
      );
    }

    // Handle playback commands
    if (lowerCommand.startsWith('play')) {
      const query = parsed.raw.slice(4).trim(); // Remove "play" prefix
      if (query) {
        return await this.handlePlay(userId, query);
      } else {
        return await this.handleResume(userId);
      }
    }

    if (lowerCommand === 'pause') {
      return await this.handlePause(userId);
    }

    if (lowerCommand === 'resume') {
      return await this.handleResume(userId);
    }

    if (lowerCommand === 'next') {
      return await this.handleNext(userId);
    }

    if (lowerCommand.match(/^(previous|prev)$/i)) {
      return await this.handlePrevious(userId);
    }

    if (lowerCommand.match(/^(currently\s+playing|now\s+playing|what'?s\s+playing)$/i)) {
      return await this.handleCurrentlyPlaying(userId);
    }

    return this.error('Unknown Spotify command');
  }

  // ==================== Command Handlers ====================

  /**
   * Handle Spotify account connection
   */
  async handleConnect(userId) {
    const authUrl = this._generateAuthUrl(userId);

    let response = '*Connect Your Spotify Account*\n\n';
    response += '1. Click the link below to authorize ClawdBot\n';
    response += '2. Log in to Spotify and grant permissions\n';
    response += '3. You will be redirected back with confirmation\n\n';
    response += `🔗 *Authorization Link:*\n${authUrl}\n\n`;
    response += '_Note: This link expires in 10 minutes_';

    this.log('info', `Generated Spotify auth URL for user ${userId}`);
    return this.success(response);
  }

  /**
   * Handle Spotify account disconnection
   */
  async handleDisconnect(userId) {
    try {
      // Remove from cache
      this.tokenCache.delete(userId);

      // Remove from database
      const result = database.deleteSecret(`spotify_refresh_token_${userId}`);

      if (result > 0) {
        this.log('info', `Disconnected Spotify for user ${userId}`);
        return this.success('Spotify account disconnected successfully');
      } else {
        return this.error('No Spotify connection found');
      }
    } catch (error) {
      this.log('error', 'Error disconnecting Spotify', error);
      return this.error('Failed to disconnect Spotify', error.message);
    }
  }

  /**
   * Handle status check
   */
  async handleStatus(userId) {
    const tokens = await this._getTokens(userId);

    if (!tokens) {
      return this.success('*Spotify Status*\n\n❌ Not connected\n\nSend "spotify connect" to get started');
    }

    try {
      // Try to get current user profile to verify connection
      const profile = await this._apiRequest(userId, '/me', 'GET');

      let response = '*Spotify Status*\n\n';
      response += '✓ Connected\n\n';
      response += `*Account:* ${profile.display_name || 'Unknown'}\n`;
      response += `*Email:* ${profile.email || 'Not available'}\n`;
      response += `*Product:* ${profile.product || 'Free'}\n`;

      this.log('info', `Spotify status check for user ${userId}: connected`);
      return this.success(response);
    } catch (error) {
      this.log('error', 'Error checking Spotify status', error);
      return this.error(
        'Connection error',
        'Unable to verify Spotify connection',
        {
          suggestion: 'Try reconnecting with "spotify connect"'
        }
      );
    }
  }

  /**
   * Handle play command (search and play)
   */
  async handlePlay(userId, query) {
    try {
      // Search for tracks
      const searchResults = await this._apiRequest(
        userId,
        `/search?q=${encodeURIComponent(query)}&type=track,playlist&limit=1`,
        'GET'
      );

      // Try to find a track or playlist
      let uri = null;
      let name = null;
      let type = null;

      if (searchResults.tracks?.items?.length > 0) {
        const track = searchResults.tracks.items[0];
        uri = track.uri;
        name = `${track.name} by ${track.artists.map(a => a.name).join(', ')}`;
        type = 'track';
      } else if (searchResults.playlists?.items?.length > 0) {
        const playlist = searchResults.playlists.items[0];
        uri = playlist.uri;
        name = playlist.name;
        type = 'playlist';
      }

      if (!uri) {
        return this.error(
          `No results found for "${query}"`,
          'Try a different search query',
          {
            suggestion: 'Be more specific with artist name or track title'
          }
        );
      }

      // Start playback
      const playbackData = type === 'track'
        ? { uris: [uri] }
        : { context_uri: uri };

      await this._apiRequest(userId, '/me/player/play', 'PUT', playbackData);

      this.log('info', `Started playback for user ${userId}: ${name}`);
      return this.success(`Now playing: ${name}`);
    } catch (error) {
      this.log('error', 'Error playing track', error);

      if (error.message.includes('NO_ACTIVE_DEVICE')) {
        return this.error(
          'No active Spotify device',
          'Please open Spotify on your phone or computer first',
          {
            suggestion: 'Start playing any track on Spotify, then try again'
          }
        );
      }

      return this.error('Failed to play track', error.message);
    }
  }

  /**
   * Handle pause command
   */
  async handlePause(userId) {
    try {
      await this._apiRequest(userId, '/me/player/pause', 'PUT');
      this.log('info', `Paused playback for user ${userId}`);
      return this.success('Playback paused');
    } catch (error) {
      this.log('error', 'Error pausing playback', error);
      return this.error('Failed to pause playback', error.message);
    }
  }

  /**
   * Handle resume command
   */
  async handleResume(userId) {
    try {
      await this._apiRequest(userId, '/me/player/play', 'PUT');
      this.log('info', `Resumed playback for user ${userId}`);
      return this.success('Playback resumed');
    } catch (error) {
      this.log('error', 'Error resuming playback', error);
      return this.error('Failed to resume playback', error.message);
    }
  }

  /**
   * Handle next track
   */
  async handleNext(userId) {
    try {
      await this._apiRequest(userId, '/me/player/next', 'POST');

      // Wait a bit for Spotify to update
      await new Promise(resolve => setTimeout(resolve, 500));

      // Get the new track info
      const nowPlaying = await this._apiRequest(userId, '/me/player/currently-playing', 'GET');

      if (nowPlaying?.item) {
        const trackName = `${nowPlaying.item.name} by ${nowPlaying.item.artists.map(a => a.name).join(', ')}`;
        this.log('info', `Skipped to next track for user ${userId}`);
        return this.success(`Skipped to: ${trackName}`);
      }

      return this.success('Skipped to next track');
    } catch (error) {
      this.log('error', 'Error skipping track', error);
      return this.error('Failed to skip track', error.message);
    }
  }

  /**
   * Handle previous track
   */
  async handlePrevious(userId) {
    try {
      await this._apiRequest(userId, '/me/player/previous', 'POST');
      this.log('info', `Skipped to previous track for user ${userId}`);
      return this.success('Skipped to previous track');
    } catch (error) {
      this.log('error', 'Error skipping to previous track', error);
      return this.error('Failed to skip to previous track', error.message);
    }
  }

  /**
   * Handle currently playing
   */
  async handleCurrentlyPlaying(userId) {
    try {
      const nowPlaying = await this._apiRequest(userId, '/me/player/currently-playing', 'GET');

      if (!nowPlaying || !nowPlaying.item) {
        return this.success('Nothing is currently playing');
      }

      const track = nowPlaying.item;
      const artists = track.artists.map(a => a.name).join(', ');
      const album = track.album.name;
      const progress = Math.round(nowPlaying.progress_ms / 1000);
      const duration = Math.round(track.duration_ms / 1000);
      const isPlaying = nowPlaying.is_playing;

      let response = '*Now Playing*\n\n';
      response += `🎵 *${track.name}*\n`;
      response += `👤 ${artists}\n`;
      response += `💿 ${album}\n\n`;
      response += `⏱️ ${this._formatTime(progress)} / ${this._formatTime(duration)}\n`;
      response += `${isPlaying ? '▶️ Playing' : '⏸️ Paused'}`;

      this.log('info', `Retrieved currently playing for user ${userId}`);
      return this.success(response);
    } catch (error) {
      this.log('error', 'Error getting currently playing', error);
      return this.error('Failed to get currently playing track', error.message);
    }
  }

  // ==================== OAuth & Token Management ====================

  /**
   * Generate Spotify OAuth authorization URL
   * @private
   */
  _generateAuthUrl(userId) {
    const scopes = [
      'user-read-playback-state',
      'user-modify-playback-state',
      'user-read-currently-playing',
      'streaming'
    ].join(' ');

    const params = new URLSearchParams({
      client_id: this.CLIENT_ID,
      response_type: 'code',
      redirect_uri: this.REDIRECT_URI,
      scope: scopes,
      state: userId // Pass userId as state for callback
    });

    return `${this.AUTH_BASE_URL}/authorize?${params.toString()}`;
  }

  /**
   * Get access tokens for a user (from cache or database)
   * @private
   */
  async _getTokens(userId) {
    // Check cache first
    if (this.tokenCache.has(userId)) {
      const cached = this.tokenCache.get(userId);

      // Check if token is still valid (with 5 minute buffer)
      if (cached.expiresAt > Date.now() + 5 * 60 * 1000) {
        return cached;
      }

      // Token expired, try to refresh
      try {
        return await this._refreshAccessToken(userId, cached.refreshToken);
      } catch (error) {
        this.log('error', 'Error refreshing token from cache', error);
        this.tokenCache.delete(userId);
      }
    }

    // Try to load from database
    try {
      const secret = database.getSecret(`spotify_refresh_token_${userId}`);
      if (!secret) {
        return null;
      }

      // Decrypt the refresh token (assuming it's stored with encryption)
      const refreshToken = this._decryptToken(secret.value_encrypted, secret.encryption_key_id);

      // Refresh the access token
      return await this._refreshAccessToken(userId, refreshToken);
    } catch (error) {
      this.log('error', 'Error loading tokens from database', error);
      return null;
    }
  }

  /**
   * Refresh access token using refresh token
   * @private
   */
  async _refreshAccessToken(userId, refreshToken) {
    try {
      const response = await fetch(`${this.AUTH_BASE_URL}/api/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(`${this.CLIENT_ID}:${this.CLIENT_SECRET}`).toString('base64')
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken
        })
      });

      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.status}`);
      }

      const data = await response.json();

      const tokens = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || refreshToken, // Use new refresh token if provided
        expiresAt: Date.now() + (data.expires_in * 1000)
      };

      // Update cache
      this.tokenCache.set(userId, tokens);

      // Update database if refresh token changed
      if (data.refresh_token && data.refresh_token !== refreshToken) {
        const encrypted = this._encryptToken(data.refresh_token);
        database.saveSecret(
          `spotify_refresh_token_${userId}`,
          encrypted.value,
          encrypted.keyId,
          userId
        );
      }

      this.log('info', `Refreshed access token for user ${userId}`);
      return tokens;
    } catch (error) {
      this.log('error', 'Error refreshing access token', error);
      throw error;
    }
  }

  /**
   * Make an authenticated API request to Spotify
   * @private
   */
  async _apiRequest(userId, endpoint, method = 'GET', body = null) {
    const tokens = await this._getTokens(userId);

    if (!tokens) {
      throw new Error('Not authenticated');
    }

    const url = `${this.API_BASE_URL}${endpoint}`;
    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${tokens.accessToken}`,
        'Content-Type': 'application/json'
      }
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, options);

      // Handle no content responses
      if (response.status === 204) {
        return null;
      }

      // Handle errors
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        if (response.status === 404 && errorData.error?.reason === 'NO_ACTIVE_DEVICE') {
          throw new Error('NO_ACTIVE_DEVICE');
        }

        throw new Error(errorData.error?.message || `Spotify API error: ${response.status}`);
      }

      // Parse JSON response
      return await response.json();
    } catch (error) {
      this.log('error', `Spotify API request failed: ${method} ${endpoint}`, error);
      throw error;
    }
  }

  // ==================== Helper Methods ====================

  /**
   * Format time in MM:SS
   * @private
   */
  _formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Encrypt token for storage (placeholder - implement with crypto module)
   * @private
   */
  _encryptToken(token) {
    // For now, return as-is. In production, use proper encryption.
    // TODO: Implement proper encryption using crypto.createCipheriv
    return {
      value: token,
      keyId: 'default'
    };
  }

  /**
   * Decrypt token from storage (placeholder - implement with crypto module)
   * @private
   */
  _decryptToken(encryptedValue, keyId) {
    // For now, return as-is. In production, use proper decryption.
    // TODO: Implement proper decryption using crypto.createDecipheriv
    return encryptedValue;
  }

  /**
   * Response for when API is not configured
   * @private
   */
  _notConfiguredResponse() {
    let response = '*Spotify Integration Not Configured*\n\n';
    response += 'To enable Spotify control, an administrator needs to:\n\n';
    response += '1. Create a Spotify Developer App at https://developer.spotify.com/dashboard\n';
    response += '2. Set the following environment variables:\n';
    response += '   • SPOTIFY_CLIENT_ID\n';
    response += '   • SPOTIFY_CLIENT_SECRET\n';
    response += '   • SPOTIFY_REDIRECT_URI (callback URL)\n\n';
    response += '3. Add the redirect URI to your Spotify app settings\n';
    response += '4. Restart ClawdBot\n\n';
    response += '_This is a one-time setup required before users can connect their accounts._';

    return this.success(response);
  }

  /**
   * Get skill metadata
   */
  getMetadata() {
    const meta = super.getMetadata();
    return {
      ...meta,
      provider: 'Spotify Web API',
      apiConfigured: !!(this.CLIENT_ID && this.CLIENT_SECRET),
      activeSessions: this.tokenCache.size,
      requiresOAuth: true,
      oauthProvider: 'Spotify'
    };
  }

  /**
   * Shutdown the skill - clear token cache
   */
  async shutdown() {
    this.tokenCache.clear();
    this.log('info', 'Spotify token cache cleared');
    await super.shutdown();
  }
}

module.exports = SpotifySkill;
