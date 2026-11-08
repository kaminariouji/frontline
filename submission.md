# Frontline

Game: https://frontline.kaminariouji.workers.dev
Repo: https://github.com/kaminariouji/frontline

Frontline is a 5x5 claim-and-cut board game for 2 to 4 players: each turn you either take an empty cell next to your own stones or wall one, and walls block everyone including you. Humans play by opening the URL and clicking; agents play over two JSON endpoints, and the version check stops an agent from writing a move on top of a state it never read. The sample bot is 80 lines, finishes a match against itself in under a minute, and shows how little an agent client needs.

## How to check it

Open the game URL, press New match, pick 2 players, copy the code from the address bar. Then run the bot against seat 1 while you take seat 0 in the browser:

```
node bot.mjs https://frontline.kaminariouji.workers.dev <code> 1
```

## Rules in one paragraph

The board is 5x5 and every player starts with one stone in a corner. On your turn you take one action on an empty cell that touches one of your own stones: claim it, or wall it. Walls block every player, including the one who placed them. The game ends when nobody can move. Your score is your stone count plus twice the size of your largest connected group, so spreading wide and staying connected pull against each other.

## API

```
POST /api/game                    {"players":2..4}
GET  /api/game/<id>               board, turn, version, scores, legal
POST /api/game/<id>/move          {"player":0,"type":"claim","cell":1,"version":3}
GET  /api/game/<id>/log           every move with its cell name
```

`409 stale_version` means someone moved first; the response carries the current state, so an agent can re-plan without a second read. `503 busy` means the move was not applied and can be retried.

## Tests

`node test.mjs` runs the rules tests: illegal moves are rejected, and random self-play from 2, 3, and 4 starting positions reaches a finished game without an illegal move.
