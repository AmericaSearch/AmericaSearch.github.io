/* chatbot-widget.js
 * No-backend chat widget. Calls the Anthropic Claude API directly from the
 * browser using the visitor's own API key.
 *
 * Setup:
 *   1. Edit MASTER_PROMPT below to whatever you want the bot's instructions
 *      to be. This is baked into the page - visitors can view it in page
 *      source, so don't put secrets in it.
 *   2. Drop this file into your GitHub Pages repo.
 *   3. Add <script src="/chatbot-widget.js" defer></script> before </body>
 *      on any page you want the chat bubble on.
 *
 * Each visitor pastes in their own Anthropic API key the first time they
 * open the chat. It's kept in this browser tab's sessionStorage only -
 * cleared when they close the tab, never sent anywhere but Anthropic's API.
 */
(function () {
  // ---- EDIT THIS ----
  const MASTER_PROMPT =
    "You must talk like Donald Trump, and say Make America Great Again and Make the Internet Great Again";
  const MODEL = "claude-sonnet-4-6"; // change to a different Claude model if you like
  // -------------------

  const API_URL = "https://api.anthropic.com/v1/messages";
  let apiKey = sessionStorage.getItem("cw_api_key") || "";
  let history = []; // { role: "user" | "assistant", content: string }

  const style = document.createElement("style");
  style.textContent = `
    #cw-toggle {
      position: fixed; bottom: 20px; right: 20px; z-index: 9999;
      width: 56px; height: 56px; border-radius: 50%; border: none;
      background: #1a1a2e; color: #fff; font-size: 24px; cursor: pointer;
      box-shadow: 0 4px 14px rgba(0,0,0,0.25);
    }
    #cw-panel {
      position: fixed; bottom: 88px; right: 20px; z-index: 9999;
      width: 340px; max-width: calc(100vw - 40px); height: 480px;
      background: #fff; border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,0.2);
      display: none; flex-direction: column; overflow: hidden;
      font-family: system-ui, -apple-system, sans-serif;
    }
    #cw-panel.open { display: flex; }
    #cw-header {
      background: #1a1a2e; color: #fff; padding: 12px 16px;
      font-weight: 600; font-size: 14px; display: flex; justify-content: space-between; align-items: center;
    }
    #cw-reset { background: none; border: none; color: #bbb; font-size: 12px; cursor: pointer; }
    #cw-messages { flex: 1; overflow-y: auto; padding: 12px; font-size: 14px; line-height: 1.4; }
    .cw-msg { margin-bottom: 10px; max-width: 85%; padding: 8px 12px; border-radius: 10px; white-space: pre-wrap; }
    .cw-msg.user { background: #1a1a2e; color: #fff; margin-left: auto; }
    .cw-msg.assistant { background: #f1f1f4; color: #111; margin-right: auto; }
    .cw-msg.error { background: #fde8e8; color: #a11; margin-right: auto; }
    #cw-keyscreen { padding: 16px; font-size: 13px; color: #333; flex: 1; display: flex; flex-direction: column; gap: 10px; }
    #cw-keyscreen input {
      border: 1px solid #ddd; border-radius: 6px; padding: 8px 10px; font-size: 13px;
    }
    #cw-keyscreen button {
      border: none; background: #1a1a2e; color: #fff; padding: 8px 12px; border-radius: 6px; cursor: pointer;
    }
    #cw-keyscreen a { color: #1a1a2e; }
    #cw-inputrow { display: flex; border-top: 1px solid #eee; }
    #cw-input { flex: 1; border: none; padding: 10px 12px; font-size: 14px; outline: none; }
    #cw-send { border: none; background: #1a1a2e; color: #fff; padding: 0 16px; cursor: pointer; }
    #cw-send:disabled { opacity: 0.5; cursor: default; }
  `;
  document.head.appendChild(style);

  const toggle = document.createElement("button");
  toggle.id = "cw-toggle";
  toggle.textContent = "💬";
  document.body.appendChild(toggle);

  const panel = document.createElement("div");
  panel.id = "cw-panel";
  document.body.appendChild(panel);

  toggle.addEventListener("click", () => {
    panel.classList.toggle("open");
    if (panel.classList.contains("open")) render();
  });

  function render() {
    panel.innerHTML = "";
    if (!apiKey) {
      renderKeyScreen();
    } else {
      renderChatScreen();
    }
  }

  function renderKeyScreen() {
    panel.innerHTML = `
      <div id="cw-header">Chat with us</div>
      <div id="cw-keyscreen">
        <p>Paste your Anthropic API key to start chatting. It's stored only in this browser tab and sent only to Anthropic's API.</p>
        <input id="cw-keyinput" type="password" placeholder="sk-ant-..." />
        <button id="cw-keysave">Start chatting</button>
        <p>Don't have a key? <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">Get one here</a>.</p>
      </div>
    `;
    const input = panel.querySelector("#cw-keyinput");
    panel.querySelector("#cw-keysave").addEventListener("click", () => {
      const val = input.value.trim();
      if (!val) return;
      apiKey = val;
      sessionStorage.setItem("cw_api_key", apiKey);
      history = [];
      render();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") panel.querySelector("#cw-keysave").click();
    });
  }

  function renderChatScreen() {
    panel.innerHTML = `
      <div id="cw-header">
        Chat with us
        <button id="cw-reset">change key</button>
      </div>
      <div id="cw-messages"></div>
      <div id="cw-inputrow">
        <input id="cw-input" type="text" placeholder="Type a message..." />
        <button id="cw-send">Send</button>
      </div>
    `;
    panel.querySelector("#cw-reset").addEventListener("click", () => {
      apiKey = "";
      sessionStorage.removeItem("cw_api_key");
      render();
    });

    const messagesEl = panel.querySelector("#cw-messages");
    const inputEl = panel.querySelector("#cw-input");
    const sendBtn = panel.querySelector("#cw-send");

    function addMessage(role, content) {
      const div = document.createElement("div");
      div.className = `cw-msg ${role}`;
      div.textContent = content;
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return div;
    }

    // replay any existing history when reopening
    history.forEach((m) => addMessage(m.role, m.content));

    async function sendMessage() {
      const text = inputEl.value.trim();
      if (!text) return;
      inputEl.value = "";
      sendBtn.disabled = true;

      addMessage("user", text);
      history.push({ role: "user", content: text });

      const thinkingEl = addMessage("assistant", "…");

      try {
        const res = await fetch(API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true",
          },
          body: JSON.stringify({
            model: MODEL,
            max_tokens: 512,
            system: MASTER_PROMPT,
            messages: history,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          thinkingEl.className = "cw-msg error";
          thinkingEl.textContent =
            data.error?.message || "Something went wrong. Check your API key and try again.";
          history.pop(); // don't keep a failed turn in history
          return;
        }

        const reply = data.content?.[0]?.text ?? "Sorry, I couldn't generate a reply.";
        thinkingEl.textContent = reply;
        history.push({ role: "assistant", content: reply });
      } catch (err) {
        thinkingEl.className = "cw-msg error";
        thinkingEl.textContent = "Network error. Please try again.";
        history.pop();
      } finally {
        sendBtn.disabled = false;
      }
    }

    sendBtn.addEventListener("click", sendMessage);
    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendMessage();
    });
  }
})();
