// ==============================================
// MMA BRIDGE - API UTILITY
// ==============================================

/**
 * Centralized API fetching with error handling,
 * automatic mock/live switching, and caching
 */

import CONFIG, { debugLog, getApiUrl } from './config.js';

// Simple in-memory cache
const cache = new Map();

/**
 * Main fetch wrapper with automatic mock/API switching
 * @param {string} endpoint - API endpoint or mock file path
 * @param {object} options - Fetch options
 * @returns {Promise} - Parsed JSON data
 */
export async function fetchData(endpoint, options = {}) {
  try {
    debugLog(`Fetching: ${endpoint}`);

    // Check cache first
    if (CONFIG.CACHE.ENABLED && !options.skipCache) {
      const cached = getFromCache(endpoint);
      if (cached) {
        debugLog(`Cache hit: ${endpoint}`);
        return cached;
      }
    }

    let url;
    
    // Determine if we're using mock data or real API
    if (CONFIG.API.USE_MOCK) {
      // Use local JSON files
      url = getMockPath(endpoint);
      debugLog(`Using mock data: ${url}`);
    } else {
      // Use real API
      url = getApiUrl(endpoint);
      debugLog(`Using API: ${url}`);
    }

    // Fetch with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.API.TIMEOUT);

    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Check response
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    // Cache the result
    if (CONFIG.CACHE.ENABLED) {
      saveToCache(endpoint, data);
    }

    debugLog(`Success: ${endpoint}`);
    return data;

  } catch (error) {
    debugLog(`Error fetching ${endpoint}:`, error);
    
    // Handle specific errors
    if (error.name === 'AbortError') {
      throw new Error('Request timeout - please try again');
    }
    
    throw error;
  }
}

/**
 * Get mock data path based on endpoint
 */
function getMockPath(endpoint) {
  // Map API endpoints to local mock files
  const mockMap = {
    '/fighters': CONFIG.MOCK_DATA.FIGHTERS,
    '/events': CONFIG.MOCK_DATA.EVENTS,
    '/events/upcoming': CONFIG.MOCK_DATA.EVENTS,
    '/news': CONFIG.MOCK_DATA.NEWS,
    '/news/trending': CONFIG.MOCK_DATA.NEWS,
    '/rankings/pfp': CONFIG.MOCK_DATA.TOP_FIGHTERS,
  };

  return mockMap[endpoint] || endpoint;
}

/**
 * Cache helpers
 */
function getCacheKey(endpoint) {
  return `mma_bridge_${endpoint}`;
}

function getFromCache(endpoint) {
  const key = getCacheKey(endpoint);
  const item = cache.get(key);
  
  if (!item) return null;
  
  // Check if expired
  if (Date.now() - item.timestamp > CONFIG.CACHE.TTL) {
    cache.delete(key);
    return null;
  }
  
  return item.data;
}

function saveToCache(endpoint, data) {
  const key = getCacheKey(endpoint);
  cache.set(key, {
    data,
    timestamp: Date.now(),
  });
}

/**
 * Clear cache (useful for force refresh)
 */
export function clearCache() {
  cache.clear();
  debugLog('Cache cleared');
}

/**
 * Fetch with retry — retries up to `retries` times on network error or 5xx.
 * Does NOT retry on 4xx responses.
 */
export async function fetchWithRetry(url, options = {}, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.ok || res.status < 500) return res; // don't retry 4xx
      if (i === retries) return res;
      await new Promise(r => setTimeout(r, 800 * (i + 1)));
    } catch (err) {
      if (i === retries) throw err;
      await new Promise(r => setTimeout(r, 800 * (i + 1)));
    }
  }
}

/**
 * Specific API methods for common endpoints
 */
// In-memory cache for events.json (valid for the browser session)
let _eventsCache = null;
async function fetchEventsJson() {
  if (_eventsCache) return _eventsCache;
  _eventsCache = await fetch('./events.json').then(r => r.json());
  return _eventsCache;
}

export const API = {
  // Fighters
  async getFighters() {
    return fetch('/fighters.json').then(r => r.json());
  },

  async getFighter(id) {
    return fetchData(CONFIG.ENDPOINTS.FIGHTER_BY_ID(id));
  },

  // Events
  async getEvents() {
    return fetchData(CONFIG.ENDPOINTS.EVENTS);
  },

  async getUpcomingEvents() {
    const today = new Date().toISOString().slice(0,10);
    const all = await fetchEventsJson();
    return all.filter(e => (e.isoDate || '9999') >= today && e.status !== 'completed');
  },

  async getPastEvents() {
    const today = new Date().toISOString().slice(0,10);
    const all = await fetchEventsJson();
    return all.filter(e => (e.isoDate || '9999') <= today && e.status === 'completed');
  },

  async getEvent(id) {
    return fetchData(CONFIG.ENDPOINTS.EVENT_BY_ID(id));
  },

  // News
  async getNews() {
    return fetchData(CONFIG.ENDPOINTS.NEWS);
  },

  async getTrendingNews() {
    return fetchData(CONFIG.ENDPOINTS.NEWS_TRENDING);
  },

  // Rankings
  async getPFPRankings() {
    return fetchData(CONFIG.ENDPOINTS.RANKINGS_PFP);
  },

  async getRankingsByDivision(division) {
    return fetchData(CONFIG.ENDPOINTS.RANKINGS_BY_DIVISION(division));
  },

  // Search
  async search(query) {
    return fetchData(`${CONFIG.ENDPOINTS.SEARCH}?q=${encodeURIComponent(query)}`);
  },

  // Retry-aware fetch utility
  fetchWithRetry,
};

export default API;
