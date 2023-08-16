module.exports = {
  target: (dependencyName, parsedVersion) => {
    return dependencyName === 'protobufjs' ? 'minor' : 'latest'
  }
}
