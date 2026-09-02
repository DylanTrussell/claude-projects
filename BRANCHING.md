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

A real choice, made by steering. Not a menu, and not a skill check.

I was unclear before, so plainly: forget hit points and forget the lock. Here is
the sequence.

1. The scanner ship comes in low over the river, hunting, same as it does now.
2. It takes your bow-gun fire on the way in and augers into the water ahead of
   you. This is scripted. You are already shooting, so you will always hit it,
   and it always goes down. No skill gate.
3. Now the river ahead has two ways through, both visible for a good five
   seconds before you have to commit:
   - **OVER IT.** The wreck lies half-submerged with a sheared-off fin angled up
     out of the water. It is obviously a ramp.
   - **AROUND IT.** Clear open water to the left, heading for the sea.
4. You steer. That is the choice.

**Over the ramp** → you launch, get enormous air, and come down in the jungle.
New short section, then east to the LZ.

**Around it** → as you draw level, the wreck's reactor lets go and the blast
takes your stern off. You are in the water, and you are on the board. That is
the section that exists today, and it now has a cause you chose.

That last part is the piece that makes it cheap: **one event serves both
outcomes.** The wreck either launches you or kills you, depending on which side
of it you pass. No second ship, no extra asset, no new failure state.

And it says something. The reckless line gets you the jump. The careful line
gets you wrecked. That is funny, and it is the right lesson for this game.

**What is actually new:** the ramp launch, the landing, and a short jungle
stretch before the LZ. The boat is already a rail, so the jump is a camera move
and an animation, not a new system.

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

Scratch the cheese one. I checked: there are two cheese pickups in the entire
game and they are a lure you throw, not caches you burn. The objective string
exists and is fired from nowhere. It is not established, so an ending cannot
stand on it.

Four better ones.

### 1. The radio — this is the one
Grimtail is down. The fleet pulls out. Whiskers and Charlie are standing in the
smoke on the LZ, and both their radios crackle at the same moment. Their own
armies. The alien war is over. Theirs is not.

Neither of them moves. Hold on the two of them, not moving. Cut to END OF PART
ONE.

The whole game is two enemies who teamed up because something worse showed up.
The only ending that means anything is the one that asks what happens when the
worse thing is gone. It costs one shot and two radio squawks, and it is the
ending the story has been writing for itself since the truce.

### 2. They take the ship
They win, and instead of walking away they walk INTO the flagship. Last shot is
two cats at an alien control console, Charlie's straw hat hung on the throttle,
lifting off. Part two is in space.

The most fun one, and the clearest promise that part two is a different game.

### 3. The ninth life
The game already counts lives on the HUD. Say he has spent eight getting here.
The ending is him spending the ninth to shove Charlie clear of the last shot —
and part two is Charlie, alone, wearing the hat.

Turns a number the player has been watching all game into the ending.

### 4. Nobody won
You kill him and the fleet does not leave. It stops. Every ship goes dark and
starts to drift, because he was the thing giving the orders and now there is
nothing. The sky is full of dead ships that are all going to come down. Hold on
the first one beginning to fall.

---

## What I would build, in order

1. Fork 1. Nearly free, and it tells you whether players engage with a choice.
2. Ending 1, the radio. One shot, and it is the ending this story is owed.
3. Fork 2, the ramp. The best beat of the three.

Stop there. Two forks and one strong ending is three routes, which the gate can
still cover honestly.
