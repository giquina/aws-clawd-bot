// Quick deployment script using AWS SDK
const { EC2InstanceConnectClient, SendSSHPublicKeyCommand } = require('@aws-sdk/client-ec2-instance-connect');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

const execAsync = promisify(exec);

const config = {
  instanceId: 'i-009f070a76a0d91c1',
  instanceIp: '16.171.150.151',
  region: 'eu-north-1',
  user: 'ubuntu',
  appPath: '/opt/clawd-bot'
};

async function deploy() {
  console.log('🚀 Quick Deploy to AWS EC2');
  console.log('=' .repeat(40));

  // Get SSH public key
  const sshPubKeyPath = process.env.HOME + '/.ssh/id_rsa.pub';
  const sshPubKey = fs.readFileSync(sshPubKeyPath, 'utf8').trim();
  console.log('✅ SSH public key loaded');

  // Send SSH key via EC2 Instance Connect
  const client = new EC2InstanceConnectClient({
    region: config.region,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
  });

  console.log('📤 Sending SSH key via EC2 Instance Connect...');
  const sendKeyCommand = new SendSSHPublicKeyCommand({
    InstanceId: config.instanceId,
    InstanceOSUser: config.user,
    SSHPublicKey: sshPubKey
  });

  try {
    await client.send(sendKeyCommand);
    console.log('✅ SSH key sent (valid for 60 seconds)');
  } catch (err) {
    console.error('❌ Failed to send SSH key:', err.message);
    process.exit(1);
  }

  // Wait a moment
  await new Promise(r => setTimeout(r, 2000));

  // Upload tarball via SCP
  const tarPath = '/tmp/clawd-deploy.tar.gz';
  console.log('📦 Uploading deployment package...');

  try {
    const scpCmd = `scp -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null ${tarPath} ${config.user}@${config.instanceIp}:/tmp/`;
    await execAsync(scpCmd, { timeout: 60000 });
    console.log('✅ Package uploaded');
  } catch (err) {
    console.error('❌ SCP failed:', err.message);
    process.exit(1);
  }

  // SSH commands to deploy
  const deployCommands = [
    `cd ${config.appPath}`,
    'sudo tar -xzf /tmp/clawd-deploy.tar.gz --strip-components=0',
    'cd 02-whatsapp-bot && npm install --production 2>/dev/null',
    'cp ../config/.env.local .env',
    'pm2 restart clawd-bot || pm2 start index.js --name clawd-bot',
    'pm2 save',
    'echo "DEPLOYED: $(date)"'
  ].join(' && ');

  console.log('🔧 Running deployment commands...');

  try {
    const sshCmd = `ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null ${config.user}@${config.instanceIp} "${deployCommands}"`;
    const { stdout, stderr } = await execAsync(sshCmd, { timeout: 120000 });
    console.log(stdout);
    if (stderr) console.log(stderr);
    console.log('✅ Deployment complete!');
  } catch (err) {
    console.error('❌ Deployment failed:', err.message);
    if (err.stdout) console.log(err.stdout);
    if (err.stderr) console.log(err.stderr);
    process.exit(1);
  }

  // Verify health
  console.log('\n🏥 Checking health endpoint...');
  try {
    const { stdout } = await execAsync(`curl -s http://${config.instanceIp}:3000/health`, { timeout: 10000 });
    const health = JSON.parse(stdout);
    console.log('✅ Server online!');
    console.log(`   Status: ${health.status}`);
    console.log(`   Uptime: ${Math.floor(health.uptime)}s`);
    console.log(`   Features: ${Object.entries(health.features).filter(([,v]) => v).map(([k]) => k).join(', ')}`);
  } catch (err) {
    console.log('⚠️  Health check failed (server may be starting)');
  }
}

// Load env
require('dotenv').config({ path: path.join(__dirname, '../config/.env.local') });

deploy().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
