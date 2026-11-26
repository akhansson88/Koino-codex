# KOINO — Röstböner och röstdagbok

**Implementation plan**  
26 November 2026 · proposal for review  
Owner: MausBot (Chief of Staff) with Noah (mobile), Sana (product/design), Tess (QA), Kai (lead)

---

## 1. Beslutet i korthet

Vi bygger tre saker på samma tekniska grund:

1. **Röstdagbok** — en privat dagbokspost som är ett ljudklipp i stället för, eller tillsammans med, text.
2. **Röstbön** — en bön som spelas in och kan skickas till den man ber för, som ett personligt svar på en böneförfrågan.
3. **Röst i gemenskapen** — en böneförfrågan, lovsång eller reflektion kan ha ett ljudklipp som alla i gemenskapen kan lyssna på.

Alla tre använder exakt samma `AudioClip`, samma inspelare, samma vågform och samma uppspelning. Det håller koden liten och gör upplevelsen konsekvent.

| Fråga | Beslut | Varför |
|---|---|---|
| Format | **AAC-LC, 32 kbit/s, mono, 24 kHz, `.m4a`** | Bästa kompromissen mellan storlek, talskvalitet och uppspelning på både iOS och Android. |
| Böneförfrågan | max **3:00** | En bön hinner bli personlig utan att bli en ljudbok. 720 kB. |
| Röstbön som svar | max **1:00** | Kort, nära och personligt. 240 kB. |
| Röstdagbok | max **5:00** | En dagbokspost kan få ta lite mer plats. 1,2 MB. |
| Uppspelning | Direkt i flödet, en gemensam spelare | Ingen autoplay, inga överraskande ljud. |
| Lagring | **Privat Firebase Storage-bucket** + signerade URL:er från en Cloud Function | Ljudet ligger aldrig som base64 i Realtime Database. Bara den som har rätt till klippet får en URL. |
| Vågform | **48 staplar**, verklig metering, Reanimated | Ser ut och känns som en röst, inte som en dekoration. |
| Nya native-moduler | **Inga** | `expo-audio`, `expo-file-system`, `expo-haptics`, Reanimated och SVG finns redan. Endast en iOS-behörighetstext behöver byggas in. |
| Transkribering | **Nej, inte i v1** | Böner är privata. Vi skickar dem inte till någon tredje part. Textfältet finns kvar för den som vill skriva. |
| E2EE | **Nej, inte i v1** | KOINO använder i dag regelbaserad åtkomst, inte klientkryptering. Ljudet följer samma modell. Vi säger det rakt ut i copy och integritetspolicy. |

### Storlek och kvalitet

| Inställning | Per minut | 1 min | 3 min | 5 min |
|---|---:|---:|---:|---:|
| AAC-LC 128 kbit/s stereo (appens nuvarande HQ-preset) | 960 kB | 960 kB | 2,9 MB | 4,8 MB |
| AAC-LC 64 kbit/s mono | 480 kB | 480 kB | 1,4 MB | 2,4 MB |
| **AAC-LC 32 kbit/s mono 24 kHz (vald)** | **240 kB** | **240 kB** | **720 kB** | **1,2 MB** |
| Opus 20 kbit/s mono | 150 kB | 150 kB | 450 kB | 750 kB |
| AMR-NB 12,2 kbit/s | 91 kB | 91 kB | 274 kB | 457 kB |

32 kbit/s är **4× mindre** än appens nuvarande inspelningspreset och fortfarande tydligt tal. En bön på en minut blir ungefär lika stor som ett foto i låg upplösning.

---

## 2. Varför just dessa val

### 2.1 Varför AAC-LC och inte Opus?

Opus är det modernaste talformatet och skulle spara cirka 30 % vid samma kvalitet. Problemet är uppspelningen:

- Android/ExoPlayer spelar Opus i WebM/Ogg.
- iOS/AVPlayer spelar Opus i CAF, men inte WebM/Ogg.
- `expo-audio` kan spela det plattformen klarar, men vi måste kunna spela **samma fil** på båda plattformarna.
- Att transcoda till Opus kräver antingen en native encoder (nytt native-beroende och ny build) eller server-side omkodning, vilket också kräver att ljudet lämnar telefonen i klartext.

AAC-LC i `.m4a` är det moderna standardformatet för tal, stöds av båda plattformarna, och 32 kbit/s mono är redan hård komprimering. Vi väljer den robusta vägen nu och lämnar Opus som en framtida optimering om lagringsvolymen blir ett problem.

### 2.2 Varför inte base64 i Realtime Database?

Bilderna i KOINO lagras i dag som data-URL:er i posten (max 1,5 MB). Det fungerar för en liten avatar men inte för ljud:

- Varje `journalEntries`- eller `posts`-läsning skulle dra ner hela ljudet igen.
- En enda 5-minutersanteckning blir 1,6 MB base64 i databasen.
- Realtime Database är inte byggd för stora binärfiler; det ger långsammare synk och högre kostnad.

Därför: **metadata i databasen, själva filen i Storage**. Posten innehåller bara cirka 250 byte: sökväg, längd, storlek och vågform.

### 2.3 Varför Firebase Storage och signerade URL:er?

- `storageBucket` finns redan i `state/store/firebase-production.json` (`koino-codex.firebasestorage.app`).
- Cloud Functions har redan Admin SDK och kan skapa V4-signerade URL:er.
- Bucketen kan vara helt privat: ingen klient läser eller skriver direkt. Cloud Function kontrollerar medlemskap och utfärdar en kortlivad URL.
- Uppladdning sker direkt till Storage med en signerad PUT-URL. Ljudet passerar aldrig Functions, vilket ger låg latens och låg kostnad.

Supabase används i den gamla bildkoden, men den vägen är inte aktiv i den plaintext-modell som KOINO kör nu. Firebase Storage är det som redan är konfigurerat och det som Functions kan hantera utan ny infrastruktur.

### 2.4 Varför tidsgränserna?

- **3 minuter** räcker för en vanlig bön, en bibelreflektion eller ett tack.
- **1 minut** för en röstbön till någon annan håller den personlig och gör att den faktiskt lyssnas på.
- **5 minuter** för dagboken ger plats för en längre tanke utan att bli en podd.
- Hård gräns i inspelaren (`record({ forDuration })`) + mjuk varning 30 och 10 sekunder innan. Ingen bön klipps av utan att användaren vet om det.

---

## 3. Upplevelsen

### 3.1 Var knappen finns

| Yta | Ingång | Etikett | Max |
|---|---|---|---|
| Me → dagboken | Mikrofonknapp i skrivaren, ovanför textfältet | ”Spela in dagbok” | 5:00 |
| Me → dagboken, tomt läge | Sekundär knapp bredvid ”Reflektera i dag” | ”Spela in” | 5:00 |
| Gemenskap → skriv | Mikrofonknapp i skrivaren | ”Spela in bön” | 3:00 |
| Böneförfrågan → detalj | Spelare under rubriken om förfrågan har ljud | ”Lyssna på bönen” | — |
| Efter att ha bett för någon | I slutsteget: primär knapp | ”Skicka en röstbön” | 1:00 |
| Böneförfrågan → uppmuntran | Mikrofon i uppmuntranskrivaren | ”Spela in röstbön” | 1:00 |
| Flödet / detaljvyn | Ljudkort under texten | ”Röstbön · 1:24” | — |

### 3.2 Inspelningsrummet

Det ska kännas som en stilla plats, inte som en röstmemo-app.

- Helskärm med varm cream-bakgrund och en mjuk, långsam glöd bakom mikrofonen.
- Stor rund mikrofonknapp (96 px) med en tunn ring. Ringen blir en tidslinje när inspelningen börjar.
- Ingen röd blinkande prick. I stället en liten lugn punkt och texten ”Spelar in”.
- Vågformen är hjälten: 48 speglade staplar som rör sig med rösten.
- Timern står diskret under vågformen: `0:42` stort, `3:00` dämpat.
- Knappar: **Avbryt** (vänster), **Pausa/Fortsätt** (mitten), **Stopp** (höger). Efter stopp: **Gör om**, **Lyssna**, **Använd**.
- Skärmen hålls tänd under inspelningen (`expo-keep-awake`) så att en bön på två minuter inte dör när skärmen somnar. Om appen ändå går till bakgrunden stoppas inspelningen och det inspelade sparas — vi spelar aldrig in i bakgrunden.
- Haptik: lätt vid start, medium vid stopp, selection vid 30 och 10 sekunder kvar.
- Första gången: en kort förklaring innan systemdialogen: ”KOINO använder mikrofonen bara när du spelar in. Din röst stannar hos dig tills du väljer att dela den.”

### 3.3 Den levande vågformen

Kravet är att vågen **ska motsvara hur högt du talar**, i realtid. Den ska inte vara en slumpad animation.

- `expo-audio` ger `metering` i dBFS när `isMeteringEnabled: true`.
- Vi pollar `useAudioRecorderState(recorder, 60)` i en **isolerad** komponent, så att skrivaren inte renderas om 16 gånger i sekunden.
- dB mappas till 0–1 med ett golv på −55 dB och en lätt perceptuell kurva (`pow(0.7)`).
- Snabb attack (0,55) och långsam release (0,14) gör att staplarna reser sig direkt och sjunker mjukt.
- 48 staplar, 3 px breda, 2 px mellanrum, min 4 px och max 56 px höga, speglade runt en mittlinje.
- En fast taper-kurva gör att kanterna blir lägre, så det ser ut som en våg och inte som en vägg.
- Varje stapel animeras med `withTiming(..., 120 ms)` på UI-tråden via Reanimated. Ingen JS-animation per frame.
- Om en enhet inte rapporterar `metering`: visa timer + en enkel pulserande punkt, och spara en neutral vågform. Vi hittar aldrig på ljudnivåer.
- Vid `reduce motion`: statiska staplar som bara fylls i takt med tiden, ingen andning eller glöd.

### 3.4 Granska och spara

Efter stopp:

- Vågformen fryses och spelas upp från den lokala filen. Ingen uppladdning behövs för att lyssna.
- Spelaren har play/pause, tid och en tydlig **Gör om**.
- Etiketten visar målgruppen: ”Privat” eller ”Delas i [gemenskap]”. För en böneförfrågan: ”Dela med [gemenskap]”.
- När man trycker **Använd** börjar uppladdningen direkt, med en tunn progress-rad. Skrivarens spar-knapp är låst tills uppladdningen är klar.
- Om uppladdningen misslyckas ligger filen kvar lokalt och kortet visar **Försök igen**. Ingenting publiceras halvfärdigt.
- Om användaren stänger skrivaren med en ouppladdad inspelning: en bekräftelse, och inspelningen sparas som utkast på telefonen.

### 3.5 Uppspelning

**I flödet** (kort):

- En rad med play-knapp, 48 staplar, längd och etikett.
- Staplarna kommer från inspelningens peakar, inte från en påhittad kurva.
- Spelad del fylls i ember/coral, ospelad del ligger i `colors.line`.
- Ett tryck laddar signerad URL (första gången), sedan spelas det. Klippet cachas lokalt så nästa tryck är omedelbart.
- Bara en spelare är aktiv i taget. Trycker man på ett annat klipp stoppas det första.

**Utökad spelare** (tryck på kortet):

- Större vågform, author, ”Röstbön”, tid.
- Dra i vågformen för att spola; tick var 10 %.
- 1× / 1,5× / 2× för dagbok och längre klipp.
- Stäng när man lämnar vyn; inget ljud fortsätter i bakgrunden i v1.

### 3.6 Den viktigaste flödesvägen: be för någon, sedan skicka rösten

Det här är funktionen som gör att ”audio prayers can be sent and listened to” blir sant i produkten.

1. Alex trycker **Be** på en böneförfrågan.
2. Böneögonblicket avslutas och slutsteget visas: ”Tack, Alex” + **Skicka en röstbön**.
3. Inspelningsrummet öppnas med max 1:00 och texten: ”Din röst går till [namn] och gemenskapen.”
4. Alex spelar in, lyssnar, trycker **Skicka**.
5. Röstbönen sparas som ett `Reply` med `audio` på böneförfrågan. Den syns i tråden och i mottagarens notiser.
6. Mottagaren får en push: **”Ny röstbön från Alex”** och kan lyssna direkt i förfrågan. Svaret kan vara text eller en egen röstbön.

Det återanvänder den befintliga uppmuntranskanalen, så inga nya synlighetsregler eller nya notistyper behövs. En röstbön är helt enkelt en uppmuntran som råkar vara ljud.

### 3.7 Röstdagboken

- Privat som standard. Ingen annan kan lyssna.
- Kan sparas med text, bibelvers och stämning precis som en vanlig dagbokspost.
- Kan delas till en gemenskap genom den befintliga ”dela”-vägen. Då kopieras ljudet till gemenskapens lagring så att det inte försvinner om dagboksposten raderas.
- I historiken visas en liten mikrofon och längd i stället för en textförhandsvisning när posten är ljud-only.

### 3.8 Copy (svenska och engelska)

Nya nycklar i `ui/translations/sv.ts` och `en.ts`:

- `audio.record.title.prayer`: ”Spela in bön”
- `audio.record.title.journal`: ”Spela in dagbok”
- `audio.record.title.reply`: ”Spela in röstbön”
- `audio.record.privateHint`: ”Din röst stannar hos dig tills du väljer att dela den.”
- `audio.record.sharedHint`: ”Alla i {community} kan lyssna.”
- `audio.record.limit.prayer`: ”Böner kan vara upp till 3 minuter.”
- `audio.record.limit.journal`: ”Dagboksinspelningar kan vara upp till 5 minuter.”
- `audio.record.limit.reply`: ”Röstböner kan vara upp till 1 minut.”
- `audio.record.pause`: ”Pausa”, `audio.record.resume`: ”Fortsätt”
- `audio.record.stop`: ”Stopp”, `audio.record.review`: ”Lyssna”, `audio.record.redo`: ”Gör om”
- `audio.record.use`: ”Använd”
- `audio.player.play`: ”Spela upp”, `audio.player.pause`: ”Pausa”
- `audio.player.voicePrayer`: ”Röstbön”, `audio.player.voiceJournal`: ”Röstdagbok”
- `audio.error.permission`: ”KOINO behöver mikrofonåtkomst. Du kan slå på den i Inställningar.”
- `audio.error.tooShort`: ”Inspelningen är för kort. Försök igen.”
- `audio.error.upload`: ”Inspelningen kunde inte laddas upp. Den finns kvar på telefonen — försök igen.”
- `audio.error.playback`: ”Ljudet kunde inte spelas upp. Försök igen.”
- `audio.error.offline`: ”Anslut till internet för att skicka inspelningen.”
- `audio.notification.voicePrayer`: ”Ny röstbön från {name}”

### 3.9 Tomma lägen och fel

| Situation | Vad användaren ser |
|---|---|
| Mikrofon nekad första gången | Förklarande kort + **Öppna Inställningar** |
| Mikrofon upptagen av annan app | ”Mikrofonen används av en annan app. Stäng den och försök igen.” |
| För kort (<1 s) | ”Inspelningen är för kort. Försök igen.” |
| Tidsgräns nådd | Inspelningen stoppas automatiskt: ”Du har nått tidsgränsen på 3 minuter.” |
| Inget nät vid uppladdning | Filen ligger kvar; **Försök igen**; ingen post skapas |
| Uppspelning misslyckas | ”Ljudet kunde inte spelas upp. Försök igen.” |
| Klippet är borttaget | ”Det här ljudet är borttaget.” |
| Gruppen är full / medlemskap saknas | Samma fel som i dag för inlägget; ljudet laddas aldrig upp |

---

## 4. Teknisk design

### 4.1 Översikt

```
┌──────────────────────────┐
│ Recorder sheet           │  expo-audio, metering, timer
│  live waveform (48 bars) │  Reanimated, UI thread
└────────────┬─────────────┘
             │ local .m4a
┌────────────▼─────────────┐
│ AudioClip (metadata)     │  path, durationMs, bytes, peaks
└────────────┬─────────────┘
             │ createUpload
┌────────────▼─────────────┐      ┌──────────────────────┐
│ Cloud Function koinoAudio│─────▶│ Firebase Storage     │
│ auth + membership + quota│      │ private bucket       │
└────────────┬─────────────┘      └──────────────────────┘
             │ signed PUT / GET
┌────────────▼─────────────┐
│ App                      │  uploadAsync / expo-audio player
└──────────────────────────┘
```

### 4.2 Inspelningsprofil

```ts
import { AudioQuality, IOSOutputFormat, type RecordingOptions } from "expo-audio";

export const speechRecordingOptions: RecordingOptions = {
  isMeteringEnabled: true,
  extension: ".m4a",
  sampleRate: 24_000,
  numberOfChannels: 1,
  bitRate: 32_000,
  android: {
    extension: ".m4a",
    outputFormat: "mpeg4",
    audioEncoder: "aac",
    sampleRate: 24_000,
    numberOfChannels: 1,
    bitRate: 32_000,
  },
  ios: {
    extension: ".m4a",
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.MEDIUM,
    sampleRate: 24_000,
    numberOfChannels: 1,
    bitRate: 32_000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: { mimeType: "audio/mp4", bitsPerSecond: 32_000 },
};
```

Fallback: om `prepareToRecordAsync()` kastar på en Android-enhet som inte accepterar 24 kHz, försök en gång med 44,1 kHz och samma bitrate. Filstorleken påverkas inte.

### 4.3 Från decibel till staplar

```ts
const DB_FLOOR = -55;

function levelFromMetering(db: number | undefined) {
  const value = db ?? DB_FLOOR;
  const normalized = Math.max(0, Math.min(1, (value - DB_FLOOR) / -DB_FLOOR));
  return Math.pow(normalized, 0.7);
}

function smooth(previous: number, next: number) {
  const factor = next > previous ? 0.55 : 0.14;
  return previous + (next - previous) * factor;
}

function taper(index: number, count: number) {
  return 0.55 + 0.45 * Math.sin((Math.PI * index) / (count - 1));
}
```

- 48 staplar, 60 ms mellan proverna.
- Senaste 48 nivåerna visas; när en ny nivå kommer flyttas fönstret ett steg.
- `height = 4 + smoothed * 52 * taper(i, 48)`.
- Spegling kring mitten: samma höjd uppåt och nedåt, med 2 px rundade ändar.

### 4.4 Vågform i databasen

När inspelningen stoppas beräknas 48 peakar från hela nivåserien:

```ts
function peaksFromLevels(levels: number[], buckets = 48): string {
  const size = Math.max(1, Math.ceil(levels.length / buckets));
  return Array.from({ length: buckets }, (_, index) => {
    const slice = levels.slice(index * size, (index + 1) * size);
    const peak = slice.length ? Math.max(...slice) : 0;
    return Math.round(peak * 255).toString(16).padStart(2, "0");
  }).join("");
}
```

- 48 byte = 96 hextecken per klipp. Försumbart i Realtime Database.
- Vid uppspelning dekodas strängen till 48 höjder.
- Saknas peakar (äldre klipp, metering saknades): visa en enkel progresslinje i stället för en falsk våg.

### 4.5 Uppspelning

En gemensam `AudioPlaybackProvider` högst upp i appen:

```ts
type PlaybackState = {
  clipId?: string;
  status: "idle" | "loading" | "playing" | "paused" | "error";
  position: number;
  duration: number;
};
```

- En `useAudioPlayer()`-instans. Alla kort läser samma state.
- `play(clip)`:
  1. Om filen finns i cachen: använd `file://`-URI direkt.
  2. Annars: hämta signerad URL via `koinoAudio.createDownload`.
  3. `player.replace({ uri })`, `player.play()`.
  4. När uppspelningen börjar: ladda ner till `cacheDirectory/audio/{clipId}.m4a` i bakgrunden för nästa gång.
- `player.seekTo(seconds)` vid drag i vågformen.
- `player.setPlaybackRate(rate, "high")` för 1×/1,5×/2×.
- Statusuppdateringar kommer glesare än 60 fps; spelnålen interpoleras med Reanimated mellan uppdateringarna och korrigeras vid varje event.
- Vid `AppState` → `background`: pausa.
- Vid telefonsamtal/annat ljudfokus: expo-audio hanterar avbrottet; vi pausar och visar play igen.
- När Bible audio startar: stoppa röstspelaren. När röstspelaren startar: pausa Bible audio. En liten `audio-focus.ts`-modul äger den regeln.

### 4.6 Uppladdning och nedladdning

**Sekvens vid uppladdning:**

1. Klienten har en lokal fil och genererar `clipId = clip_<timestamp>_<random>`.
2. Anropar `koinoAudio({ operation: "createUpload", scope, groupId?, clipId, bytes })`.
3. Funktionen kontrollerar:
   - inloggad användare,
   - medlemskap om `scope === "group"`,
   - `bytes <= 1_572_864`,
   - dagskvot (30 klipp och 60 MB per användare och dag).
4. Funktionen returnerar en V4-signerad PUT-URL med:
   - `Content-Type: audio/mp4`,
   - `x-goog-content-length-range: 0,1572864` (signerat, så Storage nekar för stora filer),
   - 10 minuters giltighet.
5. Klienten laddar upp med `FileSystem.uploadAsync(..., { httpMethod: "PUT", uploadType: BINARY_CONTENT })`.
6. Klienten anropar `koinoAudio({ operation: "finalizeUpload", path })`. Funktionen HEAD:ar objektet och kontrollerar storlek och content type.
7. Först därefter skrivs `Post` / `JournalEntry` / `Reply` med `audio`-metadatan.

**Nedladdning:**

- `koinoAudio({ operation: "createDownload", path })`.
- Funktionen parsar sökvägen:
  - `audio/users/{uid}/...` → endast `uid` själv.
  - `audio/groups/{groupId}/...` → `requireGroup(groupId, uid)`.
- Returnerar en V4-signerad GET-URL, 15 minuter.
- Klienten cachar URL:en i minnet till `expiresAt − 60 s` och filen lokalt.

**Borttagning:**

- `koinoAudio({ operation: "delete", path })` efter att databasposten tagits bort. Ägaren, eller en ledare för gruppen, får radera.
- Om Storage-raderingen misslyckas ska det aldrig rulla tillbaka databasraderingen. Objektet städas av nästa städjobb.

**Kopiering vid delning:**

- `koinoAudio({ operation: "copyForShare", sourcePath, groupId, clipId })`.
- Funktionen verifierar att källan är användarens egen och att användaren är medlem i gruppen.
- Servern kopierar objektet (ingen ned- och uppladdning via telefonen) och returnerar den nya sökvägen.

### 4.7 Cloud Function-kontrakt

```ts
type KoinoAudioRequest =
  | { operation: "createUpload"; scope: "user" | "group"; groupId?: string; clipId: string; bytes: number }
  | { operation: "finalizeUpload"; path: string }
  | { operation: "createDownload"; path: string }
  | { operation: "delete"; path: string }
  | { operation: "copyForShare"; sourcePath: string; groupId: string; clipId: string };
```

- Callable, region `europe-west1`, `context.auth` krävs.
- Alla sökvägar valideras med regex innan de används:
  `^audio/(users|groups)/[A-Za-z0-9_-]+/clip_[a-z0-9]+\.m4a$`.
- `clipId` genereras av klienten men måste matcha `^clip_[a-z0-9]{6,40}$`.
- Fel mappas till `permission-denied`, `invalid-argument`, `resource-exhausted` och `unavailable` med korta, användbara meddelanden.
- Inga ljuddata skickas genom funktionen; bara metadata och signerade URL:er.

### 4.8 Lagringsstruktur

```
audio/
  users/{uid}/clip_<id>.m4a          privat dagbok, privata röstböner
  groups/{groupId}/clip_<id>.m4a     delade inlägg, böneförfrågningar, röstsvar
```

Bucketen:

- Privat, uniform bucket-level access.
- Ingen publik läsning.
- Object versioning av.
- Content type `audio/mp4`.
- Max objektstorlek 1,5 MiB (signerad header + kontroll i `finalizeUpload`).

### 4.9 Datamodell

```ts
export type AudioClip = {
  id: string;                 // clip_...
  path: string;               // audio/users/... eller audio/groups/...
  durationMs: number;         // 1000..300000
  bytes: number;              // <= 1572864
  mime: "audio/mp4";
  peaks: string;              // 96 hextecken = 48 peakar
  createdAt: string;          // ISO
};
```

Läggs till på:

```ts
type JournalEntry = { ...; audio?: AudioClip };
type Post = { ...; audio?: AudioClip };
type Reply = { ...; audio?: AudioClip };
```

Ett klipp per post i v1. Flera klipp är en framtida utökning och kräver ingen migrering (`audio` kan bli en lista senare).

### 4.10 Ändringar i store och validering

Nuvarande kod kräver text på flera ställen. Det måste lossas upp:

- `state/store/helpers.ts` → `validPostContent(kind, body, verses, audio?)`:
  ```ts
  if (audio) return true;
  return kind === "scripture" ? verses.length > 0 : Boolean(body.trim());
  ```
- `state/koino-store.tsx`:
  - `createPost`: tillåt tom body om `audio` finns.
  - `createJournalEntry`: ta bort `!action.body.trim()`-spärren när `audio` finns.
  - `createReply`: tillåt tom body om `audio` finns.
  - `updateJournalEntry`: rör inte `audio` när fältet inte skickas med; rensa aldrig ljud av misstag.
  - `deletePost`, `deleteJournalEntry`, `deleteReply`: radera tillhörande objekt efter lyckad databasradering.
  - `createJournalEntry` med `shareWithGroup`: kopiera ljudet till gruppens sökväg och sätt den kopian på posten.
- `state/store/types.ts`: lägg `audio?: AudioClip` i payloadsen för `createPost`, `createJournalEntry`, `createReply` och `updateJournalEntry`.

### 4.11 Databasregler

- `audio` ligger som ett barn till `posts`, `journalEntries` och `replies`. Reglerna har redan `$field`-validators som accepterar nested objekt, så inget måste ändras för att få det att fungera.
- För defense in depth kan vi lägga en explicit validator på `audio` (stränglängd, numeriska gränser, sökvägsprefix). Det är inte ett lanseringskrav, eftersom servern ändå kontrollerar allt vid URL-utfärdandet.
- Ny nod `audioTickets/{uid}/{dayKey}`: `.read: false`, `.write: false` (endast Admin SDK).
- Inga publika Storage-regler; klienten får aldrig direktåtkomst till bucketen.

### 4.12 Radering och retention

| Händelse | Vad som händer med ljudet |
|---|---|
| Användaren tar bort sin post/dagbok/svar | Databasposten tas bort först, därefter objektet (best effort) |
| Ledare modererar bort ett inlägg | Samma som ovan, via den befintliga moderationsvägen |
| Gemenskapen tas bort | Prefix-radering av `audio/groups/{groupId}/` |
| Kontot tas bort | Prefix-radering av `audio/users/{uid}/` + insamlade gruppklipp som användaren äger |
| Uppladdning avbröts | Lokal fil städas vid avbruten inspelning; eventuellt orphan-objekt städas av underhållsjobb |
| Backup | Storage-objektet kan finnas kvar i säkerhetskopior upp till 30 dagar; det står i policyn |

Ett enkelt underhållsjobb (en gång i månaden) listar `audio/` och flaggar objekt äldre än 24 timmar som inte refereras av någon post. Det är inte ett lanseringskrav; kostnaden för ett orphan-objekt är försumbar.

### 4.13 Kvoter och missbruk

- Max **1,5 MiB** per objekt, signerat i URL:en.
- Max **30 uppladdningar per användare och dag**.
- Max **60 MB per användare och dag**.
- Endast `audio/mp4`.
- Ingen publik URL; signerade URL:er går ut efter 15 minuter.
- En användare kan inte ladda upp till en annan användares eller grupps sökväg: funktionen kontrollerar ägarskap/medlemskap före signering.
- Rate limit: `audioTickets` transaktion i Functions, inte i klienten.

### 4.14 Ljudfokus och avbrott

- Före inspelning: `setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })`.
- Efter stopp: `setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true })` så att uppspelning går till högtalaren och inte öronsnäckan på iOS.
- Pausa Bible audio/TrackPlayer när inspelningen börjar. Återuppta inte automatiskt; användaren får trycka play igen.
- Vid inkommande samtal eller annan app som tar mikrofonen: stoppa inspelningen, behåll det som spelats in, visa ”Inspelningen avbröts — vill du spara det du spelade in?”
- Vid skärmlås: `expo-keep-awake` håller skärmen tänd under inspelningen. Om appen ändå backgroundas: stoppa och behåll.
- Ingen bakgrundsinspelning i v1. Det kräver foreground service på Android och en tydligare integritetsmodell.

### 4.15 Offline och retry

- Inspelning fungerar helt offline.
- Uppladdning kräver nät. Vid fel:
  - filen ligger kvar i appens cache,
  - kortet visar **Försök igen**,
  - inget inlägg skapas förrän uppladdningen lyckats.
- Om användaren stänger skrivaren: spara ett lokalt utkast och visa det i dagboken/skrivaren nästa gång. Ingen tyst förlust.
- Uppladdningsretry: 3 försök med 1 s, 4 s och 10 s backoff. Vid ny URL varje försök (signerade URL:er är kortlivade).
- Uppspelning av redan cachat klipp fungerar offline. Annars visas offline-felet.

### 4.16 Tillgänglighet

- Inspelningsknappen: `accessibilityRole="button"`, label ”Spela in bön”, hint om tidsgränsen.
- Vågformen är dekorativ: `accessible={false}` och `importantForAccessibility="no-hide-descendants"`. Timern är den tillgängliga informationen.
- Spelaren: `accessibilityRole="adjustable"` med `accessibilityValue={{ text: "0:23 av 1:04" }}` och increment/decrement ±10 sekunder.
- Live-region när inspelningen börjar/stoppas: ”Spelar in”, ”Inspelningen stoppad”.
- Alla ikonknappar har minst 44 × 44 px träffyta.
- `reduce motion`: inga pulserande element, ingen glödanimation, statisk vågform.
- VoiceOver/TalkBack: testa att hela flödet går att genomföra utan att se skärmen.
- Dynamisk text: timern och knapparna får inte klippas vid 200 % textstorlek.

### 4.17 Prestandabudget

| Mätning | Mål |
|---|---|
| Tid från tryck till att inspelningen börjar | < 250 ms (efter behörighet) |
| Bildfrekvens under inspelning | 60 fps på Pixel 6-klass; minst 30 fps på låg mellanklass |
| Första uppspelning, 1 min-klipp på 4G | < 800 ms till ljud |
| Uppspelning från cache | < 100 ms |
| Uppladdning, 1 min-klipp på 4G | < 2 s p95 |
| Minnesanvändning under 5 min-inspelning | < 20 MB extra |
| Metadata per klipp i RTDB | < 300 byte |

---

## 5. Säkerhet, integritet och App Store

### 5.1 Vad vi lovar — och inte lovar

- Ljudet är **inte** end-to-end-krypterat. Det ligger i en privat bucket och nås bara via kortlivade signerade URL:er efter serverkontroll.
- Det är krypterat under överföring (HTTPS) och i vila hos Google Cloud.
- Ingen människa på KOINO lyssnar på bönerna.
- Ingen AI-transkribering, ingen tredjeparts-STT, ingen annonsprofilering.
- Signerade URL:er kan i teorin delas vidare under sina 15 minuter. Det är samma modell som appens övriga innehåll; vi säger det i policyn.

### 5.2 App Store och Google Play

- **iOS:** `NSMicrophoneUsageDescription` måste finnas i Info.plist. `app.config.js` sätter i dag `microphonePermission: false` i expo-audio-pluginen. Ändra till en tydlig svensk mening:
  > ”KOINO använder mikrofonen bara för att spela in de böner och dagboksanteckningar du väljer att spara.”
- **Android:** `android.permission.RECORD_AUDIO` finns redan i `app.config.js`. Ingen ny behörighet krävs.
- **App Store privacy:** Audio Data — collected, linked to the user, not used for tracking, user content.
- **Google Play Data safety:** Voice or sound recordings — collected, encrypted in transit, deletable.
- **UGC:** appen har redan gemenskaper med moderering. Ljud är användargenererat och ska omfattas av samma rapporterings-/borttagningsväg. Om appen saknar en synlig ”Anmäl”-funktion i dag bör den läggas till i samband med ljudlanseringen, eftersom App Review granskar ljud-UGC hårdare.
- **Åldersgräns:** oförändrad, men ljud gör att review kan fråga om moderering. Ha ett svar klart: ”samma regler som text och bild; ledare kan ta bort; användare kan anmäla.”

### 5.3 Kostnad

Vid 10 000 ettminutersklipp:

- Lagring: 2,4 GB × $0,026/GB ≈ **$0,06/månad**.
- Utdata: 10 000 uppspelningar × 240 kB ≈ 2,4 GB × $0,12/GB ≈ **$0,29**.
- Functions: försumbart (bara URL-signering).

Ljud är alltså inte en kostnadsfråga i den här skalan. Det är därför vi kan välja 32 kbit/s för kvalitet i stället för att jaga de sista kilobyten.

---

## 6. Fil-för-fil

### Nya filer

| Fil | Innehåll |
|---|---|
| `features/audio/recorder-sheet.tsx` | Helskärmsinspelaren, state machine, review |
| `features/audio/live-waveform.tsx` | 48 staplar, metering, Reanimated |
| `features/audio/playback-waveform.tsx` | Statisk vågform, progress, seek |
| `features/audio/audio-card.tsx` | Kort i flöde/detalj med play + vågform |
| `features/audio/audio-player-provider.tsx` | En gemensam spelare, cache, fokus |
| `features/audio/voice-note-field.tsx` | Fältet i skrivaren: spela in/byt/ta bort |
| `state/audio.ts` | Typer, gränser, peaks, dB-mappning, path helpers |
| `state/audio-storage.ts` | Callable-klient, signed URL, upload/download, cache |
| `functions/src/audio.ts` | `koinoAudio`-callable, kvoter, signerade URL:er |
| `functions/src/audio.test.ts` | Enhetstester för path, gränser, kvoter |
| `scripts/validate-audio.mjs` | Rena funktioner: dB, peaks, duration, path |
| `docs/audio-prayers-plan.md` | Det här dokumentet |

### Ändrade filer

| Fil | Ändring |
|---|---|
| `state/types.ts` | `AudioClip`; `audio?` på `Post`, `JournalEntry`, `Reply` |
| `state/store/types.ts` | `audio` i actions för post, journal, reply |
| `state/store/helpers.ts` | `validPostContent` tar hänsyn till ljud |
| `state/koino-store.tsx` | Spara/radera/kopiera ljud; tillåt tom text |
| `ui/shared-composer.tsx` | `VoiceNoteField`, audio-state, submit-regler |
| `features/journal-screen.tsx` | Inspelningsknapp, utkast, spara med ljud |
| `features/journal-detail-screen.tsx` | Spelare överst |
| `features/journal-entry-preview.tsx` | Mikrofon + längd i historiken |
| `ui/post-card.tsx` | `audio` som `bodyContent` |
| `features/feed-detail-screen.tsx` | Spelare i detaljvyn |
| `features/prayer-request-detail-screen.tsx` | Ljud på förfrågan + i uppmuntringar |
| `features/home-prayer-flow-screen.tsx` | ”Skicka en röstbön” i slutsteget |
| `ui/written-encouragement-composer.tsx` | Mikrofon, `onSend(body, replyId, audio?)` |
| `features/me-prayers.tsx` | Indikator för mottagen röstbön (om `replyId` finns) |
| `ui/translations/sv.ts`, `en.ts` | Nya nycklar |
| `app.config.js` | iOS-mikrofontext; `recordAudioAndroid: true` |
| `functions/src/index.ts` | Exportera `koinoAudio` |
| `functions/src/activity-notifications.ts` | Känna igen `reply.audio` |
| `functions/src/notification-messages.ts` | Push-copy för röstbön |
| `functions/src/encryption.ts` (deleteGroup) | Prefix-radering av gruppljud |
| `scripts/validate-account-deletion-*` | Ta med ljudobjekt i manifestet |

---

## 7. Testplan

### 7.1 Enhetstester

- dB-mappning: −55 → 0, 0 → 1, `undefined` → 0.
- Peaks: 48 buckets, max per bucket, 96 tecken, tom serie.
- Duration: 0:00, 0:59, 1:00, 3:00, 5:00.
- Path-validering: egna, andras, grupp, traversal, fel extension.
- Kvot: 30 klipp, 60 MB, daglig återställning.
- `validPostContent`: text, vers, ljud, tomt.

### 7.2 Komponenttester

- Vågformen renderar 48 staplar och ändrar höjd när metering ändras.
- `reduce motion` ger statiska staplar.
- Spelaren har korrekt accessibility-värde och ±10 s.
- Skrivaren är låst medan uppladdning pågår.
- För kort/ för långt ger rätt copy.

### 7.3 Manuell matris

| Område | Fall |
|---|---|
| Enheter | Pixel 11 Pro (Android 15), låg Android 11, iPhone 12, iPhone 15 |
| Behörighet | tillåten, nekad en gång, permanent nekad, återkallad i Inställningar |
| Ljud | högtalare, Bluetooth-headset, wired, tyst läge, fokusläge |
| Avbrott | inkommande samtal, annan app tar mic, skärmlås, bakgrund |
| Nät | 4G, 1 stapel, airplane mode, byte av nät mitt i uppladdning |
| Lagring | 0 byte ledigt, cache rensad av OS |
| Socialt | lämna grupp medan ljud spelas, URL går ut, borttagen post |
| Tillgänglighet | VoiceOver, TalkBack, 200 % text, reduce motion |
| Språk | svenska och engelska, alla nya strängar |
| Tema | ljust och mörkt |

### 7.4 Säkerhetstester

- Användare A försöker hämta `audio/users/B/...` → `permission-denied`.
- Användare A försöker ladda upp till `audio/groups/G/...` utan medlemskap → `permission-denied`.
- Manipulerad/utgången signerad URL → 403.
- För stor fil → 403 från Storage (signerad header).
- Fel content type → avvisas.
- Radering av konto tar bort användarens ljud (verifiera i Storage).

### 7.5 Acceptanskriterier

1. En bön på 2 minuter kan spelas in, lyssnas på, laddas upp och spelas upp på en annan enhet.
2. Vågformen rör sig med rösten och är inte en loop.
3. En röstbön på 1 minut kan skickas efter ett böneögonblick och mottagaren får en push.
4. En röstdagbok är privat och syns inte för någon annan.
5. Att ta bort ett inlägg tar bort ljudet inom några sekunder.
6. Hela flödet fungerar med VoiceOver/TalkBack.
7. Appen kraschar inte vid nekad mikrofon.
8. En inspelning går inte förlorad vid nätavbrott.

---

## 8. Ut rullning och tidsplan

### 8.1 Viktig begränsning just nu

EAS Free-planens byggkrediter är slut och återställs **1 december 2026**. Det påverkar planen:

- **Android** kan testas och shipas via **EAS Update** redan nu, eftersom `RECORD_AUDIO` och `expo-audio` redan finns i den installerade binären.
- **iOS** kräver en ny native build för `NSMicrophoneUsageDescription`. Den kan först göras efter 1 december.
- Play-binär versionCode 43 och TestFlight-build 5 planeras till 1–2 december.

### 8.2 Faser

| Fas | Vad | När | Vem |
|---|---|---|---|
| 0 | iOS-mikrofontext, Storage-bucket, `koinoAudio`-skal, feature flag | 27–30 nov | MausBot + Noah |
| 1 | Inspelare, live-vågform, review, lokal uppspelning | 27 nov–1 dec | Noah + Sana |
| 2 | Uppladdning/nedladdning, cache, radering | 1–3 dec | MausBot + Noah |
| 3 | Dagbok: skrivare, detalj, historik, delning | 2–5 dec | Noah |
| 4 | Böner: förfrågan, röstbön efter bön, notiser, Me-vy | 7–9 dec | Noah + MausBot |
| 5 | Tillgänglighet, copy, reduce motion, fel och offline | 10–11 dec | Sana + Noah |
| 6 | QA-matris, App Store/Play-metadata, staged rollout | 14–17 dec | Tess + Kai |
| 7 | 100 % | 17 dec | Kai |

**Total insats:** cirka 11 arbetsdagar engineering + 2 dagar design + 3 dagar QA. Kalendertid: cirka 3 veckor, varav den första veckan delvis väntar på byggkrediter.

### 8.3 Utrullning

1. Intern dev-skärm bakom flagga; endast Alex konto.
2. Android via EAS Update till interna testare; iOS via TestFlight efter 1 dec.
3. Play internal track + TestFlight externa testare.
4. 25 % av användarna (Android), sedan 100 %.
5. Kill switch: `appConfig/audio/enabled` i Realtime Database, läst vid start. Om den saknas är ljud av i produktion tills vi slår på den.

---

## 9. Risker och motåtgärder

| Risk | Sannolikhet | Påverkan | Åtgärd |
|---|---|---|---|
| iOS kraschar för att mikrofonskrivningen saknas | Hög om vi testar före build | Hög | Ändra `app.config.js` i fas 0; bygg 1 dec; testa inte iOS före dess |
| `expo-audio` metering fungerar olika på Android-tillverkare | Medel | Medel | Fallback till timer + neutral vågform; testa på minst tre enheter |
| Signerad PUT-URL avvisas på grund av header | Medel | Hög | Exakt header-test tidigt; `uploadAsync` och `fetch`-fallback; tydligt fel |
| Ljudet spelar i öronsnäckan på iOS efter inspelning | Medel | Låg | `allowsRecording: false` efter stopp; testa |
| Inspelning tappas när appen backgroundas | Medel | Hög | Stoppa och behåll; lokalt utkast; keep-awake |
| UGC-ljud får App Review att tveka | Medel | Hög | Rapporteringsväg, integritetstext, review notes, moderering |
| Konflikt med Bible audio | Medel | Medel | Gemensam audio-focus; pausa TrackPlayer före inspelning |
| Storage-missbruk | Låg | Medel | Signerad storleksgräns, dagskvot, private bucket |
| För stor fil på 5 min | Låg | Låg | 1,2 MB < 1,5 MB; verifiera med `finalizeUpload` |
| Användaren tror att ljudet är E2EE | Medel | Hög | Tydlig copy: ”privat och skyddat, inte end-to-end-krypterat” |

---

## 10. Vad vi medvetet inte gör i v1

- **Ingen bakgrundsinspelning.** Det kräver foreground service, mer batteri och en tydligare integritetsmodell.
- **Inga låsskärmskontroller för röstböner.** Korta klipp spelas i appen. Bible audio behåller sina.
- **Ingen transkribering.** Det skulle innebära att böner skickas till en tredje part eller ett nytt native-beroende. Textfältet finns kvar.
- **Ingen E2EE.** KOINO har redan valt regelbaserad åtkomst. Om E2EE blir aktuellt kan ljudet krypteras med libsodium före uppladdning utan att formatet ändras.
- **Ingen Opus.** Cross-platform-uppspelningen är inte värd risken i v1.
- **Inga flera ljudklipp per post.** En post = ett klipp. Datamodellen kan utökas senare.
- **Ingen automatisk tystnadsborttagning.** Vi klipper inte i användarens röst.

---

## 11. Beslut som är tagna (och kan ändras)

1. **3 minuter** för böneförfrågan, **1 minut** för röstbön som svar, **5 minuter** för dagbok.
2. Röstböner som svar följer samma målgrupp som skriftliga uppmuntringar: gemenskapen. Privat 1:1-röstbön är en framtida DM-funktion.
3. Första versionen har en gemensam spelare och ingen bakgrundsuppspelning.
4. Ljudet är privat som standard i dagboken; delning sker medvetet.
5. Ingen transkribering, ingen tredjeparts-AI, ingen E2EE i v1.

---

## 12. Nästa steg

Fas 0 kan börja direkt: iOS-mikrofontexten, Storage-bucketen och `koinoAudio`-funktionen. Noah kan bygga inspelaren och vågformen mot en lokal fil utan att vänta på Storage. Sana kan låsa inspelningsrummet, spelarkortet och copyn. Tess kan skriva testmatrisen parallellt.

Först när fas 1 är klar vet vi om metering och 24 kHz fungerar på Alex Pixel 11 Pro. Det är den enda tekniska osäkerheten som kan ändra resten av planen.
