/**
 * English text of the hand-written data of deadlockData.ts (lanes, hero roles and tips, hand-written builds,
 * matchups), keyed by the same ids. Item and ability names are not repeated here: the English names come from
 * the generated catalogue and from the "Nom FR (English Name)" ability names.
 *
 * src/data/deadlockData.test.ts checks that every hand-written French text has its English version here.
 */
import type { HeroBuildArchetype, LaneColor } from './deadlockData';

type AbilityKey = '1' | '2' | '3' | '4';

export interface TranslatedBuildText {
  name: string;
  subtitle: string;
  playstyle: string;
  abilities: Record<AbilityKey, { description: string; priorityTip: string }>;
  laneTips: HeroBuildArchetype['laneTips'];
}

export interface TranslatedHeroText {
  role: string;
  baseTips: string;
  builds?: Record<string, TranslatedBuildText>;
  matchups?: Record<string, { summary: string; laneRule: string }>;
}

export const EN_LANES: Record<LaneColor, { name: string; description: string; tacticalNote: string }> = {
  yellow: {
    name: 'York Avenue (Yellow)',
    description: 'Outer lane (usually a 1v1 solo lane)',
    tacticalNote:
      'Long sight lines and little cover in the middle. Stamina management and sustain (Restorative Shot / Extra Regen) are decisive, as your jungler is far away.',
  },
  orange: {
    name: 'Orchard Street (Orange)',
    description: 'Inner central lane (usually a 2v2 duo lane)',
    tacticalNote:
      'Heavy crossfire and fast rotations from the Mid-Boss / Urn. Favour a fast push (Monster Rounds) and reactive shields.',
  },
  blue: {
    name: 'Broadway (Blue)',
    description: 'Inner central lane (usually a 2v2 duo lane)',
    tacticalNote:
      "Lots of verticality (rooftops and bridges), ideal for Lash / Pocket ambushes and Vindicta's aerial sniping. Watch the gank timings at 5:00.",
  },
  purple: {
    name: 'Park Avenue (Purple)',
    description: 'Outer lane (usually a 1v1 solo lane)',
    tacticalNote:
      'Isolated, high-intensity duel. An early death immediately costs you the Guardian. Invest in a defensive item at 500/1250 souls as soon as the enemy spikes.',
  },
};

export const EN_HEROES: Record<string, TranslatedHeroText> = {
  vindicta: {
    role: 'Aerial marksman & soul executioner',
    baseTips:
      "Your strength is control of the air (Flight) and the bonus souls earned with Assassinate (T3). Never waste your Flight before you have spotted the CC threats (Knockdown, Bebop's Hook, Lash's dive).",
    builds: {
      vindicta_crow_executor: {
        name: 'Spirit Sniper & Crow Bleed (execution meta)',
        subtitle: '% HP bleed with the Crows + burst of 4 explosive snipes',
        playstyle:
          'Harass from long range with Crow Familiar (it bounces to 3 enemies at max level) to melt their HP below 50%, then chain executions with Assassinate to earn thousands of bonus souls.',
        abilities: {
          '1': {
            description: 'Tethers the enemies in the impact area.',
            priorityTip: 'Keep it to stop an assassin rushing you, or to guarantee your Assassinate shot.',
          },
          '2': {
            description: 'Fly into the air and add spirit damage to every bullet you fire.',
            priorityTip: 'Put 1 point early for the duration, then max it after Crow / Snipe.',
          },
          '3': {
            description: 'Sends a crow that inflicts a bleed based on current HP.',
            priorityTip:
              'MAX 1ST (5 pts): at max level the crow bounces to 2 more targets, applies a % HP bleed and reduces their spirit and bullet resist by 12%!',
          },
          '4': {
            description: 'Long-range sniper shot dealing huge bonus damage to enemies below 50% HP.',
            priorityTip: 'MAX 2ND (5 pts): the last tier (+155 damage & +850 bonus souls per kill) makes you snowball all game.',
          },
        },
        laneTips: {
          solo: 'In a 1v1 solo lane, use High-Velocity Mag to deny the enemy souls. Throw your Crow as soon as your opponent lines up with their healing banner to force them back.',
          duo: "In a 2v2 duo lane, save your Stake (1) to follow up on your ally's crowd control. Once your Crow has 5 points it bounces between both lane enemies on every cast!",
          yellow_purple: 'On the outer lanes (Yellow / Purple), always keep 1 stamina bar or your Flight to survive long ganks.',
          orange_blue: 'On the central lanes (Orange / Blue), use the high rooftops to snipe the next lane as soon as you have your ultimate at 3000 souls.',
        },
      },
      vindicta_ac130_gun: {
        name: 'AC-130 Hybrid Gun & Flight (aerial DPS)',
        subtitle: 'Non-stop aerial strafing in Flight + spirit bullets',
        playstyle:
          'Turns Vindicta into a gunship: while you are in Flight (2), every bullet deals huge weapon damage (Sharpshooter) plus spirit damage on impact.',
        abilities: {
          '1': {
            description: 'Roots targets on the ground so you can strafe them from the air.',
            priorityTip: 'Perfect combo with Alchemical Fire.',
          },
          '2': {
            description: 'Fly into the air and infuse your bullets with spirit damage.',
            priorityTip: 'MAX 1ST: +6 s of flight time and a big spirit damage bonus per bullet.',
          },
          '3': {
            description: 'Reduces enemy resistances to amplify your shots in flight.',
            priorityTip: 'MAX 2ND for the armour shred (-12% bullet & spirit resist).',
          },
          '4': {
            description: 'Finish off targets trying to escape behind a wall.',
            priorityTip: 'Take the T2/T3 upgrade as soon as you start ganking.',
          },
        },
        laneTips: {
          solo: "Punish every last-hit attempt with Headshot Booster. Only use Flight once the enemy has used their dash, to take 60% of their HP in one magazine.",
          duo: 'Combine Stake (1) + Alchemical Fire on both grouped enemies: they melt in under 3 seconds.',
          yellow_purple: 'Get Monster Rounds if your opponent pushes too fast under your Guardian.',
          orange_blue: 'Great build to secure the Mid-Boss and the Urn thanks to its sustained DPS.',
        },
      },
    },
    matchups: {
      bebop: {
        summary: 'His Hook has huge range and easily picks you off while you float slowly in the air.',
        laneRule:
          'Buy Reactive Barrier at 1250 souls (it fully negates his Hook + Bomb combo), then Debuff Remover at 3000 souls to purge his sticky bombs.',
      },
      lash: {
        summary: 'Lash can jump higher than your Flight and slam you to the ground with Ground Strike and his ultimate.',
        laneRule:
          'Never fly in the middle of the lane when he has height under the rooftops. Use Slowing Hex on him before he takes off, or Ethereal Shift when he casts his ultimate.',
      },
      grey_talon: {
        summary: 'A duel of aerial snipers: his Charged Shots hurt a lot if you stay still in flight.',
        laneRule:
          'Get Spirit Shielding to absorb his charged arrows, then Spellbreaker late game, while winning the Assassinate duel.',
      },
      haze: {
        summary: 'She can put you to sleep (Sleep Dagger) from range or sneak behind you invisible.',
        laneRule: 'Keep your Stake (1) to throw at your feet as soon as she leaves invisibility, and pop Metal Skin during her Bullet Dance.',
      },
      abrams: {
        summary: 'A tank with strong regeneration who will try to dive you under your tower.',
        laneRule: 'You beat him from range if you cut his regeneration with Healbane (applied by your Crow) or Toxic Bullets.',
      },
      pocket: {
        summary: 'Very mobile with his cloak and satchel; his Affliction ultimate applies a deadly poison.',
        laneRule: 'Slowing Hex stops him from teleporting to his cloak. Debuff Remover purges his Affliction ultimate instantly!',
      },
    },
  },
  grey_talon: {
    role: 'Spirit archer & aerial artillery',
    baseTips:
      'Your Charged Shots pierce through several targets and have a generous hitbox. Use your Guided Owl to execute across the whole map and gain permanent spirit power.',
    builds: {
      talon_charged_spirit: {
        name: 'Charged Shot spirit artillery',
        subtitle: '4 devastating Charged Shots + a nuclear Owl',
        playstyle: 'Maximises spirit power and charges to deal 600 to 1200 damage per charged arrow from a safe distance.',
        abilities: {
          '1': { description: 'High-power piercing spirit shot.', priorityTip: 'MAX 1ST: the spirit scaling doubles at the last level.' },
          '2': { description: 'Aerial jump and multishot.', priorityTip: 'Use the air dashes to dodge while shooting.' },
          '3': {
            description: 'Ground trap that slows and disarms / silences.',
            priorityTip: 'Place it on stairs or under your feet against assassins.',
          },
          '4': {
            description: 'Guided owl that stuns and executes below 22% HP.',
            priorityTip: 'Every Owl kill gives you +5 permanent spirit power!',
          },
        },
        laneTips: {
          solo: 'Fire your Charged Shots through the creep wave to hit the enemy hero at the same time.',
          duo: 'Place your trap (3) in front of the enemy Guardian to punish any push.',
          yellow_purple: 'Keep Rain of Arrows to escape over the buildings when you get ganked.',
          orange_blue: 'Send your Owl (4) to the next lane without even leaving your tower.',
        },
      },
    },
  },
  haze: {
    role: 'Stealth assassin & Fixation hyper-carry',
    baseTips:
      'Build up Fixation stacks on a single target before using your abilities. Sleep Dagger guarantees you a heavy melee or a free engage.',
    builds: {
      haze_fixation_shredder: {
        name: 'Fixation hyper-carry & Bullet Dance',
        subtitle: 'Extreme fire rate + an unstoppable teamfight ultimate',
        playstyle: 'Fast farming with Smoke Bomb, stealthy ganks with Sleep Dagger, and team wipes with Bullet Dance + Unstoppable.',
        abilities: {
          '1': {
            description: 'A dagger that puts the target to sleep.',
            priorityTip: "The sleep doesn't break right away: land a free heavy melee before shooting!",
          },
          '2': { description: 'Invisibility and sprint speed.', priorityTip: 'Great to cross the map and surprise snipers.' },
          '3': {
            description: 'Passive: every bullet increases your damage on the target.',
            priorityTip: 'MAX 1ST: your fire rate stacks it up instantly.',
          },
          '4': { description: 'A whirlwind of bullets with high evasion.', priorityTip: 'Pop Unstoppable or Silencer right before your ultimate.' },
        },
        laneTips: {
          solo: 'Play safe for the first 4 minutes: Haze is fragile at level 1. Use Sleep Dagger to interrupt enemy abilities.',
          duo: 'Let your partner engage and stack 40+ Fixation stacks on the locked-down target.',
          yellow_purple: 'Get Extra Regen early to withstand the poke in a solo lane.',
          orange_blue: 'Once you have Smoke Bomb level 2, rotate to the next lane after every wave.',
        },
      },
    },
  },
  bebop: {
    role: 'Hook specialist & spirit bombs',
    baseTips:
      'Every Sticky Bomb that hits a hero permanently increases its damage (+1.5% per stack). Uppercut a creep with a bomb stuck on it to send it exploding into the enemy!',
    builds: {
      bebop_double_bomb: {
        name: 'Hook & stacked bombs demolition expert',
        subtitle: 'Deadly Hook control + endless Sticky Bomb scaling',
        playstyle:
          'Catch an isolated target with Hook (3), stick a Sticky Bomb (2) on them, and send them towards your team with Exploding Uppercut (1).',
        abilities: {
          '1': { description: 'Knocks units up and reloads your weapon.', priorityTip: 'Resets the Hook cooldown at max level.' },
          '2': {
            description: 'Gains permanent damage for every hero hit.',
            priorityTip: 'Stick it on creeps and Uppercut them to harass without risk.',
          },
          '3': { description: 'Long-range grappling hook.', priorityTip: 'Level 2 doubles the range (60 m): deadly against snipers.' },
          '4': { description: 'Orbital laser beam that slows heavily.', priorityTip: 'Use it from the air to dominate a teamfight.' },
        },
        laneTips: {
          solo: "Your basic laser is hitscan (instant): you can deny 80% of your opponent's souls without even buying High-Velocity Mag!",
          duo: 'A single level-2 Hook under your Guardian is a guaranteed kill.',
          yellow_purple: 'Stand behind the central pillar to throw surprise Hooks.',
          orange_blue: 'Roam between Orange and Blue with the upgraded Hook range.',
        },
      },
    },
  },
  abrams: {
    role: 'Melee colossus & infernal regeneration',
    baseTips:
      "After a Shoulder Charge into a wall you have a guaranteed heavy melee that the enemy can't parry. Watch out for parry feints at low and high levels!",
    builds: {
      abrams_immortal_brawler: {
        name: 'Siphon & heavy melee juggernaut',
        subtitle: 'A tireless frontliner who crushes the backline',
        playstyle: 'Charge into the thick of the fight with Siphon Life on, pin the main target against a wall and soak up all the damage.',
        abilities: {
          '1': { description: 'Drains the life of nearby enemies.', priorityTip: 'Turn it on before diving into the fight.' },
          '2': {
            description: 'A charge that stuns against a wall.',
            priorityTip: 'Duration Extender guarantees you a charged punch during the stun.',
          },
          '3': { description: 'Regenerates part of all the damage taken.', priorityTip: 'Lets you win every short trade in lane.' },
          '4': { description: 'Leap into the sky and slam an area.', priorityTip: 'Grants CC immunity at max level!' },
        },
        laneTips: {
          solo: 'Against a sniper (Vindicta / Talon), play around the veil and cover, and use your passive to regenerate their poke.',
          duo: 'Punish any enemy step forward with Shoulder Charge into the central bridge.',
          yellow_purple: "Push the wave and steal the enemy's nearby neutral camp.",
          orange_blue: 'Dive the next lane from the rooftops with Seismic Impact.',
        },
      },
    },
  },
  lash: {
    role: 'Aerial assassin & teamfight initiator',
    baseTips:
      "The higher you fall with Ground Strike (1), the bigger the damage. You are the natural nightmare of fragile shooters who don't have Ethereal Shift.",
    builds: {
      lash_sky_slam: {
        name: 'Ground Strike spirit meteor',
        subtitle: 'Instant vertical burst + multi-target Death Slam',
        playstyle: 'Gain height with Grapple (2), dive with Ground Strike (1), drain with Flog (3) and get out before they can answer.',
        abilities: {
          '1': { description: 'A dive whose damage scales with the fall height.', priorityTip: 'MAX 1ST: the damage doubles at the last tier.' },
          '2': { description: 'Aerial propulsion and weapon bonus.', priorityTip: 'Recharges on allied or enemy troopers.' },
          '3': {
            description: 'A whip strike that heals and slows.',
            priorityTip: "Your main tool to hold the lane and reduce the enemy's fire rate.",
          },
          '4': {
            description: 'Grabs several enemies and slams them violently.',
            priorityTip: 'Throw the enemies right under your Walker or into your team.',
          },
        },
        laneTips: {
          solo: 'Use Flog (3) through walls / cover to heal while you harass.',
          duo: 'Jump from the central bridge to slam both enemies at once.',
          yellow_purple: 'Superior Stamina lets you cross the whole lane in 2 seconds.',
          orange_blue: 'Broadway (Blue) and Orchard (Orange) have the best rooftops in the game to maximise Ground Strike fall damage.',
        },
      },
    },
  },
  wraith: {
    role: 'Telekinetic duelist & split-pusher',
    baseTips:
      'Your shots charge your cards (Card Trick). Teleport onto an isolated target and lock them with Telekinesis (4) to take them down in a single magazine.',
    builds: {
      wraith_hybrid_cards: {
        name: 'Full Auto duelist & spirit cards',
        subtitle: 'High fire rate + a burst of cards and a targeted ultimate',
        playstyle:
          'Wins every mid-game 1v1 thanks to Telekinesis and melts objectives (Guardians / Walkers) in a few seconds.',
        abilities: {
          '1': { description: 'Throws an explosive card charged by your bullets.', priorityTip: 'Triggers Quicksilver Reload instantly.' },
          '2': { description: 'Long-range teleport with a shield.', priorityTip: 'To escape, or to jump on a sniper up high.' },
          '3': { description: 'A huge fire-rate boost and spirit bullets.', priorityTip: 'MAX 1ST for the spirit lifesteal and DPS.' },
          '4': { description: 'Lifts and silences an enemy.', priorityTip: 'Guarantees 100% headshots while the target levitates.' },
        },
        laneTips: {
          solo: 'Throw your cards behind the pillars where the enemy hides: the hitbox is very large.',
          duo: 'Full Auto also gives fire rate to your nearby ally!',
          yellow_purple: 'Ideal in a solo lane to take down the Guardian as soon as your opponent goes back to base.',
          orange_blue: 'Teleport over the rooftops to flank the snipers.',
        },
      },
    },
  },
  pocket: {
    role: 'Elusive ambush mage & AoE burst',
    baseTips:
      "Keep your Amplification stacks up with Barrage (1) before diving in with Flying Cloak (2) and Enchanter's Satchel (3). Careful: Pocket has a negative base spirit resist (-15%)!",
    builds: {
      pocket_affliction_burst: {
        name: 'Escape artist & AoE Affliction',
        subtitle: 'Explosive AoE combo + invulnerability in the satchel',
        playstyle:
          'Float above the enemy team with Barrage, teleport into the middle, cast Affliction (4), hide in the Satchel (3), then Ethereal Shift.',
        abilities: {
          '1': { description: 'Projectiles that amplify all your damage by +6% per stack.', priorityTip: 'Stay in the air while firing your 4 projectiles.' },
          '2': { description: 'A thrown cloak you can teleport to.', priorityTip: 'Throw the cloak somewhere safe BEFORE getting into the satchel.' },
          '3': { description: 'Invulnerable inside the satchel, then an explosion.', priorityTip: "Dodges Vindicta's Assassinate or Bebop's bomb." },
          '4': { description: 'A massive % HP poison over the whole area.', priorityTip: 'Applies Healbane and Suppressor to the whole enemy team.' },
        },
        laneTips: {
          solo: "Make sure to buy Hollow Point Ward and Enchanter's Barrier to make up for your natural weakness to spirit damage.",
          duo: 'Barrage from a rooftop gives +24% damage amplification before you even engage.',
          yellow_purple: 'Use Kinetic Dash + Barrage to float across the whole lane.',
          orange_blue: 'Dive from the central rooftops and apply Affliction to both enemy players.',
        },
      },
    },
  },
  lady_geist: {
    role: 'Spirit siege mage & Soul Exchange',
    baseTips:
      'Your abilities cost your own HP but deal huge area damage. If an assassin jumps on you at 10% HP, use Soul Exchange (4) to swap your health bars!',
    builds: {
      geist_essence_artillery: {
        name: 'Essence Bomb & Malice empress',
        subtitle: 'Huge area bombs + spirit lifesteal',
        playstyle: 'Total area control with Essence Bomb (1) and damage amplification with the Malice shards (3).',
        abilities: {
          '1': {
            description: 'A wide-radius bomb that leaves a toxic pool at max level.',
            priorityTip: 'MAX 1ST: clears the waves and the heroes hiding behind a wall.',
          },
          '2': { description: 'A tether that drains life, and silences at max level.', priorityTip: 'You can move and shoot while draining.' },
          '3': { description: 'Blood shards that slow and amplify your damage.', priorityTip: 'Cast Malice before Essence Bomb for +15% to +30% damage.' },
          '4': { description: 'Swaps your % HP with a nearby enemy.', priorityTip: '3 s area silence at max level.' },
        },
        laneTips: {
          solo: "Lady Geist is one of the queens of the 1v1 thanks to Essence Bomb's radius, which hits even behind the Guardian's cover.",
          duo: 'Malice + Essence Bomb severely punishes duos who stand close together.',
          yellow_purple: 'Get Extra Regen at 500 souls to make up for the HP cost of your abilities.',
          orange_blue: 'Watch out for silences (Slowing Hex / Silencer) that stop you from casting Soul Exchange.',
        },
      },
    },
  },
  infernus: {
    role: 'Incendiary skirmisher & DoT lifesteal',
    baseTips:
      'Your shots apply Afterburn (3). Once the enemy is burning, every extra bullet fully refreshes the burn duration and heals you through spirit lifesteal!',
    builds: {
      infernus_afterburn_drainer: {
        name: 'Afterburn & Flame Dash pyromaniac',
        subtitle: 'Endless burn + massive regeneration in fights',
        playstyle: 'Apply Catalyst (1) to increase all your damage by 40%, set the target on fire with your shots, and dash through the fight with Flame Dash (2).',
        abilities: {
          '1': { description: 'A napalm spit that slows and amplifies your damage.', priorityTip: '+20% lifesteal and healing reduction at max level.' },
          '2': { description: 'A fire sprint that leaves a burning trail.', priorityTip: "Reduces the enemy's fire rate at level 2." },
          '3': { description: 'A spirit burn triggered by your shots and headshots.', priorityTip: 'MAX 1ST: also reduces the damage of burning enemies by 30%.' },
          '4': { description: 'An explosion around you that stuns for 1.25 s.', priorityTip: 'Combine with Flame Dash to dive into the middle of the enemy team.' },
        },
        laneTips: {
          solo: 'Aim for the head: headshots fill the Afterburn gauge twice as fast.',
          duo: 'Flame Dash through the creep wave and both enemies gives you all your HP back with Spirit Lifesteal.',
          yellow_purple: 'A great outer-lane duelist thanks to his rotation speed.',
          orange_blue: 'His ultimate instantly turns 2v2 skirmishes around.',
        },
      },
    },
  },
  mo_and_krill: {
    role: 'Burrowing tank & targeted lockdown',
    baseTips: 'Scorn (1) heals you a lot when cast among creeps and heroes. Combo (4) locks down any carry for more than 3 seconds.',
    builds: {
      mo_burrow_lockdown: {
        name: 'Burrow tank & lockdown Combo',
        subtitle: 'Endless lane sustain + suppression of the enemy carry',
        playstyle:
          'Go underground with Burrow (2) to gain speed and resistances, pop up under the enemy carry, disarm them with Sand Blast (3) and lock them with Combo (4).',
        abilities: {
          '1': { description: 'An area strike that heals you (x2 on heroes).', priorityTip: 'Makes you almost impossible to push out of lane.' },
          '2': { description: 'Dive underground with +80% bullet resist.', priorityTip: 'Ideal to roam and engage under the towers.' },
          '3': { description: 'A long-range sand blast that disarms for 3.5 s.', priorityTip: 'Shuts down shooters in one click.' },
          '4': {
            description: 'Holds and suppresses an enemy, gains permanent max HP per kill.',
            priorityTip: 'Duration Extender increases the duration of this deadly lockdown!',
          },
        },
        laneTips: {
          solo: 'Get close to the wave, press Scorn (1) and you get back 250 HP every 10 seconds.',
          duo: 'As soon as you have your ultimate (Combo), your partner (e.g. Vindicta) has a 100% guaranteed Assassinate on the locked target.',
          yellow_purple: 'Sand Blast stops your opponent from last-hitting or shooting at you for 3.5 s.',
          orange_blue: 'Use Burrow to gank from one central lane to the other in a few seconds.',
        },
      },
    },
  },
  seven: {
    role: 'Electric area mage & hyper-farmer',
    baseTips:
      "Power Surge (3) turns your bullets into chain lightning that lowers the enemy's spirit resist. Watch out for Knockdown while you channel Storm Cloud (4)!",
    builds: {
      seven_power_surge: {
        name: 'Power Surge storm & chain lightning',
        subtitle: 'Ultra-fast farming + hybrid electric damage',
        playstyle:
          'Use Static Charge (2) to force your opponent back, clear the whole jungle with Lightning Ball (1) and electrocute the enemy team with Power Surge (3).',
        abilities: {
          '1': { description: 'An electric sphere that goes through and clears waves.', priorityTip: 'Perfect to push the lane and take the neutral camps.' },
          '2': { description: 'Stuns the target and nearby enemies after a delay.', priorityTip: 'Forces your opponent to dash or get stunned.' },
          '3': { description: 'Infuses your bullets with bouncing lightning.', priorityTip: "MAX 1ST: reduces the enemy's spirit resist by 15%." },
          '4': { description: 'A giant electric storm around Seven.', priorityTip: 'Buy Unstoppable if the enemy has Knockdown.' },
        },
        laneTips: {
          solo: "Your head has a big hitbox: don't stand still against Vindicta or Grey Talon.",
          duo: 'Static Charge on an enemy forces them away from their ally, or both get stunned.',
          yellow_purple: 'Push the wave in 2 seconds with Lightning Ball and take every neutral camp.',
          orange_blue: 'Dominates the Urn and Mid-Boss fights thanks to his area damage.',
        },
      },
    },
  },
  shiv: {
    role: 'Bloodthirsty rage duelist & executioner',
    baseTips:
      'Bloodletting (3) defers a large part of the damage you take, and Killing Blow (4) instantly executes any enemy below 28% HP, resetting its own cooldown!',
    builds: {
      shiv_rage_brawler: {
        name: 'Rage & Slice and Dice executioner',
        subtitle: 'Deferred damage + chained execution resets',
        playstyle:
          'Keep your Rage gauge at 100% on the creeps, rush in with Slice and Dice (2), which repeats thanks to the Rage, and finish with Killing Blow (4).',
        abilities: {
          '1': { description: 'Throwing knives that apply a stacking bleed.', priorityTip: 'Keeps your Rage gauge up from range.' },
          '2': { description: 'A slashing dash that strikes a 2nd time with full Rage.', priorityTip: 'MAX 1ST: reduces its cooldown per enemy hit.' },
          '3': { description: 'Defers the damage taken and lets you clear part of it.', priorityTip: 'Stops you from dying to a sudden burst.' },
          '4': { description: 'Instant execution below 28% HP + reset on kill.', priorityTip: 'Passively grants the Rage mechanic.' },
        },
        laneTips: {
          solo: 'Your right click (alternate shotgun fire) propels you backwards into the air: use it to dodge or reposition.',
          duo: 'Wait for a full Rage gauge at 3000 souls to dive in and chain two Killing Blows.',
          yellow_purple: 'Harass with the knives (1) until your opponent is within double-dash range.',
          orange_blue: 'Fearsome in the narrow corridors around the central bridges.',
        },
      },
    },
  },
  yamato: {
    role: 'Spirit samurai & unstoppable duelist',
    baseTips:
      'Power Slash (1) goes through cover and deals huge damage. Shadow Transformation (4) makes you immune to crowd control and death while resetting all your abilities.',
    builds: {
      yamato_power_slash: {
        name: 'Power Slash & Shadow spirit blade',
        subtitle: 'Massive spirit slashes + a double rotation during the ultimate',
        playstyle:
          'Latch onto targets (even mid-air!) with Flying Strike (2), slash with Power Slash (1), heal with Crimson Slash (3), then cast Shadow Transformation (4) to do it all again.',
        abilities: {
          '1': { description: 'A charged strike with very high spirit damage.', priorityTip: 'MAX 1ST: goes through walls and lane pillars.' },
          '2': { description: 'A targeted grapple that takes you straight to an enemy.', priorityTip: 'Lets you follow Vindicta or Grey Talon up into the sky!' },
          '3': { description: "A cone strike that heals you and slows the enemy's fire rate.", priorityTip: 'Gives huge melee sustain.' },
          '4': { description: 'Resets your abilities and prevents death for the duration.', priorityTip: 'Also purges negative effects when cast.' },
        },
        laneTips: {
          solo: "Charge Power Slash behind a wall and step out at the last moment to hit your opponent before they can shoot back.",
          duo: 'Flying Strike lets you instantly punish a sniper who uses their Flight.',
          yellow_purple: 'Dominant in 1v1 from Power Slash level 2.',
          orange_blue: "Can dive under the enemy Guardian with Shadow Transformation without dying.",
        },
      },
    },
  },
  paradox: {
    role: 'Time manipulator & pick-off',
    baseTips:
      "The signature combo: charge Kinetic Carbine (3), shoot to freeze the target in time, put your Time Wall (2) in front of you and cast Paradoxical Swap (4) to pull the enemy through the wall (-10% max HP + silence)!",
    builds: {
      paradox_carbine_swap: {
        name: 'Kinetic Carbine & Swap time sniper',
        subtitle: 'High-velocity freezing shot + a deadly position swap',
        playstyle:
          'Control the tempo of skirmishes with Kinetic Carbine and doom an enemy carry by swapping them into your team through your Time Wall.',
        abilities: {
          '1': { description: 'A pulsing grenade that amplifies your damage with every pulse.', priorityTip: 'Throw it at your feet before swapping an enemy onto your position.' },
          '2': { description: 'Blocks every enemy projectile and takes 10% max HP from those going through.', priorityTip: '3 s silence at max level for any target going through the wall!' },
          '3': { description: 'Charges a powerful shot that freezes the target in time.', priorityTip: 'MAX 1ST: also gives a big movement speed boost.' },
          '4': { description: 'Swaps your position with an enemy hero.', priorityTip: 'Cast your Wall (2) while the Swap projectile is in flight.' },
        },
        laneTips: {
          solo: "Your Time Wall (2) blocks Vindicta's Assassinate, Grey Talon's arrow and Lady Geist's bomb!",
          duo: 'A Swap through Time Wall under your Guardian guarantees first blood.',
          yellow_purple: "Use Kinetic Carbine's speed boost to dodge and reposition.",
          orange_blue: 'The queen of ganks between the central lanes from 3000 souls.',
        },
      },
    },
  },
  warden: {
    role: 'Anti-mobility patroller & bruiser',
    baseTips:
      "Alchemical Flask (1) takes 1 stamina bar from the enemy it hits: throw your flask BEFORE casting Binding Word (3) so they have no dash left to escape the cage!",
    builds: {
      warden_cage_enforcer: {
        name: 'Cage & Last Stand inquisitor',
        subtitle: 'Stamina punishment + a rooting cage',
        playstyle:
          "Run faster than anyone with Willpower (2), take the enemy's stamina with the flask (1), lock them up with Binding Word (3) and drain the whole team with Last Stand (4).",
        abilities: {
          '1': { description: 'Reduces enemy weapon damage and takes 1 stamina.', priorityTip: 'Always throw it right before Binding Word.' },
          '2': { description: 'Spirit shield and movement speed boost.', priorityTip: 'Lets you catch up with any target.' },
          '3': { description: "Roots the target if they don't leave the circle in time.", priorityTip: 'Gives +25% bonus weapon damage on the trapped target.' },
          '4': { description: 'A cone shockwave with 80% hero lifesteal.', priorityTip: 'Gives +50% resistances while channelling.' },
        },
        laneTips: {
          solo: 'The flask (1) has a very short cooldown and reduces enemy gun damage: throw it in every trade.',
          duo: 'Slowing Hex + Binding Word guarantees a 100% root with no way out.',
          yellow_purple: 'With Willpower and Sprint Boots, nobody can outrun you on a long lane.',
          orange_blue: 'Last Stand turns 2v2s around in enclosed spaces.',
        },
      },
    },
  },
  mcginnis: {
    role: 'Siege engineer, turrets & wall',
    baseTips:
      'Spectral Wall (3) splits the enemy team in two and stuns at max level. Your Medicinal Specter (2) heals a % of max HP and gives a big fire-rate bonus.',
    builds: {
      mcginnis_siege_fortress: {
        name: 'Siege fortress & minigun',
        subtitle: 'Tactical wall + area healing and objective destruction',
        playstyle: 'Control the lane with Spectral Wall and Medicinal Specter, and melt Guardians / Walkers in seconds with your minigun.',
        abilities: {
          '1': { description: 'Turrets that apply your spirit effects (slow, Suppressor).', priorityTip: 'Great to cover your flanks.' },
          '2': { description: 'A totem that heals a % of HP and boosts fire rate.', priorityTip: 'MAX 1ST to hold your lane forever.' },
          '3': { description: 'A blocking wall that drains stamina and stuns.', priorityTip: 'You can press (3) again to raise the wall earlier!' },
          '4': { description: 'A long-range rain of rockets.', priorityTip: 'Destroys waves and enemies stuck behind a wall.' },
        },
        laneTips: {
          solo: 'You only have 2 base stamina bars: buy Extra Stamina very early!',
          duo: 'A Spectral Wall placed behind an over-extended enemy cuts off their retreat.',
          yellow_purple: "With Monster Rounds you take the enemy Guardian whenever your opponent is away.",
          orange_blue: 'Your heal (2) keeps your partner at full HP at all times.',
        },
      },
    },
  },
  kelvin: {
    role: 'Control cryomancer & aerial support',
    baseTips:
      "Arctic Beam (3) slows both the enemy's movement and fire rate by 80%. Frozen Shelter (4) saves your whole team and heals massively.",
    builds: {
      kelvin_arctic_beam: {
        name: 'Arctic Beam cryomancer & healing grenades',
        subtitle: 'Total slow + group healing and an ice dome',
        playstyle:
          'Skate through the air with Ice Path (2), heal your allies while hurting the enemies with Frost Grenade (1) and shut down shooters with Arctic Beam (3).',
        abilities: {
          '1': { description: 'A grenade that hurts enemies and heals allies (level 2).', priorityTip: 'MAX 1ST for the healing and area damage.' },
          '2': { description: 'Creates an aerial ice track for you and your allies.', priorityTip: 'Lets you go up and catch Vindicta or Grey Talon in the sky.' },
          '3': { description: 'An ice beam that spreads to nearby enemies.', priorityTip: "Destroys the carries' fire rate." },
          '4': { description: 'An impenetrable ice dome that regenerates massively.', priorityTip: 'Can be turned off at any time.' },
        },
        laneTips: {
          solo: 'Once Frost Grenade is level 2, throw it at your feet in melee range: it heals you AND hurts the enemy.',
          duo: "One of the best duo-lane heroes in the game thanks to Arctic Beam's healing and slow.",
          yellow_purple: 'Ice Path lets you escape any gank.',
          orange_blue: 'Cross the map on your ice track to steal the Urn.',
        },
      },
    },
  },
  viscous: {
    role: 'Gooey tank, Cube rescue & control',
    baseTips: 'The Cube (2) purges every negative effect and regenerates massively. Puddle Punch (3) knocks enemies into the air.',
  },
  ivy: {
    role: 'Support gargoyle, life link & bombardment',
    baseTips:
      "Stone Form (3) makes you invulnerable, heals you and stuns around you. Watcher's Covenant (2) shares lifesteal and fire rate with your ally.",
  },
  dynamo: {
    role: 'Black-hole initiator & team healer',
    baseTips: 'Quantum Entanglement (2) makes your whole team briefly untouchable. Singularity (4) pulls in and holds every nearby enemy.',
  },
  mirage: {
    role: "Djinn duelist, tornado & teleport",
    baseTips: "Tornado (1) makes you invulnerable while lifting enemies. Djinn's Mark (3) multiplies its damage with every spaced-out shot.",
  },
  calico: {
    role: 'Stealthy feline assassin & ambush',
    baseTips: 'Leap into melee range, use your ultimate to become untouchable, and get out in your cat form.',
  },
  vyper: {
    role: 'Sliding gunner with extreme fire rate & petrification',
    baseTips: 'You get infinite ammo or extra resistance while sliding! Bola (4) petrifies targets.',
  },
  holliday: {
    role: 'Sharpshooter sheriff, explosive barrels & lasso',
    baseTips: 'Crack Shot (3) guarantees a slowing critical shot. Bounce Pad (2) launches you and lets you catch an enemy with the Lasso (4).',
  },
  sinclair: {
    role: 'Astral illusionist, polymorph & ultimate copy',
    baseTips:
      "Vexing Bolt (1) deals massive damage, redirected by your Assistant (2). Rabbit Hex (3) turns enemies into rabbits and Audience Participation (4) steals the enemy's ultimate!",
  },
  baba: {
    role: 'Spirit witch & area control',
    baseTips: 'Control space with your area hexes and support your lane partner with your barriers and slows.',
  },
  rem: {
    role: 'Cosmic mage, mobility & spirit burst',
    baseTips: 'Harass from mid range with your spirit projectiles and use your mobility to dodge crowd control.',
  },
  solomon: {
    role: 'Frontline strategist, support & control',
    baseTips: 'Absorb the pressure on the front line and punish enemies who push too far into your lane.',
  },
  paige: {
    role: 'Occult scholar, grimoire & spirit burst',
    baseTips: 'Use the range of your spells to zone your opponents and lower their spirit resist.',
  },
  billy: {
    role: 'Aggressive brawler & lane pressure',
    baseTips: 'Force close-range fights and use your natural toughness to win the trades.',
  },
  doorman: {
    role: 'Portal keeper & controller',
    baseTips: 'Control the routes and surprise your opponents with tactical movement and blocks.',
  },
  drifter: {
    role: 'Wandering marksman & skirmisher',
    baseTips: 'Use your mobility to punish isolated targets and chain headshots.',
  },
  victor: {
    role: 'Heavy commander & assault',
    baseTips: 'Hold the middle of the lane and shred the armour of priority targets.',
  },
  mina: {
    role: 'Agile duelist & quick burst',
    baseTips: "Get in and out of fights in a few seconds once you've taken out the enemy shooter.",
  },
  silver: {
    role: 'Precision shooter & weapon damage',
    baseTips: 'Keep maximum distance and punish every positioning mistake with your critical shots.',
  },
  apollo: {
    role: 'Solar fighter & hybrid burst',
    baseTips: 'Combine sustained fire and light abilities to dominate skirmishes.',
  },
  celeste: {
    role: 'Celestial enchantress & support',
    baseTips: 'Protect your lane ally and interrupt enemy engages.',
  },
  graves: {
    role: 'Shotgun mercenary & close-range burst',
    baseTips: 'Dominate short-range fights thanks to your buckshot damage and toughness.',
  },
  venator: {
    role: 'Bounty hunter & tracker',
    baseTips: 'Isolate weakened targets and stop them from escaping with your hunting tools.',
  },
  violet: {
    role: 'Violet energy mage & spirit damage',
    baseTips: 'Build up spirit power to wipe out enemy lines from range.',
  },
  rat_king: {
    role: 'Royal brawler, rat swarm & team banner',
    baseTips:
      'Royal Pestments (3) gives you a barrier that deflects bullets: engage while it holds. Rule, Ratannia! (4) makes nearby allies immune to slows and reduces the damage they take.',
  },
  deadman_danny: {
    role: 'Jetpack flyer & spirit missiles',
    baseTips:
      'Lay down Strix Salvo (1), then finish marked targets with a charged shot. The jetpack (2) overheats: plan your explosive landing in the middle of the enemies.',
  },
  nurse_harrow: {
    role: 'Spirit healer, leeches & area terror',
    baseTips:
      'Healing Needles (3) heal your allies whenever you deal damage: stay within shooting range. Lurking Terrors (4) makes enemies who look at you flee: cast it facing their line to break up their engage.',
  },
};

const englishPart = (name: string) => (name.match(/\(([^)]+)\)/)?.[1] ?? name).trim();

/** English version of the placeholder build of a hero without hand-written build (used only without meta data). */
export function EN_GENERIC_BUILD(
  heroName: string,
  role: string,
  baseTips: string,
  build: HeroBuildArchetype
): HeroBuildArchetype {
  const abilityText: Record<AbilityKey, { description: string; priorityTip: string }> = {
    '1': { description: 'Main damage and wave-clear ability.', priorityTip: 'MAX 1ST to dominate the lane.' },
    '3': { description: 'Key synergy and amplification ability.', priorityTip: 'Max it 2nd for the mid-game power spike.' },
    '2': { description: 'Mobility, survival or support tool.', priorityTip: 'Keep it to dodge or engage.' },
    '4': { description: 'High-impact teamfight ultimate.', priorityTip: 'Use it on objectives and in 2v2s.' },
  };
  return {
    ...build,
    name: `${heroName} meta build (all-round)`,
    subtitle: role,
    playstyle: baseTips,
    abilitiesDetails: build.abilitiesDetails.map((d) => ({ ...d, name: englishPart(d.name), ...abilityText[d.key] })),
    laneTips: {
      solo: baseTips,
      duo: 'Coordinate your abilities with your lane partner to punish over-extended targets.',
      yellow_purple: 'Watch the enemy rotations and manage your stamina.',
      orange_blue: 'Push the wave before helping on the Urn or the neutral camps.',
    },
  };
}
