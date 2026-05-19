const mongoose = require("mongoose");

async function ensureLegacyIndexesCompatibility() {
  try {
    const encountersCollection = mongoose.connection.collection("encounters");
    const encounterIndexes = await encountersCollection.indexes();
    const appointmentUniqueIndex = encounterIndexes.find(
      (index) => index.name === "appointment_1" && index.unique
    );
    if (appointmentUniqueIndex) {
      await encountersCollection.dropIndex("appointment_1");
      // eslint-disable-next-line no-console
      console.log("[db] indice unico appointment_1 removido de encounters");
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("[db] falha ao ajustar indice de encounters:", error.message);
  }

  try {
    const patientsCollection = mongoose.connection.collection("patients");
    const patientIndexes = await patientsCollection.indexes();
    const documentUniqueIndex = patientIndexes.find(
      (index) => index.name === "documentNumber_1" && index.unique
    );
    if (documentUniqueIndex) {
      await patientsCollection.dropIndex("documentNumber_1");
      // eslint-disable-next-line no-console
      console.log("[db] indice unico documentNumber_1 removido de patients");
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("[db] falha ao ajustar indice de patients:", error.message);
  }
}

async function connectDatabase(uri) {
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri);
  await ensureLegacyIndexesCompatibility();
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
