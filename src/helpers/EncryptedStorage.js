import JSONdb from 'simple-json-db';
import { randomBytes, createDecipheriv, createCipheriv } from 'crypto';
import { pbkdf2 as deriveKey } from "pbkdf2";
import { EventEmitter } from 'events';
import { inherits } from 'util';
import { statSync, accessSync, constants, readFileSync, writeFile, writeFileSync } from "fs";

const DERIVATION_ROUNDS = 200000;
const HMAC_KEY_SIZE = 32;
const PASSWORD_KEY_SIZE = 32;

const defaultOptions = {
  asyncWrite: false,
  syncOnWrite: true,
  jsonSpaces: 4
};

function pbkdf2(password, salt, rounds, bits) {
  return new Promise((resolve, reject) => {
    deriveKey(password, salt, rounds, bits / 8, "sha256", (err, key) => {
      if (err) {
        return reject(err);
      }
      return resolve(key);
    });
  });
}

async function deriveFromPassword(password, salt, rounds) {
  if (!password) {
    throw new Error("Failed deriving key: Password must be provided");
  }
  if (!salt) {
    throw new Error("Failed deriving key: Salt must be provided");
  }
  if (!rounds || rounds <= 0 || typeof rounds !== "number") {
    throw new Error("Failed deriving key: Rounds must be greater than 0");
  }
  const bits = (PASSWORD_KEY_SIZE + HMAC_KEY_SIZE) * 8;
  const derivedKeyData = await pbkdf2(password, salt, rounds, bits);
  const derivedKeyHex = derivedKeyData.toString("hex");
  return Buffer.from(derivedKeyHex.substr(0, derivedKeyHex.length / 2), "hex");
}

function generateSalt(length) {
  if (length <= 0) {
    throw new Error(`Failed generating salt: Invalid length supplied: ${length}`);
  }
  let output = "";
  while (output.length < length) {
    output += randomBytes(3).toString("base64");
    if (output.length > length) {
      output = output.substr(0, length);
    }
  }
  return output;
}

function validateJSON(fileContent) {
  try {
    JSON.parse(fileContent);
  } catch (e) {
    throw new Error('Given filePath is not empty and its content is not valid JSON.');
  }
  return true;
};

class EncryptedStorage {

  /**
   * Main constructor, manages existing storage file and parses options against default ones.
   * @param {string} filePath The path of the file to use as storage.
   * @param {string} iv Encryption initialization vector
   * @param {string} salt Password salt used to derive the key
   * @param {string} password Encryption password
   * @param {object} [options] Configuration options.
   * @param {boolean} [options.asyncWrite] Enables the storage to be asynchronously written to disk. Disabled by default (synchronous behaviour).
   * @param {boolean} [options.syncOnWrite] Makes the storage be written to disk after every modification. Enabled by default.
   * @param {boolean} [options.syncOnWrite] Makes the storage be written to disk after every modification. Enabled by default.
   * @param {number} [options.jsonSpaces] How many spaces to use for indentation in the output json files. Default = 4
   * @param {object} [options.newData] Data that will be encrypted for the first time
   * @constructor
   */
  constructor(filePath, password, options) {
    // Mandatory arguments check
    if (!filePath || !filePath.length) {
      throw new Error('Missing file path argument.');
    } else {
      this.filePath = filePath;
    }

    // Options parsing
    if (options) {
      for (let key in defaultOptions) {
        if (!options.hasOwnProperty(key)) options[key] = defaultOptions[key];
      }
      this.options = options;
    } else {
      this.options = defaultOptions;
    }

    this.storage = {};

    if (!this.options.newData) {
      // File existence check
      let stats;
      try {
        stats = statSync(filePath);
      } catch (err) {
        if (err.code === 'ENOENT') {
          /* File doesn't exist */
          this.iv = randomBytes(16).toString('hex');
          this.salt = generateSalt(12);

          deriveFromPassword(password, this.salt, DERIVATION_ROUNDS).then(derivedKey => {
            try {
              this.derivedKey = derivedKey;
              this.sync();
              this.emit('loaded');
            } catch (error) {
              this.emit('error', error);
            }
          });
          return;
        } else if (err.code === 'EACCES') {
          throw new Error(`Cannot access path "${filePath}".`);
        } else {
          // Other error
          throw new Error(`Error while checking for existence of path "${filePath}": ${err}`);
        }
      }
      /* File exists */
      try {
        accessSync(filePath, constants.R_OK | constants.W_OK);
      } catch (err) {
        throw new Error(`Cannot read & write on path "${filePath}". Check permissions!`);
      }
      if (stats.size > 0) {
        let data;
        try {
          data = readFileSync(filePath);
        } catch (err) {
          throw err;
        }
        if (validateJSON(data)) {
          const input_data = JSON.parse(data);
  
          if (!input_data.iv || !input_data.salt || !input_data.data) {
            throw new Error('Invalid file');
          }
  
          this.iv = input_data.iv;
          this.salt = input_data.salt;
  
          deriveFromPassword(password, this.salt, DERIVATION_ROUNDS).then(derivedKey => {
            try {
              this.derivedKey = derivedKey;
      
              const decryptTool = createDecipheriv("aes-256-cbc", this.derivedKey, Buffer.from(this.iv, 'hex'));
              let decryptedData = decryptTool.update(input_data.data, "base64", "utf8");
              decryptedData += decryptTool.final("utf8");

              if (validateJSON(decryptedData)) {
                this.storage = JSON.parse(decryptedData);
              }
              this.emit('loaded');
            } catch (error) {
              this.emit('error', error);
            }
          });
        }
      }
    }
    else {
      this.iv = randomBytes(16).toString('hex');
      this.salt = generateSalt(12);

      deriveFromPassword(password, this.salt, DERIVATION_ROUNDS).then(derivedKey => {
        try {
          this.derivedKey = derivedKey;
          this.storage = options.newData;
          this.sync();
          this.emit('loaded');
        } catch (error) {
          this.emit('error', error);
        }
      });
    }

  }

  sync() {
    const json = JSON.stringify(this.storage, null, this.options.jsonSpaces);

    const encryptTool = createCipheriv("aes-256-cbc", this.derivedKey, Buffer.from(this.iv, 'hex'));
  
    let encryptedData = encryptTool.update(json, "utf8", "base64");
    encryptedData += encryptTool.final("base64");

    const finalJson = JSON.stringify({
      iv: this.iv,
      salt: this.salt,
      data: encryptedData
    })

    if (this.options && this.options.asyncWrite) {
      writeFile(this.filePath, finalJson, (err) => {
        if (err) throw err;
      });
    } else {
      try {
        writeFileSync(this.filePath, finalJson);
      } catch (err) {
        if (err.code === 'EACCES') {
          throw new Error(`Cannot access path "${this.filePath}".`);
        } else {
          throw new Error(`Error while writing to path "${this.filePath}": ${err}`);
        }
      }
    }
  }
}

inherits(JSONdb, EventEmitter);
inherits(EncryptedStorage, JSONdb);

export default EncryptedStorage;