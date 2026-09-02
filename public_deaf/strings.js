// All player-visible text. Switching language = swapping this file's data.
export const STR = {
  title: "APOCALYPSE MEOW",
  subtitle: "Vietnam. 1968. It's raining rats.",
  start: "START MISSION",
  joinRoom: "JOIN ROOM",
  copyInvite: "COPY INVITE LINK",
  copied: "COPIED!",
  waiting: "Waiting for a second cat... or go in alone.",
  lobbyTitle: "MISSION BRIEFING",
  pickHero: "PICK YOUR CAT",
  briefText: "LZ CATNIP, 0600. Get in, push east, find out why Charlie's gone quiet. You're Sgt. Whiskers. Your squad rides with you.",
  heroUsName: "SGT. WHISKERS",
  heroUsDesc: "US Army. Heavy firepower. Hates Mondays and mice.",
  heroVcName: "TRUNG SĨ MÈO",
  heroVcDesc: "Guerrilla legend. The tunnels remember.",
  ready: "READY",
  notReady: "NOT READY",
  begin: "GO GO GO!",
  spectating: "SPECTATING — the couch is safe",
  hostLeft: "The host cat abandoned the litter. Waiting for them to return...",
  reconnecting: "Reconnecting...",
  youDied: "K.I.A.",
  tunnelDown: "DOWN IN THE DARK",
  pressToRise: "PRESS J — GET UP AND FIGHT",
  livesLeft: "LIVES",
  gameOver: "MISSION FAILED",
  // v13.4 (Dylan: "I think the Chancellor Grimtail thing is the end of part
  // one, and then there's part two.")
  victory: "END OF PART ONE",
  victorySub: "TO BE CONTINUED — PART TWO",
  playAgain: "START OVER",
  continueRun: "CONTINUE FROM CHECKPOINT",
  continued: "BACK IN THE FIGHT",
  backToLobby: "BACK TO SQUAD ROOM",
  score: "SCORE",
  pows: "POWS RESCUED",
  deaths: "DEATHS",
  rank: "RANK",
  best: "BEST",
  newRecord: "★ NEW RECORD ★",
  actA: "ACT I — RIVER PATROL",
  actTunnel: "THE TUNNEL",
  actB: "ACT II — THEY CAME FOR THE CHEESE",
  actBoss: "FINAL — THE GOUDA MOTHERSHIP",
  invasion: "ALIEN INVASION!",
  truce: "CEASEFIRE! ALL CATS, ONE FIGHT!",
  squadDown: "SQUAD DOWN!",
  mittensTaken: "THEY TOOK PVT. MITTENS!",
  buddyDown: "CPL. BOOTS IS DOWN!",
  pinned: "PINNED DOWN!",
  airHint: "PRESS L — CALL IN AIR SUPPORT",
  airInbound: "AIR SUPPORT INBOUND — GET DOWN!",
  mittensFreed: "PVT. MITTENS RESCUED!",
  ctlMove: "A/D MOVE · SPACE JUMP · J FIRE",
  fpsEnter: "INTO THE TUNNELS",
  actGroundwar: "ACT II — THE GROUND WAR",
  gotShotgunW: "TRENCH BROOM!",
  gotRocket: "LAW TUBE!",
  gotSkip: "SKIPPER — BOUNCING NAPALM!",
  fpsControls: "A/D TURN · W FORWARD · SPACE SPRINT · J FIRE · K CLAWS · L SWAP WEAPON",
  fpsObjective0: "FIND PVT. MITTENS. GET OUT ALIVE.",
  fpsObjective1: "CLEAR THE NEST.",
  fpsNeedMittens: "NOT WITHOUT MITTENS — HE'S DOWN HERE SOMEWHERE",
  fpsMittensNear: "THAT'S HIM. MITTENS IS CLOSE — KEEP GOING",
  fpsNest: "PRESS S — DROP INTO THE RAT NEST",
  gotShotgun: "SHOTGUN!",
  nestCleared: "NEST CLEARED",
  gunSlapped: "HE SLAPPED YOUR GUN AWAY!",
  // v13: new tunnel beat -- see main.js mittensCut()
  mittensRemember: "I KNEW I FORGOT SOMETHING.",
  grabPrompt: "MASH J — RIP HIS THROAT OUT",
  throatRipped: "THROAT. RIPPED.",
  followLight: "FOLLOW THE LIGHT",
  outOfAmmo: "*CLICK* — OUT OF AMMO",
  // v13.9: you can reach the end of the duel without firing a shot. Then the
  // gun did not run dry, it jammed, and the banner should not lie about it.
  duelJam: "*CLICK* — THE GUN'S JAMMED",
  theyreOutToo: "...HE'S OUT TOO",
  actDoorgun: "RAT PATROL — MAN THE DOOR GUN",
  doorgunControls: "W/S ALTITUDE · A/D AIM GUN · J FIRE",
  doorgunDone: "LZ CLEAR — WHEELS DOWN",
  heliT2: "AIR DROP! ROCKET PODS BOLTED ON",
  heliT3: "AIR DROP! CHAIN GUN ONLINE",   // v13.7: Dylan -- "it should have probably said chain gun"
  heliStripped: "TURRET SHOT OFF! HULL BREACHED",
  heliStrippedPods: "ROCKET PODS SHOT OFF! HULL BREACHED",
  heliCritical: "MAYDAY — ONE HIT LEFT",
  heliPatched: "SUPPLY CRATE — ARMOUR PATCHED",
  actSkyraider: "TREELINE BURN — A-1 SKYRAIDER",
  skyControls: "W/S ALTITUDE · A/D SPEED · J GUNS · K NAPALM",
  skyDone: "TREELINE TORCHED",
  skyGroundStrike: "GROUND STRIKE — AIRFRAME TOOK IT",
  skyNapalmUp: "SUPPLY DROP — NAPALM RESTOCKED",
  skyGunsUp: "SUPPLY DROP — TWIN WING GUNS",
  skyRepair: "SUPPLY DROP — PATCHED UP",
  napalmOut: "NAPALM DRY",
  ctlAimUp: "HOLD W — AIM UP",
  ctlCrouch: "S — CROUCH / AIM DOWN IN AIR",
  ctlGrenade: "K — GRENADE",
  coreExposed: "CORE EXPOSED — HIT IT NOW!",
  cheeseMission: "SUPPLY DROP: THEY CAN'T RESIST CHEESE. BAIT THEM WITH L.",
  actRide: "ACT III — THE ROAD HOME",
  rideHint: "A/D SPEED · SPACE JUMP · W/S AIM · J MOUNTED GUN",
  gotGatling: "GATLING GUN!",
  gotRaygun: "ALIEN RAY GUN! RETURN TO SENDER.",
  gotFlame: "FLAMETHROWER!",
  gotHealth: "+HEALTH",
  gotGrenades: "+3 GRENADES",
  gotCheese: "+CHEESE LURE",
  // v13.9 laser pointer: the most cat weapon in the game. It does no damage.
  gotPointer: "LASER POINTER! THEY CANNOT HELP THEMSELVES.",
  pointerHint: "HOLD L — PAINT THE DOT. THEY'LL CHASE IT.",
  pointerDead: "POINTER BATTERY DEAD",
  // v13 cheese arc (Dylan: "yes the rats are here to steal our cheese... you
  // either poison or blow up their cheese that they're stealing")
  cheeseBurned: "THEIR CHEESE. MOLTEN.",
  cheeseObjective: "THEY CAME FOR THE CHEESE. BURN IT BEFORE THEY TAKE IT.",
  gotLife: "+1 LIFE",
  powFreed: "POW RESCUED!",
  bossWarning: "WARNING: BIG UGLY INCOMING",
  // v13.3: the three new rats shipped with no player-facing explanation at all
  teachRatjet: "ROCKET RATS — THEY FLY. HOLD W AND SHOOT UP",
  teachRatbig: "BRUISER RAT — IT CHARGES FASTER THAN YOU RUN. JUMP IT",
  teachRatmech: "RAT MECH — ARMOURED. GRENADES, OR RUN",
  // v11: PT-boat / surf / Chancellor Grimtail — game/boat.js and boss2.js
  // referenced these keys since v8/v9 but they were never added here (part
  // of why this content was never actually reachable — see changelog).
  actRiver: "ACT III, PART TWO — RIVER PATROL",
  riverControls: "W/S STEER · J BOW GUN · K DEPTH CHARGE",
  shipSighted: "SOMETHING HUGE, HIGH OVERHEAD...",
  // v13.9: the boat is not torpedoed by nobody any more. The scanner ship
  // finds you and burns it, and you watch it happen.
  shipScan: "IT CAME BACK. IT'S SEARCHING THE RIVER.",
  shipLock: "IT SEES YOU",
  ptboatDone: "BOAT'S GONE! GET ON SOMETHING THAT FLOATS!",
  chargesOut: "OUT OF DEPTH CHARGES",
  actSurf: "SWIM FOR IT — THE LZ IS CLOSE",
  surfControls: "W/S CARVE · J FIRE · K DUCK-DIVE",
  surfDone: "MADE IT TO THE LZ",
  parleyApproach: "A SHIP DESCENDS — HOLD YOUR FIRE",
  chancellorGreet: "\"WE COME TO TALK, NOT TO FIGHT.\"",
  chancellorOffer: "\"LAY DOWN YOUR ARMS, KITTENS.\"",
  heroSuspicious: "SGT. WHISKERS: \"...I DON'T LIKE THIS.\"",
  chancellorReveal: "IT'S A TRAP!",
  heroFireBack: "OPEN FIRE!",
  shieldNoEffect: "THE SHIELD HOLDS",
  chancellorLaugh: "\"HA HA HA — IS THAT ALL?\"",
  chancellorTaunt: "\"CHANCELLOR GRIMTAIL DOES NOT NEGOTIATE.\"",
  findWeakness: "HIT THE PYLONS WHEN THEY FLASH",
  parleyControls: "A/D DODGE · J FIRE",
  shieldDown: "SHIELD DOWN — HE'S OPEN!",
  chancellorDown: "CHANCELLOR GRIMTAIL DOWN",
  tapToStart: "TAP OR PRESS ANY KEY",
  skip: "SKIP ▶",
  watchIntro: "▶ PLAY", // v12 (Dylan: "get rid of roll film as well and just make it PLAY")
};

// Runtime cutscene subtitles — NOT baked into the video. Edit freely:
// [startSeconds, endSeconds, "text"] against each film's timeline.
export const SUBS = {
  intro: [
    [4.7, 7.4, "KITTY IN THE TREES!"],
  ],
  truce: [ // A brawl 0-8 · B rats 8-13 · C dialogue 13-25 · D handshake 25-30.3
    [13.4, 15.2, "What the hell is that?"],
    [15.4, 17.3, "Looks like we got a rat problem."],
    [17.5, 19.7, "Well I know how to set traps."],
    [19.9, 24.3, "Charlie, what do you say you and me send these rat bastards back to where they came from... Hell."],
    [24.4, 25.3, "I'm in."],
  ],
  victory: [],
  escape: [
    [2.2, 5.2, "GO! DON'T LOOK BACK!"],
    [11.5, 13.6, "Get in!"],
  ],
  mecha: [
    // v13.10: +2.328s. A 2.75s crash shot was inserted at 7.05 and 0.42s of
    // frozen frames were trimmed off the head of the shot after it, so every
    // cue past the join moves by the difference.
    [10.93, 13.73, "...you have GOT to be kidding me."],
    // v13.10 (Dylan): the bike line is gone. You can SEE them get on the bike;
    // narrating it over the top is the game explaining its own picture.
  ],
  // v13.10 (Dylan): same note as the bike. The film shows them reach the dock
  // and take the boat, so both lines were captioning the image.
  dock: [],
  parley: [
    [3.6, 5.8, "\"WE COME TO TALK, NOT TO FIGHT.\""],
    [6.4, 8.6, "\"LAY DOWN YOUR ARMS, KITTENS.\""],
  ],
  grimdeath: [],
  surfout: [], // pure action beat -- the torpedo hit and the board carry it
};

// v13.3 (Dylan: "the long sentence that the American cat says in the cut scene
// -- just make better meow sound effects... really funny ones with different
// pitches"). The cats' dialogue is subtitled but silent; these are meows fired
// under each line so they're actually SAYING it. [time, sfx, playbackRate].
// Rates give each speaker a voice: Whiskers low-ish, Charlie higher.
export const CUT_MEOWS = {
  escape: [
    [2.3, 'meow_a', 1.3], [11.6, 'meow_c', 0.9],
  ],
  mecha: [
    [8.7, 'meow_b', 0.85], [14.9, 'meow_a', 1.2],
  ],
  dock: [
    [2.5, 'meow_a', 1.05], [5.4, 'meow_b', 0.9],
  ],
  surfout: [
    [3.1, 'meow_b', 0.75],  // thrown from the boat -- the long underwater wail
    [6.8, 'meow_c', 1.5],   // Charlie paddling after him, squeaky and indignant
  ],
  // v13.5: the truce film's meows are now BAKED INTO ITS AUDIO TRACK (see
  // chunks.js), RMS-matched to the film's own dialogue. Firing this layer on
  // top as well would double every line, so the film carries it alone.
  truce: [],
};

Object.assign(STR, {
  controlsTitle: "CONTROLS",
  controlsMove: "LEFT HAND — Move: A/D · Aim up: hold W · Crouch / aim down: S · Jump: SPACE",
  controlsFire: "RIGHT HAND — Fire: J · Grenade: K · Special: L (air support / cheese lure)",
  controlsPad: "Gamepad: stick moves & aims · A jump · X fire · B grenade · Y special",
  controlsTouch: "Touch: buttons on screen",
  options: "OPTIONS",
  optShake: "Screen shake",
  optFlash: "Flash effects",
  optTextScale: "Big HUD text",
  on: "ON",
  off: "OFF",
  room: "ROOM",
  player: "PLAYER",
  you: "YOU",
  host: "HOST",
  connected: "connected",
  disconnected: "away",
  goalBanner: "PUSH EAST. RESCUE POWS. SHOOT EVERYTHING ELSE.",
  standBy: "STAND BY — COMING IN HOT",
  // Includes W and L on purpose: the game later demands both ("HOLD W — AIM
  // UP", "PRESS L — CALL IN AIR SUPPORT") and the first version of this line
  // taught neither.
  ctlBasics: "A/D MOVE · W AIM UP · S CROUCH · SPACE JUMP · J FIRE · K GRENADE · L SPECIAL",
  goalBoss: "GET UNDER IT — SHOOT UP (W) WHEN THE HATCH OPENS",
  cheeseHint: "Aliens can't resist cheese. Throw it. (L / Y button)",
  trapHint: "Disturbed earth hides traps. Jump it.",
  // Shown on respawn so a death always teaches something.
  diedShot: "KILLED BY ENEMY FIRE",
  diedTrap: "KILLED BY A PUNJI TRAP — jump the disturbed earth",
  diedPit: "FELL INTO THE SPIKES — jump the gaps",
  pitHint: "SPIKE PIT AHEAD — SPACE TO JUMP IT",
  diedBoom: "KILLED BY A BLAST — keep clear of explosions",
  diedAbduct: "TAKEN BY A UFO — shoot it or stay out from under it",
  diedTunnel: "GUTTED IN THE DARK — watch for the eyeshine",
  // v13.3: this told the player to SIDESTEP. There is no sidestep down here --
  // the tunnel has eight inputs and A/D turn you in place. A first-time
  // playtester went looking for the key and reported that the game had asked
  // for something it does not let you do. Name a control that exists.
  diedTunnelShot: "SHOT DOWN — break line of sight, W past the corner",
  diedTunnelBoom: "CAUGHT IN A BLAST — barrels kill you too",
  secretFound: "★ SECRET FOUND ★",
  gotShells: "SHELLS +5",
  gotPistolBack: "MITTENS KEPT YOUR PISTOL",
  ufoHint: "Tractor beams pull you up — keep moving!",
  paused: "PAUSED — tab back in to fight",
  pausedTitle: "PAUSED",
  resume: "RESUME",
  musicVol: "Music volume",
  sfxVol: "Sound effects volume",
  musicOn: "Music: on",
  musicOff: "Music: muted",
});
