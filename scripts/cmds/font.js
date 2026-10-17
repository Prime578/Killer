const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const { Readable } = require("stream");

// ছবি আঁকা সব কমান্ডের (canvas) লেখায় নিজে নিজে ঠিক করে:
//  - সব ইমোজি রঙিন ছবি (Twemoji) হয়ে বসে, কমান্ডের ফাইলে হাত দিতে হয় না
//  - বক্স-রেখা (╭──╮), ফ্যান্সি অক্ষর (𝗛𝗘𝗟𝗣) বক্স হওয়ার বদলে সাধারণ হয়
//  - বাংলা অক্ষর বক্স হয় না (BanglaFont.ttf, না থাকলে BanglaFallback.ttf)
// ইমোজি ছবি assets/emoji/ ফোল্ডারে জমা থাকে। না থাকলে বট চালুর সময় সব কমান্ড স্ক্যান করে নামিয়ে নেয়।

const FONT_DIR = path.join(__dirname, "assets", "font");
const FONT_FILE = path.join(FONT_DIR, "BanglaFont.ttf");
const FALLBACK_FILE = path.join(FONT_DIR, "BanglaFallback.ttf");
const EMOJI_FILE = path.join(FONT_DIR, "EmojiFont.ttf");
const EMOJI_DIR = path.join(__dirname, "assets", "emoji");
const LANG_DIR = path.join(FONT_DIR, "langs"); // এই ফোল্ডারের সব ফন্ট নিজে নিজে রেজিস্টার হয়
const STATE_FILE = path.join(__dirname, "cache", "fontfix.json");
const FAMILY = "BanglaFont";
const EMOJI_FAMILY = "EmojiFont";

const FONT_URLS = [
	"https://github.com/google/fonts/raw/main/ofl/hindsiliguri/HindSiliguri-Bold.ttf",
	"https://raw.githubusercontent.com/google/fonts/main/ofl/hindsiliguri/HindSiliguri-Bold.ttf",
	"https://raw.githubusercontent.com/notofonts/notofonts.github.io/main/fonts/NotoSansBengali/hinted/ttf/NotoSansBengali-Bold.ttf"
];
const EMOJI_URLS = [
	"https://github.com/google/fonts/raw/main/ofl/notoemoji/NotoEmoji%5Bwght%5D.ttf",
	"https://raw.githubusercontent.com/google/fonts/main/ofl/notoemoji/NotoEmoji%5Bwght%5D.ttf"
];
// Twemoji ছবির ঠিকানা ({code} বদলে যাবে)
const TWEMOJI_URLS = [
	"https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/72x72/{code}.png",
	"https://raw.githubusercontent.com/jdecked/twemoji/main/assets/72x72/{code}.png",
	"https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/{code}.png",
	"https://raw.githubusercontent.com/twitter/twemoji/master/assets/72x72/{code}.png"
];

// ভাষা চেনার তালিকা: লেখায় এই অক্ষর পেলে ওই ভাষার Noto ফন্ট না থাকলে নিজে নামিয়ে নেয়
// [নাম, অক্ষর চেনার প্যাটার্ন, ফন্টের নাম, {lazy: শুধু দরকারে নামবে, urls: নিজস্ব ঠিকানা, ext}]
const NOTO_BASE = "https://raw.githubusercontent.com/notofonts/notofonts.github.io/main/fonts/";
const CJK_BASE = "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/SubsetOTF/";
const SCRIPTS = [
	["latin", /[\u0100-\u024F\u1E00-\u1EFF\u0370-\u03FF\u0400-\u052F]/, "NotoSans"],
	["arabic", /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/, "NotoSansArabic"],
	["devanagari", /[\u0900-\u097F]/, "NotoSansDevanagari"],
	["bengali", /[\u0980-\u09FF]/, "NotoSansBengali"],
	["thai", /[\u0E00-\u0E7F]/, "NotoSansThai"],
	// চাইনিজ/জাপানি/কোরিয়ান ফন্ট বড় (প্রায় ৮ MB), তাই শুধু লেখায় ওই অক্ষর এলে বা নাম ধরে নামবে
	["chinese", /[\u3400-\u4DBF\u4E00-\u9FFF]/, "NotoSansSC", { lazy: true, ext: "otf", urls: [CJK_BASE + "SC/NotoSansSC-Regular.otf"] }],
	["japanese", /[\u3040-\u30FF]/, "NotoSansJP", { lazy: true, ext: "otf", urls: [CJK_BASE + "JP/NotoSansJP-Regular.otf"] }],
	["korean", /[\u1100-\u11FF\uAC00-\uD7AF\u3130-\u318F]/, "NotoSansKR", { lazy: true, ext: "otf", urls: [CJK_BASE + "KR/NotoSansKR-Regular.otf"] }]
];

let enabled = true;
const info = { patched: [], fontRegistered: false, bnFile: "", emojiRegistered: false, error: "", langFamilies: [], langFiles: new Set() };
const scriptTried = new Map(); // ভাষা -> শেষ চেষ্টার সময়

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

// ====== ইমোজি চেনা ======
const MOD = "[\\u{1F3FB}-\\u{1F3FF}]";
const PICT = `\\p{Extended_Pictographic}\\uFE0F?${MOD}?[\\u{E0020}-\\u{E007F}]*`;
const EMOJI_SRC = `[#*0-9]\\uFE0F?\\u20E3|\\p{Regional_Indicator}{2}|${PICT}(?:\\u200D${PICT})*`;
const EMOJI_TEST = new RegExp(`[#*0-9]\\uFE0F\\u20E3|\\p{Regional_Indicator}{2}|\\p{Extended_Pictographic}`, "u");
const EMOJI_PRES = /\p{Emoji_Presentation}/u;

// সাধারণ চিহ্ন, যেগুলো ইমোজি না — ছবি না করে সাধারণ অক্ষরে বদলাবে
const SC = { "ᴀ": "A", "ʙ": "B", "ᴄ": "C", "ᴅ": "D", "ᴇ": "E", "ꜰ": "F", "ɢ": "G", "ʜ": "H", "ɪ": "I", "ᴊ": "J", "ᴋ": "K", "ʟ": "L", "ᴍ": "M", "ɴ": "N", "ᴏ": "O", "ᴘ": "P", "ǫ": "Q", "ʀ": "R", "ꜱ": "S", "ᴛ": "T", "ᴜ": "U", "ᴠ": "V", "ᴡ": "W", "ʏ": "Y", "ᴢ": "Z" };
const SYM = { "➤": ">", "➔": ">", "➜": ">", "❯": ">", "→": "->", "←": "<-", "★": "*", "☆": "*", "✦": "*", "✧": "*", "✓": "v", "✗": "x", "✘": "x", "❝": "\"", "❞": "\"" };

function isRealEmoji(m) {
	if (m.length > 2 || /[\uFE0F\u200D\u20E3]/.test(m) || m.codePointAt(0) >= 0x1F000) return true;
	if (m.length === 1 && SYM[m]) return false;
	if (EMOJI_PRES.test(m)) return true;
	const cp = m.codePointAt(0);
	return (cp >= 0x2300 && cp <= 0x23FF) || (cp >= 0x2600 && cp <= 0x27BF) || (cp >= 0x2B00 && cp <= 0x2BFF);
}

// লেখাকে "সাধারণ লেখা" আর "ইমোজি" টুকরোয় ভাগ করে
function splitSegments(text) {
	const out = [];
	let last = 0;
	const re = new RegExp(EMOJI_SRC, "gu");
	let m;
	while ((m = re.exec(text)) !== null) {
		if (!isRealEmoji(m[0])) continue;
		if (m.index > last) out.push({ emoji: false, text: cleanPlain(text.slice(last, m.index)) });
		out.push({ emoji: true, text: m[0] });
		last = m.index + m[0].length;
	}
	if (last < text.length) out.push({ emoji: false, text: cleanPlain(text.slice(last)) });
	return out.filter(s => s.emoji || s.text !== "");
}

function hasEmoji(text) {
	return EMOJI_TEST.test(text) && splitSegments(text).some(s => s.emoji);
}

function cleanPlain(text) {
	let t = String(text);
	if (/^[\x20-\x7E]*$/.test(t)) return t; // সাধারণ ইংরেজি লেখায় কিছুই বদলাবে না
	t = t.replace(/[\u{1D400}-\u{1D7FF}\uFF01-\uFF5E\u2460-\u24FF]/gu, ch => ch.normalize("NFKC"));
	t = Array.from(t).map(ch => SC[ch] || SYM[ch] || ch).join("");
	t = t.replace(/[\u2500-\u257F]/g, ch => {
		if ("─━═┄┅┈┉╌╍".includes(ch)) return "-";
		if ("│┃║┆┇┊┋╎╏".includes(ch)) return "|";
		return "+";
	});
	return t.replace(/[\uFE0E\uFE0F\u200D\u20E3]/g, "");
}

// ====== ইমোজি ছবি (Twemoji) ======
function emojiCodes(raw) {
	const cps = Array.from(raw).map(c => c.codePointAt(0).toString(16));
	const full = cps.join("-");
	const stripped = cps.filter(c => c !== "fe0f").join("-");
	const hasZwj = cps.includes("200d");
	// Twemoji-র নিয়ম: ZWJ না থাকলে fe0f বাদ যায়
	const list = hasZwj ? [full, stripped] : [stripped, full];
	return Array.from(new Set(list));
}

const imgCache = new Map();   // code -> Image | false
const failedAt = new Map();   // code -> সময় (ব্যর্থ হলে ১ ঘণ্টা আবার চেষ্টা করবে না)
const queued = new Set();
const waiters = new Map();    // code -> [resolve]
const queue = [];
let running = 0;
const MAX_PARALLEL = 6;

function readCached(codes) {
	let Image;
	try { Image = require("canvas").Image; } catch (e) { return null; }
	for (const c of codes) {
		const f = path.join(EMOJI_DIR, c + ".png");
		try {
			if (fs.existsSync(f)) {
				const img = new Image();
				img.src = fs.readFileSync(f);
				return img;
			}
		} catch (e) { }
	}
	return null;
}

function getEmojiImage(raw) {
	const codes = emojiCodes(raw);
	const key = codes[0];
	if (imgCache.has(key)) return imgCache.get(key) || null;
	const img = readCached(codes);
	if (img) { imgCache.set(key, img); return img; }
	const t = failedAt.get(key);
	if (!t || Date.now() - t > 3600000) enqueue(codes);
	return null;
}

function enqueue(codes) {
	const key = codes[0];
	if (queued.has(key)) return;
	queued.add(key);
	queue.push(codes);
	pump();
}

function pump() {
	while (running < MAX_PARALLEL && queue.length) {
		const codes = queue.shift();
		running++;
		downloadEmoji(codes).then(ok => {
			const key = codes[0];
			if (ok) { imgCache.delete(key); failedAt.delete(key); }
			else failedAt.set(key, Date.now());
			queued.delete(key);
			(waiters.get(key) || []).forEach(r => r(ok));
			waiters.delete(key);
		}).catch(() => { }).then(() => { running--; pump(); });
	}
}

async function downloadEmoji(codes) {
	for (const c of codes) {
		for (const tpl of TWEMOJI_URLS) {
			try {
				const r = await axios.get(tpl.replace("{code}", c), { responseType: "arraybuffer", timeout: 15000, maxRedirects: 5 });
				const buf = Buffer.from(r.data);
				if (buf.length > 100 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
					fs.ensureDirSync(EMOJI_DIR);
					fs.writeFileSync(path.join(EMOJI_DIR, codes[0] + ".png"), buf);
					return true;
				}
			}
			catch (e) {
				if (e.response && e.response.status === 404) break; // এই নামে ছবি নেই, পরের নাম
			}
		}
	}
	return false;
}

function waitFor(raw) {
	const codes = emojiCodes(raw);
	const key = codes[0];
	if (readCached(codes)) return Promise.resolve(true);
	return new Promise(resolve => {
		if (!waiters.has(key)) waiters.set(key, []);
		waiters.get(key).push(resolve);
		enqueue(codes);
	});
}

// লেখার ভেতরের সব ইমোজি নামিয়ে (দরকার হলে) অপেক্ষা করে
async function ensureEmojis(texts) {
	const set = new Set();
	texts.forEach(t => splitSegments(String(t)).forEach(s => { if (s.emoji) set.add(s.text); }));
	const res = await Promise.all(Array.from(set).map(e => waitFor(e)));
	return { total: set.size, ok: res.filter(Boolean).length };
}

// সব কমান্ড/ইভেন্ট ফাইল স্ক্যান করে যত ইমোজি আছে বের করে
function scanProjectEmojis() {
	const set = new Set();
	const dirs = [__dirname, path.join(__dirname, "..", "events")];
	for (const d of dirs) {
		let files = [];
		try { files = fs.readdirSync(d).filter(f => f.endsWith(".js")); } catch (e) { continue; }
		for (const f of files) {
			let src = "";
			try { src = fs.readFileSync(path.join(d, f), "utf8"); } catch (e) { continue; }
			if (!EMOJI_TEST.test(src)) continue;
			const re = new RegExp(EMOJI_SRC, "gu");
			let m;
			while ((m = re.exec(src)) !== null) if (isRealEmoji(m[0])) set.add(m[0]);
		}
	}
	return Array.from(set);
}

async function prefetchAll() {
	const all = scanProjectEmojis();
	const missing = all.filter(e => !readCached(emojiCodes(e)));
	const res = await Promise.all(missing.map(e => waitFor(e)));
	return { found: all.length, missing: missing.length, ok: res.filter(Boolean).length };
}

// ====== canvas-এ বসানো ======
function registerBangla() {
	try {
		const canvas = require("canvas");
		if (!info.fontRegistered) {
			const file = fs.existsSync(FONT_FILE) ? FONT_FILE : (fs.existsSync(FALLBACK_FILE) ? FALLBACK_FILE : null);
			if (file) {
				canvas.registerFont(file, { family: FAMILY });
				canvas.registerFont(file, { family: FAMILY, weight: "bold" });
				info.fontRegistered = true;
				info.bnFile = path.basename(file);
			}
		}
		if (!info.emojiRegistered && fs.existsSync(EMOJI_FILE)) {
			canvas.registerFont(EMOJI_FILE, { family: EMOJI_FAMILY });
			info.emojiRegistered = true;
		}
		registerLangFonts(canvas);
	} catch (e) { info.error = e.message; }
	return info.fontRegistered;
}

// assets/font/langs/ ফোল্ডারের প্রতিটা ফন্ট আলাদা নামে রেজিস্টার করে
function registerLangFonts(canvas) {
	let files = [];
	try { files = fs.readdirSync(LANG_DIR).filter(f => /\.(ttf|otf|ttc)$/i.test(f)).sort(); } catch (e) { return; }
	for (const f of files) {
		if (info.langFiles.has(f)) continue;
		const fam = "LF" + f.replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9]/g, "");
		try {
			canvas.registerFont(path.join(LANG_DIR, f), { family: fam });
			canvas.registerFont(path.join(LANG_DIR, f), { family: fam, weight: "bold" });
			info.langFiles.add(f);
			info.langFamilies.push(fam);
		} catch (e) { info.error = f + ": " + e.message; }
	}
}

function scriptFile(sc) {
	const opt = sc[3] || {};
	return path.join(LANG_DIR, `${sc[2]}-Regular.${opt.ext || "ttf"}`);
}

// লেখায় কোন কোন ভাষার অক্ষর আছে দেখে, ফন্ট না থাকলে পেছনে নামিয়ে নেয়
function detectScripts(text) {
	if (/^[\x00-\x7F]*$/.test(text)) return;
	for (const sc of SCRIPTS) {
		const key = sc[0];
		if (!sc[1].test(text)) continue;
		if (key === "bengali" && info.fontRegistered) continue;
		const t = scriptTried.get(key);
		if (t === "done" || (t && Date.now() - t < 3600000)) continue;
		if (fs.existsSync(scriptFile(sc))) { scriptTried.set(key, "done"); continue; }
		scriptTried.set(key, Date.now());
		downloadScript(sc).catch(() => { });
	}
}

async function prefetchLangs() {
	for (const sc of SCRIPTS) {
		if ((sc[3] || {}).lazy) continue;
		if (sc[0] === "bengali" && info.fontRegistered) continue;
		if (fs.existsSync(scriptFile(sc))) { scriptTried.set(sc[0], "done"); continue; }
		await downloadScript(sc);
	}
}

async function downloadScript(sc) {
	const [key, , noto] = sc;
	const opt = sc[3] || {};
	const urls = opt.urls || [
		`${NOTO_BASE}${noto}/hinted/ttf/${noto}-Regular.ttf`,
		`${NOTO_BASE}${noto}/googlefonts/ttf/${noto}-Regular.ttf`
	];
	const r = await download(urls, scriptFile(sc));
	if (r.ok) {
		scriptTried.set(key, "done");
		try { registerLangFonts(require("canvas")); } catch (e) { }
	}
	return r;
}

function fontSize(ctx) {
	const m = /(\d+(?:\.\d+)?)px/.exec(ctx.font || "");
	return m ? parseFloat(m[1]) : 16;
}

const EM_ADV = 1.15; // একটা ইমোজির চওড়া (ফন্ট-সাইজের গুণিতক)

function drawMixed(ctx, orig, origMeasure, text, x, y, maxWidth, stroke) {
	const segs = splitSegments(text);
	const size = fontSize(ctx);
	let total = 0;
	const widths = segs.map(s => {
		const w = s.emoji ? size * EM_ADV : origMeasure.call(ctx, s.text).width;
		total += w;
		return w;
	});
	const align = ctx.textAlign;
	let cx = x;
	if (align === "center") cx = x - total / 2;
	else if (align === "right" || align === "end") cx = x - total;
	const k = (typeof maxWidth === "number" && maxWidth > 0 && total > maxWidth) ? maxWidth / total : 1;

	ctx.save();
	ctx.textAlign = "left";
	let by = y;
	if (k !== 1) { ctx.translate(cx, y); ctx.scale(k, 1); cx = 0; by = 0; }

	let top;
	switch (ctx.textBaseline) {
		case "top": case "hanging": top = by; break;
		case "middle": top = by - size / 2; break;
		case "bottom": case "ideographic": top = by - size; break;
		default: top = by - size * 0.85;
	}

	segs.forEach((s, i) => {
		if (!s.emoji) orig.call(ctx, s.text, cx, by);
		else if (!stroke) {
			const img = getEmojiImage(s.text);
			if (img) { try { ctx.drawImage(img, cx + size * (EM_ADV - 1) / 2, top, size, size); } catch (e) { } }
			else if (info.emojiRegistered) orig.call(ctx, s.text, cx, by);
		}
		cx += widths[i];
	});
	ctx.restore();
}

function applyPatch() {
	try {
		const canvas = require("canvas");
		const proto = canvas.CanvasRenderingContext2D && canvas.CanvasRenderingContext2D.prototype;
		if (!proto) { info.error = "CanvasRenderingContext2D পাওয়া যায়নি"; return false; }
		if (proto.__fontFix) return true;

		const origMeasure = proto.measureText;
		for (const m of ["fillText", "strokeText"]) {
			const orig = proto[m];
			if (typeof orig !== "function") continue;
			const stroke = m === "strokeText";
			proto[m] = function (text, x, y, maxWidth) {
				if (!enabled || typeof text !== "string") return orig.apply(this, arguments);
				detectScripts(text);
				if (!hasEmoji(text)) {
					const clean = splitSegments(text).map(s => s.text).join("");
					return maxWidth === undefined ? orig.call(this, clean, x, y) : orig.call(this, clean, x, y, maxWidth);
				}
				return drawMixed(this, orig, origMeasure, text, x, y, maxWidth, stroke);
			};
			info.patched.push(m);
		}
		if (typeof origMeasure === "function") {
			proto.measureText = function (text) {
				if (!enabled || typeof text !== "string") return origMeasure.apply(this, arguments);
				detectScripts(text);
				const segs = splitSegments(text);
				if (!segs.some(s => s.emoji)) return origMeasure.call(this, segs.map(s => s.text).join(""));
				const size = fontSize(this);
				let total = 0;
				segs.forEach(s => { total += s.emoji ? size * EM_ADV : origMeasure.call(this, s.text).width; });
				return Object.assign(origMeasure.call(this, "M"), { width: total });
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
						for (const fam of info.langFamilies) if (!v.includes(fam)) v = v + ", " + fam;
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

const TEST_LINES = ["🤖 BOT UPTIME ⚡ 🔥", "╭──── 𝗛𝗘𝗟𝗣 ────╮", "বাংলা: আমি বাংলায় গান গাই", "ᴘʀᴇꜰɪx ➤ ~ ✅ ❤️ 👍🏽 🇧🇩 👨‍👩‍👧"];

function testImage() {
	const { createCanvas } = require("canvas");
	const c = createCanvas(900, 360);
	const ctx = c.getContext("2d");
	ctx.fillStyle = "#1e1e2e"; ctx.fillRect(0, 0, 900, 360);
	ctx.fillStyle = "#ffffff"; ctx.font = "bold 36px Arial";
	TEST_LINES.forEach((l, i) => ctx.fillText(l, 30, 70 + i * 70));
	return c.toBuffer("image/png");
}

function cachedCount() {
	try { return fs.readdirSync(EMOJI_DIR).filter(f => f.endsWith(".png")).length; }
	catch (e) { return 0; }
}

module.exports = {
	config: {
		name: "font",
		aliases: ["fixfont", "fontfix"],
		version: "4.0",
		author: "JABED",
		countDown: 3,
		role: 2,
		description: "ছবি আঁকা কমান্ডের লেখায় ইমোজি/বাংলা/ফন্টের সমস্যা নিজে নিজে ঠিক করে",
		category: "owner",
		guide: "   {pn} status: অবস্থা দেখো\n   {pn} on / off: চালু/বন্ধ\n   {pn} fetch: সব কমান্ডের ইমোজি ছবি নামাও\n   {pn} langs [ভাষা]: ভাষার ফন্ট নামাও (arabic hindi thai chinese ...)\n   {pn} download [url]: বাংলা ফন্ট নামাও\n   {pn} test: একটা পরীক্ষার ছবি পাঠাও"
	},

	onLoad: function () {
		loadState();
		registerBangla();
		applyPatch();
		// বাংলা ফন্ট না থাকলে নিজে নামিয়ে বসিয়ে নেয় (রিডিপ্লয়ের পরেও আবার নামবে)
		if (!info.fontRegistered) {
			download(FONT_URLS, FONT_FILE).then(r => { if (r.ok) registerBangla(); }).catch(() => { });
		}
		// পেছনে চুপচাপ সব ইমোজি ছবি নামিয়ে রাখে
		setTimeout(() => { prefetchAll().catch(() => { }); }, 3000);
		// সব ভাষার ফন্টও পেছনে নামিয়ে রাখে (একটা একটা করে, বট ধীর হয় না)
		setTimeout(() => { prefetchLangs().catch(() => { }); }, 10000);
	},

	onStart: async function ({ args, message }) {
		const sub = (args[0] || "status").toLowerCase();

		if (sub === "on" || sub === "off") {
			enabled = sub === "on";
			saveState();
			return message.reply(enabled ? "✅ Font fix চালু।" : "⏸️ Font fix বন্ধ।");
		}

		if (sub === "fetch") {
			await message.reply("⏳ ইমোজি ছবি নামানো হচ্ছে, একটু অপেক্ষা করুন...");
			const r = await prefetchAll();
			return message.reply(`😀 কমান্ডে পাওয়া ইমোজি: ${r.found}\nনতুন নামাতে হয়েছিল: ${r.missing}\nসফল: ${r.ok}\nব্যর্থ: ${r.missing - r.ok}\nমোট জমা ছবি: ${cachedCount()}`);
		}

		if (sub === "langs") {
			const want = args.slice(1).map(x => x.toLowerCase());
			const list = SCRIPTS.filter(sc => want.length ? want.includes(sc[0]) : !(sc[3] || {}).lazy);
			if (!list.length) return message.reply("❓ এই নামের ভাষা নেই। নাম: " + SCRIPTS.map(sc => sc[0]).join(", "));
			const lines = [];
			for (const sc of list) {
				if (fs.existsSync(scriptFile(sc))) { lines.push(`✅ ${sc[0]} (আছে)`); continue; }
				const r = await downloadScript(sc);
				lines.push(r.ok ? `✅ ${sc[0]} (নামানো হলো)` : `❌ ${sc[0]}`);
			}
			return message.reply("🌐 ভাষার ফন্ট:\n" + lines.join("\n") + "\n\nচাইনিজ/জাপানি/কোরিয়ান: font langs chinese japanese korean\nনতুন ফন্ট ঠিকমতো ধরতে দরকার হলে বট একবার রিস্টার্ট দিন।");
		}

		if (sub === "download") {
			const r = await download(args[1] ? [args[1]] : FONT_URLS, FONT_FILE);
			if (r.ok) { info.fontRegistered = false; registerBangla(); applyPatch(); }
			return message.reply((r.ok ? "✅ বাংলা ফন্ট বসেছে (বট রিস্টার্ট দিলে পুরোপুরি কাজ করবে)।\n\n" : "❌ ফন্ট নামানো যায়নি (আগের ফন্ট দিয়েই চলবে)।\n\n") + r.report.join("\n"));
		}

		if (sub === "emoji") {
			const r = await download(args[1] ? [args[1]] : EMOJI_URLS, EMOJI_FILE);
			if (r.ok) { registerBangla(); applyPatch(); }
			return message.reply((r.ok ? "✅ সাদা-কালো ইমোজি ফন্ট বসেছে (ছবি না পেলে এটা কাজে লাগবে)।\n\n" : "❌ ইমোজি ফন্ট নামানো যায়নি।\n\n") + r.report.join("\n"));
		}

		if (sub === "test") {
			try {
				const e = await ensureEmojis(TEST_LINES);
				const s = Readable.from(testImage());
				s.path = "fonttest.png";
				return message.reply({ body: `ইমোজি ছবি: ${e.ok}/${e.total}\nছবিতে বক্স না থাকলে ঠিক আছে।`, attachment: s });
			}
			catch (e) { return message.reply("❌ পরীক্ষার ছবি বানাতে পারিনি: " + e.message); }
		}

		// status
		return message.reply(
			`🔤 Font fix: ${enabled ? "চালু ✅" : "বন্ধ ⏸️"}\n` +
			`বাংলা ফন্ট: ${info.fontRegistered ? info.bnFile + " ✅" : "নেই ❌"}\n` +
			`ভাষার ফন্ট (langs): ${info.langFiles.size} টা\n` +
			`ইমোজি ছবি জমা: ${cachedCount()} টা\n` +
			`নামার অপেক্ষায়: ${queued.size} টা\n` +
			`নামাতে ব্যর্থ: ${failedAt.size} টা\n` +
			`সাদা-কালো ইমোজি ফন্ট: ${info.emojiRegistered ? "আছে ✅" : (fs.existsSync(EMOJI_FILE) ? "আছে, রিস্টার্ট লাগবে" : "নেই (দরকার নেই)")}\n` +
			`বসানো হয়েছে: ${info.patched.length ? info.patched.join(", ") : "কিছুই না ❌"}` +
			(info.error ? `\nএরর: ${info.error}` : "")
		);
	}
};
