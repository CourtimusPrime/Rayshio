import { MongoClient } from 'mongodb';
import { config } from '../config.js';

export const mongoClient = new MongoClient(config.MONGODB_DATABASE_URL);

export function mongoDb() {
  return mongoClient.db(); // db name from connection string, default 'test' → set in URL
}
