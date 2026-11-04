# ORDRESAN – bibeläventyr

Ett fristående, responsivt spel på svenska, byggt kring den befintliga **Reformationsbibeln 2016** i Koino-codex.

## Funktioner

- 25 tematiska bibelstudier från skapelsen till Uppenbarelseboken. Varje etapp har läsavsnitt före frågorna.
- Åtta frågor per omgång: vershänvisning, saknat ord, vilken vers följer och ordna versdelar.
- Läs och sök i samtliga **66 böcker, 1 189 kapitel och 31 170 verser**, inklusive fotnoterna.
- Bokvisa quiz, dagens utmaning, minneskort, enkel utspridd repetition, XP, hjärtan, daglig följd och utmärkelser.
- Lokal lagring av framsteg i webbläsaren (localStorage); inga användarkonton behövs.

## Originaltext

Spelet läser [`assets/bible/reformationsbibeln.json`](../assets/bible/reformationsbibeln.json) och använder dess `text`- och `footnotes`-fält ordagrant. Orden i övningsvyer kan döljas eller ordnas om som spelmoment, men hela den oförändrade originalversen återges i facit. Frågor, navigering, poäng och etappbeskrivningar är separat speltext, inte påstådda bibelcitat.

JSON-filen valideras före användning mot översättningens namn och antal böcker, kapitel och verser. Vid inläsningsfel hittar spelet **inte** på bibelcitat, utan erbjuder manuell inläsning av originalfilen.

## Starta lokalt

Från repositoryts rot:

```bash
python -m http.server 8000
```

Öppna `http://localhost:8000/bible-game/` i valfri modern webbläsare. Den lokala bibelfilen används då direkt.

Om `index.html` öppnas som en fristående fil försöker spelet hämta original-JSON från Koino-codex på GitHub (internet krävs). Om hämtningen blockeras kan samma JSON väljas med filväljaren. Webbfonterna är valfria och har systemfonts-fallback.

Inga förändringar görs i Koinos befintliga Expo-skärmar. Kontrollera rättigheterna för distribution av Reformationsbibeln innan en publik lansering; bibeltexten kopieras inte in i spel-HTML:n.
