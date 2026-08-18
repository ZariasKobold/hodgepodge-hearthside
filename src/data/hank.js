/**
 * Hank's dialogue.
 *
 * Kept apart from the components so the voice can be edited without touching
 * render logic, and so the "Hank: on / off" toggle is a single conditional at
 * the call site rather than conditionals scattered through the UI.
 *
 * Rules-gap explanations do NOT live here. Those stay in the components and
 * show in both modes — they are substance wearing a costume, and someone who
 * turned Hank off still needs to know the app floors negative scrip at zero.
 *
 * Creation steps run once, so they hold a single line. Aftermath runs weekly
 * for the length of the campaign, so it holds a rotation keyed to the week
 * number — stable rather than random, so the same week always reads the same.
 */

export const CREATION = {
  identity: `"Well I declare, if it ain't a visitor. Howdy young'un. Welcome to my campsite fire. Take off a load n' come talk to me a while. Many folk know me as the Hodgepodge Emissary but that there's a mouthful. Call me Hank. That there's my faithful donkey, Henrietta. Now why don' you tell me about yerself?"`,

  arsenal: `"Well now, ain't you a mighty interestin' one. 'Preciate you sharin' your story with me. Seems like y'all are one them types who attracts a followin', even if yer just gettin' started. What's yer crew like?"`,

  crewCard: `"Seems like y'all got a crew as Hodgepodge as me! What kinda stuff binds all y'all together? Somethin' must make such a strange bunch be kindred spirits."`,
}

/** First time through the aftermath — no "been a while" yet. */
export const AFTERMATH_FIRST = [
  `"Back already? Well don't that beat all. Most folk take a spell longer 'fore they come limpin' back to my fire. Sit yerself down and tell me how it went — I been curious since you left."`,

  `"Well howdy, friend. Weren't expectin' you so soon, but I ain't complainin'. First one's always the one you remember, win or lose. Go on then. How'd it go?"`,
]

/** The standing rotation. Cycles by week so a given week always reads the same. */
export const AFTERMATH_STANDING = [
  // 01
  `"Well howdy again, friend. Pull up a log, fire's still hot. I been talkin' to Henrietta all week for want of better company, so yer a welcome sight. What happened out there?"`,

  // 02
  `"There y'all are. I was startin' to think the road got ya. Sit, sit. I got coffee, though I'll warn ya I made it Tuesday. Tell me how things went."`,

  // 03
  `"Y'all got that look. I seen that look on plenty a face 'cross this fire. Ain't sayin' it's a bad look, mind. Just a look. Go on, out with it."`,

  // 04
  `"Well now, if it ain't my favorite visitor. Don't tell the others I said that — they get sore about it. Set down and let's hear the tale."`,

  // 05
  `"Evenin', friend. Fire's low but the night's young. I do like this part, y'know. Folks come back with stories they didn't have when they left. What'd you bring me?"`,

  // 06
  `"Y'all smell like gunpowder and bad decisions. That's a compliment where I'm from. Come sit. How'd the whole business shake out?"`,

  // 07
  `"Been a hot minute, ain't it. Time gets strange out here — could be a week, could be a season. But you look about a week's worth of wore out. Tell me about it."`,

  // 08
  `"Well I'll be. Y'all keep comin' back and I keep bein' glad about it. Ain't many can say that twice. Now then. How'd things go?"`,

  // 09
  `"Set down 'fore you fall down, young'un. Whatever y'all been up to, it's writ all over ya. I'm listenin'."`,

  // 10
  `"Howdy. Fire's got a good bed of coals goin', so we got time. I ain't in no hurry and the road'll still be there come mornin'. Take it from the top — how'd it play out?"`,

  // 11
  `"There's a thing about comin' back that most folk don't reckon on. Ain't the same person walks back to the fire as walked away from it. Anyhow. Enough of that. What happened?"`,

  // 12
  `"Y'all again! Startin' to think you like my company more'n whatever's out there. Can't say I blame ya. Sit. Talk. How'd it turn out?"`,
]

/**
 * Fires after the result is recorded, not on arrival — so these are Hank
 * responding to being told, not guessing from a face.
 * Twelve of them, so a twelve-week campaign never repeats one.
 */
export const AFTERMATH_WON = [
  // W-01
  `"Well don't you look pleased with yerself. Go on then, I can tell y'all been waitin' to tell it. Don't spare no detail neither."`,

  // W-02
  `"I can read a win off a face from a good ways out, friend, and yours was broadcastin' 'fore you said a word. Set down and gloat a spell. You earned it."`,

  // W-03
  `"Hoo! That's a walk with some swagger in it. Whatever y'all did out there, I want the whole of it. Start at the good part."`,

  // W-04
  `"Well hot dang. That there's a fine piece of work, friend. I'd have paid good coin to watch it happen."`,

  // W-05
  `"Now that's the kinda news makes a fire burn brighter. Don't reckon I need to ask if yer pleased about it."`,

  // W-06
  `"Y'all done it. I ain't surprised, mind — had a feelin' when you left. But I am pleased. There's a difference."`,

  // W-07
  `"Winnin's a funny thing. Soon as it's done it feels like it was always gonna happen. Weren't though. Y'all earned that one."`,

  // W-08
  `"Ha! Good. Real good. The road don't hand out many of them, so take it and hold onto it a while."`,

  // W-09
  `"See now, that's why I keep this fire lit. Folks come back with news like that and it's worth all the smoke in my eyes."`,

  // W-10
  `"Well ain't that somethin'. Y'all keep this up and I'll have to start chargin' for the log yer sittin' on."`,

  // W-11
  `"That'll do, friend. That'll do just fine. What'd it cost ya, though? Always costs somethin'."`,

  // W-12
  `"I knew it. Didn't say nothin' 'fore you left on account of jinxin' it, but I knew it."`,
]

/**
 * Fires after the result is recorded. Sympathetic, never pitying — the friend
 * who has been beaten plenty himself, not the friend who feels sorry for you.
 */
export const AFTERMATH_LOST = [
  // L-01
  `"Well ain't that a mule kick to the teeth. Y'all took a knock. I can hear it. Set down, don't say nothin' for a minute if you'd rather. Fire don't mind the quiet."`,

  // L-02
  `"Rough one, huh. Well. I been beat worse by smaller things than whatever got you. Losin' teaches quicker'n winnin', that's the mean trick of it."`,

  // L-03
  `"Why, them low-down, no-account— ooh. Ain't no shame in it, friend. Ain't a soul come to this fire who ain't come back sore at least once. Tell me where it went sideways."`,

  // L-04
  `"That's a nasty shiner ya got there. Looks like they got the best of ya this time. I got some nice warm stew on the fire though. Set a while. No hurry on my account."`,

  // L-05
  `"That's how it goes some weeks. The road gives, mostly takes. At least yer alive and here to share your tale with me."`,

  // L-06
  `"How dare they beat up my good friend like that? Sorry pal. Y'all are still here tellin' me about it, which is more'n some manage. I'd call that somethin' worth countin'. An' I'm grateful to still have yer company."`,

  // L-07
  `"I lost a sight more'n I won 'fore I got any good, friend. Ain't a comfort now, I know. Will be later."`,

  // L-08
  `"Don't chew on it too long. Chewin' on a loss don't make it any smaller, just makes yer jaw sore."`,

  // L-09
  `"Aw Sam Hill. Sorry to hear it. Set down and let's figure out what's fixable and what ain't."`,

  // L-10
  `"Some fights ya lose fair, some fights ya make mistakes. Ain't nothin' fer it but to learn in either case. What did ya learn this time?"`,

  // L-11
  `"Well that's a shame. Not a disaster, mind. A shame. There's a difference and it matters more'n folk reckon."`,

  // L-12
  `"Y'all come back sore, that's fine. Y'all come back, that's the part I care about. Next one's next week."`,
]

/** Fires at the injury flip itself, not on arrival — the doc keeps his joke by being rare. */
export const AFTERMATH_INJURED = [
  `"Well howdy again friend, it's been a hot minute. Let's catch up. Looks like y'all have gotten into a tussle or two. I do love me a good battle story and comparin' scars. If y'all need I also have a doc friend who'll fix ya up. He ain't got a doctor's license, strictly speakin' but that's just cuz the board thought his methods were "questionable." Anyway, how'd things go?"`,

  `"Ooh. That's gonna leave a mark, and I mean that in the admirin' way. Dr. Mo's still around if y'all want patchin' — he works cheap on account of nobody else'll have him. How'd this happen?"`,
]

/** Final stretch of the campaign. */
export const AFTERMATH_LATE = [
  `"Comin' up on the end of the road now, ain't we. Feels different this deep in. Y'all ain't the same crew that first sat at this fire, and I mean that kindly. Tell me how it went."`,

  `"Not many weeks left in this thing. I always get a mite sentimental 'round the tail end. Don't tell nobody. Now then — what happened out there?"`,
]

/**
 * Three separate moments, because the app learns things in an order.
 *
 * On arrival it knows only the week number — not the result, and certainly not
 * whether anyone got hurt, since injuries are produced by flips partway
 * through. So the greeting cannot react to a game it has not been told about
 * yet. Win and loss lines belong after the result is entered, and the injury
 * line belongs at the flip that causes it.
 *
 * Each picker indexes by week rather than choosing randomly, so a given week
 * always reads the same — two players comparing screens should not see
 * different text for the same week.
 */

const pick = (list, week) => list[(week - 1) % list.length]

/** Fires on arrival. Knows the week and nothing else. */
export function aftermathGreeting({ week = 1, isFirst = false, weeksRemaining = 99 }) {
  if (isFirst) return pick(AFTERMATH_FIRST, week)
  if (weeksRemaining <= 2) return pick(AFTERMATH_LATE, week)
  return pick(AFTERMATH_STANDING, week)
}

/** Fires after the player records the result. Returns null for a draw. */
export function aftermathReaction({ result, week = 1 }) {
  if (result === 'win') return pick(AFTERMATH_WON, week)
  if (result === 'loss') return pick(AFTERMATH_LOST, week)
  return null
}

/** Fires when an injury flip actually lands one. */
export function injuryLine({ week = 1 }) {
  return pick(AFTERMATH_INJURED, week)
}

/* ────────────────────────────────────────────────────────────────
   ARCHETYPE
   Step two. Hank deliberately does NOT react to the archetype itself
   here — the selections step already greets by archetype, and having him
   remark on it twice in a row makes him sound like he forgot. So this
   step reacts to the advancement path instead, which is a different
   question: not what you can do, but how you grow.
   ──────────────────────────────────────────────────────────────── */

export const ARCH_OPEN = [
  `"Now then. Knowin' who ya are is one thing. Knowin' what kinda trouble ya are is another. What sorta leader do ya reckon yer shapin' up to be?"`,
  `"Alright. Let's figure out what shape ya take. Everyone's got a way about 'em, and it's better to know it than not."`,
  `"So. There's a few kinds of folk what end up leadin' others. Ain't none of 'em better'n the rest, whatever anybody tells ya. Which one's you?"`,
  `"Time to pin ya down a bit. What kinda leader are we talkin' about here?"`,
]

export const ARCH_PATH = {
  bruiser: [
    `"A brawler, then. Y'all learn by doin', and doin' means hittin'. Fair enough — it's honest work, if bloody."`,
    `"So ya grow by puttin' folk down. Can't say I'd choose it, but then I ain't built for it and you plainly are."`,
    `"Ah, one of them. Every scrap teaches ya somethin', long as yer the one still standin' after. Mind that last part."`,
  ],
  strategist: [
    `"A thinker. Good. Most fights is won 'fore anybody swings, though nobody writes songs about that part."`,
    `"So ya learn by bein' where ya oughta be, 'stead of bein' loudest. That's a rarer gift than folk credit."`,
    `"Sneakin' about with a purpose, eh. I like that in a person. Ain't glamorous but it keeps ya breathin'."`,
  ],
}

/* ────────────────────────────────────────────────────────────────
   SENDING THEM OFF
   End of creation. They walk away from the fire toward the first game.
   ──────────────────────────────────────────────────────────────── */

export const SEND_OFF = [
  `"Well. Reckon that's ya done. Go on then — road's waitin' and it ain't patient. I'll keep the fire lit."`,
  `"That'll do. Go find out what yer made of. I'll be here when ya get back, same as always."`,
  `"Off ya go. Henrietta'd wish ya luck but she's asleep standin' up again. I'll wish it for the both of us."`,
  `"Alright, yer as ready as yer gonna get, which ain't the same as ready. Nobody ever is. Go on."`,
  `"Take care out there. And come back — I mean that. It's a long road and I don't get many what come back."`,
  `"Go on then. Don't do nothin' I'd do."`,
]

/* ────────────────────────────────────────────────────────────────
   WEEKLY HIRE
   Fires eleven times over a twelve-week campaign — second only to the
   aftermath in frequency, so it needs the deepest rotation.

   What the app knows: scrip on hand, week number, whether this is the
   first hire of the week, whether the model is out of keyword, and what
   it costs.

   Same boundary as barter — Hank describes the discount as how the road
   works. He never claims to have granted it, and no line may suggest a
   price moved on his say-so.
   ──────────────────────────────────────────────────────────────── */

export const HIRE_OPEN = [
  `"Now then. Week's turned and that means fresh faces. Who's joinin' ya?"`,
  `"Time to take somebody on. Ain't optional, mind — a crew what don't grow starts shrinkin' instead."`,
  `"Right. Let's find ya somebody. I know most everyone on this road and about half of 'em owe me."`,
  `"New week, new blood. Who're we lookin' at?"`,
  `"Somebody out there's lookin' for work and y'all are lookin' for hands. Let's sort it."`,
  `"Let's talk help. Y'all can't do the whole of it yerself, whatever ya reckon."`,
]

/** Plenty of scrip on hand. */
export const HIRE_OPEN_FLUSH = [
  `"Well ain't you flush. Y'all can afford to be choosy this week — enjoy that, it don't last."`,
  `"Scrip in yer pocket and options in front of ya. That's about as good as a week gets."`,
  `"Ooh, y'all been savin'. Good on ya. Now spend it 'fore somethin' happens to it."`,
  `"Y'all could hire near anybody with that. Don't let it burn a hole."`,
]

/** Little or no scrip. */
export const HIRE_OPEN_BROKE = [
  `"Pockets is light, ain't they. Well, cheap folk gotta eat too. Let's see who'll come along for near nothin'."`,
  `"Not much scrip to hand. Happens to the best of us — happened to me last Thursday. Let's find somebody affordable."`,
  `"Y'all are runnin' thin. Take somebody on regardless, that's how it works. Cheap don't mean useless."`,
  `"Slim purse this week. Fine. Some of the best folk I ever knew came cheap and stayed loyal."`,
]

/** The discounted first hire of the week. */
export const HIRE_FIRST = [
  `"First one of the week always comes cheaper. That's just how the road works — don't ask me who decided it."`,
  `"There's the week's first, and the week's first always goes easy on the purse. Take advantage."`,
  `"Cheap start to the week. Always is. I stopped questionin' it a long time back."`,
  `"Good. First hire of a week don't cost what it oughta. One of the few kindnesses out here."`,
  `"That's the discount one. Y'all get exactly one of them a week, so I hope ya picked well."`,
  `"Week's first. Comes at a bargain, same as always. Everythin' after this'll cost ya proper."`,
]

/** Every hire after the first, at full price. */
export const HIRE_MORE = [
  `"Second helpin', eh. That'll be full freight, mind. The road only bends the once a week."`,
  `"Another one. Costs what it costs now — no more favors 'til next week."`,
  `"Y'all buildin' an army or a crew? Either way, that one's full price."`,
  `"Takin' on more. Alright then. Ain't cheap, but a crew's only as big as ya pay for."`,
  `"Full rate on this one. Y'all knew that goin' in."`,
  `"More hands. Good, long as ya can feed 'em."`,
]

/** Non-versatile model from outside the leader's keywords. */
export const HIRE_OUT_OF_KEYWORD = [
  `"Now that one ain't from around yer usual company. Costs a touch more to bring somebody in from outside — always does."`,
  `"Bit of an outsider, that one. Y'all pay a little extra for the trouble of it. Worth it sometimes."`,
  `"Ooh, reachin' outside yer circle. That's an extra coin, friend. Odd goods fetch odd prices."`,
  `"Ain't one of yers by rights. Costs more to talk 'em into it. That's just the arithmetic of strangers."`,
]

/** A big-ticket hire. */
export const HIRE_EXPENSIVE = [
  `"That's a serious piece of hirin' right there. Hope ya know what yer doin' — I mean that kindly."`,
  `"Big fish. Y'all just spent near everythin' on one pair of hands. Bold."`,
  `"Ooh, expensive. Well, ya get what ya pay for. Mostly."`,
  `"That'll dent the purse considerable. Better be worth it."`,
]

/** Wanted something out of reach. */
export const HIRE_CANT_AFFORD = [
  `"Can't stretch to that one, friend. Wantin' ain't the same as havin', more's the pity."`,
  `"Out of reach this week. Put a pin in it — they'll likely still be about."`,
  `"Y'all ain't got the scrip for that. Ain't a judgment, just arithmetic."`,
  `"Nope. Not this week. Come back when yer pockets is deeper."`,
]

export const HIRE_DONE = [
  `"That's yer week's hirin' done. Crew's a bit bigger and a bit stranger. Just how I like it."`,
  `"Right, that's settled. Y'all keep collectin' folk the way I collect pots."`,
  `"Done and dusted. Feed 'em, don't lose 'em, and try to bring 'em all back."`,
  `"Good hirin'. Go on and get 'em sorted 'fore the week runs off without ya."`,
]

/** Arrival at the hire step. Scrip is known; who they'll take is not. */
export function hireGreeting({ week = 1, scrip = 0 }) {
  if (scrip >= 8) return pick(HIRE_OPEN_FLUSH, week)
  if (scrip <= 2) return pick(HIRE_OPEN_BROKE, week)
  return pick(HIRE_OPEN, week)
}

/**
 * Reaction to a hire. Out-of-keyword and expensive both beat the ordinary
 * first/subsequent split, since they're the more interesting fact.
 */
export function hireReaction({ week = 1, isFirstOfWeek = false, outOfKeyword = false, cost = 0, expensiveAt = 9 }) {
  if (outOfKeyword) return pick(HIRE_OUT_OF_KEYWORD, week)
  if (cost >= expensiveAt) return pick(HIRE_EXPENSIVE, week)
  return isFirstOfWeek ? pick(HIRE_FIRST, week) : pick(HIRE_MORE, week)
}

export function hireCantAfford({ week = 1 }) {
  return pick(HIRE_CANT_AFFORD, week)
}

export function hireDone({ week = 1 }) {
  return pick(HIRE_DONE, week)
}

/* ────────────────────────────────────────────────────────────────
   ADVANCEMENT
   The reward beat. Fires when the leader spends experience.
   ──────────────────────────────────────────────────────────────── */

export const ADVANCE_FIRST = [
  `"Well look at that. Y'all learned somethin' out there and it stuck. First one's the sweetest, in my experience."`,
  `"There it is. First bit of growin' ya done since ya sat at my fire. Ain't the last neither, if ya keep at it."`,
  `"Hah! Somethin' took root. Y'all ain't the same as ya was two weeks back, and that's the whole point of the exercise."`,
]

export const ADVANCE = [
  `"Y'all keep gettin' better. It's a nice thing to watch from a fixed position like mine."`,
  `"Another one. Yer turnin' into somethin' proper. I'll be sure to say I knew ya when."`,
  `"Growin' again. Careful now — folk who get good start gettin' noticed, and gettin' noticed ain't always the gift it sounds like."`,
  `"There ya go. Every scar's a lesson if ya bother readin' it, and y'all been readin'."`,
  `"Mm. That's real progress, that is. Y'all earned it the hard way, which is the only way it sticks."`,
  `"Well ain't ya somethin' now. Hard to square with the greenhorn what first sat down across this fire."`,
]

/* ────────────────────────────────────────────────────────────────
   HEALING INJURIES
   Paying scrip to remove an injury. The doc has been referenced since
   the first aftermath line without ever appearing — this is his scene.

   What the app knows: scrip on hand, how many injuries are outstanding,
   and whether removing this one leaves a model clean.
   ──────────────────────────────────────────────────────────────── */

export const HEAL_OPEN = [
  `"Now, 'fore ya go — I got that doc friend campin' just over the rise. Dr. Morbidius Spiritstitch, if yer feelin' formal, which he ain't. Calls himself Dr. Mo and so should you."`,
  `"Y'all lookin' a mite chewed up. Dr. Mo's about, if ya got scrip and the stomach for his methods."`,
  `"Anybody need mendin'? I can send word to Dr. Mo. He ain't cheap and he ain't gentle, but he is quick."`,
  `"Time to see about them hurts. Doc's got his kit out and he's in a fair mood, which is rare."`,
  `"Let's talk about who's still limpin'. Scrip'll fix most of it. Not all, mind, but most."`,
  `"Mo's over yonder sharpenin' somethin'. Best not ask what. Who needs seein' to?"`,
]

/** Nobody is hurt. */
export const HEAL_NONE = [
  `"Well now, everybody's whole. Don't that make a nice change. Dr. Mo'll be disappointed."`,
  `"Nobody hurt. Y'all had a clean week, and them's rarer'n a fair price. Enjoy it."`,
  `"Ain't a scratch on the lot of ya. Good. Keep it that way, though ya won't."`,
  `"Nothin' for the doc this time. He'll live. He always does, somehow."`,
]

/** A lot of outstanding injuries. */
export const HEAL_MANY = [
  `"Sam Hill, look at the state of y'all. Doc's gonna be busy and yer purse ain't gonna like it."`,
  `"That's a lot of hurt for one crew. Let's see what we can afford to fix and what's gotta wait."`,
  `"Rough stretch, ain't it. Doc'll take 'em one at a time. Prioritize, friend."`,
  `"Y'all brought Dr. Mo a whole infirmary. Alright. Who's worst off?"`,
]

/** One injury removed. */
export const HEAL_DONE = [
  `"There. Patched. Don't ask what he used and he won't ask what happened."`,
  `"Good as new, near enough. 'Near enough' bein' the operative words with that man."`,
  `"That's one mended. Money well spent, I'd say, though it ain't my money."`,
  `"Doc's done. They'll be sore a few days and fine after. Probably."`,
  `"Fixed up. He does good work when he's sober and passable when he ain't."`,
  `"One less limp in the crew. Worth every coin."`,
]

/** That was the model's last injury. */
export const HEAL_ALL_CLEAR = [
  `"That's the last of it off 'em. Walkin' clean again. Good feelin', that."`,
  `"All patched, top to bottom. They look near new. Don't get used to it."`,
  `"Every hurt off that one. Mo earned his coin today."`,
  `"Clean bill. Well — clean as the doc's ever given anybody."`,
]

export const HEAL_CANT_AFFORD = [
  `"Ain't got the scrip for that mendin', friend. Dr. Mo don't do credit. Learned that the hard way."`,
  `"Can't pay for it this week. They'll have to walk it off, and I do mean walk."`,
  `"Not enough in the purse. Sorry. Doc's got principles about coin, which is his only kind."`,
  `"That's beyond ya just now. Come back with more scrip and he'll still be here, unfortunately."`,
]

/** Chose not to heal. */
export const HEAL_SKIPPED = [
  `"Leavin' 'em as they are, then. Fair enough. Scars tell folk somethin' about ya."`,
  `"Alright, no doc this week. Save yer scrip. Hurts heal slow but they do heal."`,
  `"Y'all are tougher'n ya look. Or cheaper. Either way, understood."`,
  `"Suit yerself. Dr. Mo'll be here next week, same rise, same questionable knives."`,
]

/* ────────────────────────────────────────────────────────────────
   CAMPAIGN END
   The last thing anyone reads. Hank is a traveller — he packs up and
   the road goes on, which is the right note to end on.

   `outcome` is the caller's judgment. Leader survived plus few losses
   reads as 'triumph'; leader lost or heavy annihilation reads as 'hard'.
   Pass nothing for the neutral farewell.
   ──────────────────────────────────────────────────────────────── */

export const CAMPAIGN_END = [
  `"Well. That's the whole of it, ain't it. Y'all walked in here a stranger and yer leavin' as somethin' else entire."`,
  `"So it's done. Last night at this fire. I'd say somethin' wise but I used up all my wise about week four."`,
  `"That's the campaign, friend. Feels short from here. They always do, lookin' back down the road."`,
  `"End of the line. I'll pack up in the mornin' and Henrietta'll complain about it, same as always."`,
  `"Well, that's that. Been a pleasure havin' somebody to talk to what talks back."`,
  `"Reckon this is where we part. Ain't sad about it exactly. Just a bit quiet."`,
]

export const CAMPAIGN_END_TRIUMPH = [
  `"And y'all come out the other side standin'. Not everybody does. Go on and be proud of it — ya earned that much."`,
  `"Look what ya built. Started with nothin' but a name, and now there's a whole crew behind ya. That's somethin' real."`,
  `"Y'all done good. I don't say that to many and I ain't sayin' it to be kind."`,
]

export const CAMPAIGN_END_HARD = [
  `"Cost ya plenty, this one. I know. Ya kept walkin' though, and that counts more'n folk say."`,
  `"Weren't the campaign ya wanted, I reckon. Weren't the one anybody wanted. But y'all finished it, and finishin's the hard part."`,
  `"Y'all lost more'n ya found. Happens. Sit a minute 'fore ya go — the road can wait that long."`,
]

export function healGreeting({ week = 1, injuryCount = 0 }) {
  if (injuryCount === 0) return pick(HEAL_NONE, week)
  if (injuryCount >= 4) return pick(HEAL_MANY, week)
  return pick(HEAL_OPEN, week)
}

export function healed({ week = 1, cleared = false }) {
  return cleared ? pick(HEAL_ALL_CLEAR, week) : pick(HEAL_DONE, week)
}

export function healCantAfford({ week = 1 }) {
  return pick(HEAL_CANT_AFFORD, week)
}

export function healSkipped({ week = 1 }) {
  return pick(HEAL_SKIPPED, week)
}

export function campaignEnd({ week = 12, outcome = null }) {
  if (outcome === 'triumph') return pick(CAMPAIGN_END_TRIUMPH, week)
  if (outcome === 'hard') return pick(CAMPAIGN_END_HARD, week)
  return pick(CAMPAIGN_END, week)
}

/* ────────────────────────────────────────────────────────────────
   ANNIHILATION
   Three injuries and a model is gone permanently. No jokes here — a
   player may have had that model since week one. Hank has buried people.
   ──────────────────────────────────────────────────────────────── */

export const ANNIHILATED_MODEL = [
  `"Ah, Sam Hill. I'm sorry, friend. That one ain't comin' back."`,
  `"Dad-gummit. I remember ya hirin' them. Ain't much I can say that'd help, but I'm sorry all the same."`,
  `"That's a hard loss. Take a minute. The road'll still be there."`,
  `"Gone for good, then. Y'all don't have to say nothin'. I'll just sit here a spell with ya."`,
  `"I've buried a few myself. It don't get easier, and anybody says otherwise is sellin' somethin'."`,
]

/** The leader goes down — before it's known whether they get back up. */
export const ANNIHILATED_LEADER = [
  `"No. No no no. Hold on now, friend, don't ya go on me."`,
  `"Aw Sam Hill, no, not my friend. That ain't— hold on. Hold on. Let me think."`,
  `"Dad-gummit, not another companion face down in the dust. Do ya still have some life'n ya there pal?"`,
]

/** The one free escape, spent. */
export const MIRACULOUS_RECOVERY = [
  `"Would ya look at that. Y'all got up. I ain't never gonna know how and I ain't gonna ask. Once, though. Only ever once."`,
  `"Breathin'. Y'all are breathin'. I'd call it a miracle but I seen enough of them to know they don't come twice."`,
  `"Get up slow. There ya go. Whatever bought ya that, it's spent now — don't go lookin' for it again."`,
]

/** No recovery left. The campaign leader is gone. */
export const LEADER_LOST = [
  `"Then that's the end of it. I'm sorry. Y'all made somethin' worth makin' and the road took it anyhow, which is what it does."`,
  `"So it goes. I'll keep the fire lit a while longer, out of respect. Then I'll pack up and move on, same as always."`,
  `"Sit with me 'fore ya go. Ain't nothin' to fix here. Just — sit a while. Then we'll talk about what comes next."`,
]

export function archetypeGreeting({ week = 1 }) {
  return pick(ARCH_OPEN, week)
}

export function archetypePathReaction({ path, index = 0 }) {
  const list = ARCH_PATH[path]
  return list ? list[index % list.length] : null
}

export function sendOff({ index = 0 }) {
  return SEND_OFF[index % SEND_OFF.length]
}

export function advancementLine({ isFirst = false, week = 1 }) {
  return isFirst ? pick(ADVANCE_FIRST, week) : pick(ADVANCE, week)
}

export function annihilationLine({ isLeader = false, week = 1 }) {
  return isLeader ? pick(ANNIHILATED_LEADER, week) : pick(ANNIHILATED_MODEL, week)
}

export function miraculousRecovery({ week = 1 }) {
  return pick(MIRACULOUS_RECOVERY, week)
}

export function leaderLost({ week = 1 }) {
  return pick(LEADER_LOST, week)
}

/* ────────────────────────────────────────────────────────────────
   SELECTIONS
   The step the app is named for. A leader is assembled out of actions
   and abilities borrowed off allies — a hodgepodge, same as the man
   narrating it and same as everything strapped to Henrietta.

   What the app knows here: the archetype (chosen last step), which slot
   is open, the source model's cost against that slot's ceiling, and
   whether the register loaded. It does not know what any action does,
   so nothing here may comment on an effect.
   ──────────────────────────────────────────────────────────────── */

/** Opening line, keyed to archetype — chosen once, so no rotation needed. */
export const SELECT_OPEN_BY_ARCHETYPE = {
  lucky_upstart: `"Now a fella like you, ya come by it honest — which is to say ya come by it lucky. Ain't no shame in luck. I made a livin' off it. Let's see what ya picked up along the way."`,

  generalist: `"Y'all strike me as the sort what can turn a hand to most anythin'. Handy way to be. Bit of this, bit of that — that's how I built everythin' I got. So what'd ya learn?"`,

  heavy_hitter: `"Y'all got the look of someone who settles things direct. Fair enough. Ain't every problem needs finesse. Let's see what yer swingin'."`,

  schemer: `"Ooh, yer a sly one. I can spot it — takes one to know one, and I been tradin' long enough to know one. What tricks ya got squirreled away?"`,

  talented_individual: `"Some folk just got somethin' in 'em from the start. Reckon yer one of 'em. Ain't fair, but it ain't wrong neither. So what is it y'all can do?"`,
}

/** Fallback if the archetype is somehow unset. */
export const SELECT_OPEN = [
  `"Right then. Everybody picks up somethin' off the company they keep. What rubbed off on you?"`,
  `"Now here's the interestin' part. Nobody's born knowin' nothin' — y'all learned it off somebody. Who, and what?"`,
  `"Let's talk about what y'all can actually do. And more to the point, where ya got it."`,
]

/** Prompt for each open slot. */
export const SELECT_PROMPT = {
  attack: [
    `"When it comes to a scrap, what's yer opener? And don't tell me ya ain't never been in one, I won't believe ya."`,
    `"Everybody's got one thing they reach for when it goes bad. What's yers, and who'd ya learn it off?"`,
    `"How's it go when the talkin' stops? Show me what ya swing, shoot, or throw."`,
    `"Now the unpleasant part. What d'ya do to folk who need doin' to?"`,
  ],
  tactical: [
    `"Scrappin' ain't the whole of it. What else ya got — somethin' clever, somethin' useful?"`,
    `"What's yer trick? Everyone's got one. Mine's lookin' harmless and chargin' double."`,
    `"Fightin's easy. It's all the rest that wins the day. What'd ya pick up that ain't violent?"`,
    `"Now then. What can ya do that ain't hittin' somethin'?"`,
  ],
  ability: [
    `"And what's just true about ya? Not somethin' ya do — somethin' ya are."`,
    `"Some things ain't learned so much as caught, like a cough. What's stuck to ya?"`,
    `"Last bit. What's the thing about ya that don't switch off?"`,
    `"Now the part that ain't a choice. What's in yer bones?"`,
  ],
}

/** Source model well under the slot ceiling. */
export const SELECT_PICKED_CHEAP = [
  `"Off them? Ha! Good. Best things I ever learned came off folk nobody looked at twice."`,
  `"Now that's thrifty. Ain't the flashiest pick but it'll do the job, and it don't cost much to keep."`,
  `"Cheap and cheerful. I respect that. Half my stock's the same."`,
  `"Ya learned that off a nobody. Don't take it as an insult — I been a nobody most my life and I'm still walkin'."`,
]

/** Source model at or near the ceiling. */
export const SELECT_PICKED_TOP = [
  `"Aimin' high, ain't ya. Well, if yer gonna borrow, borrow off someone worth borrowin' from."`,
  `"Ooh, that's a rich pick. Y'all been keepin' impressive company."`,
  `"That's about as far as yer reach goes. Good — no sense leavin' anythin' on the table."`,
  `"Now that's an expensive habit ya picked up. Suits ya, though."`,
]

/** Heavy Hitter only — they kept a trigger off the attack action. */
export const SELECT_TRIGGER = [
  `"And ya kept the little twist that comes with it. Smart. Them extras is where the real value hides."`,
  `"Hah — ya took the trimmings too. That's a trader's instinct right there."`,
  `"Most folk take the tool and leave the trick. Y'all took both. I approve."`,
]

/** Register unreachable, so they're typing it in by hand. */
export const SELECT_OFFLINE = [
  `"Can't rightly show ya my whole stock right now — packs is a mess and the light's poor. Tell me what ya want and I'll take yer word for it."`,
  `"Y'all'll have to describe it to me. Can't lay hands on the goods this evenin'. Keep it honest and we'll get along fine."`,
  `"Ain't got the inventory in front of me. Tell me what ya learned and off who, and I'll write it down same as always."`,
]

/** Every slot filled. */
export const SELECT_DONE = [
  `"There now. Look at that — bits and pieces off half a dozen folk and somehow it hangs together. That's the whole trick of it."`,
  `"Well, would ya look at that. Ain't a one of them things started out yers, and now the lot of it is. That's how it works, friend."`,
  `"Hodgepodge. Same as me, same as everythin' strapped to Henrietta. Ain't nothin' wrong with bein' made of spare parts."`,
  `"That's a person right there. Cobbled together outta whatever was lyin' around, which is how most of us got made."`,
]

/** Opening the selections step. Archetype is known; nothing else yet. */
export function selectGreeting({ archetype, week = 1 }) {
  return SELECT_OPEN_BY_ARCHETYPE[archetype] || pick(SELECT_OPEN, week)
}

/** Prompt for whichever slot is currently open. */
export function selectPrompt({ slot, index = 0 }) {
  const list = SELECT_PROMPT[slot] || []
  return list[index % list.length] || null
}

/**
 * Reaction to a pick. Cost against the slot ceiling is the only thing the
 * app can judge — it has no idea what the action does.
 */
export function selectReaction({ cost, cap, index = 0 }) {
  const list = cost >= cap - 1 ? SELECT_PICKED_TOP : SELECT_PICKED_CHEAP
  return list[index % list.length]
}

export function selectTrigger({ index = 0 }) {
  return SELECT_TRIGGER[index % SELECT_TRIGGER.length]
}

export function selectOffline({ index = 0 }) {
  return SELECT_OFFLINE[index % SELECT_OFFLINE.length]
}

export function selectDone({ index = 0 }) {
  return SELECT_DONE[index % SELECT_DONE.length]
}

/* ────────────────────────────────────────────────────────────────
   BARTER
   The one step Hank owns rather than narrates. He is a peddler with a
   loaded donkey, and equipment acquisition is a trade — so this is the
   place the narrator and the mechanic are the same thing.

   He comments. He does not adjudicate. Nothing here may imply a rating
   changed, a flip was nudged, or an item was handed over outside the
   rules. The flip is the flip.
   ──────────────────────────────────────────────────────────────── */

/** Arrival with a good aftermath hand (3-4 cards). */
export const BARTER_OPEN_RICH = [
  `"Now that's a proper handful ya come back with. Let's see what we can do about it. Everythin's for trade, near enough."`,
  `"Well look at you, flush as a Sunday. Come on and have a rummage. Henrietta won't mind — she's been complainin' about the weight anyhow."`,
  `"Ooh, y'all come back with somethin' to work with. I do love a customer with options. Let's see what catches yer eye."`,
  `"That's a good showin'. Right then — pots, powder, rope, and somethin' I ain't rightly identified yet. Take a look."`,
]

/** Arrival with little or nothing to trade on (0-1 cards). */
export const BARTER_OPEN_LEAN = [
  `"Slim pickins on yer end this time, but come have a look anyhow. Ain't costin' ya nothin' to want things."`,
  `"Not much to trade with, huh. Well, browse a while. Wantin' somethin' is half of gettin' it, my ma used to say. She were wrong, but she said it."`,
  `"Thin week. Happens. Come look over the goods regardless — Henrietta likes bein' admired."`,
  `"Ain't got much to work with, have ya. That's alright. I been broke more weeks than not and I'm still here janglin'."`,
]

/** Arrival, ordinary hand. */
export const BARTER_OPEN = [
  `"Right then. Business. Let's see what I'm haulin' that y'all might want."`,
  `"Come have a rummage. I got most everythin' and about half of it works."`,
  `"Well now, y'all know what I'm about. Everythin' on this donkey's for trade if the price is right, and the price is always strange."`,
  `"Let's talk goods. I been carryin' this lot a long stretch and I'd sooner it went to someone who'll use it."`,
  `"Step up, step up. Ain't a proper camp without a bit of hagglin'."`,
  `"Now for the part I like. Show me what ya got and I'll show ya what I got."`,
]

/** A flip landed an item. */
export const BARTER_ACQUIRED = [
  `"Sold. Or traded, or whatever it is we're callin' this. She's yours — treat her better'n the last owner did."`,
  `"There ya go. Fits ya better'n it fit me, though I been sayin' that about everythin' I own for years."`,
  `"Good pick. That one's been rattlin' round my packs since 'fore I can rightly recall. Glad it's found a purpose."`,
  `"Take it, take it. Henrietta'll thank ya for the lighter load."`,
  `"Ha! Y'all got an eye. That's a good bit of kit and I'm only a little sorry to see it go."`,
  `"Done and done. Don't ask where I got it and I won't ask what y'all do with it."`,
  `"That'll serve ya. Ain't pretty, but pretty don't stop nothin' comin' at ya."`,
  `"Yours now. If it breaks that ain't my doin'. If it works, y'all can tell folks where ya got it."`,
  `"Fine choice. I'd have kept that one if I had any use for it, which I ain't had in years."`,
  `"There. Somethin' good come out of a hard week. That's how it oughta go."`,
]

/** A top-of-the-table find — the rare stuff. */
export const BARTER_RARE = [
  `"Well I'll be. Y'all pulled somethin' special outta the pile. I didn't rightly know I still had that."`,
  `"Now hold on. That's a real find, friend. Don't go losin' it in a ditch somewhere."`,
  `"Hoo! Ain't seen one of them move in a long while. Y'all must be livin' right, or lyin' well."`,
]

/** Flips resolved and nothing was acquired. */
export const BARTER_EMPTY = [
  `"Nothin' caught, huh. Well, the goods'll keep and so will I. Come back next time."`,
  `"Ah well. Can't trade what ya ain't got. No hard feelins on my end — I don't take it personal."`,
  `"Empty handed. Happens more'n folk admit. Henrietta and I'll still be here."`,
  `"No luck this go. Tell ya what, I'll set the good stuff aside and pretend I done it special for ya."`,
  `"That's the trade for ya. Some weeks yer haulin' treasure, some weeks yer haulin' regret. Come back."`,
  `"Nothin' this time. Don't fret it. I been through this camp a hundred times and I'll be through it again."`,
]

/** Arrival at barter. Hand size is known; what they will get is not. */
export function barterGreeting({ week = 1, handSize = 2 }) {
  if (handSize >= 3) return pick(BARTER_OPEN_RICH, week)
  if (handSize <= 1) return pick(BARTER_OPEN_LEAN, week)
  return pick(BARTER_OPEN, week)
}

/** Fires when a flip actually lands an item. */
export function barterAcquired({ week = 1, isRare = false }) {
  return isRare ? pick(BARTER_RARE, week) : pick(BARTER_ACQUIRED, week)
}

/** Fires once the flips resolve with nothing gained. */
export function barterEmpty({ week = 1 }) {
  return pick(BARTER_EMPTY, week)
}

export const HANK_TOGGLE_KEY = 'hank:enabled'
