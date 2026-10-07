const https = require("https");

const API = "https://say-api.vercel.app/api";
const TIMEOUT = 30000;

module.exports = {
  config: {
    name: "anisay",
    aliases: ["anisay", "speak"],
    version: "3.2.0",
    role: 0,
    author: "Rafix4x",
    countDown: 10,
    category: "media",
    shortDescription: "Text to speech",
    guide: {
      en: "/say <text>\n/say <text> -v <voice or ID> -l <lang>"
    }
  },

  onStart: async function ({ event, args, message }) {
    try {
      const { text, voice, lang } = this.parseArgs(args);
      if (!text) return message.reply("Provide text. Usage: /say <text> [-v <voice>] [-l <lang>]");

      const q = new URLSearchParams();
      if (text) q.set("text", text);
      if (voice) q.set("voice", voice);
      if (lang) q.set("lang", lang);

      const buffer = await this.fetch(`${API}/tts?${q}`);
      await this.sendAudio(message, buffer);
    } catch (e) {
      message.reply("Failed: " + e.message);
    }
  },

  onReply: async function ({}) {},

  parseArgs: function (args) {
    const text = [];
    let voice = null;
    let lang = null;

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === "-v") voice = args[++i] || null;
      else if (arg === "-l") lang = (args[++i] || "").toLowerCase() || null;
      else text.push(arg);
    }

    return { text: text.join(" ").trim(), voice, lang };
  },

  fetch: function (url, json) {
    return new Promise((resolve, reject) => {
      const req = https.get(url, res => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          reject(new Error(`API error ${res.statusCode}`));
          return;
        }
        const chunks = [];
        res.on("data", c => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      });
      req.setTimeout(TIMEOUT, () => { req.destroy(new Error("API timed out")); });
      req.on("error", reject);
    });
  },

  sendAudio: function (message, buffer) {
    const { Readable } = require("stream");
    const attachment = Readable.from(buffer);
    attachment.path = "say.mp3";
    return message.reply({ attachment });
  }
};
