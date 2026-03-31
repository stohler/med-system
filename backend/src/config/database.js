const mongoose = require("mongoose");

async function connectDatabase(uri) {
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri);
}

async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

module.exports = {
  connectDatabase,
  disconnectDatabase,
};
