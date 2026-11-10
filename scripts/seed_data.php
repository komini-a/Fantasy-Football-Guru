<?php
declare(strict_types=1);
/**
 * nflverse -> fantasy_football (the accompanying MySQL schema).
 * PHP 8.1+ CLI; extensions: curl, pdo_mysql. MySQL 8.0.16+.
 * No Composer dependencies. Run the original schema FIRST, only once.
 *
 * CONFIGURATION (environment variables, inherited by PHP):
 *   FF_DB_HOST=127.0.0.1 FF_DB_PORT=3306 FF_DB_NAME=fantasy_football
 *   FF_DB_USER=your_user FF_DB_PASSWORD=your_password
 * Optional FF_DB_SOCKET=/path/mysql.sock overrides host/port.
 *
 * USAGE:
 *   php seed_fantasy_football.php --seasons=2023,2024,2025,2026
 *   php seed_fantasy_football.php                 # refresh current NFL season
 *   php seed_fantasy_football.php --seasons=2026  # refresh a specific season
 *   php seed_fantasy_football.php --validate-only --seasons=2025
 *   php seed_fantasy_football.php --help
 *
 * CRON (server-local timezone; ensure credentials are available to cron):
 *   0 10 * * 2 /usr/bin/php /absolute/path/seed_fantasy_football.php >> /absolute/path/seed.log 2>&1
 * Recommended additional Thursday morning run for midweek stat corrections:
 *   0 10 * * 4 /usr/bin/php /absolute/path/seed_fantasy_football.php >> /absolute/path/seed.log 2>&1
 * Do NOT hardcode a season in the recurring command unless intentional.
 *
 * BEHAVIOR:
 * - Refreshes ALL available completed games in the selected season(s), not only
 *   last week. Catches missed runs and corrections; never adds stats to totals.
 * - GSIS IDs identify players; nflverse game IDs identify games. Names are NOT keys.
 * - Creates ONE helper table, game_external_ids, to fill the original schema's
 *   missing durable game-ID mapping. This DDL needs CREATE privilege on first run.
 * - Uses primary keys/upserts, an advisory lock, and one transaction for all data.
 *   Downloads/validation finish before any data changes. A failed import rolls
 *   back data; the helper table itself may remain (MySQL DDL autocommits).
 * - Imports QB/RB/WR/TE, treating FB/HB as RB. Seeds profiles, external IDs, teams,
 *   schedules, game participants, stats, snap counts. Current roster data is read
 *   from the current season even when backfilling old seasons.
 * - Snap counts also supply zero-production appearances; no bye/DNP rows.
 * - Profiles unavailable in the master list can be created from the stats file.
 * - Projections and injury snapshots are NOT fabricated or seeded by this script.
 *   Roster status is not a medical injury report. Routes and team snaps stay NULL
 *   where exact source data is absent; team pass attempts are summed across QBs
 *   AND all other player positions in the source.
 * - Existing rows from another stats provider are protected (import stops).
 * - Does not delete rows missing from a later source release. An upstream removal
 *   or player-ID reassignment requires explicit review, rather than silent deletion.
 * - Incomplete/newly published games are deferred, with a warning and exit code 2.
 *   Rerun later. Games must have scores, be at least 8 hours past kickoff, and have
 *   offensive stats for BOTH teams before their stats are imported/marked FINAL.
 * - Imports REG and POST; no preseason. nflverse playoff week numbers are retained.
 * - Season selection: Jan/Feb use previous calendar year; Mar-Dec use current year.
 *   Before the new season's stats are published, specify last season explicitly.
 *
 * OPTIONAL LOCAL INPUT / TESTING:
 *   --data-dir=/absolute/path reads CSV files instead of downloading:
 *   players.csv, games.csv, rosters_CURRENTYEAR.csv,
 *   stats_YEAR.csv, snaps_YEAR.csv (one pair for each selected year).
 *   --skip-snaps skips snap downloads/imports. PPG may then omit zero-stat games.
 *   --validate-only checks normalization and reports counts WITHOUT connecting to DB.
 *
 * DATA: https://github.com/nflverse/nflverse-data
 *       https://github.com/nflverse/nfldata
 * Keep nflverse attribution in your project and follow each dataset's license.
 * Source filenames/columns are validated; upstream breaking changes fail visibly.
 */

const FF_RELEASE = 'https://github.com/nflverse/nflverse-data/releases/download/';
const FF_STATS_SOURCE = 'nflverse';
const FF_TEAMS = [
    'ARI'=>'Arizona Cardinals','ATL'=>'Atlanta Falcons','BAL'=>'Baltimore Ravens',
    'BUF'=>'Buffalo Bills','CAR'=>'Carolina Panthers','CHI'=>'Chicago Bears',
    'CIN'=>'Cincinnati Bengals','CLE'=>'Cleveland Browns','DAL'=>'Dallas Cowboys',
    'DEN'=>'Denver Broncos','DET'=>'Detroit Lions','GB'=>'Green Bay Packers',
    'HOU'=>'Houston Texans','IND'=>'Indianapolis Colts','JAX'=>'Jacksonville Jaguars',
    'KC'=>'Kansas City Chiefs','LA'=>'Los Angeles Rams','LAC'=>'Los Angeles Chargers',
    'LV'=>'Las Vegas Raiders','MIA'=>'Miami Dolphins','MIN'=>'Minnesota Vikings',
    'NE'=>'New England Patriots','NO'=>'New Orleans Saints','NYG'=>'New York Giants',
    'NYJ'=>'New York Jets','PHI'=>'Philadelphia Eagles','PIT'=>'Pittsburgh Steelers',
    'SEA'=>'Seattle Seahawks','SF'=>'San Francisco 49ers','TB'=>'Tampa Bay Buccaneers',
    'TEN'=>'Tennessee Titans','WAS'=>'Washington Commanders',
    'OAK'=>'Oakland Raiders','SD'=>'San Diego Chargers','STL'=>'St. Louis Rams',
];
const FF_STAT_MAP = [
    'pass_attempts'=>'attempts', 'pass_completions'=>'completions',
    'pass_touchdowns'=>'passing_tds', 'interceptions_thrown'=>'passing_interceptions',
    'rush_attempts'=>'carries', 'rush_touchdowns'=>'rushing_tds',
    'targets'=>'targets', 'receptions'=>'receptions',
    'receiving_touchdowns'=>'receiving_tds', 'fumbles_lost'=>'fumbles_lost_total',
    'passing_two_point_conversions'=>'passing_2pt_conversions',
    'rushing_two_point_conversions'=>'rushing_2pt_conversions',
    'receiving_two_point_conversions'=>'receiving_2pt_conversions',
    'return_touchdowns'=>'special_teams_tds', 'other_touchdowns'=>'fumble_recovery_tds',
    'passing_yards'=>'passing_yards', 'rushing_yards'=>'rushing_yards',
    'receiving_yards'=>'receiving_yards',
];

function ffLog(string $message): void {
    echo '[' . gmdate('Y-m-d H:i:s') . " UTC] $message\n";
}
function ffValue(array $row, string $key): ?string {
    $v = trim((string)($row[$key] ?? ''));
    return in_array($v, ['', 'NA', 'N/A', 'NULL', 'null'], true) ? null : $v;
}
function ffInt(array $row, string $key, bool $nullable = false, bool $signed = false): ?int {
    $v = ffValue($row, $key);
    if ($v === null && $nullable) return null;
    if ($v === null || !is_numeric($v) || !is_finite((float)$v)
        || floor((float)$v) !== (float)$v || abs((float)$v) > 2147483647
        || (!$signed && (float)$v < 0)) {
        throw new RuntimeException("Missing/invalid integer $key: " . ($v ?? 'NULL'));
    }
    return (int)$v;
}
function ffPosition(?string $position): ?string {
    $p = strtoupper($position ?? '');
    if (in_array($p, ['FB', 'HB'], true)) $p = 'RB';
    return in_array($p, ['QB','RB','WR','TE'], true) ? $p : null;
}
function ffTeam(?string $team): ?string {
    if ($team === null || in_array($team, ['FA','UNK','N/A'], true)) return null;
    $team = ['JAC'=>'JAX', 'LAR'=>'LA', 'WSH'=>'WAS', 'ARZ'=>'ARI', 'BLT'=>'BAL',
        'CLV'=>'CLE', 'HST'=>'HOU', 'SDG'=>'SD', 'GNB'=>'GB', 'KAN'=>'KC',
        'NWE'=>'NE', 'NOR'=>'NO', 'SFO'=>'SF', 'TAM'=>'TB'][$team] ?? $team;
    if (!isset(FF_TEAMS[$team])) throw new RuntimeException("Unknown team code: $team");
    return $team;
}
function ffSeasonType(string $value): string {
    return match ($value) {
        'REG'=>'REG', 'POST','WC','DIV','CON','SB'=>'POST', 'PRE'=>'PRE',
        default=>throw new RuntimeException("Unknown season type: $value")
    };
}
function ffDate(?string $value): ?string {
    if ($value === null) return null;
    $d = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
    if (!$d || $d->format('Y-m-d') !== $value) throw new RuntimeException("Invalid date: $value");
    return $value;
}
function ffKickoff(array $row): ?string {
    $date = ffDate(ffValue($row, 'gameday'));
    $time = ffValue($row, 'gametime');
    if ($date === null || $time === null) return null;
    if (!preg_match('/^\d{2}:\d{2}$/', $time)) throw new RuntimeException('Invalid game time');
    // nfldata gametime is US Eastern, including international games; DST matters.
    $d = DateTimeImmutable::createFromFormat('!Y-m-d H:i', "$date $time", new DateTimeZone('America/New_York'));
    if (!$d || $d->format('Y-m-d H:i') !== "$date $time") throw new RuntimeException('Invalid kickoff');
    return $d->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
}
/** Reads RFC-style CSV, rejects truncated rows and missing columns. */
function ffCsv(string $path, array $required): Generator {
    $f = fopen($path, 'rb');
    if (!$f) throw new RuntimeException("Cannot open $path");
    try {
        $header = fgetcsv($f, 0, ',', '"', '');
        if (!$header) throw new RuntimeException("Empty CSV: $path");
        $header[0] = preg_replace('/^\xEF\xBB\xBF/', '', $header[0]);
        if (count(array_unique($header)) !== count($header)) throw new RuntimeException("Duplicate CSV headers: $path");
        $missing = array_diff($required, $header);
        if ($missing) throw new RuntimeException("$path missing columns: " . implode(', ', $missing));
        $line = 1;
        while (($fields = fgetcsv($f, 0, ',', '"', '')) !== false) {
            ++$line;
            if ($fields === [null]) continue;
            if (count($fields) !== count($header)) throw new RuntimeException("Truncated/malformed CSV: $path row $line");
            yield array_combine($header, $fields);
        }
    } finally { fclose($f); }
}
function ffFetch(string $url, string $path): void {
    ffLog('Downloading ' . basename($path));
    for ($attempt = 1; $attempt <= 3; ++$attempt) {
        $f = fopen($path, 'wb');
        if (!$f) throw new RuntimeException("Cannot write $path");
        $c = curl_init($url);
        curl_setopt_array($c, [CURLOPT_FILE=>$f, CURLOPT_FOLLOWLOCATION=>true,
            CURLOPT_MAXREDIRS=>8, CURLOPT_CONNECTTIMEOUT=>20, CURLOPT_TIMEOUT=>180,
            CURLOPT_USERAGENT=>'FantasyFootballSeed/1.0 (nflverse CSV importer)',
            CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS, CURLOPT_REDIR_PROTOCOLS=>CURLPROTO_HTTPS,
            CURLOPT_SSL_VERIFYPEER=>true, CURLOPT_SSL_VERIFYHOST=>2]);
        $ok = curl_exec($c);
        $status = (int)curl_getinfo($c, CURLINFO_HTTP_CODE);
        $error = curl_error($c);
        unset($c); fclose($f);
        if ($ok && $status === 200 && filesize($path) > 0) return;
        if ($status === 404) throw new RuntimeException("Dataset not published (404): $url. Check the season or retry later.");
        if ($attempt < 3) sleep($attempt * 2);
    }
    throw new RuntimeException("Download failed: $url (HTTP $status; $error)");
}
function ffInput(string $name, string $url, string $dir, bool $local): string {
    $path = $dir . DIRECTORY_SEPARATOR . $name;
    if (!$local) ffFetch($url, $path);
    if (!is_file($path) || filesize($path) === 0) throw new RuntimeException("Missing/empty input: $path");
    return $path;
}
/** Normalize source data independently of the DB, so validation cannot modify it. */
function ffBuild(array $paths, array $seasons, int $currentSeason, bool $skipSnaps): array {
    $players = []; $pfrToGsis = []; $games = []; $stats = []; $teamAttempts = []; $warnings = [];
    foreach (ffCsv($paths['players'], ['gsis_id','display_name','position','birth_date','pfr_id']) as $r) {
        $id = ffValue($r, 'gsis_id'); $pos = ffPosition(ffValue($r, 'position'));
        if (!$id || !$pos) continue;
        if (isset($players[$id])) throw new RuntimeException("Duplicate master GSIS ID: $id");
        $name = ffValue($r, 'display_name');
        if (!$name) throw new RuntimeException("Missing name for $id");
        $players[$id] = ['name'=>$name, 'position'=>$pos, 'birth_date'=>ffDate(ffValue($r,'birth_date')),
            'rookie_season'=>ffInt($r,'rookie_season',true), 'draft_year'=>ffInt($r,'draft_year',true),
            'draft_round'=>ffInt($r,'draft_round',true), 'draft_pick'=>ffInt($r,'draft_pick',true),
            // latest_team/status on historical master records can be stale.
            'current_team'=>null, 'career_status'=>'UNKNOWN', 'ids'=>['gsis'=>$id]];
        foreach (['pfr','espn','pff','nfl'] as $provider) {
            if ($external = ffValue($r, $provider.'_id')) $players[$id]['ids'][$provider] = $external;
        }
    }
    $rosterSeen = [];
    foreach (ffCsv($paths['rosters'], ['gsis_id','season','team','position','full_name','status']) as $r) {
        if (ffInt($r,'season') !== $currentSeason) throw new RuntimeException('Roster season mismatch');
        $id = ffValue($r,'gsis_id'); $pos = ffPosition(ffValue($r,'position'));
        if (!$id || !$pos) continue;
        if (isset($rosterSeen[$id])) throw new RuntimeException("Duplicate current roster ID: $id");
        $rosterSeen[$id] = true;
        if (!isset($players[$id])) $players[$id] = ffMinimalPlayer($id, ffValue($r,'full_name'), $pos);
        $p = &$players[$id];
        $p['name'] = ffValue($r,'full_name') ?? $p['name']; $p['position'] = $pos;
        $p['birth_date'] = ffDate(ffValue($r,'birth_date')) ?? $p['birth_date'];
        $p['rookie_season'] = ffInt($r,'rookie_year',true) ?? $p['rookie_season'];
        $status = ffValue($r,'status');
        $p['career_status'] = match ($status) {
            'ACT'=>'ACTIVE', 'RET'=>'RETIRED',
            'RES','DEV','PUP','SUS','CUT','RLS','INA','RSN','RSR','NWT','EXE'=>'INACTIVE',
            default=>'UNKNOWN'
        };
        $p['current_team'] = in_array($status,['CUT','RLS','RET'],true) ? null : ffTeam(ffValue($r,'team'));
        foreach (['pfr','espn','pff','sleeper','yahoo','sportradar','fantasy_data'] as $provider) {
            if ($external = ffValue($r,$provider.'_id')) $p['ids'][$provider] = $external;
        }
        unset($p);
    }
    if (!$players || !$rosterSeen) throw new RuntimeException('No supported players/current rosters found');
    foreach ($players as $id=>$p) {
        if (isset($p['ids']['pfr'])) {
            $pfr = $p['ids']['pfr'];
            if (isset($pfrToGsis[$pfr]) && $pfrToGsis[$pfr] !== $id) throw new RuntimeException("Conflicting PFR ID: $pfr");
            $pfrToGsis[$pfr] = $id;
        }
    }
    $scheduleCounts = [];
    foreach (ffCsv($paths['games'], ['game_id','season','game_type','week','home_team','away_team','gameday','gametime','home_score','away_score']) as $r) {
        $season = ffInt($r,'season');
        if (!in_array($season,$seasons,true)) continue;
        $type = ffSeasonType((string)ffValue($r,'game_type'));
        if ($type === 'PRE') continue;
        $id = ffValue($r,'game_id');
        if (!$id || isset($games[$id])) throw new RuntimeException('Missing/duplicate schedule game ID');
        $week = ffInt($r,'week');
        if ($week < 1 || $week > 30) throw new RuntimeException("Invalid week: $id");
        $kickoff = ffKickoff($r);
        $hasScores = ffInt($r,'home_score',true) !== null && ffInt($r,'away_score',true) !== null;
        $oldEnough = $kickoff !== null
            ? strtotime($kickoff.' UTC') < time()-8*3600
            : (ffValue($r,'gameday') !== null && ffValue($r,'gameday') < gmdate('Y-m-d',time()-86400));
        $home = ffTeam(ffValue($r,'home_team')); $away = ffTeam(ffValue($r,'away_team'));
        if (!$home || !$away || $home === $away) throw new RuntimeException("Invalid teams: $id");
        $games[$id] = ['season'=>$season,'type'=>$type,'week'=>$week,'kickoff'=>$kickoff,
            'home'=>$home,'away'=>$away,'complete'=>$hasScores && $oldEnough,'ready'=>false];
        $scheduleCounts[$season] = ($scheduleCounts[$season] ?? 0)+1;
    }
    foreach ($seasons as $year) {
        if (empty($scheduleCounts[$year])) throw new RuntimeException("No schedule found for $year");
        $required = array_merge(['player_id','player_display_name','position','season','season_type','week','game_id','team'],array_values(FF_STAT_MAP));
        $sourceRows = 0;
        foreach (ffCsv($paths['stats'][$year],$required) as $r) {
            if (ffInt($r,'season') !== $year) throw new RuntimeException("Stats file season mismatch: $year");
            $type = ffSeasonType((string)ffValue($r,'season_type'));
            if ($type === 'PRE') continue;
            ++$sourceRows;
            $gid = ffValue($r,'game_id'); $team = ffTeam(ffValue($r,'team'));
            if (!$gid || !isset($games[$gid])) throw new RuntimeException("Stats game missing from schedule: $gid");
            $g = $games[$gid];
            if ($g['season'] !== $year || $g['type'] !== $type || $g['week'] !== ffInt($r,'week')
                || !in_array($team,[$g['home'],$g['away']],true)) throw new RuntimeException("Stats/schedule mismatch: $gid");
            if (!$g['complete']) continue;
            // Include trick-play attempts by non-QBs, even positions we don't import.
            $teamAttempts[$gid][$team] = ($teamAttempts[$gid][$team] ?? 0) + ffInt($r,'attempts');
            $pos = ffPosition(ffValue($r,'position'));
            if (!$pos) continue;
            $pid = ffValue($r,'player_id');
            if (!$pid) throw new RuntimeException("Missing player ID: $gid");
            if (!isset($players[$pid])) $players[$pid] = ffMinimalPlayer($pid,ffValue($r,'player_display_name'),$pos);
            $key = "$gid|$pid";
            if (isset($stats[$key])) throw new RuntimeException("Duplicate source player/game: $key");
            $row = ['gsis'=>$pid,'game_external'=>$gid,'team'=>$team,'position_at_game'=>$pos];
            foreach (FF_STAT_MAP as $dest=>$src) {
                $row[$dest] = ffInt($r,$src,false,in_array($dest,['passing_yards','rushing_yards','receiving_yards'],true));
            }
            // These aggregates can overlap on special-teams fumble-recovery TDs.
            // Do not silently count one touchdown twice; ask for play-level review.
            if ($row['return_touchdowns'] > 0 && $row['other_touchdowns'] > 0) {
                throw new RuntimeException("Ambiguous special-teams/recovery TDs: $key. Resolve from play-by-play before importing.");
            }
            if ($row['pass_completions'] > $row['pass_attempts'] || $row['receptions'] > $row['targets'])
                throw new RuntimeException("Inconsistent core stats: $key");
            $row['offensive_snaps'] = null;
            $stats[$key] = $row;
        }
        if (!$sourceRows) throw new RuntimeException("No weekly stats available for $year");
    }
    $teamsWithStats = [];
    foreach ($stats as $s) $teamsWithStats[$s['game_external']][$s['team']] = true;
    foreach ($games as $id=>&$g) {
        $g['ready'] = $g['complete'] && isset($teamsWithStats[$id][$g['home']],$teamsWithStats[$id][$g['away']]);
        if ($g['complete'] && !$g['ready']) $warnings[] = "Stats not yet available for both teams: $id; deferred.";
    }
    unset($g);
    foreach ($stats as $key=>$s) if (!$games[$s['game_external']]['ready']) unset($stats[$key]);
    $unmatchedSnaps = 0; $zeroAppearances = 0; $seenSnaps = [];
    if (!$skipSnaps) foreach ($seasons as $year) {
        foreach (ffCsv($paths['snaps'][$year],['game_id','season','pfr_player_id','position','team','offense_snaps','defense_snaps','st_snaps']) as $r) {
            if (ffInt($r,'season') !== $year) throw new RuntimeException("Snap season mismatch: $year");
            $gid = ffValue($r,'game_id');
            if (!isset($games[$gid]) || !$games[$gid]['ready']) continue;
            $pos = ffPosition(ffValue($r,'position'));
            if (!$pos) continue;
            $pfr = ffValue($r,'pfr_player_id');
            $pid = $pfrToGsis[$pfr ?? ''] ?? null;
            if ($pid === null) { ++$unmatchedSnaps; continue; }
            $key = "$gid|$pid"; $team = ffTeam(ffValue($r,'team'));
            if (isset($seenSnaps[$key])) throw new RuntimeException("Duplicate snap player/game: $key");
            $seenSnaps[$key] = true;
            if (!in_array($team,[$games[$gid]['home'],$games[$gid]['away']],true)) throw new RuntimeException("Snap team mismatch: $key");
            $offense = ffInt($r,'offense_snaps');
            $appeared = $offense + ffInt($r,'defense_snaps') + ffInt($r,'st_snaps') > 0;
            if (!$appeared) continue;
            if (!isset($stats[$key])) {
                $stats[$key] = ['gsis'=>$pid,'game_external'=>$gid,'team'=>$team,'position_at_game'=>$pos]
                    + array_fill_keys(array_keys(FF_STAT_MAP),0);
                ++$zeroAppearances;
            } elseif ($stats[$key]['team'] !== $team) throw new RuntimeException("Stats/snap team conflict: $key");
            $stats[$key]['offensive_snaps'] = $offense;
        }
    }
    if ($unmatchedSnaps) $warnings[] = "$unmatchedSnaps snap rows lack a GSIS mapping; these appearances were not filled from snaps.";
    if ($skipSnaps) $warnings[] = 'Snaps skipped; zero-stat appearances may be missing, affecting PPG.';
    foreach ($stats as $key=>&$s) {
        $s['team_pass_attempts'] = $teamAttempts[$s['game_external']][$s['team']] ?? null;
        if ($s['team_pass_attempts'] !== null && $s['targets'] > $s['team_pass_attempts']) throw new RuntimeException("Targets exceed team attempts: $key");
    }
    unset($s);
    $missingSnaps = count(array_filter($stats,static fn($s)=>$s['offensive_snaps'] === null));
    if (!$skipSnaps && $missingSnaps) $warnings[] = "$missingSnaps stat rows have no matched snap count; kept NULL. Rerun when snap data catches up.";
    if (!$stats) throw new RuntimeException('No completed player-game stats are ready to import');
    $externalOwners = [];
    foreach ($players as $gsis=>$p) foreach ($p['ids'] as $provider=>$value) {
        $key = $provider.'|'.$value;
        if (isset($externalOwners[$key]) && $externalOwners[$key] !== $gsis)
            throw new RuntimeException("Conflicting source player IDs: $key");
        $externalOwners[$key] = $gsis;
    }
    return compact('players','games','stats','warnings','zeroAppearances');
}
function ffMinimalPlayer(string $id, ?string $name, string $pos): array {
    if (!$name) throw new RuntimeException("Missing name for $id");
    return ['name'=>$name,'position'=>$pos,'birth_date'=>null,'rookie_season'=>null,
        'draft_year'=>null,'draft_round'=>null,'draft_pick'=>null,'current_team'=>null,
        'career_status'=>'UNKNOWN','ids'=>['gsis'=>$id]];
}
/** Values are bound twice to avoid deprecated VALUES(column) upsert syntax. */
function ffUpsert(PDO $db, string $table, array $columns, array $keys, array $preserveNull = []): PDOStatement {
    $updates = array_values(array_diff($columns,$keys));
    $sql = 'INSERT INTO `'.$table.'` (`'.implode('`,`',$columns).'`) VALUES ('.implode(',',array_fill(0,count($columns),'?')).') ON DUPLICATE KEY UPDATE ';
    $sql .= implode(',',array_map(static fn($c)=>'`'.$c.'`='.(in_array($c,$preserveNull,true)?'COALESCE(?,`'.$c.'`)':'?'),$updates));
    return $db->prepare($sql);
}
function ffPut(PDOStatement $stmt, array $row, array $keys): void {
    $values = array_values($row);
    foreach ($row as $column=>$value) if (!in_array($column,$keys,true)) $values[] = $value;
    $stmt->execute($values);
}
function ffEnv(string $key, string $default = ''): string {
    $v = getenv($key); return $v === false ? $default : $v;
}
function ffImport(array $data): void {
    $name = ffEnv('FF_DB_NAME','fantasy_football');
    $host = ffEnv('FF_DB_HOST','127.0.0.1'); $port = ffEnv('FF_DB_PORT','3306');
    if (!preg_match('/^[a-zA-Z0-9_]+$/',$name) || str_contains($host,';') || !ctype_digit($port)) throw new RuntimeException('Invalid database configuration');
    $socket = ffEnv('FF_DB_SOCKET');
    if (str_contains($socket,';')) throw new RuntimeException('Invalid database socket');
    $dsn = 'mysql:'.($socket !== '' ? "unix_socket=$socket" : "host=$host;port=$port").";dbname=$name;charset=utf8mb4";
    $options = [
        PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_EMULATE_PREPARES=>false,
        PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC];
    if ($socket === '' && !in_array($host, ['localhost', '127.0.0.1', '::1'], true)) {
        $ca = ffEnv('FF_DB_SSL_CA');
        if (!is_file($ca) || !is_readable($ca))
            throw new RuntimeException('Set FF_DB_SSL_CA to the CA certificate file for the remote MySQL server.');
        $options[PHP_VERSION_ID >= 80400 ? Pdo\Mysql::ATTR_SSL_CA : PDO::MYSQL_ATTR_SSL_CA] = $ca;
        $options[PHP_VERSION_ID >= 80400 ? Pdo\Mysql::ATTR_SSL_VERIFY_SERVER_CERT : PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT] = true;
    }
    $db = new PDO($dsn,ffEnv('FF_DB_USER'),ffEnv('FF_DB_PASSWORD'),$options);
    $db->exec("SET time_zone = '+00:00'");
    $lockName = 'ff_seed_'.substr(hash('sha256',$name),0,40);
    $lock = $db->prepare('SELECT GET_LOCK(?, 0)'); $lock->execute([$lockName]);
    if ((int)$lock->fetchColumn() !== 1) throw new RuntimeException('Another importer is running. Try again later.');
    try {
        // Check the original schema before adding the only required helper table.
        foreach (['teams','players','player_external_ids','games','game_teams','player_game_stats'] as $table)
            $db->query('SELECT 1 FROM `'.$table.'` LIMIT 0');
        $helperCheck=$db->prepare("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='game_external_ids'");
        $helperCheck->execute();
        if (!(int)$helperCheck->fetchColumn()) $db->exec("CREATE TABLE game_external_ids (
            provider VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
            external_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
            game_id BIGINT UNSIGNED NOT NULL,
            PRIMARY KEY (provider,external_id), UNIQUE KEY uq_game_provider (game_id,provider),
            FOREIGN KEY (game_id) REFERENCES games(game_id)
        ) ENGINE=InnoDB");
        $db->beginTransaction();
        $teamPut = ffUpsert($db,'teams',['team_code','team_name'],['team_code']);
        foreach (FF_TEAMS as $code=>$label) ffPut($teamPut,['team_code'=>$code,'team_name'=>$label],['team_code']);
        $teamIds = $db->query('SELECT team_code,team_id FROM teams')->fetchAll(PDO::FETCH_KEY_PAIR);
        $external = []; $playerProviders = [];
        foreach ($db->query('SELECT provider,external_id,player_id FROM player_external_ids') as $r) {
            $external[$r['provider'].'|'.$r['external_id']] = (int)$r['player_id'];
            $playerProviders[(int)$r['player_id']][$r['provider']] = $r['external_id'];
        }
        // Unidentified manually seeded players cannot safely be matched by name.
        $unmapped = (int)$db->query('SELECT COUNT(*) FROM players p WHERE NOT EXISTS (SELECT 1 FROM player_external_ids e WHERE e.player_id=p.player_id)')->fetchColumn();
        if ($unmapped) throw new RuntimeException("$unmapped existing players have no external IDs. Map them before importing to avoid duplicates.");
        $newPlayer = $db->prepare('INSERT INTO players (full_name,position) VALUES (?,?)');
        $profile = $db->prepare('UPDATE players SET full_name=?,position=?,birth_date=COALESCE(?,birth_date),rookie_season=COALESCE(?,rookie_season),draft_year=COALESCE(?,draft_year),draft_round=COALESCE(?,draft_round),draft_pick=COALESCE(?,draft_pick),current_team_id=?,career_status=? WHERE player_id=?');
        $newExternal = $db->prepare('INSERT INTO player_external_ids (provider,external_id,player_id) VALUES (?,?,?)');
        $playerIds = []; $playersAdded = 0;
        foreach ($data['players'] as $gsis=>$p) {
            $candidates = [];
            foreach ($p['ids'] as $provider=>$value) {
                if (isset($external[$provider.'|'.$value])) $candidates[] = $external[$provider.'|'.$value];
            }
            $candidates = array_values(array_unique($candidates));
            if (count($candidates)>1) throw new RuntimeException("Conflicting player ID mappings for $gsis; manual review required");
            if ($candidates) $id = $candidates[0];
            else { $newPlayer->execute([$p['name'],$p['position']]); $id=(int)$db->lastInsertId(); ++$playersAdded; }
            foreach ($p['ids'] as $provider=>$value) {
                if (isset($playerProviders[$id][$provider]) && $playerProviders[$id][$provider] !== $value)
                    throw new RuntimeException("Provider ID changed for $gsis ($provider); manual review required");
                if (!isset($external[$provider.'|'.$value])) {
                    $newExternal->execute([$provider,$value,$id]);
                    $external[$provider.'|'.$value] = $id; $playerProviders[$id][$provider]=$value;
                }
            }
            $profile->execute([$p['name'],$p['position'],$p['birth_date'],$p['rookie_season'],$p['draft_year'],
                $p['draft_round'],$p['draft_pick'],$p['current_team'] !== null ? $teamIds[$p['current_team']] : null,$p['career_status'],$id]);
            $playerIds[$gsis]=$id;
        }
        $gameMap = $db->query("SELECT external_id,game_id FROM game_external_ids WHERE provider='nflverse'")->fetchAll(PDO::FETCH_KEY_PAIR);
        $findGame = $db->prepare('SELECT g.game_id FROM games g JOIN game_teams h ON h.game_id=g.game_id AND h.side=\'HOME\' JOIN game_teams a ON a.game_id=g.game_id AND a.side=\'AWAY\' WHERE g.season=? AND g.season_type=? AND g.week=? AND h.team_id=? AND a.team_id=?');
        $newGame = $db->prepare('INSERT INTO games (season,season_type,week,kickoff_utc,game_status) VALUES (?,?,?,?,?)');
        $gameUpdate = $db->prepare('UPDATE games SET season=?,season_type=?,week=?,kickoff_utc=?,game_status=CASE WHEN ?=1 THEN \'FINAL\' ELSE game_status END WHERE game_id=?');
        $gameLink = $db->prepare("INSERT INTO game_external_ids (provider,external_id,game_id) VALUES ('nflverse',?,?)");
        $gameTeamInsert = $db->prepare('INSERT INTO game_teams (game_id,team_id,side) VALUES (?,?,?)');
        $getSides = $db->prepare('SELECT side,team_id FROM game_teams WHERE game_id=?');
        $gameIds = []; $gamesAdded = 0;
        foreach ($data['games'] as $externalId=>$g) {
            $home=$teamIds[$g['home']]; $away=$teamIds[$g['away']];
            $id=$gameMap[$externalId] ?? null;
            if ($id === null) {
                // Adopt an already-seeded game only if its full natural key matches.
                $findGame->execute([$g['season'],$g['type'],$g['week'],$home,$away]);
                $matches=$findGame->fetchAll(PDO::FETCH_COLUMN);
                if (count($matches)>1) throw new RuntimeException("Existing duplicate games: $externalId");
                if ($matches) $id=(int)$matches[0];
                else {
                    $newGame->execute([$g['season'],$g['type'],$g['week'],$g['kickoff'],'SCHEDULED']);
                    $id=(int)$db->lastInsertId(); ++$gamesAdded;
                }
                $gameLink->execute([$externalId,$id]);
            }
            $getSides->execute([$id]); $sides=$getSides->fetchAll(PDO::FETCH_KEY_PAIR);
            foreach (['HOME'=>$home,'AWAY'=>$away] as $side=>$teamId) {
                if (isset($sides[$side]) && (int)$sides[$side] !== (int)$teamId) throw new RuntimeException("Game teams changed: $externalId; manual review required");
                if (!isset($sides[$side])) $gameTeamInsert->execute([$id,$teamId,$side]);
            }
            // Final status and new stats become visible together at commit.
            $gameUpdate->execute([$g['season'],$g['type'],$g['week'],$g['kickoff'],(int)$g['ready'],$id]);
            $gameIds[$externalId]=(int)$id;
        }
        $columns=array_merge(['player_id','game_id','team_id','position_at_game'],array_keys(FF_STAT_MAP),['offensive_snaps','team_pass_attempts','source']);
        // Preserve a prior snap count if this run's supplemental source is absent.
        $putStats=ffUpsert($db,'player_game_stats',$columns,['player_id','game_id'],['offensive_snaps']);
        $owned=$db->prepare('SELECT source FROM player_game_stats WHERE player_id=? AND game_id=?');
        $inserted=0; $refreshed=0;
        foreach ($data['stats'] as $s) {
            $pid=$playerIds[$s['gsis']]; $gid=$gameIds[$s['game_external']];
            $owned->execute([$pid,$gid]); $source=$owned->fetchColumn();
            if ($source !== false && $source !== FF_STATS_SOURCE) throw new RuntimeException("Other source owns player $pid/game $gid: $source");
            $row=['player_id'=>$pid,'game_id'=>$gid,'team_id'=>$teamIds[$s['team']],'position_at_game'=>$s['position_at_game']];
            foreach (FF_STAT_MAP as $dest=>$unused) $row[$dest]=$s[$dest];
            $row['offensive_snaps']=$s['offensive_snaps']; $row['team_pass_attempts']=$s['team_pass_attempts']; $row['source']=FF_STATS_SOURCE;
            ffPut($putStats,$row,['player_id','game_id']);
            if ($source === false) ++$inserted; else ++$refreshed;
        }
        $db->commit();
        ffLog("Committed: $playersAdded new players; $gamesAdded new games; $inserted new player-game rows; $refreshed existing rows refreshed.");
    } catch (Throwable $e) {
        if ($db->inTransaction()) $db->rollBack();
        throw $e;
    } finally {
        $release=$db->prepare('SELECT RELEASE_LOCK(?)'); $release->execute([$lockName]);
    }
}
function ffMain(array $argv): int {
    if (PHP_SAPI !== 'cli') throw new RuntimeException('Run this script from PHP CLI, not a web URL');
    if (PHP_VERSION_ID < 80100) throw new RuntimeException('PHP 8.1+ required');
    $options=[];
    foreach (array_slice($argv,1) as $arg) {
        if (in_array($arg,['--help','--validate-only','--skip-snaps'],true)) $options[substr($arg,2)]=true;
        elseif (preg_match('/^--(seasons|data-dir)=(.+)$/',$arg,$m)) $options[$m[1]]=$m[2];
        else throw new RuntimeException("Unknown argument: $arg. Use --help");
    }
    if (isset($options['help'])) {
        echo "Usage: php seed_fantasy_football.php [--seasons=2023,2024,2025,2026] [--validate-only] [--data-dir=/path] [--skip-snaps]\n";
        echo "Set FF_DB_HOST, FF_DB_PORT, FF_DB_NAME, FF_DB_USER and FF_DB_PASSWORD. See file header for cron and details.\n";
        return 0;
    }
    $today=new DateTimeImmutable('now',new DateTimeZone('America/New_York'));
    $current=(int)$today->format('Y')-((int)$today->format('n')<=2 ? 1 : 0);
    $seasonText=$options['seasons'] ?? (string)$current;
    if (!preg_match('/^\d{4}(,\d{4})*$/',$seasonText)) throw new RuntimeException('Use comma-separated four-digit seasons');
    $seasons=array_values(array_unique(array_map('intval',explode(',',$seasonText)))); sort($seasons);
    foreach ($seasons as $year) if ($year<1999 || $year>$current) throw new RuntimeException("Season out of range: $year");
    $local=isset($options['data-dir']); $dir=$local ? realpath($options['data-dir']) : sys_get_temp_dir().'/ff_seed_'.bin2hex(random_bytes(8));
    if ($local && (!$dir || !is_dir($dir))) throw new RuntimeException('Data directory does not exist');
    if (!$local && !extension_loaded('curl')) throw new RuntimeException('Install PHP curl extension');
    if (!isset($options['validate-only']) && !extension_loaded('pdo_mysql')) throw new RuntimeException('Install PHP pdo_mysql extension');
    if (!$local && !mkdir($dir,0700)) throw new RuntimeException('Cannot create temporary directory');
    try {
        $paths=[];
        $paths['players']=ffInput('players.csv',FF_RELEASE.'players/players.csv',$dir,$local);
        $paths['games']=ffInput('games.csv','https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv',$dir,$local);
        $paths['rosters']=ffInput("rosters_$current.csv",FF_RELEASE."rosters/roster_$current.csv",$dir,$local);
        foreach ($seasons as $year) {
            $paths['stats'][$year]=ffInput("stats_$year.csv",FF_RELEASE."stats_player/stats_player_week_$year.csv",$dir,$local);
            if (!isset($options['skip-snaps'])) $paths['snaps'][$year]=ffInput("snaps_$year.csv",FF_RELEASE."snap_counts/snap_counts_$year.csv",$dir,$local);
        }
        $data=ffBuild($paths,$seasons,$current,isset($options['skip-snaps']));
        ffLog('Validated '.count($data['players']).' players, '.count($data['games']).' games, '.count($data['stats']).' player-game rows ('.$data['zeroAppearances'].' zero-production appearances added from snaps).');
        if (isset($options['validate-only'])) ffLog('Validation only: no database connection or writes.');
        else ffImport($data);
        foreach (array_slice($data['warnings'],0,20) as $warning) ffLog('WARNING: '.$warning);
        if (count($data['warnings'])>20) ffLog((count($data['warnings'])-20).' additional warnings omitted.');
        return $data['warnings'] ? 2 : 0;
    } finally {
        if (!$local) { foreach (glob($dir.'/*.csv') ?: [] as $file) unlink($file); rmdir($dir); }
    }
}
// Allows a test harness to load the pure normalization functions without running CLI.
if (!defined('FF_SEED_LIBRARY_ONLY')) {
    try { exit(ffMain($argv ?? [])); }
    catch (PDOException $e) { fwrite(STDERR, "Database import failed. Check the connection, privileges and schema.\n"); exit(1); }
    catch (Throwable $e) { fwrite(STDERR,'ERROR: '.$e->getMessage()."\n"); exit(1); }
}
