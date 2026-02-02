const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  EmbedBuilder
} = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const PREFIX = "!";

const UPDATE_MESSAGE = "1453677204301942826"; // 通知を送るチャンネルID

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const channel = await client.channels.fetch(UPDATE_MESSAGE).catch(() => null);
  if (!channel) return;

  channel.send({
    embeds: [
      {
        title: "🤖 Bot Update",
        description: "Botが更新され、再起動しました。",
        color: 0x00ff99,
        timestamp: new Date()
      }
    ]
  });
});
;

client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;

  if (!msg.content.startsWith(PREFIX)) return;

  const args = msg.content.slice(PREFIX.length).trim().split(/ +/);
  const cmd = args.shift();

  // ping
  if (cmd === "ping") {
    return msg.reply("🏓 Pong!");
  }

  // embed
  if (cmd === "embed") {
    const embed = new EmbedBuilder()
      .setDescription(args.join(" "))
      .setColor(0xaaaaaa);
    return msg.channel.send({ embeds: [embed] });
  }

  // announce（管理者のみ）
  if (cmd === "announce") {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return msg.reply("❌ 管理者専用");
    }

    const text = args.join(" ").split("|");
    if (text.length < 2) {
      return msg.reply("使い方: !announce タイトル | 内容");
    }

    const embed = new EmbedBuilder()
      .setTitle(text[0].trim())
      .setDescription(text[1].trim())
      .setColor(0x00aaff)
      .setTimestamp();

    return msg.channel.send({ embeds: [embed] });
  }
});

// ===== メンション返信 =====
const mention_words = ["？", "どうした", "なんかあった？"];

client.on("messageCreate", (msg) => {
  if (msg.author.bot) return;

  // Botがメンションされたかチェック
  if (msg.mentions.has(client.user)) {
    const reply =
      mention_words[Math.floor(Math.random() * mention_words.length)];

    msg.reply(reply);
  }
});



client.login(process.env.DISCORD_TOKEN);
