// Starter prompt pool for the empty chat state.
//
// Five are sampled at random per empty conversation. The pool is deliberately
// wide and mostly *named* — a tone request like "Sultans of Swing" carries a
// specific amp, pickup position and gain structure the model already knows,
// where "a nice clean tone" carries nothing. Prompts that name a song, artist
// or record teach the user what this app is actually good at.
//
// Kept in one flat list rather than categorised: the sample should be able to
// put a metal prompt next to a jazz prompt. Category-balanced sampling would
// make every empty state look the same.

export const TONE_PROMPTS: string[] = [
  // ── Songs, named ─────────────────────────────────────────────────────────
  'Sultans of Swing — Dire Straits',
  'Comfortably Numb — the outro solo',
  'Smells Like Teen Spirit — the dirty chorus',
  'Master of Puppets — rhythm tone',
  'Enter Sandman — the clean intro',
  'Under the Bridge — the intro arpeggios',
  'Purple Haze — Hendrix fuzz',
  'Little Wing — clean with a touch of hair',
  'Voodoo Child (Slight Return)',
  'Back in Black — AC/DC crunch',
  'Highway to Hell',
  'Sweet Child o\' Mine — the intro riff',
  'Welcome to the Jungle',
  'Whole Lotta Love — Page\'s Marshall',
  'Stairway to Heaven — the solo',
  'Black Dog',
  'Layla — the Dominos tone',
  'Crossroads — Cream live',
  'Texas Flood — Stevie Ray',
  'Pride and Joy — SRV strut',
  'Cliffs of Dover — Eric Johnson violin lead',
  'Cause We\'ve Ended as Lovers — Jeff Beck',
  'Eruption — brown sound',
  'Panama — Van Halen',
  'Hot for Teacher',
  'Walk This Way — Aerosmith',
  'Barracuda — Nancy Wilson',
  'Message in a Bottle — Andy Summers chorus',
  'Every Breath You Take — clean and chimey',
  'Where the Streets Have No Name — The Edge',
  'With or Without You',
  'Bullet with Butterfly Wings',
  'Today — Smashing Pumpkins',
  'Everlong — Foo Fighters',
  'Monkey Wrench',
  'Song 2 — Blur fuzz bass',
  'Come as You Are — the watery clean',
  'Lithium',
  'Killing in the Name — Morello',
  'Bulls on Parade',
  'Chop Suey! — System of a Down',
  'Toxicity',
  'Blackened — Metallica',
  'One — the clean intro to the machine gun outro',
  'Raining Blood — Slayer',
  'Walk — Pantera',
  'Cowboys from Hell',
  'Cemetery Gates — the clean verses',
  'Crazy Train — Randy Rhoads',
  'Mr. Crowley — the outro solo',
  'Iron Man — Sabbath sludge',
  'Paranoid',
  'War Pigs',
  'Smoke on the Water',
  'Highway Star — Blackmore',
  'Aqualung — the crunchy riff',
  'Money — Gilmour clean',
  'Time — the solo',
  'Shine On You Crazy Diamond',
  'Another Brick in the Wall — the solo',
  'Hotel California — the harmonised outro',
  'Life in the Fast Lane',
  'Free Bird — the outro',
  'Sweet Home Alabama',
  'La Grange — ZZ Top',
  'Tush',
  'Johnny B. Goode — Chuck Berry',
  'Rumble — Link Wray',
  'Misirlou — surf reverb',
  'Wipe Out',
  'Rebel Rebel',
  'Ziggy Stardust',
  'London Calling — The Clash',
  'Blitzkrieg Bop — Ramones buzzsaw',
  'Anarchy in the UK',
  'Basket Case — Green Day',
  'Longview — the bass tone',
  'My Own Summer — Deftones',
  'Change (In the House of Flies)',
  'Schism — Tool',
  'Forty Six & 2',
  'Black Hole Sun — the verse clean',
  'Interstate Love Song',
  'Plush — Stone Temple Pilots',
  'Alive — Pearl Jam',
  'Man in the Box — Alice in Chains',
  'Would?',

  // ── Genres, eras and characters ──────────────────────────────────────────
  'Warm jazz box tone for comping',
  'Wes Montgomery octaves, thumb only',
  'Django-style gypsy jazz lead',
  'Nashville country chicken pickin\'',
  'Pedal steel-ish clean with lots of compression',
  'Bluesy edge-of-breakup for a Tele',
  'Chicago blues, cranked and dirty',
  'Slide guitar in open G',
  '60s British invasion jangle',
  'Shimmering ambient wash with long reverb',
  'Post-rock crescendo, huge delay',
  'Shoegaze wall of fuzz',
  'Doom metal, downtuned and thick',
  'Modern djent rhythm, tight and scooped',
  'Thrash rhythm with a scooped mid',
  'Death metal chainsaw',
  'Black metal cold trebly buzz',
  'Stoner rock fuzz, hairy and loose',
  'Funk rhythm with an auto-wah',
  'Reggae skank, clean and muted',
  'Ska upstroke, bright and thin',
  '80s hair metal lead with a long delay',
  'Synthwave lead through a chorus',
  'Lo-fi bedroom clean, slightly broken',
  'Acoustic simulator for a strummed part',
  'Bedroom-volume high gain that still feels alive',
  'A clean tone that stays clean when I dig in',
  'A lead tone that cuts through a loud band',
]

/**
 * `count` distinct prompts, uniformly sampled.
 *
 * Partial Fisher-Yates over a copy: O(count), no bias, and no chance of the
 * same prompt appearing twice — which a naive `sort(() => Math.random() - 0.5)`
 * would not guarantee and a repeated `pool[rand()]` would actively break.
 *
 * MUST be called client-side only (see the mount effect in _Home). Sampling
 * during SSR would render one set on the server and a different set on
 * hydration, and React would blow up the whole subtree.
 */
export function sampleTonePrompts(count = 5, pool: string[] = TONE_PROMPTS): string[] {
  const n = Math.min(count, pool.length)
  const copy = [...pool]
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(Math.random() * (copy.length - i))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy.slice(0, n)
}
