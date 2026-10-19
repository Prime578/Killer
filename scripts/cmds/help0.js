const axios = require("axios");
const { getPrefix } = global.utils;
const { commands, aliases } = global.GoatBot;

// ভিডিও লিংক দুইটা এখানে বসাও
const VIDEO_LINKS = [
	"https://files.catbox.moe/zl71oz.mp4",
	"https://files.catbox.moe/yskhac.mp4"
];

// অতিরিক্ত কমান্ডের তালিকা (479 টা). বর্তমান কমান্ডের সাথে নাম মিলে গেলে একটা বাদ যাবে
const EXTRA_COMMANDS = [
	"anihot", "horny", "kanda", "redroom", "segs2", "sex", "sexvid", "uff",
	"xncdi", "xrandom", "clearcache", "mgi", "out", "pending", "setallnick", "setbal",
	"settings", "udi", "hot", "aliya2", "aniart", "flux2max", "gen", "genx",
	"webss", "zombie", "ai", "animate", "art", "dalle", "edit", "flux",
	"gemini", "gpt", "midjourney", "nanobanana", "poli", "prompt", "text2image", "supanime",
	"ai-song", "device", "alya", "animeinfo", "animequote", "anipic", "bankai", "character",
	"goku", "hinata", "manga", "narutovideo", "shikimori", "anisearch", "applemusic", "autodl",
	"bluearchive", "cat", "hentai", "lyricsvideo", "memevid", "shazam", "sing", "song",
	"spotify", "tiktok", "v2a", "waifu", "waifuadult", "tcp", "groupimage", "groupname",
	"activemember", "adduser", "admin", "adminboxonly", "all", "antichangeinfobox", "antiout", "ban",
	"boxinfo", "busy", "callad", "count", "emoji", "filteruser", "gcadmin", "gcinfo",
	"god", "kick", "kickall", "refresh", "rules", "setalias", "setleave", "setname",
	"shortcut", "tag", "theme", "usage", "warn", "hello", "baby", "prefix",
	"terminal", "balancec", "bank", "give", "math", "premium", "set", "task",
	"top", "shiko", "ads", "ball", "berojgar", "bondhu", "bonk", "bou",
	"bro", "bro2", "butslap", "buttslap", "buzz", "chagol", "chipay", "cockroach",
	"condom", "dim", "elephant", "fakechat", "farhan_tx", "fighter", "goru", "goru2",
	"gossip", "gu", "handsome", "hijla", "hitler", "horny2", "jail2", "joke",
	"jolpori", "karaba", "kola", "ledysr", "life", "love", "mia", "mistake",
	"mnm", "murgi2", "murgi3", "mygirl", "nc", "needgf", "nekha", "nigga",
	"notstonk", "patkhet", "pikachu", "pregnant", "premik", "pussy", "rajakar", "relation",
	"sala", "snews", "son", "stonk", "takla", "tokai", "trigger", "tuntun",
	"tv", "usta", "videocall", "voice", "wanted2", "xdi", "xnxx", "xray",
	"alien", "caption", "clown", "cow", "dog2", "donkey", "emojigif", "emojimean",
	"emojimix", "findgay", "fuck", "fuck2", "gay", "gif", "gorib", "hack",
	"hug", "jail", "kicked", "kidnap", "kill", "kiss", "marry", "meme",
	"murgi", "nokia", "pair", "pair2", "pair3", "pickupline", "poke", "propose",
	"punch", "rip", "sanda", "slap", "squeeze", "toilet", "trash", "wanted",
	"actor", "animalgame", "animequiz", "aniqz2", "cartoongame", "casinoslot", "cricketgame", "daily",
	"duck", "fflike", "ffqz2", "football2", "footballgame", "freefire", "megaspin", "narutoquiz",
	"slot", "ttt2", "vslot", "wbquiz", "wordgame", "bet", "casino", "chess",
	"dice", "flaggame", "guess", "guessnumber", "hunt", "islamicquiz", "mathgame", "maze",
	"quiz", "spin", "trade", "truthordare", "ttt", "wheel", "cmdstore", "supportgc",
	"autoreact", "cr", "friendadd", "groupcustomize", "listbox", "pakhi", "4kpro", "arrest",
	"chad", "copuledp2", "dog", "edit2", "fbcover", "fox", "imagefilter", "pinterest",
	"pp", "up5", "xlnub", "countryinfo", "cpanel", "cpanel2", "cpanel3", "numinfo",
	"owner", "setrole", "spy2", "system", "tid", "time", "uptime4", "shishir",
	"islamicvideo", "namaz", "ramadan", "bed", "cdp", "crush", "kiss3", "love2",
	"marry4", "my", "myking", "myqueen", "pair5", "pair6", "pr", "sister",
	"goatstore", "album", "album2", "anicdp", "anime", "anisr", "anisr2", "as",
	"aura", "bike", "boom", "captain", "car", "catvideo", "cdpvip", "convertmp3",
	"cutee", "ffvideo", "flower", "fun", "fun2", "funny", "gan", "girl",
	"girl2", "host", "loco", "lofi", "mbox", "meme2", "music", "natural",
	"neymar", "onlyanimevideo", "onlyanimevideo2", "pair4", "pfp", "pinterestdl", "random", "root",
	"sad", "sing2", "sniper", "solowed", "tik", "tikedit", "tiksr", "tiktokdl",
	"unsplash", "video", "ytb", "momoi", "play", "song2", "autosticker", "fuck you",
	"blowjob", "boobs", "chudi", "comatozze", "fingering", "kissvideo", "segs", "segs3",
	"tormarechudi", "vuda", "rainbow", "backupdata", "botnick", "cmd", "creator", "developer",
	"eval", "event", "givefile", "ignoreonlyad", "ignoreonlyadbox", "install", "jsontomongodb", "loadconfig",
	"mention", "noprefix", "notification", "offbot", "owner2", "raw", "resetuser", "restart",
	"setavt", "setlang", "setrankup", "setwelcome", "shell", "stats", "typingindicator", "update",
	"user", "whitelistthread", "wl", "spiderman", "spycard", "anti18", "customrankcard", "rank",
	"topexp", "haha", "account", "chakrun", "de", "emoji_voice", "fork", "perf",
	"ping", "spam", "system2", "text_voice", "thread", "uptime", "uptime2", "uptime3",
	"fokir", "gopgop", "monkey", "ephoto", "circuit", "4k", "cloudinary", "fakechat2",
	"font", "freeimage", "googleimagesearch", "imgbb", "imgur", "lens", "lyrics", "monitor",
	"rbg", "smsbomber", "ss", "tempmail", "tikinfo", "tinyurl", "unblur", "poop",
	"shahabagi", "murf-tts", "accept", "acpme", "age", "calendar", "catbox", "check",
	"cpanel4", "getlink", "github", "google", "googleimg", "npm", "postreact", "say",
	"spy", "spy3", "sr", "translate", "uid", "unsent", "weather"
];

let xfont = null;
let yfont = null;
let categoryEmoji = null;

async function loadResources() {
	try {
		const [catRes, cmdRes, emojiRes] = await Promise.all([
			axios.get("https://raw.githubusercontent.com/Saim-x69x/sakura/main/xfont.json"),
			axios.get("https://raw.githubusercontent.com/Saim-x69x/sakura/main/yfont.json"),
			axios.get("https://raw.githubusercontent.com/Saim-x69x/sakura/main/category.json")
		]);
		xfont = catRes.data;
		yfont = cmdRes.data;
		categoryEmoji = emojiRes.data;
	} catch (err) {}
}

function fontConvert(text, type = "command") {
	const fontMap = type === "category" ? xfont : yfont;
	if (!fontMap) return text;
	return text.split("").map(ch => fontMap[ch] || ch).join("");
}

function getCategoryEmoji(cat) {
	return categoryEmoji?.[cat.toLowerCase()] || "🗂️";
}

function levenshteinDistance(a, b) {
	const matrix = Array(b.length + 1).fill(0).map(() => Array(a.length + 1).fill(0));
	for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
	for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
	for (let j = 1; j <= b.length; j++) {
		for (let i = 1; i <= a.length; i++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			matrix[j][i] = Math.min(
				matrix[j][i - 1] + 1,
				matrix[j - 1][i] + 1,
				matrix[j - 1][i - 1] + cost
			);
		}
	}
	return matrix[b.length][a.length];
}

function getClosestCommand(name) {
	const lower = name.toLowerCase();
	let best = null, dist = Infinity;
	for (const cmd of commands.keys()) {
		const d = levenshteinDistance(lower, cmd.toLowerCase());
		if (d < dist) {
			dist = d;
			best = cmd;
		}
	}
	return dist <= 3 ? best : null;
}

function roleTextToString(role) {
	switch (role) {
		case 0: return "All Users";
		case 1: return "Group Admins";
		case 2: return "VIP Users";
		case 3: return "Bot Admin";
		case 4: return "Bot Creator";
		default: return "Unknown";
	}
}

let videoIndex = 0; // কোন ভিডিওর পালা (বট রিস্টার্ট হলে প্রথমটা থেকে শুরু)

// প্রতিবার একটা করে ভিডিও, পরের বার অন্যটা (পর্যায়ক্রমে)
async function getVideos() {
	const links = VIDEO_LINKS.filter(u => /^https?:\/\//.test(u));
	if (!links.length) return undefined;

	for (let i = 0; i < links.length; i++) {
		const url = links[(videoIndex + i) % links.length];
		try {
			const stream = await global.utils.getStreamFromURL(url);
			videoIndex = (videoIndex + i + 1) % links.length;
			return [stream];
		} catch (e) {
			console.error("help0 video error:", e.message);
		}
	}
	return undefined;
}

module.exports = {
	config: {
		name: "help0",
		version: "1.0",
		author: "JABED",
		countDown: 5,
		role: 0,
		shortDescription: { en: "Shows all commands or details." },
		longDescription: { en: "Display categories, command lists or specific command info." },
		category: "info",
		guide: { en: "{pn}, {pn} [command], {pn} -c [category]" }
	},

	onStart: async function ({ message, args, event, role }) {
		const prefix = getPrefix(event.threadID);

		if (!xfont || !yfont || !categoryEmoji) await loadResources();

		const categories = {};
		for (const [name, cmd] of commands) {
			if (!cmd?.config || typeof cmd.onStart !== "function") continue;
			if (cmd.config.role > role) continue;
			const cat = (cmd.config.category || "UNCATEGORIZED").toUpperCase();
			if (!categories[cat]) categories[cat] = [];
			categories[cat].push(name);
		}

		// বর্তমান সব কমান্ড + aliases (role ছাড়া) এর সাথে মিলিয়ে ডুপ্লিকেট বাদ
		const liveAll = new Set([...commands.keys(), ...aliases.keys()].map(n => n.toLowerCase()));
		const seenExtra = new Set();
		const extra = EXTRA_COMMANDS.filter(n => {
			const k = n.toLowerCase();
			if (liveAll.has(k) || seenExtra.has(k)) return false;
			seenExtra.add(k);
			return true;
		});
		if (extra.length) categories["MORE"] = extra;

		const input = args.join(" ").trim();

		// ক্যাটাগরি অনুযায়ী লিস্ট: help0 -c <category>
		if (args[0] === "-c" && args[1]) {
			const categoryName = args[1].toUpperCase();
			if (!categories[categoryName]) {
				return message.reply(`❌ Category "${categoryName}" not found.`);
			}

			const emoji = getCategoryEmoji(categoryName);
			const list = categories[categoryName];

			let msg = "";
			msg += "━━━━━━━━━━━━━━\n";
			msg += `𝐂𝐀𝐓𝐄𝐆𝐎𝐑𝐘: ${emoji} | ${fontConvert(categoryName, "category")}\n`;
			msg += "╭──────୨ৎ──────╮\n";
			for (const cmd of list.sort()) {
				msg += `╎ ᯓ✧. ${fontConvert(cmd, "command")}\n`;
			}
			msg += "┕━─────୨ৎ─────━ᥫ᭡\n";
			msg += `• 𝙽𝚎𝚎𝚍 𝚑𝚎𝚕𝚙 𝚠𝚒𝚝𝚑 𝚊 𝚌𝚘𝚖𝚖𝚊𝚗𝚍? 𝚄𝚜𝚎 ${prefix}𝚑𝚎𝚕𝚙𝟶 <𝚌𝚘𝚖𝚖𝚊𝚗𝚍𝚗𝚊𝚖𝚎>.\n`;
			msg += "╭──────୨ৎ──────╮\n";
			msg += `╎ 🔢 𝐓𝐨𝐭𝐚𝐥 𝐂𝐨𝐦𝐦𝐚𝐧𝐝𝐬: ${list.length}\n`;
			msg += `╎ ⚡️ 𝐏𝐫𝐞𝐟𝐢𝐱: ${prefix}\n`;
			msg += "╎ 👤 𝐂𝐫𝐞𝐚𝐭𝐨𝐫: JABED\n";
			msg += "╰──────୨ৎ──────╯";

			return message.reply({ body: msg, attachment: await getVideos() });
		}

		// সব কমান্ড এক লিস্টে, এক মেসেজে: help0
		if (!input) {
			const all = [].concat(...Object.values(categories))
				.sort((a, b) => a.localeCompare(b));
			const total = all.length;

			let head =
				"━━━━━━━━━━━━━━\n" +
				"𝙰𝚟𝚊𝚒𝚕𝚊𝚋𝚕𝚎 𝙲𝚘𝚖𝚖𝚊𝚗𝚍𝚜:\n" +
				"━━━━━━━━━━━━━━\n" +
				"╭──────୨ৎ──────╮\n";

			let list = "";
			for (const cmd of all) {
				list += `╎ᯓ✧. ${fontConvert(cmd, "command")}\n`;
			}

			let footer = "┕━─────୨ৎ─────━ᥫ᭡\n";
			footer += `• 𝙽𝚎𝚎𝚍 𝚑𝚎𝚕𝚙 𝚠𝚒𝚝𝚑 𝚊 𝚌𝚘𝚖𝚖𝚊𝚗𝚍? 𝚄𝚜𝚎 ${prefix}𝚑𝚎𝚕𝚙𝟶 <𝚌𝚘𝚖𝚖𝚊𝚗𝚍𝚗𝚊𝚖𝚎>.\n`;
			footer += "╭──────୨ৎ──────╮\n";
			footer += `╎ 🔢 𝐓𝐨𝐭𝐚𝐥 𝐂𝐨𝐦𝐦𝐚𝐧𝐝𝐬: ${total}\n`;
			footer += `╎ ⚡️ 𝐏𝐫𝐞𝐟𝐢𝐱: ${prefix}\n`;
			footer += "╎ 👤 𝐂𝐫𝐞𝐚𝐭𝐨𝐫: JABED\n";
			footer += "╰──────୨ৎ──────╯";

			const body = head + list + footer;
			const attachment = await getVideos();

			// সাধারণত এক মেসেজেই যাবে; মেসেঞ্জারের লিমিট পার হলে তবেই ভাগ হবে
			const LIMIT = 19000;
			if (body.length <= LIMIT) {
				return message.reply({ body, attachment });
			}

			const lines = list.split("\n");
			const parts = [];
			let cur = head;
			for (const line of lines) {
				if ((cur.length + line.length + footer.length + 2) > LIMIT) {
					parts.push(cur);
					cur = "";
				}
				cur += line + "\n";
			}
			parts.push(cur + footer);

			await message.reply({ body: parts[0], attachment });
			for (let i = 1; i < parts.length; i++) {
				await message.reply(parts[i]);
			}
			return;
		}

		// নির্দিষ্ট কমান্ডের তথ্য: help0 <command>
		const cmdName = input.toLowerCase();
		const cmd = commands.get(cmdName) || commands.get(aliases.get(cmdName));

		if ((!cmd || !cmd.config) && seenExtra.has(cmdName)) {
			return message.reply(`ℹ️ "${cmdName}" শুধু তালিকায় আছে, বটে লোড করা নেই।`);
		}

		if (!cmd || !cmd.config) {
			const suggestion = getClosestCommand(cmdName);
			return message.reply(
				suggestion
					? `❌ Command "${cmdName}" not found.\n👉 Maybe you meant: ${suggestion}`
					: `❌ Command "${cmdName}" not found.`
			);
		}

		const c = cmd.config;
		const guideText = c.guide?.en || (typeof c.guide === "string" ? c.guide : null);
		const usage = guideText ? guideText.replace(/{pn}/g, `${prefix}${c.name}`) : "No usage.";
		const aliasList = Array.isArray(c.aliases) ? c.aliases.join(", ") : (c.aliases || "None");
		const desc = c.longDescription?.en || c.shortDescription?.en
			|| (typeof c.description === "string" ? c.description : "No description.");

		const msg = `
╭═══ [ 𝘊𝘖𝘔𝘔𝘈𝘕𝘋 𝘐𝘕𝘍𝘖 ] ═══╮
╎🧩 Name : ${c.name}
╎📦 Category : ${(c.category || "UNCATEGORIZED").toUpperCase()}
╎📜 Description: ${desc}
╎🔁 Aliases : ${aliasList}
╎⚙️ Version : ${c.version || "1.0"}
╎🔐 Permission : ${c.role} (${roleTextToString(c.role)})
╎⏱️ Cooldown : ${c.countDown || 5}s
╎👑 Author : ${c.author || "Unknown"}
╎📖 Usage : ${usage}
╰═════════୨ৎ═════════╯`;

		return message.reply(msg);
	}
};
