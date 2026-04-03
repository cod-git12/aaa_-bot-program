const { REST, Routes, SlashCommandBuilder } = require("discord.js");

const commands = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Botの応答速度を確認します"),

  new SlashCommandBuilder()
    .setName("help")
    .setDescription("コマンド一覧を表示します"),

  new SlashCommandBuilder()
    .setName("wikipedia")
    .setDescription("日本語Wikipediaで記事を検索します")
    .addStringOption(opt =>
      opt.setName("ワード")
        .setDescription("検索するキーワード")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("random")
    .setDescription("Bloxd攻略Wikiのランダムなページを表示します"),

  new SlashCommandBuilder()
    .setName("check")
    .setDescription("Bloxd攻略Wikiにページが存在するか確認します")
    .addStringOption(opt =>
      opt.setName("ページ名")
        .setDescription("確認したいページ名（例: ゲームモード/ベッドウォーズ）")
        .setRequired(true)
    ),

].map(cmd => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

const clientId = "1466984129512997049"; 
const guildId = "1453664112973447311";

(async () => {
  try {
    console.log("スラッシュコマンドを登録中...");
    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands }
    );
    console.log(`✅ ${commands.length}件のコマンドを登録しました。`);
  } catch (err) {
    console.error("コマンド登録エラー:", err);
  }
})();
