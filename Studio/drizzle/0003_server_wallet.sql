CREATE TABLE dw_wallets (
  player TEXT NOT NULL REFERENCES dw_players(id), game TEXT NOT NULL,
  state TEXT NOT NULL, rev INTEGER NOT NULL CHECK(rev>=1), updated INTEGER NOT NULL,
  PRIMARY KEY(player, game)
);
--> statement-breakpoint
CREATE TABLE dw_receipts (
  store TEXT NOT NULL, tx TEXT NOT NULL, player TEXT NOT NULL REFERENCES dw_players(id),
  game TEXT NOT NULL, product TEXT NOT NULL, created INTEGER NOT NULL,
  PRIMARY KEY(store, tx)
);
