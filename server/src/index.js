import http from 'node:http';
import mongoose from 'mongoose';
import { app } from './app.js';
import { config } from './config.js';
import { attachSocket } from './socket.js';
import { User, Ride, Booking, LiveLocation, ChatMessage } from './models.js';

const server = http.createServer(app);
app.set('io', attachSocket(server));
await mongoose.connect(config.mongoUri, { autoIndex: false });
await User.createCollection().catch(error => { if (error.codeName !== 'NamespaceExists') throw error; });
const indexes = await User.collection.indexes();
const emailIndex = indexes.find(index => index.key?.email === 1);
if (emailIndex && !emailIndex.sparse) await User.collection.dropIndex(emailIndex.name);
await User.collection.createIndex({ email: 1 }, { unique: true, sparse: true });
await User.collection.createIndex({ phone: 1 }, { unique: true, sparse: true });
await Promise.all([User, Ride, Booking, LiveLocation, ChatMessage].map(model => model.createIndexes()));
server.listen(config.port, () => console.log(`API listening on port ${config.port}`));

async function shutdown() {
  server.close();
  await mongoose.disconnect();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
