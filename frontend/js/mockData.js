// Fake data shaped like what our backend will send later.
// Playtime is in MINUTES (Steam's "playtime_forever").
//
// steam.state is our own name for Steam's "personastate" number:
//   0 offline, 1 online, 2 busy, 3 away, 4 snooze (we treat it as away),
//   5 looking to trade (we treat it as online), 6 looking to play.
// If Steam also sends "gameextrainfo", the player is in a game: state "in-game".
// If their Steam profile is private, Steam tells us nothing: state "hidden".

const MOCK_USERS = [
  {
    id: "u_001",
    username: "pixel_ronin",
    avatarUrl: null,
    region: "India",
    joinedAt: "2026-09-12",
    bio: "Soulslike enjoyer, on after 9 PM IST",
    steam: { state: "online", game: null },
    games: [
      { appId: 730, name: "Counter-Strike 2", genre: "FPS", minutes: 74400 },
      { appId: 1245620, name: "Elden Ring", genre: "Soulslike", minutes: 18600 },
      { appId: 367520, name: "Hollow Knight", genre: "Metroidvania", minutes: 8520 },
      { appId: 413150, name: "Stardew Valley", genre: "Cozy", minutes: 5700 },
      { appId: 1145360, name: "Hades", genre: "Roguelike", minutes: 3840 },
      { appId: 105600, name: "Terraria", genre: "Sandbox", minutes: 2460 },
      { appId: 1086940, name: "Baldur's Gate 3", genre: "RPG", minutes: 1980 },
    ],
    friendIds: ["u_002", "u_003", "u_004", "u_005"],
    screenshots: [],
  },
  {
    id: "u_002",
    username: "rook_07",
    avatarUrl: null,
    region: "India",
    joinedAt: "2026-09-20",
    bio: "Entry fragger. Looking for a squad that plays evenings.",
    steam: { state: "in-game", game: "Counter-Strike 2" },
    games: [
      { appId: 730, name: "Counter-Strike 2", genre: "FPS", minutes: 74400 },
      { appId: 1172470, name: "Apex Legends", genre: "Battle royale", minutes: 12300 },
      { appId: 252950, name: "Rocket League", genre: "Sports", minutes: 7200 },
      { appId: 570, name: "Dota 2", genre: "MOBA", minutes: 4500 },
    ],
    friendIds: ["u_001"],
    screenshots: [],
  },
  {
    id: "u_003",
    username: "mira_plays",
    avatarUrl: null,
    region: "Singapore",
    joinedAt: "2026-09-25",
    bio: "",
    steam: { state: "online", game: null },
    games: [
      { appId: 413150, name: "Stardew Valley", genre: "Cozy", minutes: 13200 },
      { appId: 105600, name: "Terraria", genre: "Sandbox", minutes: 6000 },
      { appId: 1145360, name: "Hades", genre: "Roguelike", minutes: 2700 },
    ],
    friendIds: ["u_001"],
    screenshots: [],
  },
  {
    id: "u_004",
    username: "tenko_x",
    avatarUrl: null,
    region: "India",
    joinedAt: "2026-09-18",
    bio: "Roguelike addict.",
    steam: { state: "looking-to-play", game: null },
    games: [
      { appId: 1145360, name: "Hades", genre: "Roguelike", minutes: 7200 },
      { appId: 588650, name: "Dead Cells", genre: "Roguelike", minutes: 3000 },
    ],
    friendIds: ["u_001"],
    screenshots: [],
  },
  {
    id: "u_005",
    username: "dune_rider",
    avatarUrl: null,
    region: "India",
    joinedAt: "2026-09-15",
    bio: "",
    steam: { state: "offline", game: null },
    games: [
      { appId: 252950, name: "Rocket League", genre: "Sports", minutes: 6000 },
    ],
    friendIds: ["u_001"],
    screenshots: [],
  },
  {
    id: "u_006",
    username: "kaiju_main",
    avatarUrl: null,
    region: "India",
    joinedAt: "2026-09-14",
    bio: "Soulslike co-op any time.",
    steam: { state: "offline", game: null },
    games: [
      { appId: 1245620, name: "Elden Ring", genre: "Soulslike", minutes: 20400 },
      { appId: 1145360, name: "Hades", genre: "Roguelike", minutes: 7200 },
      { appId: 367520, name: "Hollow Knight", genre: "Metroidvania", minutes: 5280 },
    ],
    friendIds: [],
    screenshots: [],
  },
  {
    id: "u_007",
    username: "n0va",
    avatarUrl: null,
    region: "India",
    joinedAt: "2026-09-22",
    bio: "",
    steam: { state: "offline", game: null },
    games: [
      { appId: 374320, name: "Dark Souls III", genre: "Soulslike", minutes: 9000 },
      { appId: 367520, name: "Hollow Knight", genre: "Metroidvania", minutes: 3000 },
    ],
    friendIds: [],
    screenshots: [],
  },
  {
    id: "u_008",
    username: "luna_sprout",
    avatarUrl: null,
    region: "India",
    joinedAt: "2026-09-19",
    bio: "Farming and building, mostly.",
    steam: { state: "offline", game: null },
    games: [
      { appId: 105600, name: "Terraria", genre: "Sandbox", minutes: 9000 },
      { appId: 413150, name: "Stardew Valley", genre: "Cozy", minutes: 3000 },
    ],
    friendIds: [],
    screenshots: [],
  },
  {
    id: "u_009",
    username: "b1tyard",
    avatarUrl: null,
    region: "UAE",
    joinedAt: "2026-09-21",
    bio: "",
    steam: { state: "offline", game: null },
    games: [
      { appId: 367520, name: "Hollow Knight", genre: "Metroidvania", minutes: 12000 },
    ],
    friendIds: [],
    screenshots: [],
  },
  {
    id: "u_010",
    username: "ghost_hz",
    avatarUrl: null,
    region: "India",
    joinedAt: "2026-09-23",
    bio: "AWP or nothing.",
    steam: { state: "offline", game: null },
    games: [
      { appId: 730, name: "Counter-Strike 2", genre: "FPS", minutes: 33000 },
    ],
    friendIds: [],
    screenshots: [],
  },
  {
    id: "u_011",
    username: "zed_frames",
    avatarUrl: null,
    region: "India",
    joinedAt: "2026-09-24",
    bio: "",
    steam: { state: "offline", game: null },
    games: [
      { appId: 1172470, name: "Apex Legends", genre: "Battle royale", minutes: 15000 },
      { appId: 730, name: "Counter-Strike 2", genre: "FPS", minutes: 4000 },
    ],
    friendIds: [],
    screenshots: [],
  },
  {
    id: "u_012",
    username: "byte_x",
    avatarUrl: null,
    region: "UAE",
    joinedAt: "2026-09-26",
    bio: "",
    steam: { state: "offline", game: null },
    games: [
      { appId: 1145360, name: "Hades", genre: "Roguelike", minutes: 2400 },
      { appId: 105600, name: "Terraria", genre: "Sandbox", minutes: 1800 },
    ],
    friendIds: [],
    screenshots: [],
  },
];

// Pretend this person is logged in. Later, the backend tells us who it is.
const CURRENT_USER_ID = "u_001";

// Friend requests sent TO the current user (user ids)
const MOCK_FRIEND_REQUESTS = ["u_011", "u_012"];

// What the recommendation model will return later:
// who, how good the match is (0 to 1), and a reason we can show.
const MOCK_RECOMMENDATIONS = [
  { userId: "u_006", score: 0.92, reason: "You both have 300+ hours in Elden Ring and play the same 3 Soulslikes." },
  { userId: "u_010", score: 0.81, reason: "You both have 500+ hours in Counter-Strike 2." },
  { userId: "u_007", score: 0.77, reason: "Also into Soulslikes and Metroidvanias." },
  { userId: "u_008", score: 0.70, reason: "Plays Terraria and Stardew Valley, like you." },
  { userId: "u_009", score: 0.64, reason: "Top game is Hollow Knight, your #3." },
];

// Which character each mock user picked (the backend will store this per user)
const MOCK_AVATARS = {
  u_001: "mage",
  u_002: "knight",
  u_003: "archer",
  u_004: "monk",
  u_005: "smith",
  u_006: "assassin",
  u_007: "monk",
  u_008: "archer",
  u_009: "assassin",
  u_010: "smith",
  u_011: "knight",
  // u_012 (byte_x) has none on purpose, to test the initials fallback
};

MOCK_USERS.forEach((user) => {
  user.avatar = MOCK_AVATARS[user.id] || null;
});

// Until the backend exists, remember YOUR pick in this browser
try {
  const saved = localStorage.getItem("hangout-avatar");
  if (saved) MOCK_USERS.find((user) => user.id === CURRENT_USER_ID).avatar = saved;
} catch {
  // storage blocked: just use the default
}