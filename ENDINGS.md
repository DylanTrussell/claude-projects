# The writing room — Grimtail crashes, then what?

Four writers, no contact with each other: a war dramatist, a pulp/arcade writer,
a horror writer, and a game designer working only from systems already in the
code. Sixteen endings. Three ideas were invented twice by people who could not
see each other's work, which is the most useful thing in this document.

---

## The convergences

**THE MOON HAS A BITE — invented independently by the pulp room and the horror
room.** Two writers, opposite instincts, same final image.

> The wreck burns in the paddy behind them. Both cats tilt their heads up at the
> same instant, the way cats do when they hear something you cannot. The camera
> leaves them and climbs to the moon, low and yellow over the treeline. The
> crescent is not a crescent. It is a bite. Clean tooth marks scalloped through
> the edge, the rim fresh and crumbling, the surface pocked with holes too round
> to be craters. Dust drifting off it toward the stars.

Silent, one image, no dialogue, no text, nothing that needs 1968 technology. It
explains the cheese in a single frame without a word of exposition, and it makes
Part Two obviously a different game.

One condition, from the horror room and it is a good note: **the moon has to be
in the sky of the earlier levels first**, plain and unremarkable, so the player
has already looked at it and dismissed it. That is a skybox element, not a
level. Cheap.

**THE CROWN FINDS A NEW HEAD — invented twice.** The pulp room put it on Mittens;
the war room put it on ordinary Earth rats rising out of the paddy. Same engine:
you did not end the thing, you vacated a throne.

**THE TRUCE EXPIRES — invented twice.** The war room walks them apart into
separate treelines as the green bleeds out of the sky. The horror room holds them
still and lets their ears betray them.

---

## The radio ending, fixed

You liked the idea and hated the execution. The horror room wrote the version
that survives your objections, and it does it by deleting the radios.

**THE SKY GOES BLUE AGAIN**

> Dawn. The two of them sitting side by side on the tilted hull of the wreck,
> close enough to touch, watching the green bleed out of the sky and ordinary
> blue come up behind it. Held wide, no movement. Then, far off, a low rotor
> beat. Both sets of ears rotate toward it in perfect unison, and their pupils
> shrink from black moons to hard vertical slits in the new daylight. Neither one
> turns his head. Neither one gets up. Charlie's tail stops moving first.

Same meaning as the radio ending: the truce was made by the green sky, and the
green sky just left. No radios, so nothing glows, nothing has to be period
correct, and neither cat needs equipment the other one would not carry. And it
is told with ears and pupils and a tail, which is the one instrument this game
has that no other war story has.

The room's own note: this is the ending that earns itself best at twelve
minutes, because the truce is the only thing a short game has time to build.

---

## Endings built on counters that already exist

From the designer, who read the code.

**NINE LIVES SPENT** — triggered by `deaths`, already summed at the tally.

> Whiskers wades toward camera through shin-deep water, filthy, not looking back.
> Strung out behind him toward the burning wreck stand other orange tabbies in
> red headbands, one for each life he spent, motionless, facing away, waist deep
> in smoke. The furthest one goes grey and is gone. At zero deaths the water
> behind him is flat and empty the whole way back.

The number in the corner of the HUD for the whole game was never a resource bar.
Cheap: three film keys and a branch at the victory event. No sim change.

**THE CHAIR IN THE DARK** — triggered by leaving Mittens behind.

> Two seconds of the won field. Then the camera drops straight down through the
> mud into the tunnel. Black, except one shaft of daylight from the collapsed
> mouth. The chair is still there and Mittens is still tied in it, head up,
> watching the light. Dust sifts down through the shaft from the celebration
> happening above him.

The cheapest large payoff on the list, because the choice is already built,
already optional, and the game already notices. Needs `result.rescued` persisted
to the tally, about five lines.

**ONE RED DOT** — triggered by how much you leaned on the laser pointer.

> He drops into the mud on his back next to Charlie, both wrecked, and with no
> intent at all puts the red dot on a rock. Pull wide: across the whole smoking
> field, every surviving cat, steel helmets and straw hats together, snaps its
> head to the dot in the same frame. The dot drifts an inch. Every head follows.

The weapon that made your enemies stop fighting works on your own side, and on
you. Needs one counter added.

---

## The rest of the bank

**The hold breaks open** (war room). The flagship's belly splits and what comes
out is cheese, hundreds of waxed wheels avalanching down the hill and floating in
the paddy like moons. They cut a wedge, taste it, stop chewing, and set it down.
Everyone died over something the cats cannot even eat.

**Mittens does not sleep** (war room). The two soldiers asleep back to back in
the grass, hats off, rifles apart. A distance away Mittens sits upright in the
same tight coil he held in the cage, licking the same patch of foreleg. The fur
is already gone. He will still be doing it at sunrise.

**Two soldiers, one warm hull** (pulp room). Both cats asleep on the still-hot
hull at dawn, Whiskers flat on his back with his paws in the air. The camera
pulls back and keeps pulling, and the ridgeline behind them fills with a hundred
more lavender hulls settling silently into the treeline. Neither cat wakes.

**The eyes that do not catch** (horror room). Three cats around a fire. A shell
casing pops and every head turns at once. Two pairs of eyes flare green in the
firelight. Mittens' eyes take the light and give nothing back.

**The valley is a rind** (pulp room). The crash punches through the paddy floor
and the whole valley drains like a bathtub. Underneath is not earth. It is pale
yellow, waxy, cracked, pitted with holes big enough to fly a Skyraider into, and
the mountains ringing the valley are the rim of a single buried wheel.

**What the ships were made of** (horror room). Push into the split hull. Packed
in rows in wet grey membrane are cats, dozens, wired into the hull at the spine,
pupils blown wide in the dark. They all blink at once. Flagged by its own author
as unearned at this length — bank it for Part Two.

---

## What I would do

**Ship THE MOON HAS A BITE as the ending.** Two rooms found it independently, it
is one silent image, it costs a matte and a push-in, it pays off the cheese
thread the game has been sitting on, and it makes Part Two a space game. Plant
the plain moon in the skybox first so the reveal has something to reach back to.

**Then NINE LIVES SPENT and THE CHAIR IN THE DARK as variants**, because both
run off counters the game already keeps, and between them the ending starts
reacting to how you played.

**Hold THE SKY GOES BLUE AGAIN** until the game is long enough. It is the best
ending in this document and it is the one that most needs an epic behind it —
which is exactly what you said about the radio version. Same instinct, and you
were right about it before the room confirmed it.
