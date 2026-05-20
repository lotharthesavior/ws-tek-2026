(() => {
  // node_modules/socket-conveyor-client/index.js
  var Conveyor = class {
    constructor(options) {
      this.options = {
        protocol: "ws",
        uri: "127.0.0.1",
        port: 8e3,
        token: null,
        query: "",
        channel: null,
        onOpen: (e) => this.onOpen(e),
        onReady: () => {
        },
        onMessage: () => {
        },
        onRawMessage: () => {
        },
        onClose: (e) => this.onClose(e),
        onCloseCallback: () => {
        },
        onError: () => {
        },
        reconnect: false,
        reconnectDelay: 5e3,
        heartBeat: true,
        heartBeatInterval: 1e4,
        healthCheckInterval: 3e3,
        userId: null,
        acknowledge: false,
        ...options
      };
      this.ws = null;
      this.start();
      this.messages = [];
      if (this.options.reconnect) {
        this.healthCheckInterval = setInterval(() => {
          if (this.isClosed()) {
            this.onClose();
          }
        }, this.options.healthCheckInterval);
      }
    }
    isClosed() {
      return !this.ws || this.ws.readyState === WebSocket.CLOSED;
    }
    start() {
      if (!this.isClosed()) {
        return;
      }
      let url = `${this.options.protocol}://${this.options.uri}:${this.options.port}`;
      if (this.options.token) url += `?token=${this.options.token}`;
      if (this.options.token && this.options.query.length > 0) url += `&${this.options.query}`;
      if (!this.options.token && this.options.query.length > 0) url += `?${this.options.query}`;
      console.log(url);
      this.ws = new WebSocket(url);
      this.bindEvents();
    }
    bindEvents() {
      this.ws.onopen = this.options.onOpen;
      this.ws.onclose = this.options.onClose;
      this.ws.onerror = this.options.onError;
      this.ws.onmessage = (e) => this.baseOnMessage(e);
    }
    onOpen(e) {
      if (this.options.userId !== null) {
        this.assocUser(this.options.userId);
      }
      this.connectChannel();
      this.startHeartBeat();
      this.options.onReady();
    }
    onClose(e) {
      if (this.ws) {
        this.ws = null;
      }
      this.options.onCloseCallback();
      if (this.options.reconnect) {
        setTimeout(() => this.start(), this.options.reconnectDelay);
      }
    }
    baseOnMessage(e) {
      const parsedData = JSON.parse(e.data);
      if (this.options.acknowledge) {
        this.messages.map((message, index) => {
          if (parsedData.data === message.id) {
            this.messages[index].ack = true;
          }
        });
      }
      this.options.onRawMessage(e.data);
      this.options.onMessage(parsedData.data, parsedData.fd);
    }
    send(message, action = "base-action") {
      let data = {
        action,
        data: message
      };
      if (!this.options.acknowledge) {
        this.rawSend(JSON.stringify(data));
        return;
      }
      data.id = crypto.randomUUID();
      if (this.messages.length >= 20) this.messages.shift();
      this.messages.push({
        id: data.id,
        data,
        ack: false
      });
      this.rawSend(JSON.stringify(data));
    }
    rawSend(message) {
      if (this.isClosed()) {
        return;
      }
      this.ws.send(message);
    }
    connectChannel() {
      if (this.options.channel === null) {
        return;
      }
      this.rawSend(JSON.stringify({
        action: "channel-connect",
        channel: this.options.channel,
        auth: this.options.token
      }));
    }
    assocUser(userId) {
      this.rawSend(JSON.stringify({
        action: "assoc-user-to-fd-action",
        userId
      }));
    }
    startHeartBeat() {
      if (!this.options.heartBeat) {
        return;
      }
      this.heartBeatInterval = setInterval(() => {
        const pingFrame = new Uint8Array(2);
        pingFrame[0] = 137;
        pingFrame[1] = 0;
        this.ws.send(pingFrame);
      }, this.options.heartBeatInterval);
    }
  };
  var socket_conveyor_client_default = Conveyor;

  // src/conveyor-client-demo.js
  var statusEl = document.getElementById("status");
  var protocolValueEl = document.getElementById("protocolValue");
  var connectBtn = document.getElementById("connectBtn");
  var closeBtn = document.getElementById("closeBtn");
  var sendRawBtn = document.getElementById("sendRawBtn");
  var clearLogBtn = document.getElementById("clearLogBtn");
  var rawPayloadEl = document.getElementById("rawPayload");
  var logEl = document.getElementById("log");
  var fields = {
    wsUrl: document.getElementById("wsUrl"),
    auth: document.getElementById("auth"),
    channel: document.getElementById("channel"),
    data: document.getElementById("data"),
    userId: document.getElementById("userId"),
    ackId: document.getElementById("ackId")
  };
  var connection = null;
  function logEntry(kind, value) {
    const item = document.createElement("div");
    item.className = "log-entry " + kind;
    const stamp = document.createElement("span");
    stamp.className = "log-time";
    stamp.textContent = (/* @__PURE__ */ new Date()).toLocaleTimeString();
    const body = document.createElement("pre");
    body.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    item.appendChild(stamp);
    item.appendChild(body);
    logEl.prepend(item);
  }
  function setStatus(label, className) {
    statusEl.textContent = label;
    statusEl.className = "status " + className;
  }
  function setConnectedState(connected) {
    connectBtn.disabled = connected;
    closeBtn.disabled = !connected;
    sendRawBtn.disabled = !connected;
    document.querySelectorAll("[data-action]").forEach((button) => {
      button.disabled = !connected;
    });
  }
  function parseDataField() {
    const value = fields.data.value.trim();
    if (value === "") {
      return "";
    }
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  function parseWsUrl() {
    const url = new URL(fields.wsUrl.value.trim());
    return {
      protocol: url.protocol.replace(":", ""),
      uri: url.hostname,
      port: url.port ? Number.parseInt(url.port, 10) : url.protocol === "wss:" ? 443 : 80,
      query: url.search ? url.search.slice(1) : ""
    };
  }
  function buildPayload(action) {
    switch (action) {
      case "channel-connect":
        return {
          action,
          channel: fields.channel.value.trim(),
          auth: fields.auth.value.trim() || null
        };
      case "broadcast-action":
      case "fanout-action":
        return {
          action,
          data: parseDataField()
        };
      case "assoc-user-to-fd-action":
        return {
          action,
          userId: fields.userId.value.trim()
        };
      case "acknowledge-action":
        return {
          action,
          data: fields.ackId.value.trim()
        };
      case "channel-disconnect":
        return {
          action
        };
      default:
        throw new Error("Unsupported action: " + action);
    }
  }
  function isOpen() {
    return connection?.ws?.readyState === WebSocket.OPEN;
  }
  function ensureOpenSocket() {
    if (!isOpen()) {
      throw new Error("WebSocket is not open.");
    }
  }
  function updateProtocolLabel() {
    protocolValueEl.textContent = connection?.ws?.protocol || "none";
  }
  function sendViaOfficialClient(payload, source) {
    ensureOpenSocket();
    switch (payload.action) {
      case "channel-connect":
        connection.options.channel = payload.channel;
        connection.options.token = payload.auth;
        connection.connectChannel();
        break;
      case "broadcast-action":
      case "fanout-action":
        connection.send(payload.data, payload.action);
        break;
      case "assoc-user-to-fd-action":
        connection.assocUser(payload.userId);
        break;
      default:
        connection.rawSend(JSON.stringify(payload));
        break;
    }
    logEntry("outbound", { source, payload });
  }
  function handleRawMessage(rawPayload) {
    let payload = rawPayload;
    try {
      payload = JSON.parse(rawPayload);
    } catch {
      logEntry("inbound", rawPayload);
      return;
    }
    if (payload && typeof payload === "object" && "id" in payload) {
      fields.ackId.value = payload.id;
    }
    logEntry("inbound", payload);
  }
  function connect() {
    if (connection && connection.ws && connection.ws.readyState !== WebSocket.CLOSED) {
      return;
    }
    const socketConfig = parseWsUrl();
    const token = fields.auth.value.trim() || null;
    const channel = fields.channel.value.trim() || null;
    const userId = fields.userId.value.trim() || null;
    setStatus("Connecting\u2026", "connecting");
    connection = new socket_conveyor_client_default({
      ...socketConfig,
      token,
      channel,
      userId,
      reconnect: false,
      onReady: () => {
        setStatus("Connected", "connected");
        updateProtocolLabel();
        setConnectedState(true);
        logEntry("system", {
          event: "ready",
          protocol: connection?.ws?.protocol || "none",
          channel
        });
      },
      onRawMessage: handleRawMessage,
      onError: () => {
        logEntry("error", "WebSocket error");
      },
      onCloseCallback: () => {
        setStatus("Disconnected", "disconnected");
        protocolValueEl.textContent = "not connected";
        setConnectedState(false);
        logEntry("system", {
          event: "close"
        });
      }
    });
  }
  connectBtn.addEventListener("click", () => {
    try {
      connect();
    } catch (error) {
      logEntry("error", error.message);
    }
  });
  closeBtn.addEventListener("click", () => {
    if (connection?.ws) {
      connection.ws.close(1e3, "Closed by client");
    }
  });
  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      try {
        sendViaOfficialClient(
          buildPayload(button.dataset.action),
          button.dataset.action
        );
      } catch (error) {
        logEntry("error", error.message);
      }
    });
  });
  sendRawBtn.addEventListener("click", () => {
    try {
      const payload = JSON.parse(rawPayloadEl.value);
      sendViaOfficialClient(payload, "raw-json");
    } catch (error) {
      logEntry("error", error.message);
    }
  });
  clearLogBtn.addEventListener("click", () => {
    logEl.innerHTML = "";
  });
  setConnectedState(false);
  logEntry("system", {
    info: "Ready to connect using the official socket-conveyor-client package."
  });
})();
