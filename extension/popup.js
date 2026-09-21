const DEFAULT_SERVER = "wss://video-sync-worker.ykonila1118.workers.dev/ws";

document.addEventListener("DOMContentLoaded", async () => {
    const { serverUrl, roomId } = await chrome.storage.local.get(["serverUrl", "roomId"]);
    document.getElementById("server").value = serverUrl || "";
    document.getElementById("room").value = roomId || "";

    const status = await chrome.runtime.sendMessage({ type: "get-status" }).catch(() => null);
    document.getElementById("status").textContent = status?.connected ? "已连接" : "未连接";

    document.getElementById("generate").onclick = () => {
        document.getElementById("room").value = crypto.randomUUID().slice(0, 8);
    };

    document.getElementById("save").onclick = async () => {
        const serverUrl = document.getElementById("server").value.trim() || DEFAULT_SERVER;
        const roomId = document.getElementById("room").value.trim();
        if (!roomId) { alert("请输入房间号"); return; }

        await chrome.storage.local.set({ serverUrl, roomId });
        chrome.runtime.sendMessage({ type: "config-updated" });
        document.getElementById("status").textContent = "正在连接...";

        setTimeout(async () => {
            const s = await chrome.runtime.sendMessage({ type: "get-status" }).catch(() => null);
            document.getElementById("status").textContent = s?.connected ? "已连接" : "连接失败";
        }, 2000);
    };
});