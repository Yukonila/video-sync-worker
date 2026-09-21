const DEFAULT_SERVER = "wss://video-sync-worker.ykonila1118.workers.dev/ws";

let ws = null;
let reconnectTimer = null;
let keepaliveTimer = null;

async function getConfig() {
    const { serverUrl, roomId } = await chrome.storage.local.get(["serverUrl", "roomId"]);
    return { serverUrl: serverUrl || DEFAULT_SERVER, roomId };
}

async function connect() {
    const { serverUrl, roomId } = await getConfig();
    if (!roomId) return;

    if (ws) { try { ws.close(); } catch (e) { } ws = null; }

    try {
        ws = new WebSocket(`${serverUrl}?room=${roomId}`);
    } catch (e) {
        console.error("WebSocket create failed:", e);
        scheduleReconnect();
        return;
    }

    ws.onopen = () => {
        console.log("WS connected");
        ws.send(JSON.stringify({ type: "ping" }));
        startKeepalive();
    };

    ws.onmessage = (event) => {
        let data;
        try { data = JSON.parse(event.data); } catch { return; }
        if (data.type === "pong") return;

        // 转发给当前激活标签页的 content script
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, data).catch(() => { });
            }
        });
    };

    ws.onclose = () => {
        console.log("WS closed, reconnecting...");
        stopKeepalive();
        scheduleReconnect();
    };

    ws.onerror = () => {
        try { ws?.close(); } catch (e) { }
    };
}

function startKeepalive() {
    stopKeepalive();
    keepaliveTimer = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
        }
    }, 20000);
}

function stopKeepalive() {
    if (keepaliveTimer) { clearInterval(keepaliveTimer); keepaliveTimer = null; }
}

function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
    }, 3000);
}

// 来自 content script 的同步指令
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "sync-action" && ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg.payload));
    }
    if (msg.type === "get-status") {
        sendResponse({ connected: ws?.readyState === WebSocket.OPEN });
    }
    if (msg.type === "config-updated") {
        connect();
    }
    return true;
});

// 页面切换时确保连接
chrome.tabs.onActivated.addListener(() => {
    if (ws?.readyState !== WebSocket.OPEN) connect();
});
