const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

// ====== আপনার ৪টা GIF (ibb পেজের লিংক চলবে, কোড নিজে সরাসরি ছবির লিংক বের করে নেবে) ======
// সরাসরি লিংক (i.ibb.co/...gif) থাকলে সেটা বসালে আরও নির্ভরযোগ্য হবে।
const GIF_LINKS = [
	"https://ibb.co.com/hJ7fjFG4",
	"https://ibb.co.com/KpGVks5K",
	"https://ibb.co.com/Fkr4ffx4",
	"https://ibb.co.com/qYz3DHrx"
	"https://ibb.co.com/MWJQXQ7"
    "https://ibb.co.com/sd5cS8w2"
];
const SHOW_MS = 3000; // GIF কত মিলিসেকেন্ড দেখা যাবে
const DATA_FILE = path.join(__dirname, "cache", "effectavatar.json");
const urlCache = {};
const lastReplay = {};

// ====== বাবল + GIF এক ছবিতে (ভিডিওর মতো) ======
const BUBBLE_MODE = true;        // false দিলে আগের মতো আলাদা GIF-পপআপ হবে
const MAX_W = 640;               // ছবির সর্বোচ্চ প্রস্থ
const GIF_H = 260;               // উপরের ক্যারেক্টারের উচ্চতা
const PALETTE = [
	["#ff6fa5", "#ff3d77"], // গোলাপি
	["#4aa3ff", "#2f7bff"], // নীল
	["#ffd24a", "#ff9a2e"], // সোনালি
	["#ff5a5a", "#d92b2b"], // লাল
	["#b36bff", "#7b3dff"], // বেগুনি
	["#3ddc97", "#1fb57a"], // সবুজ
	["#ff8a3d", "#ff5e1a"], // কমলা
	["#5ad7ff", "#2fb3e8"]  // আকাশি
];

let _canvas = null;
function getCanvas() {
	if (_canvas) return _canvas;
	_canvas = require("canvas");
	try {
		const fp = path.join(process.cwd(), "scripts", "cmds", "assets", "font", "NotoSans-Bold.ttf");
		if (fs.existsSync(fp)) _canvas.registerFont(fp, { family: "NotoBold" });
	} catch (e) { }
	return _canvas;
}

// লেখা থেকে ঢেউ-কিনারার রঙিন বাবল PNG বানায়
function renderBubble(text) {
	const { createCanvas } = getCanvas();
	const pad = 30, fontSize = 30, lineH = 42, wave = 9;
	const font = `bold ${fontSize}px NotoBold, "Noto Sans", sans-serif`;
	const probe = createCanvas(10, 10).getContext("2d");
	probe.font = font;
	const maxTextW = MAX_W - pad * 2;

	const lines = [];
	for (const raw of String(text).split("\n")) {
		if (raw === "") { lines.push(""); continue; }
		let cur = "";
		for (const ch of Array.from(raw)) {
			if (probe.measureText(cur + ch).width > maxTextW) { lines.push(cur); cur = ch; }
			else cur += ch;
		}
		lines.push(cur);
	}
	if (lines.length > 26) throw new Error("text too long");

	let textW = 0;
	for (const l of lines) textW = Math.max(textW, probe.measureText(l).width);
	const w = Math.min(MAX_W, Math.ceil(textW) + pad * 2);
	const h = lines.length * lineH + pad * 2 + wave;

	const canvas = createCanvas(w, h);
	const ctx = canvas.getContext("2d");
	const [c1, c2] = PALETTE[Math.floor(Math.random() * PALETTE.length)];
	const grad = ctx.createLinearGradient(0, 0, 0, h);
	grad.addColorStop(0, c1); grad.addColorStop(1, c2);

	const r = 34, bottom = h - wave;
	ctx.beginPath();
	ctx.moveTo(r, 0);
	ctx.lineTo(w - r, 0); ctx.quadraticCurveTo(w, 0, w, r);
	ctx.lineTo(w, bottom - r); ctx.quadraticCurveTo(w, bottom, w - r, bottom);
	// নিচের ঢেউ
	const steps = Math.max(4, Math.round((w - 2 * r) / 36));
	const sw = (w - 2 * r) / steps;
	for (let i = 0; i < steps; i++) {
		const x0 = w - r - i * sw, x1 = x0 - sw;
		ctx.quadraticCurveTo(x0 - sw / 2, bottom + (i % 2 === 0 ? wave : -wave * 0.2), x1, bottom);
	}
	ctx.quadraticCurveTo(0, bottom, 0, bottom - r);
	ctx.lineTo(0, r); ctx.quadraticCurveTo(0, 0, r, 0);
	ctx.closePath();
	ctx.fillStyle = grad; ctx.fill();

	ctx.fillStyle = "#111111"; ctx.font = font; ctx.textBaseline = "top";
	lines.forEach((l, i) => ctx.fillText(l, pad, pad + i * lineH));
	return { png: canvas.toBuffer("image/png"), width: w, height: h };
}

// ক্যারেক্টার GIF-এর নিচে বাবল বসিয়ে একটা GIF বানায় (প্রতিটা ফ্রেমে)
async function composeGif(gifBuf, bubble) {
	const sharp = require("sharp");
	const meta = await sharp(gifBuf, { animated: true }).metadata();
	const pages = meta.pages || 1;
	const W = Math.max(bubble.width, 360);
	const left = Math.round((W - bubble.width) / 2);
	const pageH = GIF_H + bubble.height;
	const clear = { r: 0, g: 0, b: 0, alpha: 0 };
	const overlays = [];
	for (let i = 0; i < pages; i++) overlays.push({ input: bubble.png, top: i * pageH + GIF_H, left });
	return await sharp(gifBuf, { animated: true })
		.resize({ width: W, height: GIF_H, fit: "contain", background: clear })
		.extend({ bottom: bubble.height, background: clear })
		.composite(overlays)
		.gif()
		.toBuffer();
}

async function downloadGif() {
	const link = GIF_LINKS[Math.floor(Math.random() * GIF_LINKS.length)];
	const url = await resolveUrl(link);
	const res = await axios.get(url, { responseType: "arraybuffer", timeout: 20000 });
	return Buffer.from(res.data);
}

function bufferStream(buf, name) {
	const { Readable } = require("stream");
	const s = Readable.from(buf);
	s.path = name;
	return s;
}

// উত্তর দিলে true, কোনো কারণে না পারলে false (তখন সাধারণ লেখা যাবে)
async function sendBubble(origReply, form, cb) {
	const body = typeof form === "string" ? form : (form && form.body);
	if (!body || typeof body !== "string" || body.length > 1500) return null;
	if (typeof form === "object" && (form.attachment || form.mentions || form.sticker || form.url || form.location)) return null;
	try {
		const bubble = renderBubble(body);
		const gifBuf = await downloadGif();
		const out = await composeGif(gifBuf, bubble);
		return await origReply({ attachment: bufferStream(out, "effect.gif") }, cb);
	}
	catch (e) { return null; }
}

function loadList() {
	try { return fs.readJsonSync(DATA_FILE).commands || []; }
	catch (e) { return []; }
}
function saveList(list) {
	fs.ensureDirSync(path.dirname(DATA_FILE));
	fs.writeJsonSync(DATA_FILE, { commands: list });
}

async function resolveUrl(link) {
	if (urlCache[link]) return urlCache[link];
	let url = link;
	if (!/\.(gif|png|jpe?g|webp)(\?.*)?$/i.test(link)) {
		const { data } = await axios.get(link, { timeout: 15000, headers: { "User-Agent": "Mozilla/5.0" } });
		const html = String(data);
		const m = html.match(/property="og:image"\s+content="([^"]+)"/i)
			|| html.match(/content="([^"]+)"\s+property="og:image"/i);
		if (!m) throw new Error("direct image link not found");
		url = m[1].replace(/&amp;/g, "&");
	}
	urlCache[link] = url;
	return url;
}

// GIF পাঠায়, SHOW_MS পর মুছে দেয়
async function showGif(api, threadID) {
	try {
		const link = GIF_LINKS[Math.floor(Math.random() * GIF_LINKS.length)];
		const url = await resolveUrl(link);
		const stream = await global.utils.getStreamFromURL(url, "effect.gif");
		const info = await new Promise((resolve, reject) => {
			api.sendMessage({ attachment: stream }, threadID, (err, i) => err ? reject(err) : resolve(i));
		});
		const id = info && info.messageID;
		if (id) setTimeout(() => { try { api.unsendMessage(id, () => { }); } catch (e) { } }, SHOW_MS);
	}
	catch (e) { /* GIF না গেলে কমান্ড স্বাভাবিকভাবেই চলবে */ }
}

function findCommand(name) {
	const { commands, aliases } = global.GoatBot;
	return commands.get(name) || commands.get(aliases.get(name));
}

function hook(name) {
	const cmd = findCommand(name);
	if (!cmd) return false;
	if (cmd.onStart && cmd.onStart.__eff) return true;
	const orig = cmd.onStart;
	const wrapped = async function (params) {
		try {
			const { message, event, api } = params;
			const origReply = message.reply;
			let used = false;
			message.reply = async (form, cb) => {
				let res = null;
				if (!used) {
					used = true;
					if (BUBBLE_MODE) res = await sendBubble(origReply, form, cb);
					else await showGif(api, event.threadID); // GIF আগে, লেখা পরে
				}
				if (!res) res = await origReply(form, cb);   // বাবল না বানাতে পারলে সাধারণ লেখা
				try {
					if (!BUBBLE_MODE && res && res.messageID && global.GoatBot.onReaction) {
						global.GoatBot.onReaction.set(res.messageID, {
							commandName: "effectavatar",
							messageID: res.messageID,
							author: event.senderID
						});
					}
				} catch (e) { }
				return res;
			};
		} catch (e) { }
		return orig.call(this, params);
	};
	wrapped.__eff = true;
	wrapped.__orig = orig;
	cmd.onStart = wrapped;
	return true;
}

function unhook(name) {
	const cmd = findCommand(name);
	if (cmd && cmd.onStart && cmd.onStart.__eff) cmd.onStart = cmd.onStart.__orig;
}

function installAll() {
	for (const name of loadList()) hook(name);
}

module.exports = {
	config: {
		name: "effectavatar",
		aliases: ["effavatar"],
		version: "1.0",
		author: "JABED",
		countDown: 3,
		role: { onStart: 2, onReaction: 0 },
		description: { en: "Add a GIF popup effect (shown 3s) to chosen commands" },
		category: "owner",
		guide: {
			en: "   {pn} add <command>: effect চালু\n   {pn} remove <command>: effect বন্ধ\n   {pn} list: চালু থাকা কমান্ড"
		}
	},

	onLoad: function () {
		// অন্য কমান্ড লোড হওয়ার পর হুক বসাতে একটু দেরি
		setTimeout(installAll, 10000);
	},

	onChat: function () {
		installAll();
	},

	onStart: async function ({ args, message }) {
		const sub = (args[0] || "").toLowerCase();
		const list = loadList();

		if (sub === "list") {
			return message.reply(list.length
				? "✨ Effect চালু আছে:\n" + list.map((n, i) => `${i + 1}. ${n}`).join("\n")
				: "কোনো কমান্ডে effect চালু নেই।");
		}

		const name = (args[1] || "").toLowerCase();
		if (!["add", "remove"].includes(sub) || !name)
			return message.reply("ব্যবহার:\neffectavatar add <command>\neffectavatar remove <command>\neffectavatar list");

		const cmd = findCommand(name);
		if (!cmd) return message.reply(`❌ "${name}" নামে কোনো কমান্ড পাইনি।`);
		const real = cmd.config.name;
		if (["effectavatar", "onlyeffect"].includes(real))
			return message.reply("❌ এই কমান্ডে effect বসানো যাবে না।");

		if (sub === "add") {
			if (list.includes(real)) return message.reply(`ℹ️ ${real} এ আগেই চালু আছে।`);
			list.push(real);
			saveList(list);
			hook(real);
			return message.reply(`✅ ${real} কমান্ডে GIF effect চালু হলো।`);
		}

		if (!list.includes(real)) return message.reply(`ℹ️ ${real} এ effect চালু ছিল না।`);
		saveList(list.filter(n => n !== real));
		unhook(real);
		return message.reply(`✅ ${real} কমান্ডে effect বন্ধ হলো।`);
	},

	// effect-ওয়ালা মেসেজে কেউ রিঅ্যাক্ট করলে GIF আবার দেখাবে
	onReaction: async function ({ event, api }) {
		const key = event.messageID;
		const now = Date.now();
		if (lastReplay[key] && now - lastReplay[key] < SHOW_MS + 2000) return;
		lastReplay[key] = now;
		await showGif(api, event.threadID);
	}
};
