- Theme selector, colors and font
- Full menu with filter allergens function
- Slower color transition on screen, text most iportant
- Better transit icons, premade
- Fetuered pane, where discounted items
- Remove wraps-coffee naming
- "Main pane" with a box shadow, 2 max
- Each step can change pane amount. Need to slice borders in two
- Order pane for employees with touch for when order is done
- Global background image not working
- "Edit global text size"
- "1. En "Webhook"-modul (Hvis du vil pushe data ut)
- Things reload when using fade transition instead of just staying visible and changing color
- Vipps integrations
- Rotate screen
- Take picture of menu, send to AI for transcribing, get back answer to paste in the correct format
- Notification that a screen is out of fullscreen in the overview. Also in the top left corner. Disappears when fullscreen again. To make sure customers are not messing with the screen, like using an ipad for menu.
- "Easy reader" mode for the same ipad menu
- Language button on ipad menu
- PDF/docx export of the menu
- Local AI for SCSS, edit prices
- Custom CSS for panes


1. 
- License tracker
- Backup, physical and cloud
- Search
- Routines
- Telix Amundo
- RSS
- Vipps



Akkurat nå trekker du data ned fra nettsiden. Men hva hvis den eksisterende nettsiden vil ha beskjed på sin egen måte når eieren endrer status på en ordre i ditt dashbord?

    Løsning: Legg til en enkel Webhook-funksjon i admin-panelet der den eksterne nettsiden kan lime inn en URL (f.eks. https://min-nettside.no/api/order-update). Når ordrestatusen endres, sender din server en kjapp HTTP POST-forespørsel til den URL-en.

2. En ferdig WordPress-plugin eller JS-Widget (For ikke-tekniske kunder)

Hvis en kafé har en standard WordPress-side og ingen utvikler til å hjelpe seg, vil de slite med å bruke API-et ditt.

    Løsning: Du kan lage et lite, ferdig JavaScript-skript (en "widget") som de bare kan lime inn på nettsiden sin (litt som en Chat-boble eller Google Analytics-kode). Dette skriptet kan automatisk generere menyen eller kontaktskjemaet basert på data fra din server, helt uten at kunden må kode noe som helst."

