const { REST, Routes, SlashCommandBuilder } = require('discord.js');

module.exports = async (bot) => {
  const commands = [];

  bot.commands.forEach(command => {
    const slash = new SlashCommandBuilder()
      .setName(command.name)
      .setDescription(command.description)
      .setDMPermission(false)
      .setDefaultMemberPermissions(
        command.permission === 'Aucune' ? null : command.permission
      );

    for (const opt of (command.options || [])) {
      if (opt.type === 'USER') {
        slash.addUserOption(o => o.setName(opt.name).setDescription(opt.description).setRequired(opt.required));
      } else if (opt.type === 'STRING' && opt.choices?.length) {
        slash.addStringOption(o =>
          o.setName(opt.name).setDescription(opt.description).setRequired(opt.required)
            .addChoices(...opt.choices)
        );
      } else if (opt.type === 'STRING') {
        slash.addStringOption(o => o.setName(opt.name).setDescription(opt.description).setRequired(opt.required));
      } else if (opt.type === 'ATTACHMENT') {
        slash.addAttachmentOption(o => o.setName(opt.name).setDescription(opt.description).setRequired(opt.required));
      }
    }

    commands.push(slash.toJSON());
  });

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  const isDev = process.env.DEV_MODE === 'true';

  if (isDev && process.env.GUILD_ID) {
    // Enregistrement guild = instantané (dev)
    await rest.put(Routes.applicationGuildCommands(bot.user.id, process.env.GUILD_ID), { body: commands });
    console.log(`✅ Slash commands enregistrées sur le serveur (dev)`);
  } else {
    // Enregistrement global (prod, ~1h de propagation)
    await rest.put(Routes.applicationCommands(bot.user.id), { body: commands });
    console.log(`✅ Slash commands enregistrées globalement (prod)`);
  }
};
