
# 💬 Real-Time Chat Application

This is a full-stack, real-time chat application built from scratch using **Node.js**, **WebSockets**, and **vanilla JavaScript**. It provides a modern, responsive interface for private one-on-one messaging.

🚀 **Live Demo**
*Coming soon or hosted link here*

---

## 🔥 Features

* **User Authentication**: Secure sign-up and login system for users.
* **Unique User Codes**: Automatic generation of a unique 6-character code for each user to add contacts securely.
* **Contact Management**: Users can add each other only via their unique codes, ensuring privacy.
* **Real-Time Private Chat**: Instant one-on-one messaging powered by WebSockets.
* **Typing Indicator**: See when the other user is typing a message in real-time.
* **Online Status**: A green dot indicates if a user is currently online.
* **Read Receipts**: See single ticks (✓) for sent messages and double blue ticks (✓✓) for read messages.
* **Unread Message Count**: A badge in the contact list shows the number of unread messages.
* **Session Persistence**: Users remain logged in even after refreshing the page.
* **Fully Responsive Design**: A seamless experience on both desktop and mobile devices.

---

## 🧰 Tech Stack

* **Frontend**: HTML5, CSS3, Vanilla JavaScript (ES6+)
* **Backend**: Node.js
* **Real-Time Communication**: WebSocket (`ws` library)
* **Database**: JSON file (`db.json`) for data persistence
* **Dependencies**: `ws`, `uuid`

---

## ⚙️ Getting Started (Running Locally)

Follow these instructions to get a copy of the project up and running on your local machine.

### ✅ Prerequisites

You need to have **Node.js** and **npm** (Node Package Manager) installed on your computer.

* [Download Node.js](https://nodejs.org/)

---

### 📦 Installation

1. **Clone the repository:**

   ```bash
   git clone https://github.com/Cyber-Shark-02/MyChat.git
   cd MyChat
   ```

2. **Install NPM packages:**

   ```bash
   npm install
   ```

3. **Start the server:**

   ```bash
   npm start
   ```

4. **Open your browser and navigate to:**

   ```
   http://localhost:3000
   ```

   You can open two browser tabs to simulate a conversation between two users.

---

## 📁 File Structure

```
.
├── client.js       # All frontend JavaScript logic
├── db.json         # Simple JSON file for database
├── index.html      # Main HTML structure
├── package.json    # Project dependencies and scripts
├── server.js       # Backend Node.js and WebSocket server
└── style.css       # All application styles
```




