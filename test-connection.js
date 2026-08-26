const { MongoClient } = require('mongodb');
const dns = require('dns');
require('dotenv').config({ path: 'atlas-credentials.env' });

// Fix DNS SRV resolution on Windows by using public DNS servers
dns.setServers(['8.8.8.8', '1.1.1.1']);

async function testConnection() {
  const uri = process.env.MONGODB_URI;
  
  if (!uri) {
    console.error('❌ MONGODB_URI not found in atlas-credentials.env');
    process.exit(1);
  }

  console.log('🔌 Connecting to MongoDB Atlas...');
  console.log(`📡 Cluster: ${uri.replace(/\/\/.*@/, '//<hidden>@')}`);

  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('✅ Connected successfully!');

    // List databases
    const databasesList = await client.db().admin().listDatabases();
    console.log('\n📂 Databases:');
    databasesList.databases.forEach(db => {
      console.log(`  - ${db.name} (${(db.sizeOnDisk / 1024 / 1024).toFixed(2)} MB)`);
    });

    // Ping
    const pingResult = await client.db().command({ ping: 1 });
    console.log('\n🏓 Ping:', pingResult.ok === 1 ? 'OK' : 'Failed');

    console.log('\n🎉 All tests passed!');
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    process.exit(1);
  } finally {
    await client.close();
    console.log('👋 Connection closed.');
  }
}

testConnection();
