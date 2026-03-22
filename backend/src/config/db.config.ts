import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

// ── Connection Options ───────────────────────────────────────────────────────
const connectionOptions = {
    // Pool sizing — tune based on expected concurrency
    maxPoolSize: 10,     // Max simultaneous connections kept alive
    minPoolSize: 2,      // Connections held open when idle
    maxIdleTimeMS: 30_000, // Close idle connections after 30 s

    // Timeouts
    serverSelectionTimeoutMS: 5_000,     // Give up finding a server after 5 s
    socketTimeoutMS: 45_000,        // Close sockets idle longer than 45 s
    connectTimeoutMS: 10_000,     // TCP connect timeout

    // Reliability
    retryWrites: true,  // Auto-retry failed writes (replica sets / Atlas)

    retryReads: true  // Auto-retry failed reads
}


// ── Event Listeners ──────────────────────────────────────────────────────────
const registereMongooseEvents = () : void => {
    mongoose.connection.on('connected', () => {
        console.log('🟢 MongoDB connected');
    });

    mongoose.connection.on('disconnected', () => {
        console.warn('🟡 MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
        console.log('🔄 MongoDB reconnected');
    });

    mongoose.connection.on('error', (err: Error) => {
        console.error(`🔴 MongoDB connection error: ${err.message}`);
    });

};

// ── Connect ──────────────────────────────────────────────────────────────────

export const connectDB = async(): Promise<void> => {
    const MONGODB_URI = process.env.MONGODB_URL;
    const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'king11';

    if (!MONGODB_URI) {
        console.log("Please define the MONGODB_URL environment variable");
        process.exit(1);
    }

    registereMongooseEvents();

    try {

        await mongoose.connect(MONGODB_URI, {
          ...connectionOptions,
          dbName: MONGODB_DB_NAME,
        });

    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`🔴 MongoDB initial connection failed: ${message}`);
        process.exit(1);
    }
};


// ── Disconnect ───────────────────────────────────────────────────────────────
export const disconnectDB = async(): Promise<void> => {
    try {
        await mongoose.connection.close();
        console.log('✅ MongoDB connection closed gracefully.');
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`🔴 Error closing MongoDB connection: ${message}`);
    }
}
