const { MongoClient } = require('mongodb');
const dns = require('dns');
const fs = require('fs');
require('dotenv').config({ path: 'atlas-credentials.env' });

// Fix DNS SRV resolution on Windows
dns.setServers(['8.8.8.8', '1.1.1.1']);

async function pullData() {
  const uri = process.env.MONGODB_URI;
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB Atlas\n');

    // List all databases
    const databasesList = await client.db().admin().listDatabases();
    console.log('📂 All databases:');
    databasesList.databases.forEach(db => {
      console.log(`  - ${db.name} (${(db.sizeOnDisk / 1024 / 1024).toFixed(2)} MB)`);
    });

    // Try both possible names
    const possibleNames = ['ample_mflix', 'sample_mflix'];
    let dbName = null;

    for (const name of possibleNames) {
      try {
        const collections = await client.db(name).listCollections().toArray();
        if (collections.length > 0) {
          dbName = name;
          console.log(`\n✅ Found database: "${name}"`);
          console.log(`   Collections: ${collections.map(c => c.name).join(', ')}`);
          break;
        }
      } catch (e) {
        // ignore
      }
    }

    if (!dbName) {
      console.log('\n❌ Neither "ample_mflix" nor "sample_mflix" found on this cluster.');
      console.log('   Did you mean "sample_mflix"? You may need to load the sample dataset in Atlas.');
      return;
    }

    // Pull all collections
    const db = client.db(dbName);
    const collections = await db.listCollections().toArray();
    
    const outputDir = `./data/${dbName}`;
    fs.mkdirSync(outputDir, { recursive: true });

    for (const collInfo of collections) {
      const collName = collInfo.name;
      console.log(`\n📄 Pulling collection: ${collName}...`);
      
      const docs = await db.collection(collName).find({}).toArray();
      console.log(`   Found ${docs.length} documents`);
      
      const filePath = `${outputDir}/${collName}.json`;
      fs.writeFileSync(filePath, JSON.stringify(docs, null, 2));
      console.log(`   Saved to ${filePath}`);
    }

    console.log(`\n🎉 All data saved to ${outputDir}/`);
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.close();
    console.log('👋 Connection closed.');
  }
}

pullData();
