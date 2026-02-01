/**
 * Active Project Manager
 * Manages active project context per user and repository aliases
 */

// In-memory storage for active projects per user
const activeProjects = new Map();

// In-memory storage for repository aliases
const aliases = new Map();

// Active project TTL (2 hours)
const PROJECT_TTL = 2 * 60 * 60 * 1000;

/**
 * Repository info structure
 * @typedef {Object} RepoInfo
 * @property {string} owner - Repository owner
 * @property {string} repo - Repository name
 * @property {string} fullName - Full name (owner/repo)
 * @property {number} setAt - Timestamp when project was set
 */

/**
 * Active project entry
 * @typedef {Object} ActiveProjectEntry
 * @property {RepoInfo} repoInfo - Repository information
 * @property {number} lastAccessed - Last access timestamp
 */

/**
 * Set active project for a user
 * @param {string} userId - User identifier (e.g., phone number)
 * @param {RepoInfo|Object} repoInfo - Repository information
 * @returns {RepoInfo} The stored repo info
 */
function setActiveProject(userId, repoInfo) {
  // Normalize repo info
  const normalized = {
    owner: repoInfo.owner,
    repo: repoInfo.repo,
    fullName: repoInfo.fullName || `${repoInfo.owner}/${repoInfo.repo}`,
    setAt: Date.now()
  };

  activeProjects.set(userId, {
    repoInfo: normalized,
    lastAccessed: Date.now()
  });

  console.log(`[ActiveProject] Set for ${userId}: ${normalized.fullName}`);
  return normalized;
}

/**
 * Get active project for a user
 * @param {string} userId - User identifier
 * @returns {RepoInfo|null} Active project info or null if not set/expired
 */
function getActiveProject(userId) {
  const entry = activeProjects.get(userId);

  if (!entry) {
    console.log(`[ActiveProject] No active project for ${userId}`);
    return null;
  }

  // Check if expired (2 hours since last access)
  if (Date.now() - entry.lastAccessed > PROJECT_TTL) {
    console.log(`[ActiveProject] Expired for ${userId}`);
    activeProjects.delete(userId);
    return null;
  }

  // Update last accessed time
  entry.lastAccessed = Date.now();
  activeProjects.set(userId, entry);

  console.log(`[ActiveProject] Retrieved for ${userId}: ${entry.repoInfo.fullName}`);
  return entry.repoInfo;
}

/**
 * Clear active project for a user
 * @param {string} userId - User identifier
 * @returns {boolean} True if project was cleared
 */
function clearActiveProject(userId) {
  const deleted = activeProjects.delete(userId);
  if (deleted) {
    console.log(`[ActiveProject] Cleared for ${userId}`);
  }
  return deleted;
}

/**
 * Add a repository alias
 * @param {string} alias - Short alias (e.g., "judo")
 * @param {string} repoName - Full repository name (e.g., "judo-website")
 * @returns {void}
 */
function addAlias(alias, repoName) {
  const normalizedAlias = alias.toLowerCase().trim();
  aliases.set(normalizedAlias, repoName);
  console.log(`[Alias] Added: ${normalizedAlias} -> ${repoName}`);
}

/**
 * Resolve an alias to full repository name
 * @param {string} alias - Alias to resolve
 * @returns {string|null} Full repository name or null if no alias exists
 */
function resolveAlias(alias) {
  const normalizedAlias = alias.toLowerCase().trim();
  const resolved = aliases.get(normalizedAlias);

  if (resolved) {
    console.log(`[Alias] Resolved: ${normalizedAlias} -> ${resolved}`);
  }

  return resolved || null;
}

/**
 * Get all defined aliases
 * @returns {Object} Object mapping aliases to repo names
 */
function getAliases() {
  const result = {};
  for (const [alias, repoName] of aliases.entries()) {
    result[alias] = repoName;
  }
  return result;
}

/**
 * Check if user has an active project
 * @param {string} userId - User identifier
 * @returns {boolean} True if user has a non-expired active project
 */
function hasActiveProject(userId) {
  return getActiveProject(userId) !== null;
}

/**
 * Get all active projects (for debugging/admin)
 * @returns {Object} Object mapping userIds to their active projects
 */
function getAllActiveProjects() {
  const result = {};
  const now = Date.now();

  for (const [userId, entry] of activeProjects.entries()) {
    // Skip expired entries
    if (now - entry.lastAccessed > PROJECT_TTL) {
      continue;
    }
    result[userId] = {
      ...entry.repoInfo,
      minutesRemaining: Math.round((PROJECT_TTL - (now - entry.lastAccessed)) / 60000)
    };
  }

  return result;
}

/**
 * Clean up expired entries (optional maintenance)
 * @returns {number} Number of expired entries removed
 */
function cleanupExpired() {
  const now = Date.now();
  let removed = 0;

  for (const [userId, entry] of activeProjects.entries()) {
    if (now - entry.lastAccessed > PROJECT_TTL) {
      activeProjects.delete(userId);
      removed++;
    }
  }

  if (removed > 0) {
    console.log(`[ActiveProject] Cleaned up ${removed} expired entries`);
  }

  return removed;
}

module.exports = {
  setActiveProject,
  getActiveProject,
  clearActiveProject,
  hasActiveProject,
  addAlias,
  resolveAlias,
  getAliases,
  getAllActiveProjects,
  cleanupExpired
};
