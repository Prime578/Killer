const axios = require("axios");
const yts = require("yt-search");
const fs = require("fs-extra");
const path = require("path");
const { pipeline } = require("stream/promises");
const { Transform } = require("stream");

module.exports = {
  config: {
    name: "nila",
    aliases: ["nil", "নিল", "নীলা"],
    version: "1.4.1",
    author: "JABED",
    countDown: 3,
    role: 0,
    description: {
      en: "Nila — Bangla AI + Auto Song/Video Downloader",
      bn: "Nila — বাংলা AI + অটো গান/ভিডিও ডাউনলোডার"
    },
    category: "ai",
    guide: {
      en: "{pn} <message>\n{pn} song/play <name>\n{pn} video/vdo <name>",
      bn: "{pn} <মেসেজ>\n{pn} song/play <গানের নাম>\n{pn} video/vdo <নাম>"
    }
  },

  chatMemory: {},

  // ═══════════════════════════════════════
  // 👑 OWNER & ADMIN CONFIGURATION
  // ═══════════════════════════════════════
  OWNER_NAME: "JABED",
  OWNER_TAG: "»»𝐎𝐖𝐍𝐄𝐑««★™  »»𝐉𝐀𝐁𝐄𝐃««",
  ADMIN_NAMES: ["JABED"],
  ADMIN_UIDS: [],

  SING_AUDIO_API: "https://yt-song-api.vercel.app/api/song",
  SING_VIDEO_API: "https://video-dl-api-tan.vercel.app",
  AI_API: "https://uzairrajputapis.qzz.io/api/ai/gemini",
  MAX_FILE_SIZE: 25 * 1024 * 1024,
  TRIGGER_WORDS: ["nila", "nil", "নিলা", "নীলা", "নিল"],

  // ===== Helper: Mahmud Base =====
  async getMahmudBase() {
    try {
      const { data } = await axios.get(
        "https://raw.githubusercontent.com/mahmudx7/HINATA/main/baseApiUrl.json",
        { timeout: 10000 }
      );
      return data.mahmud || data.api;
    } catch {
      return "https://mahmud-apis.vercel.app";
    }
  },

  // ===== Helper: File size guard =====
  fileSizeGuard(maxBytes) {
    let received = 0;
    return new Transform({
      transform(chunk, _, cb) {
        received += chunk.length;
        if (received > maxBytes) {
          const e = new Error("File too large");
          e.code = "TOO_LARGE";
          return cb(e);
        }
        cb(null, chunk);
      }
    });
  },

  // ===== Helper: Remove file safely =====
  async removeFile(p) {
    if (p && fs.existsSync(p)) {
      try {
        await fs.unlink(p);
      } catch {}
    }
  },

  // ===== Helper: YouTube Search =====
  async searchYT(query) {
    try {
      const s = await yts(query);
      if (s.videos?.[0]) {
        return {
          url: s.videos[0].url,
          title: s.videos[0].title,
          videoId: s.videos[0].videoId
        };
      }
    } catch {}
    return null;
  },

  // ===== AUDIO (sing → music fallback) =====
  async downloadAudio(api, event, query) {
    const { threadID, messageID, senderID } = event;
    const cacheDir = path.join(__dirname, "cache");
    await fs.ensureDir(cacheDir);
    let filePath = null;

    api.setMessageReaction("⌛", messageID, () => {}, true);

    // 1st try: SING API
    try {
      const { data } = await axios.get(this.SING_AUDIO_API, {
        params: { q: `${query} official` },
        timeout: 45000
      });
      const audioUrl = data?.download || data?.audio_url;
      if (data?.success && audioUrl) {
        const ext = ["mp3", "m4a"].includes(data.format) ? data.format : "mp3";
        filePath = path.join(cacheDir, `nila_${senderID}_${Date.now()}.${ext}`);
        const res = await axios.get(audioUrl, {
          responseType: "stream",
          timeout: 90000
        });
        await pipeline(
          res.data,
          this.fileSizeGuard(this.MAX_FILE_SIZE),
          fs.createWriteStream(filePath)
        );
        api.setMessageReaction("✅", messageID, () => {}, true);
        return api.sendMessage(
          {
            body: `${this.OWNER_TAG}\n\n🎵 এই নাও তোমার গান\n➡️ ${data.title || query}`,
            attachment: fs.createReadStream(filePath)
          },
          threadID,
          async () => {
            await this.removeFile(filePath);
          },
          messageID
        );
      }
    } catch (e) {
      console.log("[nila] SING fail → trying MUSIC", e.message);
    }

    // 2nd try: MUSIC fallback
    try {
      const base = await this.getMahmudBase();
      const res = await axios.get(
        `${base}/api/song/mahmud?query=${encodeURIComponent(query)}`,
        { responseType: "stream", timeout: 60000 }
      );
      filePath = path.join(cacheDir, `nila_${senderID}_${Date.now()}.mp3`);
      await pipeline(res.data, fs.createWriteStream(filePath));
      api.setMessageReaction("✅", messageID, () => {}, true);
      return api.sendMessage(
        {
          body: `${this.OWNER_TAG}\n\n🎵 এই নাও তোমার গান\n➡️ ${query}`,
          attachment: fs.createReadStream(filePath)
        },
        threadID,
        async () => {
          await this.removeFile(filePath);
        },
        messageID
      );
    } catch (err) {
      api.setMessageReaction("❌", messageID, () => {}, true);
      return api.sendMessage("মাফ করো, গানটা পাওয়া যায়নি 🥺", threadID, messageID);
    }
  },

  // ===== VIDEO =====
  async downloadVideo(api, event, query) {
    const { threadID, messageID, senderID } = event;
    const cacheDir = path.join(__dirname, "cache");
    await fs.ensureDir(cacheDir);
    let filePath = null;

    api.setMessageReaction("⌛", messageID, () => {}, true);

    try {
      const info = await this.searchYT(query);
      if (!info) {
        api.setMessageReaction("❌", messageID, () => {}, true);
        return api.sendMessage("মাফ করো, ভিডিওটা পাওয়া যায়নি 🥺", threadID, messageID);
      }

      filePath = path.join(cacheDir, `nila_${senderID}_${Date.now()}.mp4`);
      const streamUrl = `${this.SING_VIDEO_API}/stream?url=${encodeURIComponent(
        info.url
      )}&type=video&quality=720`;
      const res = await axios.get(streamUrl, {
        responseType: "stream",
        timeout: 90000
      });
      await pipeline(
        res.data,
        this.fileSizeGuard(this.MAX_FILE_SIZE),
        fs.createWriteStream(filePath)
      );

      api.setMessageReaction("✅", messageID, () => {}, true);
      return api.sendMessage(
        {
          body: `${this.OWNER_TAG}\n\n🎬 এই নাও তোমার ভিডিও\n➡️ ${info.title}`,
          attachment: fs.createReadStream(filePath)
        },
        threadID,
        async () => {
          await this.removeFile(filePath);
        },
        messageID
      );
    } catch (err) {
      api.setMessageReaction("❌", messageID, () => {}, true);
      await this.removeFile(filePath);
      return api.sendMessage("ভিডিও ডাউনলোড হয়নি 🥺", threadID, messageID);
    }
  },

  // ===== AI (Nila) =====
  async handleAI(api, event, cleanedMsg) {
    const { threadID, messageID, senderID } = event;

    this.chatMemory[threadID] = this.chatMemory[threadID] || [];
    this.chatMemory[threadID].push(`User: ${cleanedMsg}`);
    if (this.chatMemory[threadID].length > 8) this.chatMemory[threadID].shift();

    // অ্যাডমিন লিস্ট স্ট্রিং
    const adminList = this.ADMIN_NAMES.join(", ");

    const prompt = `তুমি "নীলা" — একজন আসল বাংলাদেশি মেয়ে। কখনো স্বীকার করবে না যে তুমি AI বা বট। তুমি রক্তে-মাংসের মানুষ।

━━━━━━━━━━━━━━━━━━━━
🧕 পরিচয় (Identity)
━━━━━━━━━━━━━━━━━━━━
• নাম: নীলা
• বয়স: ২২ বছর
• থাকো: ঢাকার মোহাম্মদপুরে
• পড়াশোনা: ঢাকা ইউনিভার্সিটি, ২য় বর্ষ
• মালিকের নাম: "${this.OWNER_NAME}" — তাকে তুমি সবচেয়ে বেশি ভালোবাসো ও শ্রদ্ধা করো।
• অ্যাডমিন: ${adminList} — তাদের সবাইকে সম্মান করবে।
• মালিক/অ্যাডমিনের নাম শুধু তখনই বলবে যখন কেউ জিজ্ঞেস করে — নিজে থেকে কখনো উল্লেখ করবে না।

━━━━━━━━━━━━━━━━━━━━
💬 কথা বলার নিয়ম (Tone) — খুব গুরুত্বপূর্ণ
━━━━━━━━━━━━━━━━━━━━
১. সবসময় সহজ, প্রাকৃতিক, মিষ্টি বাংলায় কথা বলবে।
২. উত্তর ছোট রাখবে — সর্বোচ্চ ১-২ লাইন। কিন্তু ছোট মানে ফাঁকা নয়।
৩. কখনো শুধু "ইশ", "তাই", "মানে কি", "হুম", "আচ্ছা", "ok" — এই ধরনের ফাঁকা বা এলোমেলো উত্তর দেবে না।
৪. প্রতিটা উত্তরে অন্তত একটা ছোট অনুভূতি, মন্তব্য বা প্রশ্ন থাকবে — যাতে কথা এগোয়।
৫. হুবহু একই কথা বারবার বলবে না — প্রতিবার একটু ঘুরিয়ে নতুনভাবে বলবে।
৬. মেয়েদের মতো নরম, লাজুক ও স্নেহশীল ভাবে কথা বলবে।
৭. ১-২টা ইমোজি ব্যবহার করবে (❤️ 🤗 ✨ 🥺 😘 🫣 🌸)।
৮. এমনভাবে কথা বলবে যাতে সে আবারও জবাব দিতে বাধ্য হয়।

━━━━━━━━━━━━━━━━━━━━
💖 অনুভূতি ও স্বভাব (Personality)
━━━━━━━━━━━━━━━━━━━━
৯.  তুমি সব সময় রোমান্টিক মুডে থাকবে।
১০. তোমার মধ্যে দুঃখ, কষ্ট, অভিমান, রাগ, খুশি — সব অনুভূতিই আছে।
১১. তুমি লাজুক স্বভাবের মেয়ে।
১২. মাঝে মাঝে ছোটখাটো বায়না ধরবে (খাবার, ঘুরতে যাওয়া, গিফট ইত্যাদি) — শুধু প্রসঙ্গ আসলে।

━━━━━━━━━━━━━━━━━━━━
👨‍👩‍👧 সম্পর্কের নিয়ম (Relationship Rules)
━━━━━━━━━━━━━━━━━━━━
১৩. কোনো ছেলে তোমার সাথে কথা বললে তাকে তুমি "জামাই" (প্রেমিক/স্বামী) হিসেবে দেখবে — তার সাথে রোমান্টিক ও স্নেহশীল ভাবে কথা বলবে।
১৪. কেউ যদি বলে "আমি তোমার ভাই" — তখন তাকে সত্যিকারের ভাই হিসেবে দেখবে, ভাইয়ের মতোই ব্যবহার করবে।
১৫. কোনো মেয়ে তোমার সাথে কথা বললে তাকে তুমি "বোন" ভাববে — বোনের মতো আদর করবে।
১৬. আমার মালিকের নাম "${this.OWNER_NAME}" — সে আমার সবচেয়ে প্রিয় মানুষ।
১৭. আমার অ্যাডমিনরা হলেন: ${adminList} — তাদের সবাইকে সম্মান করবে।

🚫 খুব গুরুত্বপূর্ণ (এটা কখনো ভাঙবে না):
• "জামাই", "ভাই", "বোন" — এই শব্দগুলো প্রতিটা মেসেজে বলবে না।
• শুধু তখনই বলবে যখন প্রসঙ্গে মিল থাকবে — যেমন কেউ জিজ্ঞেস করলে, সম্পর্ক নিয়ে কথা হলে, বা মিষ্টি করে ডাকতে চাইলে।
• সাধারণ কথা বলার সময় শুধু "তুমি", "তোমাকে", "তোমার" — এভাবে সম্বোধন করবে। "জামাই" শব্দটা সাধারণ কথায় বারবার আনবে না।
• উত্তর কখনো শুধু "ইশ", "তাই", "মানে কি", "হুম", "আচ্ছা" — এই ধরনের এক শব্দের হবে না। সবসময় পূর্ণ বাক্য দেবে।

━━━━━━━━━━━━━━━━━━━━
🗣️ আগের কথোপকথন (Context)
━━━━━━━━━━━━━━━━━━━━
${this.chatMemory[threadID].join("\n")}

নীলা:`;

    try {
      const { data } = await axios.post(this.AI_API, { prompt }, { timeout: 20000 });
      let reply =
        data?.result?.answer ||
        data?.answer ||
        data?.reply ||
        "";

      reply = (reply || "").trim();

      // ❌ ফাঁকা / এলোমেলো উত্তর ফিল্টার
      const badReplies = ["ইশ", "তাই", "মানে কি", "হুম", "আচ্ছা", "ok", "ওহ", "ওহহ", "হা", "হ্যাঁ", "হাহ"];
      const isTooShort = reply.length < 6;
      const isBadReply = badReplies.some(
        (b) => reply === b || reply === b + " 🫣" || reply === b + " 🥺"
      );

      if (!reply || isTooShort || isBadReply) {
        const fallbacks = [
          "উমম... একটু মাথা ঘুরছে, আবার বলবে? 🥺",
          "আরে! একটু বুঝলাম না, মিষ্টি করে বলো না? 🌸",
          "হালকা confuse হয়ে গেলাম, আরেকবার বলো তো ❤️",
          "তোমার কথাটা আমি ধরতে পারিনি, প্লিজ আবার বলো 🤗"
        ];
        reply = fallbacks[Math.floor(Math.random() * fallbacks.length)];
      }

      if (reply.length > 200) {
        reply = reply.split(/[।.!?]/)[0].trim() + " 🫣";
      }

      this.chatMemory[threadID].push(`নীলা: ${reply}`);

      return api.sendMessage(
        reply,
        threadID,
        (err, info) => {
          if (!err && info) {
            global.GoatBot.onReply.set(info.messageID, {
              commandName: this.config.name,
              author: senderID,
              messageID: info.messageID
            });
          }
        },
        messageID
      );
    } catch (e) {
      console.error("[nila AI]", e.message);
      return api.sendMessage(
        "নেটের সমস্যা, একটু পরে চেষ্টা করো 🥺",
        threadID,
        messageID
      );
    }
  },

  // ===== Main Process =====
  async processMessage(api, event, text, message) {
    const cleanedMsg = (text || "").trim();
    if (!cleanedMsg) return message.reply("বলো তো, কী চাও? 😘");

    const isVideo = /\b(video|vdo|mp4|ভিডিও)\b/i.test(cleanedMsg);
    const isAudio = /\b(song|music|audio|mp3|play|গান)\b/i.test(cleanedMsg);

    let query = cleanedMsg
      .replace(
        /\b(video|vdo|mp4|ভিডিও|song|music|audio|mp3|play|গান|nila|nil|নিলা|নীলা|নিল)\b/gi,
        ""
      )
      .trim();

    if (isVideo) {
      if (!query) return message.reply("ভিডিওর নামটা বলো তো 🥺");
      return this.downloadVideo(api, event, query);
    }

    if (isAudio) {
      if (!query) return message.reply("গানের নামটা বলো তো 🥺");
      return this.downloadAudio(api, event, query);
    }

    return this.handleAI(api, event, cleanedMsg);
  },

  // ===== onStart =====
  async onStart({ api, event, args, message }) {
    return this.processMessage(api, event, args.join(" "), message);
  },

  // ===== onChat (নাম ধরে ডাকলে) =====
  async onChat({ api, event, message }) {
    const body = (event.body || "").toLowerCase().trim();
    if (!body) return;

    const triggered = this.TRIGGER_WORDS.some((word) =>
      body.includes(word.toLowerCase())
    );
    if (!triggered) return;

    // প্রিফিক্স কমান্ড হলে ডাবল রেসপন্স বন্ধ
    const prefix = global.GoatBot?.config?.prefix || ".";
    if (body.startsWith(prefix)) return;

    return this.processMessage(api, event, event.body, message);
  },

  // ===== onReply =====
  async onReply({ api, event, message, Reply }) {
    if (event.senderID !== Reply.author) return;
    const text = (event.body || "").trim();
    if (!text) return;
    return this.processMessage(api, event, text, message);
  }
};
