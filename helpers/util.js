module.exports = {
  penalty_reason_string: penalty_reason_string,
  rank_string: rank_string,
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
  case 10: return "Overwatch(Cheat)";
  case 11: return "Overwatch(Grief)";
  case 16: return "Failed To Connect";
  case 17: return "Kick Abuse";
  case 18: 
  case 19: 
  case 20: return "Rank Calibration";
  default: return `Unknown(${id})`;
  }
}

function rank_string(id, wins) {
  switch (id)
  {
      case 0:	
          if(wins >= 10) {
              return "Expired";
          }
          return "Unranked";
  case 1:	return "S1";
  case 2:	return "S2";
  case 3:	return "S3";
  case 4:	return "S4";
  case 5:	return "S5";
  case 6:	return "S6";
  case 7:	return "G1";
  case 8:	return "G2";
  case 9:	return "G3";
  case 10: return "G4";
  case 11: return "MG1";
  case 12: return "MG2";
  case 13: return "MGE";
  case 14: return "DMG";
  case 15: return "LE";
  case 16: return "LEM";
  case 17: return "Supreme";
      case 18: return "Global";
      default: return `Unknown(${id})`;
  }
}