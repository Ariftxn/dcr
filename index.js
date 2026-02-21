import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from "discord.js";
import express from "express";
import session from "express-session";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
const app = express();

client.login(process.env.BOT_TOKEN);

client.on("ready", () => console.log(`Bot ready: ${client.user.tag}`));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false }));
app.use(express.static('public'));

// Load vouchers
let vouchers = [];
if (fs.existsSync("vouchers.json")) vouchers = JSON.parse(fs.readFileSync("vouchers.json"));

function saveVouchers() {
  fs.writeFileSync("vouchers.json", JSON.stringify(vouchers, null, 2));
}

function generateVoucherCode(length = 12) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  for (let i = 0; i < length; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
}

// REGISTER SLASH COMMANDS
const commands = [
  new SlashCommandBuilder()
    .setName("redeem")
    .setDescription("Redeem voucher")
    .addStringOption(opt => opt.setName("code").setDescription("Kode voucher").setRequired(true)),

  new SlashCommandBuilder()
    .setName("createvoucher")
    .setDescription("Buat voucher baru (Admin Only)")
    .addRoleOption(opt => opt.setName("role").setDescription("Pilih role").setRequired(true))
    .addIntegerOption(opt => opt.setName("max").setDescription("Max redeem").setRequired(false))
    .addStringOption(opt => opt.setName("code").setDescription("Kode (kosong = auto generate)").setRequired(false))
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

(async () => {
  try {
    console.log("Registering slash commands...");
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log("Slash commands registered!");
  } catch (err) {
    console.error(err);
  }
})();

// SLASH COMMAND LOGIC
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const member = await interaction.guild.members.fetch(interaction.user.id);
  const adminRoles = ["ID_ROLE_ADMIN1", "ID_ROLE_ADMIN2"]; // ganti role ID admin kamu

  if (interaction.commandName === "createvoucher") {
    if (!member.roles.cache.some(r => adminRoles.includes(r.id))) {
      return interaction.reply({ content: "Kamu tidak punya izin buat voucher!", ephemeral: true });
    }
    const role = interaction.options.getRole("role");
    const max = interaction.options.getInteger("max") || 1;
    const codeInput = interaction.options.getString("code");
    const code = codeInput || generateVoucherCode(12);
    const voucher = { code, roleId: role.id, maxRedeem: max, redeemed: [] };
    vouchers.push(voucher);
    saveVouchers();
    return interaction.reply({ content: `Voucher ${code} berhasil dibuat untuk role ${role.name}`, ephemeral: true });
  }

  if (interaction.commandName === "redeem") {
    const code = interaction.options.getString("code");
    const voucher = vouchers.find(v => v.code === code);
    if (!voucher) return interaction.reply({ content: "Voucher tidak valid", ephemeral: true });
    if (voucher.redeemed.length >= voucher.maxRedeem) return interaction.reply({ content: "Voucher sudah full", ephemeral: true });
    await member.roles.add(voucher.roleId);
    voucher.redeemed.push(member.id);
    saveVouchers();
    return interaction.reply({ content: `Berhasil redeem voucher ${code}`, ephemeral: true });
  }
});

// DASHBOARD API
app.get("/api/roles", async (req, res) => {
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  const fetched = await guild.roles.fetch();
  const roles = fetched.cache.filter(r => r.name !== "@everyone").map(r => ({ id: r.id, name: r.name }));
  res.json(roles);
});

app.get("/api/vouchers", (req, res) => res.json(vouchers));

app.post("/api/vouchers", async (req, res) => {
  const userId = req.session.userId;
  const member = await client.guilds.fetch(process.env.GUILD_ID).then(g => g.members.fetch(userId));
  const adminRoles = ["ID_ROLE_ADMIN1", "ID_ROLE_ADMIN2"];
  if (!member.roles.cache.some(r => adminRoles.includes(r.id))) {
    return res.status(403).json({ error: "Kamu tidak punya izin buat voucher!" });
  }
  const { roleId, maxRedeem, autoGenerate } = req.body;
  const code = autoGenerate ? generateVoucherCode(12) : req.body.code;
  const voucher = { code, roleId, maxRedeem: parseInt(maxRedeem) || 1, redeemed: [] };
  vouchers.push(voucher);
  saveVouchers();
  res.json(voucher);
});

app.listen(process.env.PORT, () => console.log(`Dashboard running: http://localhost:${process.env.PORT}`));