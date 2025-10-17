document.addEventListener("DOMContentLoaded", () => {
  // --- State Management ---
  let state = {
    currentUser: null, // { username, userCode }
    activeChat: null, // { username, userCode }
    contacts: [],
    messages: {}, // { 'contactUserCode': [...] }
    ws: null,
    typingTimeout: null,
  };

  // --- DOM Elements ---
  const DOMElements = {
    // Auth
    authContainer: document.getElementById("auth-container"),
    loginForm: document.getElementById("login-form"),
    signupForm: document.getElementById("signup-form"),
    toggleLink: document.getElementById("toggle-link"),
    authTitle: document.getElementById("auth-title"),
    authSubtitle: document.getElementById("auth-subtitle"),
    toggleText: document.getElementById("toggle-text"),
    authError: document.getElementById("auth-error"),

    // App
    appContainer: document.getElementById("app-container"),
    sidebar: document.getElementById("sidebar"),
    chatWindow: document.getElementById("chat-window"),
    contactList: document.getElementById("contact-list"),
    welcomeScreen: document.getElementById("welcome-screen"),
    activeChatArea: document.getElementById("active-chat-area"),
    chatHeaderName: document.getElementById("chat-header-name"),
    chatHeaderStatus: document.getElementById("chat-header-status"),
    onlineStatusIndicator: document.getElementById("online-status-indicator"),
    typingIndicator: document.getElementById("typing-indicator"),
    messageList: document.getElementById("message-list"),
    messageForm: document.getElementById("message-form"),
    messageInput: document.getElementById("message-input"),
    logoutButton: document.getElementById("logout-button"),
    backToContacts: document.getElementById("back-to-contacts"),
    themeToggle: document.getElementById("theme-toggle"),

    // Modals
    modalBackdrop: document.getElementById("modal-backdrop"),
    userCodeModal: document.getElementById("user-code-modal"),
    userCodeDisplay: document.getElementById("user-code-display"),
    closeUserCodeModal: document.getElementById("close-user-code-modal"),
    profileButton: document.getElementById("profile-button"),
    profileModal: document.getElementById("profile-modal"),
    profileUsername: document.getElementById("profile-username"),
    profileUserCode: document.getElementById("profile-user-code"),
    closeProfileModal: document.getElementById("close-profile-modal"),
    addContactButton: document.getElementById("add-contact-button"),
    addContactModal: document.getElementById("add-contact-modal"),
    addContactForm: document.getElementById("add-contact-form"),
    addContactInput: document.getElementById("add-contact-input"),
    addContactError: document.getElementById("add-contact-error"),
    cancelAddContact: document.getElementById("cancel-add-contact"),
    toastNotification: document.getElementById("toast-notification"),
  };

  // --- WebSocket Functions ---
  function connectWebSocket() {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    state.ws = new WebSocket(`${protocol}://${window.location.host}`);

    state.ws.onopen = () => {
      console.log("Connected to WebSocket server");
      // Try to reconnect if session data exists
      const session = JSON.parse(localStorage.getItem("chat-session"));
      if (session) {
        sendToServer("reconnect", session);
      }
    };

    state.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleServerMessage(message);
      } catch (error) {
        console.error("Error parsing server message:", error);
      }
    };

    state.ws.onclose = () => {
      console.log(
        "Disconnected from WebSocket server. Attempting to reconnect..."
      );
      setTimeout(connectWebSocket, 3000); // Reconnect after 3 seconds
    };

    state.ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      state.ws.close();
    };
  }

  function sendToServer(type, payload) {
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      state.ws.send(JSON.stringify({ type, payload }));
    }
  }

  // --- Message Handling ---
  function handleServerMessage({ type, payload }) {
    const handlers = {
      error: ({ message }) => showAuthError(message),
      signupSuccess: ({ userCode }) => {
        DOMElements.userCodeDisplay.textContent = userCode;
        showModal(DOMElements.userCodeModal);
      },
      loginSuccess: ({ username, userCode }) => {
        state.currentUser = { username, userCode };
        localStorage.setItem(
          "chat-session",
          JSON.stringify({ username, userCode })
        );
        showApp();
      },
      contactList: (contacts) => {
        state.contacts = contacts;
        renderContacts();
      },
      chatHistory: ({ messages, withUser, isOnline }) => {
        state.messages[withUser] = messages;
        const contact = state.contacts.find((c) => c.userCode === withUser);
        if (contact) {
          state.activeChat = contact;
          renderChat();
          updateOnlineStatus(withUser, isOnline);
        }
      },
      newMessage: (message) => {
        const partnerCode =
          message.sender === state.currentUser.userCode
            ? message.receiver
            : message.sender;
        if (!state.messages[partnerCode]) {
          state.messages[partnerCode] = [];
        }
        state.messages[partnerCode].push(message);

        if (state.activeChat && partnerCode === state.activeChat.userCode) {
          appendMessage(message);
          // Send read receipt if chat is open
          sendToServer("readMessage", {
            reader: state.currentUser.userCode,
            messageId: message.id,
            messageSender: message.sender,
          });
        } else {
          // Update unread count if chat is not open
          updateUnreadCount(message.sender, 1);
        }
      },
      messageSent: (message) => {
        // This confirms message was saved, useful for UI updates
        if (!state.messages[message.receiver])
          state.messages[message.receiver] = [];
        state.messages[message.receiver].push(message);
        if (
          state.activeChat &&
          message.receiver === state.activeChat.userCode
        ) {
          appendMessage(message);
        }
      },
      typing: ({ typer }) => {
        if (state.activeChat && typer === state.activeChat.userCode) {
          DOMElements.typingIndicator.textContent = "typing...";
          clearTimeout(state.typingTimeout);
          state.typingTimeout = setTimeout(() => {
            DOMElements.typingIndicator.textContent = "";
          }, 1000);
        }
      },
      onlineStatus: ({ userCode, isOnline }) => {
        updateOnlineStatus(userCode, isOnline);
      },
      readReceipt: ({ messageId, reader }) => {
        if (state.activeChat && reader === state.activeChat.userCode) {
          const messageEl = document.querySelector(
            `[data-message-id="${messageId}"]`
          );
          if (messageEl) {
            const receiptsEl = messageEl.querySelector(".read-receipts");
            receiptsEl.innerHTML = "<span>✓✓</span>";
            receiptsEl.classList.add("read");
          }
        }
      },
    };

    const handler = handlers[type];
    if (handler) {
      handler(payload);
    } else {
      console.warn(`No client handler for message type: ${type}`);
    }
  }

  // --- UI Rendering ---
  function renderContacts() {
    DOMElements.contactList.innerHTML = "";
    if (state.contacts.length === 0) {
      DOMElements.contactList.innerHTML =
        '<p class="no-contacts">Add contacts using their user code to start chatting.</p>';
      return;
    }
    state.contacts.forEach((contact) => {
      const contactEl = document.createElement("div");
      contactEl.className = "contact-item";
      if (state.activeChat && contact.userCode === state.activeChat.userCode) {
        contactEl.classList.add("active");
      }
      contactEl.dataset.userCode = contact.userCode;
      contactEl.innerHTML = `
                <div class="contact-details">
                    <div class="contact-name">${contact.username}</div>
                </div>
                ${
                  contact.unreadCount > 0
                    ? `<div class="unread-badge">${contact.unreadCount}</div>`
                    : ""
                }
            `;
      contactEl.addEventListener("click", () => {
        openChat(contact.userCode);
      });
      DOMElements.contactList.appendChild(contactEl);
    });
  }

  function renderChat() {
    DOMElements.welcomeScreen.classList.add("hidden");
    DOMElements.activeChatArea.classList.remove("hidden");
    DOMElements.chatHeaderName.textContent = state.activeChat.username;
    DOMElements.messageList.innerHTML = "";
    const messages = state.messages[state.activeChat.userCode] || [];
    messages.forEach(appendMessage);

    // Send read receipts for all unread messages
    messages.forEach((msg) => {
      if (msg.receiver === state.currentUser.userCode && !msg.read) {
        sendToServer("readMessage", {
          reader: state.currentUser.userCode,
          messageId: msg.id,
          messageSender: msg.sender,
        });
      }
    });

    // Clear unread count in UI
    updateUnreadCount(state.activeChat.userCode, 0);

    // Highlight active contact
    document
      .querySelectorAll(".contact-item")
      .forEach((el) => el.classList.remove("active"));
    document
      .querySelector(
        `.contact-item[data-user-code="${state.activeChat.userCode}"]`
      )
      .classList.add("active");
  }

  function appendMessage(message) {
    const isSent = message.sender === state.currentUser.userCode;
    const messageEl = document.createElement("div");
    messageEl.className = `message-item ${isSent ? "sent" : "received"}`;
    messageEl.dataset.messageId = message.id;

    const time = new Date(message.timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    let receipts = "";
    if (isSent) {
      receipts = `<div class="read-receipts ${
        message.read ? "read" : ""
      }"><span>✓${message.read ? "✓" : ""}</span></div>`;
    }

    messageEl.innerHTML = `
            <div class="message-content">
                ${message.text}
            </div>
            <div class="message-meta">
                <span>${time}</span>
                ${receipts}
            </div>
        `;
    DOMElements.messageList.appendChild(messageEl);
    DOMElements.messageList.scrollTop = DOMElements.messageList.scrollHeight;
  }

  function updateOnlineStatus(userCode, isOnline) {
    // Update contact list view if needed (future feature)
    // For now, just update the active chat header
    const contact = state.contacts.find((c) => c.userCode === userCode);
    if (contact) {
      contact.isOnline = isOnline;
    }

    if (state.activeChat && state.activeChat.userCode === userCode) {
      DOMElements.chatHeaderStatus.textContent = isOnline
        ? "Online"
        : "Offline";
      DOMElements.onlineStatusIndicator.classList.toggle("online", isOnline);
    }
  }

  function updateUnreadCount(userCode, count) {
    const contact = state.contacts.find((c) => c.userCode === userCode);
    if (contact) {
      contact.unreadCount = count;
    }
    renderContacts(); // Re-render to show/hide badge
  }

  // --- UI Logic & Transitions ---

  function showApp() {
    DOMElements.authContainer.classList.add("hidden");
    DOMElements.appContainer.classList.remove("hidden");
  }

  function showAuth() {
    state.currentUser = null;
    state.activeChat = null;
    localStorage.removeItem("chat-session");
    DOMElements.appContainer.classList.add("hidden");
    DOMElements.authContainer.classList.remove("hidden");
  }

  function showModal(modal) {
    DOMElements.modalBackdrop.classList.remove("hidden");
    modal.classList.remove("hidden");
  }

  function hideModals() {
    DOMElements.modalBackdrop.classList.add("hidden");
    document
      .querySelectorAll(".modal")
      .forEach((m) => m.classList.add("hidden"));
    DOMElements.addContactError.textContent = "";
  }

  function openChat(userCode) {
    if (!state.currentUser) return;
    sendToServer("getChat", {
      currentUserCode: state.currentUser.userCode,
      targetUserCode: userCode,
    });
    // For mobile view
    DOMElements.sidebar.classList.add("chat-active");
  }

  function showAuthError(message) {
    DOMElements.authError.textContent = message;
    setTimeout(() => (DOMElements.authError.textContent = ""), 3000);
  }

  function showToast(message) {
    if (!DOMElements.toastNotification) return;
    DOMElements.toastNotification.textContent = message;
    DOMElements.toastNotification.classList.add("show");
    setTimeout(() => {
      DOMElements.toastNotification.classList.remove("show");
    }, 2500);
  }

  // --- Event Listeners ---
  function setupEventListeners() {
    // Theme toggle
    DOMElements.themeToggle.addEventListener("change", () => {
      if (DOMElements.themeToggle.checked) {
        document.body.classList.add("dark-mode");
        localStorage.setItem("chat-theme", "dark");
      } else {
        document.body.classList.remove("dark-mode");
        localStorage.setItem("chat-theme", "light");
      }
    });

    // Auth form toggle
    DOMElements.toggleLink.addEventListener("click", (e) => {
      e.preventDefault();
      DOMElements.loginForm.classList.toggle("hidden");
      DOMElements.signupForm.classList.toggle("hidden");
      const isLogin = !DOMElements.loginForm.classList.contains("hidden");
      DOMElements.authTitle.textContent = isLogin ? "Login" : "Sign Up";
      DOMElements.authSubtitle.textContent = isLogin
        ? "Welcome back! Please enter your details."
        : "Create an account to get started.";
      DOMElements.toggleText.textContent = isLogin
        ? "Don't have an account?"
        : "Already have an account?";
      DOMElements.toggleLink.textContent = isLogin ? "Sign Up" : "Login";
    });

    // Auth form submissions
    DOMElements.loginForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const username =
        DOMElements.loginForm.querySelector("#login-username").value;
      const password =
        DOMElements.loginForm.querySelector("#login-password").value;
      sendToServer("login", { username, password });
    });

    DOMElements.signupForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const username =
        DOMElements.signupForm.querySelector("#signup-username").value;
      const password =
        DOMElements.signupForm.querySelector("#signup-password").value;
      sendToServer("signup", { username, password });
    });

    // Message form
    DOMElements.messageForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = DOMElements.messageInput.value.trim();
      if (text && state.currentUser && state.activeChat) {
        sendToServer("sendMessage", {
          sender: state.currentUser.userCode,
          receiver: state.activeChat.userCode,
          text,
        });
        DOMElements.messageInput.value = "";
      }
    });

    // Typing indicator
    DOMElements.messageInput.addEventListener("input", () => {
      if (state.currentUser && state.activeChat) {
        sendToServer("typing", {
          typer: state.currentUser.userCode,
          receiver: state.activeChat.userCode,
        });
      }
    });

    // Logout
    DOMElements.logoutButton.addEventListener("click", showAuth);

    // Modal close buttons
    DOMElements.closeUserCodeModal.addEventListener("click", () => {
      hideModals();
      DOMElements.toggleLink.click(); // Switch to login form after signup
    });
    DOMElements.closeProfileModal.addEventListener("click", hideModals);
    DOMElements.cancelAddContact.addEventListener("click", hideModals);

    // Modal open buttons
    DOMElements.profileButton.addEventListener("click", () => {
      if (state.currentUser) {
        DOMElements.profileUsername.textContent = state.currentUser.username;
        DOMElements.profileUserCode.textContent = state.currentUser.userCode;
        showModal(DOMElements.profileModal);
      }
    });

    DOMElements.addContactButton.addEventListener("click", () => {
      showModal(DOMElements.addContactModal);
      DOMElements.addContactInput.focus();
    });

    // Add contact form
    DOMElements.addContactForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const targetUserCode = DOMElements.addContactInput.value
        .trim()
        .toUpperCase();
      if (targetUserCode && state.currentUser) {
        sendToServer("addContact", {
          adderUserCode: state.currentUser.userCode,
          targetUserCode,
        });
        // Optimistically clear and hide, error will be handled by server message
        DOMElements.addContactInput.value = "";
        hideModals();
      }
    });

    // Mobile back button
    DOMElements.backToContacts.addEventListener("click", () => {
      DOMElements.sidebar.classList.remove("chat-active");
      state.activeChat = null;
      document
        .querySelectorAll(".contact-item")
        .forEach((el) => el.classList.remove("active"));
    });

    // Copy to clipboard functionality
    const copyToClipboard = (text) => {
      if (!text) return;
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand("copy");
        showToast("Code copied to clipboard!");
      } catch (err) {
        showToast("Failed to copy code.");
      }
      document.body.removeChild(textArea);
    };

    DOMElements.userCodeDisplay.addEventListener("click", () => {
      copyToClipboard(DOMElements.userCodeDisplay.textContent);
    });

    DOMElements.profileUserCode.addEventListener("click", () => {
      copyToClipboard(DOMElements.profileUserCode.textContent);
    });
  }

  // --- Initialization ---
  function init() {
    // Apply saved theme on startup
    const savedTheme = localStorage.getItem("chat-theme");
    if (savedTheme === "dark") {
      document.body.classList.add("dark-mode");
      DOMElements.themeToggle.checked = true;
    }

    connectWebSocket();
    setupEventListeners();
  }

  init();
});
