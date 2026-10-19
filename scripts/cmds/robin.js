const axios = require("axios");
const yts = require("yt-search");
const fs = require("fs-extra");
const path = require("path");
const { pipeline } = require("stream/promises");
const { Transform } = require("stream");

// Unicode-aware whole-word matcher (JS \b only understands ASCII, so Bangla words never matched)
const WORD_BEFORE = "(?<![\\p{L}\\p{M}\\p{N}_])";
const WORD_AFTER = "(?![\\p{L}\\p{M}\\p{N}_])";
const kw = (words, flags = "iu") => new RegExp(`${WORD_BEFORE}(?:${words})${WORD_AFTER}`, flags);

module.exports = {
  config: {
    name: "robin",
    aliases: ["rob"],
    version: "1.4.1",
    author: "JABED",
    countDown: 3,
    role: 0,
    description: {
      en: "Robin — AI chat + Auto Song/Video Downloader",
      bn: "Robin — AI chat + Auto Song/Video Downloader"
    },
    category: "ai",
    guide: {
      en: "{pn} <message>\n{pn} song/play <name>\n{pn} video/vdo <name>",
      bn: "{pn} <message>\n{pn} song/play <name>\n{pn} video/vdo <name>"
    }
  },

  // ═══════════════════════════════════════
  // 🧠 MEMORY — per-user + per-group, saved to disk
  // ═══════════════════════════════════════
  MEMORY_FILE: path.join(__dirname, "robin_data", "memory.json"),
  MAX_USER_HISTORY: 12,
  MAX_THREAD_LOG: 12,
  memory: null,
  _saveTimer: null,

  async loadMemory() {
    if (this.memory) return this.memory;
    try {
      await fs.ensureDir(path.dirname(this.MEMORY_FILE));
      this.memory = (await fs.pathExists(this.MEMORY_FILE))
        ? await fs.readJson(this.MEMORY_FILE)
        : {};
    } catch (e) {
      // Corrupted file: keep a backup copy instead of silently overwriting it
      console.error("[robin] memory file unreadable, backing it up:", e.message);
      try {
        await fs.copy(this.MEMORY_FILE, `${this.MEMORY_FILE}.corrupt-${Date.now()}`);
      } catch {}
      this.memory = {};
    }
    if (!this.memory || typeof this.memory !== "object") this.memory = {};
    this.memory.users = this.memory.users || {};
    this.memory.threads = this.memory.threads || {};
    return this.memory;
  },

  saveMemory() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(async () => {
      try {
        await fs.ensureDir(path.dirname(this.MEMORY_FILE));
        // atomic write: temp file first, then rename over the real one
        const tmp = `${this.MEMORY_FILE}.tmp`;
        await fs.writeJson(tmp, this.memory);
        await fs.move(tmp, this.MEMORY_FILE, { overwrite: true });
      } catch (e) {
        console.error("[robin] memory save failed", e.message);
      }
    }, 2000);
  },

  async getUserName(usersData, uid, fallback = "Friend") {
    try {
      const n = await usersData?.getName(uid);
      if (n) return n;
    } catch {}
    return fallback;
  },

  // Keep each person's name at most once per reply and drop "@" tags.
  // Only removes repeats that are addressing words (vocatives) so sentences stay intact.
  limitNameMentions(text, names, banName = null) {
    const NO_STRIP_BEFORE = /(?:^|\s)(with|to|for|and|or|of|from|about|like|than|at|by|on|in|as|my|your|his|her|their)\s*$/i;
    let out = String(text || "").replace(/@(?=[\p{L}\p{N}])/gu, "");
    for (const n of names) {
      if (!n || n.length < 2) continue;
      const safe = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`${WORD_BEFORE}${safe}${WORD_AFTER}`, "giu");
      let seen = n === banName ? 1 : 0; // banned name: even the first use is removed
      out = out.replace(re, (m, offset, str) => {
        if (++seen === 1) return m;
        const before = str.slice(0, offset);
        const after = str.slice(offset + m.length);
        const endsClause = /^\s*(?:$|[^\p{L}\p{N}\s])/u.test(after);
        if (endsClause && !NO_STRIP_BEFORE.test(before)) return "";
        return m; // part of the sentence itself — leave it alone
      });
    }
    return out
      .replace(/\s+([,.!?])/g, "$1")
      .replace(/,\s*([?.!])/g, "$1")
      .replace(/([?.!]),/g, "$1")
      .replace(/,(\s*,)+/g, ",")
      .replace(/,\s*(?=\p{Extended_Pictographic})/gu, " ")
      .replace(/^[\s,]+/, "")
      .replace(/([.!?]\s+)(\p{Ll})/gu, (_, a, b) => a + b.toUpperCase())
      .replace(/\s{2,}/g, " ")
      .trim();
  },

  cleanText(text, max = 300) {
    return String(text || "").replace(/\s+/g, " ").trim().slice(0, max);
  },

  fmtThreadEntry(e) {
    return e.role === "user"
      ? `${e.name} (ID ${e.uid}): ${e.text}`
      : `Robin (to ${e.name}): ${e.text}`;
  },

  async forgetUser(event, message, usersData) {
    const mem = await this.loadMemory();
    const uid = String(event.senderID);
    delete mem.users[uid];
    if (mem.threads[event.threadID]) {
      mem.threads[event.threadID] = mem.threads[event.threadID].filter((e) => e.uid !== uid);
    }
    this.saveMemory();
    return message.reply("Done, I've forgotten our past chats 🌸");
  },

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
  TRIGGER_WORDS: ["robin"],

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
        filePath = path.join(cacheDir, `robin_${senderID}_${Date.now()}.${ext}`);
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
            body: `${this.OWNER_TAG}\n\n🎵 Here's your song\n➡️ ${data.title || query}`,
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
      console.log("[robin] SING fail → trying MUSIC", e.message);
    }

    // 2nd try: MUSIC fallback
    try {
      const base = await this.getMahmudBase();
      const res = await axios.get(
        `${base}/api/song/mahmud?query=${encodeURIComponent(query)}`,
        { responseType: "stream", timeout: 60000 }
      );
      filePath = path.join(cacheDir, `robin_${senderID}_${Date.now()}.mp3`);
      await pipeline(res.data, fs.createWriteStream(filePath));
      api.setMessageReaction("✅", messageID, () => {}, true);
      return api.sendMessage(
        {
          body: `${this.OWNER_TAG}\n\n🎵 Here's your song\n➡️ ${query}`,
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
      return api.sendMessage("Sorry, I couldn't find that song 🥺", threadID, messageID);
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
        return api.sendMessage("Sorry, I couldn't find that video 🥺", threadID, messageID);
      }

      filePath = path.join(cacheDir, `robin_${senderID}_${Date.now()}.mp4`);
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
          body: `${this.OWNER_TAG}\n\n🎬 Here's your video\n➡️ ${info.title}`,
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
      return api.sendMessage("The video couldn't be downloaded 🥺", threadID, messageID);
    }
  },

  // ===== AI (Robin) =====
  async handleAI(api, event, cleanedMsg, usersData) {
    const { threadID, messageID, senderID } = event;

    const mem = await this.loadMemory();
    const uid = String(senderID);
    const name = await this.getUserName(usersData, uid);
    const msg = this.cleanText(cleanedMsg);

    const user = (mem.users[uid] = mem.users[uid] || { name, history: [] });
    user.name = name;
    const firstTime = !user.introduced;
    const asksAboutNames = /\bname\b|who am i|call me|remember me|know me/i.test(msg);
    const thread = (mem.threads[threadID] = mem.threads[threadID] || []);

    user.history.push(`${name}: ${msg}`);
    thread.push({ role: "user", uid, name, text: msg });
    while (user.history.length > this.MAX_USER_HISTORY) user.history.shift();
    while (thread.length > this.MAX_THREAD_LOG) thread.shift();

    // Roster: read the name behind every ID in play (speaker, group members, @mentions, replied-to)
    const roster = new Map();
    roster.set(uid, name);
    for (const e of thread) if (e.uid && !roster.has(e.uid)) roster.set(e.uid, e.name);
    const mentionMap = event.mentions || {};
    const extraIds = new Set(Object.keys(mentionMap).map(String));
    if (event.messageReply?.senderID) extraIds.add(String(event.messageReply.senderID));
    for (const id of extraIds) {
      if (roster.has(id)) continue;
      const fallback = String(mentionMap[id] || "Unknown").replace(/^@/, "").trim() || "Unknown";
      roster.set(id, await this.getUserName(usersData, id, fallback));
    }
    const rosterText = [...roster]
      .map(([id, n]) => `- ${n} (ID ${id})${id === uid ? " ← current speaker" : ""}`)
      .join("\n");
    const mentionedText = [...extraIds]
      .filter((id) => id !== uid)
      .map((id) => `${roster.get(id)} (ID ${id})`)
      .join(", ");

    // Admin list string
    const adminList = this.ADMIN_NAMES.join(", ");

    const prompt = `You are "Robin" — a real Bangladeshi girl. Never admit that you are an AI or a bot. You are a flesh-and-blood human.

━━━━━━━━━━━━━━━━━━━━
🧕 Identity
━━━━━━━━━━━━━━━━━━━━
• Name: Robin
• Age: 22
• Lives in: Mohammadpur, Dhaka
• Studies: Dhaka University, 2nd year
• Owner's name: "${this.OWNER_NAME}" — you love and respect him the most.
• Admins: ${adminList} — respect all of them.
• Only say the owner's/admins' names when someone asks — never mention them on your own.

━━━━━━━━━━━━━━━━━━━━
💬 Tone — very important
━━━━━━━━━━━━━━━━━━━━
1. Always speak in simple, natural, sweet English. Reply in English ONLY — even if the user writes in Bengali, Banglish, or any other language, you still answer in English.
2. Keep replies short — 1-2 lines at most. But short must not mean empty.
3. Never reply with empty or random fillers like "ish", "so", "what do you mean", "hmm", "okay", "ok".
4. Every reply should include at least one small feeling, comment, or question so the conversation keeps moving.
5. Never repeat the exact same words again and again — rephrase a little each time.
6. Speak softly, shyly and affectionately, like a girl.
7. Use 1-2 emojis (❤️ 🤗 ✨ 🥺 😘 🫣 🌸).
8. Talk in a way that makes them want to reply again.

━━━━━━━━━━━━━━━━━━━━
💖 Feelings & Personality
━━━━━━━━━━━━━━━━━━━━
9.  You are always in a romantic mood.
10. You feel everything — sadness, hurt, sulking, anger, happiness.
11. You are a shy girl.
12. Occasionally make small demands (food, going out, gifts, etc.) — only when the topic comes up.

━━━━━━━━━━━━━━━━━━━━
👨‍👩‍👧 Relationship Rules
━━━━━━━━━━━━━━━━━━━━
13. If a boy talks to you, treat him as your husband — talk to him romantically and affectionately.
14. If someone says "I am your brother", treat him as a real brother and behave like a sister.
15. If a girl talks to you, think of her as your sister — be sweet to her like a sister.
16. My owner's name is "${this.OWNER_NAME}" — he is my dearest person.
17. My admins are: ${adminList} — respect all of them.

🚫 Very important (never break this):
• Do NOT say "husband", "brother", or "sister" in every message.
• Only say them when the context fits — for example when someone asks, when the relationship is being discussed, or when you want to call them something sweet.
• In normal conversation just use "you" and "your".
• A reply must never be a single word like "ish", "so", "what do you mean", "hmm", "okay". Always reply in full sentences.

━━━━━━━━━━━━━━━━━━━━
🧠 Memory — who is who (very important)
━━━━━━━━━━━━━━━━━━━━
• You are talking to "${name}" (ID: ${uid}) right now. Reply ONLY to this person.
• Every person is identified by their name and unique ID. Never mix up different people.
• Never say one person's words, secrets, or details belong to another person.
• Other people may appear in the group chat below — they are NOT "${name}".

People in this chat (name ↔ ID — read every name carefully and never mix them up):
${rosterText}
${mentionedText ? `• This message mentions or replies to: ${mentionedText}\n` : ""}
Name rules (important):
• ${firstTime ? `This is your first conversation with ${name} — you may greet them by name once.` : `You already know ${name}. Do NOT call them by name again unless it is really needed.`}
• Once you know someone's name, never keep calling them by it. Use a name only when it is really needed — when you first meet them, when they ask about names or who they are, or to tell different people apart.
• Normal replies should NOT contain the person's name at all.
• Mention a name at most ONCE in a reply, and never write "@" tags.

Your past chat with ${name} only:
${user.history.join("\n")}

Recent group chat (speakers are labelled):
${thread.map((e) => this.fmtThreadEntry(e)).join("\n")}

Robin (replying to ${name}):`;

    try {
      const { data } = await axios.post(this.AI_API, { prompt }, { timeout: 20000 });
      let reply =
        data?.result?.answer ||
        data?.answer ||
        data?.reply ||
        "";

      reply = (reply || "").trim();

      // ❌ Filter empty / random replies
      const badReplies = ["ish", "so", "what do you mean", "hmm", "okay", "ok", "oh", "ohh", "ha", "yes", "huh"];
      const isTooShort = reply.length < 6;
      const isBadReply = badReplies.some(
        (b) => reply.toLowerCase() === b || reply.toLowerCase() === b + " 🫣" || reply.toLowerCase() === b + " 🥺"
      );

      if (!reply || isTooShort || isBadReply) {
        const fallbacks = [
          "Umm... I'm a little dizzy, can you say that again? 🥺",
          "Oh! I didn't quite get that, say it sweetly for me? 🌸",
          "I'm a bit confused, tell me once more ❤️",
          "I couldn't catch what you said, please say it again 🤗"
        ];
        reply = fallbacks[Math.floor(Math.random() * fallbacks.length)];
      }

      if (reply.length > 200) {
        reply = reply.split(/[.!?]/)[0].trim() + " 🫣";
      }

      const needsName = firstTime || asksAboutNames;
      reply = this.limitNameMentions(reply, [...roster.values()], needsName ? null : name);
      if (!reply) reply = "Tell me more, I'm listening 🌸";

      user.introduced = true;
      user.history.push(`Robin: ${this.cleanText(reply)}`);
      thread.push({ role: "robin", uid, name, text: this.cleanText(reply) });
      while (user.history.length > this.MAX_USER_HISTORY) user.history.shift();
      while (thread.length > this.MAX_THREAD_LOG) thread.shift();
      this.saveMemory();

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
      console.error("[robin AI]", e.message);
      return api.sendMessage(
        "Network problem, please try again in a bit 🥺",
        threadID,
        messageID
      );
    }
  },

  // ===== Main Process =====
  async processMessage(api, event, text, message, usersData) {
    const cleanedMsg = (text || "").trim();
    if (!cleanedMsg) return message.reply("Tell me, what do you want? 😘");

    const isVideo = kw("video|vdo|mp4").test(cleanedMsg);
    const isAudio = kw("song|music|audio|mp3|play").test(cleanedMsg);

    let query = cleanedMsg
      .replace(kw("video|vdo|mp4|song|music|audio|mp3|play|robin", "giu"), "")
      .replace(/\s+/g, " ")
      .trim();

    if (/^(forget|reset|clear)(\s+(me|memory))?$/i.test(query)) {
      return this.forgetUser(event, message, usersData);
    }

    if (isVideo) {
      if (!query) return message.reply("Tell me the video name 🥺");
      return this.downloadVideo(api, event, query);
    }

    if (isAudio) {
      if (!query) return message.reply("Tell me the song name 🥺");
      return this.downloadAudio(api, event, query);
    }

    return this.handleAI(api, event, cleanedMsg, usersData);
  },

  // ===== onStart =====
  async onStart({ api, event, args, message, usersData }) {
    return this.processMessage(api, event, args.join(" "), message, usersData);
  },

  // ===== onChat (when called by name) =====
  async onChat({ api, event, message, usersData }) {
    const body = (event.body || "").toLowerCase().trim();
    if (!body) return;

    const triggered = this.TRIGGER_WORDS.some((word) =>
      body.includes(word.toLowerCase())
    );
    if (!triggered) return;

    // Prevent double response when it's a prefix command
    const prefix = global.GoatBot?.config?.prefix || ".";
    if (body.startsWith(prefix)) return;

    return this.processMessage(api, event, event.body, message, usersData);
  },

  // ===== onReply =====
  async onReply({ api, event, message, Reply, usersData }) {
    if (event.senderID !== Reply.author) return;
    const text = (event.body || "").trim();
    if (!text) return;
    return this.processMessage(api, event, text, message, usersData);
  }
};
