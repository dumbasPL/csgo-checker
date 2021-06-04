module.exports = {
  penalty_reason_string,
  penalty_reason_permanent,
  protoDecode,
  protoEncode
}

function penalty_reason_string(id) {
  switch (id)
  {
  case 0: return 0;
  case 1: return "Kicked";
  case 2: return "TK Limit";
  case 3: return "TK Spawn";
  case 4: return "Disconnected Too Long";
  case 5: return "Abandon";
  case 6: return "TD Limit";
  case 7: return "TD Spawn";
  case 8: 
  case 14: return "Untrusted";
  case 9: return "Kicked Too Much";
  case 10: return "Overwatch (Cheat)";
  case 11: return "Overwatch (Grief)";
  case 16: return "Failed To Connect";
  case 17: return "Kick Abuse";
  case 18: 
  case 19: 
  case 20: return "Rank Calibration";
  default: return `Unknown(${id})`;
  }
}

function penalty_reason_permanent(id) {
  switch (id)
  {
  case 8: 
  case 14:
  case 10:
    return true;
  default: 
    return false;
  }
}

function protoDecode(proto, obj) {
  return proto.toObject(proto.decode(obj), { defaults: true });
}

function protoEncode(proto, obj) {
  return proto.encode(proto.create(obj)).finish();
}