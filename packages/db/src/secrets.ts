import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { dataDir } from './paths'

const ALGORITHM = 'aes-256-gcm'
const ENVELOPE_PREFIX = 'enc:v1:'
const IV_BYTES = 12
const TAG_BYTES = 16
const KEY_BYTES = 32
const SALT_BYTES = 16

const KEY_FILE = join(dataDir, 'secrets.key')
const SALT_FILE = join(dataDir, 'secrets.salt')

let cachedKey: Buffer | null = null

/** Provider and assistant credentials are stored under `...key` setting names. */
export function isSecretSetting(key: string): boolean {
  return key.endsWith('.key')
}

export function isEncryptedSecret(value: string): boolean {
  return value.startsWith(ENVELOPE_PREFIX)
}

function parseRawKey(value: string): Buffer | null {
  if (/^[0-9a-f]{64}$/i.test(value)) return Buffer.from(value, 'hex')
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(value)) return null
  const decoded = Buffer.from(value, 'base64')
  return decoded.length === KEY_BYTES ? decoded : null
}

function readOrCreateSalt(): Buffer {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 })
  try {
    const salt = readFileSync(SALT_FILE)
    if (salt.length !== SALT_BYTES) {
      throw new Error(`${SALT_FILE} is corrupt: expected ${SALT_BYTES} bytes`)
    }
    chmodSync(SALT_FILE, 0o600)
    return salt
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  try {
    writeFileSync(SALT_FILE, randomBytes(SALT_BYTES), { mode: 0o600, flag: 'wx' })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  }
  chmodSync(SALT_FILE, 0o600)
  return readFileSync(SALT_FILE)
}

function deriveKeyFromEnvironment(secret: string): Buffer {
  const raw = parseRawKey(secret)
  if (raw) return raw
  // A passphrase gets a persistent salt so the same secret derives the same key.
  return scryptSync(secret, readOrCreateSalt(), KEY_BYTES, {
    N: 2 ** 15,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  })
}

function readOrCreateKeyFile(): Buffer {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 })
  try {
    const key = readFileSync(KEY_FILE)
    if (key.length !== KEY_BYTES) {
      throw new Error(`${KEY_FILE} is corrupt: expected ${KEY_BYTES} bytes`)
    }
    chmodSync(KEY_FILE, 0o600)
    return key
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  try {
    writeFileSync(KEY_FILE, randomBytes(KEY_BYTES), { mode: 0o600, flag: 'wx' })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  }
  chmodSync(KEY_FILE, 0o600)
  return readFileSync(KEY_FILE)
}

function masterKey(): Buffer {
  if (cachedKey) return cachedKey
  const secret = process.env.SUNNYGEN_SECRET?.trim()
  cachedKey = secret ? deriveKeyFromEnvironment(secret) : readOrCreateKeyFile()
  return cachedKey
}

/**
 * AES-256-GCM with the setting name as additional authenticated data, so a
 * ciphertext cannot be moved to another setting without failing the tag check.
 */
export function encryptSecret(settingKey: string, plaintext: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, masterKey(), iv)
  cipher.setAAD(Buffer.from(settingKey, 'utf8'))
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return ENVELOPE_PREFIX + Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url')
}

export function decryptSecret(settingKey: string, value: string): string {
  if (!isEncryptedSecret(value)) return value
  const blob = Buffer.from(value.slice(ENVELOPE_PREFIX.length), 'base64url')
  if (blob.length < IV_BYTES + TAG_BYTES) {
    throw new Error(`Stored value for ${settingKey} is not a valid encrypted secret`)
  }
  try {
    const decipher = createDecipheriv(ALGORITHM, masterKey(), blob.subarray(0, IV_BYTES))
    decipher.setAAD(Buffer.from(settingKey, 'utf8'))
    decipher.setAuthTag(blob.subarray(IV_BYTES, IV_BYTES + TAG_BYTES))
    return Buffer.concat([decipher.update(blob.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString(
      'utf8',
    )
  } catch {
    throw new Error(
      `Cannot decrypt ${settingKey}. Restore the original secret key (${KEY_FILE} or SUNNYGEN_SECRET), or clear the key and enter it again.`,
    )
  }
}

/**
 * Encrypts legacy plaintext rows. Returns the number of rows that need updating
 * via the callback, so the caller controls the transaction.
 */
export function migrateSecretRows(
  rows: ReadonlyArray<{ key: string; value: string }>,
  update: (key: string, encrypted: string) => void,
): number {
  let migrated = 0
  for (const row of rows) {
    if (!isSecretSetting(row.key) || isEncryptedSecret(row.value)) continue
    update(row.key, encryptSecret(row.key, row.value))
    migrated += 1
  }
  return migrated
}
