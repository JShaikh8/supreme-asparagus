// Cleanup script to delete old bulk comparison jobs with broken comparisonResultId
const mongoose = require('mongoose');

// MongoDB connection string - update this to match your .env
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://your-connection-string';

async function cleanup() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('Connected successfully');

    // Delete all bulk comparison jobs
    const ComparisonJob = mongoose.model('ComparisonJob', new mongoose.Schema({}, { strict: false }));
    const result = await ComparisonJob.deleteMany({});

    console.log(`✅ Deleted ${result.deletedCount} old bulk comparison jobs`);
    console.log('You can now run a fresh bulk comparison with the fixed code!');

    await mongoose.connection.close();
    console.log('Connection closed');
  } catch (error) {
    console.error('Error during cleanup:', error);
    process.exit(1);
  }
}

cleanup();
