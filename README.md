# fantasy_football_trade_calculator

A basic full stack application that gives a grade value for each side of a fantasy football trade to ensure you are getting the most out of your trades.

## Run the calculator on your computer

You can open the home page as soon as you finish steps 1–3. To search for players and grade trades, also connect the app to a database with player records in step 4.

### 1. Get the project and install Node.js

If you already have the project folder, open it. If you are starting on GitHub, click the green **Code** button and choose **Download ZIP**. On Windows, right-click the downloaded file and choose **Extract All**. On a Mac, double-click it. Open the extracted folders until you see `package.json` alongside this README. Keep that folder open.

Install **Node.js**, the program that runs the app. Choose the **LTS** installer for your computer, version **22 or newer**, and follow the installer prompts. The installer also provides `npm`, which you will use below. [Download Node.js](https://nodejs.org/en/download)

### 2. Open a command window in the project folder

A command window lets you give your computer a written instruction. In the steps below, copy one command at a time, paste it into that window, and press **Enter** or **Return**.

- **Windows** — In the folder containing `package.json`, click the File Explorer address bar at the top, type `cmd`, and press **Enter**. A Command Prompt window opens in that folder.
- **Mac** — Press **Command + Space**, type `Terminal`, and press **Return**. In Terminal, type `cd` followed by a space. Drag the project folder from Finder into Terminal and press **Return**.

Run `node -v`. You should see a version beginning with `v22` or a higher number. If the computer says it cannot find the command, close the command window after installing Node.js and repeat this step.

### 3. Start the website

Run the following command once to download the pieces the app needs. Keep your internet connection on and wait until you can type another command.

```sh
npm ci
```

Start the app with this command.

```sh
npm run dev
```

Keep the command window open. When it says **Ready**, open your web browser and enter the address shown beside **Local** in the window, usually [http://localhost:3000](http://localhost:3000). You should see the fantasy football home page. This address opens the copy running on your own computer.

### 4. Connect the player data

**If someone gave you a working copy**, open **Player Rankings** and choose a season they loaded. If you see player names, you can go straight to **Trade Calculator**. For a shared database, obtain a dedicated read-only login through a private channel, then go to **Save the connection details** below.

**If you are starting with an empty computer**, the project includes an empty database layout and a program that downloads NFL player records. Follow these steps once.

1. Install **MySQL Community Server** (version 8.0.16 or newer) and **MySQL Workbench**. Start the server and keep the administrator password you choose during setup. Workbench is the window where you will create the database. [MySQL Community downloads](https://dev.mysql.com/downloads/)
2. Open Workbench, open the connection for the MySQL server on your computer, and enter its password. Choose **File → Open SQL Script** and select `migrations/initial.sql` inside the project folder. Click the lightning bolt that runs the whole script. This creates the database named `fantasy_football`. Run this file only once on a fresh database.
3. Install **PHP 8.1 or newer** for the command line with the **curl** and **pdo_mysql** extensions enabled. These let the download program fetch records and save them in MySQL. Open a second command window in the project folder using step 2. Run `php -v` to check the version and `php -m` to check that both extension names appear. [PHP installation instructions by operating system](https://www.php.net/manual/en/install.php)
4. In that second window, give the import program a MySQL account with write access to the project database and permission to create its helper table. Enter the password at the hidden prompt so it stays out of command history. These examples connect to local MySQL.

   **Windows (PowerShell in the project folder)**

   ```powershell
   $env:FF_DB_USER = 'your_import_user'
   $env:FF_DB_PASSWORD = [System.Net.NetworkCredential]::new('', (Read-Host 'MySQL import password' -AsSecureString)).Password
   ```

   **Mac (Terminal)**

   ```sh
   export FF_DB_USER='your_import_user'
   echo 'Enter your MySQL import password and press Return'
   read -rs FF_DB_PASSWORD
   export FF_DB_PASSWORD
   ```

5. In the same window, run the command below to download the 2025 season. Wait for the import to finish before looking for players. You can repeat the command with another season once its game statistics are available.

   ```sh
   php scripts/seed_data.php --seasons=2025
   ```

Close the import window when finished. In MySQL Workbench, create a separate account for the website with only `SELECT` on `fantasy_football.*`, restricted to the app's host.

**Save the read-only connection details.** In the command window running the website, press **Ctrl + C** to stop it. Open the settings file by running `notepad .env.local` on Windows (choose **Yes** to create it) or `touch .env.local`, `chmod 600 .env.local`, and `open -e .env.local` on a Mac. For an existing file, update the matching lines. For a new file, paste these five lines and enter the read-only account details.

```text
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=your_read_only_user
DB_PASSWORD=your_password
DB_NAME=fantasy_football
```

Save the file as plain text with the exact name `.env.local` and keep it private. Use the optional **Lineup Rating** setup below to enable AI ratings.

Run `npm run dev` again and reopen the **Local** address. To check the connection, add `/api/health` to that address in your browser. Look for `"database":"connected"`. Then open **Player Rankings** from the home page and choose the season you imported. Seeing player names confirms the records are available.

### Stop the app and open it again later

Press **Ctrl + C** in the window running the app to stop it. Next time, make sure MySQL is running, open a command window in the project folder, run `npm run dev`, and visit the **Local** address again. Your installed files and imported players stay on your computer.

### If you get stuck

- **The install mentions a missing `package.json`.** Reopen the command window in the extracted folder where you can see that file, then rerun `npm ci`.
- **The browser cannot open the home page.** Check that the command window still says the app is running. Copy the full **Local** address, including the number at the end. It can change if another app is using 3000.
- **The home page opens but the database check fails.** Make sure MySQL is running, check the five settings in `.env.local`, and restart the app after saving changes.
- **The database is connected but the rankings are empty.** Select the season you downloaded and check the final messages in the player import window for errors.

## Lineup Rating

The `/lineup-review` page supports starting slots (QB, RB, WR, TE, FLEX, and
SUPERFLEX), bench players, redraft/keeper/dynasty leagues, standard/half/full PPR,
league size, season, optional draft position, and optional goals or keeper/pick
context. The existing database catalog supports offensive skill positions only.

The server requires the existing database runtime configuration (`DB_HOST`,
`DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`) and imported player/scoring data.
Supply `GEMINI_KEY` and `GEMINI_MODEL` in the server environment. Use a Gemini
model supporting JSON Schema structured output; the model can be a bare model
ID or start with `models/`. The Gemini key stays on the server. No new
database migration or production dependency is required. Allow at least 60
seconds for the endpoint in the hosting configuration.

To enable paid ratings, generate a separate lineup access code on your computer.

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Save the output as `LINEUP_ACCESS_TOKEN` in the server environment or your ignored
`.env.local` file and restart the app. Enter that code in the lineup form. Share
it privately only with people allowed to spend your Gemini quota. You can revoke
all copies by replacing the value on the server and restarting. Keep the Gemini
key out of the form. The roster, league settings and optional notes go to Google
Gemini when you submit. Rankings and trade calculations work without AI credentials.

For a hosted demo, serve the app over HTTPS. Leave `LINEUP_ACCESS_TOKEN` unset for
a public demo with paid ratings disabled. To offer ratings to invited users,
set a provider quota and rate-limit the endpoint at the host. Keep MySQL on a
private network. Use a DNS hostname matching its TLS certificate for remote
connections. The app accepts a private CA's PEM contents via `DB_SSL_CA`. The
PHP import command requires a CA file path in `FF_DB_SSL_CA` for remote imports.

`GET /api/lineup-review?season=2026&scoring=PPR` loads player data for entry.
`POST /api/lineup-review` requires an `Authorization: Bearer <lineup access code>`
header and accepts `LineupRequest` from `lib/lineup/types.ts`. It
validates unique selections and position eligibility, and reloads canonical
player facts before calling the server-only AI service. History and projections
are labeled with the selected season and projection window; absent or stale
data must be acknowledged by the model. User notes are untrusted context.
Only validated grade, ranked needs, and summary fields are returned.

The reusable prompt and JSON Schema are in `lib/lineup/prompt.ts`.
Provider-specific requests, credentials, timeouts, and error handling stay in
`lib/ai/service.ts`; another provider can implement `AIService` and be selected
in `getAIService` without changing the page.

Checks: `node --test tests/*.test.cjs`, `npm run typecheck`, and `npm run build`.
The lineup tests use database and provider fixtures, including the complete
POST path and invalid, blocked, truncated, and unavailable provider responses.
They do not read environment files or make paid model calls. Next.js normally
loads environment files for type generation/build/start; when those files must
not be accessed, run these commands in a source copy that excludes `.env*`.
