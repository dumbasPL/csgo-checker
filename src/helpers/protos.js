import { readdirSync, existsSync } from "fs";
import { resolve } from "path";
import { Root } from "protobufjs";


export function loadProtos(protos, ignoreErrors = true) {
  const protobufs = {};

  for (let proto of protos) {
    let root = new Root();
    let files = Array.isArray(proto.protos) ? proto.protos : readdirSync(proto.protos).map(file => resolve(proto.protos, file));

    for (let file of files) {
      if (!file.endsWith(".proto") || !existsSync(file)) {
        continue;
      }

      try {
        root = root.loadSync(file, {
          keepCase: true					
        });
      } catch (err) {
        if (!ignoreErrors) {
          throw err;
        }
      };
    }

    protobufs[proto.name] = root;
  }

  return protobufs;
}