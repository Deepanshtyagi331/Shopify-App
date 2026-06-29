import mongoose from "mongoose";

// A global fallback memory store in case MongoDB connection and Memory Server both fail
global.dbFallbackStore = global.dbFallbackStore || [];

export async function connectDB() {
  const mongoUri = process.env.MONGODB_URI;

  if (mongoUri) {
    console.log("Connecting to MongoDB from MONGODB_URI...");
    try {
      await mongoose.connect(mongoUri);
      console.log("Successfully connected to MONGODB_URI!");
      return;
    } catch (err) {
      console.error("Failed to connect to MONGODB_URI. Falling back to memory database...", err);
    }
  }

  // Fallback to mongodb-memory-server
  try {
    console.log("Attempting to spin up mongodb-memory-server...");
    const { MongoMemoryServer } = await import("mongodb-memory-server");
    const mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    console.log(`mongodb-memory-server started at URI: ${uri}`);
    await mongoose.connect(uri);
    console.log("Successfully connected to memory database!");
  } catch (err) {
    console.warn("Could not start mongodb-memory-server. Using local Javascript array store for audit history fallback.", err.message);
  }
}
