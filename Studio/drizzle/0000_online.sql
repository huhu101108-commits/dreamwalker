CREATE TABLE dw_players (
  id TEXT PRIMARY KEY, credential TEXT NOT NULL UNIQUE, credits INTEGER NOT NULL DEFAULT 0 CHECK(credits>=0),
  medals INTEGER NOT NULL DEFAULT 0 CHECK(medals>=0), wins INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE dw_releases (slot INTEGER PRIMARY KEY CHECK(slot=1), revision INTEGER NOT NULL, digest TEXT NOT NULL, profile TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE dw_rooms (
  code TEXT PRIMARY KEY, p0 TEXT NOT NULL REFERENCES dw_players(id), p1 TEXT REFERENCES dw_players(id),
  status TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL, release_id TEXT NOT NULL,
  revision INTEGER NOT NULL, winner INTEGER NOT NULL DEFAULT -1, reason TEXT NOT NULL DEFAULT ''
);
--> statement-breakpoint
CREATE TABLE dw_seats (player TEXT PRIMARY KEY REFERENCES dw_players(id), code TEXT NOT NULL REFERENCES dw_rooms(code));
--> statement-breakpoint
CREATE TRIGGER dw_first_seat AFTER INSERT ON dw_rooms BEGIN
  INSERT INTO dw_seats(player,code) VALUES(NEW.p0,NEW.code);
END;
--> statement-breakpoint
CREATE TRIGGER dw_second_seat AFTER UPDATE OF p1 ON dw_rooms WHEN OLD.p1 IS NULL AND NEW.p1 IS NOT NULL BEGIN
  INSERT INTO dw_seats(player,code) VALUES(NEW.p1,NEW.code);
END;
--> statement-breakpoint
CREATE TRIGGER dw_room_settlement AFTER UPDATE OF status ON dw_rooms WHEN OLD.status!='finished' AND NEW.status='finished' BEGIN
  DELETE FROM dw_seats WHERE code=NEW.code;
  UPDATE dw_players SET credits=credits+10, medals=medals+1, wins=wins+1
    WHERE OLD.status='playing' AND NEW.reason='ko' AND NEW.winner IN (0,1)
      AND id=CASE NEW.winner WHEN 0 THEN NEW.p0 ELSE NEW.p1 END;
END;
--> statement-breakpoint
CREATE TABLE dw_listings (
  id TEXT PRIMARY KEY, seller TEXT NOT NULL REFERENCES dw_players(id), price INTEGER NOT NULL CHECK(price BETWEEN 1 AND 9999),
  created INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'open', buyer TEXT REFERENCES dw_players(id)
);
--> statement-breakpoint
CREATE INDEX dw_open_listings ON dw_listings(status,created);
--> statement-breakpoint
CREATE TRIGGER dw_listing_escrow BEFORE INSERT ON dw_listings BEGIN
  SELECT CASE WHEN (SELECT medals FROM dw_players WHERE id=NEW.seller)<1 THEN RAISE(ABORT,'no_medal') END;
  UPDATE dw_players SET medals=medals-1 WHERE id=NEW.seller;
END;
--> statement-breakpoint
CREATE TRIGGER dw_listing_buy BEFORE UPDATE OF status ON dw_listings WHEN NEW.status='sold' BEGIN
  SELECT CASE WHEN OLD.status!='open' OR NEW.buyer IS NULL OR NEW.buyer=OLD.seller THEN RAISE(ABORT,'closed_listing') END;
  SELECT CASE WHEN (SELECT credits FROM dw_players WHERE id=NEW.buyer)<OLD.price THEN RAISE(ABORT,'no_credit') END;
  UPDATE dw_players SET credits=credits-OLD.price, medals=medals+1 WHERE id=NEW.buyer;
  UPDATE dw_players SET credits=credits+OLD.price WHERE id=OLD.seller;
END;
--> statement-breakpoint
CREATE TRIGGER dw_listing_cancel AFTER UPDATE OF status ON dw_listings WHEN OLD.status='open' AND NEW.status='cancelled' BEGIN
  UPDATE dw_players SET medals=medals+1 WHERE id=OLD.seller;
END;
