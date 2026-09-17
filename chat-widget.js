/* chat-widget.js
 * Drop-in floating chat widget. Just add:
 *   <script src="chat-widget.js" defer></script>
 * to any page on your site. Talks to /.netlify/functions/chat,
 * which is where your HF token and master prompt actually live.
 */
(function () {
  const ENDPOINT = "/.netlify/functions/chat";
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
      width: 340px; max-width: calc(100vw - 40px); height: 460px;
      background: #fff; border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,0.2);
      display: none; flex-direction: column; overflow: hidden;
      font-family: system-ui, -apple-system, sans-serif;
    }
    #cw-panel.open { display: flex; }
    #cw-header {
      background: #1a1a2e; color: #fff; padding: 12px 16px;
      font-weight: 600; font-size: 14px;
    }
    #cw-messages {
      flex: 1; overflow-y: auto; padding: 12px; font-size: 14px; line-height: 1.4;
    }
    .cw-msg { margin-bottom: 10px; max-width: 85%; padding: 8px 12px; border-radius: 10px; }
    .cw-msg.user { background: #1a1a2e; color: #fff; margin-left: auto; }
    .cw-msg.assistant { background: #f1f1f4; color: #111; margin-right: auto; }
    #cw-inputrow { display: flex; border-top: 1px solid #eee; }
    #cw-input {
      flex: 1; border: none; padding: 10px 12px; font-size: 14px; outline: none;
    }
    #cw-send {
      border: none; background: #1a1a2e; color: #fff; padding: 0 16px; cursor: pointer;
    }
    #cw-send:disabled { opacity: 0.5; cursor: default; }
  `;
  document.head.appendChild(style);

  const toggle = document.createElement("button");
  toggle.id = "cw-toggle";
  toggle.textContent = "💬";
  document.body.appendChild(toggle);

  const panel = document.createElement("div");
  panel.id = "cw-panel";
  panel.innerHTML = `
    <div id="cw-header">Chat with us</div>
    <div id="cw-messages"></div>
    <div id="cw-inputrow">
      <input id="cw-input" type="text" placeholder="Type a message..." />
      <button id="cw-send">Send</button>
    </div>
  `;
  document.body.appendChild(panel);

  const messagesEl = panel.querySelector("#cw-messages");
  const inputEl = panel.querySelector("#cw-input");
  const sendBtn = panel.querySelector("#cw-send");

  toggle.addEventListener("click", () => panel.classList.toggle("open"));

  function addMessage(role, content) {
    const div = document.createElement("div");
    div.className = `cw-msg ${role}`;
    div.textContent = content;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  async function sendMessage() {
    const text = inputEl.value.trim();
    if (!text) return;

    inputEl.value = "";
    sendBtn.disabled = true;
    addMessage("user", text);
    history.push({ role: "user", content: text });

    addMessage("assistant", "…");
    const thinkingEl = messagesEl.lastChild;

    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      const data = await res.json();

      if (!res.ok) {
        thinkingEl.textContent = "Sorry, something went wrong. Please try again.";
        console.error("Chat error:", data.error);
      } else {
        thinkingEl.textContent = data.reply;
        history.push({ role: "assistant", content: data.reply });
      }
    } catch (err) {
      thinkingEl.textContent = "Network error. Please try again.";
      console.error(err);
    } finally {
      sendBtn.disabled = false;
    }
  }

  sendBtn.addEventListener("click", sendMessage);
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMessage();
  });
})();
