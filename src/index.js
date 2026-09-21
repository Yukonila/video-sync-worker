import { DurableObject } from "cloudflare:workers";

export class MyDurableObject extends DurableObject {
	constructor(ctx, env) {
		super(ctx, env);
		this.sessions = new Map();
		// 从休眠中恢复时，重建连接映射
		this.ctx.getWebSockets().forEach((ws) => {
			const attachment = ws.deserializeAttachment();
			if (attachment) this.sessions.set(ws, attachment);
		});
	}

	async fetch(request) {
		const url = new URL(request.url);

		// 只处理 WebSocket 升级请求
		const upgradeHeader = request.headers.get("Upgrade");
		if (!upgradeHeader || upgradeHeader.toLowerCase() !== "websocket") {
			return new Response("Video Sync Server is running", { status: 200 });
		}

		const webSocketPair = new WebSocketPair();
		const [client, server] = Object.values(webSocketPair);

		// 关键：使用 acceptWebSocket 支持休眠
		this.ctx.acceptWebSocket(server);
		const id = crypto.randomUUID();
		server.serializeAttachment({ id });
		this.sessions.set(server, { id });

		return new Response(null, { status: 101, webSocket: client });
	}

	async webSocketMessage(ws, message) {
		let data;
		try { data = JSON.parse(message); } catch { return; }

		// 心跳响应
		if (data.type === "ping") {
			ws.send(JSON.stringify({ type: "pong" }));
			return;
		}

		// 广播给房间内其他连接
		this.sessions.forEach((attachment, connectedWs) => {
			if (connectedWs !== ws) {
				try { connectedWs.send(message); } catch (e) { }
			}
		});
	}

	async webSocketClose(ws) {
		this.sessions.delete(ws);
	}

	async webSocketError(ws) {
		this.sessions.delete(ws);
	}
}

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);

		// 只处理 /ws 路径
		if (url.pathname !== "/ws") {
			return new Response("Video Sync Server is running", { status: 200 });
		}

		// 从查询参数获取房间号，默认 "default"
		const roomId = url.searchParams.get("room") || "default";

		// 同一个房间号永远路由到同一个 Durable Object 实例
		const stub = env.MY_DURABLE_OBJECT.getByName(roomId);

		return stub.fetch(request);
	},
};