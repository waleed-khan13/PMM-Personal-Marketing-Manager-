import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  AuditEvent,
  GeneratedPost,
  ProviderKind,
  PublicAppState,
  WorkspaceSettings,
} from "@/lib/app-types";

type EncryptedSecret = {
  iv: string;
  tag: string;
  value: string;
};

type StoredProviderSettings = {
  kind: ProviderKind;
  baseUrl: string;
  model: string;
  apiKey: EncryptedSecret | null;
  updatedAt: string | null;
};

type StoredTelegramSettings = {
  chatId: string;
  botToken: EncryptedSecret | null;
  webhookSecret: EncryptedSecret | null;
  webhookUrl: string;
  lastUpdateId: number;
  updatedAt: string | null;
};

export type StoredDatabase = {
  version: 1;
  workspace: WorkspaceSettings;
  provider: StoredProviderSettings;
  telegram: StoredTelegramSettings;
  posts: GeneratedPost[];
  audit: AuditEvent[];
};

const configuredDataRoot = process.env.LOCALGROWTH_DATA_DIR;
const dataRoot = configuredDataRoot
  ? path.resolve(configuredDataRoot)
  : path.join(/* turbopackIgnore: true */ process.cwd(), "data");
const databasePath = path.join(dataRoot, "localgrowth.json");
const masterKeyPath = path.join(dataRoot, "master.key");

const emptyDatabase: StoredDatabase = {
  version: 1,
  workspace: {
    name: "My workspace",
    businessName: "",
    description: "",
    timezone: "Asia/Karachi",
  },
  provider: {
    kind: "ollama",
    baseUrl: "http://127.0.0.1:11434",
    model: "",
    apiKey: null,
    updatedAt: null,
  },
  telegram: {
    chatId: "",
    botToken: null,
    webhookSecret: null,
    webhookUrl: "",
    lastUpdateId: 0,
    updatedAt: null,
  },
  posts: [],
  audit: [],
};

let writeQueue: Promise<unknown> = Promise.resolve();

async function ensureDataRoot() {
  await mkdir(dataRoot, { recursive: true });
}

async function loadMasterKey() {
  await ensureDataRoot();
  try {
    const encoded = (await readFile(masterKeyPath, "utf8")).trim();
    const key = Buffer.from(encoded, "base64");
    if (key.length !== 32) throw new Error("Invalid local master key length.");
    return key;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code !== "ENOENT") throw error;
    const key = randomBytes(32);
    const temporaryPath = `${masterKeyPath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, key.toString("base64"), { encoding: "utf8", mode: 0o600 });
    await rename(temporaryPath, masterKeyPath);
    return key;
  }
}

export async function encryptSecret(secret: string): Promise<EncryptedSecret> {
  const key = await loadMasterKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return {
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    value: encrypted.toString("base64"),
  };
}

export async function decryptSecret(secret: EncryptedSecret | null): Promise<string> {
  if (!secret) return "";
  const key = await loadMasterKey();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(secret.iv, "base64"));
  decipher.setAuthTag(Buffer.from(secret.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(secret.value, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function normalizeDatabase(value: Partial<StoredDatabase>): StoredDatabase {
  return {
    ...emptyDatabase,
    ...value,
    workspace: { ...emptyDatabase.workspace, ...value.workspace },
    provider: { ...emptyDatabase.provider, ...value.provider },
    telegram: { ...emptyDatabase.telegram, ...value.telegram },
    posts: Array.isArray(value.posts)
      ? value.posts.map((post) => ({ ...post, revision: Number(post.revision) || 1 }))
      : [],
    audit: Array.isArray(value.audit) ? value.audit : [],
  };
}

export async function readDatabase(): Promise<StoredDatabase> {
  await ensureDataRoot();
  try {
    const contents = await readFile(databasePath, "utf8");
    return normalizeDatabase(JSON.parse(contents) as Partial<StoredDatabase>);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code !== "ENOENT") throw error;
    await writeFile(databasePath, JSON.stringify(emptyDatabase, null, 2), "utf8");
    return structuredClone(emptyDatabase);
  }
}

async function writeDatabase(database: StoredDatabase) {
  await ensureDataRoot();
  const temporaryPath = `${databasePath}.${process.pid}.${randomUUID()}.tmp`;
  const backupPath = `${databasePath}.bak`;
  await writeFile(temporaryPath, JSON.stringify(database, null, 2), { encoding: "utf8", mode: 0o600 });
  await copyFile(databasePath, backupPath).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
  await rename(temporaryPath, databasePath);
}

export async function updateDatabase(
  update: (database: StoredDatabase) => StoredDatabase | Promise<StoredDatabase>,
) {
  const operation = writeQueue.then(async () => {
    const current = await readDatabase();
    const next = await update(current);
    await writeDatabase(next);
    return next;
  });
  writeQueue = operation.catch(() => undefined);
  return operation;
}

export function appendAudit(
  database: StoredDatabase,
  event: Omit<AuditEvent, "id" | "createdAt">,
) {
  database.audit.unshift({
    ...event,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  });
  database.audit = database.audit.slice(0, 200);
}

export function toPublicState(database: StoredDatabase): PublicAppState {
  return {
    workspace: database.workspace,
    provider: {
      kind: database.provider.kind,
      baseUrl: database.provider.baseUrl,
      model: database.provider.model,
      hasApiKey: Boolean(database.provider.apiKey),
      configured: Boolean(database.provider.baseUrl && database.provider.model),
      updatedAt: database.provider.updatedAt,
    },
    telegram: {
      chatId: database.telegram.chatId,
      hasBotToken: Boolean(database.telegram.botToken),
      configured: Boolean(database.telegram.chatId && database.telegram.botToken),
      webhookUrl: database.telegram.webhookUrl,
      webhookConfigured: Boolean(database.telegram.webhookUrl && database.telegram.webhookSecret),
      updatedAt: database.telegram.updatedAt,
    },
    posts: database.posts,
    audit: database.audit,
    runtime: {
      version: "0.2.0",
      mode: process.env.DEPLOYMENT_MODE || "local_trusted",
      persistent: true,
    },
  };
}
