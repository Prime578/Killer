const { createCanvas, loadImage, registerFont } = require("canvas");
const fs = require("fs-extra");
const path = require("path");
const axios = require("axios");

// ---------- settings ----------
const TZ = "Asia/Dhaka"; // timezone used for the default clock
const W = 390; // logical phone width
const S = 3; // render scale (sharper image)
const FONT = '"Noto Sans", "Noto Sans Bengali", "Noto Color Emoji", sans-serif';

try {
	const dir = path.join(__dirname, "assets", "font");
	registerFont(path.join(dir, "NotoSans-Regular.ttf"), { family: "Noto Sans" });
	registerFont(path.join(dir, "NotoSans-Bold.ttf"), { family: "Noto Sans", weight: "bold" });
} catch (e) { /* fall back to system fonts */ }
try {
	const dir = path.join(__dirname, "assets", "font");
	const reg = path.join(dir, "NotoSansBengali-Regular.ttf");
	const bold = path.join(dir, "NotoSansBengali-Bold.ttf");
	if (fs.existsSync(reg)) registerFont(reg, { family: "Noto Sans Bengali" });
	if (fs.existsSync(bold)) registerFont(bold, { family: "Noto Sans Bengali", weight: "bold" });
} catch (e) { /* Bengali will need a system font */ }

const THEMES = {
	dark: { bg: "#000000", text: "#ffffff", sub: "#8a8d91", recv: "#303030", recvText: "#ffffff", quote: "#1f2021", quoteText: "#b0b3b8", input: "#262626", line: "#1c1c1c" },
	light: { bg: "#ffffff", text: "#050505", sub: "#65676b", recv: "#f0f0f0", recvText: "#050505", quote: "#e4e6eb", quoteText: "#65676b", input: "#f0f2f5", line: "#e4e6eb" }
};
const BLUE = "#0a84ff";

// ---------- helpers ----------
function rrc(ctx, x, y, w, h, r) {
	const [tl, tr, br, bl] = r;
	ctx.beginPath();
	ctx.moveTo(x + tl, y);
	ctx.lineTo(x + w - tr, y);
	ctx.arcTo(x + w, y, x + w, y + tr, tr);
	ctx.lineTo(x + w, y + h - br);
	ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
	ctx.lineTo(x + bl, y + h);
	ctx.arcTo(x, y + h, x, y + h - bl, bl);
	ctx.lineTo(x, y + tl);
	ctx.arcTo(x, y, x + tl, y, tl);
	ctx.closePath();
}

function wrap(ctx, text, maxW) {
	const lines = [];
	let line = "";
	for (const word of text.split(/\s+/)) {
		const test = line ? line + " " + word : word;
		if (ctx.measureText(test).width <= maxW) { line = test; continue; }
		if (line) lines.push(line);
		line = "";
		if (ctx.measureText(word).width <= maxW) line = word;
		else {
			let part = "";
			for (const ch of Array.from(word)) {
				if (ctx.measureText(part + ch).width > maxW) { lines.push(part); part = ch; }
				else part += ch;
			}
			line = part;
		}
	}
	if (line) lines.push(line);
	return lines.length ? lines : [""];
}

function fit(ctx, text, maxW) {
	if (ctx.measureText(text).width <= maxW) return text;
	let t = Array.from(text);
	while (t.length > 1 && ctx.measureText(t.join("") + "…").width > maxW) t.pop();
	return t.join("") + "…";
}

function drawAvatar(ctx, img, cx, cy, r, bg) {
	ctx.save();
	ctx.beginPath();
	ctx.arc(cx, cy, r, 0, Math.PI * 2);
	ctx.closePath();
	ctx.clip();
	if (img) ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
	else { ctx.fillStyle = "#8a8d91"; ctx.fillRect(cx - r, cy - r, r * 2, r * 2); }
	ctx.restore();
}

async function loadAvatar(url) {
	try {
		const r = await axios.get(url, { responseType: "arraybuffer", timeout: 8000 });
		return await loadImage(Buffer.from(r.data));
	} catch (e) {
		return null; // gray circle is drawn instead
	}
}

function statusBar(ctx, T, timeText) {
	ctx.textBaseline = "middle";
	ctx.textAlign = "left";
	ctx.fillStyle = T.text;
	ctx.font = `bold 15px ${FONT}`;
	ctx.fillText(timeText, 26, 24);
	// signal bars
	for (let i = 0; i < 4; i++) {
		ctx.fillStyle = T.text;
		rrc(ctx, W - 108 + i * 6, 30 - (4 + i * 2), 4, 4 + i * 2, [1, 1, 1, 1]);
		ctx.fill();
	}
	// wifi
	ctx.strokeStyle = T.text;
	ctx.lineWidth = 2;
	ctx.lineCap = "round";
	for (const r of [10, 6.5, 3]) {
		ctx.beginPath();
		ctx.arc(W - 72, 31, r, Math.PI * 1.25, Math.PI * 1.75);
		ctx.stroke();
	}
	// battery
	ctx.lineWidth = 1;
	ctx.strokeStyle = T.sub;
	rrc(ctx, W - 50, 18, 26, 13, [4, 4, 4, 4]);
	ctx.stroke();
	ctx.fillStyle = T.text;
	rrc(ctx, W - 48, 20, 19, 9, [2.5, 2.5, 2.5, 2.5]);
	ctx.fill();
	ctx.fillStyle = T.sub;
	ctx.fillRect(W - 23, 22.5, 2, 4);
}

function helpText(prefix) {
	const c = prefix + "fakechat";
	return [
		"📱 FAKECHAT - Fake Messenger Chat",
		"━━━━━━━━━━━━━━━━━━",
		"",
		"▫️ ব্যবহার (ট্যাগ):",
		c + " @A @B | হ্যালো | কেমন আছো",
		"",
		"▫️ ব্যবহার (UID):",
		c + " <uid1> <uid2> | হ্যালো | ভালো",
		"",
		"▫️ ব্যবহার (রিপ্লাই): কারও মেসেজে রিপ্লাই দিয়ে",
		c + " | হ্যালো | ভালো",
		"",
		"▫️ অপশন (প্রথম | এর আগে):",
		"-light    → লাইট মোড (ডিফল্ট ডার্ক)",
		"-typing   → টাইপিং বাবল দেখাবে",
		"-time=10:42 → ঘড়ির সময় ঠিক করে দেবে",
		"",
		"▫️ মেসেজ স্টাইল:",
		"3: হাই    → ৩য় ব্যক্তির মেসেজ (গ্রুপ, সর্বোচ্চ ৪ জন)",
		"চমৎকার {❤️} → রিয়্যাকশন যোগ হবে",
		"আসছি >> আসবে? → কোট করা রিপ্লাই",
		"",
		"▫️ উদাহরণ:",
		c + " -light @A @B | হাই | কী খবর {😂} | ভালো >> কেমন আছো?",
		"",
		"ℹ️ ডান পাশে (নীল) থাকে ২য় ব্যক্তি, মানে \"আপনি\"।",
		"ℹ️ সর্বোচ্চ ২০টা মেসেজ, প্রতিটা ৩০০ অক্ষর।"
	].join("\n");
}

module.exports = {
	config: {
		name: "fakechat",
		aliases: ["fkmsg", "fkchat"],
		version: "2.4",
		author: "JABED",
		countDown: 10,
		role: 0,
		description: { en: "Realistic Messenger-style fake chat screenshot (for fun)" },
		category: "fun",
		guide: {
			en: "{pn} help   (full guide)\n{pn} @user1 @user2 | hello | hi | how are you"
				+ "\n{pn} <uid1> <uid2> | hello | hi   (or reply to someone's message: {pn} | hello | hi)"
				+ "\n\nOptions (before the first |): -light  -typing  -time=10:42"
				+ "\nPer message:"
				+ "\n  3: text          send as 3rd person (group chat, up to 4 people)"
				+ "\n  text {❤️}        add a reaction"
				+ "\n  text >> quote    reply to a quoted message"
				+ "\nUser 2 is the 'you' on the right side."
		}
	},

	onStart: async function (payload) {
		try {
			return await module.exports._run(payload);
		} catch (e) {
			console.error("[fakechat]", e);
			const where = String((e && e.stack) || "").split("\n").slice(1, 3).map(l => l.trim()).join("\n");
			return payload.message.reply("❌ fakechat এরর: " + (e && e.message ? e.message : e) + (where ? "\n" + where : ""));
		}
	},

	_run: async function ({ message, event, args, usersData }) {
		const prefix = global.utils && global.utils.getPrefix ? global.utils.getPrefix(event.threadID) : "";
		if (!args.length || ["help", "-h", "--help"].includes(args[0].toLowerCase()))
			return message.reply(helpText(prefix));

		const parts = args.join(" ").split("|").map(s => s.trim());
		let head = parts.shift() || "";
		const raws = parts.filter(Boolean).slice(0, 20);

		// options
		const T = /(?:^|\s)-light\b/i.test(head) ? THEMES.light : THEMES.dark;
		const typing = /(?:^|\s)-typing\b/i.test(head);
		const tm = head.match(/(?:^|\s)-time=(\d{1,2}):(\d{2})/i);
		head = head.replace(/(?:^|\s)-(light|dark|typing)\b/gi, " ").replace(/(?:^|\s)-time=\S+/i, " ");

		// people: replied user, tags, typed UIDs
		const found = [];
		if (event.messageReply) found.push(event.messageReply.senderID);
		found.push(...Object.keys(event.mentions || {}));
		found.push(...(head.match(/\b\d{8,}\b/g) || []));
		const ids = [...new Set(found)].slice(0, 4);

		if (!ids.length || !raws.length)
			return message.reply("⚠️ ট্যাগ/UID/রিপ্লাই এবং অন্তত একটা মেসেজ দিন।\n" + prefix + "fakechat help লিখে নিয়ম দেখুন।");
		if (ids.length === 1) ids.push(event.senderID);

		const people = [];
		for (const id of ids) {
			let name = null, img = null;
			try {
				if (usersData.refreshInfo && !(await usersData.getName(id)))
					await usersData.refreshInfo(id);
			} catch (e) { }
			try { name = await usersData.getName(id); } catch (e) { }
			try { img = await loadAvatar(await usersData.getAvatarUrl(id)); } catch (e) { }
			people.push({ id, name: String(name || "Facebook User"), img });
		}

		// clock
		let clock;
		if (tm && +tm[1] <= 23 && +tm[2] <= 59) {
			const h = +tm[1];
			clock = `${((h + 11) % 12) + 1}:${tm[2]} ${h >= 12 ? "PM" : "AM"}`;
		} else {
			clock = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ });
		}
		const statusTime = clock.replace(/\s?[AP]M/i, "");

		// parse messages
		let prev = null;
		const msgs = raws.map(raw => {
			let t = raw.slice(0, 300);
			let s;
			const pm = t.match(/^(\d):\s*/);
			if (pm && +pm[1] >= 1 && +pm[1] <= people.length) { s = +pm[1] - 1; t = t.slice(pm[0].length); }
			else s = prev === 0 ? 1 : 0;
			let reaction = null, quote = null;
			const rm = t.match(/\{([^{}]{1,8})\}\s*$/);
			if (rm) { reaction = rm[1]; t = t.slice(0, rm.index).trim(); }
			const qi = t.indexOf(">>");
			if (qi > 0) { quote = t.slice(qi + 2).trim() || null; t = t.slice(0, qi).trim(); }
			prev = s;
			return { s, text: t || "…", reaction, quote };
		});

		// measure
		const mc = createCanvas(10, 10).getContext("2d");
		const group = people.length >= 3;
		msgs.forEach((m, i) => {
			mc.font = `16px ${FONT}`;
			m.mine = m.s === 1;
			m.first = i === 0 || msgs[i - 1].s !== m.s;
			m.last = i === msgs.length - 1 || msgs[i + 1].s !== m.s;
			m.lines = wrap(mc, m.text, 250);
			m.w = Math.max(40, Math.ceil(Math.max(...m.lines.map(l => mc.measureText(l).width))) + 24);
			m.h = m.lines.length * 21 + 14;
			m.showName = group && !m.mine && m.first;
			if (m.quote) {
				mc.font = `13px ${FONT}`;
				m.q = fit(mc, m.quote, 230);
				m.qw = Math.ceil(mc.measureText(m.q).width) + 24;
			}
			m.block = (m.showName ? 14 : 0) + (m.quote ? 32 : 0) + m.h + (m.reaction ? 8 : 0) + (m.last ? 10 : 2);
		});

		const lastMine = msgs[msgs.length - 1].mine;
		let contentEnd = 144 + msgs.reduce((a, m) => a + m.block, 0) + (lastMine ? 20 : 0) + (typing ? 44 : 0);
		const phoneH = Math.max(contentEnd + 8, 470) + 76;
		const H = phoneH + 18;

		// draw
		const canvas = createCanvas(W * S, H * S);
		const ctx = canvas.getContext("2d");
		ctx.scale(S, S);
		ctx.fillStyle = T.bg;
		ctx.fillRect(0, 0, W, H);
		ctx.textBaseline = "middle";

		statusBar(ctx, T, statusTime);

		// header
		ctx.strokeStyle = BLUE;
		ctx.lineWidth = 2.5;
		ctx.lineCap = "round";
		ctx.lineJoin = "round";
		ctx.beginPath();
		ctx.moveTo(22, 66); ctx.lineTo(14, 76); ctx.lineTo(22, 86);
		ctx.stroke();
		drawAvatar(ctx, people[0].img, 52, 76, 19);
		ctx.fillStyle = T.bg; ctx.beginPath(); ctx.arc(66, 90, 7, 0, Math.PI * 2); ctx.fill();
		ctx.fillStyle = "#31a24c"; ctx.beginPath(); ctx.arc(66, 90, 5, 0, Math.PI * 2); ctx.fill();
		const title = group ? people.map(p => p.name.split(" ")[0]).join(", ") : people[0].name;
		ctx.textAlign = "left";
		ctx.fillStyle = T.text;
		ctx.font = `bold 16px ${FONT}`;
		ctx.fillText(fit(ctx, title, 190), 80, 69);
		ctx.fillStyle = T.sub;
		ctx.font = `12px ${FONT}`;
		ctx.fillText(group ? `${people.length} members` : "Active now", 80, 87);
		// video + info icons
		ctx.fillStyle = BLUE;
		rrc(ctx, W - 76, 69, 17, 14, [3, 3, 3, 3]); ctx.fill();
		ctx.beginPath(); ctx.moveTo(W - 56, 76); ctx.lineTo(W - 48, 70); ctx.lineTo(W - 48, 82); ctx.closePath(); ctx.fill();
		ctx.beginPath(); ctx.arc(W - 22, 76, 10, 0, Math.PI * 2); ctx.fill();
		ctx.fillStyle = T.bg; ctx.textAlign = "center"; ctx.font = `bold 13px ${FONT}`;
		ctx.fillText("i", W - 22, 76.5);
		ctx.fillStyle = T.line; ctx.fillRect(0, 107, W, 1);

		// date label
		ctx.textAlign = "center";
		ctx.fillStyle = T.sub;
		ctx.font = `12px ${FONT}`;
		ctx.fillText(`Today ${clock}`, W / 2, 126);

		// bubbles
		const grad = ctx.createLinearGradient(0, 108, 0, phoneH - 76);
		grad.addColorStop(0, "#c04bff");
		grad.addColorStop(1, "#0a7cff");
		let y = 144;
		for (const m of msgs) {
			let by = y;
			const x = m.mine ? W - 12 - m.w : 48;
			if (m.showName) {
				ctx.textAlign = "left"; ctx.fillStyle = T.sub; ctx.font = `11px ${FONT}`;
				ctx.fillText(people[m.s].name, x + 12, by + 7);
				by += 14;
			}
			if (m.quote) {
				ctx.font = `11px ${FONT}`; ctx.fillStyle = T.sub;
				ctx.textAlign = m.mine ? "right" : "left";
				ctx.fillText("Replied", m.mine ? W - 16 : 52, by + 7);
				by += 14;
				const qx = m.mine ? W - 12 - m.qw : 48;
				ctx.fillStyle = T.quote;
				rrc(ctx, qx, by, m.qw, 26, [13, 13, 13, 13]); ctx.fill();
				ctx.textAlign = "left"; ctx.fillStyle = T.quoteText; ctx.font = `13px ${FONT}`;
				ctx.fillText(m.q, qx + 12, by + 13);
				by += 18;
			}
			const radii = m.mine
				? [18, m.first ? 18 : 4, m.last ? 18 : 4, 18]
				: [m.first ? 18 : 4, 18, 18, m.last ? 18 : 4];
			ctx.fillStyle = m.mine ? grad : T.recv;
			rrc(ctx, x, by, m.w, m.h, radii); ctx.fill();
			ctx.fillStyle = m.mine ? "#ffffff" : T.recvText;
			ctx.font = `16px ${FONT}`; ctx.textAlign = "left";
			m.lines.forEach((l, i) => ctx.fillText(l, x + 12, by + 7 + i * 21 + 10.5));
			if (!m.mine && m.last) drawAvatar(ctx, people[m.s].img, 26, by + m.h - 14, 14);
			if (m.reaction) {
				const rx = m.mine ? x + 6 : x + m.w - 6, ry = by + m.h;
				ctx.fillStyle = T.bg; ctx.beginPath(); ctx.arc(rx, ry, 12, 0, Math.PI * 2); ctx.fill();
				ctx.fillStyle = T.recv; ctx.beginPath(); ctx.arc(rx, ry, 10, 0, Math.PI * 2); ctx.fill();
				ctx.textAlign = "center"; ctx.font = `12px ${FONT}`; ctx.fillStyle = T.text;
				ctx.fillText(m.reaction, rx, ry + 0.5);
			}
			y += m.block;
		}
		if (lastMine) { drawAvatar(ctx, people[0].img, W - 19, y + 2, 7); y += 20; }
		if (typing) {
			ctx.fillStyle = T.recv;
			rrc(ctx, 48, y, 58, 36, [18, 18, 18, 4]); ctx.fill();
			drawAvatar(ctx, people[0].img, 26, y + 22, 14);
			[0.9, 0.6, 0.35].forEach((a, i) => {
				ctx.globalAlpha = a; ctx.fillStyle = T.sub;
				ctx.beginPath(); ctx.arc(64 + i * 13, y + 18, 3.5, 0, Math.PI * 2); ctx.fill();
			});
			ctx.globalAlpha = 1;
		}

		// input bar
		const barTop = phoneH - 76, cy = barTop + 30;
		ctx.fillStyle = BLUE; ctx.beginPath(); ctx.arc(26, cy, 14, 0, Math.PI * 2); ctx.fill();
		ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.font = `bold 20px ${FONT}`;
		ctx.fillText("+", 26, cy + 0.5);
		ctx.fillStyle = T.input;
		rrc(ctx, 50, cy - 19, W - 50 - 52, 38, [19, 19, 19, 19]); ctx.fill();
		ctx.textAlign = "left"; ctx.fillStyle = T.sub; ctx.font = `15px ${FONT}`;
		ctx.fillText("Aa", 66, cy + 0.5);
		ctx.textAlign = "center"; ctx.font = `22px ${FONT}`; ctx.fillStyle = T.text;
		ctx.fillText("👍", W - 28, cy + 1);
		ctx.fillStyle = T.text;
		rrc(ctx, W / 2 - 67, phoneH - 14, 134, 5, [2.5, 2.5, 2.5, 2.5]); ctx.fill();

		// honest watermark
		ctx.fillStyle = T.sub; ctx.font = `9px ${FONT}`; ctx.textAlign = "center";
		ctx.fillText("Fake chat - made for fun", W / 2, phoneH + 9);

		const dir = path.join(__dirname, "tmp");
		fs.ensureDirSync(dir);
		const file = path.join(dir, `fakechat_${Date.now()}.png`);
		fs.writeFileSync(file, canvas.toBuffer("image/png"));

		return message.reply(
			{ attachment: fs.createReadStream(file) },
			() => fs.unlink(file, () => { })
		);
	}
};
				
