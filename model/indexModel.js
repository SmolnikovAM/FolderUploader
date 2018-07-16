const FilePath = require('./filePathModel');

async function startModel() {
  // await FilePath.sync({ force: true });
  await FilePath.sync();
}

module.exports = { startModel };
