require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URL = process.env.MONGODB_URL;
if (!MONGODB_URL) {
  console.error('❌ MONGODB_URL is missing in environment');
  process.exit(1);
}

const dropIndexIfExists = async (db, collectionName, indexName) => {
  const collections = await db.listCollections({ name: collectionName }).toArray();
  if (!collections.length) {
    console.log(`ℹ️ Collection "${collectionName}" does not exist.`);
    return;
  }

  try {
    await db.collection(collectionName).dropIndex(indexName);
    console.log(`✅ Dropped ${collectionName}.${indexName}`);
  } catch (e) {
    if (e.codeName === 'IndexNotFound') {
      console.log(`ℹ️ ${collectionName}.${indexName} is already absent.`);
      return;
    }
    throw e;
  }
};

mongoose.connect(MONGODB_URL)
  .then(async () => {
    try {
      const db = mongoose.connection.db;
      console.log('Connected to DB:', db.databaseName);

      // Legacy unique index that blocked multiple teams per user in same contest.
      await dropIndexIfExists(db, 'contestentries', 'contestId_1_userId_1');

      // Legacy team index (kept for backward compatibility with older DBs).
      await dropIndexIfExists(db, 'teams', 'contestId_1_userId_1');
    } catch (e) {
      console.error('❌ Error while dropping index:', e.message);
      process.exit(1);
    } finally {
      await mongoose.connection.close();
      process.exit(0);
    }
  })
  .catch((e) => {
    console.error('❌ Connection error:', e.message);
    process.exit(1);
  });
