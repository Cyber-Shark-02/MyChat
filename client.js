document.addEventListener('DOMContentLoaded', () => {
    // Manages the application's overall state
    const state = {
        currentUser: null, // Stores { username, userCode } of the logged-in user
        contacts: [],      // Stores an array of contact objects
        activeChat: null,  // Stores the userCode of the currently active chat
        socket: null,      // Holds the WebSocket connection object
    };

    // A central object to hold references to all necessary DOM elements
    const DOMElements = {
        // Authentication Section
        authContainer: document.getElementById('auth-container'),
        loginForm: document.getElementById('login-form'),
        signupForm: document.getElementById('signup-form'),
        toggleToSignup: document.getElementById('toggle-to-signup'),
        toggleToLogin: document.getElementById('toggle-to-login'),
        authError: document.getElementById('auth-error'),

        // Main Application Container
        appContainer: document.getElementById('app-container'),
        sidebar: document.getElementById('sidebar'),
        chatWindow: document.getElementById('chat-window'),
        contactList: document.getElementById('contact-list'),

        // Chat Window Header
        chatHeader: document.getElementById('chat-header'),
        chatHeaderName: document.getElementById('chat-header-name'),
        chatHeaderStatus: document.getElementById('chat-header-status'),
        onlineIndicator: document.getElementById('online-indicator'),
        typingIndicator: document.getElementById('typing-indicator'),

        // Messages Area
        messageContainer: document.getElementById('message-container'),
        messageForm: document.getElementById('message-form'),
        messageInput: document.getElementById('message-input'),

        // Mobile UI Controls
        backToContacts: document.getElementById('back-to-contacts'),

        // Modals
        modalBackdrop: document.getElementById('modal-backdrop'),
        userCodeModal: document.getElementById('user-code-modal'),
        userCodeDisplay: document.getElementById('user-code-display'),
        userCodeText: document.getElementById('user-code-text'),
        closeUserCodeModal: document.getElementById('close-user-code-modal'),
        profileButton: document.getElementById('profile-button'),
        profileModal: document.getElementById('profile-modal'),
        profileName: document.getElementById('profile-name'),
        profileCode: document.getElementById('profile-code'),
        closeProfileModal: document.getElementById('close-profile-modal'),
        addContactButton: document.getElementById('add-contact-button'),
        addContactModal: document.getElementById('add-contact-modal'),
        addContactForm: document.getElementById('add-contact-form'),
        addContactInput: document.getElementById('add-contact-input'),
        addContactError: document.getElementById('add-contact-error'),
        cancelAddContact: document.getElementById('cancel-add-contact'),
        logoutButton: document.getElementById('logout-button'),

        // Toast Notification
        toast: document.getElementById('toast-notification'),
    };

    // --- WebSocket Communication ---

    /**
     * Initializes the WebSocket connection and sets up listeners for its events.
     */
    function connectWebSocket() {
        // Use a secure WebSocket connection (wss) if the site is loaded over https
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        state.socket = new WebSocket(`${protocol}//${window.location.host}`);

        state.socket.addEventListener('open', () => {
            console.log('WebSocket connection established.');
            // On connection, check for a session token to attempt auto-login
            const token = localStorage.getItem('chat-app-token');
            if (token) {
                sendToServer('authenticate', { token });
            }
        });

        state.socket.addEventListener('message', (event) => {
            try {
                const message = JSON.parse(event.data);
                handleServerMessage(message);
            } catch (error) {
                console.error('Failed to parse server message:', error);
            }
        });

        state.socket.addEventListener('close', () => {
            console.log('WebSocket connection closed. Attempting to reconnect...');
            // Automatically try to reconnect after 3 seconds
            setTimeout(connectWebSocket, 3000);
        });

        state.socket.addEventListener('error', (error) => {
            console.error('WebSocket error:', error);
        });
    }

    /**
     * A helper function to send formatted messages to the WebSocket server.
     * @param {string} type - The category of the message (e.g., 'login', 'sendMessage').
     * @param {object} payload - The data for the message.
     */
    function sendToServer(type, payload) {
        if (state.socket && state.socket.readyState === WebSocket.OPEN) {
            state.socket.send(JSON.stringify({ type, payload }));
        }
    }

    /**
     * Processes incoming messages from the server and calls the appropriate function.
     * @param {object} message - The parsed message object { type, payload } from the server.
     */
    function handleServerMessage({ type, payload }) {
        const handlers = {
            'error': ({ message }) => showAuthError(message),
            'signupSuccess': ({ userCode }) => {
                DOMElements.userCodeText.textContent = userCode;
                showModal(DOMElements.userCodeModal);
            },
            'loginSuccess': ({ username, userCode, token }) => {
                state.currentUser = { username, userCode };
                localStorage.setItem('chat-app-token', token);
                DOMElements.authContainer.classList.add('hidden');
                DOMElements.appContainer.classList.remove('hidden');
            },
            'authFail': () => {
                // If auto-login with a token fails, reset the UI
                localStorage.removeItem('chat-app-token');
                DOMElements.authContainer.classList.remove('hidden');
                DOMElements.appContainer.classList.add('hidden');
            },
            'contacts': (contacts) => {
                state.contacts = contacts.map(c => ({ ...c, messages: c.messages || [] }));
                updateContactList();
            },
            'newMessage': (message) => {
                const contact = state.contacts.find(c => c.userCode === message.from);
                if (contact) {
                    contact.messages.push(message);
                    if (state.activeChat === message.from) {
                        renderChat(contact);
                        // If chat is open, mark the message as read immediately
                        sendToServer('markAsRead', { contactCode: message.from });
                    } else {
                        // Otherwise, increment the unread messages badge
                        contact.unread = (contact.unread || 0) + 1;
                    }
                    updateContactList();
                }
            },
            'messageRead': ({ contactCode, messageIds }) => {
                const contact = state.contacts.find(c => c.userCode === contactCode);
                if (contact && state.activeChat === contactCode) {
                    messageIds.forEach(id => {
                        const msg = contact.messages.find(m => m.id === id);
                        if (msg) msg.read = true;
                    });
                    updateMessageStatus(contactCode);
                }
            },
            'typing': ({ userCode }) => {
                if (state.activeChat === userCode) {
                    DOMElements.typingIndicator.classList.remove('hidden');
                }
            },
            'stopTyping': ({ userCode }) => {
                if (state.activeChat === userCode) {
                    DOMElements.typingIndicator.classList.add('hidden');
                }
            },
            'statusChange': ({ userCode, online }) => {
                const contact = state.contacts.find(c => c.userCode === userCode);
                if (contact) {
                    contact.online = online;
                    updateContactList();
                    if (state.activeChat === userCode) {
                        DOMElements.onlineIndicator.style.display = online ? 'block' : 'none';
                    }
                }
            },
            'addContactSuccess': (newContact) => {
                state.contacts.push({ ...newContact, messages: [] });
                updateContactList();
                hideModals();
                DOMElements.addContactForm.reset();
                showToast('Contact added successfully!');
            },
            'addContactError': ({ message }) => {
                DOMElements.addContactError.textContent = message;
                setTimeout(() => DOMElements.addContactError.textContent = '', 3000);
            }
        };

        if (handlers[type]) {
            handlers[type](payload);
        } else {
            console.warn(`No handler for message type: ${type}`);
        }
    }


    // --- UI Rendering and Management ---

    /**
     * Re-renders the entire contact list in the sidebar.
     */
    function updateContactList() {
        DOMElements.contactList.innerHTML = '';
        // Sort contacts to show the most recent chats on top
        state.contacts.sort((a, b) => {
            const lastMsgA = a.messages[a.messages.length - 1];
            const lastMsgB = b.messages[b.messages.length - 1];
            return (lastMsgB?.timestamp || 0) - (lastMsgA?.timestamp || 0);
        });

        state.contacts.forEach(contact => {
            const lastMessage = contact.messages[contact.messages.length - 1];
            const li = document.createElement('li');
            li.className = `contact-item ${contact.userCode === state.activeChat ? 'active' : ''}`;
            li.dataset.userCode = contact.userCode;
            li.innerHTML = `
                <div class="contact-info">
                    <span class="contact-name">${contact.username}</span>
                    <p class="contact-last-message">${lastMessage ? lastMessage.text : 'No messages yet.'}</p>
                </div>
                ${contact.unread > 0 ? `<span class="unread-badge">${contact.unread}</span>` : ''}
            `;
            li.addEventListener('click', () => {
                state.activeChat = contact.userCode;
                const contactData = state.contacts.find(c => c.userCode === contact.userCode);
                if (contactData) {
                    renderChat(contactData);
                    if (contactData.unread > 0) {
                        sendToServer('markAsRead', { contactCode: contact.userCode });
                        contactData.unread = 0;
                    }
                }
                updateContactList(); // Re-render to update the 'active' class
            });
            DOMElements.contactList.appendChild(li);
        });
    }

    /**
     * Renders the chat messages and header for the active contact.
     * @param {object} contact - The contact object for the chat to be rendered.
     */
    function renderChat(contact) {
        DOMElements.chatHeaderName.textContent = contact.username;
        DOMElements.onlineIndicator.style.display = contact.online ? 'block' : 'none';
        DOMElements.chatHeaderStatus.classList.remove('hidden');
        DOMElements.typingIndicator.classList.add('hidden');

        DOMElements.messageContainer.innerHTML = '';
        contact.messages.forEach(msg => {
            const msgDiv = document.createElement('div');
            const isSender = msg.from === state.currentUser.userCode;
            msgDiv.className = `message ${isSender ? 'sent' : 'received'}`;
            msgDiv.dataset.messageId = msg.id;
            msgDiv.innerHTML = `
                <p>${msg.text}</p>
                <div class="message-meta">
                    <span class="timestamp">${new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    ${isSender ? `<span class="read-receipt">${msg.read ? '✓✓' : '✓'}</span>` : ''}
                </div>
            `;
            DOMElements.messageContainer.appendChild(msgDiv);
        });

        // Automatically scroll to the latest message
        DOMElements.messageContainer.scrollTop = DOMElements.messageContainer.scrollHeight;

        // On mobile, show the chat window and hide the contact list
        DOMElements.sidebar.classList.add('mobile-hidden');
        DOMElements.chatWindow.classList.remove('mobile-hidden');
    }

    /**
     * Updates the visual status (read receipts) of messages in the active chat.
     * @param {string} contactCode - The user code of the contact in the active chat.
     */
    function updateMessageStatus(contactCode) {
        if (state.activeChat !== contactCode) return;

        const contact = state.contacts.find(c => c.userCode === contactCode);
        if (!contact) return;

        contact.messages.forEach(msg => {
            if (msg.from === state.currentUser.userCode && msg.read) {
                const msgElement = DOMElements.messageContainer.querySelector(`[data-message-id="${msg.id}"] .read-receipt`);
                if (msgElement) {
                    msgElement.textContent = '✓✓';
                    msgElement.classList.add('read');
                }
            }
        });
    }

    /**
     * Displays a modal and its backdrop overlay.
     * @param {HTMLElement} modal - The modal element to be shown.
     */
    function showModal(modal) {
        DOMElements.modalBackdrop.classList.remove('hidden');
        modal.classList.remove('hidden');
    }

    /**
     * Hides all active modals and the backdrop.
     */
    function hideModals() {
        DOMElements.modalBackdrop.classList.add('hidden');
        document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    }

    /**
     * Shows an error message in the authentication form for a few seconds.
     * @param {string} message - The error message to display.
     */
    function showAuthError(message) {
        DOMElements.authError.textContent = message;
        setTimeout(() => DOMElements.authError.textContent = '', 3000);
    }

    /**
     * Shows a brief toast notification at the bottom of the screen.
     * @param {string} message - The message to display in the toast.
     */
    function showToast(message) {
        DOMElements.toast.textContent = message;
        DOMElements.toast.classList.add('show');
        setTimeout(() => {
            DOMElements.toast.classList.remove('show');
        }, 2500);
    }

    // --- Event Listeners Setup ---

    /**
     * Attaches all primary event listeners for the application's UI.
     */
    function setupEventListeners() {
        // Switch between login and signup forms
        DOMElements.toggleToSignup.addEventListener('click', () => {
            DOMElements.loginForm.classList.add('hidden');
            DOMElements.signupForm.classList.remove('hidden');
        });
        DOMElements.toggleToLogin.addEventListener('click', () => {
            DOMElements.signupForm.classList.add('hidden');
            DOMElements.loginForm.classList.remove('hidden');
        });

        // Handle login submission
        DOMElements.loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const username = DOMElements.loginForm.querySelector('#login-username').value;
            const password = DOMElements.loginForm.querySelector('#login-password').value;
            sendToServer('login', { username, password });
        });

        // Handle signup submission
        DOMElements.signupForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const username = DOMElements.signupForm.querySelector('#signup-username').value;
            const password = DOMElements.signupForm.querySelector('#signup-password').value;
            sendToServer('signup', { username, password });
        });
        
        // Copy user code to clipboard when the code display is clicked
        DOMElements.userCodeDisplay.addEventListener('click', () => {
            const code = DOMElements.userCodeText.textContent;
            if (!code) return;

            const textArea = document.createElement('textarea');
            textArea.value = code;
            textArea.style.position = 'fixed';
            textArea.style.opacity = '0';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();

            try {
                const successful = document.execCommand('copy');
                showToast(successful ? 'Code copied to clipboard!' : 'Could not copy code.');
            } catch (err) {
                 showToast('Could not copy code.');
            }

            document.body.removeChild(textArea);
        });

        // Handle sending a new message
        DOMElements.messageForm.addEventListener('submit', e => {
            e.preventDefault();
            const text = DOMElements.messageInput.value.trim();
            if (text && state.activeChat) {
                const message = { to: state.activeChat, text: text };
                sendToServer('sendMessage', message);

                // Add the message to the UI immediately for a responsive feel
                const contact = state.contacts.find(c => c.userCode === state.activeChat);
                if (contact) {
                    contact.messages.push({
                        id: `temp-${Date.now()}`,
                        from: state.currentUser.userCode,
                        to: state.activeChat,
                        text,
                        timestamp: Date.now(),
                        read: false
                    });
                    renderChat(contact);
                }
                
                DOMElements.messageInput.value = '';
            }
        });

        // Send typing indicator events
        let typingTimeout;
        DOMElements.messageInput.addEventListener('input', () => {
            sendToServer('typing', { to: state.activeChat });
            clearTimeout(typingTimeout);
            typingTimeout = setTimeout(() => {
                sendToServer('stopTyping', { to: state.activeChat });
            }, 1000);
        });
        
        // Modal closing controls
        DOMElements.modalBackdrop.addEventListener('click', hideModals);
        DOMElements.closeUserCodeModal.addEventListener('click', hideModals);
        DOMElements.closeProfileModal.addEventListener('click', hideModals);
        DOMElements.cancelAddContact.addEventListener('click', hideModals);

        // Show Profile modal
        DOMElements.profileButton.addEventListener('click', () => {
            DOMElements.profileName.textContent = state.currentUser.username;
            DOMElements.profileCode.textContent = state.currentUser.userCode;
            showModal(DOMElements.profileModal);
        });

        // Show Add Contact modal
        DOMElements.addContactButton.addEventListener('click', () => {
            DOMElements.addContactForm.reset();
            DOMElements.addContactError.textContent = '';
            showModal(DOMElements.addContactModal);
        });

        // Handle Add Contact form submission
        DOMElements.addContactForm.addEventListener('submit', e => {
            e.preventDefault();
            const userCode = DOMElements.addContactInput.value.trim();
            if (userCode) {
                sendToServer('addContact', { userCode });
            }
        });

        // Handle user logout
        DOMElements.logoutButton.addEventListener('click', () => {
            localStorage.removeItem('chat-app-token');
            state.socket.close();
            // A full reload is a simple way to reset the entire app state
            window.location.reload();
        });

        // Handle the "back" button on mobile to return to the contact list
        DOMElements.backToContacts.addEventListener('click', () => {
            DOMElements.sidebar.classList.remove('mobile-hidden');
            DOMElements.chatWindow.classList.add('mobile-hidden');
            state.activeChat = null;
            updateContactList();
        });
    }

    // --- Application Initialization ---
    // Start the WebSocket connection and set up all event listeners when the page loads
    connectWebSocket();
    setupEventListeners();
});

