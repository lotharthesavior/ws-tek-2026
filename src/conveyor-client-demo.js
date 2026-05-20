import Conveyor from "socket-conveyor-client";

const statusEl = document.getElementById("status");
const protocolValueEl = document.getElementById("protocolValue");
const connectBtn = document.getElementById("connectBtn");
const closeBtn = document.getElementById("closeBtn");
const sendRawBtn = document.getElementById("sendRawBtn");
const clearLogBtn = document.getElementById("clearLogBtn");
const rawPayloadEl = document.getElementById("rawPayload");
const logEl = document.getElementById("log");

const fields = {
  wsUrl: document.getElementById("wsUrl"),
  auth: document.getElementById("auth"),
  channel: document.getElementById("channel"),
  data: document.getElementById("data"),
  userId: document.getElementById("userId"),
  ackId: document.getElementById("ackId"),
};

let connection = null;

function logEntry(kind, value) {
  const item = document.createElement("div");
  item.className = "log-entry " + kind;

  const stamp = document.createElement("span");
  stamp.className = "log-time";
  stamp.textContent = new Date().toLocaleTimeString();

  const body = document.createElement("pre");
  body.textContent =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);

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
    query: url.search ? url.search.slice(1) : "",
  };
}

function buildPayload(action) {
  switch (action) {
    case "channel-connect":
      return {
        action,
        channel: fields.channel.value.trim(),
        auth: fields.auth.value.trim() || null,
      };
    case "broadcast-action":
    case "fanout-action":
      return {
        action,
        data: parseDataField(),
      };
    case "assoc-user-to-fd-action":
      return {
        action,
        userId: fields.userId.value.trim(),
      };
    case "acknowledge-action":
      return {
        action,
        data: fields.ackId.value.trim(),
      };
    case "channel-disconnect":
      return {
        action,
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

  setStatus("Connecting…", "connecting");

  connection = new Conveyor({
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
        channel,
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
        event: "close",
      });
    },
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
    connection.ws.close(1000, "Closed by client");
  }
});

document.querySelectorAll("[data-action]").forEach((button) => {
  button.addEventListener("click", () => {
    try {
      sendViaOfficialClient(
        buildPayload(button.dataset.action),
        button.dataset.action,
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
  info: "Ready to connect using the official socket-conveyor-client package.",
});
