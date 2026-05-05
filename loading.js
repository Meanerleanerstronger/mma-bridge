// ==============================================
// MMA BRIDGE - LOADING STATES
// ==============================================

/**
 * Loading utilities for showing spinners and skeleton loaders
 * while data is being fetched
 */

// ========================================
// LOADING SPINNER
// ========================================

/**
 * Show a loading spinner in a container
 * @param {string|HTMLElement} target - CSS selector or element
 * @param {string} message - Optional loading message
 */
export function showLoading(target, message = 'Loading...') {
  const container = typeof target === 'string' 
    ? document.querySelector(target)
    : target;
    
  if (!container) return;
  
  container.innerHTML = `
    <div class="loading-container">
      <div class="spinner"></div>
      <p class="loading-text">${message}</p>
    </div>
  `;
}

/**
 * Hide loading spinner
 * @param {string|HTMLElement} target - CSS selector or element
 */
export function hideLoading(target) {
  const container = typeof target === 'string' 
    ? document.querySelector(target)
    : target;
    
  if (!container) return;
  
  const loadingContainer = container.querySelector('.loading-container');
  if (loadingContainer) {
    loadingContainer.remove();
  }
}

// ========================================
// SKELETON LOADERS (for specific components)
// ========================================

/**
 * Show skeleton loader for fighter cards
 */
export function showFighterCardsSkeleton(container) {
  const target = typeof container === 'string' 
    ? document.querySelector(container)
    : container;
    
  if (!target) return;
  
  target.innerHTML = `
    <div class="skeleton-grid">
      ${Array(6).fill(0).map(() => `
        <div class="skeleton-card">
          <div class="skeleton-image"></div>
          <div class="skeleton-line"></div>
          <div class="skeleton-line short"></div>
        </div>
      `).join('')}
    </div>
  `;
}

/**
 * Show skeleton loader for event list
 */
export function showEventsSkeleton(container) {
  const target = typeof container === 'string' 
    ? document.querySelector(container)
    : container;
    
  if (!target) return;
  
  target.innerHTML = `
    <div class="skeleton-events">
      ${Array(3).fill(0).map(() => `
        <div class="skeleton-event">
          <div class="skeleton-line"></div>
          <div class="skeleton-line short"></div>
          <div class="skeleton-line medium"></div>
        </div>
      `).join('')}
    </div>
  `;
}

/**
 * Show skeleton loader for news cards
 */
export function showNewsCardsSkeleton(container) {
  const target = typeof container === 'string' 
    ? document.querySelector(container)
    : container;
    
  if (!target) return;
  
  target.innerHTML = `
    <div class="skeleton-news">
      ${Array(3).fill(0).map(() => `
        <div class="skeleton-card">
          <div class="skeleton-image"></div>
          <div class="skeleton-line"></div>
        </div>
      `).join('')}
    </div>
  `;
}

// ========================================
// ERROR DISPLAY
// ========================================

/**
 * Show error message to user
 * @param {string|HTMLElement} target - Container to show error in
 * @param {string} message - Error message
 * @param {boolean} showRetry - Show retry button
 */
export function showError(target, message = 'Something went wrong', showRetry = true) {
  const container = typeof target === 'string' 
    ? document.querySelector(target)
    : target;
    
  if (!container) return;
  
  container.innerHTML = `
    <div class="error-container">
      <p class="error-msg">${message}</p>
      ${showRetry ? `<button class="retry-button" onclick="location.reload()">Try Again</button>` : ''}
    </div>
  `;
}

// ========================================
// GLOBAL LOADING OVERLAY (for full page)
// ========================================

let globalOverlay = null;

/**
 * Show full-page loading overlay
 */
export function showGlobalLoading(message = 'Loading...') {
  if (globalOverlay) return; // Already showing
  
  globalOverlay = document.createElement('div');
  globalOverlay.className = 'global-loading-overlay';
  globalOverlay.innerHTML = `
    <div class="global-loading-content">
      <div class="spinner large"></div>
      <p>${message}</p>
    </div>
  `;
  
  document.body.appendChild(globalOverlay);
  document.body.style.overflow = 'hidden';
}

/**
 * Hide full-page loading overlay
 */
export function hideGlobalLoading() {
  if (globalOverlay) {
    globalOverlay.remove();
    globalOverlay = null;
    document.body.style.overflow = '';
  }
}
