const axios = require("axios");
const { createCanvas, loadImage } = require("canvas");
const fs = require("fs-extra");
const path = require("path");

function circleCrop(buffer, size) {
  return loadImage(buffer).then(img => {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext("2d");

    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    ctx.drawImage(img, 0, 0, size, size);
    return canvas;
  });
}

async function makeImage(one, two) {
  const bgURL = "https://i.postimg.cc/KYJ0VnK0/image0.png";
  const bg = await loadImage(bgURL);

  const width = 640;
  const height = 480;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.drawImage(bg, 0, 0, width, height);

  const fetchPfp = async (id) => {
    const url = `https://graph.facebook.com/${id}/picture?width=720&height=720&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`;
    return (await axios.get(url, { responseType: "arraybuffer" })).data;
  };

  const avtOne = await fetchPfp(one);
  const avtTwo = await fetchPfp(two);

  const circle1 = await circleCrop(avtOne, 110);
  const circle2 = await circleCrop(avtTwo, 90);

  ctx.drawImage(circle1, 60, 150);
  ctx.drawImage(circle2, 500, 220);

  const cacheDir = path.join(__dirname, "cache");
  await fs.ensureDir(cacheDir);

  const outPath = path.join(cacheDir, `bonk_${one}_${two}_${Date.now()}.png`);
  fs.writeFileSync(outPath, canvas.toBuffer("image/png"));
  return outPath;
}

module.exports = {
  config: {
    name: "bonk",
    aliases: ["b"],
    version: "1.0",
    author: "Jabed",
    countDown: 5,
    role: 0,
    shortDescription: {
      en: "Bonk someone"
    },
    longDescription: {
      en: "Make a BONK meme using two avatars"
    },
    category: "fun",
    guide: {
      en: "{pn} @mention / reply / UID"
    }
  },

  onStart: async function ({ api, event, args, message }) {
    const { threadID, messageID, senderID, mentions, messageReply } = event;

    let targetID;
    if (messageReply?.senderID) targetID = messageReply.senderID;
    else if (Object.keys(mentions).length) targetID = Object.keys(mentions)[0];
    else if (args[0] && /^\d+$/.test(args[0])) targetID = args[0];
    else return message.reply("⚠ Reply / Mention / UID use koro.");

    const one = senderID;
    const two = targetID;

    let targetName = "User";
    try {
      const userInfo = await api.getUserInfo(two);
      targetName = userInfo[two].name;
    } catch (e) {
      if (Object.keys(mentions).length > 0) {
        targetName = mentions[two].replace("@", "");
      }
    }

    let file = null;
    try {
      file = await makeImage(one, two);

      await message.reply({
        body: `${targetName} bonk nigga 🪓`,
        attachment: fs.createReadStream(file),
      });
    } catch (err) {
      console.error("[bonk] Error:", err);
      return message.reply("❌ Error: " + err.message);
    } finally {
      if (file && fs.existsSync(file)) {
        try { fs.unlinkSync(file); } catch (e) {}
      }
    }
  },
};
