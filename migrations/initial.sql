CREATE DATABASE fantasy_football CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE fantasy_football;

CREATE TABLE teams (
    team_id SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    team_code VARCHAR(10) NOT NULL UNIQUE,
    team_name VARCHAR(100) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE players (
    player_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(120) NOT NULL,
    position ENUM('QB','RB','WR','TE') NOT NULL,
    birth_date DATE NULL,
    rookie_season SMALLINT UNSIGNED NULL,
    draft_year SMALLINT UNSIGNED NULL,
    draft_round TINYINT UNSIGNED NULL,
    draft_pick SMALLINT UNSIGNED NULL COMMENT 'Overall pick; NULL for unknown/undrafted',
    current_team_id SMALLINT UNSIGNED NULL COMMENT 'NULL for free agent or unknown',
    career_status ENUM('ACTIVE','INACTIVE','RETIRED','UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (current_team_id) REFERENCES teams(team_id),
    INDEX ix_players_name (full_name),
    INDEX ix_players_position (position, current_team_id)
) ENGINE=InnoDB;

-- Match imports by stable provider IDs, never by player name alone.
CREATE TABLE player_external_ids (
    provider VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    external_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    player_id BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (provider, external_id),
    UNIQUE KEY uq_player_provider (player_id, provider),
    FOREIGN KEY (player_id) REFERENCES players(player_id)
) ENGINE=InnoDB;

CREATE TABLE games (
    game_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    season SMALLINT UNSIGNED NOT NULL,
    season_type ENUM('REG','POST','PRE') NOT NULL DEFAULT 'REG',
    week TINYINT UNSIGNED NOT NULL,
    kickoff_utc DATETIME NULL,
    game_status ENUM('SCHEDULED','IN_PROGRESS','FINAL','CANCELLED') NOT NULL DEFAULT 'SCHEDULED',
    CHECK (week BETWEEN 1 AND 30),
    INDEX ix_games_season_week (season, season_type, week)
) ENGINE=InnoDB;

-- Exactly two rows per game (HOME/AWAY) must be loaded by the importer.
-- This allows stats to reference only a team actually participating in the game.
CREATE TABLE game_teams (
    game_id BIGINT UNSIGNED NOT NULL,
    team_id SMALLINT UNSIGNED NOT NULL,
    side ENUM('HOME','AWAY') NOT NULL,
    PRIMARY KEY (game_id, team_id),
    UNIQUE KEY uq_game_side (game_id, side),
    FOREIGN KEY (game_id) REFERENCES games(game_id),
    FOREIGN KEY (team_id) REFERENCES teams(team_id)
) ENGINE=InnoDB;

-- One canonical record per player/game, not one per provider.
-- Source priority/deduplication and corrections belong in the importer.
-- Zero means confirmed zero; NULL means unavailable for optional usage metrics.
-- Do not insert DNP/bye rows. A player who appeared with zero stats gets a row.
CREATE TABLE player_game_stats (
    player_id BIGINT UNSIGNED NOT NULL,
    game_id BIGINT UNSIGNED NOT NULL,
    team_id SMALLINT UNSIGNED NOT NULL COMMENT 'Team at game time; preserves team history',
    position_at_game ENUM('QB','RB','WR','TE') NOT NULL,
    pass_attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    pass_completions SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    pass_touchdowns SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    interceptions_thrown SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    rush_attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    rush_touchdowns SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    targets SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    receptions SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    receiving_touchdowns SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    fumbles_lost SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    passing_two_point_conversions SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    rushing_two_point_conversions SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    receiving_two_point_conversions SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    return_touchdowns SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    other_touchdowns SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    passing_yards INT NOT NULL DEFAULT 0,
    rushing_yards INT NOT NULL DEFAULT 0,
    receiving_yards INT NOT NULL DEFAULT 0,
    offensive_snaps SMALLINT UNSIGNED NULL,
    team_offensive_snaps SMALLINT UNSIGNED NULL,
    routes_run SMALLINT UNSIGNED NULL,
    team_pass_attempts SMALLINT UNSIGNED NULL,
    source VARCHAR(80) NOT NULL,
    imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (player_id, game_id),
    FOREIGN KEY (player_id) REFERENCES players(player_id),
    FOREIGN KEY (game_id, team_id) REFERENCES game_teams(game_id, team_id),
    CHECK (pass_completions <= pass_attempts),
    CHECK (receptions <= targets),
    CHECK (offensive_snaps <= team_offensive_snaps),
    CHECK (routes_run <= offensive_snaps),
    CHECK (targets <= team_pass_attempts),
    INDEX ix_stats_game_team (game_id, team_id)
) ENGINE=InnoDB;

-- Historical availability snapshots; latest snapshot <= evaluation time wins.
CREATE TABLE player_status_snapshots (
    player_id BIGINT UNSIGNED NOT NULL,
    observed_at_utc DATETIME NOT NULL,
    source VARCHAR(80) NOT NULL,
    availability ENUM('AVAILABLE','QUESTIONABLE','DOUBTFUL','OUT','IR','PUP','SUSPENDED','UNKNOWN') NOT NULL,
    injury_description VARCHAR(255) NULL,
    expected_return_date DATE NULL,
    PRIMARY KEY (player_id, observed_at_utc, source),
    FOREIGN KEY (player_id) REFERENCES players(player_id)
) ENGINE=InnoDB;

-- Projected raw stats permit scoring changes without reimporting projections.
-- A projection set covers a specific inclusive REG-season week range.
-- Full-season, weekly, and rest-of-season projections must be separate sets.
-- To prevent look-ahead bias, select as_of_utc <= your evaluation timestamp.
CREATE TABLE projection_sets (
    projection_set_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    source VARCHAR(80) NOT NULL,
    model_version VARCHAR(80) NOT NULL DEFAULT 'unspecified',
    as_of_utc DATETIME NOT NULL,
    season SMALLINT UNSIGNED NOT NULL,
    start_week TINYINT UNSIGNED NOT NULL,
    end_week TINYINT UNSIGNED NOT NULL,
    CHECK (start_week BETWEEN 1 AND 30 AND end_week BETWEEN start_week AND 30),
    UNIQUE KEY uq_projection_set (source, model_version, as_of_utc, season, start_week, end_week),
    INDEX ix_projection_lookup (season, start_week, end_week, as_of_utc)
) ENGINE=InnoDB;

CREATE TABLE player_projections (
    projection_set_id BIGINT UNSIGNED NOT NULL,
    player_id BIGINT UNSIGNED NOT NULL,
    expected_games DECIMAL(6,3) NULL,
    pass_attempts DECIMAL(10,3) NULL,
    pass_completions DECIMAL(10,3) NULL,
    pass_touchdowns DECIMAL(10,3) NULL,
    interceptions_thrown DECIMAL(10,3) NULL,
    rush_attempts DECIMAL(10,3) NULL,
    rush_touchdowns DECIMAL(10,3) NULL,
    targets DECIMAL(10,3) NULL,
    receptions DECIMAL(10,3) NULL,
    receiving_touchdowns DECIMAL(10,3) NULL,
    fumbles_lost DECIMAL(10,3) NULL,
    passing_two_point_conversions DECIMAL(10,3) NULL,
    rushing_two_point_conversions DECIMAL(10,3) NULL,
    receiving_two_point_conversions DECIMAL(10,3) NULL,
    return_touchdowns DECIMAL(10,3) NULL,
    other_touchdowns DECIMAL(10,3) NULL,
    passing_yards DECIMAL(10,3) NULL,
    rushing_yards DECIMAL(10,3) NULL,
    receiving_yards DECIMAL(10,3) NULL,
    PRIMARY KEY (projection_set_id, player_id),
    FOREIGN KEY (projection_set_id) REFERENCES projection_sets(projection_set_id),
    FOREIGN KEY (player_id) REFERENCES players(player_id),
    CHECK (expected_games >= 0),
    INDEX ix_projection_player (player_id, projection_set_id)
) ENGINE=InnoDB;

-- Basic linear offensive scoring. Extend the application for yardage bonuses,
-- TE premium, first downs, return yards, and other custom platform rules.
CREATE TABLE scoring_profiles (
    scoring_profile_id SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    profile_name VARCHAR(80) NOT NULL UNIQUE,
    points_per_passing_yard DECIMAL(8,4) NOT NULL DEFAULT 0.04,
    points_per_passing_td DECIMAL(8,4) NOT NULL DEFAULT 4,
    points_per_interception DECIMAL(8,4) NOT NULL DEFAULT -2,
    points_per_rushing_yard DECIMAL(8,4) NOT NULL DEFAULT 0.1,
    points_per_rushing_td DECIMAL(8,4) NOT NULL DEFAULT 6,
    points_per_receiving_yard DECIMAL(8,4) NOT NULL DEFAULT 0.1,
    points_per_receiving_td DECIMAL(8,4) NOT NULL DEFAULT 6,
    points_per_reception DECIMAL(8,4) NOT NULL DEFAULT 1,
    points_per_fumble_lost DECIMAL(8,4) NOT NULL DEFAULT -2,
    points_per_two_point_conversion DECIMAL(8,4) NOT NULL DEFAULT 2,
    points_per_return_td DECIMAL(8,4) NOT NULL DEFAULT 6,
    points_per_other_td DECIMAL(8,4) NOT NULL DEFAULT 6
) ENGINE=InnoDB;

INSERT INTO scoring_profiles (profile_name, points_per_reception) VALUES
('Standard', 0), ('Half PPR', 0.5), ('PPR', 1);

-- No duplicated season-stat table: aggregate game records so corrections flow through.
-- Only FINAL games count. Postseason/preseason stay separate from regular season.
CREATE VIEW v_player_season_stats AS
SELECT s.player_id, g.season, g.season_type,
       COUNT(*) AS games_played,
       SUM(s.pass_attempts) AS pass_attempts,
       SUM(s.pass_completions) AS pass_completions,
       SUM(s.pass_touchdowns) AS pass_touchdowns,
       SUM(s.interceptions_thrown) AS interceptions_thrown,
       SUM(s.rush_attempts) AS rush_attempts,
       SUM(s.rush_touchdowns) AS rush_touchdowns,
       SUM(s.targets) AS targets,
       SUM(s.receptions) AS receptions,
       SUM(s.receiving_touchdowns) AS receiving_touchdowns,
       SUM(s.fumbles_lost) AS fumbles_lost,
       SUM(s.passing_two_point_conversions) AS passing_two_point_conversions,
       SUM(s.rushing_two_point_conversions) AS rushing_two_point_conversions,
       SUM(s.receiving_two_point_conversions) AS receiving_two_point_conversions,
       SUM(s.return_touchdowns) AS return_touchdowns,
       SUM(s.other_touchdowns) AS other_touchdowns,
       SUM(s.passing_yards) AS passing_yards,
       SUM(s.rushing_yards) AS rushing_yards,
       SUM(s.receiving_yards) AS receiving_yards
FROM player_game_stats s
JOIN games g ON g.game_id = s.game_id
WHERE g.game_status = 'FINAL'
GROUP BY s.player_id, g.season, g.season_type;

CREATE VIEW v_player_game_fantasy_points AS
SELECT s.player_id, s.game_id, s.team_id, s.position_at_game,
       g.season, g.season_type, g.week, c.scoring_profile_id, c.profile_name,
       s.passing_yards * c.points_per_passing_yard
       + s.pass_touchdowns * c.points_per_passing_td
       + s.interceptions_thrown * c.points_per_interception
       + s.rushing_yards * c.points_per_rushing_yard
       + s.rush_touchdowns * c.points_per_rushing_td
       + s.receiving_yards * c.points_per_receiving_yard
       + s.receiving_touchdowns * c.points_per_receiving_td
       + s.receptions * c.points_per_reception
       + s.fumbles_lost * c.points_per_fumble_lost
       + (s.passing_two_point_conversions + s.rushing_two_point_conversions
          + s.receiving_two_point_conversions) * c.points_per_two_point_conversion
       + s.return_touchdowns * c.points_per_return_td
       + s.other_touchdowns * c.points_per_other_td AS fantasy_points
FROM player_game_stats s
JOIN games g ON g.game_id = s.game_id
CROSS JOIN scoring_profiles c
WHERE g.game_status = 'FINAL';

CREATE VIEW v_player_season_fantasy_points AS
SELECT player_id, season, season_type, scoring_profile_id, profile_name,
       COUNT(*) AS games_played,
       SUM(fantasy_points) AS total_points,
       AVG(fantasy_points) AS points_per_game,
       STDDEV_POP(fantasy_points) AS points_standard_deviation
FROM v_player_game_fantasy_points
GROUP BY player_id, season, season_type, scoring_profile_id, profile_name;

