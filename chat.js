/* ==============================================
   LUCAS BOT - CHAT WIDGET
   ============================================== */

// Chat state
let chatHistory = [];
let isChatOpen = false;

// Create chat widget HTML
function createChatWidget() {
    const chatHTML = `
        <!-- Chat Button -->
        <button id="chat-button" class="chat-button" aria-label="Open chat">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <span class="chat-badge">Ask Lucas!</span>
        </button>

        <!-- Chat Window -->
        <div id="chat-window" class="chat-window" style="display: none;">
            <!-- Header -->
            <div class="chat-header">
                <div class="chat-header-content">
                    <div class="chat-avatar">🥊</div>
                    <div>
                        <div class="chat-title">Lucas Bot</div>
                        <div class="chat-subtitle">MMA Expert</div>
                    </div>
                </div>
                <button id="chat-close" class="chat-close-btn" aria-label="Close chat">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>

            <!-- Messages -->
            <div id="chat-messages" class="chat-messages">
                <div class="chat-message bot-message">
                    <div class="message-avatar">🥊</div>
                    <div class="message-content">
                        <div class="message-text">Hey! I'm Lucas, your MMA expert. Ask me anything about fighters, upcoming events, or MMA news!</div>
                    </div>
                </div>
            </div>

            <!-- Input -->
            <div class="chat-input-container">
                <input 
                    type="text" 
                    id="chat-input" 
                    class="chat-input" 
                    placeholder="Ask about fighters, events, news..."
                    autocomplete="off"
                />
                <button id="chat-send" class="chat-send-btn" aria-label="Send message">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="22" y1="2" x2="11" y2="13"></line>
                        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                    </svg>
                </button>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', chatHTML);
}

// Toggle chat window
function toggleChat() {
    isChatOpen = !isChatOpen;
    const chatWindow = document.getElementById('chat-window');
    const chatButton = document.getElementById('chat-button');
    
    if (isChatOpen) {
        chatWindow.style.display = 'flex';
        chatButton.style.display = 'none';
        document.getElementById('chat-input').focus();
    } else {
        chatWindow.style.display = 'none';
        chatButton.style.display = 'flex';
    }
}

// Add message to chat
function addMessage(text, isUser = false) {
    const messagesContainer = document.getElementById('chat-messages');
    
    const messageHTML = `
        <div class="chat-message ${isUser ? 'user-message' : 'bot-message'}">
            ${!isUser ? '<div class="message-avatar">🥊</div>' : ''}
            <div class="message-content">
                <div class="message-text">${text}</div>
            </div>
        </div>
    `;
    
    messagesContainer.insertAdjacentHTML('beforeend', messageHTML);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Show typing indicator
function showTyping() {
    const messagesContainer = document.getElementById('chat-messages');
    
    const typingHTML = `
        <div class="chat-message bot-message typing-indicator" id="typing-indicator">
            <div class="message-avatar">🥊</div>
            <div class="message-content">
                <div class="typing-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>
        </div>
    `;
    
    messagesContainer.insertAdjacentHTML('beforeend', typingHTML);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Remove typing indicator
function removeTyping() {
    const typingIndicator = document.getElementById('typing-indicator');
    if (typingIndicator) {
        typingIndicator.remove();
    }
}

// Detect current page
function getCurrentPage() {
    const path = window.location.pathname;
    if (path.includes('pfp.html')) return 'pfp';
    if (path.includes('events.html')) return 'events';
    if (path.includes('lucas.html')) return 'lucas';
    if (path.includes('index.html') || path === '/') return 'home';
    return 'general';
}

// Send message to backend
async function sendMessage(message) {
    try {
        const response = await fetch('http://localhost:5001/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: message,
                history: chatHistory,
                page: getCurrentPage()  // Send page context
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Add to chat history
            chatHistory.push(
                { role: 'user', content: message },
                { role: 'assistant', content: data.response }
            );
            
            return data.response;
        } else {
            throw new Error(data.error || 'Failed to get response');
        }
        
    } catch (error) {
        console.error('Chat error:', error);
        return "Sorry, I'm having trouble connecting right now. Make sure the backend is running!";
    }
}

// Handle send button click
async function handleSend() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    
    if (!message) return;
    
    // Add user message
    addMessage(message, true);
    input.value = '';
    
    // Show typing indicator
    showTyping();
    
    // Get response
    const response = await sendMessage(message);
    
    // Remove typing indicator and show response
    removeTyping();
    addMessage(response, false);
}

// Initialize chat
function initChat() {
    createChatWidget();
    
    // Event listeners
    document.getElementById('chat-button').addEventListener('click', toggleChat);
    document.getElementById('chat-close').addEventListener('click', toggleChat);
    
    document.getElementById('chat-send').addEventListener('click', handleSend);
    
    document.getElementById('chat-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleSend();
        }
    });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChat);
} else {
    initChat();
}
