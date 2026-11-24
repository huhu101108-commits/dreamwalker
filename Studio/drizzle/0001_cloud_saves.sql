CREATE TABLE dw_saves (
  player TEXT NOT NULL REFERENCES dw_players(id), game TEXT NOT NULL, slot TEXT NOT NULL,
  rev INTEGER NOT NULL CHECK(rev>=1), data TEXT NOT NULL, updated INTEGER NOT NULL,
  PRIMARY KEY(player, game, slot)
);
--> statement-breakpoint
CREATE TABLE dw_transfers (code TEXT PRIMARY KEY, player TEXT NOT NULL UNIQUE REFERENCES dw_players(id), expires INTEGER NOT NULL);
