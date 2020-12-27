const Protobuf = require("protobufjs");
const fs = require("fs");
const path = require("path");

module.exports = Protos;

function Protos(protos, ignoreErrors = true) {
	const protobufs = {};

	for (let proto of protos) {
		let root = new Protobuf.Root();
		let files = Array.isArray(proto.protos) ? proto.protos : fs.readdirSync(proto.protos).map(file => path.join(proto.protos, file));

		for (let file of files) {
			if (!file.endsWith(".proto") || !fs.existsSync(file)) {
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