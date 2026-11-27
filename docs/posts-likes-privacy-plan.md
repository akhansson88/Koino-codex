# KOINO — Inlägg, gillningar och privat/offentligt

**Implementation plan**
27 november 2026 · proposal for review
Owner: MausBot (Chief of Staff) with Noah (mobile), Sana (product/design), Tess (QA), Kai (lead)

---

## 1. Beslutet i korthet

Vi gör community-innehållet enklare och ger medlemmarna kontroll över vem som ser det:

1. **Bara två typer av inlägg:** **Inlägg** och **Bön** (prayer request). Reflektion, Tacksägelse, Bibelord och Uppdatering tas bort som valbara typer.
2. **Encourage blir Like.** Ett hjärta med en siffra, som togglar av och på. När man trycker exploderar små hjärtan ut från knappen. En medlem kan bara gilla samma inlägg en gång.
3. **Privat/offentligt-växel för inlägg och incheckningar.** En snygg tvådelad växel i skrivfönstret och på detaljsidan. Man kan ändra ett inlägg eller en incheckning efteråt — utan att radera och göra om.
4. **Backend tar bort gamla typer.** Databasen tillåter bara `kind: "post"` och `kind: "prayer_request"` för inlägg, och `kind: "like"` för gillningar.
5. **Ingen data försvinner i migrationen.** Gamla reflektioner, tacksägelser och bibelord blir vanliga inlägg. Gamla reaktioner blir gillningar. Befintliga kommentarer och böner är kvar.
6. **Incheckningar är kvar som egen funktion.** De får samma privat/offentligt-växel, men blandas inte ihop med inläggstyperna.

### Vad som inte ändras

- Böneämnen har kvar sin egen **Be**-knapp och bönräknare. Gilla är för inlägg och incheckningar, inte för böneämnen.
- Kommentarer/svar är kvar. De byter bara namn från “uppmuntran” till “kommentar” där det syftar på ett svar.
- Dagboken är fortfarande privat. Den används som lagringsplats för privata inlägg och privata incheckningar.
- Böner, bibelverser, röstanteckningar, events och fasting påverkas inte.

---

## 2. Utgångsläget

Det här finns i dag och är det vi utgår från:

| Område | I dag | Problem |
|---|---|---|
| Inläggstyper | `reflection`, `prayer_request`, `prayer_moment`, `praise`, `update`, `scripture` | Fyra valbara typer i communityns skrivfönster, plus dolda systemtyper. För rörigt. |
| Etiketter | “Encourage”, “Amen”, “Reflect”, “Respond” beroende på typ | Samma handling heter olika saker och kräver att man förstår fyra begrepp. |
| Reaktioner | `postReactions` med `kind` per inläggstyp | Räknas per typ. En gillning är egentligen bara en reaktion. |
| Privat/offentligt | Väljs när man skapar innehåll. Efteråt går det inte att växla. | En incheckning som blev privat måste raderas och göras om för att bli offentlig. |
| Lagring | Offentliga inlägg i `posts/{groupId}`, privata i `journalEntries/{uid}`. Offentliga incheckningar i `checkIns/{groupId}`, privata i `privateCheckIns/{uid}` + dagbokspost. | Två separata lagringsplatser. En växel måste flytta posten, inte bara sätta en flagga. |
| Regler | Tillåter alla sex `kind`-värden och fyra reaktionstyper. | Backend kan fortfarande ta emot gamla typer. |

### Varför växeln måste flytta data

Firebase Realtime Database-regler kan inte filtrera en lista per post. Om ett inlägg ligger kvar i `posts/{groupId}` med `visibility: "private"` kan alla i gruppen fortfarande läsa det. Därför måste ett privat inlägg ligga i `journalEntries/{uid}` och ett offentligt i `posts/{groupId}`. Växeln flyttar posten mellan dessa två platser i en atomisk uppdatering. Samma sak gäller incheckningar.

Det här är också förklaringen till att vi inte bara lägger till ett `visibility`-fält på `Post`: det skulle se privat ut i appen men inte vara privat på riktigt.

---

## 3. Målbild

### 3.1 Två inläggstyper

| Typ | Etikett SV | Etikett EN | Innehåll |
|---|---|---|---|
| `post` | Inlägg | Post | Text, valfri bibelvers, valfri röstanteckning. Ingen rubrik. |
| `prayer_request` | Bön | Prayer request | Valfri rubrik, bönetext, valfri bibelvers, valfri röstanteckning. |

Allt annat blir `post`:

| Gammalt värde | Nytt värde | Kommentar |
|---|---|---|
| `reflection` | `post` | Vanlig reflektion blir vanligt inlägg. |
| `praise` | `post` | Tacksägelsen ligger kvar som text. |
| `scripture` | `post` | Bibelversen ligger kvar på inlägget. |
| `update` | `post` | Används bara av äldre dagboksincheckningar; blir inlägg om den delas. |
| `prayer_moment` | `post` | Systemgenererad “Bön genomförd” blir ett vanligt inlägg. Om den är tom på innehåll kan den döljas i flödet, men raderas inte. |

### 3.2 Gillningar

- En gillning är en `postReaction` med `kind: "like"`.
- Samma medlem kan bara gilla samma inlägg/incheckning en gång. Databas-ID:t blir `${uid}_${targetType}_${targetId}_like`.
- Knappen visar **hjärta + antal**. Antalet är antal unika medlemmar som gillat.
- Tryck: hjärtat fylls, knappen får en mjuk rosa yta, siffran bumpar till nästa värde och sju små hjärtan sprängs ut.
- Tryck igen: hjärtat blir kontur, antalet minskar, inga hjärtan sprängs.
- Gilla skickar ingen notis i v1. Det håller flödet lugnt och undviker notisspam.

### 3.3 Privat/offentligt

Samma växel gäller för:

- inlägg (inklusive böneämnen),
- incheckningar.

Den finns:

1. **I skrivfönstret** innan man publicerar.
2. **På detaljsidan** för den som äger innehållet.
3. **I ägarmenyn** som genväg: “Gör privat” / “Gör offentlig”.

Växeln är en tvådelad kontroll, inte en liten switch:

```
┌─────────────────┬─────────────────┐
│  🔒  Privat     │  🌐  Offentlig  │
└─────────────────┴─────────────────┘
Endast du kan se detta.
```

eller, när offentlig är vald:

```
┌─────────────────┬─────────────────┐
│  🔒  Privat     │  🌐  Offentlig  │
└─────────────────┴─────────────────┘
Synligt för medlemmarna i KOINOIA.
```

### 3.4 Incheckningar

- En offentlig incheckning ligger i `checkIns/{groupId}` och syns i communityflödet.
- En privat incheckning ligger i `privateCheckIns/{uid}` och har en spegel i dagboken (`journalEntries` med `source: "private_check_in"`), precis som i dag.
- Växeln flyttar incheckningen mellan dessa två lagringsplatser. Den uppdaterar också `checkInDailyClaims` så att “en incheckning per dag” fortsätter gälla.
- En privat incheckning som publiceras behåller sin dagboksspegel som “delad med communityn”, så historiken finns kvar även om den skulle bli privat igen.

---

## 4. UX och design

### 4.1 Skrivfönstret

**Före:** fyra knappar i två rader (Reflection, Prayer request, Praise, Scripture).

**Efter:** två knappar i en rad:

```
┌──────────────────────┬──────────────────────┐
│  ✎  Inlägg           │  ♥  Bön              │
└──────────────────────┴──────────────────────┘
Dela en tanke, en bibelvers eller något från din vardag.
```

Regler:

- **Inlägg** är vald som standard.
- **Bön** behåller rubrikfältet “Rubrik för böneämnet (valfri)”.
- **Inlägg** har inget rubrikfält.
- Båda har textfält (max 500 tecken), valfri bibelvers och valfri röstanteckning.
- Ett inlägg får bestå av bara en bibelvers, eller bara en röstanteckning, om texten är tom. Det matchar dagens `scripture`-beteende utan att kräva en egen typ.
- Primärknappen byter text:
  - offentligt inlägg: **Dela inlägg**
  - privat inlägg: **Spara privat**
  - offentlig bön: **Dela bön**
  - privat bön: **Spara bön**
- Beskrivningsraden under växeln byter mellan “Endast du kan se detta.” och “Synligt för medlemmarna i {community}.”
- Växeln ligger direkt under rubriken, före textfältet, så att valet görs först.

### 4.2 Kort i flödet

| Typ | Rubrik | Brödtext | Åtgärder |
|---|---|---|---|
| Inlägg | Ingen typetikett. Visar bara författare och tid. | Text, vers, röst. | Hjärta + antal, kommentar + antal. |
| Bön | “Böneämne” med böneikon. | Rubrik om den finns, sedan bön och vers. | Be + bönantal, kommentar + antal. |
| Incheckning | “Incheckning” med check-ikon. | Humörkort och text. | Hjärta + antal, kommentar + antal. |

Det gamla `CommunityCardResponseSummary` för reaktioner tas bort; antalet sitter i hjärtat. Bönens räknare och avatarlista finns kvar som egen rad.

På detaljsidan:

- Gilla-knappen är större och visar hjärta + antal.
- Om antalet är > 0 visas avatarna för dem som gillat under knappen, med texten “{count} gillningar”.
- Kommentarsrubriken heter **Kommentarer** i stället för “Uppmuntringar”.
- En privat post som öppnas från dagboken visar växeln och en rad “Delad med {community}” när den är offentlig.

### 4.3 Gilla-knappen

**Anatomi**

```
┌────────────────────┐
│  ♥   12            │
└────────────────────┘
```

- Minst 44 dp hög.
- Hjärtat är 18–20 px.
- Siffran använder tabular numerals så att den inte hoppar när den ändras.
- Oval/pill-form med 1 px kant och `radius.md`.
- Ogillad: vit kortbakgrund, grå kontur, grått hjärta, mörk siffra.
- Gillad: `colors.roseSurface`-bakgrund, rosa kant, fyllt hjärta i `colors.rose`, siffra i `colors.rose`.
- I mörkt tema används temats rosa toner, aldrig hårdkodade färger.

**Animation när man gillar**

| Tid | Händelse |
|---:|---|
| 0 ms | Haptik: `Haptics.impactAsync(Light)` |
| 0 ms | Hjärtat fylls direkt. Siffran byts till +1. |
| 0–90 ms | Hjärtat skalar 1 → 1.28. |
| 90–320 ms | Fjäder tillbaka till 1. |
| 0–650 ms | Sju små hjärtan färdas utåt i en solfjäder, 24–44 px, tonar ut. |
| 0–650 ms | Partiklarna roterar lätt och skalar 0,6 → 1,1 → 0,8. |
| 0–250 ms | Knappens bakgrund tonar in från genomskinlig till rosa. |

**Animation när man ogillar**

- Inget hjärtregn.
- Hjärtat krymper 1 → 0,9 → 1 på 160 ms.
- Siffran byts till −1.
- Ingen haptik, eller en mycket lätt `selectionAsync`.

**Teknisk lösning**

- Ny komponent `ui/like-button.tsx`.
- Använder `Animated` från React Native (samma teknik som `prayer-moment.tsx` och `room-code-copy.tsx`), inte en ny native-modul.
- Partiklarna ligger i en `Animated.View` med `pointerEvents="none"` och `overflow: "visible"`.
- Varje partikel får en fast vinkel och distans baserad på index, så att de inte hoppar vid omrendering.
- `useReducedMotion()`: hoppa över partiklar och fjäder; byt bara fyllning och siffra. Detta är ett krav, inte en eftertanke.
- `accessibilityRole="button"`, `accessibilityState={{ selected: liked }}`, `accessibilityLabel` som “Gilla. 12 gillningar” / “Gillad. 13 gillningar”.
- `accessibilityLiveRegion="polite"` på siffran så att skärmläsaren får det nya antalet, men inte en hel harang.
- Optimistisk uppdatering: hjärtat och siffran ändras direkt; om skrivningen misslyckas rullas det tillbaka och en liten rad visar “Kunde inte spara gillningen.”

### 4.4 Privat/offentligt-växeln

**Anatomi**

- 44 dp hög, två lika stora segment, rundad pill.
- Vänster: låsikon + “Privat”.
- Höger: globe-/personikon + “Offentlig”.
- En mjuk thumb glider mellan segmenten med fjäder (cirka 260 ms).
- Vald sida: mörk text på ljus yta; ovald sida: dämpad text.
- När offentlig är vald visas communityns bild och namn i hjälpraden; när privat är vald visas ett lås.
- Haptik: `selectionAsync` vid byte.
- Reduced motion: ingen glidning, bara ett direkt byte.

**Beteende**

- Nytt innehåll: växeln styr om det sparas i dagboken eller publiceras i communityn.
- Befintligt innehåll: växeln visar nuvarande läge och flyttar innehållet vid tryck.
- Om medlemmen inte är med i någon community: “Offentlig” är disabled och hjälpraden säger “Gå med i en gemenskap först.”
- Medan flytten pågår: växeln är disabled och visar en liten spinner i den valda sidan.
- Vid fel: växeln går tillbaka till föregående läge och en tydlig felrad visas.

**Bekräftelse och ångra**

- **Privat → offentlig:** ingen bekräftelse. Det är inte destruktivt. En toast visar “Delad med {community}”.
- **Offentlig → privat utan kommentarer/gillningar:** flytta direkt och visa en toast med **Ångra** i 6 sekunder.
- **Offentlig → privat med kommentarer eller gillningar:** en bottom sheet förklarar exakt vad som händer:
  - “Gör inlägget privat?”
  - “3 kommentarer och 5 gillningar tas bort från gemenskapen. Inlägget sparas privat i din dagbok.”
  - Knappar: **Gör privat** och **Avbryt**.
- **Offentlig incheckning → privat:** samma regel. En incheckning med gillningar/kommentarer kräver bekräftelse.
- Efter en lyckad privat-flytt från communitydetaljen: gå tillbaka till flödet och visa toasten “Sparat privat i din dagbok” med en genväg “Öppna dagboken”.

**Var växeln syns**

| Yta | Vem ser den | Vad den gör |
|---|---|---|
| Skrivfönster för inlägg/bön | Alla | Väljer privat eller offentlig innan publicering. |
| Communitydetalj för inlägg | Ägaren | Växlar ett befintligt inlägg. |
| Dagboksdetalj för inlägg | Ägaren | Publicerar ett privat inlägg eller gör det privat igen. |
| Incheckningsmodal | Alla | Väljer privat eller offentlig. |
| Communitydetalj för incheckning | Ägaren | Växlar en befintlig incheckning. |
| Dagboksdetalj för privat incheckning | Ägaren | Publicerar incheckningen i communityn. |
| Ägarmenyn | Ägaren | Genväg “Gör privat” / “Gör offentlig”. |

### 4.5 Copy

| Nyckel | Svenska | English |
|---|---|---|
| `community.composer.type.post` | Inlägg | Post |
| `community.composer.type.prayer` | Bön | Prayer request |
| `community.composer.share.description.post` | Dela en tanke, en bibelvers eller något från din vardag. | Share a thought, a Bible verse, or something from your day. |
| `community.composer.share.description.prayer_request` | Låt din gemenskap be med dig. | Let your community pray with you. |
| `community.composer.action.sharePost` | Dela inlägg | Share post |
| `community.composer.action.savePostPrivate` | Spara privat | Save privately |
| `community.composer.action.sharePrayer` | Dela bön | Share prayer |
| `community.composer.action.savePrayerPrivate` | Spara bön privat | Save prayer privately |
| `community.like.default` | Gilla | Like |
| `community.like.completed` | Gillad | Liked |
| `community.like.count.one` | {count} gillning | {count} like |
| `community.like.count.other` | {count} gillningar | {count} likes |
| `community.like.error` | Kunde inte spara gillningen. | Could not save your like. |
| `community.like.accessibility` | Gilla. {count} gillningar. | Like. {count} likes. |
| `community.like.accessibilityLiked` | Gillad. {count} gillningar. | Liked. {count} likes. |
| `community.visibility.title` | Vem kan se detta? | Who can see this? |
| `community.visibility.private` | Privat | Private |
| `community.visibility.public` | Offentlig | Public |
| `community.visibility.privateHint` | Endast du kan se detta. | Only you can see this. |
| `community.visibility.publicHint` | Synligt för medlemmarna i {community}. | Visible to members of {community}. |
| `community.visibility.noCommunity` | Gå med i en gemenskap först. | Join a community first. |
| `community.visibility.makePrivateTitle` | Gör inlägget privat? | Make this post private? |
| `community.visibility.makeCheckInPrivateTitle` | Gör incheckningen privat? | Make this check-in private? |
| `community.visibility.engagementWarning` | {comments} kommentarer och {likes} gillningar tas bort från gemenskapen. Innehållet sparas privat i din dagbok. | {comments} comments and {likes} likes will be removed from the community. The content is saved privately in your journal. |
| `community.visibility.makePrivate` | Gör privat | Make private |
| `community.visibility.makePublic` | Gör offentlig | Make public |
| `community.visibility.savedPrivate` | Sparat privat i din dagbok. | Saved privately in your journal. |
| `community.visibility.shared` | Delad med {community}. | Shared with {community}. |
| `community.visibility.undo` | Ångra | Undo |
| `community.reply.heading` | Kommentarer | Comments |
| `community.reply.placeholder` | Skriv en kommentar... | Write a comment... |
| `notifications.owner.post` | {name} kommenterade ditt inlägg | {name} commented on your post |
| `notifications.owner.prayerRequest` | {name} svarade på ditt böneämne | {name} responded to your prayer request |
| `notifications.owner.checkIn` | {name} kommenterade din incheckning | {name} commented on your check-in |

Alla gamla `encourage`- och `uppmuntra`-strängar som avser reaktionen tas bort. Kvarvarande “uppmuntran” i löpande text om böner eller själavård kan vara kvar, men inte som namn på en knapp eller räknare.

---

## 5. Datamodell och backend

### 5.1 Typer

```ts
// Ny kanonisk typ. Bara dessa två skrivs av nya klienter.
export type PostKind = "post" | "prayer_request";

// Läses men skrivs aldrig av nya klienter. Används för att visa gamla poster.
export type LegacyPostKind =
  | "reflection"
  | "prayer_moment"
  | "praise"
  | "update"
  | "scripture";

export type StoredPostKind = PostKind | LegacyPostKind;

export type Post = {
  id: Id;
  userId: Id;
  groupId: Id;
  kind: StoredPostKind;
  title?: string;
  body: string;
  verse?: BibleVerse;
  verses?: BibleVerse[];
  images?: string[];
  audio?: AudioClip;
  answeredAt?: string;
  answeredMarkedAt?: string;
  answeredUpdate?: string;
  createdAt: string;
};

export type PostReaction = {
  id: Id;
  userId: Id;
  targetType: "post" | "check_in";
  targetId: Id;
  kind: "like";
  createdAt: string;
};

export type JournalEntry = {
  // ...befintliga fält
  isPrivate?: boolean;
  sharedPostId?: Id;       // befintligt: offentlig post som hör till dagboksposten
  sharedCheckInId?: Id;    // nytt: offentlig incheckning som hör till dagboksposten
  linkedCheckInId?: Id;    // nytt: privat incheckning som speglas i dagboken
};
```

`normalizePostKind(kind)` mappar allt utom `prayer_request` till `post`. All UI använder den, aldrig rå `kind` direkt.

### 5.2 Lagring och flytt

| Innehåll | Privat | Offentlig |
|---|---|---|
| Inlägg | `journalEntries/{uid}/{entryId}` | `posts/{groupId}/{postId}` |
| Incheckning | `privateCheckIns/{uid}/{checkInId}` + `journalEntries/{uid}/{entryId}` | `checkIns/{groupId}/{checkInId}` |
| Kommentarer | följer den offentliga posten | `replies/{groupId}` |
| Gillningar | följer den offentliga posten | `postReactions/{groupId}` |
| Böner | följer den offentliga posten | `prayerReactions/{groupId}` |

**State machine för inlägg**

```
Endast offentlig (P)
  └─ Gör privat → skapa J (isPrivate: true), radera P + barn

J privat (isPrivate: true, ingen sharedPostId)
  └─ Gör offentlig → skapa P, sätt J.isPrivate = false, J.sharedPostId = P.id

J delad (isPrivate: false, sharedPostId = P.id)
  └─ Gör privat → radera P + barn, sätt J.isPrivate = true, rensa sharedPostId
```

**State machine för incheckning**

```
C offentlig (checkIns)
  └─ Gör privat → flytta C till privateCheckIns (visibility: "private"),
                   skapa/uppdatera J (source: "private_check_in", linkedCheckInId = C.id),
                   radera C + barn, uppdatera checkInDailyClaims.visibility = "private"

C privat + J
  └─ Gör offentlig → flytta C till checkIns (visibility: "group"),
                     radera privateCheckIns-posten,
                     sätt J.isPrivate = false, J.sharedCheckInId = C.id,
                     uppdatera checkInDailyClaims.visibility = "group"
```

Alla flyttar görs som **en** `update(ref(database), {...})` med alla berörda sökvägar. Det är avgörande: annars kan ett inlägg försvinna mellan två skrivningar.

`deleteFeedItemWithChildren` i `state/store/feed-operations.ts` byggs ut med en valfri `extraWrites`-parameter, så att radering av posten + skapandet av dagboksposten blir en atomisk operation.

**Ljud**

- Ett offentligt inläggs ljud ligger i gruppens bucket; ett privat i användarens.
- Vid flytt kopieras ljudet med en ny `copyAudioForPrivate` (motsvarigheten till dagens `copyAudioForShare`) innan databasskrivningen.
- Om kopian misslyckas avbryts flytten och inget raderas.
- Efter lyckad flytt städas det gamla ljudet.

**Dagboksspegeln**

- En privat incheckning har redan en dagbokspost. Den behålls när incheckningen publiceras och markeras som delad (`isPrivate: false`, `sharedCheckInId`).
- En offentlig post som görs privat får en ny dagbokspost. Om den senare publiceras igen återanvänds samma dagbokspost.
- Om dagboksposten är en privat incheckning (`source: "private_check_in"` eller `linkedCheckInId`) publicerar växeln incheckningen i stället för att skapa ett inlägg.
- `journalEntryHasSharedCopy` utökas till att kontrollera både `sharedPostId` och `sharedCheckInId`, och att det faktiskt finns en levande post/incheckning. Om den offentliga kopian är borta behandlas dagboksposten som privat.

### 5.3 Databasregler

**Nya tillåtna värden**

- `posts.kind`: endast `"post"` eller `"prayer_request"`.
- `postReactions.kind`: endast `"like"`.
- `postReactions.id`: `${uid}_${targetType}_${targetId}_like`.
- `journalEntries.entryKind`: endast `"post"` eller `"prayer_request"` för nya skrivningar. `journalType` behåller dagbokens egna kategorier (`reflection`, `prayer`, `answered_prayer`, `heart_checkin`, `scripture_note`) så att gamla dagboksposter fortfarande visar rätt etikett.

**Nya dagboksfält**

Lägg till validering för `sharedCheckInId` och `linkedCheckInId` i `journalEntries` (samma mönster som `sharedPostId`).

**Regler som redan passar**

- `posts` är läsbara för gruppmedlemmar och skrivbara av ägaren.
- `journalEntries` är endast läsbara/skrivbara av ägaren.
- `checkIns` är läsbara för gruppmedlemmar och skrivbara av ägaren.
- `privateCheckIns` är endast läsbara/skrivbara av ägaren.
- `checkInDailyClaims` är endast läsbara/skrivbara av ägaren.

**Filer**

- `firebase.legacy.rules.json` — källa för de gamla toppnivåreglerna.
- `scripts/generate-encryption-rules.mjs` — genererar `firebase.rules.json`.
- `firebase.rules.json` — genereras, checkas in och deployas.

I generatorn läggs en specialregel för `posts.kind` och `postReactions.kind`, eftersom `encryptedData` i dag använder generisk `$field`-validering. Det ger ett riktigt backend-skydd även för den aktiva plaintext-modellen.

### 5.4 Migration

Ett engångsskript, `scripts/migrate-posts-likes.mjs`, körs med Firebase Admin:

1. **Backup först.** Exportera berörda `encryptedData/posts`, `encryptedData/postReactions` och `encryptedData/journalEntries` per användare/grupp till en tidsstämplad JSON-fil.
2. **Normalisera inlägg.** Alla `kind` som inte är `prayer_request` blir `post`. Poster utan `kind` blir `post`.
3. **Normalisera reaktioner.** Gruppera per `userId + targetType + targetId`. Behåll den äldsta, sätt `kind: "like"`, byt ID till `${uid}_${targetType}_${targetId}_like`, radera dubbletter.
4. **Normalisera dagbokens `entryKind`.** `prayer_request`/`prayer_moment` blir `prayer_request`; allt annat blir `post`. `journalType` lämnas orört så att dagboksetiketterna (bönesvar, bibelanteckning, hjärtcheck) finns kvar.
5. **Backfilla dagbokslänkar.** För äldre privata incheckningar: sätt `linkedCheckInId` genom att matcha `source: "private_check_in"` och `createdAt`. För delade dagboksposter finns `sharedPostId` redan.
6. **Rapportera.** Antal poster som ändrats, antal reaktioner som slagits ihop, antal dagboksposter som normaliserats och antal länkar som lagts till.

Skriptet har `--dry-run` som standard och `--apply` för att skriva. Det körs mot emulator först, sedan `koino-dev`, sedan `koino-codex`.

### 5.5 Notiser och statistik

- `ActivityNotification.contentLabel` krymps till `"post" | "prayer request" | "check-in"`.
- `state/encryption/notifications.ts` mappar alla gamla `kind` till `"post"`, förutom `prayer_request`.
- `app/notifications.tsx` tar bort de gamla etiketterna och använder `notifications.owner.post`, `prayerRequest` och `checkIn`.
- `functions/src/community-statistics.ts` rapporterar bara `post` och `prayer_request` i `byKind`. Testet uppdateras.
- Inga nya Cloud Functions krävs för gillningar eller växeln. Allt sker i klienten med regler och atomiska skrivningar.

---

## 6. Genomförande

### Fas 0 — Förberedelse

- [ ] Branch `feat/posts-likes-privacy` från `main`.
- [ ] Spara nuvarande `firebase.rules.json` som referens för rollback.
- [ ] Kör baseline: `npm run typecheck`, `npm run typecheck:functions`, `npm run test:functions`, `npm run validate:community-navigation`.
- [ ] Skapa en kort checklista för manuell test på Pixel 11 Pro mot `koino-dev`.

### Fas 1 — Typer och normalisering

- [ ] `state/types.ts`: `PostKind`, `LegacyPostKind`, `StoredPostKind`; `PostReaction.kind = "like"`; nya `JournalEntry`-fält.
- [ ] `state/product.ts`: `communityPostTypes` med bara `post` och `prayer_request`; `normalizePostKind`; ta bort `praise`/`scripture`/`update`/`prayer_moment` från UI-konstanter.
- [ ] `state/selectors/community-content.ts`: rendera alla gamla kind som `post`; tillåt vers-only-inlägg.
- [ ] `state/store/helpers.ts`: `validPostContent` för `post` och `prayer_request`; vers-only tillåts för `post`.
- [ ] `state/store/types.ts`: nya actions för gillning och synlighet.
- [ ] Alla ställen som läser `post.kind` direkt byts till `normalizePostKind(post.kind)`.

### Fas 2 — Backend och migration

- [ ] `firebase.legacy.rules.json`: `posts.kind`, `postReactions.kind`, reaktions-ID, `journalEntries.entryKind`, nya dagboksfält.
- [ ] `scripts/generate-encryption-rules.mjs`: specialvalidering för `posts.kind` och `postReactions.kind`.
- [ ] Kör `npm run encryption:rules` och granska diffen i `firebase.rules.json`.
- [ ] `scripts/migrate-posts-likes.mjs` med dry-run, backup och apply.
- [ ] `scripts/validate-database-emulator.mjs`: nya regeltester.
- [ ] `scripts/validate-community-moderation*.mjs`: uppdatera gamla kind-värden.
- [ ] `functions/src/community-statistics.ts` och dess test.

### Fas 3 — Gillningar

- [ ] Ny `ui/like-button.tsx` med animation, reduced motion och accessibility.
- [ ] `state/koino-store.tsx`: `togglePostLike` med optimistisk uppdatering, dubblettskydd och rollback.
- [ ] `state/koino-store.tsx`: räkna unika användare per target, oavsett gammalt `kind`.
- [ ] `features/settings-screen.tsx`: `itemReactionState` grupperar på target, inte kind.
- [ ] `ui/post-card.tsx`: byt reaktionsknappen mot `LikeButton`; ta bort gamla ikoner och etiketter.
- [ ] `features/feed-detail-screen.tsx`: byt reaktionsknapp och räkning.
- [ ] `features/community/check-ins.tsx`, `prayer-screens.tsx`, `features/home-screen.tsx`: samma byte.
- [ ] `ui/community-copy.ts`: ta bort `communityActionLabel` för gamla typer; en gemensam gilla-copy.
- [ ] `ui/translations/en.ts` och `sv.ts`: alla nya nycklar, alla gamla encourage-nycklar bort.
- [ ] `ui/written-encouragement-composer.tsx` → `ui/written-reply-composer.tsx`; kommentarspråk i alla anrop.

### Fas 4 — Skrivfönstret och inläggstyperna

- [ ] `ui/shared-composer.tsx`: två alternativ; ta bort `journalPostTypes`, `journalScripturePostTypes`, `scriptureRequired`, `titleFreeCommunityKind` och alla praise/scripture-grenar.
- [ ] `shared-composer`: beskrivning, rubrik, brödtext och primärknapp per typ.
- [ ] `shared-composer`: visa privat/offentligt-växeln även i community-kontext.
- [ ] `features/settings-screen.tsx`: `openComposer("post")`; ta bort `update`-spärren; `submitComposer` skickar privat innehåll till `createJournalEntry`.
- [ ] `features/feed-detail-screen.tsx`: ta bort `isPraise`, `isScripture`, `openScriptureReflection` och de fyra specialgrenarna.
- [ ] `features/home-screen.tsx`: ta bort scripture-specialvisning; vanliga inlägg visar text/vers.
- [ ] `features/community/feed-helpers.ts`: “Reflections”-fliken tas bort; “Senaste” och “Bön” räcker, plus incheckningar i sin egen vy.
- [ ] `ui/post-card.tsx`: typetikett endast för böneämne och incheckning.
- [ ] `state/product.ts`: `roomTabs` utan `reflections`; `communityRoomTabLabel` uppdateras.

### Fas 5 — Privat/offentligt

- [ ] Ny `ui/visibility-toggle.tsx` med animation, haptik, disabled-läge och reduced motion.
- [ ] Ny `ui/visibility-confirm-sheet.tsx` (eller utökad `BottomSheet`) för varning vid kommentarer/gillningar.
- [ ] `state/koino-store.tsx`: `setPostVisibility`, `setJournalVisibility`, `setCheckInVisibility`.
- [ ] `state/store/feed-operations.ts`: `extraWrites` i `deleteFeedItemWithChildren`.
- [ ] `state/audio-storage.ts`: `copyAudioForPrivate`.
- [ ] `state/koino-store.tsx`: uppdatera `checkInDailyClaims` i samma multi-path-update.
- [ ] `features/check-in-modal.tsx`: byt nuvarande share-kort mot `VisibilityToggle`.
- [ ] `features/settings-screen.tsx`: visa växeln i skrivfönstret och i communitydetaljen för ägaren; ägarmenyn får “Gör privat/offentlig”.
- [ ] `features/feed-detail-screen.tsx`: visa växeln för ägaren; navigera tillbaka efter privat-flytt.
- [ ] `features/journal-detail-screen.tsx`: visa växeln för ägaren; publicera privat post eller incheckning.
- [ ] `features/community/check-ins.tsx`: visa växeln i detalj/ägarmeny.
- [ ] `features/journal-screen.tsx`: `journalTypeForKind` mappar bara `post` och `prayer_request`; gamla dagboksposter visar sin ursprungliga typ.
- [ ] `ui/translations/en.ts` och `sv.ts`: all copy för växeln, varningen, toasten och ångra.

### Fas 6 — Städning

- [ ] Ta bort `prayer_moment`-genererad copy om den inte längre kan skapas; gamla poster renderas som `post`.
- [ ] Ta bort `community.response.encouragement.*`, `community.detail.encouragementsHeading`, `community.action.reflection.*`, `community.action.praise.*`, `community.action.scripture.*`, `community.action.update.*`.
- [ ] Ta bort `community.contentType.praise/scripture/update/prayerMoment`, `community.defaultTitle.praise/scripture/update/prayerMoment`, `community.composer.type.praise/update/scripture`.
- [ ] Ta bort `prayer_moment`-grenar i `ui/community-copy.ts`, `ui/post-card.tsx`, `features/feed-detail-screen.tsx`, `features/settings-screen.tsx`, `state/selectors/community-content.ts`.
- [ ] Uppdatera `docs/community-1-0-final-acceptance.md` och andra dokument som nämner Encourage/Amen/Reflect.
- [ ] Säkerställ att ingen användarsynlig text säger “Encourage”, “Uppmuntra”, “Amen”, “Reflect” eller “Respond” om det avser en gillning.

### Fas 7 — Tester och utrullning

- [ ] Alla tester i avsnitt 7.
- [ ] Manuell test på Pixel 11 Pro mot `koino-dev` med två konton.
- [ ] EAS Update till `koino-dev`-klienten.
- [ ] Migration mot `koino-dev`, verifiera i appen.
- [ ] EAS Update till produktion, migration mot `koino-codex`, regler till båda.
- [ ] Verifiera med ett färskt konto och ett konto med gamla inlägg.

---

## 7. Testplan

### 7.1 Enhetstester

- `normalizePostKind`: reflection/praise/scripture/update/prayer_moment → post; prayer_request → prayer_request.
- `validPostContent`: post med bara vers; post med bara ljud; post med text; bön med text; bön utan text men med ljud; tom post avvisas.
- Gilla-räkning: samma användare med två gamla reaktioner på samma target räknas en gång.
- Gilla-toggle: av → på → av; optimistisk state och rollback.
- Synlighets-state machine: alla fyra övergångar för inlägg och incheckning.
- `checkInExistsForDay` efter flytt: en incheckning per dag, oavsett privat/offentlig.
- `journalEntryHasSharedCopy`: sharedPostId, sharedCheckInId, saknad offentlig kopia.

### 7.2 Regel-emulator

- Skapa `post` med `kind: "post"` → tillåts.
- Skapa `post` med `kind: "prayer_request"` → tillåts.
- Skapa `post` med `kind: "praise"` → nekas.
- Skapa `postReaction` med `kind: "like"` → tillåts.
- Skapa `postReaction` med `kind: "reflection"` → nekas.
- Skapa gillning med fel ID-format → nekas.
- Göra en public post privat som ägare → tillåts; som annan medlem → nekas.
- Publicera en privat dagbokspost → tillåts endast av ägaren.
- Flytta en privat incheckning till offentlig → tillåts endast av ägaren; claim uppdateras.
- Läsa en privat dagbokspost som annan medlem → nekas.
- Läsa en privat incheckning som annan medlem → nekas.

### 7.3 UI-kontrakt

- Skrivfönstret visar exakt två val: Inlägg och Bön.
- Inga gamla typknappar finns kvar.
- Primärknappen byter text med typ och synlighet.
- Gilla-knappen visar hjärta och siffra, inte ordet “Encourage”.
- Gilla-knappen har `accessibilityState.selected`.
- Växeln visar Privat/Offentlig och rätt hjälprad.
- Växeln är disabled utan community.
- Bekräftelsesheet visas endast när det finns kommentarer eller gillningar.
- Toast med Ångra visas efter privat-flytt utan engagemang.

### 7.4 Manuellt på Pixel 11 Pro

Testa mot `koino-dev` med två konton (Alex och en testmedlem):

1. Skapa ett offentligt inlägg med text och vers. Kontrollera att det syns hos båda.
2. Gilla från båda. Kontrollera att antalet blir 2 och att hjärtat fylls.
3. Ogilla. Kontrollera att antalet blir 1.
4. Stäng appen, öppna igen. Kontrollera att gillningen ligger kvar.
5. Skapa ett privat inlägg. Kontrollera att det inte syns hos den andra medlemmen.
6. Öppna det privata inlägget i dagboken och gör det offentligt. Kontrollera att det syns hos båda.
7. Gör det offentliga inlägget privat igen. Kontrollera varningen om det finns kommentarer/gillningar, och att det hamnar i dagboken.
8. Skapa en privat incheckning. Gör den offentlig. Kontrollera att den syns i communityflödet och att dagboksspegeln visar “Delad med …”.
9. Gör incheckningen privat igen. Kontrollera att den försvinner från communityflödet och finns kvar i dagboken.
10. Kontrollera att “en incheckning per dag” fortfarande gäller efter båda flyttarna.
11. Testa reduced motion: inga hjärtpartiklar, ingen glidning.
12. Testa mörkt tema: hjärta, växel och kontraster.
13. Testa svenska och engelska: inga “Encourage”, “Amen” eller “Reflect” kvar.
14. Testa en gammal `praise`- och `scripture`-post: de visas som vanliga inlägg med vers och text.
15. Testa en gammal reaktion: den räknas som gillning och kan tas bort.

### 7.5 Regression

- `npm run typecheck`
- `npm run typecheck:functions`
- `npm run test:functions`
- `npm run validate:community-navigation`
- `npm run validate:community-moderation`
- `npm run validate:database-emulator`
- `npm run validate:community-leaders-emulator`
- `npm run validate:prayers`
- `npm run validate:check-in-persistence` (om den finns i er svit)
- `npm run validate:account-deletion`
- Alla tester som rör `postReactions`, `prayerReactions`, `posts`, `checkIns` och `journalEntries`.

---

## 8. Utrullning och återställning

### Ordning

1. **Klient först.** Publicera appuppdateringen med läsning av gamla värden och de nya vyerna. Reglerna är under tiden toleranta mot både gamla och nya värden, så att gamla installationer inte blockeras.
2. **Migration.** Kör backup, sedan `--apply` mot `koino-dev`. Verifiera. Kör mot `koino-codex` efter godkänd dev-test.
3. **Strama regler.** Deploya reglerna som bara tillåter `post`, `prayer_request` och `like`.
4. **Kompatibilitetsfönster.** Låt de gamla värdena vara läsbara tills nästa native-build är ute. Nya skrivningar med gamla värden blockeras först när de strama reglerna är live.

Eftersom KOINO ännu är i intern testning kan steg 1–3 göras samma dag, men ordningen ska vara klient → migration → strama regler. Annars kan en gammal klient skriva data som den nya klienten inte förstår.

### Återställning

- **App:** publicera föregående EAS Update-grupp.
- **Regler:** återställ `firebase.rules.json` från commit före ändringen och deploya.
- **Data:** migrationen sparar en JSON-backup per grupp. Ett `scripts/restore-posts-likes.mjs` kan skriva tillbaka `posts` och `postReactions` från backupen.
- **Privat-flytt:** eftersom innehållet kopieras till dagboken innan det offentliga raderas finns alltid en privat kopia kvar om något går fel.

---

## 9. Risker och motåtgärder

| Risk | Påverkan | Motåtgärd |
|---|---|---|
| Ett offentligt inlägg med kommentarer görs privat och kommentarerna försvinner | Medlemmen tappar samtal | Tydlig bekräftelse med exakta siffror; ingen tyst radering |
| Regler och klient hamnar i otakt | Gamla klienter kan inte skriva | Klient först, toleranta regler under övergången, strama regler sist |
| Flytten görs i två steg och tappar data | Innehåll försvinner | En atomisk multi-path-update; backup före migration |
| Ljud kopieras inte | Privat inlägg pekar på gruppens ljud-URL | `copyAudioForPrivate` före skrivning; avbryt vid fel |
| Dubbeltryck på hjärtat | Antalet hoppar eller går fel | Lås per target medan skrivningen pågår; optimistisk state med rollback |
| Samma incheckning kan skapas två gånger | “En per dag” bryts | `checkInDailyClaims` uppdateras i samma atomiska update; emulatortest |
| Gamla reaktioner med olika `kind` räknas dubbelt | Fel antal | Gruppera per användare + target och räkna unika användare |
| Gamla `prayer_moment`-poster blir tomma inlägg | Skräp i flödet | Migrera till `post`; dölj endast om body och vers saknas |
| Växeln ser ut att vara privat men data ligger kvar offentligt | Allvarligt integritetsfel | Fysisk flytt mellan collectioner; regler som nekar läsning av privata ytor |
| Store-uppdateringar i `validate-community-navigation` är stora | Risk för trasiga tester | Uppdatera testet i samma PR; kör det före varje deploy |

---

## 10. Tidsuppskattning

| Del | Uppskattning |
|---|---:|
| Fas 1–2: typer, regler, migration | 1 dag |
| Fas 3: gilla-komponent och store | 1 dag |
| Fas 4: skrivfönster och flödesrensning | 1 dag |
| Fas 5: privat/offentligt-växeln | 1–1,5 dag |
| Fas 6–7: städning, tester, Pixel-verifiering | 1 dag |
| **Totalt** | **4–5 arbetsdagar** för en utvecklare |

Med Noah på mobil, Sana på copy/design och Tess på QA parallellt: cirka 3 arbetsdagar till en verifierad dev-version, sedan en dag för produktion och efterkontroll.

---

## Appendix A — Migrering av gamla värden

| Gammalt | Nytt | Syns som |
|---|---|---|
| `reflection` | `post` | Vanligt inlägg |
| `praise` | `post` | Vanligt inlägg med tacksamhetstext |
| `scripture` | `post` | Vanligt inlägg med bibelvers |
| `update` | `post` | Vanligt inlägg (mest gamla dagboksincheckningar) |
| `prayer_moment` | `post` | “Bön genomförd” som vanligt inlägg |
| `prayer_request` | `prayer_request` | Böneämne |
| `postReaction.kind: reflection/praise/update/scripture` | `like` | Gilla |
| `journalEntries.entryKind: reflection/praise/scripture/update` | `post` | Dagboksposten behåller sin `journalType`-etikett |
| `journalEntries.entryKind: prayer_moment` | `prayer_request` | Dagboksposten behåller etiketten “Bön” |

---

## Appendix B — Kodskisser

### Gilla-knapp

```tsx
export function LikeButton({ count, liked, onPress }: LikeButtonProps) {
  const reduceMotion = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const burst = useRef(new Animated.Value(0)).current;

  function handlePress() {
    if (!liked && !reduceMotion) {
      burst.setValue(0);
      Animated.timing(burst, {
        toValue: 1,
        duration: 650,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.28, duration: 90, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 5, tension: 180, useNativeDriver: true }),
    ]).start();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  }

  return (
    <Pressable
      accessibilityLabel={liked ? t("community.like.accessibilityLiked", { count }) : t("community.like.accessibility", { count })}
      accessibilityRole="button"
      accessibilityState={{ selected: liked }}
      onPress={handlePress}
      style={liked ? styles.liked : styles.idle}
    >
      <View>
        <Animated.View style={{ transform: [{ scale }] }}>
          <Ionicons name={liked ? "heart" : "heart-outline"} size={19} color={liked ? colors.rose : colors.muted} />
        </Animated.View>
        {!reduceMotion ? <HeartBurst progress={burst} /> : null}
      </View>
      <Text style={[typography.label, { fontVariant: ["tabular-nums"] }]}>{count}</Text>
    </Pressable>
  );
}
```

### Synlighetsväxel

```tsx
export function VisibilityToggle({ value, communityName, disabled, onChange }: VisibilityToggleProps) {
  const progress = useSharedValue(value === "group" ? 1 : 0);
  useEffect(() => {
    progress.value = withSpring(value === "group" ? 1 : 0, { damping: 18, stiffness: 220 });
  }, [value]);
  const thumb = useAnimatedStyle(() => ({
    transform: [{ translateX: `${progress.value * 100}%` }],
  }));

  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={t("community.visibility.title")}>
      <View style={styles.track}>
        <Animated.View style={[styles.thumb, thumb]} />
        <VisibilityOption icon="lock" label={t("community.visibility.private")} selected={value === "private"} onPress={() => onChange("private")} />
        <VisibilityOption icon="globe" label={t("community.visibility.public")} selected={value === "group"} onPress={() => onChange("group")} />
      </View>
      <Text style={styles.hint}>
        {value === "group" ? t("community.visibility.publicHint", { community: communityName }) : t("community.visibility.privateHint")}
      </Text>
    </View>
  );
}
```

### Atomisk flytt av inlägg

```ts
async function makePostPrivate(post: Post, entry?: JournalEntry) {
  const journalEntry = entry ?? buildJournalEntryFromPost(post);
  await deleteFeedItemWithChildren(post.groupId, "post", post.id, post.userId, {
    [`journalEntries/${post.userId}/${journalEntry.id}`]: journalEntry,
  });
  setPosts((current) => current.filter((item) => item.id !== post.id));
  setJournalEntries((current) => [...current, journalEntry]);
}
```

### Tillståndstabell

| Åtgärd | Skriver | Raderar | Uppdaterar |
|---|---|---|---|
| Inlägg → privat | `journalEntries/{uid}/{id}` | `posts/{groupId}/{id}`, `replies`, `postReactions`, `prayerReactions` | lokal state |
| Inlägg → offentlig | `posts/{groupId}/{id}` | — | `journalEntries/{uid}/{id}` (isPrivate, sharedPostId) |
| Incheckning → privat | `privateCheckIns/{uid}/{id}`, `journalEntries/{uid}/{id}` | `checkIns/{groupId}/{id}` + barn | `checkInDailyClaims` |
| Incheckning → offentlig | `checkIns/{groupId}/{id}` | `privateCheckIns/{uid}/{id}` | `journalEntries` (sharedCheckInId), `checkInDailyClaims` |

---

## Appendix C — Vad vi medvetet inte gör

- Vi inför inte ett `visibility`-fält på offentliga poster. Det skulle se privat ut men inte vara det.
- Vi bygger inte ett eget kommentarssystem för privata inlägg. Dagboken har sin text; kommentarerna hör till det offentliga inlägget.
- Vi lägger inte till gilla-notiser i v1.
- Vi ändrar inte böneflödet, bönräknaren eller böneämnets status (öppen/besvarad).
- Vi rör inte Bible reader, events, fasting eller donationer.
