const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const yts = require("yt-search");

const MAX_SIZE = 25 * 1024 * 1024;

// ✅ আপনার বটে যে API কাজ করে (sing2.js, music.js, videos.js এটাই ব্যবহার করে)
async function baseApiUrl() {
    const base = await axios.get(
        "https://raw.githubusercontent.com/mahmudx7/HINATA/main/baseApiUrl.json",
        { timeout: 10000 }
    );
    return base.data.mahmud;
}

module.exports.config = {
    name: "zmp3",
    version: "2.1.0",
    author: "Khánh Milo (Goat V2 port)",
    countDown: 5,
    role: 0,
    description: "গানের নাম দিয়ে YouTube থেকে MP3 ডাউনলোড",
    category: "media",
    guide: {
        en: "{pn} <গানের নাম>"
    }
};

// ==================== ON START ====================
module.exports.onStart = async function ({ api, event, args, message }) {
    const { threadID, messageID, senderID } = event;
    const query = args.join(" ").trim();

    if (!query) {
        return message.reply("⚠️ গানের নাম লিখুন!\nযেমন: zmp3 let me down");
    }

    api.setMessageReaction("⏳", messageID, () => {}, true);

    try {
        const searchRes = await yts(query);
        const videos = (searchRes.videos || []).slice(0, 10);

        if (!videos.length) {
            api.setMessageReaction("❌", messageID, () => {}, true);
            return message.reply(`❌ "${query}" এর কোনো ফলাফল নেই।`);
        }

        let msg = `🔊 "${query}" এর ফলাফল:\n\n`;
        videos.forEach((v, i) => {
            msg += `${i + 1}. 🎵 ${v.title}\n🎤 ${v.author.name}\n⏱️ ${v.timestamp}\n◆━━━━━━━━━◆\n`;
        });
        msg += `\n➡️ যেকোনো একটি নাম্বার reply করুন (1-${videos.length})`;

        api.setMessageReaction("✅", messageID, () => {}, true);

        return message.reply(msg, (err, info) => {
            if (err) return console.error("[zmp3] send error:", err);
            global.GoatBot.onReply.set(info.messageID, {
                commandName: module.exports.config.name,
                messageID: info.messageID,
                author: senderID,
                videos
            });
        }, messageID);

    } catch (e) {
        console.error("[zmp3] search error:", e.message);
        api.setMessageReaction("❌", messageID, () => {}, true);
        return message.reply(`❌ সার্চে সমস্যা: ${e.message}`);
    }
};

// ==================== ON REPLY ====================
module.exports.onReply = async function ({ api, event, message, Reply }) {
    const { threadID, messageID, senderID, body } = event;

    if (!Reply || Reply.author !== senderID) return;

    const index = parseInt((body || "").trim()) - 1;
    if (isNaN(index) || index < 0 || index >= Reply.videos.length) {
        api.setMessageReaction("❌", messageID, () => {}, true);
        return message.reply(`⚠️ 1 থেকে ${Reply.videos.length} এর মধ্যে নাম্বার দিন।`);
    }

    api.setMessageReaction("⏳", messageID, () => {}, true);

    // লিস্ট মেসেজ ডিলিট
    try { api.unsendMessage(Reply.messageID); } catch (e) {}
    global.GoatBot.onReply.delete(Reply.messageID);

    const video = Reply.videos[index];
    const cacheDir = path.join(__dirname, "cache");
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    const filePath = path.join(cacheDir, `zmp3_${Date.now()}.mp3`);

    let procMsgID = null;
    api.sendMessage(`⏳ "${video.title}" ডাউনলোড হচ্ছে...`, threadID, (err, info) => {
        if (!err && info) procMsgID = info.messageID;
    });

    try {
        // ✅ Mahmud API দিয়ে অডিও URL নিন
        const apiUrl = `${await baseApiUrl()}/api/sing?search=${encodeURIComponent(video.title)}&type=audio`;
        console.log("[zmp3] Fetching:", apiUrl);

        const res = await axios.get(apiUrl, {
            responseType: "stream",
            timeout: 90000,
            headers: { "User-Agent": "Mozilla/5.0" }
        });

        // Content-type চেক
        const ctype = String(res.headers["content-type"] || "").toLowerCase();
        if (ctype.includes("json") || ctype.includes("text/html")) {
            throw new Error("API returned error (not audio)");
        }

        const writer = fs.createWriteStream(filePath);
        res.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on("finish", resolve);
            writer.on("error", reject);
            res.data.on("error", reject);
        });

        const size = fs.statSync(filePath).size;
        if (size < 5000) {
            fs.unlinkSync(filePath);
            throw new Error("Downloaded file is empty");
        }

        if (size > MAX_SIZE) {
            fs.unlinkSync(filePath);
            if (procMsgID) try { api.unsendMessage(procMsgID); } catch(e){}
            api.setMessageReaction("❌", messageID, () => {}, true);
            return message.reply("❌ ফাইল ২৫MB এর বেশি, পাঠানো যাবে না।");
        }

        if (procMsgID) try { api.unsendMessage(procMsgID); } catch(e){}
        api.setMessageReaction("✅", messageID, () => {}, true);

        return message.reply({
            body: `🎧 ${video.title}\n🎤 ${video.author.name}`,
            attachment: fs.createReadStream(filePath)
        }, () => {
            try { fs.unlinkSync(filePath); } catch (e) {}
        });

    } catch (e) {
        console.error("[zmp3] download error:", e.message);
        if (fs.existsSync(filePath)) try { fs.unlinkSync(filePath); } catch(e){}
        if (procMsgID) try { api.unsendMessage(procMsgID); } catch(e){}
        api.setMessageReaction("❌", messageID, () => {}, true);
        return message.reply(`❌ ডাউনলোড ব্যর্থ: ${e.message}`);
    }
};
