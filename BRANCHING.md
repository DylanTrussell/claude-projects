# Branching — where the forks go, and what they cost

Your two fork points are better than the one I proposed. Both are after the
invasion, both re-converge, and one of them is nearly free because the content
already exists.

---

## FORK 1 — helicopter or Skyraider

**Cost: low. Both levels already exist.**

Right now they are sequential and far apart. `doorgun` fires the moment the
truce film ends (`main.js:347`). `skyraider` fires much later, at `camMid >
5700` (`sim.js:839`). So today you always play both.

The fork: the truce ends, and instead of the Huey arriving, you get the choice.
Take the one you pick, the other never fires.

You are right that they are not that different — both are air rails with a
tier-upgrade ladder. That is exactly why this is the right first fork. The
player loses nothing they cannot get on a replay, and the two runs feel
different because the weapons and the terrain differ.

Worth making them read as a real decision rather than a menu:

- **Huey** — you are the door gunner. Someone else flies. Closer to the ground,
  more of the war visible, you protect the aircraft you are in.
- **Skyraider** — you fly it. Napalm, the treeline burn, nobody to protect but
  yourself.

One line each is enough. The pictures do the rest.

**What it costs:** a choice screen, one flag, and the `5700` trigger learning to
check it. The checkpoint snapshot already carries `rail1`, so a continue lands
back in the branch you chose.

---

## FORK 2 — the boat

Your idea, with one change I would make.

You proposed: one path blows the boat up and puts you on the surfboard, the
other keeps you on the boat, and a piece of a downed alien ship becomes a ramp
that throws you back onto land.

The change: **don't put this on a menu. Make the player earn it.**

The boat section already ends with the scanner ship arriving, sweeping the
river, locking on and burning your boat. That sequence went in this week. Right
now it is unstoppable — it happens on a timer and you watch.

Give it hit points instead.

- The ship comes in and starts its scan sweep, same as now.
- While it sweeps, it is **shootable**. Your bow gun hurts it.
- Break it before the lock completes → it comes down in the river ahead of you,
  a fin shears off, and that fin is your ramp. You hit it, get big air, and come
  down in the jungle.
- Fail → it locks, burns your boat, and you are on the board. Exactly what
  happens today.

Why this is better than a menu:

1. The choice is made by playing, so it feels like a thing you did rather than a
   thing you picked.
2. It turns a cutscene you watch into a fight you can win, which is the same
   note as everything else on the list: no beat that just happens at you.
3. It costs almost nothing new. It is a second ending to a level that already
   exists, not a new level. The ship, the scan cone and the kill beam are
   already built and already on screen.
4. It pays off the standing rule twice over — the ramp is made of the thing you
   shot down, in front of you.

**What is actually new:** the ramp jump and the landing. Call it 15 seconds. The
boat is already a rail with a physics-free steer, so the jump is an animation
and a camera move, not a new system.

**Where they converge:** both paths have to arrive at the LZ for the parley. The
surf path already does. The jungle path lands you in the trees and you walk east
into the same place. Same next beat either way.

---

## What this costs that is easy to miss

Not the art. The testing.

`simtest` and `playtest` walk one path. The moment there are two, either half
the game stops being covered by the gate, or every gate run doubles. Two forks
is four paths.

The cheap answer: `playtest --branch=a|b` picks the route, and the gate runs
both. Two forks stays manageable. Four forks does not, which is the real
argument for stopping at two.

---

## Alternate endings

Five, cheapest first.

### 1. He gets up
You kill him, the hull comes apart — and he drags himself out of the wreckage,
still alive, reaching for a half-melted wheel of cheese. Hard cut to END OF PART
ONE.

Cheapest of all: the code for it is still sitting in `boss2.js` behind a
comment, waiting on art that matches him. It is one edit once the sprite lands.

### 2. The cheese ending
The whole game says they came for the cheese and you have been burning it all
run. So count it. Burn every cache and the fleet is starving when it reaches the
LZ. Grimtail does not fight — he offers a trade, and the rats leave with what is
left. You win the war by having already won it, before the boss appeared.

This one is my favourite because it retroactively makes an existing mechanic
matter. The player learns the cheese was the point.

### 3. One cat short
If you walked out of the tunnel without Mittens, he is not on the LZ. Same
fight, but the shot that should have been blocked lands on Charlie. You win and
you carry him out. Costs one conditional and a sprite you already have.

### 4. Lay down your arms
Grimtail says it twice in the parley and the game never lets you do it. Let you.
He honours it, takes the island anyway, and part two starts from a loss. The
darkest one and the strongest hook.

### 5. Nine lives
You have nine. Spend all nine and the ninth death is not a game over, it is the
ending — you come back for part two as something else. Turns the fail state into
a story beat instead of a wall.

---

## What I would build, in order

1. Fork 1. It is nearly free and it tells you whether players engage with a
   choice at all.
2. Ending 1. It is one edit behind a comment.
3. Fork 2, as the earned version. The best beat of the three.
4. Ending 2, the cheese ending, if the forks land well.

Stop there. Two forks and two endings is four routes, which is the most the gate
can cover honestly without the QA becoming the project.
