- Theme selector, colors and font
- Food missing allergens. At the bottom of products, small font.
- Full menu with filter allergens function
- Slower color transition on screen, text most iportant
- Better transit icons, premade
- Custom message pane (like "Buy tickets now), 
- "Repeat for step x - y" button
- Text editor in a sub-menu
- Remove wraps-coffee naming
- REmove Copy link, make link itself clickable with a Copied to clipboard message
- "Main pane" with a box shadow, 2 max
- Each step can change pane amount. Need to slice borders in two
- Order pane for employees with touch for when order is done
- Add Users in the Sidebar. Admin can add/delete users, even sub-admin. Admin can also set password reset. Sub-admin can not delete Admin
- Remove product categories, when they can be used in full menu. Change name from full menu to just Menu
- Move Background to the top
- Global background not working
- "This step's own background image"
- "Edit global text size"
- Only one back button, not two
- "1. En "Webhook"-modul (Hvis du vil pushe data ut)
- QR code maker, black or white depending on bg color. Custom URL
- Things reload when using fade transition instead of just staying visible and changing color
- Lock screen as standard.  Hover on panes to edit with a highlight. 
- Vipps integrations
- When using back button on mouse, needs to function like the back button
- Rotate screen
- Ability to have event image in one pane, and event details, title etc in another. Can have multiple events on a screen. Have it like 1st event, 2nd event. If using 1st event image, assume 1st event details when selecting event details on the next event pane

Akkurat nå trekker du data ned fra nettsiden. Men hva hvis den eksisterende nettsiden vil ha beskjed på sin egen måte når eieren endrer status på en ordre i ditt dashbord?

    Løsning: Legg til en enkel Webhook-funksjon i admin-panelet der den eksterne nettsiden kan lime inn en URL (f.eks. https://min-nettside.no/api/order-update). Når ordrestatusen endres, sender din server en kjapp HTTP POST-forespørsel til den URL-en.

2. En ferdig WordPress-plugin eller JS-Widget (For ikke-tekniske kunder)

Hvis en kafé har en standard WordPress-side og ingen utvikler til å hjelpe seg, vil de slite med å bruke API-et ditt.

    Løsning: Du kan lage et lite, ferdig JavaScript-skript (en "widget") som de bare kan lime inn på nettsiden sin (litt som en Chat-boble eller Google Analytics-kode). Dette skriptet kan automatisk generere menyen eller kontaktskjemaet basert på data fra din server, helt uten at kunden må kode noe som helst."

