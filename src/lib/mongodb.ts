import { Db, MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;

declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

function getClientPromise(): Promise<MongoClient> {
  if (!uri) {
    throw new Error('MONGODB_URI is not configured');
  }

  if (process.env.NODE_ENV === 'development') {
    if (!global._mongoClientPromise) {
      const client = new MongoClient(uri);
      global._mongoClientPromise = client.connect();
    }
    return global._mongoClientPromise;
  }

  const client = new MongoClient(uri);
  return client.connect();
}

let indexesEnsured = false;

async function ensureIndexes(db: Db): Promise<void> {
  await Promise.all([
    db
      .collection('file_analyses')
      .createIndex({ targetDir: 1, relativePath: 1 }, { unique: true }),
    db.collection('file_analyses').createIndex({ analyzedAt: -1 }),
    db.collection('scans').createIndex({ targetDir: 1, createdAt: -1 }),
    db
      .collection('scans')
      .createIndex({ targetDir: 1, contentFingerprint: 1 }),
    db
      .collection('resolved_findings')
      .createIndex({ targetDir: 1, findingKey: 1 }, { unique: true }),
  ]);
}

export function isMongoConfigured(): boolean {
  return Boolean(process.env.MONGODB_URI);
}

export async function getDb(): Promise<Db> {
  const client = await getClientPromise();
  const db = client.db();

  if (!indexesEnsured) {
    await ensureIndexes(db);
    indexesEnsured = true;
  }

  return db;
}
