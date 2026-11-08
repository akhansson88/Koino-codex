# Design QA — ljudspelare mot nedersta menyn

final result: passed

Verifierat på Pixel 11 Pro den 8 november 2026. Den uppdaterade ARM64-versionen är installerad på telefonen.

## Källa och jämförelse

- Användarens markerade referens: C:\Users\alexh\Downloads\WhatsApp Image 2026-11-08 at 14.46.44.jpeg, 917 × 2048 pixlar.
- Före ändringen: design-qa/bible-player-gap-before.png.
- Efter, med följknapp: design-qa/bible-player-gap-with-follow.png.
- Efter, utan följknapp: design-qa/bible-player-gap-without-follow.png.
- Efter, med versverktyg: design-qa/bible-player-gap-verse-tools.png.
- Gemensam helbildsjämförelse: design-qa/bible-player-gap-comparison.png.
- Gemensam detaljjämförelse av nederdelen: design-qa/bible-player-gap-footer-comparison.png.

Implementationsbilderna är 1080 × 2410 pixlar, tagna på samma telefon som referensen. Skärmen har 420 dpi och skala 2,625, motsvarande cirka 411,4 × 918,1 dp. Jämförelserna normaliserar alla helbilder till cirka 459 × 1024 pixlar. Detaljbilderna visar samma nederdel i samma skala. CSS-viewport gäller inte för denna Android-app.

Tillstånd: stående läge, ljust tema, Psaltaren 36 i SRB26, pausad uppläsning vid vers 8 och 0:50/1:29. Med följknappen visas manuellt bläddrad text kring vers 11–13. Utan följknappen visas den följda versen 8. Läsinställningarna behölls.

## Fel och korrigering

- [P2, åtgärdat] Kapitelpilarnas höjd lades till spelarens bottenposition. Det skapade en glipa mot menyn vid manuell bläddring och lät pilarna delvis hamna under spelaren.
- Spelaren förankras nu direkt vid menyns överkant. Kapitelpilarna och versverktygen staplas ovanför den. Läsytans bottenutrymme och verktygens position följer spelarens uppmätta höjd.
- Efter installation jämfördes båda följlägena och versverktygen på den fysiska telefonen. Ingen glipa eller överlappning återstår i dessa lägen.

## Uppmätta gränser på telefonen

| Tillstånd | Spelarens underkant | Menyns överkant | Glipa |
| --- | --- | --- | --- |
| Följknapp synlig | y=2200 | y=2200 | 0 px |
| Följknapp dold | y=2200 | y=2200 | 0 px |
| Versverktyg synliga | y=2200 | y=2200 | 0 px |

Med följknappen synlig ligger kapitelpilarnas underkant vid y=1806 och spelarens överkant vid y=1848. Pilarna är fullt synliga ovanför spelaren. Övergången via följknappen kontrollerades också: spelarens höjd ändras uppåt medan underkanten ligger kvar.

## Visuella ytor

| Yta | Resultat |
| --- | --- |
| Typsnitt och typografi | Läsarens sparade typsnitt och storlek samt spelarens etiketter är bibehållna och läsbara. |
| Avstånd och layout | Glipan är borttagen i båda följlägena. Kapitelpilar och versverktyg ligger ovanför spelaren. |
| Färger och designtokens | Befintliga ytor, ramar och färger är bevarade. |
| Bilder och ikoner | Befintliga vektorikoner är skarpa och oförändrade. |
| Text och innehåll | Bibeltext, ljudposition, knapptexter och översättning är bevarade. |

## Verifiering

- TypeScript-kontroll: godkänd.
- Bible audio follow-valideringen: godkänd, inklusive nya regressioner för fast spelarposition vid manuell bläddring, ändrad spelarhöjd, versval och återgång till följning.
- ARM64 releasebygge och installation: godkända.
- Visuell kontroll på telefonen: med och utan följknapp samt med versverktyg.
- AndroidRuntime, ReactNativeJS och ReactNative: inga fel returnerades för appens process i loggkontrollen efter provningen.
- Telefonen lämnades i Psaltaren 36 med pausad uppläsning vid samma ljudposition. Tillfällig versmarkering rensades.

Ingen kvarstående P0/P1/P2-avvikelse i de provade lägena. Fysisk provning är begränsad till denna telefon i stående läge.

Tidigare fullständig granskning av alternativ 2 finns i design-qa/bible-option-2.md.
