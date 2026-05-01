const fs = require('fs');

module.exports = (bot) => {
  const files = fs.readdirSync('./Commands').filter(f => f.endsWith('.js'));
  for (const file of files) {
    const command = require(`../Commands/${file}`);
    if (!command.name || typeof command.name !== 'string') {
      throw new TypeError(`La commande ${file} n'a pas de nom.`);
    }
    if (!bot.commandEnabled(command.name)) {
      console.log(`⏭️  Commande /${command.name} désactivée`);
      continue;
    }
    bot.commands.set(command.name, command);
    console.log(`✅ Commande /${command.name} chargée`);
  }
};
