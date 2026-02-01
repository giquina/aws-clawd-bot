/**
 * GitHub Project Manager
 * Handles file fetching and caching for GitHub repositories
 */

const { Octokit } = require('@octokit/rest');

// Initialize Octokit with GitHub token
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

// In-memory cache with TTL
const cache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 60 minutes

/**
 * Cache entry structure
 * @typedef {Object} CacheEntry
 * @property {*} data - Cached data
 * @property {number} timestamp - When the entry was cached
 */

/**
 * Get cached data if not expired
 * @param {string} key - Cache key
 * @returns {*|null} Cached data or null if expired/missing
 */
function getFromCache(key) {
  const entry = cache.get(key);
  if (!entry) {
    console.log(`[Cache MISS] ${key}`);
    return null;
  }

  if (Date.now() - entry.timestamp > CACHE_TTL) {
    console.log(`[Cache EXPIRED] ${key}`);
    cache.delete(key);
    return null;
  }

  console.log(`[Cache HIT] ${key}`);
  return entry.data;
}

/**
 * Set cache entry
 * @param {string} key - Cache key
 * @param {*} data - Data to cache
 */
function setCache(key, data) {
  cache.set(key, {
    data,
    timestamp: Date.now()
  });
}

/**
 * Fetch a file from GitHub repository
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} path - File path within repository
 * @returns {Promise<string|null>} File content decoded from base64, or null if not found
 */
async function fetchFile(owner, repo, path) {
  const cacheKey = `${owner}/${repo}/${path}`;

  // Check cache first
  const cached = getFromCache(cacheKey);
  if (cached !== null) {
    return cached;
  }

  try {
    const response = await octokit.repos.getContent({
      owner,
      repo,
      path
    });

    // Handle file content (base64 encoded)
    if (response.data.type === 'file' && response.data.content) {
      const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
      setCache(cacheKey, content);
      return content;
    }

    return null;
  } catch (error) {
    if (error.status === 404) {
      console.log(`[GitHub] File not found: ${cacheKey}`);
      return null;
    }
    if (error.status === 403 && error.message.includes('rate limit')) {
      console.error(`[GitHub] Rate limit exceeded`);
      throw new Error('GitHub API rate limit exceeded. Please try again later.');
    }
    throw error;
  }
}

/**
 * Fetch README.md from repository (tries README.md then readme.md)
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @returns {Promise<string|null>} README content or null if not found
 */
async function fetchReadme(owner, repo) {
  // Try README.md first
  let content = await fetchFile(owner, repo, 'README.md');
  if (content) return content;

  // Try lowercase readme.md
  content = await fetchFile(owner, repo, 'readme.md');
  return content;
}

/**
 * Fetch TODO.md from repository
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @returns {Promise<string|null>} TODO.md content or null if not found
 */
async function fetchTodoMd(owner, repo) {
  return fetchFile(owner, repo, 'TODO.md');
}

/**
 * List all repositories for authenticated user
 * @param {string} username - GitHub username (used for logging, actual fetch uses authenticated user)
 * @returns {Promise<Array>} Array of repository objects
 */
async function listRepos(username) {
  const cacheKey = `repos/${username}`;

  const cached = getFromCache(cacheKey);
  if (cached !== null) {
    return cached;
  }

  try {
    // Use paginate to get all repos
    const repos = await octokit.paginate(octokit.repos.listForAuthenticatedUser, {
      per_page: 100,
      sort: 'updated',
      direction: 'desc'
    });

    const simplified = repos.map(repo => ({
      name: repo.name,
      fullName: repo.full_name,
      owner: repo.owner.login,
      description: repo.description,
      private: repo.private,
      updatedAt: repo.updated_at,
      language: repo.language
    }));

    setCache(cacheKey, simplified);
    return simplified;
  } catch (error) {
    if (error.status === 403 && error.message.includes('rate limit')) {
      console.error(`[GitHub] Rate limit exceeded`);
      throw new Error('GitHub API rate limit exceeded. Please try again later.');
    }
    throw error;
  }
}

/**
 * List files in a repository directory
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} [path=''] - Directory path within repository
 * @returns {Promise<Array|null>} Array of file objects or null if not found
 */
async function listRepoFiles(owner, repo, path = '') {
  const cacheKey = `files/${owner}/${repo}/${path || 'root'}`;

  const cached = getFromCache(cacheKey);
  if (cached !== null) {
    return cached;
  }

  try {
    const response = await octokit.repos.getContent({
      owner,
      repo,
      path
    });

    // If it's a directory, we get an array
    if (Array.isArray(response.data)) {
      const files = response.data.map(item => ({
        name: item.name,
        path: item.path,
        type: item.type, // 'file' or 'dir'
        size: item.size
      }));

      setCache(cacheKey, files);
      return files;
    }

    return null;
  } catch (error) {
    if (error.status === 404) {
      console.log(`[GitHub] Path not found: ${owner}/${repo}/${path}`);
      return null;
    }
    if (error.status === 403 && error.message.includes('rate limit')) {
      console.error(`[GitHub] Rate limit exceeded`);
      throw new Error('GitHub API rate limit exceeded. Please try again later.');
    }
    throw error;
  }
}

/**
 * Fuzzy match a repository name from a list
 * @param {Array} repos - Array of repository objects
 * @param {string} query - Search query
 * @returns {Object|null} Best matching repo or null
 */
function fuzzyMatchRepo(repos, query) {
  if (!repos || repos.length === 0) return null;

  const normalizedQuery = query.toLowerCase().trim();

  // Exact match first
  const exactMatch = repos.find(r => r.name.toLowerCase() === normalizedQuery);
  if (exactMatch) return exactMatch;

  // Starts with query
  const startsWithMatch = repos.find(r => r.name.toLowerCase().startsWith(normalizedQuery));
  if (startsWithMatch) return startsWithMatch;

  // Contains query
  const containsMatch = repos.find(r => r.name.toLowerCase().includes(normalizedQuery));
  if (containsMatch) return containsMatch;

  // Word boundary match (e.g., "clawd" matches "aws-clawd-bot")
  const wordMatch = repos.find(r => {
    const parts = r.name.toLowerCase().split(/[-_]/);
    return parts.some(part => part.includes(normalizedQuery));
  });
  if (wordMatch) return wordMatch;

  return null;
}

/**
 * Search repositories by name using fuzzy matching
 * @param {string} username - GitHub username
 * @param {string} query - Search query
 * @returns {Promise<Array>} Array of matching repositories
 */
async function searchRepos(username, query) {
  const repos = await listRepos(username);
  const normalizedQuery = query.toLowerCase().trim();

  // Return all matches, sorted by relevance
  const matches = repos.filter(r => {
    const name = r.name.toLowerCase();
    return name.includes(normalizedQuery) ||
           name.split(/[-_]/).some(part => part.includes(normalizedQuery));
  });

  // Sort: exact matches first, then starts-with, then contains
  matches.sort((a, b) => {
    const aName = a.name.toLowerCase();
    const bName = b.name.toLowerCase();

    // Exact match has highest priority
    if (aName === normalizedQuery) return -1;
    if (bName === normalizedQuery) return 1;

    // Starts with has second priority
    if (aName.startsWith(normalizedQuery) && !bName.startsWith(normalizedQuery)) return -1;
    if (bName.startsWith(normalizedQuery) && !aName.startsWith(normalizedQuery)) return 1;

    return 0;
  });

  return matches;
}

/**
 * Invalidate a specific cache entry
 * @param {string} key - Cache key to invalidate
 * @returns {boolean} True if entry was removed
 */
function invalidateCache(key) {
  const deleted = cache.delete(key);
  if (deleted) {
    console.log(`[Cache INVALIDATED] ${key}`);
  }
  return deleted;
}

/**
 * Clear all cache entries
 * @returns {number} Number of entries cleared
 */
function clearCache() {
  const count = cache.size;
  cache.clear();
  console.log(`[Cache CLEARED] ${count} entries removed`);
  return count;
}

module.exports = {
  fetchFile,
  fetchReadme,
  fetchTodoMd,
  listRepos,
  listRepoFiles,
  searchRepos,
  fuzzyMatchRepo,
  invalidateCache,
  clearCache
};
