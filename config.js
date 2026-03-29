// ==============================================
// MMA BRIDGE - CONFIGURATION
// ==============================================

/**
 * Environment Configuration
 * 
 * This file handles switching between:
 * - Development mode (local JSON files)
 * - Production mode (live API endpoints)
 */

// Detect environment
const isDevelopment = window.location.hostname === 'localhost' || 
                      window.location.hostname === '127.0.0.1' ||
                      window.location.protocol === 'file:';

// Configuration object
export const CONFIG = {
  // Environment
  ENV: isDevelopment ? 'development' : 'production',
  IS_DEV: isDevelopment,
  IS_PROD: !isDevelopment,

  // API Settings
  API: {
    // Base URL - change this when you deploy your backend
    BASE_URL: isDevelopment 
      ? 'http://localhost:5001/api'  // Local backend
      : 'https://mmabridge-backend.onrender.com/api',
  // Production API (change this!)
    
    // Use mock data (local JSON files) or real API
    USE_MOCK: isDevelopment,  // auto: true locally, false on production
    
    // Timeout for API requests (milliseconds)
    TIMEOUT: 10000,
    
    // Retry failed requests
    RETRY_ATTEMPTS: 3,
  },

  // Endpoints
  ENDPOINTS: {
    // Fighters
    FIGHTERS: '/fighters',
    FIGHTER_BY_ID: (id) => `/fighters/${id}`,
    
    // Events
    EVENTS: '/events',
    UPCOMING_EVENTS: '/events/upcoming',
    PAST_EVENTS: '/events/past',
    EVENT_BY_ID: (id) => `/events/${id}`,
    
    // News
    NEWS: '/news',
    NEWS_TRENDING: '/news/trending',
    NEWS_HERO: '/news/hero',
    
    // Rankings
    RANKINGS_PFP: '/rankings/pfp',
    RANKINGS_BY_DIVISION: (division) => `/rankings/${division}`,
    
    // Search
    SEARCH: '/search',
  },

  // Local Mock Data Paths (for development)
  MOCK_DATA: {
    FIGHTERS: './fighters.json',
    EVENTS: './events.json',
    NEWS: './data/news.json',
    TOP_FIGHTERS: './data/top_fighters.json',
  },

  // Feature Flags
  FEATURES: {
    CHATBOT_ENABLED: false,  // Enable AI chatbot when ready
    SEARCH_ENABLED: true,
    LIVE_UPDATES: false,     // WebSocket updates
    OFFLINE_MODE: false,     // Service worker caching
  },

  // AI Chatbot (for when you add it)
  AI: {
    ENABLED: false,
    ENDPOINT: '/chat',
    MODEL: 'claude-sonnet-4',
  },

  // Cache settings
  CACHE: {
    ENABLED: true,
    TTL: 5 * 60 * 1000,  // 5 minutes
  },

  // Logging
  DEBUG: isDevelopment,
};

// Helper function to log in development only
export function debugLog(...args) {
  if (CONFIG.DEBUG) {
    console.log('[MMA Bridge]', ...args);
  }
}

// Helper function to get full API URL
export function getApiUrl(endpoint) {
  if (CONFIG.API.USE_MOCK) {
    return null; // Will use mock data instead
  }
  return `${CONFIG.API.BASE_URL}${endpoint}`;
}

// Export for easy importing
export default CONFIG;
