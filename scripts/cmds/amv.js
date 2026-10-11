const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

/* ══════════════════════════════════════════════════════════════
   🎬 AMV — Random Anime Music Video from Sahu API
   ══════════════════════════════════════════════════════════════ */
const API_LIST_URL = "https://gitlab.com/shahadat-sahu/sahu-api/-/raw/main/API.json";

module.exports = {
  config: {
    name: "amv",
    version: "1.0.0",
    author: "JABED",
    countDown: 5,
    role: 0,
    shortDescription: { en: "Random anime music video from SAHU API" },
    longDescription: { en: "Download and send a random Anime Music Video (AMV) from the Sahu API." },
    category: "video",
    guide: { en: "{pn}" }
  },

  langs: {
    en: {
      success: `🎬 𝗥𝗔𝗡𝗗𝗢𝗠 𝗔𝗡𝗜𝗠𝗘 𝗩𝗜𝗗𝗘𝗢

✨ Enjoy your anime video!
Happy Watching!`,
      apiProblem: "API Problem Please try again.......",
      fileError: "❌ File Writing Error!",
      genericError: "❌ API Problem... Try again later!"
    }
  },

  onStart: async function ({ event, message, getLang }) {
    const { threadID, messageID } = event;

    /* ─── Cache setup ─── */
    const cacheDir = path.join(__dirname, "cache");
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    const filePath = path.join(cacheDir, `amv_${Date.now()}.mp4`);

    try {
      /* ─── STEP 1: Fetch API list ─── */
      const listRes = await axios.get(API_LIST_URL, { timeout: 15000 });
      const API = listRes.data?.anime_video;

      if (!API) {
        return message.reply(getLang("apiProblem"));
      }

      /* ─── STEP 2: Download video as stream ─── */
      const response = await axios({
        url: API,
        method: "GET",
        responseType: "stream",
        timeout: 120000
      });

      /* ─── STEP 3: Pipe to file ─── */
      const writer = fs.createWriteStream(filePath);
      response.data.pipe(writer);

      /* ─── STEP 4: Send on finish ─── */
      await new Promise((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
        response.data.on("error", reject);
      });

      return message.reply(
        {
          body: getLang("success"),
          attachment: fs.createReadStream(filePath)
        },
        () => {
          try { fs.unlinkSync(filePath); } catch (_) {}
        }
      );

    } catch (err) {
      console.error("[amv] Error:", err?.response?.data || err.message);
      try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (_) {}
      return message.reply(getLang("genericError"));
    }
  }
};
