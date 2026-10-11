const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const { Readable } = require("stream");

// ছবি আঁকা সব কমান্ডের (canvas) লেখায় ফন্টের সমস্যা নিজে নিজে ঠিক করে:
//  - ইমোজি, বক্স-রেখা (╭──╮), ফ্যান্সি অক্ষর (𝗛𝗘𝗟𝗣) বক্স হওয়ার বদলে সাধারণ করে/বাদ দেয়
//  - ফন্টের তালিকার শেষে বাংলা ফন্ট জুড়ে দেয়, যাতে বাংলা অক্ষর বক্স না হয়
// কমান্ডের ফাইলে হাত দিতে হয় না। বট চালু হলেই কাজ শুরু করে।

const FONT_FILE = path.join(__dirname, "assets", "font", "BanglaFont.ttf");
const STATE_FILE = path.join(__dirname, "cache", "fontfix.json");
const FONT_URLS = [
	"https://github.com/google/fonts/raw/main/ofl/hindsiliguri/HindSiliguri-Bold.ttf",
	"https://raw.githubusercontent.com/google/fonts/main/ofl/hindsiliguri/HindSiliguri-Bold.ttf",
	"https://raw.githubusercontent.com/notofonts/notofonts.github.io/main/fonts/NotoSansBengali/hinted/ttf/NotoSansBengali-Bold.ttf"
];
const FAMILY = "BanglaFont";
// ইমোজির জন্য ফন্ট (সাদা-কালো রেখার ইমোজি, লেখার রঙে আঁকা হয়)
const EMOJI_FILE = path.join(__dirname, "assets", "font", "EmojiFont.ttf");
const EMOJI_FAMILY = "EmojiFont";
const EMOJI_URLS = [
	"https://github.com/google/fonts/raw/main/ofl/notoemoji/NotoEmoji%5Bwght%5D.ttf",
	"https://raw.githubusercontent.com/google/fonts/main/ofl/notoemoji/NotoEmoji%5Bwght%5D.ttf"
];

let enabled = true;
const info = { patched: [], fontRegistered: false, emojiRegistered: false, error: "" };

function loadState() {
	try { enabled = fs.readJsonSync(STATE_FILE).enabled !== false; }
	catch (e) { enabled = true; }
}
function saveState() {
	try {
		fs.ensureDirSync(path.dirname(STATE_FILE));
		fs.writeJsonSync(STATE_FILE, { enabled });
	} catch (e) { }
}

// ====== লেখা পরিষ্কার ======
const SC = { "ᴀ": "A", "ʙ": "B", "ᴄ": "C", "ᴅ": "D", "ᴇ": "E", "ꜰ": "F", "ɢ": "G", "ʜ": "H", "ɪ": "I", "ᴊ": "J", "ᴋ": "K", "ʟ": "L", "ᴍ": "M", "ɴ": "N", "ᴏ": "O", "ᴘ": "P", "ǫ": "Q", "ʀ": "R", "ꜱ": "S", "ᴛ": "T", "ᴜ": "U", "ᴠ": "V", "ᴡ": "W", "ʏ": "Y", "ᴢ": "Z" };
const SYM = { "➤": ">", "➔": ">", "➜": ">", "❯": ">", "→": "->", "←": "<-", "★": "*", "☆": "*", "✦": "*", "✧": "*", "✓": "v", "✔": "v", "✗": "x", "✘": "x", "❝": "\"", "❞": "\"" };

function cleanText(text) {
	let t = String(text);
	if (/^[\x20-\x7E]*$/.test(t)) return t; // সাধারণ ইংরেজি লেখায় কিছুই বদলাবে না
	t = t.replace(/[\u{1D400}-\u{1D7FF}\uFF01-\uFF5E\u2460-\u24FF]/gu, ch => ch.normalize("NFKC"));
	t = Array.from(t).map(ch => SC[ch] || SYM[ch] || ch).join("");
	t = t.replace(/[\u2500-\u257F]/g, ch => {
		if ("─━═┄┅┈┉╌╍".includes(ch)) return "-";
		if ("│┃║┆┇┊┋╎╏".includes(ch)) return "|";
		return "+";
	});
	if (info.emojiRegistered) t = t.replace(/[\uFE0F\u20E3]/gu, ""); // ইমোজি ফন্ট আছে: ইমোজি রাখি
	else t = t.replace(/[\u{1F000}-\u{1FFFF}\u2600-\u27BF\u2B00-\u2BFF\u2190-\u21FF\u2300-\u23FF\u25A0-\u25FF\uFE0F\u20E3]+ ?/gu, "");
	return t;
}

// ====== canvas-এ বসানো ======
function registerBangla() {
	try {
		const canvas = require("canvas");
		if (!info.fontRegistered && fs.existsSync(FONT_FILE)) {
			canvas.registerFont(FONT_FILE, { family: FAMILY });
			info.fontRegistered = true;
		}
		if (!info.emojiRegistered && fs.existsSync(EMOJI_FILE)) {
			canvas.registerFont(EMOJI_FILE, { family: EMOJI_FAMILY });
			info.emojiRegistered = true;
		}
	} catch (e) { info.error = e.message; }
	return info.fontRegistered;
}

function applyPatch() {
	try {
		const canvas = require("canvas");
		const proto = canvas.CanvasRenderingContext2D && canvas.CanvasRenderingContext2D.prototype;
		if (!proto) { info.error = "CanvasRenderingContext2D পাওয়া যায়নি"; return false; }
		if (proto.__fontFix) return true;

		for (const m of ["fillText", "strokeText"]) {
			const orig = proto[m];
			if (typeof orig !== "function") continue;
			proto[m] = function (text, ...rest) {
				return orig.call(this, enabled && typeof text === "string" ? cleanText(text) : text, ...rest);
			};
			info.patched.push(m);
		}
		const origMeasure = proto.measureText;
		if (typeof origMeasure === "function") {
			proto.measureText = function (text, ...rest) {
				return origMeasure.call(this, enabled && typeof text === "string" ? cleanText(text) : text, ...rest);
			};
			info.patched.push("measureText");
		}

		const desc = Object.getOwnPropertyDescriptor(proto, "font");
		if (desc && desc.set && desc.get) {
			Object.defineProperty(proto, "font", {
				configurable: true,
				enumerable: desc.enumerable,
				get: desc.get,
				set: function (v) {
					if (enabled && typeof v === "string") {
						if (info.fontRegistered && !v.includes(FAMILY)) v = v + ", " + FAMILY;
						if (info.emojiRegistered && !v.includes(EMOJI_FAMILY)) v = v + ", " + EMOJI_FAMILY;
					}
					desc.set.call(this, v);
				}
			});
			info.patched.push("font");
		}
		Object.defineProperty(proto, "__fontFix", { value: true });
		return true;
	}
	catch (e) { info.error = e.message; return false; }
}

async function download(urls, file) {
	const report = [];
	for (const u of urls) {
		try {
			const r = await axios.get(u, { responseType: "arraybuffer", timeout: 30000, maxRedirects: 5 });
			const buf = Buffer.from(r.data);
			const sig = buf.slice(0, 4).toString("latin1");
			if (buf.length > 50000 && (sig === "\x00\x01\x00\x00" || sig === "OTTO" || sig === "true")) {
				fs.ensureDirSync(path.dirname(file));
				fs.writeFileSync(file, buf);
				report.push(`✅ ${u} (${Math.round(buf.length / 1024)} KB)`);
				return { ok: true, report };
			}
			report.push(`❌ ${u}\n   ফন্ট ফাইল না (${buf.length} বাইট)`);
		}
		catch (e) {
			report.push(`❌ ${u}\n   ${e.response ? "HTTP " + e.response.status : (e.code || e.message)}`);
		}
	}
	return { ok: false, report };
}

function testImage() {
	const { createCanvas } = require("canvas");
	const c = createCanvas(760, 360);
	const ctx = c.getContext("2d");
	ctx.fillStyle = "#1e1e2e"; ctx.fillRect(0, 0, 760, 360);
	ctx.fillStyle = "#ffffff"; ctx.font = "bold 36px Arial";
	const lines = ["🤖 BOT UPTIME ⚡", "╭──── 𝗛𝗘𝗟𝗣 ────╮", "বাংলা: আমি বাংলায় গান গাই", "ᴘʀᴇꜰɪx ➤ ~ ✅"];
	lines.forEach((l, i) => ctx.fillText(l, 30, 70 + i * 70));
	return c.toBuffer("image/png");
}

module.exports = {
	config: {
		name: "font",
		aliases: ["fixfont", "fontfix"],
		version: "1.0",
		author: "JABED",
		countDown: 3,
		role: 2,
		description: "ছবি আঁকা কমান্ডের লেখায় ফন্টের সমস্যা (বক্স) নিজে নিজে ঠিক করে",
		category: "owner",
		guide: "   {pn} status: অবস্থা দেখো\n   {pn} on / off: চালু/বন্ধ\n   {pn} download [url]: বাংলা ফন্ট নামাও\n   {pn} emoji [url]: ইমোজি ফন্ট নামাও\n   {pn} test: একটা পরীক্ষার ছবি পাঠাও"
	},

	onLoad: function () {
		loadState();
		registerBangla();
		applyPatch();
	},

	onStart: async function ({ args, message }) {
		const sub = (args[0] || "status").toLowerCase();

		if (sub === "on" || sub === "off") {
			enabled = sub === "on";
			saveState();
			return message.reply(enabled ? "✅ Font fix চালু।" : "⏸️ Font fix বন্ধ।");
		}

		if (sub === "download") {
			const r = await download(args[1] ? [args[1]] : FONT_URLS, FONT_FILE);
			if (r.ok) { registerBangla(); applyPatch(); }
			return message.reply((r.ok ? "✅ বাংলা ফন্ট বসেছে।\n\n" : "❌ ফন্ট নামানো যায়নি।\n\n") + r.report.join("\n"));
		}

		if (sub === "emoji") {
			const r = await download(args[1] ? [args[1]] : EMOJI_URLS, EMOJI_FILE);
			if (r.ok) { registerBangla(); applyPatch(); }
			return message.reply((r.ok ? "✅ ইমোজি ফন্ট বসেছে, এখন থেকে ইমোজি ছবিতে আসবে।\n\n" : "❌ ইমোজি ফন্ট নামানো যায়নি।\n\n") + r.report.join("\n"));
		}

		if (sub === "test") {
			try {
				const s = Readable.from(testImage());
				s.path = "fonttest.png";
				return message.reply({ body: "ছবিতে বক্স না থাকলে ঠিক আছে।", attachment: s });
			}
			catch (e) { return message.reply("❌ পরীক্ষার ছবি বানাতে পারিনি: " + e.message); }
		}

		// status
		return message.reply(
			`🔤 Font fix: ${enabled ? "চালু ✅" : "বন্ধ ⏸️"}\n` +
			`বাংলা ফন্ট ফাইল: ${fs.existsSync(FONT_FILE) ? "আছে ✅" : "নেই ❌ (font download দিন)"}\n` +
			`ফন্ট নিবন্ধিত: ${info.fontRegistered ? "হ্যাঁ" : "না"}\n` +
			`ইমোজি ফন্ট: ${fs.existsSync(EMOJI_FILE) ? (info.emojiRegistered ? "আছে ✅ (ইমোজি দেখাবে)" : "আছে, রিস্টার্ট লাগবে") : "নেই ❌ (font emoji দিন)"}\n` +
			`বসানো হয়েছে: ${info.patched.length ? info.patched.join(", ") : "কিছুই না ❌"}` +
			(info.error ? `\nএরর: ${info.error}` : "")
		);
	}
};
