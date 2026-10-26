/**
 * Italian text of the hand-written data of deadlockData.ts (lanes, hero roles and tips, hand-written builds,
 * matchups), keyed by the same ids as deadlockData.en.ts.
 *
 * Item and ability names are written here by their current English name: deadlockData.ts replaces them with the
 * official Italian name of the game data (itemsCatalog.json / metaBuilds.json, "Reactive Barrier" -> "Barriera
 * reattiva"), so the guides use the game's own wording and follow it when Valve renames something. A name the
 * game no longer has stays in English.
 *
 * src/data/deadlockData.test.ts checks that every hand-written French text has its Italian version here.
 */
import type { HeroBuildArchetype, LaneColor } from './deadlockData';
import type { TranslatedHeroText } from './deadlockData.en';

type AbilityKey = '1' | '2' | '3' | '4';

export const IT_LANES: Record<LaneColor, { name: string; description: string; tacticalNote: string }> = {
  yellow: {
    name: "York Avenue (gialla)",
    description: "Corsia esterna (di solito un 1v1 in solitaria)",
    tacticalNote:
      "Lunghe linee di tiro e poche coperture al centro. La gestione della stamina e il sustain (Restorative Shot / Extra Regen) sono decisivi, perché il tuo jungler è lontano.",
  },
  orange: {
    name: "Orchard Street (arancione)",
    description: "Corsia centrale interna (di solito un 2v2 in coppia)",
    tacticalNote:
      "Forte fuoco incrociato e rotazioni rapide dal Mid-Boss / Urna. Punta su un push veloce (Monster Rounds) e sugli scudi reattivi.",
  },
  blue: {
    name: "Broadway (blu)",
    description: "Corsia centrale interna (di solito un 2v2 in coppia)",
    tacticalNote:
      "Molta verticalità (tetti e ponti), ideale per le imboscate di Lash / Pocket e per i colpi aerei di Vindicta. Attenzione ai gank intorno ai 5:00.",
  },
  purple: {
    name: "Park Avenue (viola)",
    description: "Corsia esterna (di solito un 1v1 in solitaria)",
    tacticalNote:
      "Duello isolato e molto intenso. Una morte precoce ti costa subito il Guardian. Investi in un oggetto difensivo a 500/1250 anime appena il nemico ha il suo picco.",
  },
};

export const IT_HEROES: Record<string, TranslatedHeroText> = {
  vindicta: {
    role: "Tiratrice aerea e giustiziera di anime",
    baseTips:
      "La tua forza è il controllo dell'aria (Flight) e le anime bonus guadagnate con Assassinate (T3). Non sprecare mai Flight prima di aver individuato le minacce di controllo (Knockdown, il Grapple Arm di Bebop, il tuffo di Lash).",
    builds: {
      vindicta_crow_executor: {
        name: "Cecchina spirituale e sanguinamento del Corvo (meta esecuzione)",
        subtitle: "Sanguinamento a % di salute con i Corvi + burst di 4 colpi esplosivi",
        playstyle:
          "Molesta dalla distanza con Crow Familiar (al livello massimo rimbalza su 3 nemici) per portare la loro salute sotto il 50%, poi concatena le esecuzioni con Assassinate per guadagnare migliaia di anime bonus.",
        abilities: {
          "1": {
            description: "Lega i nemici nell'area d'impatto.",
            priorityTip: "Tienilo per fermare un assassino che ti corre addosso, o per garantire il colpo di Assassinate.",
          },
          "2": {
            description: "Vola in aria e aggiunge danni spirituali a ogni proiettile che spari.",
            priorityTip: "Metti 1 punto presto per la durata, poi massimizzalo dopo Corvo / Cecchino.",
          },
          "3": {
            description: "Lancia un corvo che infligge un sanguinamento in base alla salute attuale.",
            priorityTip:
              "MAX 1° (5 punti): al livello massimo il corvo rimbalza su altri 2 bersagli, applica un sanguinamento a % di salute e riduce del 12% la loro resistenza spirituale e balistica!",
          },
          "4": {
            description: "Colpo di cecchino a lunga distanza che infligge enormi danni bonus ai nemici sotto il 50% di salute.",
            priorityTip: "MAX 2° (5 punti): l'ultimo livello (+155 danni e +850 anime bonus per uccisione) ti fa crescere per tutta la partita.",
          },
        },
        laneTips: {
          solo: "In un 1v1 in solitaria, usa High-Velocity Rounds per negare le anime al nemico. Lancia il Corvo appena il tuo avversario si allinea con il suo stendardo curativo per costringerlo a indietreggiare.",
          duo: "In un 2v2 in coppia, tieni Stake (1) per seguire il controllo del tuo alleato. Con 5 punti nel Corvo, rimbalza tra i due nemici di corsia a ogni lancio!",
          yellow_purple: "Nelle corsie esterne (gialla / viola), tieni sempre 1 barra di stamina o il tuo Flight per sopravvivere ai gank lunghi.",
          orange_blue: "Nelle corsie centrali (arancione / blu), usa i tetti alti per colpire la corsia vicina appena hai la tua ultimate a 3000 anime.",
        },
      },
      vindicta_ac130_gun: {
        name: "Arma ibrida AC-130 e Flight (DPS aereo)",
        subtitle: "Mitragliamento aereo continuo in Flight + proiettili spirituali",
        playstyle:
          "Trasforma Vindicta in una cannoniera volante: mentre sei in Flight (2), ogni proiettile infligge enormi danni da arma (Sharpshooter) più danni spirituali all'impatto.",
        abilities: {
          "1": {
            description: "Immobilizza i bersagli a terra per mitragliarli dall'alto.",
            priorityTip: "Combo perfetta con Alchemical Fire.",
          },
          "2": {
            description: "Vola in aria e infonde danni spirituali nei tuoi proiettili.",
            priorityTip: "MAX 1°: +6 s di volo e un grosso bonus di danni spirituali per proiettile.",
          },
          "3": {
            description: "Riduce le resistenze nemiche per amplificare i tuoi colpi in volo.",
            priorityTip: "MAX 2° per la riduzione delle armature (-12% resistenza balistica e spirituale).",
          },
          "4": {
            description: "Finisci i bersagli che cercano di scappare dietro un muro.",
            priorityTip: "Prendi il potenziamento T2/T3 appena inizi a fare gank.",
          },
        },
        laneTips: {
          solo: "Punisci ogni tentativo di last-hit con Headshot Booster. Usa Flight solo dopo che il nemico ha usato il suo scatto, per togliergli il 60% della salute in un caricatore.",
          duo: "Combina Stake (1) + Alchemical Fire sui due nemici raggruppati: si sciolgono in meno di 3 secondi.",
          yellow_purple: "Prendi Monster Rounds se il tuo avversario spinge troppo in fretta sotto il tuo Guardian.",
          orange_blue: "Ottima build per assicurarsi il Mid-Boss e l'Urna grazie al suo DPS costante.",
        },
      },
    },
    matchups: {
      bebop: {
        summary: "Il suo Grapple Arm ha una portata enorme e ti prende facilmente mentre fluttui lenta in aria.",
        laneRule:
          "Compra Reactive Barrier a 1250 anime (annulla completamente la combo Grapple Arm + bomba), poi Dispel Magic a 3000 anime per eliminare le sue bombe adesive.",
      },
      lash: {
        summary: "Lash salta più in alto del tuo Flight e ti schianta a terra con Ground Strike e la sua ultimate.",
        laneRule:
          "Non volare mai al centro della corsia quando lui ha altezza sotto i tetti. Usa Slowing Hex su di lui prima che decolli, o Ethereal Shift quando lancia la sua ultimate.",
      },
      grey_talon: {
        summary: "Un duello tra cecchini aerei: i suoi Charged Shot fanno molto male se resti ferma in volo.",
        laneRule:
          "Prendi Spirit Shielding per assorbire le sue frecce caricate, poi Spellbreaker a fine partita, vincendo il duello di Assassinate.",
      },
      haze: {
        summary: "Può addormentarti (Sleep Dagger) dalla distanza o arrivarti alle spalle invisibile.",
        laneRule: "Tieni Stake (1) da lanciare ai tuoi piedi appena esce dall'invisibilità, e attiva Metal Skin durante la sua Bullet Dance.",
      },
      abrams: {
        summary: "Un tank con una forte rigenerazione che proverà a tuffarsi su di te sotto la tua torre.",
        laneRule: "Lo batti dalla distanza se tagli la sua rigenerazione con Healbane (applicato dal tuo Corvo) o Toxic Bullets.",
      },
      pocket: {
        summary: "Molto mobile con il suo mantello e la sua valigia; la sua ultimate Affliction applica un veleno letale.",
        laneRule: "Slowing Hex gli impedisce di teletrasportarsi sul mantello. Dispel Magic elimina all'istante la sua ultimate Affliction!",
      },
    },
  },
  grey_talon: {
    role: "Arciere spirituale e artiglieria aerea",
    baseTips:
      "I tuoi Charged Shot trapassano più bersagli e hanno una hitbox generosa. Usa il tuo Guided Owl per finire i nemici su tutta la mappa e ottenere potere spirituale permanente.",
    builds: {
      talon_charged_spirit: {
        name: "Artiglieria spirituale con Charged Shot",
        subtitle: "4 Charged Shot devastanti + un Gufo nucleare",
        playstyle: "Massimizza il potere spirituale e le cariche per infliggere da 600 a 1200 danni per freccia caricata da una distanza sicura.",
        abilities: {
          "1": { description: "Colpo spirituale perforante ad alta potenza.", priorityTip: "MAX 1°: il moltiplicatore spirituale raddoppia all'ultimo livello." },
          "2": { description: "Salto aereo e colpo multiplo.", priorityTip: "Usa gli scatti aerei per schivare mentre spari." },
          "3": {
            description: "Trappola a terra che rallenta e disarma / silenzia.",
            priorityTip: "Piazzala sulle scale o sotto i tuoi piedi contro gli assassini.",
          },
          "4": {
            description: "Gufo guidato che stordisce e giustizia sotto il 22% di salute.",
            priorityTip: "Ogni uccisione del Gufo ti dà +5 di potere spirituale permanente!",
          },
        },
        laneTips: {
          solo: "Spara i tuoi Charged Shot attraverso l'ondata di creep per colpire allo stesso tempo l'eroe nemico.",
          duo: "Piazza la tua trappola (3) davanti al Guardian nemico per punire ogni push.",
          yellow_purple: "Tieni Rain of Arrows per scappare sopra gli edifici quando subisci un gank.",
          orange_blue: "Manda il tuo Gufo (4) nella corsia vicina senza nemmeno lasciare la tua torre.",
        },
      },
    },
  },
  haze: {
    role: "Assassina furtiva e hyper-carry di Fixation",
    baseTips:
      "Accumula cariche di Fixation su un solo bersaglio prima di usare le tue abilità. Sleep Dagger ti garantisce un corpo a corpo pesante o un ingaggio gratuito.",
    builds: {
      haze_fixation_shredder: {
        name: "Hyper-carry di Fixation e Bullet Dance",
        subtitle: "Cadenza di fuoco estrema + un'ultimate da teamfight inarrestabile",
        playstyle: "Farm veloce con Smoke Bomb, gank furtivi con Sleep Dagger e squadre spazzate via con Bullet Dance + Unstoppable.",
        abilities: {
          "1": {
            description: "Un pugnale che addormenta il bersaglio.",
            priorityTip: "Il sonno non si interrompe subito: piazza un corpo a corpo pesante gratuito prima di sparare!",
          },
          "2": { description: "Invisibilità e velocità di corsa.", priorityTip: "Ottima per attraversare la mappa e sorprendere i cecchini." },
          "3": {
            description: "Passiva: ogni proiettile aumenta i tuoi danni sul bersaglio.",
            priorityTip: "MAX 1°: la tua cadenza di fuoco la accumula all'istante.",
          },
          "4": { description: "Un turbine di proiettili con un'alta evasione.", priorityTip: "Attiva Unstoppable o Silencer subito prima della tua ultimate." },
        },
        laneTips: {
          solo: "Gioca sul sicuro nei primi 4 minuti: Haze è fragile al livello 1. Usa Sleep Dagger per interrompere le abilità nemiche.",
          duo: "Lascia ingaggiare il tuo compagno e accumula più di 40 cariche di Fixation sul bersaglio bloccato.",
          yellow_purple: "Prendi Extra Regen presto per reggere il poke in una corsia in solitaria.",
          orange_blue: "Appena hai Smoke Bomb al livello 2, ruota sulla corsia vicina dopo ogni ondata.",
        },
      },
    },
  },
  bebop: {
    role: "Specialista dell'uncino e bombe spirituali",
    baseTips:
      "Ogni Sticky Bomb che colpisce un eroe aumenta per sempre i suoi danni (+1,5% per carica). Colpisci con un montante un creep con una bomba attaccata per mandarlo a esplodere sul nemico!",
    builds: {
      bebop_double_bomb: {
        name: "Demolitore con uncino e bombe accumulate",
        subtitle: "Controllo letale con Grapple Arm + crescita infinita di Sticky Bomb",
        playstyle:
          "Prendi un bersaglio isolato con Grapple Arm (3), attaccagli una Sticky Bomb (2) e mandalo verso la tua squadra con Exploding Uppercut (1).",
        abilities: {
          "1": { description: "Lancia in aria le unità e ricarica la tua arma.", priorityTip: "Azzera la ricarica di Grapple Arm al livello massimo." },
          "2": {
            description: "Ottiene danni permanenti per ogni eroe colpito.",
            priorityTip: "Attaccala ai creep e lanciali con il montante per molestare senza rischi.",
          },
          "3": { description: "Rampino a lunga distanza.", priorityTip: "Il livello 2 raddoppia la portata (60 m): letale contro i cecchini." },
          "4": { description: "Raggio laser orbitale che rallenta molto.", priorityTip: "Usalo dall'alto per dominare un teamfight." },
        },
        laneTips: {
          solo: "Il tuo laser di base è hitscan (istantaneo): puoi negare l'80% delle anime del tuo avversario senza nemmeno comprare High-Velocity Rounds!",
          duo: "Un solo Grapple Arm al livello 2 sotto il tuo Guardian è un'uccisione garantita.",
          yellow_purple: "Mettiti dietro il pilastro centrale per lanciare uncini a sorpresa.",
          orange_blue: "Spostati tra arancione e blu con la portata potenziata di Grapple Arm.",
        },
      },
    },
  },
  abrams: {
    role: "Colosso da mischia e rigenerazione infernale",
    baseTips:
      "Dopo una Shoulder Charge contro un muro hai un corpo a corpo pesante garantito che il nemico non può parare. Attenzione alle finte di parata a livello basso e alto!",
    builds: {
      abrams_immortal_brawler: {
        name: "Colosso di Siphon Life e corpo a corpo pesante",
        subtitle: "Una prima linea instancabile che schiaccia le retrovie",
        playstyle: "Carica nel vivo dello scontro con Siphon Life attivo, inchioda il bersaglio principale contro un muro e assorbi tutti i danni.",
        abilities: {
          "1": { description: "Prosciuga la vita dei nemici vicini.", priorityTip: "Attivala prima di tuffarti nello scontro." },
          "2": {
            description: "Una carica che stordisce contro un muro.",
            priorityTip: "Duration Extender ti garantisce un pugno caricato durante lo stordimento.",
          },
          "3": { description: "Rigenera una parte di tutti i danni subiti.", priorityTip: "Ti fa vincere ogni scambio breve in corsia." },
          "4": { description: "Salta in cielo e schianta un'area.", priorityTip: "Dà l'immunità ai controlli al livello massimo!" },
        },
        laneTips: {
          solo: "Contro un cecchino (Vindicta / Talon), gioca intorno al velo e alle coperture, e usa la tua passiva per rigenerare il loro poke.",
          duo: "Punisci ogni passo avanti dei nemici con Shoulder Charge contro il ponte centrale.",
          yellow_purple: "Spingi l'ondata e ruba il campo neutrale vicino del nemico.",
          orange_blue: "Tuffati sulla corsia vicina dai tetti con Seismic Impact.",
        },
      },
    },
  },
  lash: {
    role: "Assassino aereo e iniziatore dei teamfight",
    baseTips:
      "Più cadi dall'alto con Ground Strike (1), più grandi sono i danni. Sei l'incubo naturale dei tiratori fragili che non hanno Ethereal Shift.",
    builds: {
      lash_sky_slam: {
        name: "Meteora spirituale di Ground Strike",
        subtitle: "Burst verticale istantaneo + Death Slam su più bersagli",
        playstyle: "Prendi quota con Grapple (2), tuffati con Ground Strike (1), prosciuga con Flog (3) e vattene prima che possano rispondere.",
        abilities: {
          "1": { description: "Un tuffo i cui danni crescono con l'altezza della caduta.", priorityTip: "MAX 1°: i danni raddoppiano all'ultimo livello." },
          "2": { description: "Spinta aerea e bonus all'arma.", priorityTip: "Si ricarica sulle truppe alleate o nemiche." },
          "3": {
            description: "Una frustata che cura e rallenta.",
            priorityTip: "Il tuo strumento principale per tenere la corsia e ridurre la cadenza di fuoco del nemico.",
          },
          "4": {
            description: "Afferra più nemici e li schianta con violenza.",
            priorityTip: "Lancia i nemici proprio sotto il tuo Walker o in mezzo alla tua squadra.",
          },
        },
        laneTips: {
          solo: "Usa Flog (3) attraverso muri / coperture per curarti mentre molesti.",
          duo: "Salta dal ponte centrale per schiantare i due nemici in un colpo solo.",
          yellow_purple: "Stamina Mastery ti fa attraversare tutta la corsia in 2 secondi.",
          orange_blue: "Broadway (blu) e Orchard (arancione) hanno i tetti migliori del gioco per massimizzare i danni da caduta di Ground Strike.",
        },
      },
    },
  },
  wraith: {
    role: "Duellante telecinetica e split-pusher",
    baseTips:
      "I tuoi colpi caricano le tue carte (Card Trick). Teletrasportati su un bersaglio isolato e bloccalo con Telekinesis (4) per abbatterlo in un solo caricatore.",
    builds: {
      wraith_hybrid_cards: {
        name: "Duellante Full Auto e carte spirituali",
        subtitle: "Alta cadenza di fuoco + burst di carte e un'ultimate mirata",
        playstyle:
          "Vince ogni 1v1 di metà partita grazie a Telekinesis e scioglie gli obiettivi (Guardian / Walker) in pochi secondi.",
        abilities: {
          "1": { description: "Lancia una carta esplosiva caricata dai tuoi proiettili.", priorityTip: "Attiva subito Quicksilver Reload." },
          "2": { description: "Teletrasporto a lunga distanza con uno scudo.", priorityTip: "Per scappare, o per saltare su un cecchino in alto." },
          "3": { description: "Un enorme aumento della cadenza di fuoco e proiettili spirituali.", priorityTip: "MAX 1° per il furto di vita spirituale e il DPS." },
          "4": { description: "Solleva e silenzia un nemico.", priorityTip: "Garantisce il 100% di colpi alla testa mentre il bersaglio levita." },
        },
        laneTips: {
          solo: "Lancia le carte dietro i pilastri dove si nasconde il nemico: la hitbox è molto grande.",
          duo: "Full Auto dà cadenza di fuoco anche al tuo alleato vicino!",
          yellow_purple: "Ideale in una corsia in solitaria per abbattere il Guardian appena il tuo avversario torna alla base.",
          orange_blue: "Teletrasportati sopra i tetti per aggirare i cecchini.",
        },
      },
    },
  },
  pocket: {
    role: "Mago sfuggente da imboscata e burst ad area",
    baseTips:
      "Tieni attive le cariche di amplificazione con Barrage (1) prima di tuffarti con Flying Cloak (2) e Enchanter's Satchel (3). Attenzione: Pocket ha una resistenza spirituale di base negativa (-15%)!",
    builds: {
      pocket_affliction_burst: {
        name: "Artista della fuga e Affliction ad area",
        subtitle: "Combo esplosiva ad area + invulnerabilità nella valigia",
        playstyle:
          "Fluttua sopra la squadra nemica con Barrage, teletrasportati in mezzo, lancia Affliction (4), nasconditi nella valigia (3), poi Ethereal Shift.",
        abilities: {
          "1": { description: "Proiettili che amplificano tutti i tuoi danni del 6% per carica.", priorityTip: "Resta in aria mentre spari i tuoi 4 proiettili." },
          "2": { description: "Un mantello lanciato su cui puoi teletrasportarti.", priorityTip: "Lancia il mantello in un punto sicuro PRIMA di entrare nella valigia." },
          "3": { description: "Invulnerabile dentro la valigia, poi un'esplosione.", priorityTip: "Schiva l'Assassinate di Vindicta o la bomba di Bebop." },
          "4": { description: "Un enorme veleno a % di salute su tutta l'area.", priorityTip: "Applica Healbane e Suppressor a tutta la squadra nemica." },
        },
        laneTips: {
          solo: "Compra assolutamente Hollow Point e Enchanter's Emblem per compensare la tua debolezza naturale ai danni spirituali.",
          duo: "Barrage da un tetto dà +24% di amplificazione dei danni prima ancora di ingaggiare.",
          yellow_purple: "Usa Kinetic Dash + Barrage per fluttuare su tutta la corsia.",
          orange_blue: "Tuffati dai tetti centrali e applica Affliction ai due giocatori nemici.",
        },
      },
    },
  },
  lady_geist: {
    role: "Maga d'assedio spirituale e Soul Exchange",
    baseTips:
      "Le tue abilità costano la tua salute ma infliggono enormi danni ad area. Se un assassino ti salta addosso al 10% di salute, usa Soul Exchange (4) per scambiare le vostre barre della salute!",
    builds: {
      geist_essence_artillery: {
        name: "Imperatrice di Essence Bomb e Malice",
        subtitle: "Enormi bombe ad area + furto di vita spirituale",
        playstyle: "Controllo totale dell'area con Essence Bomb (1) e amplificazione dei danni con le schegge di Malice (3).",
        abilities: {
          "1": {
            description: "Una bomba ad ampio raggio che lascia una pozza tossica al livello massimo.",
            priorityTip: "MAX 1°: ripulisce le ondate e gli eroi nascosti dietro un muro.",
          },
          "2": { description: "Un legame che prosciuga la vita e silenzia al livello massimo.", priorityTip: "Puoi muoverti e sparare mentre prosciughi." },
          "3": { description: "Schegge di sangue che rallentano e amplificano i tuoi danni.", priorityTip: "Lancia Malice prima di Essence Bomb per +15% fino a +30% di danni." },
          "4": { description: "Scambia la tua % di salute con un nemico vicino.", priorityTip: "Silenzio ad area di 3 s al livello massimo." },
        },
        laneTips: {
          solo: "Lady Geist è una delle regine del 1v1 grazie al raggio di Essence Bomb, che colpisce anche dietro le coperture del Guardian.",
          duo: "Malice + Essence Bomb punisce duramente le coppie che restano vicine.",
          yellow_purple: "Prendi Extra Regen a 500 anime per compensare il costo in salute delle tue abilità.",
          orange_blue: "Attenzione ai silenzi (Slowing Hex / Silencer) che ti impediscono di lanciare Soul Exchange.",
        },
      },
    },
  },
  infernus: {
    role: "Schermagliatore incendiario e furto di vita con i danni nel tempo",
    baseTips:
      "I tuoi colpi applicano Afterburn (3). Appena il nemico brucia, ogni proiettile in più rinnova del tutto la durata della bruciatura e ti cura grazie al furto di vita spirituale!",
    builds: {
      infernus_afterburn_drainer: {
        name: "Piromane di Afterburn e Flame Dash",
        subtitle: "Bruciatura infinita + enorme rigenerazione negli scontri",
        playstyle: "Applica Napalm (1) per aumentare tutti i tuoi danni del 40%, dai fuoco al bersaglio con i tuoi colpi e attraversa lo scontro con Flame Dash (2).",
        abilities: {
          "1": { description: "Uno sputo di napalm che rallenta e amplifica i tuoi danni.", priorityTip: "+20% di furto di vita e riduzione delle cure al livello massimo." },
          "2": { description: "Uno scatto di fuoco che lascia una scia ardente.", priorityTip: "Riduce la cadenza di fuoco del nemico al livello 2." },
          "3": { description: "Una bruciatura spirituale attivata dai tuoi colpi e dai colpi alla testa.", priorityTip: "MAX 1°: riduce anche del 30% i danni dei nemici in fiamme." },
          "4": { description: "Un'esplosione intorno a te che stordisce per 1,25 s.", priorityTip: "Combinala con Flame Dash per tuffarti in mezzo alla squadra nemica." },
        },
        laneTips: {
          solo: "Mira alla testa: i colpi alla testa riempiono l'indicatore di Afterburn due volte più in fretta.",
          duo: "Un Flame Dash attraverso l'ondata di creep e i due nemici ti restituisce tutta la salute con Spirit Lifesteal.",
          yellow_purple: "Un ottimo duellante delle corsie esterne grazie alla sua velocità di rotazione.",
          orange_blue: "La sua ultimate ribalta all'istante le schermaglie 2v2.",
        },
      },
    },
  },
  mo_and_krill: {
    role: "Tank scavatore e blocco mirato",
    baseTips: "Scorn (1) ti cura molto quando lo lanci tra creep ed eroi. Combo (4) blocca qualsiasi carry per più di 3 secondi.",
    builds: {
      mo_burrow_lockdown: {
        name: "Tank di Burrow e Combo di blocco",
        subtitle: "Sustain infinito in corsia + neutralizzazione del carry nemico",
        playstyle:
          "Vai sottoterra con Burrow (2) per guadagnare velocità e resistenze, sbuca sotto il carry nemico, disarmalo con Sand Blast (3) e bloccalo con Combo (4).",
        abilities: {
          "1": { description: "Un colpo ad area che ti cura (x2 sugli eroi).", priorityTip: "Ti rende quasi impossibile da cacciare dalla corsia." },
          "2": { description: "Immergiti sottoterra con +80% di resistenza balistica.", priorityTip: "Ideale per girare la mappa e ingaggiare sotto le torri." },
          "3": { description: "Un getto di sabbia a lunga distanza che disarma per 3,5 s.", priorityTip: "Neutralizza i tiratori con un clic." },
          "4": {
            description: "Trattiene e neutralizza un nemico, ottiene salute massima permanente per ogni uccisione.",
            priorityTip: "Duration Extender aumenta la durata di questo blocco letale!",
          },
        },
        laneTips: {
          solo: "Avvicinati all'ondata, premi Scorn (1) e recuperi 250 di salute ogni 10 secondi.",
          duo: "Appena hai la tua ultimate (Combo), il tuo compagno (es. Vindicta) ha un Assassinate garantito al 100% sul bersaglio bloccato.",
          yellow_purple: "Sand Blast impedisce al tuo avversario di fare last-hit o di spararti per 3,5 s.",
          orange_blue: "Usa Burrow per fare gank da una corsia centrale all'altra in pochi secondi.",
        },
      },
    },
  },
  seven: {
    role: "Mago elettrico ad area e hyper-farmer",
    baseTips:
      "Power Surge (3) trasforma i tuoi proiettili in fulmini a catena che riducono la resistenza spirituale del nemico. Attenzione a Knockdown mentre canalizzi Storm Cloud (4)!",
    builds: {
      seven_power_surge: {
        name: "Tempesta di Power Surge e fulmini a catena",
        subtitle: "Farm velocissimo + danni elettrici ibridi",
        playstyle:
          "Usa Static Charge (2) per far indietreggiare il tuo avversario, ripulisci tutta la jungla con Lightning Ball (1) e fulmina la squadra nemica con Power Surge (3).",
        abilities: {
          "1": { description: "Una sfera elettrica che attraversa e ripulisce le ondate.", priorityTip: "Perfetta per spingere la corsia e prendere i campi neutrali." },
          "2": { description: "Stordisce il bersaglio e i nemici vicini dopo un ritardo.", priorityTip: "Costringe il tuo avversario a usare lo scatto o a farsi stordire." },
          "3": { description: "Infonde nei tuoi proiettili fulmini che rimbalzano.", priorityTip: "MAX 1°: riduce del 15% la resistenza spirituale del nemico." },
          "4": { description: "Una gigantesca tempesta elettrica intorno a Seven.", priorityTip: "Compra Unstoppable se il nemico ha Knockdown." },
        },
        laneTips: {
          solo: "La tua testa ha una hitbox grande: non restare fermo contro Vindicta o Grey Talon.",
          duo: "Static Charge su un nemico lo costringe ad allontanarsi dal suo alleato, altrimenti vengono storditi entrambi.",
          yellow_purple: "Spingi l'ondata in 2 secondi con Lightning Ball e prendi tutti i campi neutrali.",
          orange_blue: "Domina gli scontri per l'Urna e il Mid-Boss grazie ai suoi danni ad area.",
        },
      },
    },
  },
  shiv: {
    role: "Duellante assetato di sangue, rabbia ed esecuzioni",
    baseTips:
      "Bloodletting (3) rimanda una grossa parte dei danni che subisci, e Killing Blow (4) giustizia all'istante qualsiasi nemico sotto il 28% di salute, azzerando la propria ricarica!",
    builds: {
      shiv_rage_brawler: {
        name: "Giustiziere di rabbia e Slice and Dice",
        subtitle: "Danni rimandati + esecuzioni a catena con azzeramento",
        playstyle:
          "Tieni l'indicatore di rabbia al 100% sui creep, lanciati con Slice and Dice (2), che si ripete grazie alla rabbia, e finisci con Killing Blow (4).",
        abilities: {
          "1": { description: "Coltelli da lancio che applicano un sanguinamento cumulabile.", priorityTip: "Tiene alto l'indicatore di rabbia dalla distanza." },
          "2": { description: "Uno scatto tagliente che colpisce una 2ª volta con la rabbia piena.", priorityTip: "MAX 1°: riduce la sua ricarica per ogni nemico colpito." },
          "3": { description: "Rimanda i danni subiti e ti permette di eliminarne una parte.", priorityTip: "Ti evita di morire per un burst improvviso." },
          "4": { description: "Esecuzione istantanea sotto il 28% di salute + azzeramento all'uccisione.", priorityTip: "Dà passivamente la meccanica della rabbia." },
        },
        laneTips: {
          solo: "Il tuo clic destro (fuoco alternativo a pallettoni) ti spinge indietro in aria: usalo per schivare o riposizionarti.",
          duo: "Aspetta l'indicatore di rabbia pieno a 3000 anime per tuffarti e concatenare due Killing Blow.",
          yellow_purple: "Molesta con i coltelli (1) finché il tuo avversario non è a portata di doppio scatto.",
          orange_blue: "Temibile nei corridoi stretti intorno ai ponti centrali.",
        },
      },
    },
  },
  yamato: {
    role: "Samurai spirituale e duellante inarrestabile",
    baseTips:
      "Power Slash (1) attraversa le coperture e infligge enormi danni. Shadow Transformation (4) ti rende immune ai controlli e alla morte, azzerando tutte le tue abilità.",
    builds: {
      yamato_power_slash: {
        name: "Lama spirituale di Power Slash e ombra",
        subtitle: "Fendenti spirituali enormi + una doppia rotazione durante l'ultimate",
        playstyle:
          "Aggancia i bersagli (anche in aria!) con Flying Slash (2), colpisci con Power Slash (1), curati con Crimson Slash (3), poi lancia Shadow Transformation (4) per rifare tutto da capo.",
        abilities: {
          "1": { description: "Un colpo caricato con danni spirituali altissimi.", priorityTip: "MAX 1°: attraversa i muri e i pilastri della corsia." },
          "2": { description: "Un rampino mirato che ti porta dritto su un nemico.", priorityTip: "Ti permette di seguire Vindicta o Grey Talon fino in cielo!" },
          "3": { description: "Un colpo a cono che ti cura e rallenta la cadenza di fuoco del nemico.", priorityTip: "Dà un enorme sustain in mischia." },
          "4": { description: "Azzera le tue abilità e impedisce la morte per tutta la durata.", priorityTip: "Al lancio elimina anche gli effetti negativi." },
        },
        laneTips: {
          solo: "Carica Power Slash dietro un muro ed esci all'ultimo momento per colpire il tuo avversario prima che possa rispondere.",
          duo: "Flying Slash ti permette di punire all'istante un cecchino che usa il suo volo.",
          yellow_purple: "Dominante in 1v1 da Power Slash al livello 2.",
          orange_blue: "Può tuffarsi sotto il Guardian nemico con Shadow Transformation senza morire.",
        },
      },
    },
  },
  paradox: {
    role: "Manipolatrice del tempo e pick-off",
    baseTips:
      "La combo simbolo: carica Kinetic Carbine (3), spara per congelare il bersaglio nel tempo, metti il tuo Time Wall (2) davanti a te e lancia Paradoxical Swap (4) per tirare il nemico attraverso il muro (-10% di salute massima + silenzio)!",
    builds: {
      paradox_carbine_swap: {
        name: "Cecchina del tempo con Kinetic Carbine e Swap",
        subtitle: "Colpo congelante ad alta velocità + uno scambio di posizione letale",
        playstyle:
          "Controlla il ritmo delle schermaglie con Kinetic Carbine e condanna un carry nemico scambiandolo nella tua squadra attraverso il tuo Time Wall.",
        abilities: {
          "1": { description: "Una granata pulsante che amplifica i tuoi danni a ogni impulso.", priorityTip: "Lanciala ai tuoi piedi prima di scambiare un nemico con la tua posizione." },
          "2": { description: "Blocca tutti i proiettili nemici e toglie il 10% di salute massima a chi lo attraversa.", priorityTip: "Silenzio di 3 s al livello massimo per ogni bersaglio che attraversa il muro!" },
          "3": { description: "Carica un colpo potente che congela il bersaglio nel tempo.", priorityTip: "MAX 1°: dà anche un grosso aumento della velocità di movimento." },
          "4": { description: "Scambia la tua posizione con un eroe nemico.", priorityTip: "Lancia il tuo Muro (2) mentre il proiettile dello Swap è in volo." },
        },
        laneTips: {
          solo: "Il tuo Time Wall (2) blocca l'Assassinate di Vindicta, la freccia di Grey Talon e la bomba di Lady Geist!",
          duo: "Uno Swap attraverso Time Wall sotto il tuo Guardian garantisce il primo sangue.",
          yellow_purple: "Usa l'aumento di velocità di Kinetic Carbine per schivare e riposizionarti.",
          orange_blue: "La regina dei gank tra le corsie centrali da 3000 anime.",
        },
      },
    },
  },
  warden: {
    role: "Pattugliatore anti-mobilità e bruiser",
    baseTips:
      "Alchemical Flask (1) toglie 1 barra di stamina al nemico che colpisce: lancia la fiala PRIMA di Binding Word (3) così non ha più scatti per uscire dalla gabbia!",
    builds: {
      warden_cage_enforcer: {
        name: "Inquisitore di gabbia e Last Stand",
        subtitle: "Punizione della stamina + una gabbia che immobilizza",
        playstyle:
          "Corri più veloce di tutti con Willpower (2), togli la stamina al nemico con la fiala (1), rinchiudilo con Binding Word (3) e prosciuga tutta la squadra con Last Stand (4).",
        abilities: {
          "1": { description: "Riduce i danni da arma nemici e toglie 1 di stamina.", priorityTip: "Lanciala sempre subito prima di Binding Word." },
          "2": { description: "Scudo spirituale e aumento della velocità di movimento.", priorityTip: "Ti permette di raggiungere qualsiasi bersaglio." },
          "3": { description: "Immobilizza il bersaglio se non esce dal cerchio in tempo.", priorityTip: "Dà +25% di danni da arma bonus sul bersaglio intrappolato." },
          "4": { description: "Un'onda d'urto a cono con l'80% di furto di vita sugli eroi.", priorityTip: "Dà +50% di resistenze mentre canalizzi." },
        },
        laneTips: {
          solo: "La fiala (1) ha una ricarica molto breve e riduce i danni dell'arma nemica: lanciala in ogni scambio.",
          duo: "Slowing Hex + Binding Word garantisce un'immobilizzazione al 100% senza via d'uscita.",
          yellow_purple: "Con Willpower e Sprint Boots, nessuno ti sfugge in una corsia lunga.",
          orange_blue: "Last Stand ribalta i 2v2 negli spazi chiusi.",
        },
      },
    },
  },
  mcginnis: {
    role: "Ingegnera d'assedio, torrette e muro",
    baseTips:
      "Spectral Wall (3) divide in due la squadra nemica e stordisce al livello massimo. Il tuo Medicinal Specter (2) cura una % della salute massima e dà un grosso bonus di cadenza di fuoco.",
    builds: {
      mcginnis_siege_fortress: {
        name: "Fortezza d'assedio e minigun",
        subtitle: "Muro tattico + cure ad area e distruzione degli obiettivi",
        playstyle: "Controlla la corsia con Spectral Wall e Medicinal Specter, e sciogli Guardian / Walker in pochi secondi con la tua minigun.",
        abilities: {
          "1": { description: "Torrette che applicano i tuoi effetti spirituali (rallentamento, Suppressor).", priorityTip: "Ottime per coprirti i fianchi." },
          "2": { description: "Un totem che cura una % della salute e aumenta la cadenza di fuoco.", priorityTip: "MAX 1° per tenere la tua corsia per sempre." },
          "3": { description: "Un muro che blocca, prosciuga la stamina e stordisce.", priorityTip: "Puoi premere di nuovo (3) per alzare il muro prima!" },
          "4": { description: "Una pioggia di razzi a lunga distanza.", priorityTip: "Distrugge le ondate e i nemici bloccati dietro un muro." },
        },
        laneTips: {
          solo: "Hai solo 2 barre di stamina di base: compra Extra Stamina molto presto!",
          duo: "Uno Spectral Wall piazzato dietro un nemico troppo avanzato gli taglia la ritirata.",
          yellow_purple: "Con Monster Rounds prendi il Guardian nemico ogni volta che il tuo avversario si allontana.",
          orange_blue: "La tua cura (2) tiene il tuo compagno sempre al massimo della salute.",
        },
      },
    },
  },
  kelvin: {
    role: "Criomante di controllo e supporto aereo",
    baseTips:
      "Arctic Beam (3) rallenta dell'80% sia il movimento sia la cadenza di fuoco del nemico. Frozen Shelter (4) salva tutta la tua squadra e cura moltissimo.",
    builds: {
      kelvin_arctic_beam: {
        name: "Criomante di Arctic Beam e granate curative",
        subtitle: "Rallentamento totale + cure di gruppo e una cupola di ghiaccio",
        playstyle:
          "Pattina nell'aria con Ice Path (2), cura i tuoi alleati ferendo i nemici con Frost Grenade (1) e neutralizza i tiratori con Arctic Beam (3).",
        abilities: {
          "1": { description: "Una granata che ferisce i nemici e cura gli alleati (livello 2).", priorityTip: "MAX 1° per le cure e i danni ad area." },
          "2": { description: "Crea una pista di ghiaccio aerea per te e i tuoi alleati.", priorityTip: "Ti permette di salire e prendere Vindicta o Grey Talon in cielo." },
          "3": { description: "Un raggio di ghiaccio che si estende ai nemici vicini.", priorityTip: "Distrugge la cadenza di fuoco dei carry." },
          "4": { description: "Una cupola di ghiaccio impenetrabile che rigenera moltissimo.", priorityTip: "Si può disattivare in qualsiasi momento." },
        },
        laneTips: {
          solo: "Con Frost Grenade al livello 2, lanciala ai tuoi piedi in mischia: ti cura E ferisce il nemico.",
          duo: "Uno dei migliori eroi in coppia del gioco grazie alle cure e al rallentamento di Arctic Beam.",
          yellow_purple: "Ice Path ti fa sfuggire a qualsiasi gank.",
          orange_blue: "Attraversa la mappa sulla tua pista di ghiaccio per rubare l'Urna.",
        },
      },
    },
  },
  viscous: {
    role: "Tank gelatinoso, salvataggio con il Cubo e controllo",
    baseTips: "The Cube (2) elimina tutti gli effetti negativi e rigenera moltissimo. Puddle Punch (3) lancia i nemici in aria.",
  },
  ivy: {
    role: "Gargoyle di supporto, legame vitale e bombardamento",
    baseTips:
      "Stone Form (3) ti rende invulnerabile, ti cura e stordisce intorno a te. Kudzu Connection (2) condivide furto di vita e cadenza di fuoco con il tuo alleato.",
  },
  dynamo: {
    role: "Iniziatore dei buchi neri e guaritore di squadra",
    baseTips: "Quantum Entanglement (2) rende tutta la tua squadra intoccabile per un attimo. Singularity (4) attira e trattiene tutti i nemici vicini.",
  },
  mirage: {
    role: "Duellante djinn, tornado e teletrasporto",
    baseTips: "Dust Devil (2) ti rende invulnerabile mentre solleva i nemici. Djinn's Mark (3) moltiplica i suoi danni a ogni colpo distanziato.",
  },
  calico: {
    role: "Assassina felina furtiva e imboscate",
    baseTips: "Salta a distanza di mischia, usa la tua ultimate per diventare intoccabile e scappa nella tua forma di gatto.",
  },
  vyper: {
    role: "Tiratrice in scivolata con cadenza di fuoco estrema e pietrificazione",
    baseTips: "Hai munizioni infinite o resistenza extra mentre scivoli! Petrifying Bola (4) pietrifica i bersagli.",
  },
  holliday: {
    role: "Sceriffa tiratrice scelta, barili esplosivi e lazo",
    baseTips: "Crackshot (3) garantisce un colpo critico che rallenta. Bounce Pad (2) ti lancia in aria e ti fa prendere un nemico con Spirit Lasso (4).",
  },
  sinclair: {
    role: "Illusionista astrale, metamorfosi e copia dell'ultimate",
    baseTips:
      "Vexing Bolt (1) infligge danni enormi, deviati dal tuo assistente (2). Rabbit Hex (3) trasforma i nemici in conigli e Audience Participation (4) ruba l'ultimate del nemico!",
  },
  baba: {
    role: "Strega spirituale e controllo dell'area",
    baseTips: "Controlla lo spazio con le tue maledizioni ad area e sostieni il tuo compagno di corsia con le tue barriere e i tuoi rallentamenti.",
  },
  rem: {
    role: "Mago cosmico, mobilità e burst spirituale",
    baseTips: "Molesta dalla media distanza con i tuoi proiettili spirituali e usa la tua mobilità per schivare i controlli.",
  },
  solomon: {
    role: "Stratega di prima linea, supporto e controllo",
    baseTips: "Assorbi la pressione in prima linea e punisci i nemici che spingono troppo nella tua corsia.",
  },
  paige: {
    role: "Studiosa dell'occulto, grimorio e burst spirituale",
    baseTips: "Usa la portata dei tuoi incantesimi per tenere a distanza gli avversari e ridurre la loro resistenza spirituale.",
  },
  billy: {
    role: "Picchiatore aggressivo e pressione in corsia",
    baseTips: "Forza gli scontri ravvicinati e usa la tua resistenza naturale per vincere gli scambi.",
  },
  doorman: {
    role: "Custode dei portali e controllore",
    baseTips: "Controlla i percorsi e sorprendi i tuoi avversari con movimenti tattici e blocchi.",
  },
  drifter: {
    role: "Tiratore errante e schermagliatore",
    baseTips: "Usa la tua mobilità per punire i bersagli isolati e concatenare colpi alla testa.",
  },
  victor: {
    role: "Comandante pesante e assalto",
    baseTips: "Tieni il centro della corsia e distruggi l'armatura dei bersagli prioritari.",
  },
  mina: {
    role: "Duellante agile e burst rapido",
    baseTips: "Entra ed esci dagli scontri in pochi secondi dopo aver eliminato il tiratore nemico.",
  },
  silver: {
    role: "Tiratrice di precisione e danni da arma",
    baseTips: "Mantieni la massima distanza e punisci ogni errore di posizionamento con i tuoi colpi critici.",
  },
  apollo: {
    role: "Combattente solare e burst ibrido",
    baseTips: "Combina fuoco continuo e abilità di luce per dominare le schermaglie.",
  },
  celeste: {
    role: "Incantatrice celeste e supporto",
    baseTips: "Proteggi il tuo alleato di corsia e interrompi gli ingaggi nemici.",
  },
  graves: {
    role: "Mercenario con fucile a pompa e burst ravvicinato",
    baseTips: "Domina gli scontri a corto raggio grazie ai danni dei tuoi pallettoni e alla tua resistenza.",
  },
  venator: {
    role: "Cacciatore di taglie e inseguitore",
    baseTips: "Isola i bersagli indeboliti e impedisci loro di scappare con i tuoi strumenti da caccia.",
  },
  violet: {
    role: "Maga dell'energia viola e danni spirituali",
    baseTips: "Accumula potere spirituale per spazzare via le linee nemiche dalla distanza.",
  },
  rat_king: {
    role: "Picchiatore reale, sciame di ratti e stendardo di squadra",
    baseTips:
      "Royal Pestments (3) ti dà una barriera che devia i proiettili: ingaggia finché regge. Rule, Ratannia! (4) rende gli alleati vicini immuni ai rallentamenti e riduce i danni che subiscono.",
  },
  deadman_danny: {
    role: "Volatore con jetpack e missili spirituali",
    baseTips:
      "Lancia Strix Salvo (1), poi finisci i bersagli marcati con un colpo caricato. Il jetpack (2) si surriscalda: prepara il tuo atterraggio esplosivo in mezzo ai nemici.",
  },
  nurse_harrow: {
    role: "Guaritrice spirituale, sanguisughe e terrore ad area",
    baseTips:
      "Healing Needles (3) curano i tuoi alleati quando infliggi danni: resta a portata di tiro. Lurking Terrors (4) fa fuggire i nemici che ti guardano: lanciala di fronte alla loro linea per spezzare il loro ingaggio.",
  },
};

const englishPart = (name: string) => (name.match(/\(([^)]+)\)/)?.[1] ?? name).trim();

/** Italian version of the placeholder build of a hero without hand-written build (used only without meta data). */
export function IT_GENERIC_BUILD(
  heroName: string,
  role: string,
  baseTips: string,
  build: HeroBuildArchetype
): HeroBuildArchetype {
  const abilityText: Record<AbilityKey, { description: string; priorityTip: string }> = {
    "1": { description: "Abilità principale di danno e pulizia delle ondate.", priorityTip: "MAX 1° per dominare la corsia." },
    "3": { description: "Abilità chiave di sinergia e amplificazione.", priorityTip: "Massimizzala per 2ª per il picco di metà partita." },
    "2": { description: "Strumento di mobilità, sopravvivenza o supporto.", priorityTip: "Tienila per schivare o ingaggiare." },
    "4": { description: "Ultimate da teamfight ad alto impatto.", priorityTip: "Usala sugli obiettivi e nei 2v2." },
  };
  return {
    ...build,
    name: `Build meta di ${heroName} (polivalente)`,
    subtitle: role,
    playstyle: baseTips,
    abilitiesDetails: build.abilitiesDetails.map((d) => ({ ...d, name: englishPart(d.name), ...abilityText[d.key] })),
    laneTips: {
      solo: baseTips,
      duo: "Coordina le tue abilità con il tuo compagno di corsia per punire i bersagli troppo avanzati.",
      yellow_purple: "Tieni d'occhio le rotazioni nemiche e gestisci la tua stamina.",
      orange_blue: "Spingi l'ondata prima di aiutare sull'Urna o sui campi neutrali.",
    },
  };
}
