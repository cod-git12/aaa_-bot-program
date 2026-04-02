const {
  Client,
  GatewayIntentBits,
  EmbedBuilder
} = require("discord.js");
const http = require("http");

const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Bot is alive!");
}).listen(PORT, () => {
  console.log(`HTTP server listening on port ${PORT}`);
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const UPDATE_CHANNEL_ID = "1453677204301942826";
const BLOXD_WIKI_BASE = "https://bloxd.wikiru.jp/?";

let cachedPages = new Set();

async function fetchPageList() {
  try {
    const res = await fetch("https://bloxd.wikiru.jp/?cmd=list");
    const html = await res.text();
    const regex = /href="\.\/\?([^"#]+)"/g;
    const pages = new Set();
    let match;
    while ((match = regex.exec(html)) !== null) {
      const encoded = match[1];
      if (encoded.startsWith("cmd=") || encoded.startsWith("plugin=")) continue;
      const decoded = decodeURIComponent(encoded.replace(/\+/g, " "));
      pages.add(decoded);
    }
    cachedPages = pages;
    console.log(`Page list updated: ${cachedPages.size} pages`);
  } catch (err) {
    console.error("Failed to fetch page list:", err);
  }
}

function buildBloxdWikiUrl(pageName) {
  return BLOXD_WIKI_BASE + encodeURIComponent(pageName).replace(/%20/g, "+");
}

function pageExists(pageName) {
  return cachedPages.has(pageName);
}

async function searchWikipedia(query) {
  const searchRes = await fetch(
    `https://ja.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=1`
  );
  const searchData = await searchRes.json();
  const results = searchData?.query?.search;
  if (!results || results.length === 0) return null;

  const title = results[0].title;
  const summaryRes = await fetch(
    `https://ja.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
  );
  if (!summaryRes.ok) return null;
  const data = await summaryRes.json();

  return {
    title: data.title,
    extract: data.extract?.slice(0, 400) || "説明なし",
    pageUrl: data.content_urls?.desktop?.page || `https://ja.wikipedia.org/wiki/${encodeURIComponent(title)}`,
    thumbnail: data.thumbnail?.source || null
  };
}

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await fetchPageList();
  setInterval(fetchPageList, 30 * 60 * 1000);

  const channel = await client.channels.fetch(UPDATE_CHANNEL_ID).catch(() => null);
  if (channel) {
    channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("🤖 Bot Update")
          .setDescription("Botが更新され、再起動しました。")
          .setColor(0x00ff99)
          .setTimestamp()
      ]
    });
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;

  if (commandName === "ping") {
    const latency = Date.now() - interaction.createdTimestamp;
    return interaction.reply(`🏓 Pong! \`${latency}ms\``);
  }

  if (commandName === "help") {
    const embed = new EmbedBuilder()
      .setTitle("📋 コマンド一覧")
      .setColor(0x57c4ff)
      .addFields(
        { name: "/ping", value: "Botの応答速度を確認" },
        { name: "/wikipedia <ワード>", value: "日本語Wikipediaで記事を検索" },
        { name: "/random", value: "Bloxd攻略Wikiのランダムなページを表示" },
        { name: "/check <ページ名>", value: "Bloxd攻略Wikiにページが存在するか確認" },
        { name: "━━ ショートカット ━━", value: "`BKW: ページ名!` と書くとwikiリンクを送信" }
      )
      .setFooter({ text: "Bloxd攻略Wiki: bloxd.wikiru.jp" });
    return interaction.reply({ embeds: [embed] });
  }

  if (commandName === "wikipedia") {
    const query = interaction.options.getString("ワード");
    await interaction.deferReply();
    try {
      const result = await searchWikipedia(query);
      if (!result) {
        return interaction.editReply(`❌ 「${query}」に関するWikipedia記事が見つからなかったよ。`);
      }
      const embed = new EmbedBuilder()
        .setTitle(`📖 ${result.title}`)
        .setDescription(result.extract + (result.extract.length >= 400 ? "…" : ""))
        .setURL(result.pageUrl)
        .setColor(0xf5f5f5)
        .setFooter({ text: "出典: Wikipedia (ja)" })
        .setTimestamp();
      if (result.thumbnail) embed.setThumbnail(result.thumbnail);
      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error(err);
      return interaction.editReply("❌ Wikipedia取得中にエラーが発生したよ。もっかい試してね。");
    }
  }

  if (commandName === "random") {
    if (cachedPages.size === 0) {
      return interaction.reply("❌ ページリストの取得中です。しばらく待ってから試してください。");
    }
    const pagesArray = [...cachedPages];
    const randomPage = pagesArray[Math.floor(Math.random() * pagesArray.length)];
    const url = buildBloxdWikiUrl(randomPage);
    const embed = new EmbedBuilder()
      .setTitle(`🎲 ${randomPage}`)
      .setDescription(`[Bloxd攻略Wikiで開く](${url})`)
      .setURL(url)
      .setColor(0x57c4ff)
      .setFooter({ text: "Bloxd攻略Wiki • bloxd.wikiru.jp" })
      .setTimestamp();
    return interaction.reply({ embeds: [embed] });
  }

  if (commandName === "check") {
    const pageName = interaction.options.getString("ページ名");
    if (cachedPages.size === 0) {
      return interaction.reply("❌ ページリストの取得中だよ。しばらく待ってから試してね。");
    }
    if (pageExists(pageName)) {
      const url = buildBloxdWikiUrl(pageName);
      const embed = new EmbedBuilder()
        .setTitle(`✅ ${pageName}`)
        .setDescription(`ページがあるよ。\n[Bloxd攻略Wikiで開く](${url})`)
        .setURL(url)
        .setColor(0x00cc66)
        .setFooter({ text: "Bloxd攻略Wiki • bloxd.wikiru.jp" });
      return interaction.reply({ embeds: [embed] });
    } else {
      return interaction.reply(`❌ 「${pageName}」というページはBloxd攻略Wikiに存在しないよ。`);
    }
  }
});

client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;

  const bkwMatch = msg.content.match(/^BKW:\s*(.+)!$/);
  if (bkwMatch) {
    const pageName = bkwMatch[1].trim();
    if (!pageExists(pageName)) {
      return msg.reply(`❌ 「${pageName}」というページはBloxd攻略Wikiに存在しないよ。`);
    }
    const url = buildBloxdWikiUrl(pageName);
    const embed = new EmbedBuilder()
      .setTitle(`📖 ${pageName}`)
      .setDescription(`[Bloxd攻略Wikiで開く](${url})`)
      .setURL(url)
      .setColor(0x57c4ff)
      .setFooter({ text: "Bloxd攻略Wiki • bloxd.wikiru.jp" })
      .setTimestamp();
    return msg.reply({ embeds: [embed] });
  }

  const mentionReplies = ["？", "どうした", "なんかあった？"];
  if (msg.mentions.has(client.user)) {
    msg.reply(mentionReplies[Math.floor(Math.random() * mentionReplies.length)]);
  }
});

client.login(process.env.DISCORD_TOKEN);
