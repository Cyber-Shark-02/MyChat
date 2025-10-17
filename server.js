// --- Core Modules ---
const http = require("http");
const fs = require("fs");
const path = require("path");

// --- Third-party Modules ---
const WebSocket = require("ws");
const { v4: uuidv4 } = require("uuid");

// --- Server Configuration ---
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, "db.json");

// --- In-Memory Database and Connection Tracking ---
let db = {}; // Will hold our JSON database content
const clients = new Map(); // Maps userCode to WebSocket connection

// --- Utility Functions ---

/**
 * Reads the database file from disk into the in-memory 'db' object.
 * This is a synchronous operation, intended to be run once on server start.
 */
function loadDatabase() {
  try {
    const data = fs.readFileSync(DB_PATH, "utf8");
    db = JSON.parse(data);
    console.log("Database loaded successfully.");
  } catch (error) {
    console.error("Error loading database:", error);
    // If the database doesn't exist or is corrupted, start with a clean slate.
    db = { users: {}, chats: {} };
  }
}

/**
 * Writes the current state of the in-memory 'db' object to the db.json file.
 * This is a synchronous operation to ensure data consistency.
 */
function saveDatabase() {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 4), "utf8");
  } catch (error) {
    console.error("Error saving database:", error);
  }
}

/**
 * Generates a unique 6-character alphanumeric code for a user.
 * It ensures the code is not already in use.
 * @returns {string} A unique user code.
 */
function generateUserCode() {
  let code;
  const existingCodes = new Set(Object.values(db.users).map((u) => u.userCode));
  do {
    code = Math.random().toString(36).substring(2, 8).toUpperCase();
  } while (existingCodes.has(code));
  return code;
}

/**
 * Creates a consistent key for a chat session between two users.
 * @param {string} userCode1 - First user's code.
 * @param {string} userCode2 - Second user's code.
 * @returns {string} The sorted and combined chat key.
 */
function getChatKey(userCode1, userCode2) {
  return [userCode1, userCode2].sort().join("-");
}

// --- Main Server Setup ---

// 1. Load the database on startup
loadDatabase();

// 2. Create the HTTP server to serve frontend files
const server = http.createServer((req, res) => {
  let filePath = path.join(__dirname, req.url === "/" ? "index.html" : req.url);
  const extname = String(path.extname(filePath)).toLowerCase();
  const mimeTypes = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
  };
  const contentType = mimeTypes[extname] || "application/octet-stream";

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code == "ENOENT") {
        res.writeHead(404, { "Content-Type": "text/html" });
        res.end("<h1>404 Not Found</h1>", "utf-8");
      } else {
        res.writeHead(500);
        res.end(
          "Sorry, check with the site admin for error: " + error.code + " ..\n"
        );
      }
    } else {
      res.writeHead(200, { "Content-Type": contentType });
      res.end(content, "utf-8");
    }
  });
});

// 3. Create the WebSocket server and attach it to the HTTP server
const wss = new WebSocket.Server({ server });

// --- WebSocket Event Handling ---

wss.on("connection", (ws) => {
  console.log("Client connected");

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);
      // Attach the WebSocket connection to the data object for easy access
      data.ws = ws;
      handleMessage(data);
    } catch (error) {
      console.error("Failed to parse message or handle it:", error);
      ws.send(
        JSON.stringify({
          type: "error",
          payload: { message: "Invalid message format." },
        })
      );
    }
  });

  ws.on("close", () => {
    // Find which user this connection belonged to and update their online status
    for (const [userCode, clientWs] of clients.entries()) {
      if (clientWs === ws) {
        clients.delete(userCode);
        console.log(`Client with user code ${userCode} disconnected`);
        broadcastOnlineStatus(userCode, false);
        break;
      }
    }
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
  });
});

/**
 * Main message handler for all incoming WebSocket messages.
 * Routes messages to specific handler functions based on their 'type'.
 * @param {object} data - The parsed message object from a client.
 */
function handleMessage(data) {
  const { type, payload } = data;

  // A map of message types to their handler functions.
  const messageHandlers = {
    signup: handleSignup,
    login: handleLogin,
    addContact: handleAddContact,
    getChat: handleGetChat,
    sendMessage: handleSendMessage,
    typing: handleTyping,
    readMessage: handleReadMessage,
    reconnect: handleReconnect,
  };

  const handler = messageHandlers[type];
  if (handler) {
    handler(data);
  } else {
    console.warn(`No handler for message type: ${type}`);
  }
}

// --- Specific Message Handler Functions ---

function handleSignup({ payload, ws }) {
  const { username, password } = payload;
  if (db.users[username]) {
    return ws.send(
      JSON.stringify({
        type: "error",
        payload: { message: "Username already exists." },
      })
    );
  }
  const userCode = generateUserCode();
  db.users[username] = {
    password, // In a real app, hash and salt this!
    userCode,
    contacts: [],
  };
  saveDatabase();
  ws.send(JSON.stringify({ type: "signupSuccess", payload: { userCode } }));
}

function handleLogin({ payload, ws }) {
  const { username, password } = payload;
  const user = db.users[username];

  if (!user || user.password !== password) {
    return ws.send(
      JSON.stringify({
        type: "error",
        payload: { message: "Invalid username or password." },
      })
    );
  }

  // Store connection and associate it with the user code
  clients.set(user.userCode, ws);
  ws.userCode = user.userCode; // Attach userCode to ws for easy reference on disconnect

  sendLoginSuccess(ws, username, user.userCode);
  broadcastOnlineStatus(user.userCode, true);
}

function handleReconnect({ payload, ws }) {
  const { username, userCode } = payload;
  const user = db.users[username];
  if (!user || user.userCode !== userCode) {
    return ws.send(
      JSON.stringify({
        type: "error",
        payload: { message: "Reconnect failed. Please log in again." },
      })
    );
  }
  clients.set(userCode, ws);
  ws.userCode = userCode;
  sendLoginSuccess(ws, username, userCode);
  broadcastOnlineStatus(userCode, true);
}

function handleAddContact({ payload, ws }) {
  const { adderUserCode, targetUserCode } = payload;
  const adderUsername = Object.keys(db.users).find(
    (u) => db.users[u].userCode === adderUserCode
  );
  const targetUsername = Object.keys(db.users).find(
    (u) => db.users[u].userCode === targetUserCode
  );

  if (!targetUsername) {
    return ws.send(
      JSON.stringify({
        type: "error",
        payload: { message: "User with that code does not exist." },
      })
    );
  }
  if (adderUserCode === targetUserCode) {
    return ws.send(
      JSON.stringify({
        type: "error",
        payload: { message: "You cannot add yourself as a contact." },
      })
    );
  }

  // Add contact to both users' contact lists
  if (!db.users[adderUsername].contacts.includes(targetUserCode)) {
    db.users[adderUsername].contacts.push(targetUserCode);
  }
  if (!db.users[targetUsername].contacts.includes(adderUserCode)) {
    db.users[targetUsername].contacts.push(adderUserCode);
  }

  saveDatabase();

  // Send updated contact lists to both users if they are online
  sendContactListUpdate(adderUserCode);
  const targetWs = clients.get(targetUserCode);
  if (targetWs) {
    sendContactListUpdate(targetUserCode);
  }
}

function handleGetChat({ payload, ws }) {
  const { currentUserCode, targetUserCode } = payload;
  const chatKey = getChatKey(currentUserCode, targetUserCode);
  const messages = db.chats[chatKey] || [];
  const isOnline = clients.has(targetUserCode);
  ws.send(
    JSON.stringify({
      type: "chatHistory",
      payload: { messages, withUser: targetUserCode, isOnline },
    })
  );
}

function handleSendMessage({ payload, ws }) {
  const { sender, receiver, text } = payload;
  const message = {
    id: uuidv4(),
    sender,
    receiver,
    text,
    timestamp: new Date().toISOString(),
    read: false,
  };

  const chatKey = getChatKey(sender, receiver);
  if (!db.chats[chatKey]) {
    db.chats[chatKey] = [];
  }
  db.chats[chatKey].push(message);
  saveDatabase();

  // Send the message to the recipient if they are online
  const recipientWs = clients.get(receiver);
  if (recipientWs) {
    recipientWs.send(JSON.stringify({ type: "newMessage", payload: message }));
  }

  // Confirm message sent to the sender
  ws.send(JSON.stringify({ type: "messageSent", payload: message }));
}

function handleTyping({ payload }) {
  const { typer, receiver } = payload;
  const recipientWs = clients.get(receiver);
  if (recipientWs) {
    recipientWs.send(JSON.stringify({ type: "typing", payload: { typer } }));
  }
}

function handleReadMessage({ payload }) {
  const { reader, messageId, messageSender } = payload;
  const chatKey = getChatKey(reader, messageSender);
  const chat = db.chats[chatKey];
  if (chat) {
    const message = chat.find((m) => m.id === messageId);
    if (message && !message.read) {
      message.read = true;
      saveDatabase();

      // Notify the sender that the message was read
      const senderWs = clients.get(messageSender);
      if (senderWs) {
        senderWs.send(
          JSON.stringify({
            type: "readReceipt",
            payload: { messageId, reader },
          })
        );
      }
    }
  }
}

// --- Helper Functions for Sending Data ---

function sendLoginSuccess(ws, username, userCode) {
  ws.send(
    JSON.stringify({
      type: "loginSuccess",
      payload: {
        username,
        userCode,
      },
    })
  );
  sendContactListUpdate(userCode);
}

function sendContactListUpdate(userCode) {
  const ws = clients.get(userCode);
  if (!ws) return;

  const username = Object.keys(db.users).find(
    (u) => db.users[u].userCode === userCode
  );
  const user = db.users[username];
  if (!user) return;

  const contactDetails = user.contacts
    .map((contactCode) => {
      const contactUsername = Object.keys(db.users).find(
        (u) => db.users[u].userCode === contactCode
      );
      const contact = db.users[contactUsername];
      if (!contact) return null;

      const chatKey = getChatKey(userCode, contactCode);
      const chat = db.chats[chatKey] || [];
      const unreadCount = chat.filter(
        (m) => m.receiver === userCode && !m.read
      ).length;

      return {
        username: contactUsername,
        userCode: contact.userCode,
        isOnline: clients.has(contact.userCode),
        unreadCount,
      };
    })
    .filter(Boolean); // Filter out any nulls if a contact was deleted

  ws.send(JSON.stringify({ type: "contactList", payload: contactDetails }));
}

function broadcastOnlineStatus(userCode, isOnline) {
  const username = Object.keys(db.users).find(
    (u) => db.users[u].userCode === userCode
  );
  if (!username) return;

  const user = db.users[username];
  // Notify all contacts of this user's status change
  user.contacts.forEach((contactCode) => {
    const contactWs = clients.get(contactCode);
    if (contactWs) {
      contactWs.send(
        JSON.stringify({
          type: "onlineStatus",
          payload: { userCode, isOnline },
        })
      );
      // Also send an updated contact list to the contact to refresh their view
      sendContactListUpdate(contactCode);
    }
  });
}

// --- Start the Server ---
server.listen(PORT, () => {
  console.log(`Server is listening on http://localhost:${PORT}`);
});
