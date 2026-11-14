# App icons

Source SVGs for the installable apps (`/goldbill/`, `/certificate/`). Full-bleed
background, artwork inside the central 80% so Android's round/squircle mask
never clips it. Regenerate after editing:

    for a in goldbill certificate; do
      rsvg-convert -w 512 -h 512 scripts/app-icons/$a.svg -o public/$a/icon-512.png
      rsvg-convert -w 192 -h 192 scripts/app-icons/$a.svg -o public/$a/icon-192.png
      rsvg-convert -w 180 -h 180 scripts/app-icons/$a.svg -o public/$a/apple-touch-icon.png
    done
