import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

type DeployConfig = {
  region: string;
  project: string;
  bucket: string;
  vpcId: string;
  subnetId: string;
  appSecurityGroupId: string;
  dbSecurityGroupId: string;
  dbInstanceId: string;
  dbName: string;
  dbUser: string;
  dbPassword: string;
  dbEndpoint: string;
  amiId: string;
  instanceType: string;
  cloudFrontDistributionId?: string;
  cloudFrontDomainName?: string;
};

const configPath = ".aws-deploy.json";

async function aws(args: string[], options: { json?: boolean } = {}) {
  const result = Bun.spawnSync(["aws", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = result.stdout.toString();
  const stderr = result.stderr.toString();

  if (!result.success) {
    throw new Error(`aws ${args.join(" ")} failed\n${stderr || stdout}`);
  }

  return options.json ? JSON.parse(stdout || "null") : stdout.trim();
}

async function sh(args: string[]) {
  const result = Bun.spawnSync(args, {
    stdout: "inherit",
    stderr: "inherit",
  });

  if (!result.success) {
    throw new Error(`${args.join(" ")} failed`);
  }
}

async function readConfig(): Promise<DeployConfig> {
  return JSON.parse(await Bun.file(configPath).text());
}

async function dbEndpoint(config: DeployConfig) {
  const db = await aws(
    [
      "rds",
      "describe-db-instances",
      "--region",
      config.region,
      "--db-instance-identifier",
      config.dbInstanceId,
      "--query",
      "DBInstances[0].{Status:DBInstanceStatus,Endpoint:Endpoint.Address}",
      "--output",
      "json",
    ],
    { json: true },
  );

  return db as { Status: string; Endpoint?: string };
}

async function waitForDb(config: DeployConfig) {
  const current = await dbEndpoint(config);

  if (current.Status === "stopped") {
    console.log("Starting stopped RDS instance...");
    await aws([
      "rds",
      "start-db-instance",
      "--region",
      config.region,
      "--db-instance-identifier",
      config.dbInstanceId,
    ]);
  }

  if (current.Status !== "available") {
    console.log("Waiting for RDS to become available...");
    await aws([
      "rds",
      "wait",
      "db-instance-available",
      "--region",
      config.region,
      "--db-instance-identifier",
      config.dbInstanceId,
    ]);
  }

  const ready = await dbEndpoint(config);
  if (!ready.Endpoint) {
    throw new Error("RDS is available but no endpoint was returned.");
  }

  return ready.Endpoint;
}

async function envForRemote(
  config: DeployConfig,
  endpoint: string,
  publicHostPlaceholder = "__PUBLIC_HOST__",
) {
  const localEnv = await Bun.file(".env").text();
  const skippedEnvKeys = new Set(["DATABASE_URL", "NODE_ENV", "PORT", "APP_URL"]);
  const lines = localEnv
    .split("\n")
    .filter((line) => line.trim() && !line.trimStart().startsWith("#"))
    .filter((line) => {
      const key = line.split("=", 1)[0]?.trim() ?? "";
      return !skippedEnvKeys.has(key);
    });

  const appUrl = config.cloudFrontDomainName
    ? `https://${config.cloudFrontDomainName}`
    : `http://${publicHostPlaceholder}:3000`;

  lines.push(
    `DATABASE_URL=postgres://${config.dbUser}:${config.dbPassword}@${endpoint}:5432/${config.dbName}?sslmode=require`,
    "NODE_ENV=production",
    "PORT=3000",
    `APP_URL=${appUrl}`,
  );

  return `${lines.join("\n")}\n`;
}

async function makeArtifact(config: DeployConfig) {
  const release = `${new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, "")
    .slice(0, 14)}-${createHash("sha1").update(`${Date.now()}`).digest("hex").slice(0, 8)}`;
  const tempDir = await mkdtemp(path.join(tmpdir(), "cloudwalk-deploy-"));
  const tarPath = path.join(tempDir, "app.tgz");
  const key = `releases/app-${release}.tgz`;

  await sh([
    "tar",
    "--exclude=.git",
    "--exclude=node_modules",
    "--exclude=dist",
    "--exclude=.codex",
    "--exclude=.agents",
    "--exclude=.cursor",
    "--exclude=.aws-deploy.json",
    "--exclude=*.tgz",
    "-czf",
    tarPath,
    ".",
  ]);

  await aws([
    "s3",
    "cp",
    tarPath,
    `s3://${config.bucket}/${key}`,
    "--region",
    config.region,
    "--sse",
    "AES256",
  ]);
  await rm(tempDir, { recursive: true, force: true });

  return key;
}

async function writeUserData(config: DeployConfig, artifactUrl: string, endpoint: string) {
  const file = path.join(tmpdir(), `cloudwalk-user-data-${Date.now()}.sh`);
  const env = await envForRemote(config, endpoint);
  const script = `#!/bin/bash
set -exo pipefail
export HOME=/root
exec > >(tee /var/log/cloudwalk-agent-swarm-user-data.log|logger -t user-data -s 2>/dev/console) 2>&1

useradd --system --create-home --shell /sbin/nologin app || true
mkdir -p /opt/cloudwalk-agent-swarm
cd /opt/cloudwalk-agent-swarm
curl -fL '${artifactUrl}' -o /tmp/app.tgz
tar -xzf /tmp/app.tgz -C /opt/cloudwalk-agent-swarm
curl -fsSL https://bun.sh/install | BUN_INSTALL=/opt/bun bash
ln -sf /opt/bun/bin/bun /usr/local/bin/bun
cat > /opt/cloudwalk-agent-swarm/.env <<'ENVEOF'
${env}ENVEOF
TOKEN=$(curl -sX PUT http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 21600')
PUBLIC_HOST=$(curl -sH "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-hostname)
if [ -z "$PUBLIC_HOST" ]; then PUBLIC_HOST=$(curl -sH "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4); fi
sed -i "s|http://__PUBLIC_HOST__:3000|http://$PUBLIC_HOST:3000|" /opt/cloudwalk-agent-swarm/.env
bun install --frozen-lockfile
bun run build
for i in $(seq 1 60); do
  if bun run db:migrate; then break; fi
  sleep 5
  if [ "$i" = "60" ]; then exit 1; fi
done
bun run db:seed
bun run rag:ingest || true
chown -R app:app /opt/cloudwalk-agent-swarm
cat > /etc/systemd/system/cloudwalk-agent-swarm.service <<'SERVICEEOF'
[Unit]
Description=CloudWalk Agent Swarm Bun app
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/cloudwalk-agent-swarm
EnvironmentFile=/opt/cloudwalk-agent-swarm/.env
ExecStart=/usr/local/bin/bun src/index.ts
Restart=always
RestartSec=5
User=app
Group=app

[Install]
WantedBy=multi-user.target
SERVICEEOF
systemctl daemon-reload
systemctl enable --now cloudwalk-agent-swarm
`;

  await Bun.write(file, script);
  return file;
}

async function updateCloudFrontOrigin(config: DeployConfig, domainName: string) {
  if (!config.cloudFrontDistributionId) return;

  const distribution = (await aws(
    [
      "cloudfront",
      "get-distribution-config",
      "--id",
      config.cloudFrontDistributionId,
      "--output",
      "json",
    ],
    { json: true },
  )) as {
    ETag: string;
    DistributionConfig: { Origins: { Items: Array<{ Id: string; DomainName: string }> } };
  };

  const origin = distribution.DistributionConfig.Origins.Items.find(
    (item) => item.Id === "ec2-app-origin",
  );
  if (!origin) throw new Error("CloudFront origin ec2-app-origin was not found.");

  origin.DomainName = domainName;

  const configFile = path.join(tmpdir(), `cloudfront-config-${Date.now()}.json`);
  await Bun.write(configFile, JSON.stringify(distribution.DistributionConfig));

  console.log(`Updating CloudFront origin to ${domainName}...`);
  await aws([
    "cloudfront",
    "update-distribution",
    "--id",
    config.cloudFrontDistributionId,
    "--if-match",
    distribution.ETag,
    "--distribution-config",
    `file://${configFile}`,
  ]);
}

async function appInstances(config: DeployConfig, states = "pending,running,stopping,stopped") {
  return (await aws(
    [
      "ec2",
      "describe-instances",
      "--region",
      config.region,
      "--filters",
      `Name=tag:Project,Values=${config.project}`,
      "Name=tag:Name,Values=cloudwalk-agent-swarm-app",
      `Name=instance-state-name,Values=${states}`,
      "--query",
      "Reservations[].Instances[].{Id:InstanceId,State:State.Name,PublicIp:PublicIpAddress,PublicDns:PublicDnsName}",
      "--output",
      "json",
    ],
    { json: true },
  )) as Array<{ Id: string; State: string; PublicIp?: string; PublicDns?: string }>;
}

async function terminateAppInstances(config: DeployConfig) {
  const instances = await appInstances(config);
  if (!instances.length) return;

  console.log(
    `Terminating old app instance(s): ${instances.map((instance) => instance.Id).join(", ")}`,
  );
  await aws([
    "ec2",
    "terminate-instances",
    "--region",
    config.region,
    "--instance-ids",
    ...instances.map((instance) => instance.Id),
  ]);
}

async function deploy() {
  const config = await readConfig();
  const endpoint = await waitForDb(config);
  const key = await makeArtifact(config);
  const artifactUrl = await aws([
    "s3",
    "presign",
    `s3://${config.bucket}/${key}`,
    "--region",
    config.region,
    "--expires-in",
    "3600",
  ]);
  const userData = await writeUserData(config, artifactUrl, endpoint);

  await terminateAppInstances(config);

  const instance = await aws([
    "ec2",
    "run-instances",
    "--region",
    config.region,
    "--image-id",
    config.amiId,
    "--instance-type",
    config.instanceType,
    "--subnet-id",
    config.subnetId,
    "--security-group-ids",
    config.appSecurityGroupId,
    "--associate-public-ip-address",
    "--user-data",
    `file://${userData}`,
    "--tag-specifications",
    `ResourceType=instance,Tags=[{Key=Name,Value=cloudwalk-agent-swarm-app},{Key=Project,Value=${config.project}}]`,
    "--query",
    "Instances[0].InstanceId",
    "--output",
    "text",
  ]);

  console.log(`Launched ${instance}. Waiting for it to run...`);
  await aws([
    "ec2",
    "wait",
    "instance-running",
    "--region",
    config.region,
    "--instance-ids",
    instance,
  ]);

  const instances = await appInstances(config, "running");
  const current = instances.find((item) => item.Id === instance);
  if (!current?.PublicIp) throw new Error("Instance is running but no public IP was returned.");
  if (!current.PublicDns)
    throw new Error("Instance is running but no public DNS name was returned.");

  const healthUrl = `http://${current.PublicIp}:3000/api/health`;
  for (let attempt = 1; attempt <= 90; attempt += 1) {
    try {
      const response = await fetch(healthUrl, { signal: AbortSignal.timeout(8000) });
      if (response.ok) {
        await updateCloudFrontOrigin(config, current.PublicDns);
        console.log(`Deployed: http://${current.PublicIp}:3000/`);
        if (config.cloudFrontDomainName)
          console.log(`HTTPS: https://${config.cloudFrontDomainName}/`);
        console.log(`Health: ${await response.text()}`);
        return;
      }
    } catch {
      // First boot is expected to reject connections until cloud-init finishes.
    }
    await Bun.sleep(10_000);
  }

  throw new Error(`Timed out waiting for ${healthUrl}`);
}

async function status() {
  const config = await readConfig();
  const [db, instances] = await Promise.all([dbEndpoint(config), appInstances(config)]);
  console.log(`RDS ${config.dbInstanceId}: ${db.Status} ${db.Endpoint ?? ""}`);
  for (const instance of instances) {
    console.log(
      `EC2 ${instance.Id}: ${instance.State} ${instance.PublicIp ? `http://${instance.PublicIp}:3000/` : ""}`,
    );
  }
  if (config.cloudFrontDomainName) {
    console.log(`HTTPS: https://${config.cloudFrontDomainName}/`);
  }
}

async function down() {
  const config = await readConfig();
  await terminateAppInstances(config);

  const db = await dbEndpoint(config);
  if (db.Status === "available") {
    console.log("Stopping RDS instance. AWS can automatically restart stopped RDS after 7 days.");
    await aws([
      "rds",
      "stop-db-instance",
      "--region",
      config.region,
      "--db-instance-identifier",
      config.dbInstanceId,
    ]);
  } else {
    console.log(`RDS is ${db.Status}; leaving it as-is.`);
  }
}

async function destroy() {
  const config = await readConfig();
  await terminateAppInstances(config);
  console.log("Deleting RDS without a final snapshot...");
  await aws([
    "rds",
    "delete-db-instance",
    "--region",
    config.region,
    "--db-instance-identifier",
    config.dbInstanceId,
    "--skip-final-snapshot",
    "--delete-automated-backups",
  ]);
}

const command = process.argv[2];

try {
  if (command === "deploy") await deploy();
  else if (command === "status") await status();
  else if (command === "down") await down();
  else if (command === "destroy") await destroy();
  else {
    console.log("Usage: bun run scripts/aws-deploy.ts <deploy|status|down|destroy>");
    process.exit(1);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
