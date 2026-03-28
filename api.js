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
 * Specific API methods for common endpoints
 */
export const API = {
  // Fighters
  async getFighters() {
    return fetchData(CONFIG.ENDPOINTS.FIGHTERS);
  },

  async getFighter(id) {
    return fetchData(CONFIG.ENDPOINTS.FIGHTER_BY_ID(id));
  },

  // Events
  async getEvents() {
    return fetchData(CONFIG.ENDPOINTS.EVENTS);
  },

  async getUpcomingEvents() {
    return fetchData(CONFIG.ENDPOINTS.UPCOMING_EVENTS);
  },

  async getPastEvents() {
    if (CONFIG.API.USE_MOCK) {
      // In mock mode filter locally by isoDate
      const all = await fetchData(CONFIG.ENDPOINTS.EVENTS);
      const today = new Date().toISOString().slice(0,10);
      return all.filter(e => (e.isoDate || '9999') < today);
    }
    return fetchData('/events/past');
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
};

export default API;
